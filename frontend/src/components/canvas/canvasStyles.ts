import type { VideoNodeKind, VideoNodeStyle } from '@/types/canvas';
import type { CSSProperties } from 'react';

/** 节点类型视觉映射 */
export const NODE_STYLES: Record<VideoNodeKind, VideoNodeStyle> = {
  compose: { fill: '#fce7f3', icon: 'Clapperboard', label: '合成', primary: '#ec4899' },
  generate: { fill: '#fef3c7', icon: 'Sparkles', label: '生成', primary: '#f59e0b' },
  plot: { fill: '#dcfce7', icon: 'PenLine', label: '情节', primary: '#10b981' },
  script: { fill: '#eff6ff', icon: 'PenLine', label: '脚本', primary: '#3b82f6' },
  storyboard: { fill: '#f5f3ff', icon: 'Camera', label: '分镜', primary: '#8b5cf6' },
};

/** 网格背景(20px × 20px 浅灰) */
export const GRID_BG: CSSProperties = {
  backgroundColor: '#fafafa',
  backgroundImage:
    'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)',
  backgroundSize: '20px 20px',
};