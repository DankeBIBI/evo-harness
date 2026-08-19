import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind CSS 类名
 * @param inputs 类名数组
 * @returns 合并后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化日期时间
 * @param date 日期对象或字符串
 * @returns 格式化后的字符串
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 生成唯一 ID
 * @returns UUID 字符串
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 延迟函数
 * @param ms 延迟毫秒数
 * @returns Promise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 截断文本
 * @param text 原始文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * 获取 CSS 变量值
 * @param name CSS 变量名（不带 -- 前缀）
 * @returns CSS 变量值（字符串）
 */
export function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/**
 * 获取设计令牌值
 * @returns 包含设计令牌值的对象
 */
export function getDesignTokens(): {
  fontSize: number;
  iconSize: number;
  fontWeight: number;
} {
  return {
    fontSize: Number(getCSSVariable('font-size-base')) || 14,
    iconSize: Number(getCSSVariable('icon-size-base')) || 18,
    fontWeight: Number(getCSSVariable('font-weight-base')) || 500,
  };
}

/**
 * 图标大小计算函数
 * @param scale 缩放比例（默认 1）
 * @returns 图标大小（数字）
 */
export function iconSize(scale: number = 1): number {
  const tokens = getDesignTokens();
  return Math.round(tokens.iconSize * scale);
}

/**
 * 字体大小计算函数
 * @param scale 缩放比例（默认 1）
 * @returns 字体大小（数字）
 */
export function fontSize(scale: number = 1): number {
  const tokens = getDesignTokens();
  return Math.round(tokens.fontSize * scale);
}

/**
 * 生成图标样式对象（用于 inline styles）
 * @param scale 缩放比例
 * @returns 包含 width 和 height 的对象
 */
export function iconStyle(scale: number = 1): { width: number; height: number } {
  const size = Math.round(iconSize() * scale);
  return { width: size, height: size };
}
