/**
 * 目录选择(webkitdirectory input 方案)
 * - 用 <input type="file" webkitdirectory> 选目录,不依赖 showDirectoryPicker
 * - showDirectoryPicker 在某些环境(刷新后/手势丢失/浏览器 bug)会偶发抛 AbortError 返回 null
 *   webkitdirectory 是纯 HTML 能力,弹窗行为稳定,Chrome/Edge 均支持
 * - 缺点:一次性拿所有文件(FileList),需要在内存构建目录树;不返回 FileSystemDirectoryHandle
 */

export interface PickedDirEntry {
  /** 相对路径,如 "src/main.ts" 或 "src"(目录) */
  path: string;
  isDir: boolean;
  size: number;
  /** 文件对象(仅文件;目录无) —— 用于后续读文件内容 */
  file?: File;
}

export interface PickedDirResult {
  /** 根目录名 */
  rootName: string;
  /** 所有文件 + 目录(含祖先目录) */
  entries: PickedDirEntry[];
}

/** 弹出目录选择器(webkitdirectory),返回目录内所有文件 + 目录结构;取消返回 null */
export function pickDirectoryViaInput(): Promise<PickedDirResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = "none";

    input.onchange = () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve(null);
        return;
      }
      const entries: PickedDirEntry[] = [];
      const seen = new Set<string>();
      let rootName = "";

      // 遍历所有文件,同时补全祖先目录
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const rel = f.webkitRelativePath; // "rootName/sub/file.ts"
        if (!rel) continue;
        const parts = rel.split("/");
        rootName = rootName || parts[0];

        // 补全祖先目录(从第一级子目录开始)
        for (let j = 1; j < parts.length - 1; j++) {
          const dirPath = parts.slice(0, j + 1).join("/");
          if (!seen.has(dirPath)) {
            seen.add(dirPath);
            entries.push({ path: dirPath, isDir: true, size: 0 });
          }
        }
        // 文件本身
        if (!seen.has(rel)) {
          seen.add(rel);
          entries.push({ path: rel, isDir: false, size: f.size, file: f });
        }
      }

      resolve({ rootName, entries });
    };

    input.oncancel = () => resolve(null);

    // 触发系统目录选择器(webkitdirectory 弹窗)
    input.click();
  });
}

/** 按相对路径取文件对象(读内容用);找不到返回 null */
export function findEntryFile(
  entries: PickedDirEntry[],
  relPath: string,
): File | null {
  const entry = entries.find((e) => e.path === relPath && !e.isDir);
  return entry?.file ?? null;
}

/** 当前选中的目录结果(module 级单例,两条入口共享;含 File 引用,不持久化) */
let currentPicked: PickedDirResult | null = null;

/** 记录当前选中的目录结果 */
export function setCurrentPicked(result: PickedDirResult): void {
  currentPicked = result;
}

/** 取当前选中的目录结果 */
export function getCurrentPicked(): PickedDirResult | null {
  return currentPicked;
}

/** 取某文件的内容(从当前选中目录的 File 引用读) */
export async function readPickedFileContent(relPath: string): Promise<string> {
  const entry = currentPicked?.entries.find(
    (e) => e.path === relPath && !e.isDir,
  );
  if (!entry?.file) throw new Error(`文件不存在: ${relPath}`);
  return entry.file.text();
}
