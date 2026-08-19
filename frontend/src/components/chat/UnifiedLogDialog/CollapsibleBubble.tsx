import { ChevronDown, ChevronRight } from "lucide-react";

/** 通用折叠气泡卡片：
 *  - 默认折叠,只显示 header(类型徽章 + 时间 + 摘要)
 *  - 点击 header 展开 body,展示完整内容(JSON 序列化后的 rawData 或字符串)
 *  - 完全受控,父级管理 open 状态(便于切 tab 跨持久)
 */
interface CollapsibleBubbleProps {
	/** 展开状态受控(父级管,切 tab 时可保持) */
	open: boolean;
	/** 折叠/展开切换时调,父级更新 openSet */
	onToggle: (open: boolean) => void;
	/** 展开后 body 显示的原始内容(未格式化 JSON 字符串 / rawData 序列化结果) */
	body: string;
	/** header 摘要(简短描述,默认折叠时可见) */
	summary: string;
	/** header 左侧时间戳/索引(可选) */
	timestamp?: string;
	/** header 左侧的类型徽章(可选,已经按 tab 配过色) */
	typeBadge?: React.ReactNode;
}

export function CollapsibleBubble({
	body,
	onToggle,
	open,
	summary,
	timestamp,
	typeBadge,
}: CollapsibleBubbleProps) {
	const handleToggle = () => {
		onToggle(!open);
	};

	return (
		<div className="bg-card overflow-hidden rounded-lg border">
			<button
				className="hover:bg-muted/40 flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
				onClick={handleToggle}
				type="button">
				{open ? (
					<ChevronDown className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
				) : (
					<ChevronRight className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
				)}
				{typeBadge && <div className="shrink-0">{typeBadge}</div>}
				{timestamp && (
					<span className="text-muted-foreground shrink-0 font-mono text-[10px]">
						{timestamp}
					</span>
				)}
				<span className="text-foreground min-w-0 flex-1 truncate text-xs">
					{summary}
				</span>
			</button>
			{open && (
				<div className="bg-muted/20 border-t">
					<pre className="text-foreground overflow-x-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed">
						{body}
					</pre>
				</div>
			)}
		</div>
	);
}

/** 把任意 rawData 安全序列化为可展示字符串(未格式化 JSON) */
export function serializeRawData(raw: unknown): string {
	if (raw === undefined || raw === null) return "(空)";
	if (typeof raw === "string") return raw;
	try {
		return JSON.stringify(raw, null, 2);
	} catch {
		return String(raw);
	}
}

/** 从 rawData 提取 header 摘要(优先读 content 字段,fallback 用 serializeRawData 截前 80 字符) */
export function summarizeRawData(raw: unknown, fallback: string): string {
	if (raw && typeof raw === "object" && "content" in raw) {
		const c = (raw as { content?: unknown }).content;
		if (typeof c === "string" && c.length > 0) {
			return c.length > 80 ? `${c.slice(0, 80)}…` : c;
		}
	}
	if (fallback) return fallback.length > 80 ? `${fallback.slice(0, 80)}…` : fallback;
	return serializeRawData(raw).slice(0, 80);
}