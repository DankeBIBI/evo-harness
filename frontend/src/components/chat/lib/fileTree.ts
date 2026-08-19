/**
 * 文件路径树工具(共享)
 * - 按目录层级把扁平的 FileChange[] 构造成 N 叉树
 * - 支持目录节点递归统计(用于树状 UI 的"X 个文件"徽标)
 */

export interface FileChangeLike {
  filePath: string;
}

export type TreeNode =
  | { children: Map<string, TreeNode>; name: string; type: "dir" }
  | { name: string; type: "file" } & FileChangeLike;

/** 跨平台路径分隔符正则(Windows '\\' + Unix '/') */
export const PATH_SEP_RE = /[/\\]/;

/** 构造文件树 */
export function buildFileTree<T extends FileChangeLike>(changes: T[]): TreeNode {
  const root: TreeNode = { children: new Map(), name: "", type: "dir" };
  for (const change of changes) {
    const parts = change.filePath.split(PATH_SEP_RE).filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts.pop()!;
    let cursor: TreeNode = root;
    for (const part of parts) {
      let next: TreeNode | undefined;
      if (cursor.type === "dir") {
        next = cursor.children.get(part);
      }
      if (!next) {
        const created: TreeNode = {
          children: new Map(),
          name: part,
          type: "dir",
        };
        if (cursor.type === "dir") {
          cursor.children.set(part, created);
        }
        next = created;
      }
      cursor = next;
    }
    if (cursor.type === "dir") {
      cursor.children.set(fileName, {
        ...change,
        name: fileName,
        type: "file",
      });
    }
  }
  return root;
}

/** 递归统计目录节点下(含子目录)的文件总数 */
export function countFilesRecursive(node: TreeNode): number {
  if (node.type === "file") return 1;
  let count = 0;
  for (const child of node.children.values()) {
    count += countFilesRecursive(child);
  }
  return count;
}
