import { create } from "zustand";

import type { FileChange } from "@/components/editor/CodeReviewPanel";

/**
 * fileReviewStore — 文件代码审查面板全局状态
 * 2026-08-31 新增: 把 reviewChanges / showCodeReviewPanel 从 ChatWindow 抽到 store,
 *   解决"代码审查"面板需在左栏 SessionSidebar 内渲染的跨组件数据共享
 *   (避免 prop drilling 经过 ChatLayout)
 */

export type FileReviewTab = "review" | "sessions";

interface FileReviewState {
	/** 当前变更列表 */
	changes: FileChange[];
	/** 左栏侧 tab: 'review' | 'sessions' */
	tab: FileReviewTab;
	/** 新增变更回调(去重 + 切到 review tab) */
	addChanges: (newOnes: FileChange[]) => void;
	/** 全量替换(支持值或函数式更新,兼容 useState 风格调用) */
	setChanges: (updater: Updater<FileChange[]>) => void;
	/** 切换左栏 tab */
	setTab: (tab: FileReviewTab) => void;
	/** 清空 */
	clear: () => void;
}

/** 兼容 React useState 风格的更新器: 值或 (prev) => 新值 */
type Updater<T> = T | ((prev: T) => T);

export const useFileReviewStore = create<FileReviewState>((set) => ({
	changes: [],
	tab: "sessions",
	addChanges: (newOnes) => {
		if (newOnes.length === 0) return;
		set((state) => {
			// 去重: 同 filePath 跳过
			const existing = new Set(state.changes.map((c) => c.filePath));
			const filtered = newOnes.filter((c) => !existing.has(c.filePath));
			if (filtered.length === 0) return state;
			return {
				changes: [...state.changes, ...filtered],
				tab: "review",
			};
		});
	},
	setChanges: (updater) => {
		set((state) => {
			const next =
				typeof updater === "function" ? updater(state.changes) : updater;
			return { changes: next };
		});
	},
	setTab: (tab) => set({ tab }),
	clear: () => set({ changes: [] }),
}));
