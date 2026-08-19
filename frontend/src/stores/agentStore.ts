import type { Source } from '@/stores/sourceStore';
import { SOURCE_LABELS, useSourceStore } from '@/stores/sourceStore';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Create,
  Delete,
  List,
  Update,
} from '../lib/hostServices/AgentService';

export type AgentScope = 'system' | 'user' | 'project' | 'team';
export type AgentCategory =
  | 'general'
  | 'coding'
  | 'writing'
  | 'analysis'
  | 'translation'
  | 'domain'
  | 'orchestration';
export type AgentMode = 'primary' | 'subordinate' | 'tool';
export type CollaborationMode = 'sequential' | 'parallel' | 'hierarchical';

export interface ModelConfig {
  temperature: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  /** 超时时间(秒),默认 1800(30分钟),0 表示不超时 */
  timeout?: number;
}

export interface ExecutionConfig {
  timeout: number;
  retryCount: number;
  fallbackAgentId?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  scope: AgentScope;
  scopeId?: string;
  role: string;
  category: AgentCategory;
  industry?: string;
  skills: string[];
  tools: string[];
  modelId: string;
  modelConfig: ModelConfig;
  agentMode: AgentMode;
  parentId?: string;
  children?: string[];
  collaborationMode?: CollaborationMode;
  executionConfig: ExecutionConfig;
  isTemplate: boolean;
  isPublic: boolean;
  tags: string[];
  /** 数据来源(后端注入) */
  source: Source;
  /** 文件源时记录原始 .md 路径(只读) */
  filePath?: string;
  /** 项目分析来源 — 文件内容(仅本地临时编辑用) */
  content?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateAgentPayload = Omit<Agent, 'createdAt' | 'id' | 'updatedAt' | 'source'> & {
  /** 数据来源(默认 user-db;项目扫描挂载时传 project) */
  source?: Source;
};
export type UpdateAgentPayload = Partial<CreateAgentPayload>;

const createAgentModel = (agent: CreateAgentPayload) => ({
  ...agent,
  createdAt: new Date().toISOString(),
  id: '',
  source: agent.source ?? 'user-db',
  updatedAt: new Date().toISOString(),
});

/** 格式化 Agent 名称(后缀 source 标签) */
export const formatAgentName = (agent: Agent, showLabel: boolean): string =>
  showLabel && agent.source !== 'user-db' && agent.source !== 'system'
    ? `${agent.name} (${SOURCE_LABELS[agent.source]})`
    : agent.name;

/** 根据 SourceConfig 过滤显示用的 Agent 列表 */
export const filterAgentsByEnabledSources = (
  agents: Agent[],
  cfg: { project: boolean; user: boolean; claudeProject: boolean; claudeUser: boolean },
): Agent[] => {
  return agents.filter((a) => {
    if (a.source === 'system' || a.source === 'user-db') return true;
    if (a.source === 'project') return cfg.project;
    if (a.source === 'user') return cfg.user;
    if (a.source === 'claude-project') return cfg.claudeProject;
    if (a.source === 'claude-user') return cfg.claudeUser;
    return true;
  });
};

interface AgentState {
  addAgent: (agent: CreateAgentPayload) => Promise<void>;
  agents: Agent[];
  deleteAgent: (id: string) => Promise<void>;
  error: null | string;
  fetchAgents: () => Promise<void>;
  loading: boolean;
  /** 全局默认 agent(无 convId 关联时的 fallback) */
  selectAgent: (id: string | null) => void;
  selectedAgentId: string | null;
  /** 每个对话记忆的 agent ID */
  selectedAgentIdByConv: Record<string, string>;
  /** 为指定对话设置 agent(无 convId 时回退到 selectedAgentId) */
  setAgentForConv: (convId: string | null, agentId: string) => void;
  /** 获取指定对话的 agent ID */
  getAgentForConv: (convId: string | null) => string | null;
  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, agent: UpdateAgentPayload) => Promise<void>;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      error: null,
      selectedAgentId: null,
      selectedAgentIdByConv: {},
      loading: false,

  addAgent: async (agent) => {
    set({ error: null, loading: true });
    try {
      await Create(createAgentModel(agent));
      await get().fetchAgents();
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },

  deleteAgent: async (id) => {
    set({ error: null, loading: true });
    try {
      await Delete(id);
      // 清理死引用:全局默认 + per-conv 中指向已删除 agent 的项
      set((state) => {
        const cleanedByConv: Record<string, string> = {};
        for (const [convId, agentId] of Object.entries(
          state.selectedAgentIdByConv,
        )) {
          if (agentId !== id) cleanedByConv[convId] = agentId;
        }
        return {
          selectedAgentIdByConv: cleanedByConv,
          selectedAgentId:
            state.selectedAgentId === id ? null : state.selectedAgentId,
        };
      });
      await get().fetchAgents();
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },

  fetchAgents: async () => {
    set({ error: null, loading: true });
    try {
      const result = await List();
      const raw = (result || []) as unknown as Array<Agent & { source?: string; filePath?: string }>;
      const mapped: Agent[] = raw.map((a) => ({
        ...a,
        source: (a.source as Source) || 'user-db',
      }));
      set((state) => ({
        agents: mapped,
        loading: false,
        selectedAgentId:
          state.selectedAgentId &&
            mapped.some((agent) => agent.id === state.selectedAgentId)
            ? state.selectedAgentId
            : mapped[0]?.id || null,
      }));
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  setAgents: (agents) =>
    set((state) => ({
      agents,
      loading: false,
      selectedAgentId:
        state.selectedAgentId &&
          agents.some((agent) => agent.id === state.selectedAgentId)
          ? state.selectedAgentId
          : agents[0]?.id || null,
    })),

  updateAgent: async (id, updates) => {
    const currentAgent = get().agents.find((agent) => agent.id === id);

    if (!currentAgent) {
      const error = new Error('Agent 不存在');
      set({ error: error.message });
      throw error;
    }
    if (currentAgent.source !== 'user-db' && currentAgent.source !== 'system') {
      const error = new Error(`Agent "${currentAgent.name}" 来自 ${currentAgent.source} 源,不可编辑`);
      set({ error: error.message });
      throw error;
    }

    set({ error: null, loading: true });
    try {
      await Update(id, {
        ...currentAgent,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      await get().fetchAgents();
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  setAgentForConv: (convId, agentId) => {
    if (!convId) {
      // 无 convId:作为全局默认
      set({ selectedAgentId: agentId });
      return;
    }
    set((state) => ({
      selectedAgentIdByConv: {
        ...state.selectedAgentIdByConv,
        [convId]: agentId,
      },
    }));
  },

  getAgentForConv: (convId) => {
    if (!convId) return get().selectedAgentId;
    return get().selectedAgentIdByConv[convId] ?? get().selectedAgentId;
  },
    }),
    {
      name: 'ai-studio-agent-selection',
      // v2: 新增 selectedAgentIdByConv(每对话记忆)
      version: 2,
      migrate: (state: unknown, _fromVersion: number) => {
        if (!state || typeof state !== 'object') return state;
        const s = state as Record<string, unknown>;
        if (!s.selectedAgentIdByConv) {
          s.selectedAgentIdByConv = {};
        }
        return s;
      },
      // 只持久化 selectedAgentId + selectedAgentIdByConv,避免把 agent 列表也写 localStorage
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        selectedAgentIdByConv: state.selectedAgentIdByConv,
      }),
    },
  ),
);

/** selector hook: 启用的 agents */
export const useEnabledAgents = (): Agent[] => {
  const agents = useAgentStore((s) => s.agents);
  const cfg = useSourceStore((s) => s.config);
  return filterAgentsByEnabledSources(agents, cfg);
};
