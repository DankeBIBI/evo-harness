import { Button } from "@/components/ui/Button";
import { Check, Copy, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DebugLog } from "@/types/debugLog";

// re-export 旧 DebugLogPanel.DebugLog 给外部用(已迁移类型到 @/types/debugLog)
export type { DebugLog } from "@/types/debugLog";

interface DebugLogPanelProps {
	logs: DebugLog[];
	onClear: () => void;
}

function getLogTypeLabel(type: DebugLog["type"]) {
	if (type === "request") return "REQ";
	if (type === "response") return "RES";
	if (type === "tool") return "TOOL";
	return "LOG";
}

function formatLog(log: DebugLog) {
	return `[${log.time}] [${getLogTypeLabel(log.type)}]\n${log.content}`;
}

export function DebugLogPanel({ logs, onClear }: DebugLogPanelProps) {
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const copyTimerRef = useRef<number | null>(null);
	const allLogText = useMemo(() => logs.map(formatLog).join("\n\n"), [logs]);

	useEffect(() => {
		return () => {
			if (copyTimerRef.current) {
				window.clearTimeout(copyTimerRef.current);
			}
		};
	}, []);

	const handleCopy = async (text: string, key: string) => {
		if (!text) return;

		try {
			await navigator.clipboard.writeText(text);
			if (copyTimerRef.current) {
				window.clearTimeout(copyTimerRef.current);
			}
			setCopiedKey(key);
			copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200);
		} catch {
			setCopiedKey(null);
		}
	};

	return (
		<div className="bg-muted/30 max-h-[400px] overflow-auto border-b">
			<div className="space-y-1 p-2">
				{logs.length === 0 ? (
					<div className="text-muted-foreground py-2 text-xs">暂无日志</div>
				) : (
					logs.map((log, i) => {
						const copyKey = `${log.time}-${log.type}-${log.content.slice(0, 32)}-${i}`;

						return (
						<div className="group flex gap-2 font-mono text-xs" key={i}>
							<span className="text-muted-foreground shrink-0">{log.time}</span>
							<span
								className={`shrink-0 rounded px-1 ${
									log.type === "request"
										? "bg-blue-500/20 text-blue-600"
										: log.type === "response"
											? "bg-green-500/20 text-green-600"
											: log.type === "tool"
												? "bg-purple-500/20 text-purple-600"
												: "bg-amber-500/20 text-amber-600"
								}`}>
								{getLogTypeLabel(log.type)}
							</span>
							<span className="text-foreground flex-1 whitespace-pre-wrap break-all">
								{log.content}
							</span>
							<Button
								className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
								onClick={() => handleCopy(formatLog(log), copyKey)}
								size="icon"
								title="复制日志"
								variant="ghost">
								{copiedKey === copyKey ? (
									<Check className="h-[14px] w-[14px]" />
								) : (
									<Copy className="h-[14px] w-[14px]" />
								)}
							</Button>
						</div>
						);
					})
				)}
			</div>
			{logs.length > 0 && (
				<div className="flex justify-end gap-1 border-t p-1">
					<Button
						onClick={() => handleCopy(allLogText, "all")}
						size="icon"
						title="复制全部日志"
						variant="ghost">
						{copiedKey === "all" ? <Check className="" /> : <Copy className="" />}
					</Button>
					<Button
						onClick={onClear}
						size="icon"
						title="清空日志"
						variant="ghost">
						<Trash2 className="" />
					</Button>
				</div>
			)}
		</div>
	);
}
