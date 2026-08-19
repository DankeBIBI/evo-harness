import type { Source } from '@/stores/sourceStore';
import { SOURCE_LABELS, useSourceStore } from '@/stores/sourceStore';
import { persist } from 'zustand/middleware';
import {
  Create,
  Delete,
  List,
  Update,
} from '@/lib/hostServices/SkillService';
import { create } from 'zustand';

export type SkillScope = 'system' | 'user' | 'project' | 'team';
export type SkillType = 'tool' | 'retrieval' | 'generation' | 'mcp' | 'prompt';

export interface Skill {
  id: string;
  name: string;
  description?: string;
  type: SkillType;
  scope: SkillScope;
  scopeId?: string;
  schema?: Record<string, unknown>;
  code?: string;
  mcpServerId?: string;
  mcpToolName?: string;
  config: Record<string, unknown>;
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

export type CreateSkillPayload = Omit<Skill, 'createdAt' | 'id' | 'updatedAt' | 'source'> & {
  /** 数据来源(默认 user-db;项目扫描挂载时传 project) */
  source?: Source;
};
export type UpdateSkillPayload = Partial<CreateSkillPayload>;

const createSkillModel = (skill: CreateSkillPayload) => ({
  ...skill,
  config: skill.config || {},
  createdAt: new Date().toISOString(),
  id: '',
  schema: skill.schema || {},
  source: skill.source ?? 'user-db',
  type: skill.type || 'tool',
  updatedAt: new Date().toISOString(),
});

/** 格式化 Skill 名称(后缀 source 标签) */
export const formatSkillName = (skill: Skill, showLabel: boolean): string =>
  showLabel && skill.source !== 'user-db' && skill.source !== 'system'
    ? `${skill.name} (${SOURCE_LABELS[skill.source]})`
    : skill.name;

interface SkillState {
  addSkill: (skill: CreateSkillPayload) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  error: null | string;
  fetchSkills: () => Promise<void>;
  loading: boolean;
  /** 切换 skill 选中状态(多选) */
  toggleSkill: (id: string) => void;
  /** 设置选中的 skill ID 列表(整体替换) */
  setSelectedSkillIds: (ids: string[]) => void;
  /** 选中的 skill ID 列表(已持久化到 localStorage) */
  selectedSkillIds: string[];
  setSkills: (skills: Skill[]) => void;
  skills: Skill[];
  updateSkill: (id: string, skill: UpdateSkillPayload) => Promise<void>;
}

/** 根据 SourceConfig 过滤显示用的 Skill 列表 */
export const filterByEnabledSources = (
  skills: Skill[],
  cfg: { project: boolean; user: boolean; claudeProject: boolean; claudeUser: boolean },
): Skill[] => {
  return skills.filter((s) => {
    if (s.source === 'system' || s.source === 'user-db') return true;
    if (s.source === 'project') return cfg.project;
    if (s.source === 'user') return cfg.user;
    if (s.source === 'claude-project') return cfg.claudeProject;
    if (s.source === 'claude-user') return cfg.claudeUser;
    return true;
  });
};

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: [],
      error: null,
      selectedSkillIds: [],
      loading: false,

  addSkill: async (skill) => {
    set({ error: null, loading: true });
    try {
      await Create(createSkillModel(skill));
      await get().fetchSkills();
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },

  deleteSkill: async (id) => {
    set({ error: null, loading: true });
    try {
      await Delete(id);
      await get().fetchSkills();
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },

  fetchSkills: async () => {
    set({ error: null, loading: true });
    try {
      const result = await List();
      const mapped: Skill[] = (result || []).map((s) => ({
        id: String(s.id ?? ''),
        name: String(s.name ?? ''),
        description: s.description ? String(s.description) : undefined,
        type: ((s.type as SkillType) || 'tool') as SkillType,
        scope: 'user' as SkillScope,
        schema: s.schema as unknown as Record<string, unknown> | undefined,
        code: s.code ? String(s.code) : undefined,
        mcpServerId: s.mcpServerId ? String(s.mcpServerId) : undefined,
        mcpToolName: s.mcpToolName ? String(s.mcpToolName) : undefined,
        config: (s.config as Record<string, unknown>) || {},
        isTemplate: s.isTemplate === true,
        isPublic: false,
        tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
        source: ((s as unknown as { source?: string }).source as Source) || 'user-db',
        filePath: (s as unknown as { filePath?: string }).filePath,
        createdAt: String(s.createdAt ?? ''),
        updatedAt: String(s.updatedAt ?? ''),
      }));
      set((state) => ({
        skills: mapped,
        loading: false,
        selectedSkillIds: state.selectedSkillIds.filter((id) =>
          mapped.some((skill) => skill.id === id),
        ),
      }));
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  setSkills: (skills) =>
    set((state) => ({
      skills,
      loading: false,
      selectedSkillIds: state.selectedSkillIds.filter((id) =>
        skills.some((s) => s.id === id),
      ),
    })),

  updateSkill: async (id, updates) => {
    const current = get().skills.find((s) => s.id === id);
    if (!current) {
      const error = new Error('Skill 不存在');
      set({ error: error.message });
      throw error;
    }
    if (current.source !== 'user-db') {
      const error = new Error(`Skill "${current.name}" 来自 ${current.source} 源,不可编辑`);
      set({ error: error.message });
      throw error;
    }

    set({ error: null, loading: true });
    try {
      await Update(id, createSkillModel({
        name: current.name,
        description: current.description,
        type: current.type,
        scope: current.scope,
        config: current.config,
        isTemplate: current.isTemplate,
        isPublic: current.isPublic,
        tags: current.tags,
        ...updates,
      }));
      await get().fetchSkills();
    } catch (error) {
      set({ error: String(error), loading: false });
      throw error;
    }
  },

  toggleSkill: (id) =>
    set((state) => {
      const idx = state.selectedSkillIds.indexOf(id);
      if (idx >= 0) {
        return { selectedSkillIds: state.selectedSkillIds.filter((x) => x !== id) };
      }
      return { selectedSkillIds: [...state.selectedSkillIds, id] };
    }),
  setSelectedSkillIds: (ids) => set({ selectedSkillIds: ids }),
    }),
    {
      name: 'ai-studio-skill-selection',
      // v1: 持久化 selectedSkillIds(用户多选的 skill ID 列表)
      version: 1,
      migrate: (state: unknown, _fromVersion: number) => {
        if (!state || typeof state !== 'object') return state;
        const s = state as Record<string, unknown>;
        // 兼容 v0:旧版 selectedSkillId(单数) → 转 selectedSkillIds
        if (!Array.isArray(s.selectedSkillIds) && typeof s.selectedSkillId === 'string') {
          s.selectedSkillIds = [s.selectedSkillId];
          delete s.selectedSkillId;
        }
        return s;
      },
    },
  ),
);

/** selector hook: 启用的 skills(按 sourceStore.config 过滤) */
export const useEnabledSkills = (): Skill[] => {
  const skills = useSkillStore((s) => s.skills);
  const cfg = useSourceStore((s) => s.config);
  return filterByEnabledSources(skills, cfg);
};
