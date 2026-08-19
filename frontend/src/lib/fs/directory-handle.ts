/**
 * File System Access API 封装
 * - 用于前端直接读取用户授权的本地目录
 * - 不支持:枚举驱动器、获取家目录、跨域访问
 */

export interface DirectoryEntry {
	/** 是否有 .claude 子目录(项目分析用) */
	hasClair: boolean;
	isDir: boolean;
	/** 目录名 */
	name: string;
	/** 目录路径(相对根 handle) */
	path: string;
}

/**
 * 弹出系统目录选择器,返回用户选中的目录 handle
 * 用户取消返回 null;默认只读,传 readwrite 支持新增/修改文件
 */
export async function pickDirectory(
	mode: "read" | "readwrite" = "read",
): Promise<FileSystemDirectoryHandle | null> {
	if (!("showDirectoryPicker" in window)) {
		throw new Error(
			"当前浏览器不支持 File System Access API,请使用 Chrome/Edge",
		);
	}
	try {
		return await window.showDirectoryPicker({ mode });
	} catch (err) {
		if ((err as DOMException).name === "AbortError") return null;
		throw err;
	}
}

/** 列出目录下第一层子目录 */
export async function listDirectories(
	handle: FileSystemDirectoryHandle,
): Promise<DirectoryEntry[]> {
	const result: DirectoryEntry[] = [];
	for await (const [name, child] of handle.entries()) {
		if (child.kind === "directory") {
			const childHandle = child as FileSystemDirectoryHandle;
			// .claude 目录本身即 Claude 配置根(内部直接是 agents/skills/rules),可分析
			const hasClair =
				name === ".claude" || (await hasSubdirectory(childHandle, ".claude"));
			result.push({ hasClair, isDir: true, name, path: name });
		}
	}
	return result;
}

/** 检查目录下是否有指定名字的子目录 */
async function hasSubdirectory(
	handle: FileSystemDirectoryHandle,
	name: string,
): Promise<boolean> {
	try {
		const child = await handle.getDirectoryHandle(name);
		return child.kind === "directory";
	} catch {
		return false;
	}
}

/**
 * 列出指定名字的子目录 entries(用于扫描 skills/agents/rules)
 * 返回匹配的子目录 handle + 内容
 */
export async function scanSubdirectories(
	root: FileSystemDirectoryHandle,
	subdirName: string,
): Promise<FileSystemDirectoryHandle[]> {
	const results: FileSystemDirectoryHandle[] = [];
	try {
		const sub = await root.getDirectoryHandle(subdirName);
		if (sub.kind !== "directory") return results;
		for await (const [, child] of sub.entries()) {
			if (child.kind === "directory") {
				results.push(child as FileSystemDirectoryHandle);
			}
		}
	} catch {
		// 子目录不存在
	}
	return results;
}

/** 递归读取文件(用于 SKILL.md 完整读取) */
export async function readFile(
	dir: FileSystemDirectoryHandle,
	name: string,
): Promise<string | null> {
	try {
		const handle = await dir.getFileHandle(name);
		const file = await handle.getFile();
		return await file.text();
	} catch {
		return null;
	}
}
