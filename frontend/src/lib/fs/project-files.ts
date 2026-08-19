/**
 * 项目根 handle 直读文件 API(前端 File System Access)
 * - 输入:已授权的 FileSystemDirectoryHandle + 相对路径
 * - 输出:与 file-ops.ts 同构的 FileInfo[]
 *
 * 跟 file-ops.listFiles 的区别:这里我们不绕回 FileService 那套(那套依赖绝对路径,
 * 而 SelectDirectory 拿不到绝对路径,只能拿到 handle.name)。
 * ProjectSelector 直接走这里,与 SourcesSettingsView 用 analyzeProject(handle) 同协议。
 */

import {
  listFiles as fsListFiles,
  readFileText as fsReadFileText,
  resolvePath,
} from './file-ops';
import type { FileInfo } from './types';

/** 列根目录单层(直接用 handle,relPath 传 '') */
export async function listRootFiles(
  handle: FileSystemDirectoryHandle,
): Promise<FileInfo[]> {
  return fsListFiles(handle, '');
}

/** 列指定子目录单层 */
export async function listSubdir(
  handle: FileSystemDirectoryHandle,
  relPath: string,
): Promise<FileInfo[]> {
  return fsListFiles(handle, relPath);
}

/** 读文件内容(UTF-8) */
export async function readProjectFile(
  handle: FileSystemDirectoryHandle,
  relPath: string,
): Promise<string> {
  return fsReadFileText(handle, relPath);
}

/** 解析子路径拿 handle(用于展开目录时拿到下一级目录 handle) */
export async function resolveDirHandle(
  handle: FileSystemDirectoryHandle,
  relPath: string,
): Promise<FileSystemDirectoryHandle> {
  const resolved = await resolvePath(handle, relPath);
  if (resolved.kind !== 'directory') {
    throw new Error(`Not a directory: ${relPath}`);
  }
  return resolved as FileSystemDirectoryHandle;
}