import { useSettingsStore } from '@/stores/settingsStore';
import { useCallback, useEffect } from 'react';

/** Lowpoly 主题颜色 */
export const lowpolyColors = {
  accent: '#FF6F5C',
  dark: '#0F2A3A',
  light: '#FFF7EF',
  primary: '#FF4DA6',
  secondary: '#FFC93D',
  surface: '#183A4F',
};

/** Default 主题颜色（莫兰迪） */
export const defaultColors = {
  primary: '#B5838D',
  secondary: '#A3B18A',
};

/** Pastoral 田园主题颜色 */
export const pastoralColors = {
  accent: '#C75B39',
  background: '#FAF9F6',
  earth: '#8D6E63',
  highlight: '#8BC34A',
  primary: '#558B2F',
  secondary: '#DAA520',
  surface: '#F5F5DC',
  text: '#3E2723',
};

/** Liquid Glass 主题颜色 - 毛玻璃效果 */
export const liquidGlassColors = {
  accent: '#6366F1',
  background: 'rgba(255, 255, 255, 0.15)',
  blur: '#E0E7FF',
  border: 'rgba(255, 255, 255, 0.3)',
  glow: '#818CF8',
  primary: '#4F46E5',
  secondary: '#A78BFA',
  surface: 'rgba(255, 255, 255, 0.1)',
  text: '#1E1B4B',
};

/**
 * 主题管理 Hook
 * 处理 Light/Dark/System 主题切换逻辑
 * 处理 ThemeStyle 切换逻辑
 */
export function useTheme() {
  const { theme, themeStyle } = useSettingsStore();

  const applyTheme = useCallback(() => {
    const root = window.document.documentElement;

    // 应用基础主题 (light/dark/system)
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    }

    // 应用主题风格 class（CSS 变量由 index.css 中 html.theme-xxx 规则覆盖）
    root.classList.remove('theme-default', 'theme-lowpoly', 'theme-pastoral', 'theme-liquid-glass', 'theme-vscode');
    if (themeStyle !== 'default') {
      root.classList.add(`theme-${themeStyle}`);
    }
  }, [theme, themeStyle]);

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme();

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  return { applyTheme, theme, themeStyle };
}
