import { create } from "zustand";

import { useTodoStore } from "./todoStore";
import { useDebugLogStore } from "./debugLogStore";
import type { DebugLog } from "@/types/debugLog";
import type { ChatMessage } from "@/lib/chat/protocol";

import { nowTimestamp, write as writeLog } from "@/lib/storage/logStore";
import { devLog } from "@/lib/devLog";
import {
	ListConversations,
	GetConversation,
	CreateConversation,
	UpdateConversation,
	UpdateConversationTokenStats as UpdateConvTokenStats,
	DeleteConversation,
	DeleteMultipleConversations,
} from "@/lib/conversationApi";

// P1 修复: 2026-07-09 — addMessage / addConversation 的 fire-and-forget catch
// 之前用 `.catch(() => {})` 完全静默,SQLite 写入失败时用户无感(消息丢失却不知)。
// 改为 devLog.e 让错误至少进 dev 日志,便于定位真因。
// 注意:仍保留 fire-and-forget 语义(不阻塞 UI),仅在错误时记录。

const LOG = "chat:store";

export type MessageRole = "assistant" | "system" | "tool" | "user";

/** 2026-07-10 PR-1: 任务进度阶段 — 顶部 ProgressBar 用 */
export type ProgressStage =
	| "idle"
	| "reading"
	| "analyzing"
	| "planning"
	| "executing"
	| "reviewing"
	| "done";

export interface Message {
	attachments?: Attachment[];
	/** 显示用内容（流式完成时自动清理 tool_call/tool_result 标签，节省上下文 token） */
	content: string;
	createdAt: string;
	error?: string;
	id: string;
	modelId?: string;
	/** Anthropic 原始 assistant 内容块，用于下一轮协议回传。 */
	providerContentBlocks?: Array<Record<string, unknown>>;
	/** MiniMax/OpenAI-compatible 原始 reasoning_details。 */
	reasoningDetails?: Array<Record<string, unknown>>;
	/** 工具续传期间的标准化原始消息顺序，用于后续用户轮完整回传。 */
	providerTranscript?: ChatMessage[];
	/** 本轮用户引用过的文件路径,用于后续轮次恢复工作区上下文 */
	referencedFiles?: string[];
	/** AI 原始完整输出（含 tool_call/tool_result 等所有标签），仅用于查看原始数据 */
	rawContent?: string;
	role: MessageRole;
	toolCalls?: ToolCall[];
	toolResults?: ToolResult[];
}

export interface Attachment {
	mimeType?: string;
	name?: string;
	size?: number;
	type: "file" | "image";
	url: string;
}

export interface ToolCall {
	/** 后端 toolCall 出现时累计已下发的 content 字符数
	 *  渲染时按它精确穿插到 content 对应位置(保证"按执行顺序") */
	_anchor?: number;
	duration?: number;
	error?: string;
	id: string;
	input: Record<string, unknown>;
	skillId?: string;
	status: "error" | "pending" | "success";
	toolName: string;
}

export interface ToolResult {
	result: unknown;
	toolCallId: string;
}

/** 调试日志条目 — 类型唯一源在 @/types/debugLog,此处 re-export 兼容旧 import */
export type { DebugLog } from "@/types/debugLog";

export interface Conversation {
	agentId: string;
	/** 创建时快照的 Agent 信息，供导出使用 */
	agentMeta?: {
		name: string;
		role: string;
		skills: string[];
		tools: string[];
		collaborationMode?: string;
	};
	context?: {
		currentFilePath?: string;
		modelId?: string;
		modelName?: string;
		projectPath?: string;
	};
	createdAt: string;
	debugLogs: DebugLog[];
	id: string;
	isArchived: boolean;
	isStarred: boolean;
	lastMessageAt: string;
	messages: Message[];
	/**
	 * 2026-07-10 PR-1: 任务进度（顶部 ProgressBar 用）
	 * - stage:    当前阶段（idle/reading/analyzing/planning/executing/reviewing/done）
	 * - percent:  0-100,UI 用它驱动进度条
	 * - message:  当前阶段提示文案（如"读取 userStore.ts"）
	 * - updatedAt: 最近一次写入时间,UI 用来判断是否显示 stale 态
	 */
	progress?: {
		message: string;
		percent: number;
		stage: ProgressStage;
		updatedAt: string;
	};
	title?: string;
	/**
	 * 会话级 token 统计（含缓存命中信息）
	 * - inputTokens/outputTokens/totalTokens: 累计输入/输出/总 token
	 * - cacheReadTokens:        累计缓存命中 token（按 0.42 元/1M tokens 计费）
	 * - cacheCreationTokens:    累计主动写入缓存的 token（M2.x + cache_control 时有值）
	 * - lastTurnCacheRead:      最近一次 turn 的命中（用于增量更新）
	 * - hitRate:                聚合命中率 (0-1)
	 */
	tokenStats?: {
		cacheCreationTokens: number;
		cacheReadTokens: number;
		hitRate: number;
		inputTokens: number;
		lastTurnCacheRead: number;
		outputTokens: number;
		totalCostCny: number;
		totalTokens: number;
	};
	updatedAt: string;
}

const LAST_CONV_KEY = "evo-harness:lastConversationId";
const PROMPT_LOGS_KEY = "evo-harness:promptLogs";
const LOCALSTORAGE_MIGRATED_KEY = "evo-harness:migrated-to-sqlite";

const createEmptyTokenStats = (): NonNullable<Conversation["tokenStats"]> => ({
	cacheCreationTokens: 0,
	cacheReadTokens: 0,
	hitRate: 0,
	inputTokens: 0,
	lastTurnCacheRead: 0,
	outputTokens: 0,
	totalCostCny: 0,
	totalTokens: 0,
});

/** 从 SQLite 异步加载会话列表 */
let cachedConversations: Conversation[] | null = null;
let loadingPromise: Promise<Conversation[]> | null = null;

async function loadConversationsFromDb(): Promise<Conversation[]> {
	if (cachedConversations) return cachedConversations;
	if (loadingPromise) return loadingPromise;

	loadingPromise = (async (): Promise<Conversation[]> => {
		// 迁移：如果 localStorage 有旧数据且未标记已迁移,先导入 SQLite
		await migrateLocalStorageToSqlite();

		try {
			const json = await ListConversations();
			const raw = JSON.parse(json);
			const convs: Conversation[] = raw.map((c: any) => ({
				...c,
				title: c.title || undefined,
				agentMeta: c.agentMeta ? JSON.parse(c.agentMeta) : undefined,
				context: c.context ? JSON.parse(c.context) : undefined,
				// 根因修复: saveConversationToDbAsync 用 JSON.stringify 写入 messages 列,
				// 但读出时其他字段都解了唯独 messages 漏了 → messages 是字符串而非数组,
				// 导致 ChatMessages.tsx:230 `messages.filter is not a function`
				messages: c.messages ? JSON.parse(c.messages) : [],
				tokenStats: c.tokenStats ? JSON.parse(c.tokenStats) : undefined,
			}));
			cachedConversations = convs;
			return convs;
		} catch (e) {
			// P1 修复 2026-07-09: console.error → devLog.e,让桌面 app 也能看到错
			devLog.e(LOG, "loadConversationsFromDb failed", { err: String(e) });
			cachedConversations = [];
			return [];
		}
	})();

	return loadingPromise;
}

/** 迁移 localStorage → SQLite */
async function migrateLocalStorageToSqlite() {
	if (typeof window === "undefined") return;
	if (window.localStorage.getItem(LOCALSTORAGE_MIGRATED_KEY)) return;

	const oldKey = "evo-harness:conversations";
	const raw = window.localStorage.getItem(oldKey);
	if (!raw) {
		window.localStorage.setItem(LOCALSTORAGE_MIGRATED_KEY, "1");
		return;
	}

	try {
		const oldConvs: Conversation[] = JSON.parse(raw);
		for (const conv of oldConvs) {
			await CreateConversation(
				JSON.stringify({
					id: conv.id,
					agentId: conv.agentId,
					title: conv.title || "",
					messages: conv.messages,
					isStarred: conv.isStarred,
					isArchived: conv.isArchived,
					createdAt: conv.createdAt,
					updatedAt: conv.updatedAt,
					lastMessageAt: conv.lastMessageAt,
				}),
			);
		}
		cachedConversations = null;
		loadingPromise = null;
		window.localStorage.setItem(LOCALSTORAGE_MIGRATED_KEY, "1");
		devLog.i(LOG, "Migrated conversations from localStorage to SQLite", {
			count: oldConvs.length,
		});
	} catch (e) {
		// P1 修复 2026-07-09: console.error → devLog.e,口径与 loadConv 一致
		devLog.e(LOG, "migrateLocalStorageToSqlite failed", { err: String(e) });
	}
}

/** 异步写入 SQLite，失败不抛异常（best-effort 但会 await） */
async function saveConversationToDbAsync(conv: Conversation) {
	try {
		await UpdateConversation(conv.id, {
			title: conv.title || "",
			agentId: conv.agentId,
			// P0 修复: 2026-07-08 — 原代码遗漏 messages 字段,导致 addMessage 后 SQLite 中
			// messages 列还是 Create 时的初始值,重启 app 后用户看不到任何消息
			messages: JSON.stringify(conv.messages),
			isStarred: conv.isStarred,
			isArchived: conv.isArchived,
			lastMessageAt: conv.lastMessageAt,
			updatedAt: conv.updatedAt,
		});
		if (conv.tokenStats) {
			await UpdateConvTokenStats(
				conv.id,
				conv.tokenStats as unknown as Record<string, unknown>,
			);
		}
	} catch (e) {
		// P1 修复: 2026-07-09 — 改 console.error 为 devLog.e,保证日志能落盘
		// (桌面 app 用户看不到 console,只有 devLog 会进 evo-harness/logs/YYYYMMDD.log)
		devLog.e(LOG, "saveConversationToDb failed", {
			id: conv.id,
			err: String(e),
		});
	}
}

/** P1 修复 2026-07-09: 抽 fire-and-forget SQLite 写入的 catch helper,统一走 devLog.e
 *  避免各 store action 里 .catch(() => {}) 静默吞错(已发现 6 处同型反模式)。
 *  使用方法: safePersist('updateConversation', () => saveConversationToDbAsync(updated))
 */
function safePersist(
	op: string,
	promise: Promise<unknown>,
	ctx: Record<string, unknown> = {},
): void {
	promise.catch((e) => {
		devLog.e(LOG, `${op} failed`, { ...ctx, err: String(e) });
	});
}

/** P1 修复 2026-07-09: 记录 in-flight 的 CreateConversation Promise,
 *  addMessage 可 await 它避免 addConv→addMsg 竞态丢消息(创建还没入库就发首条消息)。
 *  Module 级 Map,跨 action 共享状态。
 */
const pendingCreateMap = new Map<string, Promise<void>>();

function persistLastConversationId(id: string | null) {
	if (typeof window === "undefined") return;
	if (id) {
		window.localStorage.setItem(LAST_CONV_KEY, id);
	} else {
		window.localStorage.removeItem(LAST_CONV_KEY);
	}
}

function loadLastConversationId(): string | null {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem(LAST_CONV_KEY);
}

const loadPromptLogs = (): PromptLog[] => {
	if (typeof window === "undefined") return [];
	try {
		const stored = window.localStorage.getItem(PROMPT_LOGS_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
};

const savePromptLogs = (logs: PromptLog[]) => {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(PROMPT_LOGS_KEY, JSON.stringify(logs));
	} catch {
		// prompt 快照持久化 best-effort,失败不阻塞聊天
	}
};

/** 单条提示词快照(发给 AI 的完整 payload,用于统一日志"原 提示词"tab) */
export interface PromptLog {
	/** 唯一 ID */
	id: string;
	/** 时间戳 */
	createdAt: string;
	/** 关联会话 ID(可选) */
	conversationId?: string;
	/** 关联 Agent ID(可选) */
	agentId?: string;
	/** Agent 名称 */
	agentName?: string;
	/** 完整 system prompt(含 role + skills + behavior + 工作区上下文) */
	system: string;
	/** 用户消息(含 history + toolModeChange hint) */
	user: string;
	/** 当前档位(auto/edit/plan) */
	toolMode?: string;
	/** 总字符数(用于显示) */
	totalLength: number;
	/** P3: 用户发送时的文件引用(已展开为绝对路径) */
	fileMentions?: Array<{ path: string; token: string }>;
	/** P3: 用户通过 /xxx chip 选的 skills */
	skillMentions?: string[];
	/** P3: 用户配置的自定义提示词 */
	matchedPrompts?: Array<{ id: string; name: string; content: string }>;
	/** P3: 该次请求可用的工具名列表 */
	tools?: string[];
	/** P3: 派生子代理列表(空数组表示直接调用) */
	childAgents?: Array<{ id: string; name: string }>;
	/** P3: 派遣模式 (direct / parallel / sequential / hierarchical) */
	dispatchType?: string;
	/** P3: 模型配置(温度等) */
	modelConfig?: { temperature?: number; modelName?: string };
	/** P3: 超时秒数 */
	timeout?: number;
}

interface ChatState {
	addConversation: (conversation: Conversation) => void;
	addDebugLog: (
		conversationId: string,
		content: string,
		type: DebugLog["type"],
		rawData?: unknown,
		source?: DebugLog["source"],
	) => void;
	addMessage: (conversationId: string, message: Message) => void;
	conversations: Conversation[];
	currentConversationId: null | string;
	deleteConversation: (id: string) => void;
	deleteMultiple: (ids: string[]) => void;
	/** 从 SQLite 异步加载会话列表 */
	loadConversations: () => Promise<void>;
	/** 最近访问的会话 ID */
	lastConversationId: string | null;
	/** 提示词快照(发送给 AI 的完整 payload 历史,统一日志"原 提示词"tab 用) */
	promptLogs: PromptLog[];
	/** 正在流式输出的会话 ID，null 表示无流式 */
	streamingConvId: null | string;
	setConversations: (conversations: Conversation[]) => void;
	setCurrentConversation: (id: null | string) => void;
	/** 设置正在流式输出的会话 ID */
	setStreamingConvId: (id: null | string) => void;
	/** 记录一条 prompt 快照 */
	addPromptLog: (log: PromptLog) => void;
	/** 清空 prompt 历史 */
	clearPromptLogs: () => void;
	updateConversation: (id: string, updates: Partial<Conversation>) => void;
	updateConversationContext: (
		id: string,
		context: Conversation["context"],
	) => void;
	updateConversationTokenStats: (
		id: string,
		tokenStats: Conversation["tokenStats"],
	) => void;
	updateMessage: (
		conversationId: string,
		messageId: string,
		updates: Partial<Message>,
	) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
	addConversation: (conversation) => {
		set((state) => {
			const newConversations = [
				{ ...conversation, debugLogs: [] },
				...state.conversations,
			];
			const createPromise = CreateConversation(
				JSON.stringify({
					id: conversation.id,
					agentId: conversation.agentId,
					title: conversation.title || "",
					messages: conversation.messages || [],
					isStarred: conversation.isStarred,
					isArchived: conversation.isArchived,
					createdAt: conversation.createdAt,
					updatedAt: conversation.updatedAt,
					lastMessageAt: conversation.lastMessageAt,
				}),
			).then(
				() => {
					pendingCreateMap.delete(conversation.id);
				},
				(e) => {
					pendingCreateMap.delete(conversation.id);
					devLog.e(LOG, "addConversation CreateConversation failed", {
						id: conversation.id,
						agentId: conversation.agentId,
						err: String(e),
					});
				},
			);
			pendingCreateMap.set(conversation.id, createPromise);
			return { conversations: newConversations };
		});
	},
	addPromptLog: (log) => {
		// 限制最多 50 条,防止内存膨胀(每条可能含大 prompt)
		set((state) => {
			const next = [...state.promptLogs, log];
			const promptLogs = next.length > 50 ? next.slice(-50) : next;
			savePromptLogs(promptLogs);
			return { promptLogs };
		});
	},
	clearPromptLogs: () => {
		savePromptLogs([]);
		set({ promptLogs: [] });
	},
	addDebugLog: (conversationId, content, type, rawData, source) => {
		const log: DebugLog = {
			content,
			rawData,
			source,
			time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
			type,
		};
		// 异步写入 IndexedDB(原 Go LogService 已迁移到 lib/storage/logStore.ts)
		// P1 修复 2026-07-09: 走 safePersist + devLog.e,口径与 SQLite 持久化一致
		safePersist(
			"addDebugLog.writeLog",
			writeLog({
				level:
					type === "request"
						? "info"
						: type === "response"
							? "info"
							: type === "tool"
								? "debug"
								: "info",
				message: content,
				scope: `chat:${type}`,
				timestamp: nowTimestamp(),
			}),
			{ conversationId, type },
		);

		// P3: 委托给独立 debugLogStore,避免触发 conversations 引用变更导致全量重渲染
		// 旧实现会 .map() 整个 conversations 数组(高频调用会阻塞主线程)
		useDebugLogStore.getState().addLog(conversationId, log);
	},
	addMessage: (conversationId, message) => {
		set((state) => {
			const newConversations = state.conversations.map((conv) =>
				conv.id === conversationId
					? {
							...conv,
							lastMessageAt: message.createdAt,
							// 防御性: IDB 历史数据可能含非数组 messages(JSON 未反序列化等)
							messages: [
								...(Array.isArray(conv.messages) ? conv.messages : []),
								message,
							],
							updatedAt: message.createdAt,
						}
					: conv,
			);
			// P1 修复 2026-07-09:
			// 1. 去掉 `!` 强断言,改安全 find (review P1-3)
			// 2. fire-and-forget 但 catch 走 devLog.e
			// 3. P1-4: addConv 与 addMsg 竞态 — await pendingCreateMap
			const target = newConversations.find((c) => c.id === conversationId);
			if (!target) {
				devLog.e(LOG, "addMessage: conv not found in store", {
					conversationId,
				});
				return { conversations: newConversations };
			}
			const persist = (): void => {
				safePersist("addMessage", saveConversationToDbAsync(target), {
					conversationId,
					messageId: message.id,
				});
			};
			const pendingCreate = pendingCreateMap.get(conversationId);
			if (pendingCreate) {
				// 等 in-flight CreateConversation 完成再 saveConv,避免 addConv→addMsg 竞态
				pendingCreate.finally(persist);
			} else {
				persist();
			}
			return { conversations: newConversations };
		});
	},
	conversations: [],

	currentConversationId: null,
	deleteConversation: (id) => {
		set((state) => {
			const newConversations = state.conversations.filter(
				(conv) => conv.id !== id,
			);
			const newLastId =
				state.lastConversationId === id ? null : state.lastConversationId;
			if (newLastId !== state.lastConversationId) {
				persistLastConversationId(newLastId);
			}
			// P1 修复 2026-07-09: .catch(() => {}) → safePersist 走 devLog.e
			safePersist("DeleteConversation", DeleteConversation(id), { id });
			return {
				conversations: newConversations,
				currentConversationId:
					state.currentConversationId === id
						? null
						: state.currentConversationId,
				lastConversationId: newLastId,
			};
		});
		useTodoStore.getState().deleteTodosByConversation(id);
	},
	deleteMultiple: (ids) => {
		const idSet = new Set(ids);
		set((state) => {
			const newConversations = state.conversations.filter(
				(conv) => !idSet.has(conv.id),
			);
			const newCurrentId =
				state.currentConversationId && idSet.has(state.currentConversationId)
					? null
					: state.currentConversationId;
			const newLastId =
				state.lastConversationId && idSet.has(state.lastConversationId)
					? null
					: state.lastConversationId;
			if (newLastId !== state.lastConversationId) {
				persistLastConversationId(newLastId);
			}
			// P1 修复 2026-07-09: .catch(() => {}) → safePersist
			safePersist(
				"DeleteMultipleConversations",
				DeleteMultipleConversations(ids),
				{ count: ids.length },
			);
			return {
				conversations: newConversations,
				currentConversationId: newCurrentId,
				lastConversationId: newLastId,
			};
		});
		ids.forEach((id) => useTodoStore.getState().deleteTodosByConversation(id));
	},
	lastConversationId: loadLastConversationId(),
	// 提示词快照历史(持久化最近 50 条,刷新后可继续查看完整上下文)
	promptLogs: loadPromptLogs(),
	streamingConvId: null,
	setConversations: (conversations) => {
		set({ conversations });
	},
	setCurrentConversation: (id) => {
		if (id) {
			persistLastConversationId(id);
		}
		set({
			currentConversationId: id,
			lastConversationId: id ?? get().lastConversationId,
		});
	},
	setStreamingConvId: (id) => set({ streamingConvId: id }),
	updateConversation: (id, updates) => {
		set((state) => {
			const newConversations = state.conversations.map((conv) =>
				conv.id === id ? { ...conv, ...updates } : conv,
			);
			const updated = newConversations.find((c) => c.id === id);
			// P1 修复 2026-07-09: .catch(() => {}) → safePersist
			if (updated)
				safePersist("updateConversation", saveConversationToDbAsync(updated), {
					id,
				});
			return { conversations: newConversations };
		});
	},
	updateConversationContext: (id, context) => {
		set((state) => {
			const newConversations = state.conversations.map((conv) =>
				conv.id === id
					? { ...conv, context: { ...conv.context, ...context } }
					: conv,
			);
			const updated = newConversations.find((c) => c.id === id);
			// P1 修复 2026-07-09: .catch(() => {}) → safePersist
			if (updated)
				safePersist(
					"updateConversationContext",
					saveConversationToDbAsync(updated),
					{ id },
				);
			return { conversations: newConversations };
		});
	},
	updateConversationTokenStats: (id, tokenStats) => {
		if (!tokenStats) return;
		set((state) => {
			const newConversations = state.conversations.map((conv) => {
				if (conv.id !== id) return conv;
				// 调用方传入的是当前会话累计快照；直接替换，避免第二轮起重复累加。
				const cacheDenominator =
					tokenStats.cacheReadTokens +
					tokenStats.cacheCreationTokens +
					tokenStats.inputTokens;
				return {
					...conv,
					tokenStats: {
						cacheCreationTokens: tokenStats.cacheCreationTokens,
						cacheReadTokens: tokenStats.cacheReadTokens,
						hitRate:
							cacheDenominator > 0
								? tokenStats.cacheReadTokens / cacheDenominator
								: 0,
						inputTokens: tokenStats.inputTokens,
						lastTurnCacheRead: tokenStats.lastTurnCacheRead,
						outputTokens: tokenStats.outputTokens,
						totalCostCny: tokenStats.totalCostCny,
						totalTokens:
							tokenStats.totalTokens ||
							tokenStats.inputTokens +
								tokenStats.outputTokens +
								tokenStats.cacheReadTokens +
								tokenStats.cacheCreationTokens,
					},
				};
			});
			const updated = newConversations.find((c) => c.id === id);
			// P1 修复 2026-07-09: .catch(() => {}) → safePersist
			if (updated)
				safePersist(
					"updateConversationTokenStats",
					saveConversationToDbAsync(updated),
					{ id },
				);
			return { conversations: newConversations };
		});
	},
	updateMessage: (conversationId, messageId, updates) =>
		set((state) => {
			const newConversations = state.conversations.map((conv) =>
				conv.id === conversationId
					? {
							...conv,
							messages: conv.messages.map((msg) =>
								msg.id === messageId ? { ...msg, ...updates } : msg,
							),
						}
					: conv,
			);
			const updated = newConversations.find((c) => c.id === conversationId);
			// P1 修复 2026-07-09: .catch(() => {}) → safePersist
			if (updated)
				safePersist("updateMessage", saveConversationToDbAsync(updated), {
					conversationId,
					messageId,
				});
			return { conversations: newConversations };
		}),
	/** 从 SQLite 异步加载会话列表 */
	loadConversations: async () => {
		const convs = await loadConversationsFromDb();
		const lastId = loadLastConversationId();
		const currentId =
			lastId && convs.some((c) => c.id === lastId) ? lastId : null;
		set({
			conversations: convs,
			currentConversationId: currentId,
			lastConversationId: lastId,
		});
	},
}));

// 应用启动时自动加载
if (typeof window !== "undefined") {
	useChatStore.getState().loadConversations();
}
