import type { Model } from "@/stores/modelStore";

import type { FileMentionReference } from "../hooks/useChatWorkspace";
import { MessageQueueList } from "@/components/chat/messages/MessageQueueList";
import type { QueuedMessage } from "../hooks/useChatStreaming";
import { FileMentionPopover } from "@/components/file/FileMentionPopover";
import { ToolModeSelector } from "@/components/chat/dialogs/ToolModeSelector";
import { Button } from "@/components/ui/Button";
import { setDialogOrigin } from "@/components/ui/Dialog";
import {
	Bot,
	ChevronDown,
	FolderOpen,
	ListTodo,
	Plus,
	Send,
	Sparkles,
	Square,
	Star,
	Wrench,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useShallow } from "zustand/react/shallow";

import { useSkillStore } from "@/stores/skillStore";
import { useTodoStore } from "@/stores/todoStore";
import { useAgentStore } from "@/stores/agentStore";

import type { ChatFeedbackItem } from "@/components/chat/lib/chatFeedback";
import { AgentMentionPopover } from "@/components/chat/inputs/AgentMentionPopover";
import { ReasoningLevelSlider } from "@/components/chat/panels/ReasoningLevelSlider";
import { SkillMentionPopover } from "@/components/chat/inputs/SkillMentionPopover";
import { TokenBar } from "@/components/chat/panels/TokenBar";
import { TodoList } from "@/components/chat/panels/TodoList";
import { estimateTokens } from "@/lib/tokenEstimate";

/** 捕获触发元素的中心坐标并设置为 Dialog 动画原点 */
function captureOrigin(e: React.MouseEvent) {
	const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	setDialogOrigin({
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	});
}

/** 从文件名提取短名 */
function shortFileName(path: string): string {
	const fileName = path.split(/[/\\]/).pop() || path;
	const nameWithoutExt = fileName.replace(/\.[^.]+$/, "") || fileName;
	return nameWithoutExt.length > 10
		? `${nameWithoutExt.slice(0, 8)}..`
		: nameWithoutExt;
}

/** 从 contentEditable div 提取纯文本 */
function extractText(editable: HTMLDivElement): string {
	let result = "";
	const walk = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			result += node.textContent || "";
		} else if (node instanceof HTMLSpanElement) {
			if (node.dataset.chip === "agent" && node.dataset.name) {
				// Agent chip → @agentName
				result += `@${node.dataset.name}`;
			} else if (node.dataset.chip === "skill" && node.dataset.name) {
				// Skill chip → /skillName
				result += `/${node.dataset.name}`;
			} else if (node.dataset.chip === "file" && node.dataset.path) {
				result += `@[${node.dataset.path}]`;
			} else {
				node.childNodes.forEach(walk);
			}
		} else if (node instanceof HTMLBRElement) {
			result += "\n";
		} else {
			node.childNodes.forEach(walk);
		}
	};
	editable.childNodes.forEach(walk);
	return result;
}

/** 从 contentEditable div 提取所有 chip 的 file path（用于 enqueueMessage 传 fileMentions） */
function extractFileMentions(editable: HTMLDivElement): FileMentionReference[] {
	const paths = new Set<string>();
	editable
		.querySelectorAll<HTMLSpanElement>('[data-chip="file"]')
		.forEach((chip) => {
			const path = chip.dataset.path;
			if (path) paths.add(path);
		});
	return Array.from(paths).map((path) => ({ path, token: `@[${path}]` }));
}

/** 从 contentEditable div 提取所有 chip 的 skill ID（用于并入 req.Skills） */
function extractSkillMentions(editable: HTMLDivElement): string[] {
	const ids = new Set<string>();
	editable
		.querySelectorAll<HTMLSpanElement>('[data-chip="skill"]')
		.forEach((chip) => {
			const id = chip.dataset.skillId || chip.dataset.name;
			if (id) ids.add(id);
		});
	return Array.from(ids);
}

/** 光标前是否紧邻一个等待输入的 @ */
function hasTrailingAt(editable: HTMLDivElement): boolean {
	const sel = window.getSelection();
	if (!sel || !sel.rangeCount) return false;
	const range = sel.getRangeAt(0);
	const node = range.endContainer;
	if (node.nodeType !== Node.TEXT_NODE) return false;
	const offset = range.endOffset;
	const before = node.textContent?.slice(0, offset) || "";
	const atIdx = before.lastIndexOf("@");
	if (atIdx === -1) return false;
	const afterAt = before.slice(atIdx + 1);
	// 如果是 @[ 则视为文件路径模式,返回 false
	if (afterAt.startsWith("[")) return false;
	return !afterAt.includes(" ") && !afterAt.includes("\n");
}

/** 光标前是否紧邻一个等待输入的 / */
function hasTrailingSlash(editable: HTMLDivElement): boolean {
	const sel = window.getSelection();
	if (!sel || !sel.rangeCount) return false;
	const range = sel.getRangeAt(0);
	const node = range.endContainer;
	if (node.nodeType !== Node.TEXT_NODE) return false;
	const offset = range.endOffset;
	const before = node.textContent?.slice(0, offset) || "";
	const slashIdx = before.lastIndexOf("/");
	if (slashIdx === -1) return false;
	const afterSlash = before.slice(slashIdx + 1);
	return !afterSlash.includes(" ") && !afterSlash.includes("\n");
}

/** 删除光标前一个指定字符(用于弹层打开时吞掉刚输入的 @ 或 /) */
function stripTrailingChar(editable: HTMLDivElement, char: string): void {
	const sel = window.getSelection();
	if (!sel || !sel.rangeCount) return;
	const range = sel.getRangeAt(0);
	const node = range.endContainer;
	if (node.nodeType !== Node.TEXT_NODE) return;
	const text = node.textContent || "";
	const endOffset = range.endOffset;
	if (endOffset > 0 && text[endOffset - 1] === char) {
		range.setStart(node, endOffset - 1);
		range.setEnd(node, endOffset);
		range.deleteContents();
		sel.removeAllRanges();
		sel.addRange(range);
	}
}

interface ChatInputProps {
	centered?: boolean;
	currentFilePath?: string;
	currentConversationId?: string | null;
	getPendingChangesCount: () => number;
	input: string;
	isPaused: boolean;
	messageQueue: QueuedMessage[];
	models: Model[];
	onClearQueue?: () => void;
	onConfirmAllCodeChanges?: () => void;
	onReorderQueue?: (from: number, to: number) => void;
	onDropFile?: (path: string) => void;
	onEnqueueMessage?: (
		convId: string,
		input: string,
		fileMentions: FileMentionReference[],
		skillMentions: string[],
	) => void;
	onInputChange: (value: string) => void;
	isStreaming?: boolean;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onPause: () => void;
	onSelectFile: (path: string) => void;
	selectedAgent?: { id: string; name: string } | null;
	onSend?: (args: {
		input: string;
		fileMentions: FileMentionReference[];
		skillMentions: string[];
	}) => void;
	onShowAgentDialog: () => void;
	onShowFileMention: (show: boolean) => void;
	onShowModelDialog: () => void;
	onShowProjectDialog: () => void;
	onShowToolGrantDialog: () => void;
	onSkipCodeChange?: () => void;
	onStop: () => void;
	onStopAndSend?: () => void;
	projectPath: string;
	selectedModel: Model | null;
	showFileMention: boolean;
	onRemoveFromQueue?: (index: number) => void;
	onSendFromQueue?: (index: number) => void;
	toolFeedback?: ChatFeedbackItem[];
	onCloseToolFeedback?: (id: string) => void;
	tokenStats: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		cacheReadTokens: number;
		cacheCreationTokens: number;
		hitRate: number;
		totalCostCny: number;
	};
	contextWindow?: number;
}

/** 创建 agent chip */
function createAgentChip(name: string): HTMLSpanElement {
	const span = document.createElement("span");
	span.contentEditable = "false";
	span.dataset.chip = "agent";
	span.dataset.name = name;
	span.className =
		"inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-px text-xs align-middle cursor-default select-none mx-0.5";
	span.innerHTML = `<span class="text-primary font-medium">@${name}</span><button class="ml-0.5 rounded p-0.5 hover:bg-primary/20" data-action="remove"><svg class="h-[12px] w-[12px]" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>`;
	return span;
}

/** 创建 skill chip（id 用于后端 req.Skills 匹配；name 仅做展示） */
function createSkillChip(id: string, name: string): HTMLSpanElement {
	const span = document.createElement("span");
	span.contentEditable = "false";
	span.dataset.chip = "skill";
	span.dataset.skillId = id;
	span.dataset.name = name;
	span.className =
		"inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-px text-xs align-middle cursor-default select-none mx-0.5";
	span.innerHTML = `<svg class="text-amber-600 h-[14px] w-[14px] shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><span class="text-amber-700 dark:text-amber-400 font-medium">/${name}</span><button class="ml-0.5 rounded p-0.5 hover:bg-amber-500/20" data-action="remove"><svg class="h-[12px] w-[12px]" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>`;
	return span;
}

/** 创建 file chip */
function createFileChip(path: string): HTMLSpanElement {
	const span = document.createElement("span");
	span.contentEditable = "false";
	span.dataset.chip = "file";
	span.dataset.path = path;
	span.className =
		"inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-px text-xs align-middle cursor-default select-none mx-0.5";
	span.innerHTML = `<svg class="text-primary h-[14px] w-[14px] shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg><span class="text-primary font-medium max-w-[120px] truncate">${shortFileName(path)}</span><button class="ml-0.5 rounded p-0.5 hover:bg-primary/20" data-action="remove"><svg class="h-[12px] w-[12px]" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>`;
	return span;
}

/** 通用 chip 构造器(按类型分发) */
function createChip(
	type: "agent" | "skill" | "file",
	key: string,
	displayName?: string,
): HTMLSpanElement {
	if (type === "agent") return createAgentChip(key);
	if (type === "skill") return createSkillChip(key, displayName || key);
	return createFileChip(key);
}

/** 在光标处插入 chip */
function insertChipAtCursorImpl(
	editable: HTMLDivElement,
	type: "agent" | "skill" | "file",
	key: string,
	options?: { stripTrailingTrigger?: boolean; displayName?: string },
) {
	editable.focus();
	const sel = window.getSelection();
	if (sel && sel.rangeCount) {
		const range = sel.getRangeAt(0);
		const node = range.endContainer;
		if (options?.stripTrailingTrigger && node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent || "";
			const endOffset = range.endOffset;
			const trigger = type === "skill" ? "/" : "@";
			if (endOffset > 0 && text[endOffset - 1] === trigger) {
				range.setStart(node, endOffset - 1);
				range.setEnd(node, endOffset);
				range.deleteContents();
				sel.removeAllRanges();
				sel.addRange(range);
			}
		}
		const chip = createChip(type, key, options?.displayName);
		const r2 = sel.getRangeAt(0);
		r2.insertNode(chip);
		r2.setStartAfter(chip);
		r2.collapse(true);
		const space = document.createTextNode(" ");
		r2.insertNode(space);
		r2.setStartAfter(space);
		r2.collapse(true);
		sel.removeAllRanges();
		sel.addRange(r2);
	}
}

/** 将 input 文本(含 @agent /skill @[path]) 渲染到 contentEditable */
/**
 * 渲染文本到 contentEditable
 *
 * 关键规则(避免"裸路径被拆成多个 skill chip"问题):
 *   1. xxx  → file chip (短名)
 *   2. /skill / agent → 只有前一个字符是空白/行首/标点 才算 mention
 *      否则:  /Users、/JY_DZ_JS005 等裸路径片段只是文本, 不当 skill 处理
 *   3. Windows 路径 C:/xxx/yyy 作为整体原样保留为文本(file chip 仅在显式 xxx 时插入)
 */
function renderContent(editable: HTMLDivElement, text: string) {
	editable.innerHTML = "";
	// tokenRe: /xxx 前置边界 (?<![A-Za-z0-9_./\\-])
	//   排除: xxx/yyy (前面是字母数字下划线点斜线反斜线, 是路径片段)
	//   接受: 空白 + /xxx (真正的 skill mention)
	// 解释:  /Users 在 "C:/Users" 里前面是 : 不在排除集, 但 : 也不在空白集 → 不当 skill
	//       " /Users" 前面是空白 → 当 skill
	const tokenRe =
		/(@\[[^\]]+\])|(?<![A-Za-z0-9_.\\/:-])(\/[A-Za-z0-9_\-]+)|(@[A-Za-z0-9_\-]+)/g;
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = tokenRe.exec(text)) !== null) {
		const before = text.slice(lastIndex, m.index);
		if (before) editable.appendChild(document.createTextNode(before));
		if (m[1]) {
			// @[path]
			const path = m[1].slice(2, -1);
			if (path.includes("/") || path.includes("\\")) {
				editable.appendChild(createFileChip(path));
			} else {
				editable.appendChild(document.createTextNode(m[1]));
			}
		} else if (m[2]) {
			// /skillname (前一个字符已被 lookbehind 排除路径片段, 这里必是真正 mention)
			// renderContent 解析的是文本中的 /name 形式,没有 id,临时回退用 name 作为 skillId(后续 extractSkillMentions 会优先用 data-skill-id,未设置时回落 name)
			editable.appendChild(createSkillChip(m[2].slice(1), m[2].slice(1)));
		} else if (m[3]) {
			// @agentname
			editable.appendChild(createAgentChip(m[3].slice(1)));
		}
		lastIndex = m.index + m[0].length;
	}
	const tail = text.slice(lastIndex);
	if (tail) editable.appendChild(document.createTextNode(tail));
	if (!editable.lastChild || editable.lastChild.nodeType !== Node.TEXT_NODE) {
		editable.appendChild(document.createTextNode(""));
	}
}

/** 从可编辑元素提取 file/skill chip 引用,供 ChatWindow.handleSend 复用 */
export function buildSendArgs(
	input: string,
	editable: HTMLDivElement | null,
): {
	fileMentions: FileMentionReference[];
	input: string;
	skillMentions: string[];
} {
	// 三路合并:chip DOM + store.selectedSkillIds + 全部已加载 skill
	const chipIds = editable ? extractSkillMentions(editable) : [];
	const storeIds = useSkillStore.getState().selectedSkillIds;
	const allLoadedIds = useSkillStore.getState().skills.map((s) => s.id);
	return {
		fileMentions: editable ? extractFileMentions(editable) : [],
		input,
		skillMentions: [...new Set([...chipIds, ...storeIds, ...allLoadedIds])],
	};
}

export function ChatInput({
	centered = false,
	currentFilePath,
	currentConversationId,
	getPendingChangesCount,
	input,
	isPaused,
	messageQueue,
	onConfirmAllCodeChanges,
	onDropFile,
	onEnqueueMessage,
	onInputChange,
	isStreaming: isStreamingProp,
	onKeyDown,
	onPause,
	onSelectFile,
	onSend,
	onShowAgentDialog,
	selectedAgent,
	onShowFileMention,
	onShowModelDialog,
	onShowProjectDialog,
	onShowToolGrantDialog,
	onSkipCodeChange,
	onStop,
	onStopAndSend,
	projectPath,
	selectedModel,
	showFileMention,
	onRemoveFromQueue,
	onSendFromQueue,
	onReorderQueue,
	onClearQueue,
	toolFeedback,
	onCloseToolFeedback,
	tokenStats,
	contextWindow = 0,
}: ChatInputProps) {
	/** 草稿 token 估算(仅 input 变化时重算) */
	const draftInputTokens = useMemo(() => estimateTokens(input), [input]);
	const isStreaming = isStreamingProp ?? false;
	const defaultAgentId = useAgentStore((s) => s.selectedAgentId);
	const isDefaultAgent = Boolean(
		selectedAgent && defaultAgentId && selectedAgent.id === defaultAgentId,
	);
	const editableRef = useRef<HTMLDivElement>(null);
	const innerBoxRef = useRef<HTMLDivElement>(null);
	const isComposingRef = useRef(false);
	const [showTodo, setShowTodo] = useState(false);
	const [showQueue, setShowQueue] = useState(true);
	/** 内层边框容器(截图里红框那层)高度,可拖动。
	 *  Wails 桌面应用,仅鼠标拖动。 */
	const MIN_INNER_HEIGHT = 120;
	const MAX_INNER_HEIGHT_RATIO = 0.7;
	const [innerHeight, setInnerHeight] = useState<number | null>(() => {
		// 清理前几轮残留的旧 key
		window.localStorage.removeItem("evo-harness:chat-input-editor-height");
		window.localStorage.removeItem("evo-harness:chat-input-area-height");
		const stored = window.localStorage.getItem(
			"evo-harness:chat-input-inner-height",
		);
		const parsed = stored ? Number(stored) : NaN;
		if (!Number.isFinite(parsed)) return null;
		const max = Math.max(
			200,
			Math.floor(window.innerHeight * MAX_INNER_HEIGHT_RATIO),
		);
		if (parsed < MIN_INNER_HEIGHT || parsed > max) return null;
		return parsed;
	});

	/** VerticalResizeHandle 回调: 累计 delta 转 innerHeight,clamp 后 setState */
	const handleInnerResize = useCallback((deltaPx: number) => {
		setInnerHeight((prev) => {
			const base =
				prev ?? innerBoxRef.current?.getBoundingClientRect().height ?? 200;
			const max = Math.max(
				200,
				Math.floor(window.innerHeight * MAX_INNER_HEIGHT_RATIO),
			);
			const next = Math.max(MIN_INNER_HEIGHT, Math.min(base + deltaPx, max));
			window.localStorage.setItem(
				"evo-harness:chat-input-inner-height",
				String(Math.round(next)),
			);
			return next;
		});
	}, []);

	const resetInnerHeight = useCallback(() => {
		setInnerHeight(null);
		window.localStorage.removeItem("evo-harness:chat-input-inner-height");
	}, []);

	/**
	 * AI 新增 todo 自动展开 TodoList 面板 — 避免用户错过 AI 的任务进度
	 * 用 ref 记上一次 AI todo 数量,只在新增加时触发,避免重复展开
	 */
	const aiTodoCountRef = useRef(0);
	// useShallow:filter 每次返回新数组,浅比较避免无关 store 更新触发本组件重渲染
	const aiTodos = useTodoStore(
		useShallow((s) =>
			s.todos.filter(
				(t) =>
					t.source === "ai" &&
					(!currentConversationId ||
						t.conversationId === currentConversationId),
			),
		),
	);
	const todos = useTodoStore(
		useShallow((s) =>
			currentConversationId
				? s.todos.filter((t) => t.conversationId === currentConversationId)
				: s.todos,
		),
	);
	useEffect(() => {
		if (aiTodos.length > aiTodoCountRef.current) {
			// 新增了 AI todo → 自动展开面板
			setShowTodo(true);
		}
		aiTodoCountRef.current = aiTodos.length;
	}, [aiTodos.length]);
	const [showAgentMention, setShowAgentMention] = useState(false);
	const [showSkillMention, setShowSkillMention] = useState(false);

	useEffect(() => {
		if (!editableRef.current) return;
		const current = extractText(editableRef.current);
		if (current !== input) {
			renderContent(editableRef.current, input);
		}
	}, [input]);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (
			Array.from(e.dataTransfer.types).includes("application/x-wails-file-path")
		) {
			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = "copy";
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			const path = e.dataTransfer.getData("application/x-wails-file-path");
			if (!path) return;
			e.preventDefault();
			e.stopPropagation();
			if (!editableRef.current) return;
			insertChipAtCursorImpl(editableRef.current, "file", path);
			onInputChange(extractText(editableRef.current));
			(onDropFile ?? onSelectFile)(path);
		},
		[onInputChange, onDropFile, onSelectFile],
	);

	const [isDragOver, setIsDragOver] = useState(false);

	const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (
			Array.from(e.dataTransfer.types).includes("application/x-wails-file-path")
		) {
			e.preventDefault();
			setIsDragOver(true);
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (e.currentTarget === e.target) {
			setIsDragOver(false);
		}
	}, []);

	/** 输入事件:检测 / 和 @ 触发 */
	/** 上一次弹层状态:用于判断是否首次打开(触发吞掉 trigger 字符) */
	const prevMentionStateRef = useRef<null | "agent" | "file" | "skill">(null);

	/** 重置弹层状态 ref(选中/Escape/失焦时调用) */
	const resetMentionState = useCallback(() => {
		prevMentionStateRef.current = null;
	}, []);

	/** 文件选择(从文件弹层) */
	const handleSelectFileFromPopover = useCallback(
		(path: string) => {
			onSelectFile(path);
			if (editableRef.current) {
				insertChipAtCursorImpl(editableRef.current, "file", path, {
					stripTrailingTrigger: true,
				});
				onInputChange(extractText(editableRef.current));
			}
			onShowFileMention(false);
			resetMentionState();
		},
		[onSelectFile, onInputChange, onShowFileMention, resetMentionState],
	);

	/** Agent 选择(从 agent 弹层) */
	const handleSelectAgent = useCallback(
		(agent: { name: string }) => {
			if (!editableRef.current) return;
			insertChipAtCursorImpl(editableRef.current, "agent", agent.name, {
				stripTrailingTrigger: true,
			});
			onInputChange(extractText(editableRef.current));
			setShowAgentMention(false);
			resetMentionState();
		},
		[onInputChange, resetMentionState],
	);

	/** Skill 选择(从 skill 弹层) */
	const handleSelectSkill = useCallback(
		(skill: { id: string; name: string }) => {
			if (!editableRef.current) return;
			// 同步写入 skillStore.selectedSkillIds(保证后续 sendMessage 一定能拿到)
			// 避免依赖 enqueueMessage/handleSend 参数链路,0 失误风险
			const cur = useSkillStore.getState().selectedSkillIds;
			if (!cur.includes(skill.id)) {
				useSkillStore.getState().toggleSkill(skill.id);
			}
			// 用 skillId 做 key 传 chip,渲染时仍展示 name;data-skill-id 供 extractSkillMentions 收集
			// 不传 stripTrailingTrigger 避免吃掉 '/',以便后续继续选 skill
			insertChipAtCursorImpl(editableRef.current, "skill", skill.id, {
				displayName: skill.name,
				stripTrailingTrigger: false,
			});
			onInputChange(extractText(editableRef.current));
			setShowSkillMention(false);
			resetMentionState();
		},
		[onInputChange, resetMentionState],
	);

	const handleInput = useCallback(() => {
		if (!editableRef.current || isComposingRef.current) return;
		const editable = editableRef.current;
		const prevState = prevMentionStateRef.current;

		// 检测 trigger
		const hasSlash = hasTrailingSlash(editable);
		const hasAt = hasTrailingAt(editable);
		const hasAtBracket = editable.textContent?.includes("@[");

		let nextState: null | "agent" | "file" | "skill" = null;
		if (hasSlash) nextState = "skill";
		else if (hasAt) nextState = "agent";
		else if (hasAtBracket) nextState = "file";

		// 弹层从关闭 → 打开时,吞掉刚输入的 trigger 字符(避免 @xxx/xxx 残留)
		if (nextState === "skill" && prevState !== "skill") {
			stripTrailingChar(editable, "/");
		} else if (nextState === "agent" && prevState !== "agent") {
			stripTrailingChar(editable, "@");
		}

		prevMentionStateRef.current = nextState;

		// 同步弹层显隐
		setShowSkillMention(nextState === "skill");
		setShowAgentMention(nextState === "agent");
		onShowFileMention(nextState === "file");

		// 重新读 text(吞掉 trigger 后)
		const newText = extractText(editable);
		onInputChange(newText);
	}, [onInputChange, onShowFileMention]);

	/** 统一发送入口(Enter 与发送按钮共用);依赖含 input,避免回车发出过期文本 */
	const doSend = useCallback(() => {
		onSend?.(buildSendArgs(input, editableRef.current));
	}, [input, onSend]);

	/** 流式期间加入队列并清空输入框 */
	const doEnqueue = useCallback(() => {
		if (!editableRef.current || !onEnqueueMessage) return;
		onEnqueueMessage(
			currentConversationId ?? "",
			input,
			extractFileMentions(editableRef.current),
			extractSkillMentions(editableRef.current),
		);
		onInputChange("");
		editableRef.current.innerHTML = "";
	}, [currentConversationId, input, onEnqueueMessage, onInputChange]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// 弹层打开时由弹层自身处理 Esc/Enter/Up/Down
			if (showFileMention && e.key === "Escape") {
				e.preventDefault();
				onShowFileMention(false);
				return;
			}
			if (showAgentMention && e.key === "Escape") {
				e.preventDefault();
				setShowAgentMention(false);
				resetMentionState();
				return;
			}
			if (showSkillMention && e.key === "Escape") {
				e.preventDefault();
				setShowSkillMention(false);
				resetMentionState();
				return;
			}
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				doSend();
				return;
			}
			onKeyDown(e);
		},
		[
			showFileMention,
			showAgentMention,
			showSkillMention,
			onShowFileMention,
			resetMentionState,
			doSend,
			onKeyDown,
		],
	);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			e.preventDefault();
			const text = e.clipboardData.getData("text/plain");
			if (!text) return;
			const sel = window.getSelection();
			if (sel && sel.rangeCount && editableRef.current) {
				const range = sel.getRangeAt(0);
				range.deleteContents();
				range.insertNode(document.createTextNode(text));
				range.collapse(false);
				sel.removeAllRanges();
				sel.addRange(range);
			}
			if (!isComposingRef.current && editableRef.current) {
				onInputChange(extractText(editableRef.current));
				onShowFileMention(hasTrailingAt(editableRef.current));
			}
		},
		[onInputChange, onShowFileMention],
	);

	const handleEditableClick = useCallback(
		(e: React.MouseEvent) => {
			const target = e.target as HTMLElement;
			const btn = target.closest(
				"[data-action='remove']",
			) as HTMLElement | null;
			if (btn && editableRef.current) {
				e.preventDefault();
				const chip = btn.closest("[data-chip]") as HTMLSpanElement | null;
				if (chip) {
					chip.remove();
					onInputChange(extractText(editableRef.current));
				}
			}
		},
		[onInputChange],
	);

	return (
		<div className="shrink-0 border-t bg-card px-[10px] py-3 w-full mt-auto flex flex-col">
			{showTodo && todos.length > 0 && (
				<TodoList
					className="max-h-64 shrink-0 overflow-auto rounded-lg border bg-background"
					conversationId={currentConversationId ?? undefined}
				/>
			)}

			{messageQueue.length > 0 && (
				<MessageQueueList
					onClear={onClearQueue ?? (() => {})}
					onRemove={onRemoveFromQueue ?? (() => {})}
					onReorder={onReorderQueue ?? (() => {})}
					onRunNow={onSendFromQueue ?? (() => {})}
					queue={messageQueue}
				/>
			)}

			<div
				ref={innerBoxRef}
				className={
					isDragOver
						? "border-primary ring-2 ring-primary/30 flex w-full max-w-4xl flex-1 min-h-0 flex-col rounded-xl border bg-background transition-colors"
						: "focus-within:border-ring/50 flex w-full flex-1 min-h-0 flex-col rounded-xl border border-border/70 bg-background transition-colors"
				}
				style={innerHeight ? { height: innerHeight } : undefined}>
				{toolFeedback && toolFeedback.length > 0 && (
					<div className="flex flex-col gap-1 border-b border-amber-500/30 px-3 py-1.5 text-xs text-amber-600">
						{toolFeedback.map((item) => (
							<div className="flex items-center gap-2" key={item.id}>
								<span className="min-w-0 flex-1 truncate">{item.text}</span>
								{onCloseToolFeedback && (
									<button
										aria-label="关闭提示"
										className="shrink-0 rounded p-0.5 transition-colors hover:bg-amber-500/10"
										onClick={() => onCloseToolFeedback(item.id)}
										type="button">
										<X className="h-[12px] w-[12px]" />
									</button>
								)}
							</div>
						))}
					</div>
				)}

				<div className="relative min-h-0 flex-1">
					<div
						className="h-full max-h-full cursor-text overflow-y-auto whitespace-pre-wrap break-words px-3 pt-3 pb-1 text-sm text-foreground outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
						contentEditable
						data-placeholder="@ 选 Agent / / 选 Skill · @[ 选文件 · 输入消息..."
						onClick={handleEditableClick}
						onCompositionEnd={() => {
							isComposingRef.current = false;
							handleInput();
						}}
						onCompositionStart={() => {
							isComposingRef.current = true;
						}}
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onDragOver={handleDragOver}
						onDrop={(e) => {
							handleDrop(e);
							setIsDragOver(false);
						}}
						onInput={handleInput}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
						ref={editableRef}
						role="textbox"
						data-chat-input="true"
						suppressContentEditableWarning
						style={{ scrollbarWidth: "thin" }}
					/>
					{/* 三个弹层互斥,只渲染一个 */}
					{showFileMention && (
						<FileMentionPopover
							onClose={() => onShowFileMention(false)}
							onSelectFile={handleSelectFileFromPopover}
							open={showFileMention}
							projectPath={projectPath}
						/>
					)}
					{showAgentMention && !showFileMention && (
						<AgentMentionPopover
							onClose={() => setShowAgentMention(false)}
							onSelect={handleSelectAgent}
							open={showAgentMention}
						/>
					)}
					{showSkillMention && !showFileMention && !showAgentMention && (
						<SkillMentionPopover
							onClose={() => setShowSkillMention(false)}
							onSelect={handleSelectSkill}
							open={showSkillMention}
						/>
					)}
				</div>

				<div className="flex min-w-0 flex-wrap items-center gap-1 px-2 py-2 [scrollbar-width:none]">
					<Button
						className="h-7 gap-1 px-2 text-xs"
						onClick={(e) => {
							captureOrigin(e);
							onShowAgentDialog();
						}}
						size="sm"
						title={isDefaultAgent ? "当前为默认 Agent" : "选择 Agent"}
						variant="ghost">
						<Bot className="h-5 w-5" />
						<span className="max-w-[80px] truncate">
							{selectedAgent?.name || "选择 Agent"}
						</span>
						{isDefaultAgent ? (
							<Star className="text-primary h-3.5 w-3.5 fill-current" />
						) : null}
					</Button>

					<div className="bg-muted-foreground/20 mx-0.5 h-4 w-px" />

					<Button
						className="h-7 gap-1 px-2 text-xs"
						onClick={(e) => {
							captureOrigin(e);
							onShowModelDialog();
						}}
						size="sm"
						variant="ghost">
						<span className="max-w-[200px] truncate">
							{selectedModel?.name || "请添加模型"}
						</span>
						<ChevronDown className="h-5 w-5" />
					</Button>

					<div className="bg-muted-foreground/20 mx-0.5 h-4 w-px" />

					<Button
						className="h-7 w-7"
						onClick={(e) => {
							captureOrigin(e);
							onShowToolGrantDialog();
						}}
						size="icon"
						title="Skills / Tools"
						variant="ghost">
						<Wrench className="h-5 w-5" />
					</Button>

					<div className="bg-muted-foreground/20 mx-0.5 h-4 w-px" />

					<div className="flex-1" />

					{messageQueue.length > 0 && (
						<span className="bg-primary/10 text-primary flex h-6 items-center gap-1 rounded-lg px-2 text-xs font-medium">
							<Sparkles className="h-5 w-5" />
							{messageQueue.length + (isStreaming ? 1 : 0)}
						</span>
					)}

					{isStreaming && (
						<Button
							className="h-7 w-7"
							onClick={onStop}
							size="icon"
							title="停止"
							variant="ghost">
							<Square className="h-5 w-5" />
						</Button>
					)}

					{/* 发送按钮 */}
					<Button
						className="h-[40px] w-[40px] ml-2 shrink-0"
						disabled={false}
						onClick={() => {
							if (isStreaming && onEnqueueMessage) {
								doEnqueue();
							} else {
								doSend();
							}
						}}
						size="icon"
						title={isStreaming ? "加入发送队列" : "发送"}
						variant={isStreaming ? "secondary" : "default"}>
						{isStreaming ? (
							<Plus className="h-5 w-5" />
						) : (
							<Send className="h-5 w-5" />
						)}
					</Button>

					{/* 第二行: 项目上下文 + 面板切换 / ToolMode + Todo + 附件 */}
					<div className="bg-border/60 mx-1 h-px w-full basis-full" />
					<Button
						className="h-7 gap-1 p-2 text-xs bg-background mt-2"
						onClick={onShowProjectDialog}
						size="sm"
						title={projectPath || "选择项目"}
						variant="ghost">
						<FolderOpen className="h-5 w-5" />
						<span className="max-w-[80px] truncate">
							{projectPath ? projectPath.split(/[/\\]/).pop() : "项目"}
						</span>
					</Button>

					{/* 第二行后半段:面板切换 / ToolMode 聚成一组,靠 ml-auto 与左侧项目按钮分开。
							    不是"推最右",而是"左右分组"——左侧是项目上下文,右侧是工具/模式切换。 */}
					{/* TodoList 折叠面板切换 */}
					<Button
						className="h-7 w-7 ml-auto"
						onClick={() => setShowTodo(!showTodo)}
						size="icon"
						title={showTodo ? "任务清单: 显示中(再点折叠)" : "任务清单: 折叠"}
						variant={showTodo ? "secondary" : "ghost"}>
						<ListTodo className="h-5 w-5" />
					</Button>

					<Button
						className="h-7 w-7 mr-2"
						disabled
						size="icon"
						title="附件功能开发中"
						variant="ghost">
						<Plus className="h-5 w-5" />
					</Button>

					<ToolModeSelector />

					<ReasoningLevelSlider />
				</div>

				{(tokenStats.totalTokens > 0 ||
					tokenStats.cacheReadTokens > 0 ||
					draftInputTokens > 0) && (
					<div className="border-t border-border/60 px-3 py-2">
						<TokenBar
							contextTokens={tokenStats.inputTokens + draftInputTokens}
							contextWindow={contextWindow}
							inputTokens={tokenStats.inputTokens}
							outputTokens={tokenStats.outputTokens}
							cacheReadTokens={tokenStats.cacheReadTokens}
							cacheCreationTokens={tokenStats.cacheCreationTokens}
							hitRate={tokenStats.hitRate}
							costCny={tokenStats.totalCostCny}
							isWritingCache={tokenStats.cacheCreationTokens > 0}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
