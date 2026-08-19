/**
 * 文件操作核心(File System Access API)
 * - 输入:用户授权的目录 handle + 相对路径
 * - 输出:对应文件操作结果
 *
 * 注意:每次使用前需要确保 handle 有效(浏览器可能随时撤销权限)
 */

import type { FileInfo } from './types';

/** 从已授权 handle 解析子路径(逐级 getDirectoryHandle / getFileHandle) */
export async function resolvePath(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
  // 规范化路径(去除首尾 / 或 \)
  const parts = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts.length === 0) return root;

  let current: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const name = parts[i];
    if (isLast) {
      // 最后一段:先尝试文件,失败再尝试目录
      try {
        return await current.getFileHandle(name);
      } catch {
        return await current.getDirectoryHandle(name);
      }
    } else {
      current = await current.getDirectoryHandle(name);
    }
  }
  return current;
}

/** 读文件内容(UTF-8) */
export async function readFileText(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<string> {
  const handle = (await resolvePath(root, relPath)) as FileSystemFileHandle;
  if (handle.kind !== 'file') {
    throw new Error(`Not a file: ${relPath}`);
  }
  const file = await handle.getFile();
  return file.text();
}

/** 写文件(UTF-8) */
export async function writeFileText(
  root: FileSystemDirectoryHandle,
  relPath: string,
  content: string,
): Promise<void> {
  const parts = relPath.replace(/\\/g, '/').split('/');
  const fileName = parts.pop();
  if (!fileName) throw new Error('Invalid path');

  let dir = root;
  for (const part of parts) {
    if (!part) continue;
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** 删除文件 */
export async function deleteFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<void> {
  const parts = relPath.replace(/\\/g, '/').split('/');
  const fileName = parts.pop();
  if (!fileName) throw new Error('Invalid path');

  let dir = root;
  for (const part of parts) {
    if (!part) continue;
    dir = await dir.getDirectoryHandle(part);
  }
  await dir.removeEntry(fileName);
}

/** 获取文件元信息 */
export async function getFileInfo(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<FileInfo> {
  const handle = await resolvePath(root, relPath);
  if (handle.kind === 'file') {
    const file = await handle.getFile();
    return {
      isDir: false,
      modifiedAt: file.lastModified,
      name: handle.name,
      path: relPath,
      size: file.size,
    };
  }
  return {
    isDir: true,
    name: handle.name,
    path: relPath,
    size: 0,
  };
}

/** 列出目录(单层) */
export async function listFiles(
  root: FileSystemDirectoryHandle,
  relPath = '',
): Promise<FileInfo[]> {
  const handle = relPath
    ? ((await resolvePath(root, relPath)) as FileSystemDirectoryHandle)
    : root;
  if (handle.kind !== 'directory') {
    throw new Error(`Not a directory: ${relPath}`);
  }
  const out: FileInfo[] = [];
  for await (const [name, child] of handle.entries()) {
    if (child.kind === 'directory') {
      out.push({ isDir: true, name, path: `${relPath}/${name}`.replace(/^\//, ''), size: 0 });
    } else {
      const fileHandle = child as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      out.push({
        isDir: false,
        modifiedAt: file.lastModified,
        name,
        path: `${relPath}/${name}`.replace(/^\//, ''),
        size: file.size,
      });
    }
  }
  return out;
}

/** 递归列出(maxDepth 防爆栈) */
export async function readDirDeep(
  root: FileSystemDirectoryHandle,
  relPath = '',
  maxDepth = 5,
): Promise<FileInfo[]> {
  const result: FileInfo[] = [];
  const queue: Array<{ depth: number; handle: FileSystemDirectoryHandle; prefix: string }> = [
    { depth: 0, handle: relPath ? ((await resolvePath(root, relPath)) as FileSystemDirectoryHandle) : root, prefix: relPath },
  ];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || cur.depth > maxDepth) continue;
    for await (const [name, child] of cur.handle.entries()) {
      const path = cur.prefix ? `${cur.prefix}/${name}` : name;
      if (child.kind === 'directory') {
        result.push({ isDir: true, name, path, size: 0 });
        queue.push({ depth: cur.depth + 1, handle: child as FileSystemDirectoryHandle, prefix: path });
      } else {
        const fileHandle = child as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        result.push({
          isDir: false,
          modifiedAt: file.lastModified,
          name,
          path,
          size: file.size,
        });
      }
    }
  }
  return result;
}

/** 在文件中替换唯一文本片段 */
export async function replaceInFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
  oldText: string,
  newText: string,
): Promise<void> {
  const content = await readFileText(root, relPath);
  if (!content.includes(oldText)) {
    throw new Error(`Text not found in ${relPath}`);
  }
  const occurrences = content.split(oldText).length - 1;
  if (occurrences > 1) {
    throw new Error(`Multiple (${occurrences}) occurrences found; expected unique`);
  }
  await writeFileText(root, relPath, content.replace(oldText, newText));
}

/** 文件名匹配(支持 glob) */
export function matchGlob(name: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(name);
}

/** 简单 grep(支持 include glob + contextLines 上下文) */
export async function grepFiles(
  root: FileSystemDirectoryHandle,
  relPath: string,
  pattern: string,
  includeGlob: string,
  maxResults = 100,
  contextLines = 0,
  flags = "",
): Promise<Array<{ contextStart?: number; line: number; lineText: string; path: string }>> {
  const regex = new RegExp(pattern, flags.replace(/[^im]/g, ""));
  const results: Array<{ contextStart?: number; line: number; lineText: string; path: string }> = [];
  const allFiles = await readDirDeep(root, relPath, 10);
  for (const f of allFiles) {
    if (f.isDir) continue;
    if (includeGlob && !matchGlob(f.name, includeGlob)) continue;
    try {
      const content = await readFileText(root, f.path);
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          if (contextLines > 0) {
            const ctxStart = Math.max(0, i - contextLines);
            const ctxEnd = Math.min(lines.length, i + contextLines + 1);
            const block = lines.slice(ctxStart, ctxEnd).map((l, idx) =>
              ctxStart + idx === i ? `>${l}` : ` ${l}`,
            );
            results.push({
              contextStart: ctxStart + 1,
              line: i + 1,
              lineText: block.join('\n'),
              path: f.path,
            });
          } else {
            results.push({ line: i + 1, lineText: lines[i], path: f.path });
          }
          if (results.length >= maxResults) return results;
        }
      }
    } catch {
      // 跳过无法读取的文件
    }
  }
  return results;
}

/** 按文件名搜索(模糊匹配) */
export async function searchFiles(
  root: FileSystemDirectoryHandle,
  relPath: string,
  keyword: string,
  maxResults = 50,
): Promise<FileInfo[]> {
  const lower = keyword.toLowerCase();
  const allFiles = await readDirDeep(root, relPath, 10);
  return allFiles
    .filter((f) => !f.isDir && f.name.toLowerCase().includes(lower))
    .slice(0, maxResults);
}