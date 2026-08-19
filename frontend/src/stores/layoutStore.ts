import { create } from 'zustand';

/**
 * UI 布局状态管理
 *
 * 职责: 集中管理 IDE 风格聊天界面的 3 栏可见性 + 弹窗状态 + 告警列表
 *
 * 状态:
 *   - leftSidebarVisible / rightSidebarVisible: 左/右栏显隐
 *   - bottomBarExpanded: 底栏折叠区是否展开(已无使用方,保留兼容)
 *   - alerts: 全局告警列表（按严重级别分类）
 *   - 弹窗状态已迁移到独立 store(2026-08-17):
 *     - useSettingsDialogStore: 设置弹窗(单弹窗单 store)
 *
 * 设计原则（Less UI §二 精密控制档）:
 *   - 单一焦点: 任一时刻只有一个弹窗/展开区
 *   - 90% 静 10% 动: 状态变化用 Corporate 动效 (200-400ms, cubic-bezier(0.2,0,0,1))
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'success';

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  title: string;
  description?: string;
  /** 主操作按钮文案（如"管理预算"） */
  actionLabel?: string;
  /** 主操作回调（不传则不显示按钮） */
  onAction?: () => void;
  /** 严重告警不可关闭（warning/error 默认 true） */
  required?: boolean;
  /** 创建时间（用于排序） */
  createdAt: number;
}

export type AgentCategory =
  | 'cli'
  | 'agents'
  | 'skills'
  | 'prompts'
  | 'hooks'
  | 'mcp'
  | 'plugins';

interface LayoutState {
  // ── 侧栏显隐 ──
  /** 左栏三态:false=完全隐藏 / true=可见(由 leftCollapsed 决定是图标条还是完整展开) */
  leftSidebarVisible: boolean;
  /**
   * 左栏折叠态(仅在 leftSidebarVisible=true 时生效):
   * - false: 完整展开(默认宽度 leftWidth)
   * - true:  图标条(~48px,只显示关键入口图标)
   * 设计:VS Code Activity Bar 风格 — 收起时不消失,保留图标快捷入口
   */
  leftCollapsed: boolean;
  rightSidebarVisible: boolean;
  /**
   * 右栏折叠态(2026-08-18,与 leftCollapsed 对称):
   * - false: 完整展开(默认宽度 rightWidth)
   * - true:  图标条(~48px,只显示变更/文件 等关键入口 + 角标)
   */
  rightCollapsed: boolean;
  /** 左栏宽度(px), 受 ResizeHandle 拖动修改, 低于阈值时自动 setLeftSidebarVisible(false) */
  leftWidth: number;
  /** 右栏宽度(px) */
  rightWidth: number;

  /**
   * 统一日志弹窗显隐(2026-08-18 提升到 store)
   * 原由 ChatWindow 内部 useState 管理; 现在提到 layoutStore 以便 CustomTitleBar 顶栏按钮共享
   */
  unifiedLogOpen: boolean;

  // ── 告警系统 ──
  alerts: AlertItem[];

  // ── Actions ──
  toggleLeftSidebar: () => void;
  toggleLeftCollapsed: () => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  toggleRightSidebar: () => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleRightCollapsed: () => void;
  setRightSidebarVisible: (visible: boolean) => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  resetLeftWidth: () => void;
  resetRightWidth: () => void;

  openUnifiedLog: () => void;
  closeUnifiedLog: () => void;
  toggleUnifiedLog: () => void;

  pushAlert: (alert: Omit<AlertItem, 'id' | 'createdAt'>) => string;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
}


export const useLayoutStore = create<LayoutState>((set) => ({
  leftSidebarVisible: true,
  leftCollapsed: false, // 默认完整展开(保持原行为)
  rightSidebarVisible: true,
  rightCollapsed: false, // (2026-08-18) 默认完整展开
  leftWidth: 224, // 14rem, 与 w-56 SessionSidebar 默认值一致
  rightWidth: 320, // 20rem, 与 w-80 FileTreeSidebar 默认值一致
  unifiedLogOpen: false, // (2026-08-18) 顶栏按钮与 ChatWindow 共享
  alerts: [],

  setRightSidebarVisible: (visible) => set({ rightSidebarVisible: visible }),
  // (2026-08-18) 图标条折叠:独立于 visible 状态,只切换 collapsed
  toggleLeftCollapsed: () =>
    set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  setLeftCollapsed: (collapsed) => set({ leftCollapsed: collapsed }),
  // (2026-08-18) 右栏图标条折叠 — 与左栏对称
  toggleRightCollapsed: () =>
    set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setRightCollapsed: (collapsed) => set({ rightCollapsed: collapsed }),
  // (2026-08-18) 统一日志弹窗 — 提到 store 以便 CustomTitleBar 顶栏按钮共享
  openUnifiedLog: () => set({ unifiedLogOpen: true }),
  closeUnifiedLog: () => set({ unifiedLogOpen: false }),
  toggleUnifiedLog: () =>
    set((s) => ({ unifiedLogOpen: !s.unifiedLogOpen })),
  // P1-2 (2026-07-06): 可拖动侧栏 — 拖到极窄(< 60px) 自动收起
  // Bug 修复 (2026-07-06): 极窄时不保存 width, 只设 visible=false;
  //                       展开时(toggle)如果 width<60 则重置为默认值
  //                       否则用户点 "展开左栏" 后还是 50px, 看着像没展开, 且 handle 极窄点不到
  setLeftWidth: (width) => {
    const clamped = Math.max(0, Math.min(480, width));
    if (clamped < 60) {
      // 极窄: 只收起, 不动 leftWidth(保留用户上次有效宽度)
      set({ leftSidebarVisible: false });
    } else {
      set({ leftSidebarVisible: true, leftWidth: clamped });
    }
  },
  setRightWidth: (width) => {
    const clamped = Math.max(0, Math.min(480, width));
    if (clamped < 60) {
      set({ rightSidebarVisible: false });
    } else {
      set({ rightSidebarVisible: true, rightWidth: clamped });
    }
  },
  resetLeftWidth: () => set({ leftWidth: 224, leftSidebarVisible: true }),
  resetRightWidth: () => set({ rightWidth: 320, rightSidebarVisible: true }),
  // Bug 修复 (2026-07-06): 展开时如果 width 被极窄污染(< 60), 重置为默认值
  // 避免用户点 "展开" 后看到一根极窄到几乎不可见的栏, 还以为没展开
  toggleLeftSidebar: () =>
    set((s) => {
      const willOpen = !s.leftSidebarVisible;
      return {
        leftSidebarVisible: willOpen,
        leftWidth: willOpen && s.leftWidth < 60 ? 224 : s.leftWidth,
      };
    }),
  toggleRightSidebar: () =>
    set((s) => {
      const willOpen = !s.rightSidebarVisible;
      return {
        rightSidebarVisible: willOpen,
        rightWidth: willOpen && s.rightWidth < 60 ? 320 : s.rightWidth,
      };
    }),
  pushAlert: (alert) => {
    const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({
      alerts: [...s.alerts, { ...alert, id, createdAt: Date.now() }],
    }));
    return id;
  },
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAlerts: () => set({ alerts: [] }),
}));
