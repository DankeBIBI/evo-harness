import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileCode,
    RotateCcw,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { computeLineDiff, diffStats, type DiffLine } from "@/components/chat/lib/diff";

export interface FileChange {
	id: string;
	filePath: string;
	originalContent: string;
	newContent: string;
	status: "pending" | "accepted" | "rejected";
}

interface CodeReviewPanelProps {
	changes: FileChange[];
	onAcceptChange: (change: FileChange) => void;
	onRejectChange: (change: FileChange) => void;
	/**
	 * 切换折叠(collapsed↔展开)
	 * sidebar 模式下通常不传(无浮条入口);overlay 模式 /editor 页用
	 */
	onToggleCollapse?: () => void;
	collapsed?: boolean;
	/**
	 * 2026-08-31: 渲染模式
	 * - 'sidebar' (默认): flex 自适应,作为父容器子项(左栏 tab 用)
	 * - 'overlay': 绝对定位占满父容器(独立 /editor 页用,需父级 relative)
	 */
	mode?: "overlay" | "sidebar";
}

/** DiffLineItem = DiffLine(共享 lib/diff 的类型别名,避免在多处重新定义) */
type DiffLineItem = DiffLine;

/** 统一 LCS diff 计算 — 只算一次，供 stats + DiffViewer 共用 */
function computeDiff(original: string, modified: string): DiffLineItem[] {
	return computeLineDiff(original, modified);
}

/** 变更块周围保留 3 行上下文，跳过大段不变行用分隔线标记 */
function contextualizeDiff(diff: DiffLineItem[], contextLines = 3): DiffLineItem[] {
	const result: DiffLineItem[] = [];
	let skipped = 0;

	for (let i = 0; i < diff.length; i++) {
		const line = diff[i];
		if (line.type !== "same") {
			if (skipped > 0) {
				result.push({ content: `\u2500\u2500\u2500 ${skipped} \u884c\u672a\u53d8 \u2500\u2500\u2500`, type: "same" });
				skipped = 0;
			}
			result.push(line);
		} else {
			let nearChange = false;
			const start = Math.max(0, i - contextLines);
			const end = Math.min(diff.length - 1, i + contextLines);
			for (let j = start; j <= end; j++) {
				if (diff[j].type !== "same") { nearChange = true; break; }
			}
			if (nearChange) {
				if (skipped > 0) {
					result.push({ content: `\u2500\u2500\u2500 ${skipped} \u884c\u672a\u53d8 \u2500\u2500\u2500`, type: "same" });
					skipped = 0;
				}
				result.push(line);
			} else {
				skipped++;
			}
		}
	}

	if (skipped > 0) {
		result.push({ content: `\u2500\u2500\u2500 ${skipped} \u884c\u672a\u53d8 \u2500\u2500\u2500`, type: "same" });
	}

	return result;
}

function DiffLine({
	content,
	type,
}: {
	content: string;
	type: "added" | "removed" | "same";
}) {
	return (
		<div
			className={`flex min-w-max border-b border-transparent font-mono text-[12px] leading-5 ${
				type === "added"
					? "bg-green-500/10 text-green-700 dark:text-green-400"
					: type === "removed"
						? "bg-red-500/10 text-red-700 dark:text-red-400"
						: "text-foreground/80"
			}`}>
			<span className="w-8 shrink-0 select-none text-center text-muted-foreground/50">
				{type === "added" ? "+" : type === "removed" ? "-" : " "}
			</span>
			<span className="whitespace-pre px-2">{content}</span>
		</div>
	);
}

function DiffViewer({ diff }: { diff: DiffLineItem[] }) {
	const contextualDiff = useMemo(() => contextualizeDiff(diff), [diff]);

	return (
		<div className="max-h-[52vh] min-h-[320px] overflow-auto rounded-xl border border-border/60 bg-muted/20">
			{contextualDiff.map((line, idx) => (
				<DiffLine content={line.content} key={idx} type={line.type} />
			))}
		</div>
	);
}

function FileChangeItem({
	change,
	onAccept,
	onReject,
}: {
	change: FileChange;
	onAccept: (change: FileChange) => void;
	onReject: (change: FileChange) => void;
}) {
	const [expanded, setExpanded] = useState(change.status === "pending");

	const diff = useMemo(
		() => computeDiff(change.originalContent, change.newContent),
		[change.originalContent, change.newContent],
	);

	const stats = useMemo(() => diffStats(diff), [diff]);

	const fileName = change.filePath.split(/[/\\]/).pop() || "未命名";
	const isDone = change.status !== "pending";
	const statusText =
		change.status === "accepted"
			? "已保留"
			: change.status === "rejected"
				? "已丢弃"
				: "待审查";

	return (
		<div
			className={`rounded-2xl border transition-all ${
				isDone
					? change.status === "accepted"
						? "border-green-500/25 bg-green-500/5"
						: "border-red-500/25 bg-red-500/5 opacity-75"
					: "border-green-500/25 bg-card shadow-sm"
			}`}>
			<div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
				<button
					className="text-muted-foreground hover:bg-muted/70 hover:text-foreground rounded-md p-1 transition-colors"
					onClick={() => setExpanded(!expanded)}
					title={expanded ? "收起差异" : "展开差异"}
					type="button">
					{expanded ? (
						<ChevronDown className="h-[16px] w-[16px]" />
					) : (
						<ChevronRight className="h-[16px] w-[16px]" />
					)}
				</button>
				<FileCode className="h-[18px] w-[18px] text-primary" />
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<div className="truncate text-sm font-semibold">{fileName}</div>
						<Badge
							className={`shrink-0 text-[10px] ${
								change.status === "accepted"
									? "bg-green-500/15 text-green-600 hover:bg-green-500/15"
									: change.status === "rejected"
										? "bg-red-500/15 text-red-600 hover:bg-red-500/15"
										: "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15"
							}`}
						>
							{statusText}
						</Badge>
					</div>
					<div className="truncate text-xs text-muted-foreground" title={change.filePath}>
						{change.filePath}
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					<Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/20 text-[10px] px-1.5 py-0">
						+{stats.added}
					</Badge>
					<Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/20 text-[10px] px-1.5 py-0">
						-{stats.removed}
					</Badge>
				</div>
				{!isDone && (
					<div className="flex shrink-0 items-center gap-2">
						<Button
							className="h-[20px] gap-1.5 border-green-500/25 bg-green-500/10 px-2.5 text-xs text-green-700 hover:bg-green-500/15"
							onClick={() => onAccept(change)}
							size="sm"
							title="接受修改并写入文件"
							variant="outline">
							<Check className="h-[13px] w-[13px]" />
							接受
						</Button>
						<Button
							className="h-[20px] gap-1.5 border-red-500/25 bg-red-500/10 px-2.5 text-xs text-red-700 hover:bg-red-500/15"
							onClick={() => onReject(change)}
							size="sm"
							title="拒绝修改"
							variant="outline">
							<X className="h-[13px] w-[13px]" />
							丢弃
						</Button>
					</div>
				)}
				{change.status === "accepted" && (
					<Check className="h-[18px] w-[18px] text-green-600" />
				)}
				{change.status === "rejected" && (
					<RotateCcw className="h-[18px] w-[18px] text-red-600" />
				)}
			</div>
			{expanded && (
				<div className="px-4 py-4">
					<DiffViewer diff={diff} />
				</div>
			)}
		</div>
	);
}

export function CodeReviewPanel({
	changes,
	onAcceptChange,
	onRejectChange,
	collapsed = false,
	mode = "sidebar",
	onToggleCollapse,
}: CodeReviewPanelProps) {
	const stats = useMemo(
		() =>
			changes.reduce(
				(acc, change) => {
					if (change.status === "pending") acc.pending += 1;
					if (change.status === "accepted") acc.accepted += 1;
					if (change.status === "rejected") acc.rejected += 1;
					return acc;
				},
				{ accepted: 0, pending: 0, rejected: 0 },
			),
		[changes],
	);
	const pendingCount = stats.pending;
	const pendingChanges = useMemo(
		() => changes.filter((c) => c.status === "pending"),
		[changes],
	);

	const handleAcceptAll = async () => {
		for (const change of pendingChanges) {
			await onAcceptChange(change);
		}
	};

	const handleRejectAll = () => {
		for (const change of pendingChanges) {
			onRejectChange(change);
		}
	};

	if (collapsed) {
		return (
			<div className="absolute bottom-0 right-0 top-0 z-20 flex w-[30px] flex-col items-center border-l border-border bg-card py-4 shadow-sm">
				<Button
					className="h-8 w-8"
					onClick={onToggleCollapse}
					size="icon"
					title="展开代码审查"
					variant="ghost">
					<ChevronLeft className="h-5 w-5" />
				</Button>
				<div className="mt-3 flex flex-col items-center gap-1.5">
					<span
						className="select-none text-[10px] text-muted-foreground/50"
						style={{ writingMode: "vertical-rl" }}
					>
						代码审查
					</span>
					<FileCode className="h-5 w-5 text-muted-foreground" />
					{pendingCount > 0 && (
						<Badge className="justify-center rounded-full p-0 text-[10px]">
							{pendingCount}
						</Badge>
					)}
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col bg-card",
				mode === "overlay" && "absolute inset-0 z-20",
			)}>
			<div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
				<div>
					<h2 className="text-lg font-semibold tracking-tight">代码审查</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						{pendingCount > 0
							? `还有 ${pendingCount} 个文件待确认`
							: `所有文件已处理 · 已保留 ${stats.accepted} · 已丢弃 ${stats.rejected}`}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{pendingCount > 0 && (
						<>
							<Button
								className="h-7 gap-1.5 text-xs"
								onClick={handleAcceptAll}
								size="sm"
								variant="outline">
								<Check className="h-[14px] w-[14px]" />
								全部接受
							</Button>
							<Button
								className="h-7 gap-1.5 text-xs"
								onClick={handleRejectAll}
								size="sm"
								variant="outline">
								<RotateCcw className="h-[14px] w-[14px]" />
								全部撤销
							</Button>
						</>
					)}
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-auto px-6 py-5">
				<div className="mx-auto flex w-full max-w-[980px] flex-col gap-4">
					{changes.map((change) => (
						<FileChangeItem
							change={change}
							key={change.id}
							onAccept={onAcceptChange}
							onReject={onRejectChange}
						/>
					))}
					{changes.length === 0 && (
						<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
							<FileCode className="mb-3 h-10 w-10 opacity-30" />
							<p className="text-sm">暂无代码修改</p>
							<p className="mt-1 text-xs">AI 生成的代码修改将显示在这里</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
