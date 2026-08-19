import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 4 种交互模式 + 路由档位（统一任务入口模式） */
export type InteractionMode =
  | 'plan'
  | 'review'
  | 'auto'
  | 'full-auto'
  | 'route';

/** 每种模式的默认工具权限 */
export const MODE_TOOL_PERMISSIONS: Record<
  InteractionMode,
  Record<string, 'auto' | 'ask' | 'disabled'>
> = {
  plan: {
    ReadFile: 'auto',
    SearchFiles: 'auto',
    ListDir: 'auto',
    WriteFile: 'disabled',
    WriteFiles: 'disabled',
    ReplaceInFile: 'disabled',
    DeleteFile: 'disabled',
    RunCommand: 'disabled',
  },
  review: {
    ReadFile: 'auto',
    SearchFiles: 'auto',
    ListDir: 'auto',
    WriteFile: 'ask',
    WriteFiles: 'ask',
    ReplaceInFile: 'ask',
    DeleteFile: 'ask',
    RunCommand: 'ask',
  },
  auto: {
    ReadFile: 'auto',
    SearchFiles: 'auto',
    ListDir: 'auto',
    WriteFile: 'ask',
    WriteFiles: 'ask',
    ReplaceInFile: 'ask',
    DeleteFile: 'ask',
    RunCommand: 'ask',
  },
  'full-auto': {
    ReadFile: 'auto',
    SearchFiles: 'auto',
    ListDir: 'auto',
    WriteFile: 'auto',
    WriteFiles: 'auto',
    ReplaceInFile: 'auto',
    DeleteFile: 'ask',
    RunCommand: 'auto',
  },
  // 路由档位：与 full-auto 权限一致；区别在于自动套用 orchestrator 作为任务入口
  route: {
    ReadFile: 'auto',
    SearchFiles: 'auto',
    ListDir: 'auto',
    WriteFile: 'auto',
    WriteFiles: 'auto',
    ReplaceInFile: 'auto',
    DeleteFile: 'ask',
    RunCommand: 'auto',
  },
};

/** 模式元信息 */
export const MODE_META: Record<
  InteractionMode,
  { color: string; description: string; icon: string; label: string }
> = {
  plan: {
    label: '计划',
    description: 'AI 仅读取+分析，输出执行计划等待审批',
    icon: '📋',
    color: 'bg-amber-500',
  },
  review: {
    label: '审阅',
    description: '所有写入操作弹窗确认，逐文件审阅',
    icon: '🔍',
    color: 'bg-blue-500',
  },
  auto: {
    label: '自动',
    description: '高危操作弹确认，其余自动执行',
    icon: '⚡',
    color: 'bg-green-500',
  },
  'full-auto': {
    label: '全自动',
    description: '无需确认，AI 自主完成所有操作',
    icon: '🚀',
    color: 'bg-purple-500',
  },
  route: {
    label: '路由',
    description: '统一任务入口：自动通过 orchestrator 派遣下层 Agent',
    icon: '🧭',
    color: 'bg-indigo-500',
  },
};

interface ModeState {
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
  /** 从模式获取工具权限映射 */
  getToolPermission: (toolName: string) => 'auto' | 'ask' | 'disabled';
}

export const useModeStore = create<ModeState>()(
  persist(
    (set, get) => ({
      mode: 'auto',

      setMode: (mode) => set({ mode }),

      getToolPermission: (toolName) => {
        const { mode } = get();
        return MODE_TOOL_PERMISSIONS[mode]?.[toolName] ?? 'ask';
      },
    }),
    {
      name: 'ai-studio-mode',
    },
  ),
);
