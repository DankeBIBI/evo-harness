/**
 * useChatStreaming 主 hook（编排层）
 *
 * 职责：编排 4 个子模块 + 持有跨模块共享的 ref + 暴露对外 API。
 *
 * 子模块：
 *   - streaming/agentRouter.ts        → Agent 路由、children 展开
 *   - streaming/queueManager.ts        → 消息队列 CRUD
 *   - streaming/streamingController.ts → rAF 节流、stuck timer、stop/pause
 *   - streaming/streamingSession.ts    → eventHandler + processToolCalls + sendContinuation
 *
 * 共享 ref 持有原则：
 *   - 跨 ≥ 2 个子模块读写的 ref 必须在主 hook 持有
 *   - 模块内部 ref 自行持有
 */

import type { Prompt } from "@/stores/promptStore";
import type { FileMentionReference } from "./useChatWorkspace";
import type { HistoryMessageInput } from "../lib/chatHistory";
import type { ChatMessage, ToolSchema } from "@/lib/chat/protocol";
import type { QueuedMessage } from "./streaming/queueManager";

import type { ToolResult } from "@/lib/tools/base";
import { useChatStore, type Message } from "@/stores/chatStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSkillStore } from "@/stores/skillStore";
import { StreamChat as streamChatAPI } from "@/lib/hostServices/ChatService";
// P1-1: 原生 function call 需要从 toolRegistry 查 JSON Schema
import { toolRegistry, toolNameAliases } from "@/lib/tools/registry";
import { findSkillByName, serializeSkill } from "@/lib/tools/builtin/skillTools";
import { RESIDENT_TOOLS } from "@/stores/sessionToolStore";
import { EventsOff, EventsOn } from "@/lib/hostServices/eventBus";
import { useCallback, useEffect, useRef, useState } from "react";

import { devLog } from "@/lib/devLog";
import { processContent } from "@/lib/content/processor";
import { estimateTokens } from "@/lib/tokenEstimate";
import { getModelCapabilities } from "@/lib/chat/providers/capabilities";
import { useModelStore } from "@/stores/modelStore";

import {
	buildAgentSummary,
	buildChildAgents,
	parseAgentRoute,
	useEntryAgentResolver,
	type AgentLite,
} from "./streaming/agentRouter";
import { useMessageQueue } from "./streaming/queueManager";
import { useStreamingController } from "./streaming/streamingController";
import { useStreamingSession } from "./streaming/streamingSession";
import {
	createStreamingContext,
	type NativeCallBuf,
} from "./streaming/streamingContext";

const LOG = "chat:streaming";

/**
 * 构建 Skills 摘要（名称+描述+标签），注入 system prompt 供 AI 发现匹配的 skill
 *
 * summaryMode=true: 输出所有 skill 的名称+短描述+标签（类似 Agent 列表格式）
 *                   AI 看到描述后通过原生 function call 调用工具加载完整内容
 */
function buildSkillsSummary(
	skills: Array<{ name: string; description?: string | null; tags?: string[] }>,
): string {
	if (skills.length === 0) return "";
	const parts = skills
		.filter((s) => s.name)
		.map((s) => {
			const desc = s.description || s.tags?.join(", ") || "(无描述)";
			return `- \`${s.name}\`: ${desc.slice(0, 120)}`;
		});
	if (parts.length === 0) return "";
	return `## 可用 Skills\n\n当任务匹配某个 skill 的描述时，调用相应的工具即可加载完整内容。\n\n${parts.join("\n")}`;
}

/** 队列消息结构 — 兼容旧 import 路径 */
export type { QueuedMessage } from "./streaming/queueManager";

export interface UseStreamingOptions {
	addMessage: (convId: string, message: Message) => void;
	/** 当前会话 id（用于切换会话时重置 tokenStats 等会话级状态） */
	currentConvId: null | string;
	availableAgents: AgentLite[];
	buildWorkspaceMessage: (
		userInput: string,
		projectPath: string,
		currentFilePath: string,
		fileMentions?: FileMentionReference[],
		matchedPrompts?: Prompt[],
		conversationHistory?: HistoryMessageInput[],
		modelOptions?: { maxInputTokens?: number; preserveReasoning?: boolean },
	) => Promise<{
		systemContext: string;
		userMessage: string;
		userInputOnly: string;
		historyMessages: ChatMessage[];
	}>;
	currentConversation:
		| undefined
		| { messages: Array<HistoryMessageInput & { id: string }> };
	currentFilePath: string;
	onAgentNodesFinalize?: (isError: boolean) => void;
	onAgentNodesInit?: (
		mainAgent: { children?: string[]; id: string; name: string; role: string },
		availableAgents: Array<{
			category?: string;
			id: string;
			name: string;
			role: string;
			scope?: string;
		}>,
	) => void;
	onAgentExecutionAppend?: (record: any) => void;
	onAgentExecutionBatch?: (records: any[]) => void;
	onAgentExecutionsStart?: (
		parentId: string,
		childIds: string[],
		msgId: string,
	) => void;
	onDebugLog?: (
		content: string,
		type: "log" | "request" | "response",
		rawData?: unknown,
		source?: "child-dispatch" | "continuation" | "user",
	) => void;
	onFeedback?: (message: string) => void;
	onToolCallUpdated?: (update: any) => void;
	onToolCallsDetected?: (
		calls: any,
		ctx: { convId: string; msgId: string },
	) => void;
	projectPath: string;
	selectedAgent: AgentLite | null;
	updateConversationTokenStats: (
		convId: string,
		stats: {
			cacheCreationTokens: number;
			cacheReadTokens: number;
			hitRate: number;
			inputTokens: number;
			lastTurnCacheRead: number;
			outputTokens: number;
			totalCostCny: number;
			totalTokens: number;
		},
	) => void;
	updateMessage: (
		convId: string,
		msgId: string,
		update: Partial<Message>,
	) => void;
}

export function useChatStreaming(options: UseStreamingOptions) {
	const {
		addMessage,
		availableAgents,
		buildWorkspaceMessage,
		currentConvId,
		currentConversation,
		currentFilePath,
		onAgentExecutionAppend,
		onAgentExecutionBatch,
		onAgentExecutionsStart,
		onAgentNodesFinalize,
		onAgentNodesInit,
		onDebugLog,
		onFeedback,
		onToolCallUpdated,
		onToolCallsDetected,
		projectPath,
		selectedAgent,
		updateConversationTokenStats,
		updateMessage,
	} = options;

	const { requestTimeout } = useSettingsStore();

	// === State ===
	const [streamingId, setStreamingId] = useState<null | string>(null);
	const [streamingContent, setStreamingContent] = useState("");
	/** 流式纯 AI 输出（已剥掉后端注入的 <tool_call> XML 包装），供 UnifiedLog "原" tab 流式期间显示 */
	const [streamingRawContent, setStreamingRawContent] = useState("");
	const [isPaused, setIsPaused] = useState(false);
	/** 会话级 token 统计（含缓存命中），与 chatStore.tokenStats 保持同步 */
	const [tokenStats, setTokenStats] = useState({
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
		hitRate: 0,
		inputTokens: 0,
		lastTurnCacheRead: 0,
		outputCostCny: 0,
		outputTokens: 0,
		totalCostCny: 0,
		totalTokens: 0,
	});

	// === 跨模块共享 Ref ===
	const streamingIdRef = useRef<null | string>(null);
	const streamingContentRef = useRef("");
	const isPausedRef = useRef(false);
	/** 原生 tool_call 累积器（跨 chunk 累积，按 index 合并）— 提升到 ctx 供 stop 统一清理 */
	const nativeToolCallsRef = useRef<Map<number, NativeCallBuf>>(new Map());
	/** streamingRawContent rAF 节流句柄 — 提升到 ctx 供 stop 统一取消 */
	const streamingRawRafIdRef = useRef<number | null>(null);
	/** 保存最新的 convId，避免闭包陷阱 */
	const currentConvIdRef = useRef<null | string>(null);
	// P1-2: 记录当前会话的 agentId,handleStop 时传给后端 CancelChat
	const currentAgentIdRef = useRef<null | string>(null);
	const isMountedRef = useRef(true);
	const currentEventNameRef = useRef<null | string>(null);
	const executedToolCallIdsRef = useRef<Set<string>>(new Set());
	const responseTimeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);
	const hasReceivedDataRef = useRef(false);
	/** 上一次发送给 AI 的档位:用于检测档位变化并通知 AI */
	const lastSentToolModeRef = useRef<"auto" | "edit" | "plan">("edit");
	const fullContentRef = useRef("");
	// P3: 纯 AI 输出(不含 tool_result 注入 + sanitize),用于 Message.rawContent
	const originalAiContentRef = useRef("");
	/** 工具调用延续循环：记录待处理的工具调用数量 & 正在等待延续 */
	const pendingToolResultsRef = useRef(0);
	const waitingForContinuationRef = useRef(false);
	/** 工具调用结果累积器（原生 ToolResult[]，不再用 XML 包装） */
	const accumulatedResultsRef = useRef<ToolResult[]>([]);
	/** 延续请求版本号：每次 sendMessage 递增，防止过期的延续被错误执行 */
	const continuationVersionRef = useRef(0);
	/**
	 * 续传句柄：主 hook 持有，controller 和 session 共享同一 ref
	 * - streamingSession 启动一轮时写入 sendContinuation
	 * - streamingController 在 stopStreaming/handleStop 时清空（取消所有待执行延续）
	 */
	const sendContinuationRef = useRef<(() => Promise<void>) | null>(null);

	const clearResponseTimeout = useCallback(() => {
		if (responseTimeoutRef.current) {
			clearTimeout(responseTimeoutRef.current);
			responseTimeoutRef.current = null;
		}
	}, []);

	// === 子模块：队列 ===
	const {
		messageQueue,
		messageQueueRef,
		isProcessingQueueRef,
		enqueueMessage,
		dequeueMessage,
		removeFromQueue,
		reorderQueue,
		clearQueue,
		syncQueue,
	} = useMessageQueue();

	// sendFromQueue 在 sendMessage 之后定义（用 ref 注入 streamingController）
	const sendFromQueueRef = useRef<() => Promise<void>>(async () => {});
	/** onStreamComplete 间接引用（解决 useStreamingSession → processQueueWithConvId 的循环） */
	const onStreamCompleteRef = useRef<
		(ctx: { convId: string; newStats: any }) => void
	>(() => {});

	// === 创建 StreamingContext，收拢所有共享 ref + setter + 回调 ===
	const streamingCtx = createStreamingContext({
		accumulatedResultsRef,
		continuationVersionRef,
		currentAgentIdRef,
		currentConvIdRef,
		currentEventNameRef,
		executedToolCallIdsRef,
		fullContentRef,
		hasReceivedDataRef,
		isMountedRef,
		isPausedRef,
		isProcessingQueueRef,
		lastSentToolModeRef,
		messageQueueRef,
		nativeToolCallsRef,
		originalAiContentRef,
		pendingToolResultsRef,
		responseTimeoutRef,
		sendContinuationRef,
		streamingContentRef,
		streamingIdRef,
		streamingRawRafIdRef,
		waitingForContinuationRef,
		setIsPaused,
		setStreamingContent,
		setStreamingId,
		setStreamingRawContent,
		setTokenStats,
		clearResponseTimeout,
		onFeedback,
		onAgentNodesFinalize,
		scheduleStreamingUpdate: () => {}, // placeholder, 由 controller 回填
		stopStreaming: () => {}, // placeholder
		updateMessage,
		cancelChatOnBackend: (agentId, convId) =>
			import("@/lib/hostServices/ChatService").then((mod) =>
				mod.CancelChat(agentId, convId),
			),
		sendFromQueue: () => sendFromQueueRef.current(),
		dispose: () => {},
	});

	// === 子模块：流式节流控制 ===
	const {
		scheduleStreamingUpdate,
		cancelStreamingRaf,
		stopStreaming,
		handleStop,
		handlePause,
		handleStopAndSend,
	} = useStreamingController(streamingCtx);

	// 回填 ctx 的 scheduleStreamingUpdate / stopStreaming（controller 内部 useCallback 绑定 ctx 后才是最终版本）
	streamingCtx.scheduleStreamingUpdate = scheduleStreamingUpdate;
	streamingCtx.stopStreaming = stopStreaming;

	// === 子模块：流式会话（含 eventHandler / processToolCalls / sendContinuation） ===
	const { startSession, cleanup: cleanupSession } = useStreamingSession(
		streamingCtx,
		{
			onAgentExecutionAppend,
			onAgentExecutionBatch,
			onDebugLog,
			onFirstChunk: () => {
				hasReceivedDataRef.current = true;
				clearResponseTimeout();
			},
			onStreamComplete: (ret) => onStreamCompleteRef.current(ret),
			onToolCallUpdated,
			onToolCallsDetected,
		},
	);

	// === 生命周期 ===
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (currentEventNameRef.current) {
				EventsOff(currentEventNameRef.current);
			}
			if (responseTimeoutRef.current) {
				clearTimeout(responseTimeoutRef.current);
			}
			executedToolCallIdsRef.current.clear();
			cleanupSession();
		};
	}, [cleanupSession]);

	/** 切换会话时恢复该会话累计 tokenStats。 */
	useEffect(() => {
		const persisted = useChatStore
			.getState()
			.conversations.find((conversation) => conversation.id === currentConvId)
			?.tokenStats;
		setTokenStats(persisted ? { ...persisted, outputCostCny: 0 } : {
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			hitRate: 0,
			inputTokens: 0,
			lastTurnCacheRead: 0,
			outputCostCny: 0,
			outputTokens: 0,
			totalCostCny: 0,
			totalTokens: 0,
		});
	}, [currentConvId]);

	/** B1 (2026-09-06): 切换会话时停止当前流式
	 *  修复: 旧实现切会话不调 handleStop,流式在后台继续,新会话会看到旧会话的
	 *        "幽灵"流式气泡(streamingContent 是 hook 级 state,与会话无关)
	 *  用 prevConvIdRef 守卫,仅真正切换时触发;handleStop 内部有 EventsOff + 状态清理
	 *  2026-09-06 复审: ① 同时调用 cancelChatOnBackend 取消后端流,避免旧会话继续
	 *        消耗 token / 产生文件副作用;② 用 handleStopRef 间接调用,让 effect 只依赖
	 *        currentConvId(handleStop 依赖未 memoize 的 ctx,直接依赖会每帧重跑) */
	const handleStopRef = useRef(handleStop);
	handleStopRef.current = handleStop;
	const prevConvIdRef = useRef(currentConvId);
	useEffect(() => {
		if (prevConvIdRef.current === currentConvId) return;
		prevConvIdRef.current = currentConvId;
		if (streamingIdRef.current) {
			// 取消后端流: currentAgentIdRef / currentConvIdRef 仍是旧会话的值(切换后未发新消息)
			if (
				streamingCtx.cancelChatOnBackend &&
				currentAgentIdRef.current &&
				currentConvIdRef.current
			) {
				void streamingCtx.cancelChatOnBackend(
					currentAgentIdRef.current,
					currentConvIdRef.current,
				);
			}
			handleStopRef.current();
		}
	}, [currentConvId]);

	/** 同步 streamingIdRef */
	useEffect(() => {
		streamingIdRef.current = streamingId;
	}, [streamingId]);

	// === Agent 路由 ===
	const resolveEntryAgent = useEntryAgentResolver(
		availableAgents,
		selectedAgent,
	);

	// === sendMessage 主入口 ===
	const sendMessage = useCallback(
		async (queuedMessage: QueuedMessage, convId: string) => {
			if (isProcessingQueueRef.current) {
				devLog.w(LOG, "sendMessage 跳过: 队列正在处理中");
				return;
			}
			devLog.i(LOG, "sendMessage start", {
				convId,
				input: queuedMessage.input,
			});

			const {
				fileMentions,
				input: nextInput,
				skillMentions = [],
			} = queuedMessage;

			// --- 档位变化通知 ---
			const toolMode = useSettingsStore.getState().toolMode;
			let toolModeChangeHint = "";
			if (lastSentToolModeRef.current !== toolMode) {
				toolModeChangeHint = `\n\n---\n⚠️ 系统通知（仅本次可见）: 用户已将 AI 工具权限从「${lastSentToolModeRef.current}」档切换为「${toolMode}」档。请根据新档位调整后续行为。\n---`;
				lastSentToolModeRef.current = toolMode;
			}
			const inputWithHint = nextInput + toolModeChangeHint;

			// --- 统一任务入口路由 ---
			let { entryAgent, extraChildren, routed } = resolveEntryAgent(nextInput);
			if (!entryAgent?.id) {
				onFeedback?.("未找到可用的 Agent，请先配置 Agent");
				return;
			}

			// --- @agentName 路由 ---
			const agentRoute = parseAgentRoute(nextInput, availableAgents);
			if (agentRoute.targetAgent) {
				const prevEntryName = entryAgent.name;
				entryAgent = agentRoute.targetAgent;
				extraChildren = undefined;
				const userInputForMessage = agentRoute.cleanedText;
				if (!userInputForMessage) {
					onFeedback?.(
						`已切换至「${agentRoute.targetAgent.name}」，请输入消息内容`,
					);
					return;
				}
				if (agentRoute.targetAgent.name !== prevEntryName) {
					onFeedback?.(`🎯 已路由到「${agentRoute.targetAgent.name}」`);
				}
				routed = false;
			} else if (routed) {
				onFeedback?.(`🧭 已自动路由到「${entryAgent.name}」作为任务入口`);
			}

			// 彻底取消任何待执行的延续请求
			waitingForContinuationRef.current = false;
			continuationVersionRef.current++;

			isProcessingQueueRef.current = true;

			// 重置所有流式状态
			streamingContentRef.current = "";
			fullContentRef.current = "";
			originalAiContentRef.current = "";
			executedToolCallIdsRef.current.clear();
			accumulatedResultsRef.current = [];
			pendingToolResultsRef.current = 0;
			setStreamingContent("");
			setStreamingRawContent("");

			currentConvIdRef.current = convId;
			// P1-2: 记录当前 agentId 给 handleStop 时用
			currentAgentIdRef.current = entryAgent?.id ?? null;

			const inputTokens = estimateTokens(inputWithHint);
			const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}-user`;
			const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}-assistant`;
			addMessage(convId, {
				content: nextInput,
				createdAt: new Date().toISOString(),
				id: userMsgId,
				referencedFiles: [...new Set(fileMentions.map((mention) => mention.path).filter(Boolean))],
				role: "user",
			});
			addMessage(convId, {
				content: "",
				createdAt: new Date().toISOString(),
				id: assistantMsgId,
				role: "assistant",
			});

			setStreamingId(assistantMsgId);
			streamingIdRef.current = assistantMsgId;
			setStreamingContent("");
			setIsPaused(false);
			isPausedRef.current = false;

			if (currentEventNameRef.current) {
				EventsOff(currentEventNameRef.current);
				currentEventNameRef.current = null;
			}

			// 排除刚添加的两条
			const historyMessages = currentConversation?.messages.filter(
				(m) => m.id !== userMsgId && m.id !== assistantMsgId,
			);

			try {
				const {
					historyMessages: historyChatMessages,
					systemContext,
					userInputOnly,
					userMessage: rawUserInput,
				} = await buildWorkspaceMessage(
					inputWithHint,
					projectPath,
					currentFilePath,
					fileMentions,
					undefined,
					historyMessages,
					(() => {
						const selected = useModelStore.getState().models.find(
							(model) => model.id === (entryAgent?.modelId || useModelStore.getState().selectedModelId),
						);
						if (!selected) return undefined;
						return {
							maxInputTokens: selected.maxInputTokens,
							preserveReasoning: getModelCapabilities(selected).preserveReasoningInHistory,
						};
					})(),
				);
				devLog.d(LOG, "buildWorkspaceMessage done", {
					historyLen: historyChatMessages.length,
					systemLen: systemContext.length,
					rawInputLen: rawUserInput.length,
				});
				// 2026-08-19 重构:按 OpenAI / Anthropic 官方协议,历史轮次走 messages 数组
				// 替代旧的"⚠️ 对话历史 + 字符串拼接"做法
				// 官方依据:
				//   - OpenAI: "store the transcript and send the accumulated `messages` array on each request"
				//   - Anthropic: "you always send the full conversational history to the API"
				// 统一内容入口: 对当前请求做 normalize + sanitize + chips 解析(纯函数,不改原文)
				// 历史段由 buildWorkspaceMessage 走结构化 messages 数组,这里只处理纯当前 user 输入
				const processed = processContent(rawUserInput, {
					agentId: entryAgent?.id ?? "",
					convId,
					mode:
						toolMode === "plan"
							? "plan"
							: toolMode === "edit"
								? "edit"
								: "auto",
				});
				const userMessage = processed.composed;
				const eventName = `chat-stream-${convId}-${assistantMsgId}`;
				currentEventNameRef.current = eventName;
				hasReceivedDataRef.current = false;

				// --- 若 extraChildren 非空：叠加 children ---
				const effectiveEntry: AgentLite = extraChildren?.length
					? {
							...entryAgent!,
							children: [...(entryAgent!.children ?? []), ...extraChildren],
						}
					: entryAgent!;

				const hasChildren = (effectiveEntry.children?.length ?? 0) > 0;
				const collaborationMode =
					effectiveEntry.collaborationMode ??
					(effectiveEntry.category === "orchestration" || hasChildren
						? "hierarchical"
						: "direct");

				const roleText =
					effectiveEntry.role +
					buildAgentSummary(availableAgents, effectiveEntry.name);
				// P0-1: systemContext(项目路径/工具说明/铁律/提示词)拼进 system prompt
				// → 跨轮稳定 → cache 命中
				// 前端拼接 skills 摘要（名称+描述+标签），与 Agent 列表一起注入 system prompt
				const skillsSummary = buildSkillsSummary(
					useSkillStore.getState().skills,
				);
				// 用户通过 /skill-name 明确选择的 Skill 直接注入完整正文；
				// 未显式选择的 Skill 仍可通过常驻 LoadSkill(name) 按需加载。
				const selectedSkillsContext = skillMentions
					.map((name) => findSkillByName(name))
					.filter((skill): skill is NonNullable<typeof skill> => !!skill)
					.map(serializeSkill)
					.join("\n\n");
				const staticRole = [roleText, skillsSummary].filter(Boolean).join("\n\n");
				const dynamicContext = [
					systemContext,
					selectedSkillsContext
						? `## 本轮已选择 Skills\n\n${selectedSkillsContext}`
						: "",
				]
					.filter(Boolean)
					.join("\n\n");
				const fullRole = [staticRole, dynamicContext].filter(Boolean).join("\n\n");
				// 常驻工具单一来源(sessionToolStore.RESIDENT_TOOLS):
				// 文件 8(含 ReadFileRange) + Todo 8 + 元工具/plan/交互 4
				const effectiveTools = [
					...new Set([...(effectiveEntry.tools || []), ...RESIDENT_TOOLS]),
				];

				// P1-1: 工具名 → JSON Schema 转换
				// effectiveTools 是 canonical 名数组 ['ReadFile', 'WriteFile', ...]
				// 查 toolRegistry 拿到每个 tool 的 params (ParamSchema) + description
				// 统一转成后端需要的 ToolSchema[]
				const toolSchemas: ToolSchema[] = effectiveTools
					.map((toolName): ToolSchema | null => {
						const realName = toolNameAliases[toolName] || toolName;
						const tool = toolRegistry.get(realName);
						if (!tool) return null;
						return {
							description: tool.description,
							name: tool.name,
							parameters: tool.params,
						};
					})
					.filter((s): s is ToolSchema => s !== null);

				const chatRequest = {
					agentId: effectiveEntry.id,
					agentName: effectiveEntry.name,
					childAgents: buildChildAgents(
						effectiveEntry,
						userInputOnly,
						availableAgents,
					),
					collaborationMode,
					convId,
					dispatchType: hasChildren ? "hierarchical" : "direct",
					eventName,
					history: historyChatMessages,
					message: userMessage,
					modelConfig: effectiveEntry.modelConfig ?? { temperature: 0.7 },
					modelId: effectiveEntry.modelId || "",
					parentAgentId: "",
					role: fullRole,
					systemStatic: staticRole,
					systemContext: dynamicContext,
					toolMode: useSettingsStore.getState().toolMode,
					timeout: requestTimeout,
					tools: effectiveTools,
					toolsSchema: toolSchemas,
				} as StreamChatRequestLike;

				useChatStore.getState().addPromptLog({
					agentId: effectiveEntry.id,
					agentName: effectiveEntry.name,
					childAgents: hasChildren
						? effectiveEntry.children?.map((cid) => {
								const a = availableAgents.find((x) => x.id === cid);
								return a ? { id: a.id, name: a.name } : { id: cid, name: cid };
							})
						: undefined,
					conversationId: convId,
					createdAt: new Date().toISOString(),
					dispatchType: hasChildren ? "hierarchical" : "direct",
					fileMentions: fileMentions.map((f) => ({
						path: f.path,
						token: f.token,
					})),
					id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
					matchedPrompts: undefined,
					modelConfig: {
						modelName: effectiveEntry.modelId || "",
						temperature:
							typeof effectiveEntry.modelConfig?.temperature === "number"
								? effectiveEntry.modelConfig.temperature
								: undefined,
					},
					skillMentions,
					system: chatRequest.role ?? "",
					timeout: requestTimeout,
					toolMode: useSettingsStore.getState().toolMode,
					tools: effectiveTools,
					totalLength:
						(chatRequest.role?.length ?? 0) +
						(chatRequest.message?.length ?? 0),
					user: chatRequest.message ?? "",
				});

				if (effectiveEntry.children?.length) {
					onAgentNodesInit?.(
						{
							id: effectiveEntry.id,
							name: effectiveEntry.name,
							role: effectiveEntry.role,
							children: effectiveEntry.children,
						},
						availableAgents.map((a) => ({
							id: a.id,
							name: a.name,
							role: a.role,
						})),
					);
					onAgentExecutionsStart?.(
						effectiveEntry.id,
						effectiveEntry.children,
						assistantMsgId,
					);
				}

				// userInputOnly 用于续传 user 消息:剥离一次性 toolModeChangeHint,保证纯用户内容(协议标准)
				const pureUserInput = toolModeChangeHint
					? userInputOnly.replace(toolModeChangeHint, "")
					: userInputOnly;

				// 启动会话，拿到 eventHandler
				const eventHandler = startSession({
					assistantMsgId,
					chatRequest,
					convId,
					eventName,
					inputTokens,
					nextInput,
					userInputOnly: pureUserInput,
					routed,
				});

				EventsOn(eventName, eventHandler);

				// 响应超时
				const timeoutMs = requestTimeout > 0 ? requestTimeout * 1000 : Infinity;
				if (timeoutMs !== Infinity) {
					responseTimeoutRef.current = setTimeout(() => {
						if (!isMountedRef.current) return;
						if (!hasReceivedDataRef.current) {
							const errorContent = "响应超时，请检查服务状态后重试";
							setStreamingContent(errorContent);
							streamingContentRef.current = errorContent;
							updateMessage(convId, assistantMsgId, { content: errorContent });
							onAgentNodesFinalize?.(true);
							stopStreaming();
							onFeedback?.(errorContent);
						}
					}, timeoutMs);
				}

				devLog.i(LOG, "streamChatAPI call", {
					eventName,
					agentId: chatRequest.agentId,
					agentName: chatRequest.agentName,
				});
				// P-log: 前端发 tab 数据源 — 把每次提交给后端的完整 chatRequest 原封不动落库
				// 摘要写 content（便于折叠 header 展示），完整 payload 写 rawData（展开 body 用）
				const skillsCount =
					(chatRequest as unknown as { skills?: unknown[] }).skills?.length ??
					0;
				const messagePreview = chatRequest.message?.slice(0, 40) ?? "";
				onDebugLog?.(
					`${chatRequest.agentName ?? chatRequest.agentId} · ${chatRequest.modelId ?? "?"} · ${messagePreview}${chatRequest.message && chatRequest.message.length > 40 ? "…" : ""} · skills=${skillsCount}`,
					"request",
					chatRequest,
					"user",
				);
				streamChatAPI(chatRequest).catch((error) => {
					if (!isMountedRef.current) return;
					devLog.e(LOG, "streamChatAPI failed", { error: String(error) });
					clearResponseTimeout();
					const errorContent = fullContentRef.current
						? `${fullContentRef.current}\n\n错误: ${error}`
						: `错误: ${error}`;
					streamingContentRef.current = errorContent;
					setStreamingContent(errorContent);
					updateMessage(convId, assistantMsgId, { content: errorContent });
					onAgentNodesFinalize?.(true);
					stopStreaming();
					onFeedback?.("消息发送失败，请稍后重试");
					onDebugLog?.(`ERROR: ${error}`, "log");
				});
			} catch (error) {
				if (!isMountedRef.current) return;
				devLog.e(LOG, "sendMessage outer catch", { error: String(error) });
				clearResponseTimeout();
				const errorContent = `错误: ${error instanceof Error ? error.message : String(error)}`;
				updateMessage(convId, assistantMsgId, { content: errorContent });
				stopStreaming();
				onFeedback?.("消息发送失败，请稍后重试");
			}
		},
		[
			selectedAgent,
			buildWorkspaceMessage,
			addMessage,
			updateMessage,
			onAgentNodesInit,
			onAgentNodesFinalize,
			onAgentExecutionsStart,
			onDebugLog,
			onFeedback,
			clearResponseTimeout,
			stopStreaming,
			resolveEntryAgent,
			requestTimeout,
			currentConversation,
			projectPath,
			currentFilePath,
			availableAgents,
			setIsPaused,
			setStreamingContent,
			setStreamingRawContent,
			setStreamingId,
			streamingIdRef,
			startSession,
		],
	);

	// === 处理队列 ===
	const processQueueWithConvId = useCallback(
		async (_convId: string) => {
			if (isProcessingQueueRef.current || messageQueueRef.current.length === 0)
				return;
			const nextInput = dequeueMessage();
			if (!nextInput) return;
			// 使用队列消息自带的 convId，而非当前活跃会话
			await sendMessage(nextInput, nextInput.convId || _convId);
		},
		[dequeueMessage, sendMessage],
	);

	// 绑定 onStreamComplete（在 processQueueWithConvId 之后，确保闭包能拿到最新值）
	onStreamCompleteRef.current = ({ convId, newStats }) => {
		updateConversationTokenStats(convId, newStats);
		const hasQueue = messageQueueRef.current.length > 0;
		if (hasQueue) {
			onFeedback?.(
				`回复完成，自动执行队列最早一条（剩余 ${messageQueueRef.current.length} 条）`,
			);
		}
		// 会话完成时只要队列非空就自动消费最早一条
		if (hasQueue && currentConvIdRef.current) {
			const conv = currentConvIdRef.current;
			// 用 requestIdleCallback 替代 setTimeout，避免与 React 渲染竞争
			if (typeof requestIdleCallback !== "undefined") {
				requestIdleCallback(
					() => {
						if (currentConvIdRef.current === conv) processQueueWithConvId(conv);
					},
					{ timeout: 500 },
				);
			} else {
				setTimeout(() => {
					if (currentConvIdRef.current === conv) processQueueWithConvId(conv);
				}, 100);
			}
		}
	};

	const handleSend = useCallback(
		async (
			input: string,
			convId: string,
			fileMentions: FileMentionReference[] = [],
			skillMentions: string[] = [],
		) => {
			if (!input.trim()) return;
			const nextInput = input;

			currentConvIdRef.current = convId;

			if (waitingForContinuationRef.current || streamingIdRef.current) {
				handleStop();
				await new Promise((r) => setTimeout(r, 100));
				await sendMessage(
					{ convId, fileMentions, input: nextInput, skillMentions },
					convId,
				);
				return;
			}

			await sendMessage(
				{ convId, fileMentions, input: nextInput, skillMentions },
				convId,
			);
		},
		[sendMessage, handleStop],
	);

	/** 立即发送队列中指定索引的消息 */
	const sendFromQueue = useCallback(
		async (index: number = 0) => {
			if (isProcessingQueueRef.current) return;
			if (index < 0 || index >= messageQueueRef.current.length) return;
			const target = messageQueueRef.current[index];
			const nextQueue = messageQueueRef.current.filter((_, i) => i !== index);
			syncQueue(nextQueue);
			if (streamingIdRef.current) {
				handleStop();
				await new Promise((r) => setTimeout(r, 100));
			}
			if (currentConvIdRef.current) {
				await sendMessage(target, currentConvIdRef.current);
			}
		},
		[syncQueue, sendMessage, handleStop],
	);

	sendFromQueueRef.current = sendFromQueue;

	return {
		clearQueue,
		enqueueMessage,
		handlePause,
		handleSend,
		handleStop,
		handleStopAndSend,
		isPaused,
		messageQueue,
		removeFromQueue,
		reorderQueue,
		sendFromQueue,
		setStreamingContent,
		setStreamingRawContent,
		stopStreaming,
		streamingContent,
		streamingRawContent,
		streamingId,
		tokenStats,
	};
}
