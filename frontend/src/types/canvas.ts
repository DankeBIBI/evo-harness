/** 视频工作流节点类型 */
export type VideoNodeKind =
  | 'compose'
  | 'generate'
  | 'plot'
  | 'script'
  | 'storyboard';

/** 画布节点数据结构 */
export interface IVideoNode {
  /** 节点唯一标识 */
  id: string;
  /** 节点类型 */
  kind: VideoNodeKind;
  /** 标题 */
  title: string;
  /** 副标题（简短描述） */
  subtitle: string;
  /** 节点文案（故事情节正文，多行） */
  body: string;
  /** 上传的图片 DataURL（可选） */
  imageDataUrl?: string;
  /** 节点宽度（由 DEFAULT_NODE_WIDTH 统一） */
  width: number;
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
}

/** 连线关系 */
export interface IVideoEdge {
  /** 连线唯一标识 */
  id: string;
  /** 源节点 id */
  from: string;
  /** 目标节点 id */
  to: string;
}

/** 节点视觉配置（按类型分配颜色、图标） */
export interface VideoNodeStyle {
  /** 节点背景填充色 */
  fill: string;
  /** 强调色（左侧条 + 描边） */
  primary: string;
  /** 节点类型中文名 */
  label: string;
  /** lucide 图标名（用于 header 显示） */
  icon: 'Camera' | 'Clapperboard' | 'PenLine' | 'Sparkles' | 'Wand2';
}
