/**
 * settingsDialogStore — 设置弹窗(2026-08-17 改造:合并"自定义"6 类 + 全局设置)
 *
 * - 独立 store 因为 SettingsDialog 在 AppLayout 全局挂载,
 *   SessionSidebar / ToolConfirmDialog / 各种 menu item 都能触发打开
 * - 6 个"自定义"分类(智能体/技能/指令/挂钩/MCP/插件) + 全局设置合在一个弹窗
 */

import { create } from 'zustand';

export type SettingsTab =
  | 'about'
  | 'agents'
  | 'general'
  | 'hooks'
  | 'mcp'
  | 'models'
  | 'plugins'
  | 'prompts'
  | 'skills'
  | 'sources';

interface SettingsDialogState {
  close: () => void;
  open: boolean;
  /** 打开弹窗并定位到指定 tab(可选) */
  openTo: (tab?: SettingsTab) => void;
  setTab: (tab: SettingsTab) => void;
  tab: SettingsTab;
  toggle: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  close: () => set({ open: false }),
  open: false,
  openTo: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  setTab: (tab) => set({ tab }),
  tab: 'general',
  toggle: () => set((s) => ({ open: !s.open })),
}));
