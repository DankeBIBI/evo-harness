import { useCallback, useRef, useState } from "react";

export interface PendingCodeChange {
	filePath: string;
	newContent: string;
	originalContent: string;
}

// 支持多个待确认的文件修改
export interface PendingCodeChanges {
	currentIndex: number;
	changes: PendingCodeChange[];
}

export function useChatCodeApply() {
	const [autoApplyFileChanges, setAutoApplyFileChanges] = useState(false);
	const [pendingCodeChanges, setPendingCodeChanges] =
		useState<PendingCodeChanges | null>(null);
	const appliedCodeChangeKeysRef = useRef<Set<string>>(new Set());
	// 防止 Set 无限增长：超过 200 条后清空
	const MAX_APPLIED_KEYS = 200;

	// 兼容旧 API：获取当前待确认的修改
	const pendingCodeChange =
		pendingCodeChanges?.changes[pendingCodeChanges.currentIndex] ?? null;

	// 兼容旧 API：设置单个文件修改
	const setPendingCodeChange = useCallback(
		(change: PendingCodeChange | null) => {
			if (!change) {
				setPendingCodeChanges(null);
				return;
			}
			setPendingCodeChanges({
				currentIndex: 0,
				changes: [change],
			});
		},
		[],
	);

	const getWorkspacePath = useCallback(
		(filePath: string, projectPath: string) => {
			const trimmedPath = filePath.trim();
			if (
				!projectPath ||
				/^[a-z]:[\\/]/i.test(trimmedPath) ||
				trimmedPath.startsWith("\\\\") ||
				trimmedPath.startsWith("/")
			) {
				return trimmedPath;
			}

			const separator = projectPath.includes("\\") ? "\\" : "/";
			return `${projectPath.replace(/[\\/]+$/, "")}${separator}${trimmedPath.replace(/^[\\/]+/, "")}`;
		},
		[],
	);

	const extractCodeChanges = useCallback(
		(content: string, projectPath: string) => {
			const pattern = /@@FILE:([^\n]+)\n[\s\S]*?```[\w.-]*\n([\s\S]*?)```/g;
			return [...content.matchAll(pattern)].map((match) => ({
				filePath: getWorkspacePath(match[1], projectPath),
				newContent: match[2].replace(/\n$/, ""),
			}));
		},
		[getWorkspacePath],
	);

	const applyCodeChanges = useCallback(
		async (content: string, projectPath: string) => {
			const changes = extractCodeChanges(content, projectPath);
			if (changes.length === 0) return { appliedCount: 0, pendingChanges: [], changes: [] };

			// 防止 Set 无限增长
			if (appliedCodeChangeKeysRef.current.size > MAX_APPLIED_KEYS) {
				appliedCodeChangeKeysRef.current = new Set();
			}

			const { ReadFile, WriteFile } =
				await import("@/lib/hostServices/FileService");
			let appliedCount = 0;
			const pendingChanges: PendingCodeChange[] = [];

			for (const change of changes) {
				const changeKey = `${change.filePath}:${change.newContent}`;
				if (appliedCodeChangeKeysRef.current.has(changeKey)) {
					continue;
				}
				appliedCodeChangeKeysRef.current.add(changeKey);

				// 2026-07-06 P1-2: 无论 autoApply 与否, 都先读原文件拿 originalContent
				// (用于 diff UI "丢弃" 时写回原文件) — 文件不存在时 originalContent="", 不报错
				let originalContent = "";
				try {
					originalContent = await ReadFile(change.filePath);
				} catch {
					originalContent = "";
				}

				if (autoApplyFileChanges) {
					// 2026-07-06 P1-2: autoApply 也存为 pendingChange,
					// 让 FileChangesBar 永远显示 diff, "丢弃" 可以写回 originalContent
					pendingChanges.push({
						filePath: change.filePath,
						newContent: change.newContent,
						originalContent,
					});
					appliedCount += 1;
					continue;
				}

				pendingChanges.push({
					filePath: change.filePath,
					newContent: change.newContent,
					originalContent,
				});
			}

			if (pendingChanges.length > 0) {
				setPendingCodeChanges({
					currentIndex: 0,
					changes: pendingChanges,
				});
			}

			return { appliedCount, pendingChanges, changes: pendingChanges };
		},
		[autoApplyFileChanges, extractCodeChanges],
	);

	// 确认当前文件修改
	const confirmCodeChange = useCallback(
		async (newContent: string) => {
			if (!pendingCodeChanges) return;
			const currentChange =
				pendingCodeChanges.changes[pendingCodeChanges.currentIndex];
			if (!currentChange) return;
			const { WriteFile } = await import("@/lib/hostServices/FileService");
			await WriteFile(currentChange.filePath, newContent);
			// 写入成功后记录 key，防止重复确认
			const changeKey = `${currentChange.filePath}:${newContent}`;
			appliedCodeChangeKeysRef.current.add(changeKey);

			// 如果还有下一个文件修改，切换到下一个；否则清空
			const nextIndex = pendingCodeChanges.currentIndex + 1;
			if (nextIndex < pendingCodeChanges.changes.length) {
				setPendingCodeChanges({
					...pendingCodeChanges,
					currentIndex: nextIndex,
				});
			} else {
				setPendingCodeChanges(null);
			}
		},
		[pendingCodeChanges],
	);

	// 跳过当前文件，保留在队列中
	const skipCodeChange = useCallback(() => {
		if (!pendingCodeChanges) return;
		const nextIndex = pendingCodeChanges.currentIndex + 1;
		if (nextIndex < pendingCodeChanges.changes.length) {
			setPendingCodeChanges({
				...pendingCodeChanges,
				currentIndex: nextIndex,
			});
		} else {
			setPendingCodeChanges(null);
		}
	}, [pendingCodeChanges]);

	// 取消所有文件修改
	const cancelCodeChange = useCallback(() => {
		setPendingCodeChanges(null);
	}, []);

	// 批量确认所有剩余文件
	const confirmAllCodeChanges = useCallback(async () => {
		if (!pendingCodeChanges) return;
		const { WriteFile } = await import("@/lib/hostServices/FileService");
		for (
			let i = pendingCodeChanges.currentIndex;
			i < pendingCodeChanges.changes.length;
			i++
		) {
			const change = pendingCodeChanges.changes[i];
			await WriteFile(change.filePath, change.newContent);
		}
		setPendingCodeChanges(null);
	}, [pendingCodeChanges]);

	// 获取剩余文件数量
	const getPendingChangesCount = useCallback(() => {
		if (!pendingCodeChanges) return 0;
		return pendingCodeChanges.changes.length - pendingCodeChanges.currentIndex;
	}, [pendingCodeChanges]);

	const toggleAutoApply = useCallback(() => {
		setAutoApplyFileChanges((prev) => !prev);
	}, []);

	return {
		autoApplyFileChanges,
		pendingCodeChange,
		pendingCodeChanges,
		applyCodeChanges,
		confirmCodeChange,
		skipCodeChange,
		confirmAllCodeChanges,
		cancelCodeChange,
		getPendingChangesCount,
		toggleAutoApply,
		getWorkspacePath,
		extractCodeChanges,
		setPendingCodeChange,
	};
}
