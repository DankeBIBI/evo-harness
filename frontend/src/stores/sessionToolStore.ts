/**
 * sessionToolStore — 会话级工具放行存储
 *
 * 用户在"工具放行弹窗"勾选的工具按会话(convId)保存,持久化到 localStorage。
 * 这些工具会合并进 useChatStreaming 的 effectiveTools,作为该会话的额外放行。
 *
 * 常驻工具(RESIDENT_TOOLS)不依赖勾选,任何会话默认放行,
 * 与 useChatStreaming effectiveTools 保持一致(单一来源,防漂移)。
 */

import { create } from 'zustand';

/** 文件工具:修改文件任务至少需要读、写、替换、搜索能力(useChatStreaming / ChatWindow 共用) */
export const FILE_TOOLS = [
	'ReadFile',
	'ReadFileRange',
	'WriteFile',
	'ReplaceInFile',
	'ReplaceInFileRegex',
	'SearchFiles',
	'ListDir',
	'DeleteFile',
];

/** Todo 工具:让 AI 主动管理任务清单,与用户 UI 操作对称 */
export const TODO_TOOLS = [
	'TodoAdd',
	'TodoList',
	'TodoToggle',
	'TodoUpdateStatus',
	'TodoEdit',
	'TodoSetPriority',
	'TodoDelete',
	'TodoClearCompleted',
];

/** 元工具(auto-discovery)+ plan 审批 + 交互工具 */
export const META_TOOLS = ['ListTools', 'GetToolDef', 'LoadSkill', 'SubmitPlan', 'AskUser'];

/** 常驻工具:不依赖勾选,任何会话都放行(文件 8 + Todo 8 + 元/plan/交互 5)
 *  单一来源:useChatStreaming effectiveTools / ChatWindow 默认 agent /
 *  ToolGrantDialog 勾选面板均从此派生,防漂移 */
export const RESIDENT_TOOLS = [...FILE_TOOLS, ...TODO_TOOLS, ...META_TOOLS];

export const RESIDENT_TOOL_SET = new Set(RESIDENT_TOOLS);

const STORAGE_KEY = 'evo-harness:session-allowed-tools';

/** 从 localStorage 读取,损坏时回退空对象 */
function load(): Record<string, string[]> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, string[]>;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

/** 持久化写回 localStorage */
function persist(map: Record<string, string[]>): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		// 忽略写入失败(localStorage 不可用/超限)
	}
}

interface SessionToolState {
	/** convId -> 用户额外勾选放行的工具列表 */
	allowedByConv: Record<string, string[]>;
	/** 获取某会话的额外放行工具 */
	getAllowedTools: (convId: string) => string[];
	/** 设置某会话的额外放行工具 */
	setAllowedTools: (convId: string, tools: string[]) => void;
	/** 清空某会话的额外放行工具 */
	resetAllowedTools: (convId: string) => void;
}

export const useSessionToolStore = create<SessionToolState>((set, get) => ({
	allowedByConv: load(),

	getAllowedTools: (convId) =>
		convId ? get().allowedByConv[convId] ?? [] : [],

	setAllowedTools: (convId, tools) => {
		set((state) => {
			const next = { ...state.allowedByConv, [convId]: tools };
			persist(next);
			return { allowedByConv: next };
		});
	},

	resetAllowedTools: (convId) => {
		set((state) => {
			const next = { ...state.allowedByConv };
			delete next[convId];
			persist(next);
			return { allowedByConv: next };
		});
	},
}));
