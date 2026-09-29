/**
 * 来源目录自动扫描(TS 端,lib/fs/source-scanner)
 * - 恢复已授权 handle → 扫描 agents/skills → 挂载到 agentStore/skillStore
 * - 无授权 / 无读取权限 / 目录已删除时返回 0,由调用方引导用户去设置页授权
 */

import { pickDirectory } from './directory-handle';
import { analyzeProject } from './scanner';
import { loadSourceHandle, saveSourceHandle } from './source-handle-store';
import { isNodeServerAvailable } from './nodeAdapter';
import { analyzeProjectFromNode } from './node-source-scanner';
import { useAnalysisStore } from '@/stores/analysisStore';

/** 来源类型(与 sourceStore.Source 中可扫描的文件源一致) */
export type ScanSource =
  | 'project'
  | 'user'
  | 'claude-project'
  | 'claude-user';

/** 可自动扫描的文件来源 */
export const SCAN_SOURCES: ScanSource[] = ['project', 'user', 'claude-project', 'claude-user'];

/** 当前环境是否支持 showDirectoryPicker(用于决定是否走 Node 兜底) */
async function supportsNativeDirectoryPicker(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (typeof window.showDirectoryPicker !== 'function') return false;
  // VS Code SimpleBrowser / 部分 WebView 在 userAgent 中带 "Code/" 前缀，
  // 其 showDirectoryPicker 表面存在但实际不会弹原生对话框，必须走 Node 文件服务。
  const ua = navigator.userAgent || '';
  return !/Code\/[\d.]+/.test(ua);
}

/** 通过 Node 文件服务直接挂载项目根(无需任何用户授权) */
async function scanViaNodeService(source: ScanSource): Promise<number> {
  const result = await analyzeProjectFromNode(source);
  if (!result) return 0;
  if (result.agents.length === 0 && result.skills.length === 0) return 0;
  const analysisStore = useAnalysisStore.getState();
  analysisStore.setRootHandle(null);
  analysisStore.setAnalysis(result);
  // 重新取一次最新 store 引用,避免闭包陈旧
  await useAnalysisStore.getState().mountToAgentStore(source);
  await useAnalysisStore.getState().mountToSkillStore(source);
  // 挂载结束后再触发一次 fetch,确保 zustand persist 同步到最新 store
  const { fetchAgents, fetchSkills } = {
    fetchAgents: (await import('@/stores/agentStore')).useAgentStore.getState().fetchAgents,
    fetchSkills: (await import('@/stores/skillStore')).useSkillStore.getState().fetchSkills,
  };
  await Promise.all([fetchAgents(), fetchSkills()]);
  return result.agents.length + result.skills.length;
}

/** 授权目录并挂载到 store,返回新挂载数;用户取消返回 -1 */
export async function authorizeAndScanSource(
  source: ScanSource,
): Promise<number> {
  // 兜底:不支持原生目录选择器时直接走 Node 文件服务
  if (!(await supportsNativeDirectoryPicker()) && (await isNodeServerAvailable())) {
    return scanViaNodeService(source);
  }

  const handle = await pickDirectory();
  if (!handle) return -1;

  const saved = await saveSourceHandle(source, handle);
  if (!saved) console.warn(`[source-scan] ${source} 授权 handle 持久化失败,重启后需重新授权`);
  return scanHandle(source, handle);
}

/** 恢复已持久化的授权 handle 并自动扫描挂载,返回新挂载条目数 */
export async function scanAndMountSource(
  source: ScanSource,
): Promise<number> {
  // 不支持原生目录选择器时直接走 Node 文件服务
  if (!(await supportsNativeDirectoryPicker()) && (await isNodeServerAvailable())) {
    return scanViaNodeService(source);
  }
  const handle = await loadSourceHandle(source);
  if (!handle) return 0;

  try {
    return await scanHandle(source, handle);
  } catch (err) {
    // 无读取权限 / 目录已删除 → 跳过,下次授权后重试
    console.warn(`[source-scan] ${source} 扫描失败:`, err);
    return 0;
  }
}

/** 串行重扫所有已授权来源(避免共享 analysis 字段的挂载竞态) */
export async function rescanAllSources(): Promise<void> {
  for (const source of SCAN_SOURCES) {
    await scanAndMountSource(source);
  }
}

/** 扫描单个目录 handle 并挂载到对应来源 */
async function scanHandle(
  source: ScanSource,
  handle: FileSystemDirectoryHandle,
): Promise<number> {
  const analysisStore = useAnalysisStore.getState();
  // 普通来源扫描用户选中的根目录；Claude 来源允许选择 .claude 本身或其父目录。
  let target = handle;
  if (source.startsWith('claude-') && handle.name !== '.claude') {
    try {
      target = await handle.getDirectoryHandle('.claude');
    } catch {
      // 无 .claude 子目录时直接扫描所选目录，兼容用户已选中配置根的情况。
    }
  }

  const result = await analyzeProject(target);
  if (result.agents.length === 0 && result.skills.length === 0) return 0;

  analysisStore.setRootHandle(handle);
  analysisStore.setAnalysis(result);
  await analysisStore.mountToAgentStore(source);
  await analysisStore.mountToSkillStore(source);
  return result.agents.length + result.skills.length;
}
