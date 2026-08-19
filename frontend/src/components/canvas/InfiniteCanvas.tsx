import { GRID_BG, NODE_STYLES } from '@/components/canvas/canvasStyles';
import {
  buildEdgePath,
  calcNodeHeight,
  INodeRect,
  NODE_LAYOUT,
} from '@/components/canvas/nodeGeometry';
import { NodeIcon } from '@/components/canvas/NodeIcon';
import type { IVideoEdge, IVideoNode, VideoNodeKind } from '@/types/canvas';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';

interface InfiniteCanvasProps {
  /** 节点连线关系 */
  edges: IVideoEdge[];
  /** 画布节点列表 */
  nodes: IVideoNode[];
  /** 画布高度 */
  height?: number | string;
  /** 当前选中节点 id */
  selectedId?: null | string;
  /** 画布宽度 */
  width?: number | string;
  /** 节点文案变更回调 */
  onNodeBodyChange?: (id: string, body: string) => void;
  /** 节点点击回调 */
  onNodeClick?: (id: string) => void;
  /** 删除节点回调 */
  onNodeDelete?: (id: string) => void;
  /** 节点图片上传回调 */
  onNodeImage?: (id: string, dataUrl: string) => void;
  /** 节点位置变更回调 */
  onNodeMove?: (id: string, x: number, y: number) => void;
  /** 添加子节点(底部 + 按钮)回调:parentId + 类型(默认 plot) */
  onAddChild?: (parentId: string, kind: VideoNodeKind) => void;
  /** 画布空白处双击回调 */
  onCanvasDoubleClick?: (x: number, y: number) => void;
}

/**
 * 无限画布(SVG 连线 + HTML 节点浮层混合架构)
 * - SVG 渲染连线,任意两节点 cubic bezier,拖拽实时计算
 * - div 浮层渲染节点卡片(支持拖拽、文案编辑、图片上传)
 */
export function InfiniteCanvas({
  edges,
  height = '100%',
  nodes,
  onAddChild,
  onCanvasDoubleClick,
  onNodeBodyChange,
  onNodeClick,
  onNodeDelete,
  onNodeImage,
  onNodeMove,
  selectedId,
  width = '100%',
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<null | string>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointerId = useRef<null | number>(null);
  // 唯一 marker id(防止页面上挂多个 InfiniteCanvas 时 SVG marker 冲突)
  const markerId = `arrowhead-${useId()}`;

  const nodeMap = useMemo(() => {
    const m = new Map<string, IVideoNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // 节点真实矩形(用 calcNodeHeight 算出动态高度)— 渲染和连线共享同一份,保证起点不漂移
  const nodeRects = useMemo(() => {
    const m = new Map<string, INodeRect>();
    for (const n of nodes) {
      m.set(n.id, {
        height: calcNodeHeight(n),
        width: n.width,
        x: n.x,
        y: n.y,
      });
    }
    return m;
  }, [nodes]);

  // 实时计算所有连线 path(用 nodeRects 而非 node.height)
  const edgePaths = useMemo(() => {
    const paths: Array<{ d: string; id: string }> = [];
    for (const e of edges) {
      const fromRect = nodeRects.get(e.from);
      const toRect = nodeRects.get(e.to);
      if (!fromRect || !toRect) continue;
      paths.push({ d: buildEdgePath(fromRect, toRect), id: e.id });
    }
    return paths;
  }, [edges, nodeRects]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, node: IVideoNode) => {
      // 在交互控件(输入/按钮/删除)上按下不启动拖拽
      const target = e.target as HTMLElement;
      if (target.closest('textarea, input, button, [data-no-drag]')) {
        return;
      }

      e.stopPropagation();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      dragOffset.current = { x: e.clientX - rect.left - node.x, y: e.clientY - rect.top - node.y };
      setDragId(node.id);
      activePointerId.current = e.pointerId;
      onNodeClick?.(node.id);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [onNodeClick],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragId) {
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const rawX = e.clientX - rect.left - dragOffset.current.x;
      const rawY = e.clientY - rect.top - dragOffset.current.y;
      // 限制在容器可视范围内 — 用 nodeRects 而非 node.height,保证与渲染高度一致
      const nodeRect = nodeRects.get(dragId);
      const maxX = Math.max(0, rect.width - (nodeRect?.width ?? 0));
      const maxY = Math.max(0, rect.height - (nodeRect?.height ?? 0));
      const x = Math.min(Math.max(0, rawX), maxX);
      const y = Math.min(Math.max(0, rawY), maxY);
      onNodeMove?.(dragId, x, y);
    },
    [dragId, nodeRects, onNodeMove],
  );

  const handlePointerUp = useCallback(() => {
    // 释放 pointer capture(避免残留)
    if (activePointerId.current !== null) {
      const target = containerRef.current?.querySelector(
        `[data-node-id="${dragId}"]`,
      ) as Element | null;
      target?.releasePointerCapture?.(activePointerId.current);
      activePointerId.current = null;
    }

    setDragId(null);
  }, [dragId]);

  const handleImageUpload = useCallback(
    (id: string) => (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // 清空 input,允许同一文件再次选择
      e.target.value = '';
      if (!file) {
        return;
      }

      // 类型校验
      if (!file.type.startsWith('image/')) {
        console.warn('[canvas] 非图片文件被忽略:', file.type);
        return;
      }
      // 大小校验: > 2MB 拒绝(DataURL 会膨胀到 ~2.7MB,吃内存)
      const MAX_SIZE = 2 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        console.warn('[canvas] 图片过大(>2MB),已忽略:', file.size);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? '');
        // 节点可能已被删除,放弃回调
        if (!dataUrl || !nodeMap.has(id)) {
          return;
        }

        onNodeImage?.(id, dataUrl);
      };
      reader.onerror = () => {
        console.error('[canvas] 图片读取失败:', reader.error);
      };
      reader.readAsDataURL(file);
    },
    [nodeMap, onNodeImage],
  );

  // 画布空白处双击 → 把坐标转成相对 container 的偏移后回调
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 仅在空白处触发(节点上的双击已被节点 div 自己处理)
      if ((e.target as HTMLElement).closest('[data-node-id]')) {
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      onCanvasDoubleClick?.(e.clientX - rect.left, e.clientY - rect.top);
    },
    [onCanvasDoubleClick],
  );

  return (
    <div
      className="relative h-full w-full overflow-auto"
      ref={containerRef}
      style={{ height, width }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleCanvasDoubleClick}
    >
      <div className="relative" style={{ minHeight: '100%', minWidth: '100%' }}>
        <div className="absolute inset-0" style={GRID_BG} />

        {/* SVG 连线层 */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0"
          height="100%"
          style={{ overflow: 'visible' }}
          width="100%"
        >
          <defs>
            <marker
              id={markerId}
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="6"
              refY="4"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#94a3b8" />
            </marker>
          </defs>
          {edgePaths.map((p) => (
            <path
              d={p.d}
              fill="none"
              key={p.id}
              markerEnd={`url(#${markerId})`}
              stroke="#94a3b8"
              strokeWidth={2}
            />
          ))}
        </svg>

        {/* 节点浮层 */}
        {nodes.map((node) => {
          const style = NODE_STYLES[node.kind];
          const isSelected = selectedId === node.id;
          // 从共享 nodeRects 取高度,与连线计算保持一致,保证锚点不漂移
          const nodeH = nodeRects.get(node.id)?.height ?? calcNodeHeight(node);
          return (
            <div
              className="absolute select-none rounded-xl border-2 shadow-sm"
              data-node-id={node.id}
              key={node.id}
              onPointerDown={(e) => handlePointerDown(e, node)}
              style={{
                background: style.fill,
                borderColor: style.primary,
                boxShadow: isSelected ? `0 0 0 2px ${style.primary}40` : undefined,
                cursor: dragId === node.id ? 'grabbing' : 'grab',
                height: nodeH,
                left: node.x,
                top: node.y,
                width: node.width,
              }}
            >
              <div
                className="flex items-center gap-1.5 px-2 pt-2 text-xs font-medium"
                style={{ color: style.primary }}
              >
                <NodeIcon className="h-3.5 w-3.5" name={style.icon} />
                <span>{style.label}</span>
                <button
                  aria-label="删除节点"
                  className="ml-auto rounded px-1 text-xs opacity-50 hover:opacity-100"
                  data-no-drag
                  onClick={(e) => {
                    e.stopPropagation();
                    onNodeDelete?.(node.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  ✕
                </button>
              </div>

              <div className="px-2 pt-0.5 text-sm font-semibold text-foreground">
                {node.title || '未命名节点'}
              </div>

              {node.imageDataUrl && (
                <div className="mx-2 mt-1.5 overflow-hidden rounded-md border border-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="节点图片"
                    className="block h-auto w-full"
                    src={node.imageDataUrl}
                  />
                </div>
              )}

              <textarea
                className="mx-2 mt-1.5 block w-[calc(100%-1rem)] resize-none rounded-md border border-transparent bg-white/60 px-1.5 py-1 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:border-current focus:outline-none"
                data-no-drag
                onChange={(e) => onNodeBodyChange?.(node.id, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="输入故事情节、文案、说明..."
                rows={Math.max(
                  NODE_LAYOUT.textareaMinLines,
                  Math.ceil((node.body?.length ?? 0) / NODE_LAYOUT.textareaColsPerLine),
                )}
                value={node.body}
              />

              <div className="mt-1 flex items-center gap-1 px-2 pb-2">
                <label
                  className="cursor-pointer rounded-md bg-white/70 px-2 py-0.5 text-[10px] font-medium hover:bg-white"
                  data-no-drag
                  style={{ color: style.primary }}
                >
                  {node.imageDataUrl ? '换图片' : '上传图片'}
                  <input
                    accept="image/*"
                    className="hidden"
                    data-no-drag
                    onChange={handleImageUpload(node.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    type="file"
                  />
                </label>
                {node.subtitle && (
                  <span className="truncate text-[10px] text-muted-foreground">{node.subtitle}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* 选中节点底部的 + 按钮(快速插入子节点) */}
        {onAddChild && selectedId
          ? (() => {
              const sel = nodeRects.get(selectedId);
              if (!sel) return null;
              return (
                <button
                  aria-label="添加子节点"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 absolute z-10 flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none shadow-md transition-transform hover:scale-110"
                  data-no-drag
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild(selectedId, 'plot');
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    left: sel.x + sel.width / 2 - 14,
                    top: sel.y + sel.height + 12,
                  }}
                >
                  +
                </button>
              );
            })()
          : null}
      </div>
    </div>
  );
}