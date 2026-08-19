/**
 * AskUserCard — 渲染 AI 通过 AskUser 工具提交的结构化问题卡
 *
 * 数据源: useAskUserStore (questions / status)
 * 行为:
 *   - 仅在 questions.length > 0 且 status === 'pending' 时渲染
 *   - 提交按钮: 所有 required 问题都有答案才启用
 *   - 取消按钮: 直接 cancel → AI 拿到 { cancelled: true, answers: {} }
 *   - 5 分钟 store 内置自动 cancel(防止 AI 永久阻塞)
 *
 * 三种题型 UI:
 *   - single: radio + 卡片化选项,点中即选
 *   - multi:  checkbox + 卡片化选项,可多选
 *   - text:   Textarea,支持 maxLength
 *
 * 设计参考 PlanStageCard(共享 Card / CardHeader / CardContent / CardFooter / Button / Badge)
 */

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { CheckCircle2, HelpCircle, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
	useAskUserStore,
	type AskUserAnswers,
	type AskUserQuestion,
} from "@/stores/askUserStore";

const TYPE_LABEL: Record<AskUserQuestion["type"], string> = {
	multi: "多选",
	single: "单选",
	text: "文本",
};

/** question 当前答案是否"已答"(用于 required 校验) */
function isAnswered(
	q: AskUserQuestion,
	v: string | string[] | undefined,
): boolean {
	if (q.type === "text") {
		return typeof v === "string" && v.trim().length > 0;
	}
	if (q.type === "single") {
		return typeof v === "string" && v.length > 0;
	}
	return Array.isArray(v) && v.length > 0;
}

/** 折叠态的占位文本生成 — 避免在子组件内重复拼接 */
function buildSummary(
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

const AskUserCard: React.FC<{ tcId?: string }> = ({ tcId }) => {
	// 2026-07-24 重大修复:按 tcId 订阅 store,不再用全局 status
	//   旧实现:每个 AskUserCard 都读同一个全局 status,导致"每个气泡都显示最新卡"
	//   新实现:每个 tcId 独立 pending + snapshot,按 tcId 精准控制
	//   没有 tcId 的兜底(不该发生):从 pending map 取第一个,有 tcId 但 pending/snapshot 都空:不渲染
	const pending = useAskUserStore((s) =>
		tcId ? s.pending.get(tcId) : undefined,
	);
	const snapshot = useAskUserStore((s) =>
		tcId ? s.snapshots.get(tcId) : undefined,
	);
	const resolveByTcId = useAskUserStore((s) => s.resolveByTcId);
	const cancelByTcId = useAskUserStore((s) => s.cancelByTcId);

	// 本地答案状态,submit/cancel 后清空
	const [answers, setAnswers] = useState<AskUserAnswers>({});

	// 2026-07-24 修复:React hooks 顺序违规 — useMemo 必须在 early return 之前无条件执行
	const questions = pending?.questions ?? snapshot?.questions ?? [];
	const isPending = !!pending && !pending.settled;
	const canSubmit = useMemo(() => {
		if (questions.length === 0) return false;
		return questions.every((q) => {
			if (q.required === false) return true;
			return isAnswered(q, answers[q.id]);
		});
	}, [answers, questions]);

	// 折叠态(已提交/已取消)— 跟气泡里其他 toolcall 活动行的尺寸一致
	if (!isPending && snapshot) {
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
	}

	if (!isPending || questions.length === 0) return null;

	const handleSingleChange = (qid: string, value: string) => {
		setAnswers((prev) => ({ ...prev, [qid]: value }));
	};

	const handleMultiToggle = (qid: string, value: string) => {
		setAnswers((prev) => {
			const cur = (prev[qid] as string[] | undefined) ?? [];
			const next = cur.includes(value)
				? cur.filter((v) => v !== value)
				: [...cur, value];
			return { ...prev, [qid]: next };
		});
	};

	const handleTextChange = (qid: string, value: string) => {
		setAnswers((prev) => ({ ...prev, [qid]: value }));
	};

	const handleSubmit = () => {
		if (!canSubmit || !tcId) return;
		// 规范化:text trim, multi 数组去重
		const normalized: AskUserAnswers = {};
		for (const q of questions) {
			const v = answers[q.id];
			if (q.type === "text" && typeof v === "string") {
				normalized[q.id] = v.trim();
			} else if (q.type === "multi" && Array.isArray(v)) {
				normalized[q.id] = Array.from(new Set(v));
			} else {
				normalized[q.id] = v as string;
			}
		}
		resolveByTcId(tcId, normalized);
		setAnswers({});
	};

	const handleCancel = () => {
		if (!tcId) return;
		cancelByTcId(tcId);
		setAnswers({});
	};

	return (
		<Card
			className="border-primary/40 bg-card ml-[-20px] mt-[-20px]"
			data-tc-id={tcId}
			role="region"
			aria-label="Ask user">
			<CardHeader>
				<div className="flex items-center gap-2">
					<HelpCircle className="h-[16px] w-[16px] text-primary" />
					<CardTitle className="text-base">需要你的回答</CardTitle>
					<Badge variant="secondary">{questions.length} 个问题</Badge>
				</div>
				<p className="text-sm text-muted-foreground">
					AI 在等待你回答以下问题后继续
				</p>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-3">
					{questions.map((q, idx) => (
						<div
							key={q.id}
							className="rounded-md border border-border/60 bg-muted/30 p-3">
							<div className="mb-2 flex items-start gap-2">
								<span className="text-sm font-medium tabular-nums">
									Q{idx + 1}
								</span>
								<span className="flex-1 text-sm font-medium text-foreground">
									{q.question}
								</span>
								{q.required !== false ? (
									<span className="text-xs text-destructive">*</span>
								) : null}
								<Badge variant="outline">{TYPE_LABEL[q.type]}</Badge>
							</div>
							<QuestionInput
								q={q}
								answers={answers}
								onSingle={handleSingleChange}
								onMulti={handleMultiToggle}
								onText={handleTextChange}
							/>
						</div>
					))}
				</div>
			</CardContent>
			<CardFooter className="justify-end gap-2">
				<Button size="sm" variant="ghost" onClick={handleCancel}>
					<X className="h-[14px] w-[14px]" />
					取消
				</Button>
				<Button
					size="sm"
					variant="default"
					onClick={handleSubmit}
					disabled={!canSubmit}>
					<CheckCircle2 className="h-[14px] w-[14px]" />
					提交
				</Button>
			</CardFooter>
		</Card>
	);
};

export default AskUserCard;

/** 单个问题的输入控件(纯函数,允许与主组件同文件 — 非 React 组件) */
function QuestionInput(props: {
	q: AskUserQuestion;
	answers: AskUserAnswers;
	onSingle: (qid: string, value: string) => void;
	onMulti: (qid: string, value: string) => void;
	onText: (qid: string, value: string) => void;
}) {
	const { q, answers, onSingle, onMulti, onText } = props;

	if (q.type === "text") {
		const val = (answers[q.id] as string) ?? "";
		return (
			<Textarea
				value={val}
				onChange={(e) => onText(q.id, e.target.value)}
				placeholder={q.placeholder}
				maxLength={q.maxLength}
				rows={3}
			/>
		);
	}

	const options = q.options ?? [];
	const selected = answers[q.id];

	return (
		<div className="flex flex-col gap-1.5">
			{options.map((opt) => {
				if (q.type === "single") {
					const isSelected = selected === opt.value;
					return (
						<label
							key={opt.value}
							className={`flex items-center cursor-pointer gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-primary/40 ${
								isSelected
									? "border-primary bg-primary/10"
									: "border-border/60 bg-background"
							}`}>
							<input
								type="radio"
								name={`ask-user-q-${q.id}`}
								value={opt.value}
								checked={isSelected}
								onChange={() => onSingle(q.id, opt.value)}
								className="mt-0.5 h-[14px] w-[14px] cursor-pointer accent-primary"
							/>
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium">{opt.label}</div>
								{opt.description ? (
									<div className="mt-0.5 text-xs text-muted-foreground">
										{opt.description}
									</div>
								) : null}
							</div>
						</label>
					);
				}
				// multi
				const arr = (selected as string[] | undefined) ?? [];
				const isChecked = arr.includes(opt.value);
				return (
					<label
						key={opt.value}
						className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-primary/40 ${
							isChecked
								? "border-primary bg-primary/10"
								: "border-border/60 bg-background"
						}`}>
						<input
							type="checkbox"
							value={opt.value}
							checked={isChecked}
							onChange={() => onMulti(q.id, opt.value)}
							className="mt-0.5 h-[14px] w-[14px] cursor-pointer accent-primary"
						/>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-medium">{opt.label}</div>
							{opt.description ? (
								<div className="mt-0.5 text-xs text-muted-foreground">
									{opt.description}
								</div>
							) : null}
						</div>
					</label>
				);
			})}
		</div>
	);
}
