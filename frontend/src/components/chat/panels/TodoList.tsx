import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { Todo } from "@/stores/todoStore";
import { useTodoStore } from "@/stores/todoStore";
import {
	AlertCircle,
	ArrowUp,
	Bot,
	Check,
	ChevronDown,
	Circle,
	ListTodo,
	Loader2,
	Minus,
	Plus,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const priorityConfig: Record<
	Todo["priority"],
	{ color: string; icon: React.ElementType; label: string }
> = {
	high: {
		color: "text-red-500",
		icon: AlertCircle,
		label: "高",
	},
	low: {
		color: "text-gray-400",
		icon: ArrowUp,
		label: "低",
	},
	medium: {
		color: "text-amber-500",
		icon: Minus,
		label: "中",
	},
};

const priorityOrder: Todo["priority"][] = ["high", "medium", "low"];

/** Status 视觉映射：图标 + 颜色（in_progress 高亮、completed 半透明、pending 默认） */
const statusConfig: Record<
	Todo["status"],
	{ color: string; icon: React.ElementType; label: string }
> = {
	completed: {
		color: "text-green-500",
		icon: Check,
		label: "已完成",
	},
	in_progress: {
		color: "text-blue-500",
		icon: Loader2,
		label: "进行中",
	},
	pending: {
		color: "text-muted-foreground",
		icon: ListTodo,
		label: "待办",
	},
};

/** 多选操作栏 */
function BatchActions({
	onClearCompleted,
	onDeleteSelected,
	selectedCount,
	totalCount,
}: {
	onClearCompleted: () => void;
	onDeleteSelected: () => void;
	selectedCount: number;
	totalCount: number;
}) {
	if (selectedCount === 0 && totalCount === 0) return null;

	return (
		<div className="border-border flex items-center gap-2 border-t px-3 py-2">
			{selectedCount > 0 && (
				<Button
					className="text-xs"
					onClick={onDeleteSelected}
					size="sm"
					variant="destructive">
					删除选中 ({selectedCount})
				</Button>
			)}
			<Button
				className="text-xs"
				onClick={onClearCompleted}
				size="sm"
				variant="ghost">
				清除已完成
			</Button>
		</div>
	);
}

/** 单个 todo 项 */
function TodoItem({
	isSelected,
	onSelect,
	todo,
}: {
	isSelected: boolean;
	onSelect: (id: string) => void;
	todo: Todo;
}) {
	const toggleTodo = useTodoStore((s) => s.toggleTodo);
	const deleteTodo = useTodoStore((s) => s.deleteTodo);
	const editTodo = useTodoStore((s) => s.editTodo);
	const setPriority = useTodoStore((s) => s.setPriority);
	const updateTodoStatus = useTodoStore((s) => s.updateTodoStatus);
	const [isEditing, setIsEditing] = useState(false);
	const [editText, setEditText] = useState(todo.text);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isEditing) inputRef.current?.focus();
	}, [isEditing]);

	const PriorityIcon = priorityConfig[todo.priority].icon;
	const status = todo.status ?? "pending";
	const statusView = statusConfig[status];
	const isAI = todo.source === "ai";
	const isCompleted = status === "completed";

	const handleSaveEdit = useCallback(() => {
		const trimmed = editText.trim();
		if (trimmed && trimmed !== todo.text) {
			editTodo(todo.id, trimmed);
		}
		setIsEditing(false);
	}, [editText, todo.id, todo.text, editTodo]);

	const cyclePriority = useCallback(() => {
		const idx = priorityOrder.indexOf(todo.priority);
		const next = priorityOrder[(idx + 1) % priorityOrder.length];
		setPriority(todo.id, next);
	}, [todo.id, todo.priority, setPriority]);

	return (
		<div
			className={cn(
				"group flex items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors",
				todo.status === "completed" && "opacity-50",
				todo.status === "in_progress" && "bg-blue-500/5",
				isSelected && "bg-accent",
				"hover:bg-accent/50",
			)}>
			{/* 状态图标（单击循环 pending → in_progress → completed → pending） */}
			<button
				aria-label={statusView.label}
				className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 hover:bg-accent"
				onClick={() => {
					const next: Todo["status"] =
						status === "pending"
							? "in_progress"
							: status === "in_progress"
								? "completed"
								: "pending";
					updateTodoStatus(todo.id, next);
				}}
				title={`状态：${statusView.label}（单击循环切换）`}
				type="button">
				<statusView.icon
					className={cn(
						"h-[16px] w-[16px]",
						statusView.color,
						status === "in_progress" && "animate-spin",
					)}
				/>
			</button>

			{/* 选择框（多选删除）— AI todo 禁用，避免绕过行内 X 限制被批量删 */}
			<input
				checked={isSelected}
				className="peer mt-0.5 shrink-0 rounded group-hover:block peer-checked:block disabled:cursor-not-allowed disabled:opacity-40"
				disabled={isAI}
				onChange={() => onSelect(todo.id)}
				title={isAI ? "AI 创建的 todo 由 AI 维护,不可删除" : undefined}
				type="checkbox"
			/>

			{/* 勾选/取消勾选（独立于状态循环，修复 toggleTodo 死代码） */}
			<button
				aria-label={isCompleted ? "取消完成" : "标记完成"}
				className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 hover:bg-accent"
				onClick={() => toggleTodo(todo.id)}
				title={isCompleted ? "取消完成" : "标记完成"}
				type="button">
				{isCompleted ? (
					<Check className="text-green-500 h-[16px] w-[16px]" />
				) : (
					<Circle className="text-muted-foreground h-[16px] w-[16px]" />
				)}
			</button>

			{/* 内容 */}
			<div className="min-w-0 flex-1">
				{isEditing ? (
					<Input
						autoFocus
						className="h-7 text-sm"
						onBlur={handleSaveEdit}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSaveEdit();
							if (e.key === "Escape") {
								setEditText(todo.text);
								setIsEditing(false);
							}
						}}
						onChange={(e) => setEditText(e.target.value)}
						ref={inputRef}
						value={editText}
					/>
				) : (
					<div className="flex items-start gap-1.5">
						<span
							className={cn(
								"min-w-0 flex-1 cursor-text break-words",
								todo.status === "completed" &&
									"text-muted-foreground line-through",
							)}
							onDoubleClick={() => {
								setEditText(todo.text);
								setIsEditing(true);
							}}>
							{todo.text}
						</span>
						{isAI && (
							<span
								className="text-muted-foreground bg-primary/10 inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium"
								title="AI 创建">
								<Bot className="h-[10px] w-[10px]" />
								AI
							</span>
						)}
					</div>
				)}
			</div>

			{/* 操作按钮 — AI 创建的 todo 不显示删除按钮（由 AI 自行维护） */}
			<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
				<button
					className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
					onClick={cyclePriority}
					title={`优先级: ${priorityConfig[todo.priority].label}`}>
					<PriorityIcon
						className={cn("h-[14px] w-[14px]", priorityConfig[todo.priority].color)}
					/>
				</button>
				{!isAI && (
					<button
						className="text-muted-foreground hover:text-destructive rounded p-1 transition-colors"
						onClick={() => deleteTodo(todo.id)}
						title="删除">
						<X className="h-[14px] w-[14px]" />
					</button>
				)}
			</div>
		</div>
	);
}

export function TodoList({
	className,
	conversationId,
}: {
	className?: string;
	conversationId?: string;
}) {
	const allTodos = useTodoStore((s) => s.todos);
	const addTodo = useTodoStore((s) => s.addTodo);
	const clearCompleted = useTodoStore((s) => s.clearCompleted);
	const deleteTodos = useTodoStore((s) => s.deleteTodos);
	const [newTodoText, setNewTodoText] = useState("");
	const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	/** 折叠状态:默认折叠,有 in_progress 任务时自动展开 */
	const [expanded, setExpanded] = useState(true);

	/** 仅显示当前会话的 todo（无 conversationId 时显示全部 — 用于 EditorChatInput 兼容） */
	const todos = useMemo(
		() =>
			conversationId
				? allTodos.filter((t) => t.conversationId === conversationId)
				: allTodos,
		[allTodos, conversationId],
	);

	const filteredTodos = useMemo(() => {
		let list = [...todos];
		if (filter === "active") list = list.filter((t) => !t.completed);
		if (filter === "completed") list = list.filter((t) => t.completed);
		return list;
	}, [todos, filter]);

	const handleAdd = useCallback(() => {
		const trimmed = newTodoText.trim();
		if (!trimmed) return;
		addTodo(trimmed, conversationId);
		setNewTodoText("");
	}, [newTodoText, addTodo, conversationId]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") handleAdd();
		},
		[handleAdd],
	);

	const toggleSelect = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const deleteSelected = useCallback(() => {
		deleteTodos(Array.from(selectedIds));
		setSelectedIds(new Set());
	}, [deleteTodos, selectedIds]);

	const activeCount = todos.filter((t) => !t.completed).length;
	const completedCount = todos.filter((t) => t.completed).length;

	return (
		<div className={cn("border-border flex flex-col bg-card", className)}>
			{/* 头部(可点击折叠) */}
			<button
				aria-expanded={expanded}
				className="hover:bg-accent/30 flex items-center justify-between border-b px-4 py-3 transition-colors"
				onClick={() => setExpanded((v) => !v)}
				type="button">
				<div className="flex items-center gap-2">
					<ListTodo className="text-primary h-[16px] w-[16px]" />
					<span className="font-semibold text-sm">任务清单</span>
					<span className="text-muted-foreground text-xs">
						{activeCount}/{todos.length}
					</span>
					{/* 折叠图标 */}
					<ChevronDown
						className={cn(
							"text-muted-foreground h-[14px] w-[14px] transition-transform",
							!expanded && "-rotate-90",
						)}
					/>
				</div>
				{/* 统计栏 — 点击冒泡到 header 上也会折叠,这里阻止 */}
				<div
					className="flex items-center gap-1"
					onClick={(e) => e.stopPropagation()}
					role="presentation">
					{(
						[
							{ key: "all", label: "全部" },
							{ key: "active", label: "进行中" },
							{ key: "completed", label: "已完成" },
						] as const
					).map((tab) => (
						<button
							className={cn(
								"rounded-md px-2 py-1 text-xs transition-colors",
								filter === tab.key
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-accent",
							)}
							key={tab.key}
							onClick={() => setFilter(tab.key)}>
							{tab.label}
							{tab.key === "active" && activeCount > 0 && ` (${activeCount})`}
							{tab.key === "completed" &&
								completedCount > 0 &&
								` (${completedCount})`}
						</button>
					))}
				</div>
			</button>

			{/* 列表(可折叠) */}
			{expanded && (
				<div className="max-h-64 flex-1 overflow-y-auto">
					{filteredTodos.length === 0 ? (
						<div className="text-muted-foreground flex flex-col items-center justify-center py-12 text-xs">
							<ListTodo className="mb-2 h-8 w-8 opacity-30" />
							<span>
								{filter === "all"
									? "还没有任务"
									: filter === "active"
										? "没有进行中的任务"
										: "没有已完成的任务"}
							</span>
						</div>
					) : (
						filteredTodos.map((todo) => (
							<TodoItem
								isSelected={selectedIds.has(todo.id)}
								key={todo.id}
								onSelect={toggleSelect}
								todo={todo}
							/>
						))
					)}
				</div>
			)}

			{/* 底部操作 */}
			{expanded && (
				<BatchActions
					onClearCompleted={() => clearCompleted(conversationId)}
					onDeleteSelected={deleteSelected}
					selectedCount={selectedIds.size}
					totalCount={todos.length}
				/>
			)}
		</div>
	);
}
