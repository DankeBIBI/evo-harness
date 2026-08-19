import type { IVideoNode } from '@/types/canvas';

/** 节点默认宽度(新增节点使用;高度由 body / 图片动态计算,见 calcNodeHeight) */
export const DEFAULT_NODE_WIDTH = 240;

/** 节点布局尺寸常量(节点高度由 calcNodeHeight 动态算出) */
export const NODE_LAYOUT = {
  /** header:类型 + 关闭按钮 */
  header: 24,
  /** 标题行 */
  title: 22,
  /** 操作栏:上传按钮 + 副标题 */
  toolbar: 28,
  /** 图片缩略图固定高度 */
  image: 90,
  /** 上下内边距合计 */
  verticalPadding: 12,
  /** textarea 每行高度 */
  textareaLineHeight: 18,
  /** textarea 上下内边距 */
  textareaVerticalPadding: 12,
  /** textarea 最大高度 */
  textareaMaxHeight: 120,
  /** textarea 每行可容纳字符数(中英文混合加权:中文 ~2x,英文 ~1x;实测约 11 字/行) */
  textareaColsPerLine: 11,
  /** textarea 最小行数 */
  textareaMinLines: 3,
} as const;

/**
 * 节点实际渲染高度(根据 body / imageDataUrl 动态计算)
 * - 单一来源:渲染节点 div 和计算连线锚点都调用此函数
 * - 必须保持唯一,否则连线起点会跟节点实际边缘错位
 */
export function calcNodeHeight(node: IVideoNode): number {
  const lines = Math.max(
    NODE_LAYOUT.textareaMinLines,
    Math.ceil((node.body?.length ?? 0) / NODE_LAYOUT.textareaColsPerLine),
  );
  const textareaH = Math.min(
    lines * NODE_LAYOUT.textareaLineHeight + NODE_LAYOUT.textareaVerticalPadding,
    NODE_LAYOUT.textareaMaxHeight,
  );
  const imageH = node.imageDataUrl ? NODE_LAYOUT.image : 0;
  return (
    NODE_LAYOUT.header +
    NODE_LAYOUT.title +
    imageH +
    textareaH +
    NODE_LAYOUT.toolbar +
    NODE_LAYOUT.verticalPadding
  );
}

// ============ 连线锚点与 Bezier 路径 ============

/** 节点四边的连接锚点 */
export type AnchorSide = 'bottom' | 'left' | 'right' | 'top';

/** 四边方向常量(单一来源,避免重复定义) */
export const ALL_SIDES: readonly AnchorSide[] = ['top', 'right', 'bottom', 'left'];

/** 节点矩形(用于连线计算)— 用 calcNodeHeight 算出的实际高度 */
export interface INodeRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface IPoint {
  x: number;
  y: number;
}

/** 计算矩形四边中点(画布绝对坐标) */
export function getAnchor(rect: INodeRect, side: AnchorSide): IPoint {
  switch (side) {
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y };
    default: {
      // 穷尽守卫:AnchorSide 扩展时编译器会报错
      const _exhaustive: never = side;
      throw new Error(`Unknown anchor side: ${String(_exhaustive)}`);
    }
  }
}

/** 矩形中心点 */
export function getCenter(rect: INodeRect): IPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** 计算两点欧氏距离的平方(避免开方) */
function distSq(a: IPoint, b: IPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * 自动选边算法:
 * - 源矩形 4 个锚点 → 选距离目标中心最近的
 * - 目标矩形 4 个锚点 → 选距离源中心最近的
 */
export function pickAnchors(from: INodeRect, to: INodeRect): { fromPoint: IPoint; toPoint: IPoint } {
  const toCenter = getCenter(to);
  const fromCenter = getCenter(from);

  let fromPoint = getAnchor(from, 'right');
  let fromBest = Infinity;
  for (const side of ALL_SIDES) {
    const p = getAnchor(from, side);
    const d = distSq(p, toCenter);
    if (d < fromBest) {
      fromBest = d;
      fromPoint = p;
    }
  }

  let toPoint = getAnchor(to, 'left');
  let toBest = Infinity;
  for (const side of ALL_SIDES) {
    const p = getAnchor(to, side);
    const d = distSq(p, fromCenter);
    if (d < toBest) {
      toBest = d;
      toPoint = p;
    }
  }

  return { fromPoint, toPoint };
}

/**
 * 计算两点间 cubic bezier path
 * - 水平连接(左右):控制点水平偏移
 * - 垂直连接(上下):控制点垂直偏移
 * - 控制点偏移量 = 距离的 0.5,至少 40px
 */
export function buildEdgePath(from: INodeRect, to: INodeRect): string {
  const { fromPoint, toPoint } = pickAnchors(from, to);
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  let c1x = fromPoint.x;
  let c1y = fromPoint.y;
  let c2x = toPoint.x;
  let c2y = toPoint.y;
  // 用 sqrt 代替 Math.hypot,避免 V8 上 3-5x 性能损耗
  const offset = Math.max(40, Math.sqrt(dx * dx + dy * dy) * 0.5);

  if (horizontal) {
    // 主方向水平 → 控制点水平偏移;dx=0 时强制正向避免 bezier 退化
    const sign = Math.sign(dx) || 1;
    c1x = fromPoint.x + sign * offset;
    c2x = toPoint.x - sign * offset;
  } else {
    // 主方向垂直 → 控制点垂直偏移;dy=0 时强制正向避免 bezier 退化
    const sign = Math.sign(dy) || 1;
    c1y = fromPoint.y + sign * offset;
    c2y = toPoint.y - sign * offset;
  }

  return `M ${fromPoint.x} ${fromPoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toPoint.x} ${toPoint.y}`;
}