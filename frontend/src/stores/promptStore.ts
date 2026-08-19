import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PromptScope = 'global' | 'project' | 'file';

export interface Prompt {
  id: string;
  name: string;
  content: string;
  scope: PromptScope;
  /** 项目路径匹配（用于 project scope） */
  projectPath?: string;
  /** 文件路径匹配（支持 glob 模式，用于 file scope） */
  filePattern?: string;
  /** 排序权重，数字越大越靠前 */
  order?: number;
  /** 是否启用 */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PromptStore {
  prompts: Prompt[];
  /** 添加提示词 */
  addPrompt: (prompt: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>) => void;
  /** 更新提示词 */
  updatePrompt: (id: string, updates: Partial<Prompt>) => void;
  /** 删除提示词 */
  deletePrompt: (id: string) => void;
  /** 切换提示词启用状态 */
  togglePrompt: (id: string) => void;
  /** 根据当前上下文获取匹配的提示词 */
  getMatchedPrompts: (projectPath?: string, filePath?: string) => Prompt[];
}

const STORAGE_KEY = 'evo-harness:prompts';

/** 根据 glob 模式匹配文件路径 */
function matchGlob(filePath: string, pattern: string): boolean {
  // 简单的 glob 匹配，支持 * 和 **
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{{DOUBLE_STAR}}}')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/\{\{\{DOUBLE_STAR\}\}\}/g, '.*')
    .replace(/\?/g, '.');

  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filePath);
  } catch {
    return false;
  }
}

export const usePromptStore = create<PromptStore>()(
  persist(
    (set, get) => ({
      prompts: [],

      addPrompt: (prompt) => {
        const now = new Date().toISOString();
        const newPrompt: Prompt = {
          ...prompt,
          id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ prompts: [...state.prompts, newPrompt] }));
      },

      updatePrompt: (id, updates) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: new Date().toISOString() }
              : p,
          ),
        }));
      },

      deletePrompt: (id) => {
        set((state) => ({
          prompts: state.prompts.filter((p) => p.id !== id),
        }));
      },

      togglePrompt: (id) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id
              ? { ...p, enabled: !p.enabled, updatedAt: new Date().toISOString() }
              : p,
          ),
        }));
      },

      getMatchedPrompts: (projectPath?: string, filePath?: string) => {
        const { prompts } = get();
        const matched: Prompt[] = [];

        for (const prompt of prompts) {
          if (!prompt.enabled) continue;

          switch (prompt.scope) {
            case 'global':
              matched.push(prompt);
              break;

            case 'project':
              if (projectPath && prompt.projectPath) {
                // 确保匹配的是目录边界，而不是字符串前缀
                // 例如 "C:\project" 应该匹配 "C:\project" 和 "C:\project\sub"
                // 但 "C:\projects" 不应该匹配 "C:\project"
                const normalizedProject = prompt.projectPath.replace(/[\\/]+$/, ''); // 移除末尾斜杠
                const normalizedPath = projectPath.replace(/[\\/]+$/, '');
                if (
                  normalizedPath === normalizedProject ||
                  normalizedPath.startsWith(normalizedProject + '\\') ||
                  normalizedPath.startsWith(normalizedProject + '/')
                ) {
                  matched.push(prompt);
                }
              }
              break;

            case 'file':
              if (
                filePath &&
                prompt.filePattern &&
                matchGlob(filePath, prompt.filePattern)
              ) {
                matched.push(prompt);
              }
              break;
          }
        }

        // 按 order 排序
        return matched.sort((a, b) => (b.order || 0) - (a.order || 0));
      },
    }),
    {
      name: STORAGE_KEY,
    },
  ),
);
