import type { IVideoEdge, IVideoNode } from '@/types/canvas';
import { CirclePlus } from 'lucide-react';
import { useMemo } from 'react';
import { RelatedEdgeRow } from './RelatedEdgeRow';

interface ConnectionPanelProps {
  connectableTargets: IVideoNode[];
  /** 全局节点列表 — 仅用于构建标题索引(实际渲染只展示 selectedId 关联的边) */
  nodes: IVideoNode[];
  relatedEdges: IVideoEdge[];
  selectedId: string;
  onConnect: (toId: string) => void;
  onDisconnect: (edgeId: string) => void;
}

/** 连线管理面板:列出与选中节点相关的连线 + 可连接的目标 */
export function ConnectionPanel({
  connectableTargets,
  nodes,
  onConnect,
  onDisconnect,
  relatedEdges,
  selectedId,
}: ConnectionPanelProps) {
  // 节点标题索引 — 独立 useMemo,只跟 nodes 引用变才重建
  // (#10 修复:拖动其他节点时 nodes 引用变,但 peerTitleMap 仍依赖 nodes,因此每次拖动都重建
  // 优化:把 nodes 转 Map 单独缓存,peerTitleMap 只依赖 relatedEdges + nodeMap)
  const nodeTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) {
      m.set(n.id, n.title || '未命名');
    }
    return m;
  }, [nodes]);

  // peerTitleMap 只在 relatedEdges 或节点标题变化时重算
  const peerTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of relatedEdges) {
      const peerId = e.from === selectedId ? e.to : e.from;
      const title = nodeTitleMap.get(peerId);
      if (title) {
        m.set(e.id, title);
      }
    }
    return m;
  }, [relatedEdges, selectedId, nodeTitleMap]);

  return (
    <section>
      <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">
        连线管理
      </div>

      {relatedEdges.length > 0 && (
        <div className="mb-3 space-y-1">
          {relatedEdges.map((e) => (
            <RelatedEdgeRow
              edge={e}
              isOutgoing={e.from === selectedId}
              key={e.id}
              peerTitle={peerTitleMap.get(e.id) ?? '未知节点'}
              onDisconnect={onDisconnect}
            />
          ))}
        </div>
      )}

      {connectableTargets.length > 0 ? (
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            添加连线(从当前节点出发):
          </div>
          <div className="space-y-1">
            {connectableTargets.map((t) => (
              <button
                className="hover:bg-accent flex w-full items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs"
                key={t.id}
                onClick={() => onConnect(t.id)}
              >
                <CirclePlus className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground text-xs">无可连接的目标节点</div>
      )}
    </section>
  );
}