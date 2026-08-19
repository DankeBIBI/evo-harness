/**
 * 来源目录自动扫描(TS 端,lib/fs/source-scanner)
 * - 恢复已授权 handle → 扫描 agents/skills → 挂载到 agentStore/skillStore
 * - 无授权 / 无读取权限 / 目录已删除时返回 0,由调用方引导用户去设置页授权
 */

import { pickDirectory } from './directory-handle';
import { analyzeProject } from './scanner';
import { loadSourceHandle, saveSourceHandle } from './source-handle-store';
import { useAnalysisStore } from '@/stores/analysisStore';

/** 来源类型(与 sourceStore.Source 中可扫描的文件源一致) */
export type ScanSource =
  | 'project'
  | 'user'
  | 'claude-project'
  | 'claude-user';

/** 可自动扫描的文件来源 */
export const SCAN_SOURCES: ScanSource[] = ['project', 'user', 'claude-project', 'claude-user'];

/** 授权目录并挂载到 store,返回新挂载数;用户取消返回 -1 */
export async function authorizeAndScanSource(
  source: ScanSource,
): Promise<number> {
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
  // .claude 目录本身即配置根;其他目录自动找 .claude 子目录
  let target = handle;
  if (handle.name !== '.claude') {
    try {
      target = await handle.getDirectoryHandle('.claude');
    } catch {
      // 无 .claude 子目录,直接扫当前目录
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
