import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useToolConfirmStore } from '@/stores/toolConfirmStore';
import { useToolPermissionStore } from '@/stores/toolPermissionStore';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useCallback } from 'react';

/**
 * 工具调用确认弹窗
 *
 * 行为:
 *   - 订阅 useToolConfirmStore.pending + batched
 *   - AI 并发 N 个工具调用时,合并到同一次确认,弹窗标题显示 "X 个工具"
 *   - 用户操作后,resolveAll 一次性应用到所有 batched(避免链式 deny 误伤)
 *   - 关闭弹窗(ESC/外部点击) = 全部拒绝
 */
export function ToolConfirmDialog() {
  const pending = useToolConfirmStore((s) => s.pending);
  const batchedCount = useToolConfirmStore((s) => s.batched.length);

  const handleResolveAll = useCallback(
    (action: 'allow-always' | 'allow-once' | 'deny') => {
      const state = useToolConfirmStore.getState();
      if (action === 'allow-always') {
        // 始终允许:对 batched 中每个不同工具名都改 auto
        const distinctTools = new Set(state.batched.map((r) => r.toolName));
        const permSetter = useToolPermissionStore.getState().setPermission;
        distinctTools.forEach((toolName) => permSetter(toolName, 'auto'));
      }
      state.resolveAll(action);
    },
    [],
  );

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && useToolConfirmStore.getState().batched.length > 0) {
          handleResolveAll('deny');
        }
      }}
      open={!!pending}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary h-5 w-5" />
            <DialogTitle>
              工具调用确认{batchedCount > 1 ? `（共 ${batchedCount} 个）` : ''}
            </DialogTitle>
          </div>
          <DialogDescription>
            AI 想要执行以下操作，请确认是否允许
          </DialogDescription>
        </DialogHeader>

        {pending && (
          <div className="space-y-3">
            {/* 工具名 */}
            <div className="bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2">
              <span className="text-muted-foreground text-xs">工具</span>
              <code className="text-foreground font-mono text-sm font-medium">
                {pending.toolName}
              </code>
            </div>

            {/* 关键参数(文件路径/命令等) */}
            {pending.keyParam && (
              <div className="bg-muted/30 rounded-md border px-3 py-2">
                <div className="text-muted-foreground mb-1 text-xs">操作对象</div>
                <code className="text-foreground block break-all font-mono text-xs">
                  {pending.keyParam}
                </code>
              </div>
            )}

            {/* 全部参数(折叠展示,便于排查) */}
            <details className="text-muted-foreground text-xs">
              <summary className="hover:text-foreground cursor-pointer">
                查看完整参数
              </summary>
              <pre className="bg-muted/30 mt-2 max-h-40 overflow-auto rounded-md border p-2 font-mono text-[11px]">
                {JSON.stringify(pending.params, null, 2)}
              </pre>
            </details>

            {/* 提示 */}
            <div className="text-muted-foreground flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 h-[14px] w-[14px] shrink-0" />
              <span>
                写入/删除类操作不可撤销，请确认操作对象正确后再允许
                {batchedCount > 1 ? '；本批所有工具将统一应用你的选择' : ''}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            className="border-border text-foreground hover:bg-muted/50 rounded-lg border px-3 py-1.5 text-sm transition-colors"
            onClick={() => handleResolveAll('deny')}
            type="button"
          >
            拒绝
          </button>
          <button
            className="border-border text-foreground hover:bg-muted/50 rounded-lg border px-3 py-1.5 text-sm transition-colors"
            onClick={() => handleResolveAll('allow-once')}
            type="button"
          >
            允许一次
          </button>
          <button
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-sm transition-colors"
            onClick={() => handleResolveAll('allow-always')}
            type="button"
          >
            始终允许
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
