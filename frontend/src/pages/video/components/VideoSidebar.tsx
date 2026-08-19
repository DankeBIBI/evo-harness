import type { IVideoEdge, IVideoNode } from '@/types/canvas';
import { ConnectionPanel } from './ConnectionPanel';
import { EmptyHint } from './EmptyHint';
import { GlobalNodeList } from './GlobalNodeList';
import { SelectedNodePanel } from './SelectedNodePanel';

interface VideoSidebarProps {
  connectableTargets: IVideoNode[];
  /** AI 是否正在生成(用于 SelectedNodePanel 按钮 loading) */
  isGenerating?: boolean;
  nodes: IVideoNode[];
  relatedEdges: IVideoEdge[];
  selectedId: null | string;
  selectedNode: IVideoNode | null;
  /** AI 生成本节点内容回调 */
  onAiGenerate?: () => void;
  onConnect: (toId: string) => void;
  onDisconnect: (edgeId: string) => void;
  onSelect: (id: null | string) => void;
}

/** 右侧详情侧栏:选中节点 / 连线管理 / 全局节点列表 */
export function VideoSidebar({
  connectableTargets,
  isGenerating,
  nodes,
  onAiGenerate,
  onConnect,
  onDisconnect,
  onSelect,
  relatedEdges,
  selectedId,
  selectedNode,
}: VideoSidebarProps) {
  if (!selectedNode || !selectedId) {
    return (
      <aside className="bg-background hidden w-80 shrink-0 border-l p-4 lg:block">
        <EmptyHint />
      </aside>
    );
  }

  return (
    <aside className="bg-background hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l p-4 lg:block">
      <SelectedNodePanel
        isGenerating={isGenerating}
        node={selectedNode}
        onAiGenerate={onAiGenerate}
      />
      <ConnectionPanel
        connectableTargets={connectableTargets}
        nodes={nodes}
        relatedEdges={relatedEdges}
        selectedId={selectedId}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
      <GlobalNodeList nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
    </aside>
  );
}