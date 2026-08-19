import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { readFileText, writeFileText } from '@/lib/fs/file-ops';
import { useModelStore } from './modelStore';
import { useAgentStore } from './agentStore';
import { useSkillStore } from './skillStore';

// 目录条目
export interface DirectoryEntry {
  name: string;
  path: string;
  isDir: boolean;
  hasClair: boolean;
  /** 字节数(目录为 0) */
  size: number;
  /** 最后修改时间(ms,可选) */
  modifiedAt?: number;
}

// Skill 信息
export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  rules: string[];
  content: string;
}

// Agent 信息
export interface AgentInfo {
  name: string;
  description: string;
  path: string;
  subAgents: string[];
  content: string;
}

// Rule 信息
export interface RuleInfo {
  name: string;
  description: string;
  path: string;
  content: string;
}

// 项目分析结果
export interface ProjectAnalysis {
  basePath: string;
  availableFolders: string[];
  skills: SkillInfo[];
  agents: AgentInfo[];
  rules: RuleInfo[];
}

// 分析预设配置
export interface AnalysisProfile {
  id: string;
  name: string;
  basePath: string;
  folders: string[];
}

// 分析状态
interface AnalysisState {
  currentPath: string | null;
  analysis: ProjectAnalysis | null;
  loading: boolean;
  error: string | null;
  profiles: AnalysisProfile[];
  activeProfileId: string | null;
  directories: DirectoryEntry[];

  setCurrentPath: (path: string | null) => void;
  setAnalysis: (analysis: ProjectAnalysis | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setDirectories: (dirs: DirectoryEntry[]) => void;
  mountToAgentStore: (source?: 'project' | 'claude-project' | 'claude-user' | 'user') => Promise<void>;
  mountToSkillStore: (source?: 'project' | 'claude-project' | 'claude-user' | 'user') => Promise<void>;
  readFileContent: (filePath: string) => Promise<string>;
  writeFileContent: (filePath: string, content: string) => Promise<void>;
  /** 当前激活的目录 handle(File System Access API,内存持有不持久化) */
  rootHandle: FileSystemDirectoryHandle | null;
  setRootHandle: (handle: FileSystemDirectoryHandle | null) => void;
  addProfile: (profile: AnalysisProfile) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
  updateProfile: (id: string, profile: Partial<AnalysisProfile>) => void;
  reset: () => void;
}

const initialState: Pick<
  AnalysisState,
  | 'activeProfileId'
  | 'analysis'
  | 'currentPath'
  | 'directories'
  | 'error'
  | 'loading'
  | 'profiles'
  | 'rootHandle'
> = {
  currentPath: null,
  analysis: null,
  loading: false,
  error: null,
  profiles: [],
  activeProfileId: null,
  directories: [],
  rootHandle: null,
};

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentPath: (path) => set({ currentPath: path }),
      setAnalysis: (analysis) => set({ analysis }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setDirectories: (directories) => set({ directories }),
      setRootHandle: (rootHandle) => set({ rootHandle }),

      mountToAgentStore: async (source = 'project') => {
        const { analysis } = useAnalysisStore.getState();
        if (!analysis) return;

        const agentStore = useAgentStore.getState();
        const existingAgents = agentStore.agents;

        // 将分析结果中的 agents 添加到 agentStore
        for (const agentInfo of analysis.agents) {
          // 检查是否已存在(同来源同名跳过)
          const exists = existingAgents.some(
            (a) => a.name === agentInfo.name && a.source === source,
          );
          if (exists) continue;

          try {
            await agentStore.addAgent({
              name: agentInfo.name,
              description: agentInfo.description || '',
              scope: 'project',
              scopeId: analysis.basePath,
              role: 'agent',
              category: 'general',
              skills: agentInfo.subAgents || [],
              tools: [],
              // 跟随用户当前选中的模型;空串时由 ChatService.resolveModel 回退到第一个可用模型
              modelId: useModelStore.getState().selectedModelId ?? '',
              modelConfig: { temperature: 0.7 },
              agentMode: 'primary',
              executionConfig: { timeout: 30000, retryCount: 3 },
              isTemplate: false,
              isPublic: false,
              tags: [],
              // 数据来源:按挂载时传入的 source(claude-user / project 等)
              source,
              // 保存文件路径和内容以便编辑
              filePath: agentInfo.path,
              content: agentInfo.content || '',
            });
          } catch (error) {
            console.error(`Failed to add agent ${agentInfo.name}:`, error);
          }
        }

        // 刷新 agents 列表
        await agentStore.fetchAgents();
      },

      mountToSkillStore: async (source = 'project') => {
        const { analysis } = useAnalysisStore.getState();
        if (!analysis) return;

        const skillStore = useSkillStore.getState();
        const existingSkills = skillStore.skills;

        for (const skillInfo of analysis.skills) {
          const exists = existingSkills.some(
            (s) => s.name === skillInfo.name && s.source === source,
          );
          if (exists) continue;

          try {
            await skillStore.addSkill({
              name: skillInfo.name,
              description: skillInfo.description || '',
              type: 'prompt',
              scope: 'project',
              scopeId: analysis.basePath,
              config: {},
              isTemplate: false,
              isPublic: false,
              tags: [],
              // 数据来源:按挂载时传入的 source
              source,
              filePath: skillInfo.path,
              content: skillInfo.content || '',
            });
          } catch (error) {
            console.error(`Failed to add skill ${skillInfo.name}:`, error);
          }
        }

        await skillStore.fetchSkills();
      },

      readFileContent: async (filePath: string) => {
        const { rootHandle } = useAnalysisStore.getState();
        if (!rootHandle) {
          // 回退:聊天页 ProjectSelector 授权的持久化项目目录(统一 handle,刷新后也可用)
          const { readFileContent: readProjectFile } = await import(
            '@/lib/fs/project-file-service'
          );
          return readProjectFile(filePath);
        }
        try {
          return await readFileText(rootHandle, filePath);
        } catch (error) {
          console.error(`Failed to read file ${filePath}:`, error);
          throw error;
        }
      },

      writeFileContent: async (filePath: string, content: string) => {
        const { rootHandle } = useAnalysisStore.getState();
        if (!rootHandle) {
          // 回退:聊天页 ProjectSelector 授权的持久化项目目录
          const { writeFileContent: writeProjectFile } = await import(
            '@/lib/fs/project-file-service'
          );
          return writeProjectFile(filePath, content);
        }
        try {
          await writeFileText(rootHandle, filePath, content);
        } catch (error) {
          // 只读 handle 写失败(NotAllowedError)→ 回退到持久化项目 handle(可能有读写授权)
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            const { writeFileContent: writeProjectFile } = await import(
              '@/lib/fs/project-file-service'
            );
            return writeProjectFile(filePath, content);
          }
          console.error(`Failed to write file ${filePath}:`, error);
          throw error;
        }
      },

      addProfile: (profile) =>
        set((state) => ({
          profiles: [...state.profiles, profile],
        })),

      removeProfile: (id) =>
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
          activeProfileId:
            state.activeProfileId === id ? null : state.activeProfileId,
        })),

      setActiveProfile: (id) => set({ activeProfileId: id }),

      updateProfile: (id, updates) =>
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        })),

      reset: () => set(initialState),
    }),
    {
      name: 'ai-studio-analysis',
      partialize: (state) => ({
        currentPath: state.currentPath,
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
      }),
    },
  ),
);
