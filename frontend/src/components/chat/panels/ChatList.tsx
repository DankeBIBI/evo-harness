import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import {
	CheckSquare,
	ChevronDown,
	ChevronUp,
	MessageSquare,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

/** 简易中文相对时间格式化 */
function formatDistanceToNow(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30);

	if (seconds < 60) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	if (hours < 24) return `${hours} 小时前`;
	if (days < 30) return `${days} 天前`;
	if (months < 12) return `${months} 个月前`;
	return `${Math.floor(months / 12)} 年前`;
}

interface ChatListProps {
	className?: string;
	/** 紧凑模式：隐藏搜索框和新建按钮 */
	compact?: boolean;
	/** 紧凑模式下由外层控制是否显示搜索框 */
	showSearch?: boolean;
	/** 选中或新建对话后回调，用于页面跳转 */
	onSelect?: (
		conversationId: string,
		startPos?: { x: number; y: number },
	) => void;
}

export function ChatList({
	className,
	compact = false,
	showSearch = false,
	onSelect,
}: ChatListProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [isExpanded, setIsExpanded] = useState(false);
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const convItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const {
		conversations,
		currentConversationId,
		streamingConvId,
		addConversation,
		setCurrentConversation,
		deleteConversation,
		deleteMultiple,
	} = useChatStore();

	const VISIBLE_COUNT = 3;

	const filteredConversations = useMemo(
		() =>
			conversations.filter((conv) =>
				(conv.title || "").toLowerCase().includes(searchQuery.toLowerCase()),
			),
		[conversations, searchQuery],
	);

	/** 搜索时全部展示，非搜索时按折叠状态截断 */
	const visibleConversations = useMemo(() => {
		if (searchQuery) return filteredConversations;
		return isExpanded
			? filteredConversations
			: filteredConversations.slice(0, VISIBLE_COUNT);
	}, [filteredConversations, isExpanded, searchQuery]);

	const hiddenCount =
		filteredConversations.length - visibleConversations.length;

	const handleCreateConversation = () => {
		const newConvId = `conv-${Date.now()}`;
		addConversation({
			agentId: "",
			createdAt: new Date().toISOString(),
			debugLogs: [],
			id: newConvId,
			isArchived: false,
			isStarred: false,
			lastMessageAt: new Date().toISOString(),
			messages: [],
			title: "新对话", // 标题在发送首条消息时由 ChatWindow 更新
			updatedAt: new Date().toISOString(),
		});
		setCurrentConversation(newConvId);
		onSelect?.(newConvId);
	};

	const handleSelectConversation = useCallback(
		(convId: string) => {
			const el = convItemRefs.current.get(convId);
			if (el) {
				const rect = el.getBoundingClientRect();
				const startPos = {
					x: rect.left + rect.width / 2,
					y: rect.top + rect.height / 2,
				};
				setCurrentConversation(convId);
				onSelect?.(convId, startPos);
			} else {
				setCurrentConversation(convId);
				onSelect?.(convId);
			}
		},
		[setCurrentConversation, onSelect],
	);

	const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		if (window.confirm("确定要删除这个对话吗？")) {
			deleteConversation(id);
		}
	};

	return (
		<div className={cn("flex flex-col h-full bg-sidebar", className)}>
			{/* 搜索区域 */}
			{(!compact || showSearch) && (
				<div className="p-3 border-b border-sidebar-border">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2  text-muted-foreground" />
						<Input
							type="text"
							placeholder="搜索对话..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9 pr-9 h-9 bg-sidebar-accent border-sidebar-border focus-visible:ring-sidebar-ring"
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
								<X className="" />
							</button>
						)}
					</div>
				</div>
			)}

			{/* 新建 & 选择 */}
			{!compact && (
				<div className="flex gap-2 p-3">
					<Button
						onClick={handleCreateConversation}
						className="flex-1 justify-start gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
						<Plus className="" />
						新建对话
					</Button>
					<Button
						onClick={() => {
							setIsSelectionMode(!isSelectionMode);
							setSelectedIds(new Set());
						}}
						variant={isSelectionMode ? "secondary" : "ghost"}
						size="icon"
						title={isSelectionMode ? "取消选择" : "批量选择"}
						className="h-9 w-9 shrink-0">
						<CheckSquare className="h-5 w-5" />
					</Button>
				</div>
			)}

			{/* 对话列表 */}
			<div className="flex-1 overflow-y-auto px-3">
				{/* 选择模式提示 */}
				{isSelectionMode && (
					<div className="mb-1 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-xs">
						<span className="text-primary font-medium">
							已选 {selectedIds.size} 项
						</span>
						<button
							onClick={() => {
								setSelectedIds(new Set(filteredConversations.map((c) => c.id)));
							}}
							className="text-primary hover:underline">
							全选
						</button>
					</div>
				)}
				<div className="space-y-1 py-1 ">
					{filteredConversations.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							<MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">
								{searchQuery ? "没有找到匹配的对话" : "暂无对话记录"}
							</p>
						</div>
					) : (
						<>
							{visibleConversations.map((conv) => (
								<div
									key={conv.id}
									ref={(el) => {
										if (el) convItemRefs.current.set(conv.id, el);
										else convItemRefs.current.delete(conv.id);
									}}
									onClick={() => handleSelectConversation(conv.id)}
									className={cn(
										"group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
										currentConversationId === conv.id
											? "bg-sidebar-accent text-sidebar-accent-foreground"
											: "text-sidebar-foreground hover:bg-sidebar-accent/50",
									)}>
									{isSelectionMode && (
										<input
											type="checkbox"
											checked={selectedIds.has(conv.id)}
											onChange={(e) => {
												e.stopPropagation();
												setSelectedIds((prev) => {
													const next = new Set(prev);
													if (next.has(conv.id)) next.delete(conv.id);
													else next.add(conv.id);
													return next;
												});
											}}
											className="h-5 w-5 shrink-0 rounded accent-primary"
										/>
									)}
									<MessageSquare className=" shrink-0 opacity-60" />
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-1.5">
											<span className="font-medium text-sm truncate">
												{conv.title || "新对话"}
											</span>
											{streamingConvId === conv.id && (
												<span className="relative flex h-2 w-2 shrink-0">
													<span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"></span>
													<span className="bg-primary relative inline-flex h-2 w-2 rounded-full"></span>
												</span>
											)}
										</div>
										<div className="text-xs text-muted-foreground truncate">
											{formatDistanceToNow(new Date(conv.updatedAt))}
										</div>
									</div>

									{/* 删除按钮 — 选择模式下隐藏 */}
									{!isSelectionMode && (
										<Button
											variant="ghost"
											size="icon"
											onClick={(e) => handleDeleteConversation(e, conv.id)}
											className="h-7 w-7 shrink-0 hover:bg-destructive/10 hover:text-destructive">
											<Trash2 className="" />
										</Button>
									)}
								</div>
							))}

							{/* 展开更多 — 仅在非搜索且有隐藏项时 */}
							{!searchQuery && hiddenCount > 0 && (
								<button
									onClick={() => setIsExpanded(!isExpanded)}
									className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-sidebar-accent/50">
									{isExpanded ? (
										<>
											<ChevronUp className="h-[14px] w-[14px]" />
											收起 {hiddenCount} 条
										</>
									) : (
										<>
											<ChevronDown className="h-[14px] w-[14px]" />
											展开更多 ({hiddenCount})
										</>
									)}
								</button>
							)}
						</>
					)}
				</div>
			</div>

			{/* 批量删除栏 */}
			{isSelectionMode && selectedIds.size > 0 && (
				<div className="flex items-center justify-between border-t border-sidebar-border bg-sidebar p-3">
					<span className="text-xs text-muted-foreground">
						已选 {selectedIds.size} 个对话
					</span>
					<Button
						onClick={() => {
							if (
								window.confirm(
									`确定要删除 ${selectedIds.size} 个对话吗？此操作不可撤销。`,
								)
							) {
								deleteMultiple([...selectedIds]);
								setSelectedIds(new Set());
								setIsSelectionMode(false);
							}
						}}
						variant="destructive"
						size="sm"
						className="gap-1">
						<Trash2 className="h-[14px] w-[14px]" />
						删除选中
					</Button>
				</div>
			)}
		</div>
	);
}
