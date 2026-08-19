import type { DebugLog } from "@/components/chat/panels/DebugLogPanel";

import { Button } from "@/components/ui/Button";
import { FileCode } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContinuationTab } from "./UnifiedLogDialog/ContinuationTab";
import { LogTab } from "./UnifiedLogDialog/LogTab";
import { RequestTab } from "./UnifiedLogDialog/RequestTab";
import { ResponseTab } from "./UnifiedLogDialog/ResponseTab";

interface UnifiedLogDialogProps {
	debugLogs: DebugLog[];
	onClearDebugLogs: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	/** @deprecated 已不再使用,保留仅为兼容 ChatWindow 调用方 */
	streamingAssistantId: null | string;
	/** @deprecated 已不再使用,保留仅为兼容 ChatWindow 调用方 */
	streamingContent: string;
	/** @deprecated 已不再使用,保留仅为兼容 ChatWindow 调用方 */
	streamingRawContent: string;
}

type TabKey = "continuation" | "log" | "request" | "response";

const TAB_META: Record<TabKey, { color: string; label: string; ring: string }> = {
	continuation: {
		color: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
		label: "续传",
		ring: "ring-violet-500/40",
	},
	log: {
		color: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
		label: "Log",
		ring: "ring-amber-500/40",
	},
	request: {
		color: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
		label: "发起",
		ring: "ring-blue-500/40",
	},
	response: {
		color: "bg-green-500/15 text-green-700 dark:text-green-300",
		label: "接收",
		ring: "ring-green-500/40",
	},
};

/** 统一日志弹窗：4 tab（发起 / 接收 / 续传 / Log）
 *  数据源:全部走前端 DebugLog（按 type + source 字段过滤）
 *  - 发起:用户主动点发送按钮的请求(type=request, source=user/child-dispatch/未设)
 *  - 接收:每个流式 chunk 的 data 字段(type=response)
 *  - 续传:AI 工具调用后自动发起的二次请求(type=request, source=continuation)
 *  - Log:所有类型按时间混排
 */
export function UnifiedLogDialog({
	debugLogs,
	onClearDebugLogs,
	onOpenChange,
	open,
}: UnifiedLogDialogProps) {
	const [activeTab, setActiveTab] = useState<TabKey>("log");
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const copyTimerRef = useRef<number | null>(null);
	const tabBodyRef = useRef<HTMLDivElement>(null);

	const requestCount = useMemo(
		() =>
			debugLogs.filter(
				(l) => l.type === "request" && l.source !== "continuation",
			).length,
		[debugLogs],
	);
	const responseCount = useMemo(
		() => debugLogs.filter((l) => l.type === "response").length,
		[debugLogs],
	);
	const continuationCount = useMemo(
		() =>
			debugLogs.filter(
				(l) => l.type === "request" && l.source === "continuation",
			).length,
		[debugLogs],
	);

	// 打开或切 tab 时,自动滚到 Body 底部
	const scrollBodyToBottom = useCallback(() => {
		requestAnimationFrame(() => {
			tabBodyRef.current?.scrollTo({
				top: tabBodyRef.current.scrollHeight,
				behavior: "smooth",
			});
		});
	}, []);

	useEffect(() => {
		if (open) scrollBodyToBottom();
	}, [open, activeTab, scrollBodyToBottom]);

	useEffect(() => {
		return () => {
			if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
		};
	}, []);

	const handleCopy = useCallback(async (text: string, key: string) => {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
			setCopiedKey(key);
			copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200);
		} catch {
			setCopiedKey(null);
		}
	}, []);

	const tabCounts = useMemo(
		() => ({
			continuation: continuationCount,
			log: debugLogs.length,
			request: requestCount,
			response: responseCount,
		}),
		[debugLogs.length, requestCount, responseCount, continuationCount],
	);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
			onClick={(e) => {
				if (e.target === e.currentTarget) onOpenChange(false);
			}}>
			<div className="bg-card shadow-soft flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl">
				{/* Header */}
				<div className="flex items-center justify-between border-b px-6 py-3">
					<div className="flex items-center gap-2">
						<FileCode className="text-muted-foreground h-[16px] w-[16px]" />
						<h3 className="text-sm font-semibold">统一日志</h3>
						<span className="text-muted-foreground text-xs">
							4 视图(发起 / 接收 / 续传 / Log)
						</span>
					</div>
					<Button
						className="h-7 w-7"
						onClick={() => onOpenChange(false)}
						size="icon"
						title="关闭"
						variant="ghost">
						×
					</Button>
				</div>

				{/* Tabs */}
				<div className="flex items-center gap-1 border-b bg-muted/30 px-4 py-2">
					{(["request", "response", "continuation", "log"] as TabKey[]).map((key) => {
						const meta = TAB_META[key];
						const isActive = activeTab === key;
						const count = tabCounts[key];
						return (
							<button
								className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
									isActive
										? `bg-background ring-1 ${meta.ring} ${meta.color}`
										: "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
								}`}
								key={key}
								onClick={() => setActiveTab(key)}>
								{meta.label}
								<span
									className={`rounded-full px-1.5 text-[10px] font-semibold ${
										isActive ? "bg-foreground/10" : "bg-muted-foreground/15"
									}`}>
									{count}
								</span>
							</button>
						);
					})}
				</div>

				{/* Body */}
				<div
					className="min-h-0 flex-1 overflow-auto bg-muted/20"
					ref={tabBodyRef}>
					{activeTab === "request" && (
						<RequestTab
							copiedKey={copiedKey}
							frontendLogs={debugLogs}
							onClear={onClearDebugLogs}
							onCopy={handleCopy}
						/>
					)}
					{activeTab === "response" && (
						<ResponseTab
							copiedKey={copiedKey}
							frontendLogs={debugLogs}
							onClear={onClearDebugLogs}
							onCopy={handleCopy}
						/>
					)}
					{activeTab === "continuation" && (
						<ContinuationTab
							copiedKey={copiedKey}
							frontendLogs={debugLogs}
							onClear={onClearDebugLogs}
							onCopy={handleCopy}
						/>
					)}
					{activeTab === "log" && (
						<LogTab
							backendLogs={[]}
							copiedKey={copiedKey}
							frontendLogs={debugLogs}
							loading={false}
							onClearFrontend={onClearDebugLogs}
							onCopy={handleCopy}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
