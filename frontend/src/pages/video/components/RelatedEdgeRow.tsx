import type { IVideoEdge } from '@/types/canvas';
import { Trash2 } from 'lucide-react';

interface RelatedEdgeRowProps {
  edge: IVideoEdge;
  isOutgoing: boolean;
  onDisconnect: (edgeId: string) => void;
  peerTitle: string;
}

/** 单条相关连线行(出向/入向 + 对端节点名 + 删除按钮) */
export function RelatedEdgeRow({ edge, isOutgoing, onDisconnect, peerTitle }: RelatedEdgeRowProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{isOutgoing ? '→ ' : '← '}</span>
      <span className="flex-1 truncate">{peerTitle}</span>
      <button
        aria-label="删除连线"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onDisconnect(edge.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}