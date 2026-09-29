/**
 * AskUserFoldedChip — AskUser 提问卡已 settled(已提交/已取消)的折叠态
 *
 * 设计:
 *   - 单行 compact chip,与气泡里其他 toolcall 活动行尺寸一致
 *   - 文本由 buildSummary() 拼接 question=answer 形式
 *   - 由 AskUserDock 同时订阅 pending + snapshots,settled 后切到这个组件
 *   - data-tc-id 保留,方便外部"定位某 tcId" 等场景
 *
 * 与 AskUserCard 的关系:AskUserCard 只渲染"还在等回答"的活跃卡,
 * 折叠态全部走这里。AskUserCard 通过 import { buildSummary } 复用本文件的纯函数。
 */

import { CheckCircle2 } from "lucide-react";

import type {
	AskUserAnswers,
	AskUserQuestion,
	AskUserSnapshot,
} from "@/stores/askUserStore";

/** 折叠态的占位文本生成 — 纯函数,可被 AskUserCard 内部 buildSummary 复用 */
export function buildSummary(
	questions: AskUserQuestion[],
	answers: AskUserAnswers,
	cancelled: boolean,
): string {
	if (cancelled) return "已取消";
	const parts: string[] = [];
	for (const q of questions) {
		const v = answers[q.id];
		if (q.type === "text") {
			const s = typeof v === "string" ? v.trim() : "";
			parts.push(s ? `${q.id}=${s}` : `${q.id}=—`);
		} else if (q.type === "single") {
			const opt = q.options?.find((o) => o.value === v);
			parts.push(opt ? `${q.id}=${opt.label}` : `${q.id}=—`);
		} else {
			const arr = (v as string[] | undefined) ?? [];
			const labels = (q.options ?? [])
				.filter((o) => arr.includes(o.value))
				.map((o) => o.label);
			parts.push(
				labels.length ? `${q.id}=[${labels.join(", ")}]` : `${q.id}=[]`,
			);
		}
	}
	return parts.join(" · ");
}

interface Props {
	tcId: string;
	snapshot: AskUserSnapshot;
}

const AskUserFoldedChip: React.FC<Props> = ({ tcId, snapshot }) => {
	return (
		<div
			className="border-border/40 bg-muted/20 text-muted-foreground group/folded flex w-full min-w-0 items-center gap-1.5 rounded border px-2 py-1 text-xs"
			data-tc-id={tcId}>
			<CheckCircle2 className="h-[12px] w-[12px] shrink-0 text-foreground/70" />
			<span className="shrink-0 font-medium">
				{snapshot.cancelled ? "询问已取消" : "询问已答"}
			</span>
			<span className="text-muted-foreground/60 shrink-0">·</span>
			<span className="min-w-0 truncate font-mono">
				{buildSummary(snapshot.questions, snapshot.answers, snapshot.cancelled)}
			</span>
		</div>
	);
};

export default AskUserFoldedChip;
