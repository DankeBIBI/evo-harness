import {
  GetSourceConfig,
  UpdateSourceConfig,
} from '@/lib/hostServices/SettingsService';
import { create } from 'zustand';

/** Agent / Skill 来源 */
export type Source =
  | 'system'
  | 'user-db'
  | 'project'
  | 'user'
  | 'claude-project'
  | 'claude-user';

export const ALL_SOURCES: Source[] = [
  'system',
  'user-db',
  'project',
  'user',
  'claude-project',
  'claude-user',
];

/** 面向前端展示的来源标签 */
export const SOURCE_LABELS: Record<Source, string> = {
  'system': 'sys',
  'user-db': 'user',
  'project': 'project',
  'user': 'user',
  'claude-project': 'claude',
  'claude-user': 'claude',
};

/** 是否属于 claude 命名空间(用于菜单分组) */
export const isClaudeSource = (s: Source): boolean =>
  s === 'claude-project' || s === 'claude-user';

/** 是否文件源(不可写) */
export const isFileSource = (s: Source): boolean =>
  s === 'project' || s === 'user' || s === 'claude-project' || s === 'claude-user';

export interface SourceConfig {
  project: boolean;
  user: boolean;
  claudeProject: boolean;
  claudeUser: boolean;
  showSourceLabel: boolean;
  projectPath: string;
}

const DEFAULT_CONFIG: SourceConfig = {
  project: true,
  user: true,
  claudeProject: false,
  claudeUser: false,
  showSourceLabel: true,
  projectPath: '',
};

interface SourceState {
  config: SourceConfig;
  error: null | string;
  fetchConfig: () => Promise<void>;
  loading: boolean;
  setProjectPath: (path: string) => Promise<void>;
  setShowSourceLabel: (show: boolean) => Promise<void>;
  toggleSource: (source: Exclude<Source, 'system' | 'user-db'>) => Promise<void>;
  updateConfig: (cfg: SourceConfig) => Promise<void>;
}

export const useSourceStore = create<SourceState>((set, get) => ({
  config: DEFAULT_CONFIG,
  error: null,
  loading: false,

  fetchConfig: async () => {
    set({ error: null, loading: true });
    try {
      const result = (await GetSourceConfig()) as Record<string, unknown>;
      const cfg: SourceConfig = {
        project: typeof result?.project === 'boolean' ? result.project : DEFAULT_CONFIG.project,
        user: typeof result?.user === 'boolean' ? result.user : DEFAULT_CONFIG.user,
        claudeProject:
          typeof result?.claudeProject === 'boolean' ? result.claudeProject : DEFAULT_CONFIG.claudeProject,
        claudeUser:
          typeof result?.claudeUser === 'boolean' ? result.claudeUser : DEFAULT_CONFIG.claudeUser,
        showSourceLabel:
          typeof result?.showSourceLabel === 'boolean'
            ? result.showSourceLabel
            : DEFAULT_CONFIG.showSourceLabel,
        projectPath:
          typeof result?.projectPath === 'string' ? result.projectPath : DEFAULT_CONFIG.projectPath,
      };
      set({ config: cfg, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  toggleSource: async (source) => {
    const current = get().config;
    const next: SourceConfig = { ...current };
    if (source === 'project') next.project = !current.project;
    else if (source === 'user') next.user = !current.user;
    else if (source === 'claude-project') next.claudeProject = !current.claudeProject;
    else if (source === 'claude-user') next.claudeUser = !current.claudeUser;
    await get().updateConfig(next);
  },

  setProjectPath: async (path) => {
    await get().updateConfig({ ...get().config, projectPath: path });
  },

  setShowSourceLabel: async (show) => {
    await get().updateConfig({ ...get().config, showSourceLabel: show });
  },

  updateConfig: async (cfg) => {
    set({ error: null, loading: true });
    try {
      await UpdateSourceConfig(cfg);
      set({ config: cfg, loading: false });
      // 配置变更后通知外部 store 重拉(避免外部循环依赖,直接 dispatch CustomEvent)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('source-config-changed'));
      }
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },
}));
