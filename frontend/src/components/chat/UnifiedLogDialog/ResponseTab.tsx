import type { DebugLog } from "@/components/chat/panels/DebugLogPanel";

import { Button } from "@/components/ui/Button";
import { AlertCircle, Check, Copy, Download, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { CollapsibleBubble, serializeRawData } from "./CollapsibleBubble";
import {
	getFrontendLogColor,
	getFrontendLogLabel,
} from "./utils";

interface ResponseTabProps {
	copiedKey: string | null;
	frontendLogs: DebugLog[];
	onClear: () => void;
	onCopy: (text: string, key: string) => void;
}

/** 流式响应日志展示上限(避免长对话下上千条挤爆) */
const MAX_DISPLAY = 200;

/** 「接收（源数据）」tab — 从 DebugLog(type=response) 提取 rawData(每个流式 chunk 完整 data 字段) */
export function ResponseTab({
	copiedKey,
	frontendLogs,
	onClear,
	onCopy,
}: ResponseTabProps) {
	const allResponseLogs = useMemo(
		() => frontendLogs.filter((log) => log.type === "response"),
		[frontendLogs],
	);

	// 流式 chunk 高频写入,只展示最近 MAX_DISPLAY 条
	const responseLogs = useMemo(
		() => allResponseLogs.slice(-MAX_DISPLAY),
		[allResponseLogs],
	);

	const [openSet, setOpenSet] = useState<Set<string>>(new Set());

	const handleToggle = (key: string, open: boolean) => {
		setOpenSet((prev) => {
			const next = new Set(prev);
			if (open) next.add(key);
			else next.delete(key);
			return next;
		});
	};

	const allText = useMemo(
		() =>
			responseLogs
				.map(
					(log) =>
						`# ${log.time}  ${log.content}\n${serializeRawData(log.rawData)}`,
				)
				.join("\n\n"),
		[responseLogs],
	);

	const summaryFor = (log: DebugLog): string => log.content;

	const handleClear = useCallback(() => {
		onClear();
	}, [onClear]);

	const totalCount = allResponseLogs.length;
	const shownCount = responseLogs.length;

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
				<div className="flex items-center gap-2 text-xs">
					<Download className="text-muted-foreground h-[12px] w-[12px]" />
					<span className="text-muted-foreground">
						{shownCount} 条接收源数据(共 {totalCount} 条,仅展示最近 {MAX_DISPLAY} 条)
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						className="h-6 px-2 text-xs"
						disabled={shownCount === 0}
						onClick={() => onCopy(allText, "response-all")}
						size="sm"
						variant="ghost">
						{copiedKey === "response-all" ? (
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
						disabled={totalCount === 0}
						onClick={handleClear}
						size="sm"
						variant="ghost">
						<Trash2 className="h-[12px] w-[12px]" />
						清空
					</Button>
				</div>
			</div>
			<div className="flex-1 overflow-auto p-3">
				<div className="mb-2 flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300">
					<AlertCircle className="mt-0.5 h-[14px] w-[14px] shrink-0" />
					<span>
						response 类型来自 <code className="rounded bg-blue-500/15 px-1 py-0.5 font-mono text-[10px]">streamingSession</code> 每个流式 chunk 的 data 字段,高频写入(每秒数十条)
					</span>
				</div>
				{shownCount === 0 ? (
					<div className="text-muted-foreground py-4 text-center text-xs">
						暂无接收源数据
					</div>
				) : (
					<div className="space-y-2">
						{responseLogs
							.slice()
							.reverse()
							.map((log, i) => {
								const key = `${log.time}-${i}`;
								const badge = (
									<span
										className={`rounded px-1.5 font-mono text-[10px] font-semibold ${getFrontendLogColor(log.type)}`}>
										{getFrontendLogLabel(log.type)}
									</span>
								);
								const body = serializeRawData(log.rawData);
								return (
									<div className="group relative" key={key}>
										<CollapsibleBubble
											body={body}
											onToggle={(open) => handleToggle(key, open)}
											open={openSet.has(key)}
											summary={summaryFor(log)}
											timestamp={log.time}
											typeBadge={badge}
										/>
										<Button
											className="absolute top-1.5 right-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
											onClick={() => onCopy(body, `response-${key}`)}
											size="icon"
											variant="ghost">
											{copiedKey === `response-${key}` ? (
												<Check className="h-[12px] w-[12px] text-green-500" />
											) : (
												<Copy className="h-[12px] w-[12px]" />
											)}
										</Button>
									</div>
								);
							})}
					</div>
				)}
			</div>
		</div>
	);
}

