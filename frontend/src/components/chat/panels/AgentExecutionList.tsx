/**
 * 消息级子 Agent 执行记录列表
 * 渲染后端 child_result / dispatch 事件回填的 AgentExecutionRecord
 * 用于让用户在聊天流里直接看到"统一入口"如何分发到下层 Agent
 */

import { Bot, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';

import type { AgentExecutionRecord } from '@/components/agent/AgentOrchestrationGraph';

interface Props {
  availableAgents: Array<{ id: string; name: string; role?: string }>;
  records: AgentExecutionRecord[];
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s - m * 60).toFixed(0)}s`;
}

function StatusIcon({ status }: { status: AgentExecutionRecord['status'] }) {
  if (status === 'running')
    return <Loader2 className="text-primary h-[14px] w-[14px] animate-spin" />;
  if (status === 'success')
    return <CheckCircle2 className="h-[14px] w-[14px] text-green-500" />;
  if (status === 'error')
    return <XCircle className="h-[14px] w-[14px] text-red-500" />;
  return <Clock3 className="text-muted-foreground h-[14px] w-[14px]" />;
}

export function AgentExecutionList({ availableAgents, records }: Props) {
  if (records.length === 0) return null;

  const nameById = new Map(availableAgents.map((a) => [a.id, a.name]));

  return (
    <div className="border-primary/20 bg-primary/5 ml-1 mt-2 space-y-1 rounded-md border border-dashed p-2 text-xs">
      <div className="text-muted-foreground flex items-center gap-1 font-medium">
        <Bot className="h-[12px] w-[12px]" />子 Agent 执行记录
        <span className="bg-primary/10 ml-1 rounded px-1.5 py-px text-[10px]">
          {records.length}
        </span>
      </div>
      <ul className="space-y-1">
        {records.map((r) => {
          const name = nameById.get(r.childId) ?? r.childId;
          return (
            <li
              className="hover:bg-primary/10 flex items-start gap-2 rounded px-1.5 py-1"
              key={r.id}
            >
              <StatusIcon status={r.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{name}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
                    {formatDuration(r.duration)}
                  </span>
                </div>
                {r.result && (
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">
                    {r.result}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
