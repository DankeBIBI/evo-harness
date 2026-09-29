import {
	Brain,
	ChevronDown,
	ChevronUp,
	FileEdit,
	FileMinus,
	FileSearch,
	FileText,
	FolderOpen,
	HelpCircle,
	ListTodo,
	Loader2,
	MessageSquare,
	Search,
	Terminal,
	Wrench,
	type LucideIcon,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import type { ToolCall } from "@/stores/chatStore";

import { parsePipeTable, PipeTable } from "@/components/chat/panels/PipeTable";
import {
	useStreamingSegments,
	useStreamingTailPreview,
	type Segment,
} from "@/components/chat/hooks/useStreamingSegments";

interface Props {
	autoFoldThink?: boolean;
	content: string;
	isStreaming: boolean;
	/**
	 * 当前消息的工具调用列表。
	 * 由 ChatMessages 透传 msg.toolCalls；流式期间会随 onToolCallsDetected /
	 * onToolCallUpdated 实时更新,用于渲染 "读了什么 / 改了什么" 的活动日志。
	 * 2026-07-06 P1-2 新增
	 */
	toolCalls?: ToolCall[];
}

export const StreamingMessage = memo(function StreamingMessage({
	autoFoldThink = true,
	content,
	isStreaming,
	toolCalls,
}: Props) {
	/**
	 * 2026-08-31 抽离: 解析 + 穿插 + 折叠工具块统一到 useStreamingSegments Hook
	 * 性能权衡: 上游 scheduleStreamingUpdate 已做 rAF 节流(parseContent
	 *   实际执行频率受此约束,不会爆主线程)。
	 * 历史上曾尝试 useDeferredValue + startTransition 双重降级,但 React 18
	 *   短消息场景会触发渲染循环导致 WebView2 进程崩溃,已回退;本版本不再使用。
	 */
	const { segments, visibleSegments } = useStreamingSegments(
		content,
		toolCalls,
		isStreaming,
	);
	// 流式输出底部打字机预览：取最近 ~60 字符作为"AI 正在说什么"的实时反馈。
	// 即使当前在执行 tool_call（无 output 段可显示），也保留占位行告诉用户任务还在跑。
	const tailPreview = useStreamingTailPreview(content, segments, isStreaming);

	return (
		<div className="w-full min-w-0 space-y-3">
			{/* P1-2 调整 (2026-07-06)：工具块已织入 visibleSegments 渲染(跟随输出走),
			   不再单独置顶 ActivityLog */}

			{visibleSegments.map((seg, i) => {
				if (seg.type === "toolgroup") {
					return <ToolGroup key={`tg-${seg.tcs[0].id}`} tcs={seg.tcs} />;
				}
				if (seg.type === "toolcall") {
					// 2026-08-31: AskUser 提问卡迁移到 ChatInput 上方渲染(AskUserDock),
					// 避免在气泡里展开时与顶部卡重复,也让用户无论怎么滚都看得到提问
					if (seg.tc.toolName === "AskUser") {
						return null;
					}
					return <ToolCallActivity key={`tc-${seg.tc.id}`} tc={seg.tc} />;
				}
				return (
					<SegmentBlock
						autoFoldThink={autoFoldThink}
						isLast={i === visibleSegments.length - 1}
						isStreaming={isStreaming}
						// R2 (2026-09-06): key 用段起始偏移(稳定),替代 `${type}-${i}`
						// 修复: 旧 key 含 type,段类型变化时组件重建,typeRef 折叠态重置逻辑成死代码
						key={`seg-${seg.start}`}
						seg={seg}
					/>
				);
			})}

			{/* --- 底部打字机指示器：仅在流式期间显示 --- */}
			{isStreaming && <StreamingTailIndicator tailPreview={tailPreview} />}
		</div>
	);
});

/** 流式输出底部打字机指示器 */
function StreamingTailIndicator({ tailPreview }: { tailPreview: string }) {
	return (
		<div className="text-muted-foreground/70 flex items-center gap-2 text-xs">
			<span className="relative inline-flex h-[6px] w-[6px] shrink-0">
				<span className="bg-primary/60 absolute inset-0 animate-ping rounded-full" />
				<span className="bg-primary relative inline-block h-[6px] w-[6px] rounded-full" />
			</span>
			<span className="shrink-0">正在输出</span>
			{tailPreview ? (
				<span className="flex min-w-0 items-center gap-1 truncate">
					<span className="text-muted-foreground/50 shrink-0">·</span>
					<span className="truncate font-mono">{tailPreview}</span>
					<span className="bg-primary ml-0.5 inline-block h-3 w-[2px] shrink-0 animate-pulse" />
				</span>
			) : (
				<span className="bg-primary ml-0.5 inline-block h-3 w-[2px] shrink-0 animate-pulse" />
			)}
		</div>
	);
}

interface SegmentBlockProps {
	autoFoldThink: boolean;
	isLast: boolean;
	isStreaming: boolean;
	seg: Segment;
}

function SegmentBlock({
	autoFoldThink,
	isLast,
	isStreaming,
	seg,
}: SegmentBlockProps) {
	const [isExpanded, setIsExpanded] = useState(() => {
		// output 和 file 默认展开；think / tool_call 默认折叠
		return seg.type === "output" || seg.type === "file";
	});
	/** 用户在当前 type 维度是否手动干预过折叠状态
	 *  修复 1 v2 (2026-07-10): 按 type 维度记忆, 避免 output 上手动展开后 think 默认折叠被错误继承;
	 *  原实现用单一 boolean, 切到新 type 时不会重置, 错误延续上一 type 的用户态.
	 */
	const userControlledByTypeRef = useRef<Record<Segment["type"], boolean>>({
		file: false,
		output: false,
		think: false,
	});
	const userControlled = userControlledByTypeRef.current[seg.type];
	/** 记录上一帧 done 状态，用于检测 false -> true 转换 */
	const doneRef = useRef(seg.done);
	/** 记录上一帧 seg.type, 用于检测 type 切换时重置折叠态 */
	const typeRef = useRef(seg.type);
	/** 2026-08-31: think 块内部滚动容器 ref,用于流式期间自动滚到底 */
	const thinkScrollRef = useRef<HTMLDivElement | null>(null);
	/** 用户是否主动向上滚动过(向上翻看历史)— 此时不应强制滚到底 */
	const userScrolledUpRef = useRef(false);

	/** 修复 1 (2026-07-10): seg.type 切换时(例: output → think → output)按"新 type 的用户态"重置折叠态
	 *  旧实现: useState lazy init 只跑一次, 流式期间同 i 位置 seg.type 变化时 isExpanded 不会重置,
	 *          导致 think 段永远显示的是"上一段 output 的展开态", 折叠按钮不渲染.
	 * 新实现: 检测到 type 变化, 若用户在"新 type 维度"未手动干预则按"新 type 的默认态"重置 */
	useEffect(() => {
		if (typeRef.current !== seg.type) {
			if (!userControlledByTypeRef.current[seg.type]) {
				setIsExpanded(seg.type === "output" || seg.type === "file");
			}
			typeRef.current = seg.type;
		}
	}, [seg.type]);

	/** 仅在 think 首次完成时自动折叠（若用户在 think 维度未干预） */
	useEffect(() => {
		if (
			!doneRef.current &&
			seg.done &&
			seg.type === "think" &&
			autoFoldThink &&
			!userControlledByTypeRef.current.think
		) {
			setIsExpanded(false);
		}
		doneRef.current = seg.done;
	}, [seg.done, seg.type, autoFoldThink]);

	/** 2026-08-31: think 块内容变化时自动滚到底
	 *  触发条件:
	 *   - 思考进行中(seg.type==="think" && !seg.done): 强制滚到底
	 *   - 用户刚展开已完成 think: 滚到底(让用户看到结尾)
	 *  防护: 用户主动向上滚轮翻看历史时, 不强制滚动(尊重用户阅读位置)
	 *  实现: 每次 content 变化后,若未向上滚则 scrollTop = scrollHeight
	 */
	useEffect(() => {
		if (seg.type !== "think") return;
		const el = thinkScrollRef.current;
		if (!el) return;
		// 内容变化时,若用户没主动向上滚 → 滚到底
		if (!userScrolledUpRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [seg.content, seg.type, isExpanded]);

	const handleToggle = () => {
		userControlledByTypeRef.current[seg.type] = true;
		setIsExpanded((prev) => !prev);
	};

	const isThinking = seg.type === "think";
	const isFile = seg.type === "file";
	const isCurrentSegment = isLast && isStreaming;
	const isThinkingInProgress = isThinking && !seg.done;

	return (
		<div className="group">
			{/* --- 头部 --- */}
			{isFile ? (
				<div className="text-muted-foreground/50 flex items-center gap-1.5 text-xs">
					<span>📄</span>
					<span>文件</span>
				</div>
			) : isThinking ? (
				<button
					className="text-muted-foreground/80 hover:text-muted-foreground flex items-center gap-1.5 text-xs transition-colors"
					onClick={handleToggle}>
					{isThinkingInProgress ? (
						<Loader2 className="h-[12px] w-[12px] animate-spin" />
					) : (
						<Brain className="h-[12px] w-[12px]" />
					)}
					<span>
						{isThinkingInProgress
							? "正在思考..."
							: isExpanded
								? "隐藏思考"
								: "查看思考"}
					</span>
					{(isThinkingInProgress ? null : isExpanded) ? (
						<ChevronUp className="h-[12px] w-[12px]" />
					) : (
						<ChevronDown className="h-[12px] w-[12px]" />
					)}
				</button>
			) : (
				<div className="text-muted-foreground/50 flex items-center gap-1.5 text-xs">
					<MessageSquare className="h-[12px] w-[12px]" />
					<span>回答</span>
				</div>
			)}

			{/* --- 内容区域 --- */}
			{isExpanded && (
				<div className="mt-2 w-full min-w-0 text-[15px] leading-relaxed">
					{isFile ? (
						<FileBlock isStreaming={isCurrentSegment}>{seg.content}</FileBlock>
					) : isThinking ? (
						<div
							className="text-muted-foreground/80 max-h-[30vh] overflow-y-auto border-primary/20 bg-muted/30 overflow-hidden whitespace-pre-wrap break-words rounded-r-md border-l-2 p-2 pl-2 italic"
							ref={thinkScrollRef}
							onScroll={(e) => {
								// 检测用户主动向上滚: scrollTop 距底 > 30px 则视为"在看历史"
								const t = e.currentTarget;
								const distanceToBottom =
									t.scrollHeight - t.scrollTop - t.clientHeight;
								userScrolledUpRef.current = distanceToBottom > 30;
							}}>
							{seg.content}
						</div>
					) : (
						(() => {
							// 关键修复:伪表格前置检测,直接渲染,绕过 react-markdown(避免 [object Object])
							const preRows = parsePipeTable(seg.content);
							if (preRows) {
								return (
									<div className="w-full min-w-0 max-w-full leading-relaxed break-words">
										<PipeTable rows={preRows} />
									</div>
								);
							}
							return (
								<div className="prose prose-sm dark:prose-invert w-full min-w-0 max-w-full leading-relaxed break-words [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-all">
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										components={{
											code({ className, node, children, ...props }) {
												const match = /language-(\w+)/.exec(className || "");
												const isInline = !match && !className;
												if (isInline) {
													return (
														<code
															className={`${className} bg-primary/10 text-primary rounded-md px-1.5 py-0.5`}
															{...props}>
															{children}
														</code>
													);
												}
												return (
													<CodeBlock
														isStreaming={isCurrentSegment}
														language={match ? match[1] : ""}>
														{String(children).replace(/\n$/, "")}
													</CodeBlock>
												);
											},
										}}>
										{seg.content}
									</ReactMarkdown>
								</div>
							);
						})()
					)}
					{isCurrentSegment && !isThinking && (
						<span className="bg-primary ml-1 inline-block h-4 w-2 animate-pulse align-middle"></span>
					)}
				</div>
			)}
		</div>
	);
}

/** 2026-08-31 抽离: parseContent / 标签常量 / mergeToolOps 已迁至
 *  frontend/src/components/chat/hooks/useStreamingSegments.ts
 *  本文件保留 UI 渲染 + 折叠态管理
 */

/** 文件块组件，支持折叠 */
function FileBlock({
	isStreaming,
	children,
}: {
	children: string;
	isStreaming: boolean;
}) {
	const [isExpanded, setIsExpanded] = useState(!isStreaming);
	// 解析 @@FILE:xxx\n... 获取文件路径和内容
	const match = children.match(/^@@FILE:(.+)\n([\s\S]*)$/);
	const filePath = match?.[1] || "未知文件";
	const fileContent = match?.[2] || "";
	const lineCount = fileContent.split("\n").length;

	return (
		<div className="border-border w-full min-w-0 rounded-lg border">
			{/* 文件块头部 */}
			<button
				className="bg-muted hover:bg-muted/80 flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors"
				onClick={() => setIsExpanded(!isExpanded)}>
				<span className="text-muted-foreground flex-1 truncate text-left font-medium">
					📄 {filePath}
				</span>
				<div className="flex items-center gap-1">
					<span className="text-muted-foreground">{lineCount} 行</span>
					{isExpanded ? (
						<ChevronUp className="h-[12px] w-[12px]" />
					) : (
						<ChevronDown className="h-[12px] w-[12px]" />
					)}
				</div>
			</button>

			{/* 文件内容 */}
			{isExpanded && (
				<div className="relative w-full overflow-x-auto">
					{isStreaming ? (
						// P2 (2026-09-06): 流式期间降级纯文本渲染,避免每帧全量语法高亮(性能杀手)
						<pre className="bg-[#282c34] w-full rounded-b-lg p-3 font-mono text-[0.85rem] leading-relaxed whitespace-pre-wrap break-all text-gray-200">
							{fileContent}
						</pre>
					) : (
						<SyntaxHighlighter
							customStyle={{
								borderRadius: "0 0 0.5rem 0.5rem",
								fontSize: "0.85rem",
								margin: 0,
								maxWidth: "100%",
								overflowX: "auto",
								width: "100%",
							}}
							language="text"
							style={oneDark}>
							{fileContent}
						</SyntaxHighlighter>
					)}
					{isStreaming && (
						<span className="text-primary absolute bottom-2 right-2 animate-pulse text-xs">
							▊
						</span>
					)}
				</div>
			)}
		</div>
	);
}

/** 代码块组件，支持折叠 */
function CodeBlock({
	isStreaming,
	language,
	children,
}: {
	children: string;
	isStreaming: boolean;
	language: string;
}) {
	/** 代码块默认折叠 */
	const [isExpanded, setIsExpanded] = useState(false);
	const isLongCode = children.split("\n").length > 10;
	/** 是否应该折叠：代码块始终默认折叠 */
	const shouldFold = true;

	if (!shouldFold) {
		// 短代码且非流式，直接显示
		return (
			<SyntaxHighlighter
				customStyle={{
					borderRadius: "0.5rem",
					fontSize: "0.85rem",
					margin: "0.5rem 0",
					maxWidth: "100%",
					overflowX: "auto",
					width: "100%",
				}}
				language={language || "text"}
				style={oneDark}>
				{children}
			</SyntaxHighlighter>
		);
	}

	return (
		<div className="border-border w-full min-w-0 my-2 rounded-lg border">
			{/* 代码块头部 */}
			<button
				className="bg-muted hover:bg-muted/80 flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors"
				onClick={() => setIsExpanded(!isExpanded)}>
				<span className="text-muted-foreground font-medium">
					{language || "代码"}
				</span>
				<div className="flex items-center gap-1">
					{isLongCode && (
						<span className="text-muted-foreground">
							{children.split("\n").length} 行
						</span>
					)}
					{isExpanded ? (
						<ChevronUp className="h-[12px] w-[12px]" />
					) : (
						<ChevronDown className="h-[12px] w-[12px]" />
					)}
				</div>
			</button>

			{/* 代码内容 */}
			{isExpanded && (
				<div className="relative w-full overflow-x-auto">
					{isStreaming ? (
						// P2 (2026-09-06): 流式期间降级纯文本渲染,避免每帧全量语法高亮(性能杀手)
						<pre className="bg-[#282c34] w-full rounded-b-lg p-3 font-mono text-[0.85rem] leading-relaxed whitespace-pre-wrap break-all text-gray-200">
							{children}
						</pre>
					) : (
						<SyntaxHighlighter
							customStyle={{
								borderRadius: "0 0 0.5rem 0.5rem",
								fontSize: "0.85rem",
								margin: 0,
								maxWidth: "100%",
								overflowX: "auto",
								width: "100%",
							}}
							language={language || "text"}
							style={oneDark}>
							{children}
						</SyntaxHighlighter>
					)}
					{isStreaming && (
						<span className="text-primary absolute bottom-2 right-2 animate-pulse text-xs">
							▊
						</span>
					)}
				</div>
			)}
		</div>
	);
}

/* === 活动日志：读了什么 / 改了什么(2026-07-06 P1-2) =========================== */

/** 工具名 → 展示配置:动词 + 图标
 *  按 toolName(已是 canonical PascalCase)分桶,未识别走 default
 *  PascalCase 为主键(P0 流量),snake_case 旧键保留用于历史会话续传兜底
 *  设计原则:动词简短(< 8 字符),图标用 Lucide 12px 与现有风格一致
 */
const TOOL_ACTIVITY_DISPLAY: Record<
	string,
	{ icon: LucideIcon; verb: string }
> = {
	ReadFile: { icon: FileText, verb: "Read" },
	WriteFile: { icon: FileEdit, verb: "已写入" },
	ReplaceInFile: { icon: FileEdit, verb: "已编辑" },
	DeleteFile: { icon: FileMinus, verb: "已删除" },
	SearchFiles: { icon: Search, verb: "搜索" },
	ListDir: { icon: FolderOpen, verb: "列出" },
	GrepFiles: { icon: FileSearch, verb: "搜索" },
	ReplaceInFileRegex: { icon: FileEdit, verb: "已编辑" },
	// 2026-07-23 工具名统一 PascalCase 后,主键 + 旧名双写
	SubmitPlan: { icon: ListTodo, verb: "提交计划" },
	TodoWrite: { icon: ListTodo, verb: "更新 TODO" },
	TodoAdd: { icon: ListTodo, verb: "新增 TODO" },
	TodoList: { icon: ListTodo, verb: "列出 TODO" },
	TodoToggle: { icon: ListTodo, verb: "切换 TODO" },
	TodoUpdateStatus: { icon: ListTodo, verb: "更新状态" },
	TodoEdit: { icon: ListTodo, verb: "编辑 TODO" },
	TodoSetPriority: { icon: ListTodo, verb: "调整优先级" },
	TodoDelete: { icon: ListTodo, verb: "删除 TODO" },
	TodoClearCompleted: { icon: ListTodo, verb: "清理完成" },
	ListTools: { icon: Wrench, verb: "列出工具" },
	GetToolDef: { icon: Wrench, verb: "查看工具" },
	// 2026-07-24: 交互工具 — AI 向用户提问
	AskUser: { icon: HelpCircle, verb: "询问用户" },
};

const DEFAULT_ACTIVITY_DISPLAY: { icon: LucideIcon; verb: string } = {
	icon: Terminal,
	verb: "调用",
};

// ToolGroupSegment / mergeToolOps / TOOL_GROUP_THRESHOLD 已抽离到 useStreamingSegments

/** 2026-07-08: 取工具的 pending 状态展示动词
 *  pending 时返回 <动词>中(Read→读取中、Write→写入中、Edit→编辑中、Delete→删除中、其它→执行中)
 *  注意: 函数只产生纯字符串,不消费 React state,可在 header title 中安全使用
 */
function getInProgressVerb(toolName: string): string {
	const display = TOOL_ACTIVITY_DISPLAY[toolName] ?? DEFAULT_ACTIVITY_DISPLAY;
	const verb = display.verb;
	// 中文动词: 去尾"已"再补"中"(已写入→写入中),消除"已...中"双重完成态
	if (/[\u4e00-\u9fa5]/.test(verb)) {
		return verb.endsWith("已") ? `${verb}中` : `${verb}中`;
	}
	// 英文动词按"动词+ing"语义转中文
	const map: Record<string, string> = {
		Read: "读取中",
		Search: "搜索中",
	};
	return map[verb] ?? `${verb}中`;
}

/** 取一条 tc 的活动行文本(动词 + 文件名 + 详情 + 时长)
 *  用途: ToolGroup header 的"最后: xxx"展示,以及 ToolCallActivity 单行显示
 *  返回字符串不含 icon/chevron,只含语义文本
 */
function formatActivityLine(tc: ToolCall): string {
	const display =
		TOOL_ACTIVITY_DISPLAY[tc.toolName] ?? DEFAULT_ACTIVITY_DISPLAY;
	const { verb } = display;
	const isPending = tc.status === "pending";
	const target = getActivityTarget(tc);
	const fileName = getShortName(target);
	const detail = getActivityDetail(tc);
	const inProgressVerb = isPending ? getInProgressVerb(tc.toolName) : verb;
	const parts: string[] = [inProgressVerb];
	if (fileName) parts.push(fileName);
	if (detail) parts.push(detail);
	if (tc.status === "success" && tc.duration != null) {
		parts.push(`${tc.duration}ms`);
	}
	return parts.join(" · ");
}

/** 取一组 tcs 中"最新"的一条 — 用于 ToolGroup header
 *  规则: 优先取最后一条 status !== "pending" 的(用户更关心"已完成什么");
 *       若全部 pending 则取最后一条
 *  严格说应该用时间戳排序,但 store 写入顺序已是时间序,数组最后 = 最新
 */
function getLatestTc(tcs: ToolCall[]): ToolCall | undefined {
	for (let i = tcs.length - 1; i >= 0; i--) {
		if (tcs[i].status !== "pending") return tcs[i];
	}
	return tcs[tcs.length - 1];
}

/** 从 input 中抽取主要 target(文件路径 / 搜索关键词 / 命令) */
function getActivityTarget(tc: ToolCall): string {
	const input = (tc.input ?? {}) as Record<string, unknown>;
	const path = (input.path ??
		input.filePath ??
		input.file_path ??
		input.file ??
		"") as string;
	if (path) return path;
	const keyword = (input.keyword ??
		input.query ??
		input.pattern ??
		"") as string;
	if (keyword) return keyword;
	const command = (input.command ?? input.cmd ?? input.shell ?? "") as string;
	if (command) return command;
	return "";
}

/** 提取路径短名(取最后一段 basename) */
function getShortName(target: string): string {
	if (!target) return "";
	return target.split(/[/\\]/).pop() || target;
}

/** 工具调用详情后缀(逗号后面那一段) */
function getActivityDetail(tc: ToolCall): string {
	const input = (tc.input ?? {}) as Record<string, unknown>;
	switch (tc.toolName) {
		case "ReadFile": {
			const start = input.startLine as number | undefined;
			const end = input.endLine as number | undefined;
			if (start != null) {
				// 后端 startLine 是 0-based 索引,展示给用户时 +1
				return `lines ${start + 1} to ${end ?? "?"}`;
			}
			return "";
		}
		case "WriteFile":
		case "ReplaceInFile":
		case "ReplaceInFileRegex": {
			// 用 || 替代 ?? :Number("") / Number({}) / Number(null) 都返回 NaN,|| 兜底为 0
			const added = Number(input.added) || 0;
			const removed = Number(input.removed) || 0;
			if (added || removed) return `+${added} -${removed}`;
			// 退化: WriteFile 有 content 长度,ReplaceInFile 有 oldText/newText 长度
			const contentLen = (input.content as string | undefined)?.length;
			if (contentLen != null) return `${contentLen} 字符`;
			const oldLen = (input.oldText as string | undefined)?.length ?? 0;
			const newLen = (input.newText as string | undefined)?.length ?? 0;
			if (oldLen || newLen) return `${oldLen}→${newLen} 字符`;
			return "";
		}
		case "SearchFiles": {
			const keyword = input.keyword as string | undefined;
			return keyword ? `keyword: "${keyword}"` : "";
		}
		case "GrepFiles": {
			const pattern = input.pattern as string | undefined;
			return pattern ? `pattern: "${pattern}"` : "";
		}
		default:
			return "";
	}
}

/** 单条活动行 — IDE 风格一行总结:动词 + 图标 + 短名 + 详情 */
function ToolCallActivity({ tc }: { tc: ToolCall }) {
	const display =
		TOOL_ACTIVITY_DISPLAY[tc.toolName] ?? DEFAULT_ACTIVITY_DISPLAY;
	const { verb, icon: Icon } = display;
	const target = getActivityTarget(tc);
	const fileName = getShortName(target);
	const detail = getActivityDetail(tc);
	const [isExpanded, setIsExpanded] = useState(false);

	const isPending = tc.status === "pending";
	const isError = tc.status === "error";
	const isSuccess = tc.status === "success";
	// pending 显示旋转 loader,完成态用主图标
	const LeadingIcon = isPending ? Loader2 : Icon;
	const leadingColor = isError
		? "text-red-500"
		: isSuccess
			? "text-foreground/70"
			: "text-muted-foreground";

	return (
		<div className="group/activity">
			<button
				className="text-muted-foreground hover:text-foreground hover:bg-muted/40 flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition-colors"
				onClick={() => setIsExpanded(!isExpanded)}
				title={`${tc.toolName}${tc.error ? ` — ${tc.error}` : ""}`}>
				<LeadingIcon
					className={`h-[12px] w-[12px] shrink-0 ${leadingColor} ${isPending ? "animate-spin" : ""}`}
				/>
				<span className="shrink-0 font-medium">{verb}</span>
				{fileName && (
					<>
						<FileText className="h-[10px] w-[10px] shrink-0 opacity-40" />
						<span className="min-w-0 truncate font-mono">{fileName}</span>
					</>
				)}
				{detail && (
					<span className="text-muted-foreground/70 shrink-0">, {detail}</span>
				)}
				{isSuccess && tc.duration != null && (
					<span className="text-muted-foreground/50 shrink-0">
						· {tc.duration}ms
					</span>
				)}
				{/* isError 已在 LeadingIcon 变红表达 */}
				{isExpanded ? (
					<ChevronUp className="ml-auto h-[12px] w-[12px] shrink-0 opacity-60" />
				) : (
					<ChevronDown className="ml-auto h-[12px] w-[12px] shrink-0 opacity-0 transition-opacity group-hover/activity:opacity-60" />
				)}
			</button>
			{isExpanded && (
				<div className="text-muted-foreground ml-5 mt-0.5 space-y-1 text-xs">
					<div>
						<span className="opacity-60">参数</span>
						<pre className="bg-muted/30 mt-0.5 max-w-full overflow-x-auto rounded p-1.5 font-mono text-[11px] leading-relaxed">
							{JSON.stringify(tc.input, null, 2)}
						</pre>
					</div>
					{tc.error && (
						<div className="text-red-500">
							<span className="opacity-60">错误</span> {tc.error}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ActivityLog 容器在 P1-2 (2026-07-06) 调整中被移除:工具块不再置顶聚合渲染,
// 而是作为 toolcall 段织入 visibleSegments,跟随对应 output 段渲染。
// ToolCallActivity 仍保留,被 SegmentBlock 之外的内联渲染路径使用。

/** 连续多个工具的折叠容器
 *  触发条件: visibleSegments 中连续 ≥ TOOL_GROUP_THRESHOLD 个 ToolCallSegment
 *  UI 风格: 复用 CodeBlock / FileBlock 的"头部一行 + chevron + 折叠体"模式
 *  默认折叠, header tooltip 显示"最后操作: <formatActivityLine(latest)>"
 */
function ToolGroup({ tcs }: { tcs: ToolCall[] }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const latest = getLatestTc(tcs);
	const latestText = latest ? formatActivityLine(latest) : "";
	const hasPending = tcs.some((tc) => tc.status === "pending");
	// 2026-08-31 增补: 完整顺序概览(成功 N / 失败 M),解决"合并后只显示最后"混淆
	const successCount = tcs.filter((tc) => tc.status === "success").length;
	const errorCount = tcs.filter((tc) => tc.status === "error").length;
	// 完成度概览: 全部 success → 1 个绿点; 有 error → 1 个红点; 还在跑 → 1 个蓝点
	const LeadingIcon = hasPending ? Loader2 : FolderOpen;
	const leadingColor = hasPending
		? "text-blue-500 animate-spin"
		: errorCount > 0
			? "text-red-500"
			: "text-foreground/70";

	return (
		<div className="group/fog">
			<button
				className="text-muted-foreground hover:text-foreground hover:bg-muted/40 flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition-colors"
				onClick={() => setIsExpanded(!isExpanded)}
				title={`最后操作: ${latestText}${latest?.toolName ? `\n工具: ${latest.toolName}` : ""}`}>
				<LeadingIcon className={`h-[12px] w-[12px] shrink-0 ${leadingColor}`} />
				<span className="shrink-0 font-medium">工具执行</span>
				<span className="text-muted-foreground/70 shrink-0">
					({tcs.length})
				</span>
				{/* 成功/失败概览 — 折叠态下也能一眼看到全部进度 */}
				{successCount > 0 && (
					<span className="shrink-0 text-green-600 dark:text-green-400">
						✓{successCount}
					</span>
				)}
				{errorCount > 0 && (
					<span className="shrink-0 text-red-500">✗{errorCount}</span>
				)}
				{hasPending && (
					<span className="shrink-0 text-blue-500">…{tcs.length - successCount - errorCount}</span>
				)}
				{latestText && (
					<>
						<span className="text-muted-foreground/60 shrink-0">·</span>
						<span className="min-w-0 truncate">
							<span className="text-muted-foreground/70 shrink-0">最后: </span>
							<span className="font-mono">{latestText}</span>
						</span>
					</>
				)}
				{isExpanded ? (
					<ChevronUp className="ml-auto h-[12px] w-[12px] shrink-0 opacity-60" />
				) : (
					<ChevronDown className="ml-auto h-[12px] w-[12px] shrink-0 opacity-0 transition-opacity group-hover/fog:opacity-60" />
				)}
			</button>
			{isExpanded && (
				<div className="ml-1 mt-0.5 space-y-0.5 border-l border-border/40 pl-2">
					{tcs.map((tc) => (
						<ToolCallActivity key={tc.id} tc={tc} />
					))}
				</div>
			)}
		</div>
	);
}
