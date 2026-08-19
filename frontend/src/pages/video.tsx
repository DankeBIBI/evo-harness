import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Button } from '@/components/ui/Button';
import { useClickOutside } from '@/hooks/useClickOutside';
import { VideoSidebar } from '@/pages/video/components/VideoSidebar';
import { VideoToolbar } from '@/pages/video/components/VideoToolbar';
import { useVideoAI } from '@/pages/video/hooks/useVideoAI';
import { useVideoWorkflow } from '@/pages/video/hooks/useVideoWorkflow';
import { NODE_TYPE_OPTIONS } from '@/pages/video/constants';
import type { VideoNodeKind } from '@/types/canvas';
import { Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

/** 画布双击菜单定位状态 */
interface ICanvasMenu {
  kinds: Array<{ kind: VideoNodeKind; label: string }>;
  x: number;
  y: number;
}

/**
 * AI 视频站入口
 * - 仅装配:Toolbar + Canvas + Sidebar
 * - 业务 state 与 handler 全部在 useVideoWorkflow 中
 */
export default function VideoPage() {
  const {
    addNode,
    connect,
    connectableTargets,
    disconnect,
    edges,
    moveNode,
    nodes,
    relatedEdges,
    removeNode,
    selectNode,
    selectedId,
    selectedNode,
    updateNodeBody,
    updateNodeImage,
  } = useVideoWorkflow();

  // AI 调用
  const { generateForNode, isGenerating } = useVideoAI();

  // 画布双击弹出的"节点类型"菜单
  const [canvasMenu, setCanvasMenu] = useState<ICanvasMenu | null>(null);
  const canvasMenuRef = useRef<HTMLDivElement>(null);

  // 菜单关闭逻辑(#2):点击外部 / ESC 都关闭
  const closeCanvasMenu = useCallback(() => setCanvasMenu(null), []);
  useClickOutside(canvasMenuRef, closeCanvasMenu, canvasMenu !== null);

  const handleCanvasDoubleClick = (x: number, y: number) => {
    setCanvasMenu({ kinds: NODE_TYPE_OPTIONS, x, y });
  };

  const handlePickCanvasKind = (kind: VideoNodeKind) => {
    if (!canvasMenu) return;
    addNode(kind, { x: canvasMenu.x, y: canvasMenu.y });
    setCanvasMenu(null);
  };

  // AI 生成本节点:根据节点类型 + 上游节点 body 拼指令,流式写到 body
  const handleAiGenerate = useCallback(() => {
    if (!selectedNode) return;
    const node = selectedNode;

    // 收集上游节点 body(从 relatedEdges 找 from 指向当前节点的)
    const upstreamBodies = relatedEdges
      .filter((e) => e.to === node.id)
      .map((e) => {
        const u = nodes.find((n) => n.id === e.from);
        return u ? `${u.title}: ${u.body}` : '';
      })
      .filter(Boolean)
      .join('\n');

    // 按节点类型拼指令
    const rolePrompts: Record<VideoNodeKind, string> = {
      script: '请生成一段 3-5 句的视频脚本(含画面 + 旁白)。',
      storyboard: '请将上述脚本拆分为 3-5 个分镜,每个分镜 1-2 句描述。',
      plot: '请生成一段情节描述(2-4 句),体现冲突与转折。',
      generate: '请为这个节点生成一段视频生成指令(可作为 Runway/Pika/Sora 等工具的 prompt)。',
      compose: '请生成合成指令:剪辑节奏 + 配乐 + 字幕建议。',
    };

    const instruction = [
      upstreamBodies ? `上游节点:\n${upstreamBodies}\n` : '',
      `当前节点: ${node.title} (${node.kind})`,
      rolePrompts[node.kind],
      '直接输出内容,不要 JSON 不要 markdown 标题。',
    ]
      .filter(Boolean)
      .join('\n\n');

    // 流式写入:每次 onProgress 追加到 body(实时显示)
    let acc = '';
    generateForNode({
      instruction,
      nodeId: node.id,
      onComplete: (text) => {
        updateNodeBody(node.id, text);
      },
      onError: (msg) => {
        console.error('[video AI] error:', msg);
      },
      onProgress: (delta) => {
        acc += delta;
        updateNodeBody(node.id, acc);
      },
    });
  }, [selectedNode, relatedEdges, nodes, generateForNode, updateNodeBody]);

  return (
    <div className="bg-background flex h-full w-full flex-col overflow-hidden">
      <VideoToolbar onAddNode={addNode} />

      <div className="flex min-h-0 flex-1">
        <div className="bg-muted/30 relative min-w-0 flex-1 overflow-hidden">
          <InfiniteCanvas
            edges={edges}
            nodes={nodes}
            selectedId={selectedId}
            onAddChild={(parentId, kind) => addNode(kind, { parentId })}
            onCanvasDoubleClick={handleCanvasDoubleClick}
            onNodeBodyChange={updateNodeBody}
            onNodeClick={selectNode}
            onNodeDelete={removeNode}
            onNodeImage={updateNodeImage}
            onNodeMove={moveNode}
          />

          {/* 画布双击弹出的类型菜单(浮动在点击位置) */}
          {canvasMenu && (
            <div
              className="bg-popover text-popover-foreground absolute z-20 w-40 rounded-md border p-1 shadow-lg"
              ref={canvasMenuRef}
              style={{ left: canvasMenu.x, top: canvasMenu.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="text-muted-foreground px-2 py-1 text-xs">选择节点类型</div>
              {canvasMenu.kinds.map((opt) => (
                <Button
                  className="w-full justify-start gap-2"
                  key={opt.kind}
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePickCanvasKind(opt.kind)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {opt.label}节点
                </Button>
              ))}
              <Button
                className="text-muted-foreground w-full justify-center"
                size="sm"
                variant="ghost"
                onClick={() => setCanvasMenu(null)}
              >
                取消
              </Button>
            </div>
          )}
        </div>

        <VideoSidebar
          connectableTargets={connectableTargets}
          isGenerating={isGenerating}
          nodes={nodes}
          relatedEdges={relatedEdges}
          selectedId={selectedId}
          selectedNode={selectedNode}
          onAiGenerate={handleAiGenerate}
          onConnect={connect}
          onDisconnect={disconnect}
          onSelect={selectNode}
        />
      </div>
    </div>
  );
}