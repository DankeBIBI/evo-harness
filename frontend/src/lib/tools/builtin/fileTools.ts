/**
 * Built-in file system tools.
 *
 * Shared by all protocol backends (openai / Anthropic / Google / Azure / Claude-Code).
 * 2026-07-04 P1-1 终态: 不再做 XML 包装归一化,模型走原生 function call;工具集跨协议共用。
 * Each tool invokes a host service from `@/lib/hostServices/FileService`.
 */

import { devLog } from '@/lib/devLog';

import type { Tool } from '../base';

async function getFileService() {
  return import('@/lib/hostServices/FileService');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const LOG = 'chat:fileTool';

/** 工具执行统一包装:dev 模式打开始/成功/失败日志,prod 透传 */
async function withLog<T>(name: string, params: unknown, fn: () => Promise<T>): Promise<T> {
  devLog.i(LOG, `${name} start`, { params });
  const start = Date.now();
  try {
    const result = await fn();
    devLog.i(LOG, `${name} done`, { durationMs: Date.now() - start, resultLen: typeof result === 'string' ? result.length : undefined });
    return result;
  } catch (error) {
    devLog.e(LOG, `${name} failed`, { durationMs: Date.now() - start, error: String(error) });
    throw error;
  }
}

export const fileTools: Tool[] = [
  {
    category: 'file',
    description:
      'Read file contents. For large files, prefer GrepFiles to locate matches, then ReadFileRange to read specific line ranges instead of reading the whole file.',
    execute: async (params) => {
      const path = params.path as string;
      return withLog('ReadFile', params, async () => {
        const { ReadFile } = await getFileService();
        if (!path) throw new Error('Missing path parameter');
        return await ReadFile(path);
      });
    },
    name: 'ReadFile',
    params: {
      properties: {
        path: { description: 'Path relative to the authorized project root (e.g. src/foo.ts). Do NOT use absolute paths.', type: 'string' },
      },
      required: ['path'],
      type: 'object',
    },
  },
  {
    category: 'file',
    description:
      'Read a line range of a file (e.g. lines 1-100). Returns content with line numbers and total line count. ' +
      'Use after GrepFiles to read the exact region around a match.',
    execute: async (params) => {
      const path = params.path as string;
      const startLine = (params.startLine as number) || 1;
      const endLine = (params.endLine as number) || 0;
      return withLog('ReadFileRange', { path, startLine, endLine }, async () => {
        const { ReadFileRange } = await getFileService();
        if (!path) throw new Error('Missing path parameter');
        const r = await ReadFileRange(path, startLine, endLine);
        if (r.startLine > r.totalLines) {
          return `${path}: 行号越界(文件共 ${r.totalLines} 行, 请求从第 ${startLine} 行开始)`;
        }
        const header = `${path}:${r.startLine}-${r.endLine} (共 ${r.totalLines} 行)`;
        const numbered = r.content
          .split('\n')
          .map((l, idx) => `${r.startLine + idx}: ${l}`)
          .join('\n');
        return `${header}\n${numbered}`;
      });
    },
    name: 'ReadFileRange',
    params: {
      properties: {
        endLine: { description: 'End line (inclusive). Omit to read 100 lines from startLine.', type: 'number' },
        path: { description: 'Path relative to the authorized project root (e.g. src/foo.ts). Do NOT use absolute paths.', type: 'string' },
        startLine: { description: 'Start line (1-based, default 1)', type: 'number' },
      },
      required: ['path'],
      type: 'object',
    },
  },
  {
    category: 'file',
    description: 'Write content to file (overwrites existing content)',
    mutating: true,
    execute: async (params) => {
      const { content, path } = params as { content: string; path: string };
      // 脱敏:不打印完整 content(可能含凭据/token),只报长度
      return withLog('WriteFile', { path, contentLen: content?.length }, async () => {
        const { WriteFile } = await getFileService();
        if (!path || content === undefined)
          throw new Error('Missing path or content parameter');
        await WriteFile(path, content);
        return `File written: ${path}`;
      });
    },
    name: 'WriteFile',
    params: {
      properties: {
        content: { description: 'Full file content to write', type: 'string' },
        path: { description: 'Path relative to the authorized project root (e.g. src/foo.ts). Do NOT use absolute paths.', type: 'string' },
      },
      required: ['path', 'content'],
      type: 'object',
    },
  },
  {
    category: 'file',
    description: 'Replace a unique text fragment in a file. oldText must match exactly once.',
    mutating: true,
    execute: async (params) => {
      const { newText, oldText, path } = params as { newText: string; oldText: string; path: string };
      return withLog('ReplaceInFile', { path, oldTextLen: oldText?.length, newTextLen: newText?.length }, async () => {
        const { ReplaceInFile } = await getFileService();
        if (!path || oldText === undefined || newText === undefined)
          throw new Error('Missing path, oldText, or newText parameter');
        await ReplaceInFile(path, oldText, newText);
        return `File replaced: ${path}`;
      });
    },
    name: 'ReplaceInFile',
    params: {
      properties: {
        newText: { description: 'Replacement text', type: 'string' },
        oldText: { description: 'Text to replace (must appear exactly once in file)', type: 'string' },
        path: { description: 'Path relative to the authorized project root (e.g. src/foo.ts). Do NOT use absolute paths.', type: 'string' },
      },
      required: ['path', 'oldText', 'newText'],
      type: 'object',
    },
  },
  {
    category: 'file',
    danger: true,
    description: 'Delete the specified file (cannot delete directories)',
    mutating: true,
    execute: async (params) => {
      const path = params.path as string;
      return withLog('DeleteFile', params, async () => {
        const { DeleteFile } = await getFileService();
        if (!path) throw new Error('Missing path parameter');
        await DeleteFile(path);
        return `File deleted: ${path}`;
      });
    },
    name: 'DeleteFile',
    params: {
      properties: {
        path: { description: 'Path relative to the authorized project root to delete (e.g. src/foo.ts). Do NOT use absolute paths.', type: 'string' },
      },
      required: ['path'],
      type: 'object',
    },
  },
  {
    category: 'file',
    description: 'Search for files whose name contains a keyword in a directory',
    execute: async (params) => {
      const path = params.path as string;
      const keyword = (params.keyword as string) || '';
      const maxResults = (params.maxResults as number) || 20;
      return withLog('SearchFiles', { path, keyword, maxResults }, async () => {
        const { SearchFiles } = await getFileService();
        if (!path) throw new Error('Missing path parameter');
        try {
          const results = await SearchFiles(path, keyword, maxResults);
          if (!results || results.length === 0) {
            return `No files matching '${keyword}' found in '${path}'`;
          }
          const lines = results.map(
            (f) => `- ${f.name} (${f.isDir ? 'dir' : formatSize(f.size)})`,
          );
          return `Found ${results.length} match(es):\n${lines.join('\n')}`;
        } catch (error) {
          throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    },
    name: 'SearchFiles',
    params: {
      properties: {
        keyword: { description: 'Substring to search in file names', type: 'string' },
        maxResults: { description: 'Max results to return (default 20)', type: 'number' },
        path: { description: 'Directory to search in', type: 'string' },
      },
      required: ['path'],
      type: 'object',
    },
  },
  {
    category: 'file',
    description: 'List directory contents',
    execute: async (params) => {
      const path = params.path as string;
      return withLog('ListDir', params, async () => {
        const { ListFiles } = await getFileService();
        if (!path) throw new Error('Missing path parameter');
        try {
          const entries = await ListFiles(path);
          if (!entries || entries.length === 0) {
            return `Directory empty: ${path}`;
          }
          const lines = entries.map(
            (e) => `- ${e.name} ${e.isDir ? '(dir)' : `(${formatSize(e.size)})`}`,
          );
          return `${path}\n${lines.join('\n')}`;
        } catch (error) {
          throw new Error(`Read directory failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    },
    name: 'ListDir',
    params: {
      properties: {
        path: { description: 'Directory path', type: 'string' },
      },
      required: ['path'],
      type: 'object',
    },
  },
];

