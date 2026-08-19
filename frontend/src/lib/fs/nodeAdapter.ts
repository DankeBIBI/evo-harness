/**
 * Node 文件服务适配器(lib/fs/nodeAdapter)
 * - 前端通过 HTTP 调用本地 Node 文件服务(file-server.mjs),绕开浏览器 File System Access 授权
 * - 服务以本项目根为根,重启不丢、无需授权
 * - 检测:GET /api/health 可达即启用;不可达时上层回退浏览器 FS API
 */

import type { FileInfo } from './types';

/** Node 文件服务地址(与 file-server.mjs 端口一致) */
export const NODE_SERVER_URL = 'http://127.0.0.1:46112';

/** 模块级缓存:首次探测后固定,避免每次调用都发健康检查 */
let available: boolean | null = null;

/** 探测 Node 文件服务是否可用(800ms 超时) */
export async function isNodeServerAvailable(): Promise<boolean> {
  if (available !== null) return available;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${NODE_SERVER_URL}/api/health`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    available = res.ok;
  } catch {
    available = false;
  }
  return available;
}

/** 重置探测缓存(服务拉起/停止后可重新探测) */
export function resetNodeServerProbe(): void {
  available = null;
}

/** 统一请求封装:非 2xx 抛错(带服务端 error 文案) */
async function call<T>(pathname: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${NODE_SERVER_URL}${pathname}`, init);
  } catch {
    throw new Error('Node 文件服务不可达,请先运行 npm run file-server');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Node 文件服务错误(${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Node 文件服务操作集(与 file-ops.ts 同签名,参数为相对路径) */
export const nodeFs = {
  /** 列目录(单层) */
  list: (relPath = ''): Promise<FileInfo[]> =>
    call<{ items: FileInfo[] }>(`/api/list?path=${encodeURIComponent(relPath)}`).then(
      (r) => r.items,
    ),
  /** 读文件(UTF-8) */
  read: (relPath: string): Promise<string> =>
    call<{ content: string }>(`/api/read?path=${encodeURIComponent(relPath)}`).then(
      (r) => r.content,
    ),
  /** 按行分段读文件(返回 {content, startLine, endLine, totalLines}) */
  readRange: (
    relPath: string,
    startLine: number,
    endLine: number,
  ): Promise<{ content: string; startLine: number; endLine: number; totalLines: number }> =>
    call<{ content: string; startLine: number; endLine: number; totalLines: number }>(
      `/api/readRange?path=${encodeURIComponent(relPath)}&startLine=${startLine}&endLine=${endLine}`,
    ),
  /** 写文件(UTF-8,自动建目录) */
  write: (relPath: string, content: string): Promise<void> =>
    call('/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, path: relPath }),
    }).then(() => undefined),
  /** 删除文件 */
  del: (relPath: string): Promise<void> =>
    call('/api/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: relPath }),
    }).then(() => undefined),
  /** 按文件名搜索(递归,最多 10 层) */
  search: (keyword: string, max = 50): Promise<FileInfo[]> =>
    call<{ items: FileInfo[] }>(`/api/search?q=${encodeURIComponent(keyword)}&max=${max}`).then(
      (r) => r.items,
    ),
  /** 当前根目录名 */
  rootName: (): Promise<string> =>
    call<{ rootName: string }>('/api/health').then((r) => r.rootName),
  /**
   * 切换服务根目录(对应 file-server POST /api/root)
   * 服务端会校验目录存在性 + 持久化到 ~/.evo-harness/file-server-root.json,
   * 后续重启自动加载。失败时抛错(带服务端 error 文案)。
   */
  setRoot: (absRootPath: string): Promise<{ root: string; rootName: string }> =>
    call<{ ok: true; root: string; rootName: string }>('/api/root', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: absRootPath }),
    }).then((r) => ({ root: r.root, rootName: r.rootName })),
};
