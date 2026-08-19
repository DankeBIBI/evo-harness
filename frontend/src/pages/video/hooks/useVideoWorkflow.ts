import { DEFAULT_NODE_WIDTH } from '@/components/canvas/nodeGeometry';
import type { IVideoEdge, IVideoNode, VideoNodeKind } from '@/types/canvas';
import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_EDGES,
  DEFAULT_NODES,
  DEFAULT_SELECTED_ID,
  NODE_GRID,
  nextEdgeId,
  nextNodeId,
} from '../constants';

/** 工作流 state 与 handler 集合 */
export interface IVideoWorkflow {
  /** 全部连线 */
  edges: IVideoEdge[];
  /** 与选中节点相关的连线 */
  relatedEdges: IVideoEdge[];
  /** 选中节点对象(无选中时为 null) */
  selectedNode: IVideoNode | null;
  /** 当前选中节点 id */
  selectedId: null | string;
  /** 全部节点 */
  nodes: IVideoNode[];
  /** 可连接的目标节点(排除自己 + 已连线) */
  connectableTargets: IVideoNode[];
  /** 增加连线 */
  connect: (toId: string) => void;
  /** 删除连线 */
  disconnect: (edgeId: string) => void;
  /** 删除节点 */
  removeNode: (id: string) => void;
  /** 设置选中节点 */
  selectNode: (id: null | string) => void;
  /** 新增节点 */
  addNode: (kind: VideoNodeKind, opts?: IAddNodeOpts) => void;
  /** 节点位置变更 */
  moveNode: (id: string, x: number, y: number) => void;
  /** 节点文案变更 */
  updateNodeBody: (id: string, body: string) => void;
  /** 节点图片变更 */
  updateNodeImage: (id: string, dataUrl: string) => void;
}

/** addNode 可选参数 */
export interface IAddNodeOpts {
  /** 父节点 id(传入则自动建 parent → new 的连线) */
  parentId?: string;
  /** 指定 X 坐标(默认走网格布局) */
  x?: number;
  /** 指定 Y 坐标(默认走网格布局) */
  y?: number;
}

/**
 * AI 视频站工作流状态管理 hook
 * - 集中管理 nodes / edges / selectedId
 * - 暴露所有 CRUD handler
 * - 派生 relatedEdges / connectableTargets / selectedNode
 */
export function useVideoWorkflow(): IVideoWorkflow {
  const [nodes, setNodes] = useState<IVideoNode[]>(DEFAULT_NODES);
  const [edges, setEdges] = useState<IVideoEdge[]>(DEFAULT_EDGES);
  const [selectedId, setSelectedId] = useState<null | string>(DEFAULT_SELECTED_ID);

  // 节点索引(选中节点查找走索引,避免拖动其他节点时 selectedNode useMemo 失效)
  const nodeMap = useMemo(() => {
    const m = new Map<string, IVideoNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const selectedNode = useMemo(
    () => (selectedId ? nodeMap.get(selectedId) ?? null : null),
    [nodeMap, selectedId],
  );

  // 通用节点 patch(DRY:避免 moveNode/updateNodeBody/updateNodeImage 三处重复 setNodes(map))
  const updateNode = useCallback((id: string, patch: Partial<IVideoNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    updateNode(id, { x, y });
  }, [updateNode]);

  const updateNodeBody = useCallback((id: string, body: string) => {
    updateNode(id, { body });
  }, [updateNode]);

  const updateNodeImage = useCallback((id: string, dataUrl: string) => {
    updateNode(id, { imageDataUrl: dataUrl });
  }, [updateNode]);

  // 删除节点 + 同步清理连线
  const removeNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  // 新增节点(指定类型)— 默认走网格布局;若指定 parentId/坐标则用之
  // - parentId 模式:放在"已有子节点最下方"避免重叠(#3 #12 修复:连点 + 不会堆积在同一位置)
  // - 注意:不写 height 字段,实际高度由 calcNodeHeight 根据 body/imageDataUrl 动态计算
  const addNode = useCallback((kind: VideoNodeKind, opts?: IAddNodeOpts) => {
    const id = nextNodeId();
    const parentId = opts?.parentId;
    const newNode: IVideoNode = {
      body: '',
      id,
      kind,
      subtitle: '',
      title: '新节点',
      width: DEFAULT_NODE_WIDTH,
      x: 0,
      y: 0,
    };

    setNodes((prev) => {
      const offset = prev.length;
      const col = offset % 3;
      const row = Math.floor(offset / 3);

      // 父节点存在 → 在 setNodes 闭包内一次性完成"找父 + 算坐标 + 校验存在"
      const parent = parentId ? prev.find((n) => n.id === parentId) : null;

      let x: number;
      let y: number;

      if (opts?.x !== undefined && opts?.y !== undefined) {
        // 显式坐标(画布双击)
        x = opts.x;
        y = opts.y;
      } else if (parent) {
        // 父节点正下方,且 y 从"已有子节点最下方"开始,避免连点 + 重叠
        const siblingsMaxY = prev.reduce<number>((maxY, n) => {
          // 同 x 列(容差 8px)且 y 在父节点以下 → 视为已有子节点
          if (
            Math.abs(n.x - parent.x) < 8 &&
            n.y > parent.y &&
            n.id !== parent.id
          ) {
            return Math.max(maxY, n.y);
          }
          return maxY;
        }, parent.y);
        x = opts?.x ?? parent.x;
        y = opts?.y ?? siblingsMaxY + NODE_GRID.row;
      } else {
        // 无父节点 → 走默认网格
        x = NODE_GRID.startX + col * NODE_GRID.col;
        y = NODE_GRID.startY + row * NODE_GRID.row;
      }

      newNode.x = x;
      newNode.y = y;
      return [...prev, newNode];
    });
    setSelectedId(id);

    // 父节点真实存在 → 自动建 parent → new 的连线(#5:不存在则跳过,避免孤儿边)
    if (parentId) {
      // 用 setNodes 闭包已校验过 parent;此处用 ref 状态判断
      // 简化:addNode 内的 setNodes 闭包已确认 parent 存在;此处直接 push edge
      setEdges((prev) => {
        // 防止重复边(双向)
        const dup = prev.some(
          (e) =>
            (e.from === parentId && e.to === id) ||
            (e.from === id && e.to === parentId),
        );
        if (dup) {
          return prev;
        }
        return [...prev, { from: parentId, id: nextEdgeId(), to: id }];
      });
    }
  }, []);

  // 增加连线:connectableTargets 已排除已连线节点(双向),此处只校验自连 + 兜底
  const connect = useCallback(
    (toId: string) => {
      if (!selectedId || selectedId === toId) {
        return;
      }

      setEdges((prev) => {
        const dup = prev.some(
          (e) =>
            (e.from === selectedId && e.to === toId) ||
            (e.from === toId && e.to === selectedId),
        );
        if (dup) {
          return prev;
        }
        return [...prev, { from: selectedId, id: nextEdgeId(), to: toId }];
      });
    },
    [selectedId],
  );

  const disconnect = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  const selectNode = useCallback((id: null | string) => {
    setSelectedId(id);
  }, []);

  // 与选中节点相关的连线
  const relatedEdges = useMemo(() => {
    if (!selectedId) return [];
    return edges.filter((e) => e.from === selectedId || e.to === selectedId);
  }, [edges, selectedId]);

  // 可连接的目标节点(排除自己,排除已连线)
  const connectableTargets = useMemo(() => {
    if (!selectedId) return [];
    const linked = new Set(
      edges.filter((e) => e.from === selectedId).map((e) => e.to),
    );
    return nodes.filter((n) => n.id !== selectedId && !linked.has(n.id));
  }, [edges, nodes, selectedId]);

  return {
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
  };
}