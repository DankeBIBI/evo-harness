import { Ellipse, Group, Leafer, Line, Rect, Text } from 'leafer-ui';
import { useEffect, useRef, useState } from 'react';

export interface AgentNode {
  children?: string[];
  duration?: number;
  id: string;
  name: string;
  role: string;
  startTime?: number;
  status: 'error' | 'idle' | 'pending' | 'running' | 'success';
}

export interface AgentExecutionRecord {
  childId: string;
  duration?: number;
  endTime?: number;
  id: string;
  /** 所属 assistant 消息 id（用于 ChatMessages 按 msg 隔离渲染） */
  msgId?: string;
  parentId?: string;
  result?: string;
  startTime: number;
  status: 'error' | 'pending' | 'running' | 'success';
}

interface AgentOrchestrationGraphProps {
  executions: AgentExecutionRecord[];
  height?: number;
  nodes: AgentNode[];
  width?: number;
}

// 状态颜色映射
const STATUS_COLORS = {
  error: '#ef4444', // 红色
  idle: '#94a3b8', // 灰色
  pending: '#f59e0b', // 黄色
  running: '#3b82f6', // 蓝色
  success: '#22c55e', // 绿色
};

// 状态图标映射
const STATUS_ICONS = {
  error: '❌',
  idle: '⚪',
  pending: '⏳',
  running: '🔄',
  success: '✅',
};

export function AgentOrchestrationGraph({
  executions,
  height = 600,
  nodes,
  width = 800,
}: AgentOrchestrationGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leaferRef = useRef<Leafer | null>(null);
  const [selectedNode, setSelectedNode] = useState<null | string>(null);

  // 初始化 Leafer
  useEffect(() => {
    if (!containerRef.current) return;

    const leafer = new Leafer({
      height,
      view: containerRef.current,
      width,
    });

    leaferRef.current = leafer;

    return () => {
      leafer.destroy();
    };
  }, [width, height]);

  // 渲染节点和连接线
  useEffect(() => {
    const leafer = leaferRef.current;
    if (!leafer || nodes.length === 0) return;

    // 清空现有内容
    leafer.clear();

    // 计算节点位置（层级布局）
    const nodePositions = calculateNodePositions(nodes);

    // 绘制连接线
    drawConnections(leafer, nodes, nodePositions);

    // 绘制节点
    drawNodes(leafer, nodes, nodePositions, selectedNode, setSelectedNode);

    // 绘制图例
    drawLegend(leafer);
  }, [nodes, executions, selectedNode, width, height]);

  return (
    <div className="relative">
      <div
        className="bg-card shadow-soft overflow-hidden rounded-2xl"
        ref={containerRef}
        style={{ height, width }}
      />
      {/* 选中节点详情 */}
      {selectedNode && (
        <NodeDetailPanel
          executions={executions.filter(
            (e) => e.parentId === selectedNode || e.childId === selectedNode,
          )}
          node={nodes.find((n) => n.id === selectedNode)!}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

// 计算节点位置（树状层级布局）
function calculateNodePositions(
  nodes: AgentNode[],
): Map<string, { level: number; x: number; y: number }> {
  const positions = new Map<string, { level: number; x: number; y: number }>();

  // 构建父子关系
  const parentMap = new Map<string, string>();
  nodes.forEach((node) => {
    if (node.children) {
      node.children.forEach((childId) => {
        parentMap.set(childId, node.id);
      });
    }
  });

  // 找到根节点（没有父节点的）
  const rootNodes = nodes.filter((n) => !parentMap.has(n.id));

  // BFS 分配层级和位置
  const visited = new Set<string>();

  // 统计每层节点数
  const levelNodeCount = new Map<number, number>();
  const queue: Array<{ id: string; level: number }> = rootNodes.map((n) => ({
    id: n.id,
    level: 0,
  }));

  while (queue.length > 0) {
    const { level } = queue.shift()!;
    levelNodeCount.set(level, (levelNodeCount.get(level) || 0) + 1);
    const node = nodes.find((n) => n.id === queue[0]?.id);
    if (node?.children) {
      node.children.forEach((childId) => {
        queue.push({ id: childId, level: level + 1 });
      });
    }
  }

  // 重新计算位置
  const levelIndex = new Map<number, number>();
  visited.clear();
  const processQueue: Array<{ id: string; level: number }> = rootNodes.map(
    (n) => ({
      id: n.id,
      level: 0,
    }),
  );

  while (processQueue.length > 0) {
    const { id, level } = processQueue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const nodeCount = levelNodeCount.get(level) || 1;
    const currentIndex = levelIndex.get(level) || 0;
    levelIndex.set(level, currentIndex + 1);

    positions.set(id, {
      level,
      x: (currentIndex - (nodeCount - 1) / 2) * 180,
      y: level * 120 + 80,
    });

    const node = nodes.find((n) => n.id === id);
    if (node?.children) {
      node.children.forEach((childId) => {
        processQueue.push({ id: childId, level: level + 1 });
      });
    }
  }

  return positions;
}

// 绘制连接线
function drawConnections(
  leafer: Leafer,
  nodes: AgentNode[],
  positions: Map<string, { level: number; x: number; y: number }>,
) {
  nodes.forEach((node) => {
    if (!node.children) return;

    const parentPos = positions.get(node.id);
    if (!parentPos) return;

    node.children.forEach((childId) => {
      const childPos = positions.get(childId);
      if (!childPos) return;

      const childNode = nodes.find((n) => n.id === childId);
      const isSuccess = childNode?.status === 'success';
      const isError = childNode?.status === 'error';
      const isRunning = childNode?.status === 'running';

      const strokeColor = isError
        ? STATUS_COLORS.error
        : isSuccess
          ? STATUS_COLORS.success
          : isRunning
            ? STATUS_COLORS.running
            : '#94a3b8';

      // 绘制带箭头的连接线
      const line = new Line({
        points: [
          parentPos.x + 60,
          parentPos.y + 50,
          childPos.x + 60,
          childPos.y,
        ],
        stroke: strokeColor,
        strokeWidth: isRunning ? 3 : 2,
      });

      // 添加箭头装饰（简单的三角形）
      const arrowX = childPos.x + 60;
      const arrowY = childPos.y + 8;
      const arrow = new Line({
        closed: true,
        fill: strokeColor,
        points: [arrowX - 6, arrowY, arrowX + 6, arrowY, arrowX, arrowY + 10],
        stroke: strokeColor,
        strokeWidth: 1,
      });

      leafer.add(line);
      leafer.add(arrow);
    });
  });
}

// 绘制节点
function drawNodes(
  leafer: Leafer,
  nodes: AgentNode[],
  positions: Map<string, { level: number; x: number; y: number }>,
  selectedNode: null | string,
  onSelect: (id: string) => void,
) {
  nodes.forEach((node) => {
    const pos = positions.get(node.id);
    if (!pos) return;

    const isSelected = selectedNode === node.id;
    const statusColor = STATUS_COLORS[node.status] || STATUS_COLORS.idle;

    // 节点组
    const nodeGroup = new Group({
      x: pos.x,
      y: pos.y,
    });

    // 背景矩形
    const bg = new Rect({
      cornerRadius: 8,
      fill: isSelected ? '#e0f2fe' : '#ffffff',
      height: 80,
      stroke: isSelected ? STATUS_COLORS.running : statusColor,
      strokeWidth: isSelected ? 2 : 1,
      width: 120,
    });

    // 状态指示器
    const statusIndicator = new Ellipse({
      fill: statusColor,
      height: 20,
      stroke: '#ffffff',
      strokeWidth: 2,
      width: 20,
      x: 105,
      y: 5,
    });

    // 状态图标
    const icon = new Text({
      fontSize: 14,
      text: STATUS_ICONS[node.status],
      x: 8,
      y: 8,
    });

    // 节点名称
    const name = new Text({
      fill: '#1e293b',
      fontSize: 13,
      fontWeight: 'bold',
      text: node.name,
      x: 28,
      y: 8,
    });

    // 角色描述
    const role = new Text({
      fill: '#64748b',
      fontSize: 11,
      text: node.role.length > 12 ? `${node.role.slice(0, 12)}...` : node.role,
      x: 8,
      y: 32,
    });

    // 执行时间
    if (node.duration !== undefined) {
      const duration = new Text({
        fill: '#94a3b8',
        fontSize: 10,
        text: `${(node.duration / 1000).toFixed(1)}s`,
        x: 8,
        y: 52,
      });
      nodeGroup.add(duration);
    }

    // 状态标签
    const statusText = new Text({
      fill: statusColor,
      fontSize: 9,
      text: node.status.toUpperCase(),
      x: 8,
      y: 62,
    });

    nodeGroup.add([bg, statusIndicator, icon, name, role, statusText]);

    // 点击事件
    nodeGroup.on('click', () => {
      onSelect(node.id);
    });

    // 运行中动画效果 - 简单的闪烁效果通过改变透明度实现
    if (node.status === 'running') {
      let opacity = 1;
      const animate = () => {
        opacity = opacity === 1 ? 0.6 : 1;
        bg.opacity = opacity;
        setTimeout(animate, 500);
      };
      animate();
    }

    leafer.add(nodeGroup);
  });
}

// 绘制图例
function drawLegend(leafer: Leafer) {
  const legendGroup = new Group({ x: 20, y: 20 });

  const statuses = ['idle', 'pending', 'running', 'success', 'error'] as const;

  statuses.forEach((status, index) => {
    const indicator = new Ellipse({
      fill: STATUS_COLORS[status],
      height: 14,
      width: 14,
      x: index * 80,
      y: 0,
    });

    const label = new Text({
      fill: '#64748b',
      fontSize: 11,
      text: status,
      x: index * 80 + 20,
      y: 0,
    });

    legendGroup.add(indicator);
    legendGroup.add(label);
  });

  leafer.add(legendGroup);
}

// 节点详情面板
interface NodeDetailPanelProps {
  executions: AgentExecutionRecord[];
  node: AgentNode;
  onClose: () => void;
}

function NodeDetailPanel({ executions, node, onClose }: NodeDetailPanelProps) {
  return (
    <div className="bg-card shadow-soft absolute right-4 top-4 w-72 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold">{node.name}</h3>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">状态:</span>
          <span
            className="rounded px-2 py-0.5 text-xs"
            style={{
              backgroundColor: `${STATUS_COLORS[node.status]}20`,
              color: STATUS_COLORS[node.status],
            }}
          >
            {STATUS_ICONS[node.status]} {node.status}
          </span>
        </div>

        <div className="text-muted-foreground">
          角色: <span className="text-foreground">{node.role}</span>
        </div>

        {node.duration && (
          <div className="text-muted-foreground">
            执行时间:{' '}
            <span className="text-foreground">
              {(node.duration / 1000).toFixed(2)}s
            </span>
          </div>
        )}

        {node.startTime && (
          <div className="text-muted-foreground">
            开始时间:{' '}
            <span className="text-foreground">
              {new Date(node.startTime).toLocaleTimeString()}
            </span>
          </div>
        )}

        <div className="mt-2 pt-2">
          <div className="text-muted-foreground mb-1">子代理执行记录:</div>
          {executions.length === 0 ? (
            <div className="text-muted-foreground/60 text-xs">暂无执行记录</div>
          ) : (
            <div className="max-h-32 space-y-1 overflow-auto">
              {executions.map((exec) => (
                <div
                  className="rounded-lg p-1.5 text-xs"
                  key={exec.id}
                  style={{
                    backgroundColor: `${STATUS_COLORS[exec.status]}10`,
                  }}
                >
                  <div className="flex justify-between">
                    <span>{exec.childId}</span>
                    <span
                      style={{
                        color: STATUS_COLORS[exec.status],
                      }}
                    >
                      {exec.status}
                    </span>
                  </div>
                  {exec.duration && (
                    <div className="text-muted-foreground/60">
                      {(exec.duration / 1000).toFixed(2)}s
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentOrchestrationGraph;
