/**
 * PR-1 (2026-07-10): Plan 阶段卡 — 用户审批 plan
 *
 * 数据源:planStore.pendingPlan + planStore.status
 * 行为:
 *   - 仅在 pendingPlan 非空 + status === 'pending' 时渲染
 *   - 用户点 Approve / Refine / Reject → 调 planStore action → resolve waitForDecision Promise
 *   - Refine 时弹 Textarea 让用户填反馈
 *
 * 复用 Card / CardHeader / CardTitle / CardContent / CardFooter / Button
 * 不复用 ChatInput——避免重文件级互依赖
 */

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { usePlanStore } from '@/stores/planStore';
import { CheckCircle2, FileText, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';

const RISK_LABEL: Record<'high' | 'low' | 'med', string> = {
  high: '高风险',
  low: '低风险',
  med: '中风险',
};

const RISK_VARIANT = {
  high: 'destructive' as const,
  low: 'success' as const,
  med: 'warning' as const,
};

const PlanStageCard: React.FC = () => {
  const pendingPlan = usePlanStore((s) => s.pendingPlan);
  const status = usePlanStore((s) => s.status);
  const refine = usePlanStore((s) => s.refine);
  const reject = usePlanStore((s) => s.reject);
  const approve = usePlanStore((s) => s.approve);

  const [refining, setRefining] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (!pendingPlan || status !== 'pending') return null;

  const handleRefine = () => {
    if (!feedback.trim()) return;
    refine(feedback.trim());
    setFeedback('');
    setRefining(false);
  };

  return (
    <Card
      className="border-primary/40 bg-card"
      role="region"
      aria-label="Plan approval"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-[16px] w-[16px] text-primary" />
          <CardTitle className="text-base">实现计划待批准</CardTitle>
          <Badge variant="secondary">{pendingPlan.steps.length} 步</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{pendingPlan.summary}</p>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {pendingPlan.steps.map((step, idx) => (
            <li
              key={step.id}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
            >
              <span className="mt-0.5 inline-flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary tabular-nums">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {step.title}
                  </span>
                  {step.risk ? (
                    <Badge variant={RISK_VARIANT[step.risk]}>
                      {RISK_LABEL[step.risk]}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {step.action}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {refining ? (
          <div className="mt-4 flex flex-col gap-2">
            <textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="告诉 AI 怎么改这个计划…"
              className="min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRefining(false)}>
                取消
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleRefine}
                disabled={!feedback.trim()}
              >
                提交反馈
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => reject()}>
          <XCircle className="h-[14px] w-[14px]" />
          拒绝
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRefining(true)}>
          <RefreshCw className="h-[14px] w-[14px]" />
          优化
        </Button>
        <Button size="sm" variant="default" onClick={() => approve()}>
          <CheckCircle2 className="h-[14px] w-[14px]" />
          批准
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PlanStageCard;
