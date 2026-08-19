import { create } from 'zustand';

/** 工具权限模式 */
export type ToolPermissionMode = 'auto' | 'ask' | 'disabled';

/** 默认权限：文件读取工具自动，文件写入询问 */
const DEFAULT_PERMISSIONS: Record<string, ToolPermissionMode> = {
  ReadFile: 'auto',
  SearchFiles: 'auto',
  ListDir: 'auto',
  WriteFile: 'ask',
  WriteFiles: 'ask',
  ReplaceInFile: 'ask',
  DeleteFile: 'ask',
  RunCommand: 'ask',
};

interface ToolPermissionState {
  /** 工具名 -> 权限模式 */
  permissions: Record<string, ToolPermissionMode>;
  /** 设置单个工具权限 */
  setPermission: (toolName: string, mode: ToolPermissionMode) => void;
  /** 批量设置 */
  setPermissions: (map: Record<string, ToolPermissionMode>) => void;
  /** 获取工具的权限模式 */
  getPermission: (toolName: string) => ToolPermissionMode;
  /** 重置为默认 */
  resetToDefaults: () => void;
}

export const useToolPermissionStore = create<ToolPermissionState>((set, get) => ({
  permissions: { ...DEFAULT_PERMISSIONS },

  setPermission: (toolName, mode) => {
    set((state) => ({
      permissions: { ...state.permissions, [toolName]: mode },
    }));
  },

  setPermissions: (map) => {
    set((state) => ({
      permissions: { ...state.permissions, ...map },
    }));
  },

  getPermission: (toolName) => {
    return get().permissions[toolName] || 'auto';
  },

  resetToDefaults: () => {
    set({ permissions: { ...DEFAULT_PERMISSIONS } });
  },
}));
