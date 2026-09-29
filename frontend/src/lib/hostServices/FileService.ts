/**
 * 文件服务(hostServices/FileService)
 */

import {
	deleteFile,
	grepFiles as fsGrep,
	listFiles,
	matchGlob,
	readDirDeep,
	readFileText,
	replaceInFile,
	searchFiles,
	writeFileText,
} from "@/lib/fs/file-ops";
import { pickDirectory } from "@/lib/fs/directory-handle";
import { isNodeServerAvailable, nodeFs } from "@/lib/fs/nodeAdapter";
import { loadProjectHandle } from "@/lib/fs/project-handle-store";
import type { FileInfo } from "@/lib/fs/types";

/** FileInfo → Record(兼容旧绑定返回 Array<Record<string, any>> 的调用方) */
function toRecord(f: FileInfo): Record<string, unknown> {
	return {
		isDir: f.isDir,
		modTime: f.modifiedAt ?? 0,
		name: f.name,
		path: f.path,
		size: f.size,
	};
}

/** Node 文件服务可用时走 HTTP,绕开浏览器授权(与 project-file-service 一致) */
async function nodeMode(): Promise<boolean> {
	return isNodeServerAvailable();
}

/** Node 模式递归列目录(最多 maxDepth 层,供 ReadDirDeep / GrepFiles 用) */
async function nodeListDeep(
	relPath: string,
	maxDepth = 5,
): Promise<FileInfo[]> {
	const result: FileInfo[] = [];
	const queue: Array<{ depth: number; prefix: string }> = [
		{ depth: 0, prefix: relPath },
	];
	while (queue.length > 0) {
		const cur = queue.shift();
		if (!cur || cur.depth > maxDepth) continue;
		const items = await nodeFs.list(cur.prefix);
		for (const item of items) {
			result.push(item);
			if (item.isDir) {
				queue.push({ depth: cur.depth + 1, prefix: item.path });
			}
		}
	}
	return result;
}

/** 已授权的根目录 handle + 路径前缀 + 目录名 */
let rootHandle: FileSystemDirectoryHandle | null = null;
let rootPath = "";
let rootName = "";

/** 规范化路径分隔符为 / */
function normalizePath(p: string): string {
	return p.replace(/\\/g, "/");
}

/** 校验并获取已授权根目录:优先内存,否则从持久化 store 恢复(ProjectSelector 授权的目录)
 *  读操作传 read(默认),写操作传 readwrite */
async function getRoot(
	mode: "read" | "readwrite" = "read",
): Promise<FileSystemDirectoryHandle> {
	if (rootHandle) return rootHandle;
	// 从持久化 handle 恢复;loadProjectHandle 有内存缓存,开销小,选目录后立即生效
	const handle = await loadProjectHandle();
	if (!handle) {
		throw new Error("尚未授权项目目录:请先在右侧「文件」面板选择项目文件夹");
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
	rootName = rootName || handle.name;
	return handle;
}

/** 绝对路径 → 相对根目录路径(优先按 rootPath 前缀,回退按 rootName 目录名段裁剪) */
function toRelPath(absPath: string): string {
	const abs = normalizePath(absPath);
	const root = normalizePath(rootPath).replace(/\/+$/, "");
	if (root && abs.startsWith(root + "/")) {
		return abs.slice(root.length + 1);
	}
	if (rootName) {
		const marker = `/${rootName}/`;
		const idx = abs.indexOf(marker);
		if (idx >= 0) return abs.slice(idx + marker.length);
		if (abs.endsWith(`/${rootName}`)) return "";
	}
	return abs.replace(/^\/+/, "");
}

/** 读取文件内容(UTF-8) */
export async function ReadFile(path: string): Promise<string> {
	if (await nodeMode()) {
		return nodeFs.read(toRelPath(path));
	}
	return readFileText(await getRoot(), toRelPath(path));
}

/** 按行分段读文件(返回 {content, startLine, endLine, totalLines}) */
export async function ReadFileRange(
	path: string,
	startLine = 1,
	endLine = 0,
): Promise<{ content: string; startLine: number; endLine: number; totalLines: number }> {
	const rel = toRelPath(path);
	if (await nodeMode()) {
		return nodeFs.readRange(rel, startLine, endLine);
	}
	const content = await readFileText(await getRoot(), rel);
	const lines = content === "" ? [] : content.replace(/\r?\n$/, "").split(/\r?\n/);
	const totalLines = lines.length;
	const s = Math.max(1, startLine);
	const e = Math.max(s, Math.min(totalLines, endLine > 0 ? endLine : s + 99));
	return {
		content: lines.slice(s - 1, e).join("\n"),
		endLine: e,
		startLine: s,
		totalLines,
	};
}

/** 写入文件(UTF-8,自动建目录) */
export async function WriteFile(path: string, content: string): Promise<void> {
	if (await nodeMode()) {
		await nodeFs.write(toRelPath(path), content);
		return;
	}
	await writeFileText(await getRoot("readwrite"), toRelPath(path), content);
}

/** 删除文件 */
export async function DeleteFile(path: string): Promise<void> {
	if (await nodeMode()) {
		await nodeFs.del(toRelPath(path));
		return;
	}
	await deleteFile(await getRoot("readwrite"), toRelPath(path));
}

/** 列出目录单层 */
export async function ListFiles(path: string): Promise<FileInfo[]> {
	if (await nodeMode()) {
		return nodeFs.list(toRelPath(path));
	}
	return listFiles(await getRoot(), toRelPath(path));
}

/** 递归列目录 */
export async function ReadDirDeep(
	path: string,
	maxDepth = 5,
): Promise<Record<string, unknown>[]> {
	if (await nodeMode()) {
		return (await nodeListDeep(toRelPath(path), maxDepth)).map(toRecord);
	}
	return (await readDirDeep(await getRoot(), toRelPath(path), maxDepth)).map(
		toRecord,
	);
}

/** 文本替换(要求唯一匹配) */
export async function ReplaceInFile(
	path: string,
	oldText: string,
	newText: string,
): Promise<void> {
	if (await nodeMode()) {
		const rel = toRelPath(path);
		const content = await nodeFs.read(rel);
		if (!content.includes(oldText)) {
			throw new Error(`Text not found in ${rel}`);
		}
		const occurrences = content.split(oldText).length - 1;
		if (occurrences > 1) {
			throw new Error(
				`Multiple (${occurrences}) occurrences found; expected unique`,
			);
		}
		await nodeFs.write(rel, content.replace(oldText, newText));
		return;
	}
	await replaceInFile(
		await getRoot("readwrite"),
		toRelPath(path),
		oldText,
		newText,
	);
}

/** 按正则替换(返回 {path, matchCount, replaceAll}) */
export async function ReplaceInFileRegex(
	path: string,
	pattern: string,
	newText: string,
	flags = "",
	replaceAll = false,
): Promise<Record<string, unknown>> {
	const rel = toRelPath(path);
	const regex = new RegExp(pattern, flags.replace(/[^gim]/g, ""));
	if (await nodeMode()) {
		const content = await nodeFs.read(rel);
		const matchCount = (content.match(regex) ?? []).length;
		const next = content.replace(regex, newText);
		await nodeFs.write(rel, next);
		return { matchCount, path, replaceAll };
	}
	const root = await getRoot("readwrite");
	const content = await readFileText(root, rel);
	const matchCount = (content.match(regex) ?? []).length;
	const next = content.replace(regex, newText);
	await writeFileText(root, rel, next);
	return { matchCount, path, replaceAll };
}

/** 按文件名搜索(模糊匹配) */
export async function SearchFiles(
	path: string,
	keyword: string,
	maxResults = 50,
): Promise<FileInfo[]> {
	if (await nodeMode()) {
		// nodeFs.search 递归搜整个根目录(无 path 参数),结果更广
		return nodeFs.search(keyword, maxResults);
	}
	return searchFiles(await getRoot(), toRelPath(path), keyword, maxResults);
}

/** 单文件内容搜索的大小上限(与 fs/file-ops 浏览器端 grepFiles 的 5MB 约束一致) */
const MAX_GREP_FILE_BYTES = 5 * 1024 * 1024;

/** 按正则搜文件内容(返回 {file, line, content} 兼容格式) */
export async function GrepFiles(
	dirPath: string,
	pattern: string,
	flags = "",
	includeGlob = "",
	maxResults = 200,
	contextLines = 0,
): Promise<Array<Record<string, unknown>>> {
	const regexFlags = flags.replace(/[^im]/g, "");
	if (await nodeMode()) {
		const regex = new RegExp(pattern, regexFlags);
		const hits: Array<{
			contextStart?: number;
			line: number;
			lineText: string;
			path: string;
		}> = [];
		const allFiles = await nodeListDeep(toRelPath(dirPath), 10);
		for (const f of allFiles) {
			if (f.isDir) continue;
			// 大文件/二进制跳过,防止全文载入内存(node 路径此前缺此保护)
			if (f.size > MAX_GREP_FILE_BYTES) continue;
			if (includeGlob && !matchGlob(f.name, includeGlob)) continue;
			try {
				const content = await nodeFs.read(f.path);
				const lines = content.split(/\r?\n/);
				for (let i = 0; i < lines.length; i++) {
					if (regex.test(lines[i])) {
						if (contextLines > 0) {
							const ctxStart = Math.max(0, i - contextLines);
							const ctxEnd = Math.min(lines.length, i + contextLines + 1);
							const block = lines.slice(ctxStart, ctxEnd).map((l, idx) =>
								ctxStart + idx === i ? `>${l}` : ` ${l}`,
							);
							hits.push({
								contextStart: ctxStart + 1,
								line: i + 1,
								lineText: block.join("\n"),
								path: f.path,
							});
						} else {
							hits.push({ line: i + 1, lineText: lines[i], path: f.path });
						}
						if (hits.length >= maxResults) break;
					}
				}
			} catch {
				// 跳过无法读取的文件
			}
			if (hits.length >= maxResults) break;
		}
		const out: Array<Record<string, unknown>> = hits.map((h) => ({
			content: h.lineText,
			contextStart: h.contextStart,
			file: h.path,
			line: h.line,
		}));
		if (hits.length >= maxResults) {
			out.push({ _meta: "truncated", maxResults });
		}
		return out;
	}
	const hits = await fsGrep(
		await getRoot(),
		toRelPath(dirPath),
		pattern,
		includeGlob,
		maxResults,
		contextLines,
		regexFlags,
	);
	const out: Array<Record<string, unknown>> = hits.map((h) => ({
		content: h.lineText,
		contextStart: h.contextStart,
		file: h.path,
		line: h.line,
	}));
	// 与旧后端一致:maxResults 截断时追加 _meta 标记
	if (hits.length >= maxResults) {
		out.push({ _meta: "truncated", maxResults });
	}
	return out;
}

/** 弹出目录选择器,授权为根目录 */
export async function SelectDirectory(): Promise<string> {
	const handle = await pickDirectory();
	if (!handle) return "";
	rootHandle = handle;
	rootName = handle.name;
	rootPath = "";
	return handle.name;
}

/** 记录根目录路径前缀(用于绝对路径转相对路径) */
export function SetAllowedRoot(path: string): void {
	rootPath = normalizePath(path).replace(/\/+$/, "");
}

/** 兼容旧 IPC 的 SetContext(前端无上下文概念,置空) */
export function SetContext(_ctx: unknown): void {
	// no-op
}
