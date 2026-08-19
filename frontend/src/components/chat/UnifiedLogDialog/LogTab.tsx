import type { DebugLog } from "@/components/chat/panels/DebugLogPanel";

import { Button } from "@/components/ui/Button";
import { Check, Copy, Loader2, ScrollText, Trash2 } from "lucide-react";
import { useMemo } from "react";

import type { ProxyRequestLog } from "@/stores/providerStore";

import {
	getBackendStatusColor,
	getFrontendLogColor,
	getFrontendLogLabel,
} from "./utils";

interface LogTabProps {
	backendLogs: ProxyRequestLog[];
	copiedKey: string | null;
	frontendLogs: DebugLog[];
	loading: boolean;
	onClearFrontend: () => void;
	onCopy: (text: string, key: string) => void;
}

/** 解析时间字符串为毫秒时间戳,统一用于混排排序
 *  - 支持 ISO(含 T)、纯日期(YYYY-MM-DD)、本地 HH:MM:SS 三种格式
 *  - 跨天限制:HH:MM:SS 一律按"今天"拼接,跨日会话尾部可能错位,仅在单日内准确
 */
function toLocalTimestamp(time: string): number {
	if (!time) return 0;
	const direct = new Date(time).getTime();
	if (!Number.isNaN(direct)) return direct;
	const today = new Date().toISOString().slice(0, 10);
	const ts = new Date(`${today}T${time}`).getTime();
	return Number.isNaN(ts) ? 0 : ts;
}

function formatBackendRow(log: ProxyRequestLog): string {
	const ts = log.timestamp ? new Date(log.timestamp).toISOString() : "-";
	const lines: string[] = [];
	lines.push(
		`${ts}  ${log.method} ${log.path}  → ${log.status}  ${log.duration}ms`,
	);
	if (log.matchedRoute) lines.push(`  route: ${log.matchedRoute}`);
	if (log.inputTokens || log.outputTokens) {
		lines.push(
			`  tokens: in=${log.inputTokens} out=${log.outputTokens} total=${log.totalTokens}`,
		);
	}
	if (log.error) lines.push(`  ERROR: ${log.error}`);
	return lines.join("\n");
}

/** 「Log（各种 log）」tab — 前端 debugLog + 后端 ProxyRequestLog 按时间混排 */
export function LogTab({
	backendLogs,
	copiedKey,
	frontendLogs,
	loading,
	onClearFrontend,
	onCopy,
}: LogTabProps) {
	const rows = useMemo(() => {
		type Row = {
			copyKey: string;
			copyText: string;
			source: "backend" | "frontend";
			time: string;
			timeNum: number;
			typeBadge: string;
			typeClass: string;
		};

		const out: Row[] = [];

		frontendLogs.forEach((log, i) => {
			// 2026-08-19: source 区分 user(用户主动发起)/continuation(AI 工具调用后自动续传)/child-dispatch
			// 续传来源不显式标注时视为 user(向后兼容旧数据)
			const sourceLabel =
				log.source === "continuation"
					? "续传"
					: log.source === "child-dispatch"
						? "子派"
						: "";
			out.push({
				copyKey: `frontend-${log.time}-${i}`,
				copyText: `[${log.time}] [${getFrontendLogLabel(log.type)}]${sourceLabel ? ` [${sourceLabel}]` : ""} ${log.content}`,
				source: "frontend",
				time: log.time,
				timeNum: toLocalTimestamp(log.time),
				typeBadge: getFrontendLogLabel(log.type),
				typeClass: getFrontendLogColor(log.type),
			});
		});

		backendLogs.forEach((log, i) => {
			const ts = log.timestamp
				? new Date(log.timestamp).toLocaleTimeString()
				: "-";
			out.push({
				copyKey: `backend-${log.id ?? i}`,
				copyText: formatBackendRow(log),
				source: "backend",
				time: ts,
				timeNum: toLocalTimestamp(log.timestamp ?? ""),
				typeBadge: log.method,
				typeClass: getBackendStatusColor(log.status, log.responseStatus),
			});
		});

		out.sort((a, b) => a.timeNum - b.timeNum);
		return out;
	}, [frontendLogs, backendLogs]);

	const allText = useMemo(
		() =>
			rows
				.map((r) => `[${r.source === "frontend" ? "FE" : "BE"}] ${r.copyText}`)
				.join("\n\n"),
		[rows],
	);

	const total = rows.length;

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
				<div className="flex items-center gap-2 text-xs">
					<ScrollText className="text-muted-foreground h-[12px] w-[12px]" />
					<span className="text-muted-foreground">
						{total} 条 log（FE {frontendLogs.length} + BE {backendLogs.length}）
					</span>
					{loading && <Loader2 className="h-[12px] w-[12px] animate-spin" />}
				</div>
				<div className="flex items-center gap-1">
					<Button
						className="h-6 px-2 text-xs"
						disabled={total === 0}
						onClick={() => onCopy(allText, "log-all")}
						size="sm"
						variant="ghost">
						{copiedKey === "log-all" ? (
							<>
								<Check className="h-[12px] w-[12px] text-green-500" />
								已复制
							</>
						) : (
							<>
								<Copy className="h-[12px] w-[12px]" />
								复制全部
							</>
						)}
					</Button>
					<Button
						className="h-6 px-2 text-xs"
						disabled={frontendLogs.length === 0}
						onClick={onClearFrontend}
						size="sm"
						variant="ghost">
						<Trash2 className="h-[12px] w-[12px]" />
						清前端
					</Button>
				</div>
			</div>
			<div className="flex-1 overflow-auto p-2">
				{total === 0 ? (
					<div className="text-muted-foreground py-4 text-center text-xs">
						暂无 log
					</div>
				) : (
					<div className="space-y-1">
						{rows.map((row) => (
							<div
								className="group hover:bg-muted/40 flex gap-2 rounded-md px-2 py-1.5 font-mono text-xs"
								key={row.copyKey}>
								<span
									className={`shrink-0 rounded px-1 text-[10px] font-semibold ${
										row.source === "frontend"
											? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
											: "bg-orange-500/10 text-orange-700 dark:text-orange-300"
									}`}>
									{row.source === "frontend" ? "FE" : "BE"}
								</span>
								<span className="text-muted-foreground shrink-0">
									{row.time}
								</span>
								<span
									className={`shrink-0 rounded px-1.5 font-semibold ${row.typeClass}`}>
									{row.typeBadge}
								</span>
								<span className="text-foreground flex-1 whitespace-pre-wrap break-all">
									{row.copyText}
								</span>
								<Button
									className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
									onClick={() => onCopy(row.copyText, row.copyKey)}
									size="icon"
									variant="ghost">
									{copiedKey === row.copyKey ? (
										<Check className="h-[12px] w-[12px] text-green-500" />
									) : (
										<Copy className="h-[12px] w-[12px]" />
									)}
								</Button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
