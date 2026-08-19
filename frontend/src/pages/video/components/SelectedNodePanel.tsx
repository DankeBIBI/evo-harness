import type { IVideoNode } from '@/types/canvas';
import { Sparkles } from 'lucide-react';

interface SelectedNodePanelProps {
  /** 是否正在 AI 生成(用于按钮 disabled / loading 文案) */
  isGenerating?: boolean;
  /** 当前选中节点 */
  node: IVideoNode;
  /** 触发 AI 生成回调 */
  onAiGenerate?: () => void;
}

/** 当前选中节点信息卡 */
export function SelectedNodePanel({
  isGenerating,
  node,
  onAiGenerate,
}: SelectedNodePanelProps) {
  return (
    <section>
      <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
        当前选中节点
      </div>
      <div className="rounded-lg border p-3 text-sm">
        <div className="font-semibold">{node.title}</div>
        <div className="text-muted-foreground mt-1 text-xs">类型:{node.kind}</div>
        <div className="text-muted-foreground mt-1 text-xs">
          位置: ({Math.round(node.x)}, {Math.round(node.y)})
        </div>
      </div>
      {onAiGenerate && (
        <button
          className="bg-primary/10 text-primary hover:bg-primary/20 mt-3 flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm font-medium disabled:opacity-50"
          disabled={isGenerating}
          onClick={onAiGenerate}
        >
          <Sparkles className="h-4 w-4" />
          {isGenerating ? 'AI 生成中...' : 'AI 生成本节点内容'}
        </button>
      )}
    </section>
  );
}