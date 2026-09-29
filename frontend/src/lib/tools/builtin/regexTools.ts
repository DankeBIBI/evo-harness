/**
 * 正则工具集：GrepFiles（按正则搜文件内容）+ ReplaceInFileRegex（按正则替换）
 *
 * 与现有文件工具的区别：
 *   - GrepFiles       vs SearchFiles：搜文件内容（不是文件名），用正则
 *   - ReplaceInFileRegex vs ReplaceInFile：按正则匹配（不是字面量），支持反向引用
 *
 * 性能约束：单文件 > 5MB 自动跳过；单行 > 1MB 自动截断；默认最多 200 条匹配
 */

import type { Tool } from '../base';

async function getFileService() {
  return import('@/lib/hostServices/FileService');
}

/** GrepFiles：在目录下按正则搜索文件内容（类 ripgrep，支持 contextLines 上下文） */
export const grepFilesTool: Tool = {
  category: 'file',
  description:
    'Search file contents under a directory using a regex pattern. ' +
    'Returns matches in the format {file, line, content}. ' +
    'Set contextLines>0 to include surrounding lines (like ripgrep -C).',
  execute: async (params) => {
    const { GrepFiles } = await getFileService();
    const dirPath = params.dirPath as string;
    const pattern = params.pattern as string;
    const flags = (params.flags as string) || '';
    const includeGlob = (params.includeGlob as string) || '';
    const maxResults = (params.maxResults as number) || 200;
    const contextLines = (params.contextLines as number) || 0;
    if (!dirPath) throw new Error('Missing dirPath parameter');
    if (!pattern) throw new Error('Missing pattern parameter');
    const matches = (await GrepFiles(
      dirPath,
      pattern,
      flags,
      includeGlob,
      maxResults,
      contextLines,
    )) as Array<Record<string, unknown>>;
    if (!matches || matches.length === 0) {
      return `No matches found for pattern "${pattern}" under "${dirPath}"`;
    }
    // 截断提示行（后端会在 maxResults 截断时追加 _meta 标记）
    const truncatedMeta = matches.find((m) => m._meta === 'truncated');
    const realMatches = matches.filter((m) => m._meta !== 'truncated');
    const formatted = realMatches
      .map((m) => {
        const content = String(m.content);
        const ctxStart =
          typeof m.contextStart === 'number' ? m.contextStart : Number(m.line);
        if (content.includes('\n')) {
          // 上下文块:按行加绝对行号输出
          const lines = content.split('\n');
          return `${String(m.file)}:${ctxStart}-${ctxStart + lines.length - 1}:\n${lines
            .map((l, idx) => `${ctxStart + idx}: ${l}`)
            .join('\n')}`;
        }
        return `${String(m.file)}:${m.line}: ${content.slice(0, 500)}`;
      })
      .join('\n');
    if (truncatedMeta) {
      return `${realMatches.length} match(es) (truncated at maxResults=${truncatedMeta.maxResults}):\n${formatted}`;
    }
    return `${realMatches.length} match(es):\n${formatted}`;
  },
  name: 'GrepFiles',
  params: {
    properties: {
      contextLines: {
        description: 'Include N lines of context around each match (like ripgrep -C). 0 = match line only (default)',
        type: 'number',
      },
      dirPath: { description: 'Directory to search under', type: 'string' },
      flags: {
        description: 'Regex flags, e.g. "i" case-insensitive, "m" multiline, "im" both',
        type: 'string',
      },
      includeGlob: { description: 'Optional file name glob, e.g. "*.ts"', type: 'string' },
      maxResults: { description: 'Max results (default 200, <=0 means default)', type: 'number' },
      pattern: { description: 'ECMAScript regex pattern (Go RE2)', type: 'string' },
    },
    required: ['dirPath', 'pattern'],
    type: 'object',
  },
};

/** ReplaceInFileRegex：按正则替换文件内容，支持反向引用 $1/$2 */
export const replaceInFileRegexTool: Tool = {
  category: 'file',
  description:
    'Replace text in a file by regex pattern. Supports backreferences like $1, $2 in newText.',
  mutating: true,
  execute: async (params) => {
    const { ReplaceInFileRegex } = await getFileService();
    const filePath = params.filePath as string;
    const pattern = params.pattern as string;
    const newText = (params.newText as string) ?? '';
    const flags = (params.flags as string) || '';
    const replaceAll = params.replaceAll === true;
    if (!filePath) throw new Error('Missing filePath parameter');
    if (!pattern) throw new Error('Missing pattern parameter');
    const result = (await ReplaceInFileRegex(
      filePath,
      pattern,
      newText,
      flags,
      replaceAll,
    )) as Record<string, unknown>;
    return `Regex replace ok: ${String(result.path)} (${result.matchCount} match(es), replaceAll=${result.replaceAll})`;
  },
  name: 'ReplaceInFileRegex',
  params: {
    properties: {
      filePath: { description: 'Path relative to the authorized project root (e.g. src/foo.ts). Do NOT use absolute paths.', type: 'string' },
      flags: { description: 'Regex flags, e.g. "i" case-insensitive', type: 'string' },
      newText: { description: 'Replacement (supports $1/$2 backrefs)', type: 'string' },
      pattern: { description: 'ECMAScript regex pattern', type: 'string' },
      replaceAll: { description: 'Replace all matches (default false; when false pattern must match exactly once)', type: 'boolean' },
    },
    required: ['filePath', 'pattern'],
    type: 'object',
  },
};