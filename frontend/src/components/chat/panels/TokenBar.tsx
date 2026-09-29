import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, Database, Sparkles, Wallet, Zap } from "lucide-react";
import { useMemo } from "react";

/**
 * TokenBar — 输入框下方的 token / 缓存 / 消费实时条
 *
 * 设计目标（参考 Less UI Skill §二"精密控制"档）:
 *   - 一行式、信息密集、紧凑对齐（≤ 150ms 动效）
 *   - 6 色调色板: 主色雾蓝、辅色琥珀/薄荷/石板灰、信号绿
 *   - 焦点唯一: 命中率（视觉锚点）
 *   - 信息层级 ≤ 4: 上下文 → 输入/输出 → 缓存 → 消费
 *
 * 字段:
 *   - contextTokens / contextWindow: 当前上下文 token 数 / 模型窗口上限
 *   - inputTokens / outputTokens: 本 turn 输入 / 输出拆分
 *   - cacheReadTokens / cacheCreationTokens: 本 turn 缓存命中 / 写入
 *   - hitRate: 命中率 (0-1)
 *   - costCny: 累计消费 (CNY ¥)
 */
export interface TokenBarProps {
	/** 会话累计输入 token */
	contextTokens: number;
	/** 模型上下文窗口上限（用于进度条），0 表示未知 */
	contextWindow?: number;
	/** 会话累计输入 token */
	inputTokens?: number;
	/** 会话累计输出 token */
	outputTokens?: number;
	/** 会话累计缓存命中 token */
	cacheReadTokens: number;
	/** 会话累计主动写入缓存 token */
	cacheCreationTokens: number;
	/** 聚合命中率 (0-1) */
	hitRate: number;
	/** 累计消费 (CNY) */
	costCny: number;
	/** 当前 turn 是否在写入缓存（M2.x + cache_control） */
	isWritingCache?: boolean;
	className?: string;
}

const formatTokens = (n: number) => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
	return n.toString();
};

const formatCny = (n: number) => {
	if (n < 0.0001) return "¥0.00";
	if (n < 1) return `¥${n.toFixed(4)}`;
	return `¥${n.toFixed(2)}`;
};

const hitColor = (rate: number) => {
	if (rate >= 0.7) return "text-emerald-600 dark:text-emerald-400";
	if (rate >= 0.3) return "text-amber-600 dark:text-amber-400";
	return "text-slate-500 dark:text-slate-400";
};

const hitBg = (rate: number) => {
	if (rate >= 0.7) return "bg-emerald-500";
	if (rate >= 0.3) return "bg-amber-500";
	return "bg-slate-400";
};

export function TokenBar({
	contextTokens,
	contextWindow = 0,
	inputTokens = 0,
	outputTokens = 0,
	cacheReadTokens,
	cacheCreationTokens,
	hitRate,
	costCny,
	isWritingCache = false,
	className,
}: TokenBarProps) {
	const ctxPct = useMemo(() => {
		if (contextWindow <= 0) return 0;
		return Math.min((contextTokens / contextWindow) * 100, 100);
	}, [contextTokens, contextWindow]);

	const hitPct = Math.min(Math.max(hitRate * 100, 0), 100);

	// 缓存命中占比 = cacheRead / (cacheRead + cacheCreation + 实际新增输入)
	const hasCache = cacheReadTokens > 0 || cacheCreationTokens > 0;
	const hasIO = inputTokens > 0 || outputTokens > 0;

	return (
		<div
			className={cn(
				"border-border/60 bg-muted/30 text-muted-foreground flex items-center gap-2.5 rounded-md border px-2.5 py-1 text-[11px] leading-none",
				"transition-colors duration-150",
				className,
			)}>
			{/* 1. 上下文进度条（主区，焦点） */}
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<Database className="h-[12px] w-[12px] shrink-0 opacity-70" />
				<div className="flex min-w-0 flex-1 items-center gap-1.5">
					{contextWindow > 0 ? (
						<div className="bg-border/60 relative h-[6px] flex-1 overflow-hidden rounded-full">
							<div
								className={cn(
									"h-full rounded-full transition-[width] duration-200 ease-out",
									ctxPct >= 90
										? "bg-red-500"
										: ctxPct >= 70
											? "bg-amber-500"
											: "bg-sky-500/80",
								)}
								style={{ width: `${ctxPct}%` }}
							/>
						</div>
					) : (
						<span
							className="text-muted-foreground/60 text-[10px] italic"
							title="当前模型上下文窗口大小未知（请先选择模型）">
							未知窗口
						</span>
					)}
					<span className="tabular-nums whitespace-nowrap font-medium">
						{formatTokens(contextTokens)}
						{contextWindow > 0 && (
							<span className="text-muted-foreground/70 ml-0.5">
								/{formatTokens(contextWindow)}
							</span>
						)}
					</span>
				</div>
			</div>

			{/* 2. 输入 / 输出拆分(只在有数据时显示) */}
			{hasIO && (
				<>
					<span className="bg-border/60 h-[12px] w-px shrink-0" />
					<div className="flex shrink-0 items-center gap-1.5" title="会话累计输入 / 输出 token">
						<span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
							<ArrowDownToLine className="h-[12px] w-[12px]" />
							<span className="tabular-nums font-medium">
								{formatTokens(inputTokens)}
							</span>
						</span>
						<span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
							<ArrowUpFromLine className="h-[12px] w-[12px]" />
							<span className="tabular-nums font-medium">
								{formatTokens(outputTokens)}
							</span>
						</span>
					</div>
				</>
			)}

			{/* 3. 缓存命中(次区,绿色信号色) */}
			{hasCache && (
				<>
					<span className="bg-border/60 h-[12px] w-px shrink-0" />
					<div
						className="flex shrink-0 items-center gap-1"
						title="缓存命中 token / 命中率">
						<Zap className="h-[12px] w-[12px] text-emerald-500" />
						<span className="tabular-nums text-foreground/80">
							{formatTokens(cacheReadTokens)}
						</span>
						<span
							className={cn(
								"tabular-nums rounded px-1 py-0.5 font-medium text-white",
								hitBg(hitRate),
							)}>
							{hitPct.toFixed(0)}%
						</span>
					</div>
				</>
			)}

			{/* 4. 主动缓存写入(仅 M2.x + explicit 模式时显示) */}
			{isWritingCache && cacheCreationTokens > 0 && (
				<>
					<span className="bg-border/60 h-[12px] w-px shrink-0" />
					<div
						className="flex shrink-0 items-center gap-1"
						title="首次写入缓存的 token">
						<Sparkles className="h-[12px] w-[12px] text-violet-500" />
						<span className="tabular-nums">
							{formatTokens(cacheCreationTokens)}
						</span>
					</div>
				</>
			)}

			{/* 5. 累计消费(装饰区) */}
			<span className="bg-border/60 h-[12px] w-px shrink-0" />
			<div
				className="flex shrink-0 items-center gap-1"
				title="会话累计消费（CNY）">
				<Wallet className="h-[12px] w-[12px] opacity-70" />
				<span className="tabular-nums font-medium">{formatCny(costCny)}</span>
			</div>
		</div>
	);
}
