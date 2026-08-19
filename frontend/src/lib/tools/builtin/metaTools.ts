/**
 * 元工具(发现类):让 AI 在对话中能查询"自己有哪些工具可用"以及"具体参数定义"
 *
 * 设计动机:
 *   - 现有 tools/registry.ts 已经把工具注册在 toolRegistry Map 里
 *   - 但 LLM 看不到 registry(它只能从 system prompt 或工具调用结果里看到工具)
 *   - 把工具清单的查询能力也变成"可调用的工具",LLM 就能按需查(节省 prompt token)
 *
 * 用法(LLM 视角):
 *   1. 调用 list_tools(category="file") → 返回所有文件类工具的 name/description/params
 *   2. 调用 get_tool_def(name="ReplaceInFile") → 返回单个工具完整定义
 *
 * 边界:
 *   - list_tools 返回时不包含自身 + get_tool_def(避免 AI 无限递归)
 *   - 默认权限 'auto'(只读,不修改任何状态)
 *   - 返回字符串(与其他 tool.execute 保持一致),便于 LLM 直接消费
 */

import { devLog } from '@/lib/devLog';

import type { ParamSchema, Tool, ToolCategory } from '../base';

const LOG = 'chat:metaTool';

/** 单条工具摘要(Omit Tool.execute,避免 LLM 拿到可执行引用) */
export type ToolSummary = Omit<Tool, 'execute'>;

/**
 * 获取 registry 访问器(延迟加载,避免 metaTools 与 registry 互相 import 形成循环)
 *
 * 不能用顶层 import,因为 registry.ts 会 import 所有 builtin 工具,
 * 而本文件又是被 builtin/index.ts 导出 → 形成循环。
 */
async function getRegistry() {
  const mod = await import('../registry');
  return {
    getCanonicalNames: (): string[] =>
      [...mod.toolRegistry.keys()].sort((a, b) => a.localeCompare(b)),
    getRegisteredTools: mod.getRegisteredTools,
    resolveCanonicalName: (name: string): string => {
      // 兼容三种写法:PascalCase('ReadFile') / snake_case('read_file') / 已是 canonical
      const pascal = mod.toPascalCase(name);
      return mod.toolNameAliases[pascal] || mod.toolNameAliases[name] || name;
    },
  };
}

/** dev 模式日志包装(与其他 builtin 一致) */
async function withLog<T>(name: string, params: unknown, fn: () => Promise<T>): Promise<T> {
  devLog.i(LOG, `${name} start`, { params });
  const start = Date.now();
  try {
    const result = await fn();
    devLog.i(LOG, `${name} done`, { durationMs: Date.now() - start });
    return result;
  } catch (error) {
    devLog.e(LOG, `${name} failed`, { durationMs: Date.now() - start, error: String(error) });
    throw error;
  }
}

/**
 * list_tools — 列出当前可调用的工具
 *
 * 排除自身 + get_tool_def(避免 LLM 调完 list 后再调 get 的无限试探)
 *
 * category: 可选过滤;'file' | 'meta' | 'plan'; 不传返回全部
 */
export const listToolsTool: Tool = {
  category: 'meta',
  description:
    'List all tools available for you to call right now. ' +
    'Use this BEFORE calling an unfamiliar tool to confirm its name and parameters. ' +
    "Returns JSON: { count, filteredCategory, excluded, tools: [{name, description, category, params}] }.",
  execute: async (params) => {
    const rawCategory = params.category as string | undefined;
    // 容错:大写/小写都能识别
    const category = rawCategory ? (rawCategory.toLowerCase() as ToolCategory) : null;
    const validCategories: ToolCategory[] = ['file', 'meta', 'plan'];
    if (category && !validCategories.includes(category)) {
      return JSON.stringify(
        {
          error: `Invalid category "${rawCategory}". Valid: ${validCategories.join(', ')}`,
          validCategories,
        },
        null,
        2,
      );
    }

    return withLog('ListTools', { category: rawCategory }, async () => {
      const registry = await getRegistry();
      const tools = registry.getRegisteredTools();
      const excluded = ['ListTools', 'GetToolDef'];

      const summaries: ToolSummary[] = tools
        .filter((t) => !excluded.includes(t.name))
        .filter((t) => !category || t.category === category)
        .map(({ name, description, category: cat, params }) => ({
          name,
          description,
          category: cat,
          params,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const result: {
        count: number;
        excluded: string[];
        filteredCategory: ToolCategory | null;
        hint?: string;
        tools: ToolSummary[];
      } = {
        count: summaries.length,
        excluded,
        filteredCategory: category,
        tools: summaries,
      };
      // meta 类只 2 个且都被排除,显式提示避免 LLM 困惑
      if (category === 'meta') {
        result.hint = 'meta tools (ListTools, GetToolDef) are self-discoverable and excluded from results to avoid recursion.';
      }

      return JSON.stringify(result, null, 2);
    });
  },
  name: 'ListTools',
  params: {
    properties: {
      category: {
        description: 'Optional category filter (case-insensitive). One of: file, meta, plan.',
        enum: ['file', 'meta', 'plan'],
        type: 'string',
      },
    },
    type: 'object',
  },
};

/**
 * get_tool_def — 取单个工具的完整定义(含 JSON Schema 参数定义)
 *
 * name 支持 canonical('ReadFile') / snake_case('read_file') / alias('Read') 三种写法,
 * 内部统一 toPascalCase + alias 解析。
 */
export const getToolDefTool: Tool = {
  category: 'meta',
  description:
    'Get the full definition of a single tool by name, including its JSON Schema for parameters. ' +
    'Use this when the tool description is ambiguous or before first-time use. ' +
    'Accepts canonical name, snake_case, or any alias.',
  execute: async (params) => {
    const name = params.name as string | undefined;
    if (!name) throw new Error('Missing name parameter');

    return withLog('GetToolDef', { name }, async () => {
      const registry = await getRegistry();
      const canonical = registry.resolveCanonicalName(name);
      const tool = registry
        .getRegisteredTools()
        .find((t) => t.name === canonical);

      if (!tool) {
        return JSON.stringify(
          {
            availableTools: registry.getCanonicalNames(),
            error: `Tool "${name}" not found (resolved canonical: "${canonical}"). Use list_tools to see available tools.`,
            input: name,
          },
          null,
          2,
        );
      }

      const summary: ToolSummary = {
        category: tool.category,
        description: tool.description,
        name: tool.name,
        params: tool.params,
      };
      return JSON.stringify(summary, null, 2);
    });
  },
  name: 'GetToolDef',
  params: {
    properties: {
      name: {
        description: 'Tool name. Accepts canonical (PascalCase, e.g. ReadFile), snake_case (read_file), or any alias.',
        type: 'string',
      },
    },
    required: ['name'],
    type: 'object',
  },
};

// 显式引用 ParamSchema 确保它是 type-only(防止被 tree-shake 当成 unused)
export type { ParamSchema };
