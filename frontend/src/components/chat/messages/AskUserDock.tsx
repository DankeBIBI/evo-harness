/**
 * AskUserDock — 把 AI 提交的提问卡吸附在 ChatInput 上方
 *
 * 设计:
 *   - 数据源: useAskUserStore.pending + snapshots(按 tcId 索引)
 *   - pending 且 !settled → AskUserCard(用户可交互)
 *   - snapshots(已 submit/cancel) → AskUserFoldedChip(单行折叠态,"询问已答 ✓"反馈)
 *   - 多个 tcId 同时活跃/已答时按 id 排序堆叠;pending 排前,snapshot 排后
 *
 * 与 PlanStageCard 同位:位于 ChatWindow 中 ChatInput 上方,不在对话流里。
 */

import { useMemo } from "react";

import { useAskUserStore } from "@/stores/askUserStore";

import AskUserCard from "./AskUserCard";
import AskUserFoldedChip from "./AskUserFoldedChip";

const AskUserDock: React.FC = () => {
	// 同时订阅 pending 与 snapshots;useMemo 保证两个 map 都不变时不重算
	const pending = useAskUserStore((s) => s.pending);
	const snapshots = useAskUserStore((s) => s.snapshots);

	const { pendingIds, snapshotIds } = useMemo(() => {
		const p: string[] = [];
		for (const [id, entry] of pending) {
			if (entry && !entry.settled) p.push(id);
		}
		const s: string[] = [];
		for (const [id, entry] of snapshots) {
			if (entry) s.push(id);
		}
		p.sort();
		s.sort();
		return { pendingIds: p, snapshotIds: s };
	}, [pending, snapshots]);

	if (pendingIds.length === 0 && snapshotIds.length === 0) return null;

	return (
		<div className="flex w-full shrink-0 flex-col gap-2 px-[10px] pt-3">
			{pendingIds.map((tcId) => (
				<AskUserCard key={tcId} tcId={tcId} />
			))}
			{snapshotIds.map((tcId) => {
				const snap = snapshots.get(tcId);
				if (!snap) return null;
				return <AskUserFoldedChip key={tcId} snapshot={snap} tcId={tcId} />;
			})}
		</div>
	);
};

export default AskUserDock;
