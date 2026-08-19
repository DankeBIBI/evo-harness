import type { IVideoEdge, IVideoNode, VideoNodeKind } from '@/types/canvas';

/** 默认示例节点(脚本 → 分镜 → 情节 → 合成)
 * 注意:不写 height — 由 calcNodeHeight 根据 body/imageDataUrl 动态计算,
 *       保证连线锚点与渲染边缘对齐
 */
export const DEFAULT_NODES: IVideoNode[] = [
  {
    body: '一只白色小猫在雨后的巷子里发现一只蝴蝶,追逐着跑过青石板。',
    id: 'node-1',
    kind: 'script',
    subtitle: 'AI 生成脚本',
    title: '开场 - 雨后巷子',
    width: 240,
    x: 80,
    y: 60,
  },
  {
    body: '分镜 1:小猫特写\n分镜 2:中景追踪\n分镜 3:蝴蝶特写',
    id: 'node-2',
    kind: 'storyboard',
    subtitle: '拆解为 3 个镜头',
    title: '分镜拆解',
    width: 240,
    x: 360,
    y: 60,
  },
  {
    body: '第一幕:相遇\n蝴蝶落在小猫鼻尖,引发好奇追逐。',
    id: 'node-3',
    kind: 'plot',
    subtitle: '情节节点',
    title: '第一幕 · 相遇',
    width: 240,
    x: 80,
    y: 320,
  },
  {
    body: '第二幕:追逐\n小猫跑过花丛、跳过水洼、穿过老墙。',
    id: 'node-4',
    kind: 'plot',
    subtitle: '情节节点',
    title: '第二幕 · 追逐',
    width: 240,
    x: 360,
    y: 320,
  },
  {
    body: '第三幕:相遇\n小猫与蝴蝶停在一束阳光下,画面定格。',
    id: 'node-5',
    kind: 'compose',
    subtitle: '合成最终成片',
    title: '合成 · 定格',
    width: 240,
    x: 640,
    y: 200,
  },
];

export const DEFAULT_EDGES: IVideoEdge[] = [
  { from: 'node-1', id: 'edge-1', to: 'node-2' },
  { from: 'node-2', id: 'edge-2', to: 'node-3' },
  { from: 'node-3', id: 'edge-3', to: 'node-4' },
  { from: 'node-4', id: 'edge-4', to: 'node-5' },
];

/** 节点类型选项(工具栏下拉) */
export const NODE_TYPE_OPTIONS: Array<{ kind: VideoNodeKind; label: string }> = [
  { kind: 'plot', label: '情节' },
  { kind: 'script', label: '脚本' },
  { kind: 'storyboard', label: '分镜' },
  { kind: 'generate', label: '生成' },
  { kind: 'compose', label: '合成' },
];

/** 默认选中的节点 id */
export const DEFAULT_SELECTED_ID = 'node-1';

/** 新节点网格布局:列间距 + 行间距 */
export const NODE_GRID = { col: 280, row: 280, startX: 80, startY: 60 } as const;

/** ID 自增种子(模块级单例,保证全页面唯一递增) */
let nextNodeSeq = 100;
let nextEdgeSeq = 100;

/** 生成下一个节点 id */
export function nextNodeId(): string {
  return `node-${++nextNodeSeq}`;
}

/** 生成下一个连线 id */
export function nextEdgeId(): string {
  return `edge-${++nextEdgeSeq}`;
}