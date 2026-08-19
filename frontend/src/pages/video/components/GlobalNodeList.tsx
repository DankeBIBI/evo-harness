import type { IVideoNode } from '@/types/canvas';

interface GlobalNodeListProps {
  nodes: IVideoNode[];
  onSelect: (id: string) => void;
  selectedId: null | string;
}

/** 全局节点列表 */
export function GlobalNodeList({ nodes, onSelect, selectedId }: GlobalNodeListProps) {
  return (
    <section>
      <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
        全局节点({nodes.length})
      </div>
      <div className="space-y-1">
        {nodes.map((n) => (
          <button
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
              n.id === selectedId ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
            }`}
            key={n.id}
            onClick={() => onSelect(n.id)}
          >
            <span className="truncate">{n.title || '未命名'}</span>
            <span className="text-muted-foreground ml-auto">{n.kind}</span>
          </button>
        ))}
      </div>
    </section>
  );
}