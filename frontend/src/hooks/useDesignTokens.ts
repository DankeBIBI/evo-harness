import { useSettingsStore } from '@/stores/settingsStore';
import { useEffect } from 'react';

/**
 * 监听设置变化，更新 CSS 设计令牌变量
 * - --font-size-base: 字体大小
 * - --icon-size-base: 图标大小
 * - --font-weight-base: 字重
 * - --heading-gap: 标题副标题间距
 */
export function useDesignTokens() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const iconSize = useSettingsStore((s) => s.iconSize);
  const fontWeight = useSettingsStore((s) => s.fontWeight);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--font-size-base', String(fontSize));
    root.style.setProperty('--icon-size-base', String(iconSize));
    root.style.setProperty('--font-weight-base', String(fontWeight));
    // 标题副标题间距 = 字体大小 * 0.5
    root.style.setProperty('--heading-gap', `${fontSize * 0.12}rem`);
  }, [fontSize, iconSize, fontWeight]);
}
