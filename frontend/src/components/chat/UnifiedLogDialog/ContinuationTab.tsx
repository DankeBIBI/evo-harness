import type { DebugLog } from "@/components/chat/panels/DebugLogPanel";

import { Button } from "@/components/ui/Button";
import { Check, Copy, Repeat, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { CollapsibleBubble, serializeRawData } from "./CollapsibleBubble";
import {
	getFrontendLogColor,
	getFrontendLogLabel,
} from "./utils";

interface ContinuationTabProps {
	copiedKey: string | null;
	frontendLogs: DebugLog[];
	onClear: () => void;
	onCopy: (text: string, key: string) => void;
}

/** 「续传」tab — 展示 AI 工具调用后自动发起的二次请求
 *  数据源:DebugLog(type=request, source="continuation")
 *  与「发起」tab 的区别:发起源数据 = 用户点击发送按钮;续传 = AI 触发 */
export function ContinuationTab({
	copiedKey,
	frontendLogs,
	onClear,
	onCopy,
}: ContinuationTabProps) {
	const continuationLogs = useMemo(
		() =>
			frontendLogs.filter(
				(log) => log.type === "request" && log.source === "continuation",
			),
		[frontendLogs],
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
			continuationLogs
				.map(
					(log) =>
						`# ${log.time}  ${log.content}\n${serializeRawData(log.rawData)}`,
				)
				.join("\n\n"),
		[continuationLogs],
	);

	const summaryFor = (log: DebugLog): string => log.content;

	const handleClear = useCallback(() => {
		onClear();
	}, [onClear]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
				<div className="flex items-center gap-2 text-xs">
					<Repeat className="text-muted-foreground h-[12px] w-[12px]" />
					<span className="text-muted-foreground">
						{continuationLogs.length} 条续传源数据(AI 工具调用后自动发起的二次请求)
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						className="h-6 px-2 text-xs"
						disabled={continuationLogs.length === 0}
						onClick={() => onCopy(allText, "continuation-all")}
						size="sm"
						variant="ghost">
						{copiedKey === "continuation-all" ? (
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
						disabled={continuationLogs.length === 0}
						onClick={handleClear}
						size="sm"
						variant="ghost">
						<Trash2 className="h-[12px] w-[12px]" />
						清空
					</Button>
				</div>
			</div>
			<div className="flex-1 overflow-auto p-3">
				{continuationLogs.length === 0 ? (
					<div className="text-muted-foreground py-4 text-center text-xs">
						暂无续传源数据(AI 调用工具后会自动续传)
					</div>
				) : (
					<div className="space-y-2">
						{continuationLogs
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
											onClick={() => onCopy(body, `continuation-${key}`)}
											size="icon"
											variant="ghost">
											{copiedKey === `continuation-${key}` ? (
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
