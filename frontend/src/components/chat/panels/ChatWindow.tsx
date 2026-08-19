import type { LucideIcon } from "lucide-react";

import { AgentOrchestrationGraph } from "@/components/agent/AgentOrchestrationGraph";
import {
	CodeReviewPanel,
	type FileChange,
} from "@/components/editor/CodeReviewPanel";
import { CodeDiffViewer } from "@/components/file/CodeDiffViewer";
import { useAgentStore } from "@/stores/agentStore";
import { Message, useChatStore } from "@/stores/chatStore";
import type { ToolCall } from "@/stores/chatStore";
import type { FileMentionReference } from "@/components/chat/hooks/useChatWorkspace";
import { useModelStore } from "@/stores/modelStore";
import { usePromptStore } from "@/stores/promptStore";
import { useSkillStore } from "@/stores/skillStore";
import { selectProject, loadRootName } from "@/lib/fs/project-file-service";
import { useToolPermissionStore } from "@/stores/toolPermissionStore";
import {
	Bot,
	Check,
	GitBranch,
	MessageSquare,
	RotateCcw,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AgentSelectDialog } from "@/components/chat/dialogs/AgentSelectDialog";
import { ChatInput } from "@/components/chat/inputs/ChatInput";
import { ChatLayout, ChatMessagesArea } from "../layout";
import { DebugLogPanel } from "@/components/chat/panels/DebugLogPanel";
import PlanStageCard from "@/components/chat/messages/PlanStageCard";
import { ModelSelectDialog } from "@/components/chat/dialogs/ModelSelectDialog";
import { useLayoutStore } from "@/stores/layoutStore";
import { SkillSelectDialog } from "@/components/chat/dialogs/SkillSelectDialog";
import { ToolGrantDialog } from "@/components/chat/dialogs/ToolGrantDialog";
import { ToolSelectDialog } from "@/components/chat/dialogs/ToolSelectDialog";
import { UnifiedLogDialog } from "../UnifiedLogDialog";
import {
	ChatSessionProvider,
	useChatCodeApply,
	useChatDebug,
	useFileChangesPanel,
	useChatOrchestration,
	useChatProject,
	useChatStreaming,
	useChatWorkspace,
} from "../hooks";
import {
	createChatFeedbackId,
	partitionExpiredFeedback,
	type ChatFeedbackItem,
} from "@/components/chat/lib/chatFeedback";
import { setModelConfig, setToolPermissionChecker } from "@/lib/tools/registry";
interface ChatAgent {
	category: string;
	children?: string[];
	collaborationMode?: "hierarchical" | "parallel" | "sequential";
	description: string;
	icon: LucideIcon;
	id: string;
	modelConfig?: {
		frequencyPenalty?: number;
		maxTokens?: number;
		presencePenalty?: number;
		stop?: string[];
		temperature: number;
		topP?: number;
	};
	modelId: string;
	name: string;
	role: string;
	skills: string[];
	tools: string[];
}

const fallbackAgents: ChatAgent[] = [
	{
		category: "orchestration",
		collaborationMode: "hierarchical",
		description: "统一任务入口：自动鉴别/拆解/委派下层 Agent",
		icon: GitBranch,
		id: "0",
		modelId: "",
		name: "workflow",
		role: "你是统一任务入口（workflow）。\n收到任何任务后第一步必须鉴别任务类型，对复杂/多步任务可拆解为子任务并通过 hierarchical 模式派遣下层 Agent。",
		skills: [],
		tools: [],
	},
	{
		category: "general",
		description: "多用途对话助手",
		icon: Bot,
		id: "1",
		modelId: "",
		name: "通用助手",
		role: "你是一个多用途对话助手",
		skills: [],
		tools: [
			"ReadFile",
			"WriteFile",
			"ReplaceInFile",
			"ReplaceInFileRegex",
			"SearchFiles",
			"ListDir",
			"DeleteFile",
		],
	},
	{
		category: "coding",
		description: "代码生成与审查",
		icon: Sparkles,
		id: "2",
		modelId: "",
		name: "代码助手",
		role: "你是一个专业的代码助手，擅长代码生成、审查和优化",
		skills: [],
		tools: [
			"ReadFile",
			"WriteFile",
			"ReplaceInFile",
			"ReplaceInFileRegex",
			"SearchFiles",
			"ListDir",
			"DeleteFile",
		],
	},
	{
		category: "translation",
		description: "多语言翻译",
		icon: MessageSquare,
		id: "3",
		modelId: "",
		name: "翻译专家",
		role: "你是一个专业的翻译专家",
		skills: [],
		tools: [
			"ReadFile",
			"WriteFile",
			"ReplaceInFile",
			"ReplaceInFileRegex",
			"SearchFiles",
			"ListDir",
			"DeleteFile",
		],
	},
];

/** 基础文件工具：保证“读完文件后继续写入”链路完整 */
const BASIC_FILE_TOOLS = [
	"ReadFile",
	"WriteFile",
	"ReplaceInFile",
	"ReplaceInFileRegex",
	"SearchFiles",
	"ListDir",
	"DeleteFile",
];

function ChatWindowImpl() {
	const [searchParams] = useSearchParams();

	const [showAgentDialog, setShowAgentDialog] = useState(false);
	const [showSkillDialog, setShowSkillDialog] = useState(false);
	const [showModelDialog, setShowModelDialog] = useState(false);
	const [showTodo, setShowTodo] = useState(true);
	const [showToolDialog, setShowToolDialog] = useState(false);
	const [showToolGrantDialog, setShowToolGrantDialog] = useState(false);
	const [showFileMention, setShowFileMention] = useState(false);
	// (2026-08-18) 统一日志状态从 layoutStore 读,与顶栏按钮共享
	const showUnifiedLog = useLayoutStore((s) => s.unifiedLogOpen);
	const [chatFeedback, setChatFeedback] = useState<ChatFeedbackItem[]>([]);

	/** 推入一条新反馈；超过 CHAT_FEEDBACK_TIMEOUT_MS 自动消失 */
	const addChatFeedback = useCallback((text: string) => {
		setChatFeedback((prev) => [
			...prev,
			{ createdAt: Date.now(), id: createChatFeedbackId(), text },
		]);
	}, []);

	/** 手动关闭单条 */
	const removeChatFeedback = useCallback((id: string) => {
		setChatFeedback((prev) => prev.filter((item) => item.id !== id));
	}, []);

	/** 清空全部（发送新消息时调用） */
	const clearChatFeedback = useCallback(() => {
		setChatFeedback([]);
	}, []);

	/** 定时清理超时反馈（每 500ms 检查一次） */
	useEffect(() => {
		if (chatFeedback.length === 0) return;
		const timer = window.setInterval(() => {
			setChatFeedback((prev) => {
				const { active } = partitionExpiredFeedback(prev);
				return active.length === prev.length ? prev : active;
			});
		}, 500);
		return () => window.clearInterval(timer);
	}, [chatFeedback.length]);

	const [showCodeReviewPanel, setShowCodeReviewPanel] = useState(false);
	const [input, setInput] = useState("");

	const { agents, fetchAgents, selectAgent, selectedAgentId } = useAgentStore();
	const { fetchModels, models, selectedModelId, selectModel } = useModelStore();
	const {
		addConversation,
		addMessage,
		conversations,
		currentConversationId,
		setCurrentConversation,
		updateConversation,
		updateConversationContext,
		updateConversationTokenStats,
		updateMessage,
	} = useChatStore();

	const storeAddDebugLog = useChatStore((s) => s.addDebugLog);
	const { currentFilePath, projectPath, setCurrentFilePath, setProjectPath } =
		useChatProject();
	const { clearDebugLogs, debugLogs, showDebugLog, toggleDebugLog } =
		useChatDebug(currentConversationId);
	const {
		agentExecutions,
		agentNodes,
		appendExecution,
		appendExecutions,
		finalizeAgentNodes,
		initAgentNodes,
		showOrchestration,
		startChildExecutions,
		toggleOrchestration,
	} = useChatOrchestration();

	const {
		applyCodeChanges,
		autoApplyFileChanges,
		confirmAllCodeChanges,
		getPendingChangesCount,
		pendingCodeChange,
		setPendingCodeChange,
		skipCodeChange,
		toggleAutoApply,
	} = useChatCodeApply();

	// P1-2 (2026-07-10): 文件变更面板 —— 状态/回调抽到 hook, 渲染挂在右栏"变更"tab
	// setPendingCodeChange 签名 (PendingCodeChange | null) => void 兼容 OpenDiffPayload, 直接透传避免 useCallback 缓存失效
	const {
		changes: reviewChanges,
		expanded: fileChangesExpanded,
		onDiscard: handleDiscardFileChange,
		onDiscardAll: handleDiscardAllFileChanges,
		onExpandedChange: setFileChangesExpanded,
		onKeep: handleKeepFileChange,
		onKeepAll: handleKeepAllFileChanges,
		onOpenDiff: handleOpenDiffChange,
		setReviewChanges,
	} = useFileChangesPanel({
		onFeedback: addChatFeedback,
		onOpenDiff: setPendingCodeChange,
	});

	const { buildWorkspaceMessage } = useChatWorkspace();

	const lastAppliedContentRef = useRef("");
	const lastProjectPathRef = useRef(projectPath);
	// 工具调用起始时间记录(msg.toolCalls 没有 startTime 字段,用 ref 算 duration)
	const toolStartMsRef = useRef<Map<string, number>>(new Map());
	/**
	 * 2026-07-06 P1-2: 工具调用预执行期缓存原文件内容,供"丢弃"时写回
	 * 原因: 工具成功调 onToolCallUpdated 时, WriteFile/ReplaceInFile 已完成,
	 *       此时 ReadFile 拿到的已是新内容; 必须 in onToolCallsDetected (pre-execute) 阶段缓存
	 * 限定: 仅 WriteFile / ReplaceInFile / ReplaceInFileRegex 需要缓存(读类工具不需要)
	 */
	const toolOriginalContentRef = useRef<Map<string, string>>(new Map());
	/** 当前消息的工具调用带来的 file change 是否已合并到 reviewChanges (去重用) */
	const reviewedToolCallIdsRef = useRef<Set<string>>(new Set());
	const { getMatchedPrompts } = usePromptStore();
	const { fetchSkills } = useSkillStore();
	const setRightSidebarVisible = useLayoutStore(
		(s) => s.setRightSidebarVisible,
	);
	// (2026-08-18) 统一日志弹窗 actions
	const toggleUnifiedLog = useLayoutStore((s) => s.toggleUnifiedLog);
	const openUnifiedLog = useLayoutStore((s) => s.openUnifiedLog);
	const closeUnifiedLog = useLayoutStore((s) => s.closeUnifiedLog);

	const handleSelectFileMention = useCallback(
		(path: string) => {
			setCurrentFilePath(path);
		},
		[setCurrentFilePath],
	);

	const matchedPrompts = useMemo(
		() => getMatchedPrompts(projectPath, currentFilePath),
		[projectPath, currentFilePath, getMatchedPrompts],
	);

	const selectedModel = useMemo(() => {
		if (selectedModelId) {
			return models.find((model) => model.id === selectedModelId) ?? null;
		}

		if (models.length > 0) {
			return models[0];
		}

		return null;
	}, [models, selectedModelId]);

	const currentConversation = conversations.find(
		(conversation) => conversation.id === currentConversationId,
	);
	const hasMessages = !!(
		currentConversation && currentConversation.messages.length > 0
	);

	const availableAgents: ChatAgent[] = useMemo(
		() =>
			agents.length > 0
				? agents.map((agent) => ({
						category: agent.category,
						children: agent.children || [],
						collaborationMode: agent.collaborationMode,
						description: agent.description || agent.role,
						icon: Bot,
						id: agent.id,
						modelConfig: agent.modelConfig,
						modelId: agent.modelId || "",
						name: agent.name,
						role: agent.role || "",
						skills: agent.skills || [],
						// 确保已有部分工具时也补齐基础文件写入链路
						tools: [...new Set([...(agent.tools || []), ...BASIC_FILE_TOOLS])],
					}))
				: fallbackAgents,
		[agents],
	);

	// 关键:每个对话记忆自己的 agent(优先 per-conv,fallback 到全局)
	const convAgentId = useAgentStore
		.getState()
		.getAgentForConv(currentConversationId);
	const selectedAgent =
		availableAgents.find((agent) => agent.id === convAgentId) ||
		availableAgents.find((agent) => agent.id === selectedAgentId) ||
		availableAgents.find(
			(agent) => agent.id === (searchParams.get("agentId") ?? ""),
		) ||
		availableAgents[0];

	useEffect(() => {
		fetchModels();
		fetchAgents();
	}, [fetchAgents, fetchModels]);

	useEffect(() => {
		fetchSkills();
	}, [fetchSkills]);

	useEffect(() => {
		if (!selectedModel) return;

		setModelConfig({
			provider: selectedModel.provider,
			supportsStreaming: selectedModel.supportsStreaming,
			supportsToolCall: selectedModel.supportsToolCall,
			supportsVision: selectedModel.supportsVision,
		});
	}, [selectedModel]);

	const { getPermission } = useToolPermissionStore();
	useEffect(() => {
		setToolPermissionChecker(getPermission);
	}, [getPermission]);

	useEffect(() => {
		const agentId = searchParams.get("agentId");

		if (!agentId) {
			if (!selectedAgentId && availableAgents[0]) {
				selectAgent(availableAgents[0].id);
			}
			return;
		}

		const matchedAgent = availableAgents.find((agent) => agent.id === agentId);
		if (matchedAgent && selectedAgentId !== matchedAgent.id) {
			selectAgent(matchedAgent.id);
		}
	}, [availableAgents, searchParams, selectAgent, selectedAgentId]);

	useEffect(() => {
		if (!currentConversationId) return;

		updateConversationContext(currentConversationId, {
			currentFilePath: currentFilePath || undefined,
			modelId: selectedModelId || undefined,
			projectPath: projectPath || undefined,
		});
	}, [
		currentConversationId,
		currentFilePath,
		projectPath,
		selectedModelId,
		updateConversationContext,
	]);

	const {
		clearQueue,
		enqueueMessage,
		handlePause,
		handleSend: streamingHandleSend,
		handleStop,
		handleStopAndSend,
		isPaused,
		messageQueue,
		removeFromQueue,
		reorderQueue,
		sendFromQueue,
		streamingContent,
		streamingRawContent,
		streamingId,
		tokenStats,
	} = useChatStreaming({
		addMessage: (convId, msg) => addMessage(convId, msg as Message),
		currentConvId: currentConversation?.id ?? null,
		availableAgents,
		buildWorkspaceMessage: (
			content,
			pPath,
			cFilePath,
			fileMentionsSnapshot,
			mPrompts,
			history,
		) =>
			buildWorkspaceMessage(
				content,
				pPath,
				cFilePath,
				fileMentionsSnapshot ?? [],
				mPrompts,
				history,
			),
		currentConversation,
		currentFilePath,
		onAgentExecutionAppend: appendExecution,
		onAgentExecutionBatch: appendExecutions,
		onAgentExecutionsStart: startChildExecutions,
		onAgentNodesFinalize: finalizeAgentNodes,
		onAgentNodesInit: (mainAgent, agentsSnapshot) =>
			initAgentNodes(mainAgent, agentsSnapshot),
		onDebugLog: (content, type, rawData, source) => {
			if (currentConversationId) {
				storeAddDebugLog(currentConversationId, content, type, rawData, source);
			}
		},
		onFeedback: addChatFeedback,
		onToolCallsDetected: (calls, ctx) => {
			if (!currentConversationId || !ctx.msgId) return;
			// P1-2 修复: 用 useChatStore.getState() 拿最新 store,避免闭包过期
			const curConv = useChatStore
				.getState()
				.conversations.find((c) => c.id === currentConversationId);
			const cur = curConv?.messages.find((m) => m.id === ctx.msgId);
			const existing = cur?.toolCalls ?? [];
			const map = new Map<string, ToolCall>();
			existing.forEach((tc) => map.set(tc.id, tc));
			for (const c of calls) {
				const prev = map.get(c.id);
				if (prev) {
					map.set(c.id, {
						...prev,
						input: c.input ?? prev.input,
						toolName: c.name || prev.toolName,
					});
				} else {
					map.set(c.id, {
						id: c.id,
						input: c.input,
						status: "pending",
						toolName: c.name,
						// 2026-07-24: 透传 anchor (precedingContentLen), 渲染时按它穿插到 content
						...((c as { _anchor?: number })._anchor !== undefined
							? { _anchor: (c as { _anchor?: number })._anchor }
							: {}),
					});
					// 记录起始时间(用模块级 Map,避免扩展 store 类型)
					toolStartMsRef.current.set(c.id, Date.now());
					// 2026-07-06 P1-2: 预执行期缓存原文件内容 (仅写类工具)
					if (
						(c.name === "WriteFile" ||
							c.name === "ReplaceInFile" ||
							c.name === "ReplaceInFileRegex") &&
						!toolOriginalContentRef.current.has(c.id)
					) {
						const filePath = (c.input as Record<string, unknown>)?.path as
							| string
							| undefined;
						if (filePath) {
							void (async () => {
								try {
									const { ReadFile } =
										await import("@/lib/hostServices/FileService");
									const original = await ReadFile(filePath);
									toolOriginalContentRef.current.set(c.id, original);
								} catch {
									// 新建文件时 ReadFile 会报 "file not found" — 记为空字符串表示"原内容为空"
									toolOriginalContentRef.current.set(c.id, "");
								}
							})();
						}
					}
				}
			}
			// 2026-07-24: 删 sortToolCallsByAnchor, 改用 map 插入顺序(后端事件顺序 = 时间线)
			updateMessage(currentConversationId, ctx.msgId, {
				toolCalls: Array.from(map.values()),
			});
		},
		onToolCallUpdated: ({ call, convId, msgId }) => {
			if (!convId || !msgId) return;
			// P1-2 修复: 用 getState 拿最新值;找不到 idx 时 append(不再 return)
			const curConv = useChatStore
				.getState()
				.conversations.find((c) => c.id === convId);
			const cur = curConv?.messages.find((m) => m.id === msgId);
			const existing = cur?.toolCalls ?? [];
			const startedAt = toolStartMsRef.current.get(call.id) ?? Date.now();
			const patch: ToolCall = {
				...(existing.find((tc) => tc.id === call.id) ?? {
					id: call.id,
					input: call.input as Record<string, unknown>,
					status: "pending",
					toolName: call.name ?? "",
				}),
				duration: Date.now() - startedAt,
				error: call.error,
				input: call.input as Record<string, unknown>,
				status: call.status,
				toolName: call.name || "",
			};
			const idx = existing.findIndex((tc) => tc.id === call.id);
			const updated =
				idx >= 0
					? existing.map((tc, i) => (i === idx ? patch : tc))
					: [...existing, patch];
			// 2026-07-24: 删 sortToolCallsByAnchor, 保持原 updated 顺序
			updateMessage(convId, msgId, { toolCalls: updated });
			// 2026-07-06 P1-2: 原生 WriteFile/ReplaceInFile 工具调用成功 → 注入 reviewChanges
			if (
				call.status === "success" &&
				(call.name === "WriteFile" ||
					call.name === "ReplaceInFile" ||
					call.name === "ReplaceInFileRegex") &&
				!reviewedToolCallIdsRef.current.has(call.id)
			) {
				reviewedToolCallIdsRef.current.add(call.id);
				const originalContent =
					toolOriginalContentRef.current.get(call.id) ?? "";
				const filePath = (call.input as Record<string, unknown>)?.path as
					| string
					| undefined;
				if (filePath) {
					// newContent: ReplaceInFile 时工具会改 input, 但更稳的做法是重新 ReadFile 拿当前内容
					// (WriteFile 的 newContent 就是 input.content, 替换类工具的 newContent 不可靠)
					void (async () => {
						let newContent = originalContent;
						try {
							const { ReadFile } =
								await import("@/lib/hostServices/FileService");
							newContent = await ReadFile(filePath);
						} catch {
							// ignore
						}
						setReviewChanges((prev) => {
							if (prev.some((c) => c.id === call.id)) return prev;
							return [
								...prev,
								{
									filePath,
									id: call.id,
									newContent,
									originalContent,
									status: "pending" as const,
								},
							];
						});
					})();
				}
			}
		},
		projectPath,
		selectedAgent,
		updateConversationTokenStats,
		updateMessage,
	});

	const conversationTokenStats = currentConversation?.tokenStats ?? tokenStats;

	/** 最近一条 assistant 消息的原始 AI 输出（用于统一日志弹窗的"原"tab） */
	const latestRawContent = useMemo(() => {
		if (!currentConversation) return "";
		const last = [...currentConversation.messages]
			.reverse()
			.find((message) => message.role === "assistant");
		return last?.rawContent ?? last?.content ?? "";
	}, [currentConversation]);

	/** 切换会话后自动 focus 输入框（仅当焦点不在输入区时，避免强夺正在输入的焦点） */
	useEffect(() => {
		if (!currentConversationId) return;
		const timer = window.setTimeout(() => {
			const inputEl = document.querySelector<HTMLDivElement>(
				'[data-chat-input="true"]',
			);
			if (!inputEl) return;
			// 用户当前已在输入区或正与同一区域交互（IME 等）时不再强夺焦点
			if (inputEl.contains(document.activeElement)) return;
			inputEl.focus();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [currentConversationId]);

	useEffect(() => {
		if (!currentConversation) return;

		const latestAssistantMsg = [...currentConversation.messages]
			.reverse()
			.find((message) => message.role === "assistant" && !streamingId);

		if (!latestAssistantMsg) return;

		// Skip if content hasn't changed
		if (
			latestAssistantMsg.content === lastAppliedContentRef.current &&
			projectPath === lastProjectPathRef.current
		) {
			return;
		}
		lastAppliedContentRef.current = latestAssistantMsg.content;
		lastProjectPathRef.current = projectPath;

		applyCodeChanges(latestAssistantMsg.content, projectPath)
			.then(({ appliedCount, changes }) => {
				if (appliedCount > 0) {
					addChatFeedback(`已自动应用 ${appliedCount} 个文件修改`);
				}
				// Sync changes into CodeReviewPanel
				if (changes && changes.length > 0) {
					const fileChanges: FileChange[] = changes.map((change, idx) => ({
						id: `chat-${Date.now()}-${idx}`,
						filePath: change.filePath,
						originalContent: change.originalContent,
						newContent: change.newContent,
						status: "pending" as const,
					}));
					setReviewChanges((prev) => {
						const existing = new Set(prev.map((p) => p.filePath));
						const newOnes = fileChanges.filter(
							(f) => !existing.has(f.filePath),
						);
						return [...prev, ...newOnes];
					});
					if (fileChanges.length > 0 && !showCodeReviewPanel) {
						setShowCodeReviewPanel(true);
					}
				}
			})
			.catch((error) => {
				addChatFeedback(`应用文件修改失败: ${error}`);
			});
	}, [
		currentConversation,
		streamingId,
		projectPath,
		applyCodeChanges,
		showCodeReviewPanel,
	]);

	const handleSend = async (args?: {
		fileMentions: FileMentionReference[];
		input: string;
		skillMentions: string[];
	}) => {
		const nextInput = args?.input ?? input;
		if (!nextInput.trim()) return;
		const fileMentions = args?.fileMentions ?? [];
		const skillMentions = args?.skillMentions ?? [];

		clearChatFeedback();
		lastAppliedContentRef.current = "";
		lastProjectPathRef.current = "";

		let convId = currentConversationId;
		if (!convId) {
			const newConvId = `conv-${Date.now()}`;
			addConversation({
				agentId: selectedAgent?.id || "",
				agentMeta: selectedAgent
					? {
							name: selectedAgent.name,
							role: selectedAgent.role,
							skills: selectedAgent.skills || [],
							tools: selectedAgent.tools || [],
							collaborationMode: selectedAgent.collaborationMode,
						}
					: undefined,
				context: {
					modelId: selectedModel?.id || "",
					modelName: selectedModel?.name || "",
					projectPath,
					currentFilePath,
				},
				createdAt: new Date().toISOString(),
				debugLogs: [],
				id: newConvId,
				isArchived: false,
				isStarred: false,
				lastMessageAt: new Date().toISOString(),
				messages: [],
				title: nextInput.slice(0, 50),
				updatedAt: new Date().toISOString(),
			});
			setCurrentConversation(newConvId);
			convId = newConvId;
		}

		try {
			await streamingHandleSend(nextInput, convId, fileMentions, skillMentions);
			setInput("");
		} catch (error) {
			addChatFeedback(`发送失败：${error}`);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key !== "Enter" || e.shiftKey) return;
		e.preventDefault();
		handleSend();
	};

	const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 700;

	// 把当前选中模型 / 项目写入 layout store（用于顶栏/左栏徽章）
	// 实际项目可由 useEffect 监听写入；这里直接同步调用

	return (
		<>
			<ChatLayout
				changes={reviewChanges}
				expanded={fileChangesExpanded}
				onDiscard={handleDiscardFileChange}
				onDiscardAll={handleDiscardAllFileChanges}
				onExpandedChange={setFileChangesExpanded}
				onFileContentToInput={(path) => {
					// 关键修复:不再把文件内容塞进 input(截断会丢信息+浪费 token+污染上下文)
					// 改为插入 @[path] 引用,让 AI 用 ReadFile 工具自己读
					setInput((prev) => {
						const sep =
							prev.length > 0 && !prev.endsWith(" ") && !prev.endsWith("\n")
								? " "
								: "";
						return `${prev}${prev ? sep : ""}@<${path}>`;
					});
				}}
				onKeep={handleKeepFileChange}
				onKeepAll={handleKeepAllFileChanges}
				onOpenDiff={handleOpenDiffChange}
				onProjectPathChange={(path) => setProjectPath(path)}
				projectPath={projectPath}>
				{/* PR-1 (2026-07-10): Plan 阶段卡,planStore.pendingPlan 非空时显示 */}
				<div className="shrink-0 px-[10px] pt-3 w-full">
					<PlanStageCard />
				</div>

				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					{showDebugLog && (
						<DebugLogPanel logs={debugLogs} onClear={clearDebugLogs} />
					)}

					<div className="min-h-0 flex-1 overflow-hidden">
						<ChatMessagesArea
							agentExecutions={agentExecutions}
							availableAgents={availableAgents.map((a) => ({
								id: a.id,
								name: a.name,
								role: a.role,
							}))}
							conversation={currentConversation}
							hasMessages={hasMessages}
							messageQueue={messageQueue.map((q) => q.input)}
							onSuggestionClick={(text) => setInput(text)}
							onCodeChangeClick={(filePath, newContent, originalContent) => {
								setPendingCodeChange({
									filePath,
									newContent,
									originalContent,
								});
							}}
							onResend={(content) => {
								setInput(content);
								setTimeout(() => {
									const inputEl = document.querySelector<HTMLTextAreaElement>(
										'textarea[placeholder*="消息"]',
									);
									inputEl?.focus();
								}, 0);
							}}
							pendingCodeChange={pendingCodeChange}
							streamingContent={streamingContent}
							streamingId={streamingId}
						/>
					</div>

					{showOrchestration && agentNodes.length > 0 && (
						<div className="mt-4 px-4">
							<AgentOrchestrationGraph
								executions={agentExecutions}
								height={400}
								nodes={agentNodes}
								width={Math.max(700, viewportWidth - 100)}
							/>
						</div>
					)}

					<ChatInput
						autoApplyFileChanges={autoApplyFileChanges}
						centered={!hasMessages}
						currentFilePath={currentFilePath}
						currentConversationId={currentConversationId}
						getPendingChangesCount={getPendingChangesCount}
						input={input}
						isPaused={isPaused}
						isStreaming={!!streamingId}
						messageQueue={messageQueue}
						models={models}
						onClearQueue={clearQueue}
						onCloseToolFeedback={removeChatFeedback}
						onConfirmAllCodeChanges={confirmAllCodeChanges}
						onEnqueueMessage={(convId, input, fileMentions, skillMentions) =>
							enqueueMessage(convId, input, fileMentions, skillMentions)
						}
						onInputChange={setInput}
						onKeyDown={handleKeyDown}
						onPause={handlePause}
						onRemoveFromQueue={removeFromQueue}
						onReorderQueue={reorderQueue}
						onSendFromQueue={sendFromQueue}
						onSelectFile={handleSelectFileMention}
						selectedAgent={selectedAgent}
						onSend={handleSend}
						onDropFile={handleSelectFileMention}
						onShowAgentDialog={() => setShowAgentDialog(true)}
						toolFeedback={chatFeedback}
						onShowFileMention={setShowFileMention}
						onShowModelDialog={() => setShowModelDialog(true)}
						onShowProjectDialog={async () => {
							try {
								/** 统一服务:选目录 → 写 store(第一层) + 持久化(IndexedDB 完整树 + localStorage rootName)
								 *  ProjectSelector 订阅 store.directories 自动显示 */
								const ok = await selectProject();
								if (!ok) {
									addChatFeedback(
										"未选择项目目录:请在弹窗中选择一个文件夹后确认",
									);
									return;
								}
								setProjectPath(loadRootName());
								setRightSidebarVisible(true);
							} catch (error) {
								console.error("选择目录失败:", error);
							}
						}}
						onShowToolGrantDialog={() => setShowToolGrantDialog(true)}
						onSkipCodeChange={skipCodeChange}
						onStop={handleStop}
						onStopAndSend={handleStopAndSend}
						onToggleAutoApply={toggleAutoApply}
						projectPath={projectPath}
						selectedModel={selectedModel}
						showFileMention={showFileMention}
						tokenStats={conversationTokenStats}
						contextWindow={selectedModel?.maxInputTokens ?? 0}
					/>

					<AgentSelectDialog
						agents={availableAgents}
						onOpenChange={setShowAgentDialog}
						onSelectAgent={(agent) => {
							// 关键:agent 选择按当前对话记忆(不是全局唯一)
							useAgentStore
								.getState()
								.setAgentForConv(currentConversationId, agent.id);
							const nextAgent = availableAgents.find(
								(item) => item.id === agent.id,
							);
							if (currentConversationId) {
								updateConversation(currentConversationId, {
									agentId: agent.id,
									agentMeta: nextAgent
										? {
												name: nextAgent.name,
												role: nextAgent.role,
												skills: nextAgent.skills || [],
												tools: nextAgent.tools || [],
												collaborationMode: nextAgent.collaborationMode,
											}
										: undefined,
								});
								updateConversationContext(currentConversationId, {
									currentFilePath: currentFilePath || undefined,
									modelId: selectedModelId || undefined,
									projectPath: projectPath || undefined,
								});
							}
							setShowAgentDialog(false);
						}}
						open={showAgentDialog}
						selectedAgent={selectedAgent}
					/>

					<SkillSelectDialog
						onOpenChange={setShowSkillDialog}
						open={showSkillDialog}
					/>

					<ToolSelectDialog
						onOpenChange={setShowToolDialog}
						open={showToolDialog}
					/>

					<ToolGrantDialog
						convId={currentConversationId}
						onOpenChange={setShowToolGrantDialog}
						open={showToolGrantDialog}
					/>

					<ModelSelectDialog
						models={models}
						onOpenChange={setShowModelDialog}
						onSelectModel={(id) => {
							selectModel(id);
							if (currentConversationId) {
								const nextModel = models.find((model) => model.id === id);
								updateConversationContext(currentConversationId, {
									currentFilePath: currentFilePath || undefined,
									modelId: id,
									modelName: nextModel?.name,
									projectPath: projectPath || undefined,
								});
							}
							setShowModelDialog(false);
						}}
						open={showModelDialog}
						selectedModelId={selectedModelId}
					/>
				</div>

				{/* Code Diff Viewer Modal (fixed 定位, 在 ChatLayout 内部不影响布局) */}
				{pendingCodeChange && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
						<div className="max-h-[90vh] w-full max-w-4xl overflow-auto">
							<CodeDiffViewer
								change={pendingCodeChange}
								onCancel={() => setPendingCodeChange(null)}
								onConfirm={async (newContent) => {
									try {
										const { WriteFile } =
											await import("@/lib/hostServices/FileService");
										await WriteFile(pendingCodeChange.filePath, newContent);
										addChatFeedback(`文件已保存 ${pendingCodeChange.filePath}`);
										setPendingCodeChange(null);
									} catch (error) {
										addChatFeedback(`保存失败: ${error}`);
									}
								}}
							/>
						</div>
					</div>
				)}

				{reviewChanges.length > 0 && (
					<CodeReviewPanel
						changes={reviewChanges}
						collapsed={!showCodeReviewPanel}
						onAcceptChange={async (change) => {
							try {
								const { WriteFile } =
									await import("@/lib/hostServices/FileService");
								await WriteFile(change.filePath, change.newContent);
								setReviewChanges((prev) =>
									prev.map((c) =>
										c.id === change.id
											? { ...c, status: "accepted" as const }
											: c,
									),
								);
								addChatFeedback(`已接受: ${change.filePath}`);
							} catch (error) {
								addChatFeedback(`保存失败: ${error}`);
							}
						}}
						onRejectChange={(change) => {
							setReviewChanges((prev) =>
								prev.map((c) =>
									c.id === change.id
										? { ...c, status: "rejected" as const }
										: c,
								),
							);
						}}
						onToggleCollapse={() =>
							setShowCodeReviewPanel(!showCodeReviewPanel)
						}
					/>
				)}

				<UnifiedLogDialog
					debugLogs={debugLogs}
					onClearDebugLogs={clearDebugLogs}
					onOpenChange={(v) => (v ? openUnifiedLog() : closeUnifiedLog())}
					open={showUnifiedLog}
					streamingAssistantId={streamingId}
					streamingContent={streamingContent}
					streamingRawContent={streamingRawContent}
				/>
			</ChatLayout>
		</>
	);
}

export function ChatWindow() {
	return (
		<ChatSessionProvider>
			<ChatWindowImpl />
		</ChatSessionProvider>
	);
}
