/**
 * 项目文件服务(project-file-service)
 * - ChatInput 与右侧 ProjectSelector 共用同一套选目录 + 懒加载 + 读文件逻辑
 * - 选目录用 File System Access API(showDirectoryPicker),handle 持久化到 IndexedDB(project-handle-store)
 * - 所有读取实时走磁盘(disk):刷新页面后恢复 handle + 重新授权即可再次拉取数据
 * - 第一层写 analysisStore.directories 作为 React 桥(响应式)
 * - 常用方法:selectProject / restore / getChildren / readFile /
 *            refreshProject / refreshFolder / refreshFile / searchProjectFiles
 */

import { pickDirectory } from "./directory-handle";
import {
  listFiles,
  readFileText,
  searchFiles,
  writeFileText,
} from "./file-ops";
import { isNodeServerAvailable, nodeFs } from "./nodeAdapter";
import type { FileInfo } from "./types";
import {
  loadProjectHandle,
  saveProjectHandle,
} from "./project-handle-store";
import { useAnalysisStore } from "@/stores/analysisStore";

/** 文件树条目(渲染用) */
export interface ProjectFileItem {
  depth: number;
  isDir: boolean;
  name: string;
  path: string;
  size: number;
  modifiedAt?: number;
}

/** 当前根目录名(localStorage key) */
const ROOT_NAME_KEY = "evo-harness:project-root-name";

/** 内存中的根 handle(会话内复用;刷新后从 IndexedDB 恢复) */
let rootHandle: FileSystemDirectoryHandle | null = null;

/** 规范化路径分隔符为 / */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** 排序:文件夹排顶部,组内按 name 升序(字母序) */
export function sortFileItems(items: ProjectFileItem[]): ProjectFileItem[] {
  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

/** 取当前根 handle:优先内存;否则从持久化 store 自动恢复(供 AI/分析链路无需等待 restoreProject)
 *  读操作传 read(默认),写操作传 readwrite(需用户授权升级) */
async function getRootHandle(
  mode: "read" | "readwrite" = "read",
): Promise<FileSystemDirectoryHandle> {
  if (rootHandle) return rootHandle;
  // 从持久化 handle 恢复;loadProjectHandle 有内存缓存,开销小
  const handle = await loadProjectHandle();
  if (!handle) {
    throw new Error("尚未选择项目目录,请先选择项目文件夹");
  }
  // 跨会话权限可能回到 prompt,检查后提示去面板重新授权
  if (typeof handle.queryPermission === "function") {
    let state: string;
    try {
      state = await handle.queryPermission({ mode });
    } catch {
      state = "prompt";
    }
    if (state !== "granted") {
      throw new Error(
        mode === "readwrite"
          ? "项目目录缺少读写权限:请在右侧「文件」面板点刷新升级授权,或点击「更换项目」重新选择"
          : "项目目录权限已失效:请在右侧「文件」面板点刷新重新授权",
      );
    }
  }
  rootHandle = handle;
  if (!loadRootName()) persistRootName(handle.name);
  return handle;
}

/** FileInfo → ProjectFileItem(depth 由路径段数推导,根层为 0) */
function toItem(f: FileInfo): ProjectFileItem {
  const segments = normalizePath(f.path).split("/").filter(Boolean).length;
  return {
    depth: Math.max(0, segments - 1),
    isDir: f.isDir,
    name: f.name,
    path: f.path,
    size: f.size,
    modifiedAt: f.modifiedAt,
  };
}

/** 加载第一层(Node 服务可用则直接 HTTP 读,绕开浏览器授权) */
async function loadFirstLevel(): Promise<ProjectFileItem[]> {
  if (await isNodeServerAvailable()) {
    const list = await nodeFs.list("");
    return sortFileItems(list.map(toItem));
  }
  const list = await listFiles(await getRootHandle(), "");
  return sortFileItems(list.map(toItem));
}

/** 写 store 第一层(React 桥,ProjectSelector/FileMention 订阅) */
function writeFirstLevelToStore(items: ProjectFileItem[]): void {
  useAnalysisStore.getState().setDirectories(
    items.map((d) => ({
      hasClair: false,
      isDir: d.isDir,
      name: d.name,
      path: d.path,
      size: d.size,
      modifiedAt: d.modifiedAt,
    })),
  );
}

// ---- 根目录名持久化(localStorage) ----

export function persistRootName(name: string): void {
  try {
    localStorage.setItem(ROOT_NAME_KEY, name);
  } catch {
    // ignore
  }
}

export function loadRootName(): string {
  try {
    return localStorage.getItem(ROOT_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

// ---- 权限(File System Access:页面刷新后权限回到 prompt,需重新授权) ----

/** 确保 handle 有指定权限(read 浏览 / readwrite 写);无 queryPermission 的旧环境视为已授权 */
async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  try {
    if (typeof handle.queryPermission === "function") {
      const state = await handle.queryPermission({ mode });
      if (state === "granted") return true;
      if (state === "denied") return false;
    }
    if (typeof handle.requestPermission === "function") {
      const res = await handle.requestPermission({ mode });
      return res === "granted";
    }
    return true;
  } catch {
    return false;
  }
}

// ---- 对外动作 ----

/** 选目录:Node 服务可用时根已固定为项目根,直接就绪;否则走 showDirectoryPicker(readwrite) */
export async function selectProject(): Promise<boolean> {
  if (await isNodeServerAvailable()) {
    // Node 服务以项目根为根,无需选目录/授权;根名持久化供 UI 展示
    persistRootName(await nodeFs.rootName());
    writeFirstLevelToStore(await loadFirstLevel());
    return true;
  }
  const handle = await pickDirectory("readwrite");
  if (!handle) return false;
  rootHandle = handle;
  persistRootName(handle.name);
  await saveProjectHandle(handle);
  writeFirstLevelToStore(await loadFirstLevel());
  return true;
}

/**
 * Node 服务模式下切换项目根目录(对应 file-server POST /api/root)
 * - 仅在 isNodeServerAvailable 时可用;浏览器 FS 模式仍走 selectProject 选目录
 * - 成功后:server 持久化新根 + 前端刷新根名 + 写 store 第一层
 * - 失败抛错,供上层 catch 提示
 */
export async function changeProjectRoot(absRootPath: string): Promise<boolean> {
  if (!(await isNodeServerAvailable())) {
    throw new Error('Node 文件服务不可用,无法切换根目录');
  }
  const { rootName } = await nodeFs.setRoot(absRootPath);
  persistRootName(rootName);
  writeFirstLevelToStore(await loadFirstLevel());
  return true;
}

/**
 * 刷新页面后恢复:Node 服务可用时直接读磁盘(无授权概念);否则 IndexedDB 恢复 handle + 重新授权。
 * 授权需用户手势,挂载时自动调用可能被浏览器拒绝;失败保留 handle,由 UI 引导点刷新/重选重试。
 */
export async function restoreProject(): Promise<boolean> {
  if (await isNodeServerAvailable()) {
    try {
      persistRootName(await nodeFs.rootName());
      writeFirstLevelToStore(await loadFirstLevel());
      return true;
    } catch (err) {
      console.warn("[project-file] Node 文件服务恢复失败:", err);
      return false;
    }
  }
  const handle = await loadProjectHandle();
  if (!handle) return false;
  rootHandle = handle;
  // 恢复只要求 read:只读 handle 也能浏览/读文件;写操作单独走 readwrite 检查
  if (!(await ensurePermission(handle, "read"))) return false;
  try {
    const items = await loadFirstLevel();
    if (!loadRootName()) persistRootName(handle.name);
    writeFirstLevelToStore(items);
    return true;
  } catch (err) {
    console.warn("[project-file] 恢复项目失败(权限可能被撤销):", err);
    return false;
  }
}

/** 重新授权:Node 服务可用时直接成功(无授权概念);否则请求已持久化 handle 的 readwrite 权限 */
export async function reauthorizeProject(): Promise<boolean> {
  if (await isNodeServerAvailable()) {
    try {
      writeFirstLevelToStore(await loadFirstLevel());
      return true;
    } catch {
      return false;
    }
  }
  const handle = rootHandle ?? (await loadProjectHandle());
  if (!handle) return false;
  // 刷新按钮:请求升级到 readwrite(用户手势,支持写文件)
  if (!(await ensurePermission(handle, "readwrite"))) return false;
  rootHandle = handle;
  writeFirstLevelToStore(await loadFirstLevel());
  return true;
}

/** 取某目录子层(懒加载:点开才实时读磁盘) */
export async function getChildren(dirPath: string): Promise<ProjectFileItem[]> {
  if (await isNodeServerAvailable()) {
    const list = await nodeFs.list(normalizePath(dirPath));
    return sortFileItems(list.map(toItem));
  }
  const list = await listFiles(await getRootHandle(), normalizePath(dirPath));
  return sortFileItems(list.map(toItem));
}

/** 读文件内容(实时磁盘读取,刷新后依然可用) */
export async function readFileContent(path: string): Promise<string> {
  if (await isNodeServerAvailable()) {
    return nodeFs.read(normalizePath(path));
  }
  return readFileText(await getRootHandle(), normalizePath(path));
}

/** 写文件内容(实时磁盘写入,自动建目录;供新增/修改场景调用) */
export async function writeFileContent(
  path: string,
  content: string,
): Promise<void> {
  if (await isNodeServerAvailable()) {
    await nodeFs.write(normalizePath(path), content);
    return;
  }
  await writeFileText(
    await getRootHandle("readwrite"),
    normalizePath(path),
    content,
  );
}

/** 刷新当前项目(重建第一层,供新增/删除根层文件后调用) */
export async function refreshProject(): Promise<ProjectFileItem[]> {
  const items = await loadFirstLevel();
  writeFirstLevelToStore(items);
  return items;
}

/** 刷新某文件夹(重建该目录子层,供该目录下新增/删除文件后调用) */
export async function refreshFolder(
  dirPath: string,
): Promise<ProjectFileItem[]> {
  return getChildren(dirPath);
}

/** 刷新单个文件(重读磁盘内容,供外部修改文件后获取最新内容;失败返回 null) */
export async function refreshFile(path: string): Promise<string | null> {
  try {
    return await readFileText(await getRootHandle(), normalizePath(path));
  } catch {
    return null;
  }
}

/** 按文件名搜索(实时磁盘递归,最多 10 层;供 ChatInput 文件弹层搜索) */
export async function searchProjectFiles(
  keyword: string,
  maxResults = 50,
): Promise<ProjectFileItem[]> {
  if (await isNodeServerAvailable()) {
    const hits = await nodeFs.search(keyword, maxResults);
    return hits.map(toItem);
  }
  const hits = await searchFiles(await getRootHandle(), "", keyword, maxResults);
  return hits.map(toItem);
}
