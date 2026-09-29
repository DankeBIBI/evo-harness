/**
 * Agent 路由模块
 *
 * 职责：
 *  1) 解析 agent role 中的 subagents YAML 字段 → skill ID 列表
 *  2) 解析用户输入里的 @agentName 路由标记
 *  3) 构建"可用 Agent 摘要"注入 system prompt
 *  4) 统一任务入口（参考 AGENT-ROUTING.md §1.2）：
 *     - 用户未选 agent → 选 orchestration 类作为入口
 *     - 用户选了普通 agent 但 mode==='route' + 消息复杂 → 包装一层 orchestrator
 *     - 用户选的就是 orchestration agent → 原样返回
 *  5) 把 parent agent 的 children 递归展开为后端 childAgents 数组
 *
 * 注：buildChildAgents / resolveEntryAgent 是 hook（用 useCallback 包装），
 * 调用方应在 useChatStreaming 顶层调用一次后取返回值，传给 sendMessage。
 */

import { useCallback } from 'react';

import { useModeStore } from '@/stores/modeStore';

/** 调用方可传入的 agent 形状（与 useChatStreaming 的 availableAgents / selectedAgent 对齐） */
export type AgentLite = {
  category?: string;
  children?: string[];
  collaborationMode?: string;
  id: string;
  modelConfig?: Record<string, unknown>;
  modelId?: string;
  name: string;
  role: string;
  scope?: string;
  skills?: string[];
  tools?: string[];
};

/** resolveEntryAgent 返回值 */
export type EntryAgentResolution = {
  entryAgent: AgentLite | null;
  extraChildren: AgentLite['children'];
  routed: boolean;
};

/**
 * 解析 agent.md frontmatter 的 subagents 字段,返回 skill ID 列表
 *
 * 支持的 YAML 格式:
 *   subagents: [code_review, self_healer]   # JSON 数组
 *   subagents:                               # 块格式
 *     - code_review
 *     - self_healer
 *
 * 跳过 ./xxx.md 文件路径形式(Claude Code 风格,Evo Harness 用 skill ID 关联)
 * 去重并返回纯字符串数组
 */
export function parseSubagentsFromRole(role: string): string[] {
  if (!role) return [];

  // 匹配 subagents 字段:支持 key: [...] 和 key:\n  - xxx 两种格式
  // 1) 数组形式 subagents: [a, b] 或 subagents: [a, b,]
  const arrayMatch = role.match(/^\s*subagents\s*:\s*\[([^\]]*)\]/im);
  // 2) 块形式 subagents:\n  - a\n  - b
  const blockMatch = role.match(/^\s*subagents\s*:\s*\n((?:\s*-\s*[^\n]+\n?)+)/im);

  const items: string[] = [];
  if (arrayMatch) {
    items.push(
      ...arrayMatch[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')),
    );
  } else if (blockMatch) {
    const lines = blockMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*-\s*(.+?)\s*$/);
      if (m) items.push(m[1].replace(/^['"]|['"]$/g, ''));
    }
  }

  // 过滤:
  //  - 跳过空字符串
  //  - 跳过 ./xxx.md / ./xxx 文件路径(Claude Code 风格,非 skill ID)
  //  - 跳过包含 / \ 的项
  //  - 跳过包含 .md 后缀的项
  return [
    ...new Set(
      items
        .filter((s) => s.length > 0)
        .filter((s) => !s.startsWith('./') && !s.startsWith('../'))
        .filter((s) => !s.includes('/') && !s.includes('\\'))
        .filter((s) => !s.endsWith('.md')),
    ),
  ];
}

/** 从输入文本中提取第一个已解析的 @agentName，返回清洗后文本 + 匹配的 agent */
export function parseAgentRoute<T extends { id: string; name: string }>(
  text: string,
  agents: T[],
): { cleanedText: string; targetAgent: T | null } {
  const nameSet = new Set(agents.map((a) => a.name));
  const re = /@([A-Za-z0-9_一-鿿\-]+)/g;
  let firstMatch: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (nameSet.has(m[1])) {
      firstMatch = m[1];
      break;
    }
  }
  if (!firstMatch) return { cleanedText: text, targetAgent: null };
  const targetAgent = agents.find((a) => a.name === firstMatch) ?? null;
  // 移除所有已解析的 @agentName，其余 @文本保留
  const cleanedText = text
    .replace(re, (match, name) => (nameSet.has(name) ? '' : match))
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleanedText, targetAgent };
}

/** 构建可用 Agent 列表摘要（注入系统提示词，让 AI 知道可委派哪些子 Agent）
 *  按 name 去重：多来源（DB+文件）可能产生同名重复，保留第一个。 */
export function buildAgentSummary(
  agents: Array<{ id: string; name: string; role: string; description?: string }>,
  excludeName?: string,
): string {
  const seen = new Set<string>();
  const entries = agents
    .filter((a) => a.name !== excludeName && a.name !== '' && !seen.has(a.name) && seen.add(a.name))
    .map((a) => {
      const roleSummary = a.role?.slice(0, 120).replace(/\n/g, ' ') ?? '';
      const desc = a.description || roleSummary || '(无描述)';
      return `- \`${a.name}\`: ${desc}`;
    });
  if (entries.length === 0) return '';
  return (
    '\n\n## 可用 Agent' +
    '\n\n当任务需要专业处理时，你可以将子任务委派给以下 Agent（通过指定 agent 名称）：' +
    '\n\n' +
    entries.join('\n')
  );
}

/**
 * 递归构建子代理：若 child 自身也有 children，则一并展开为 nestedChildren
 * 后端 maxDepth=3 防护会兜底循环
 */
function buildOneChild(
  agent: AgentLite,
  prompt: string,
  availableAgents: AgentLite[],
): unknown {
  return {
    id: agent.id,
    modelConfig: agent.modelConfig || null,
    modelId: agent.modelId || '',
    name: agent.name,
    nestedChildren:
      agent.children?.length
        ? agent.children
            .map((cid) => availableAgents.find((a) => a.id === cid))
            .filter((a): a is AgentLite => a !== null)
            .map((grandChild) => buildOneChild(grandChild, prompt, availableAgents))
        : undefined,
    resultEventName: `child-result-${agent.id}-${Date.now()}`,
    role: agent.role,
    skills: agent.skills || [],
    taskPrompt: `请完成以下任务: ${prompt}`,
    tools: agent.tools || [],
  };
}

/**
 * 把 parentAgent 的 children 递归展开为后端 childAgents 数组
 */
export function buildChildAgents(
  parentAgent: AgentLite | null,
  task: string,
  availableAgents: AgentLite[],
): unknown[] {
  if (!parentAgent?.children?.length) return [];

  return parentAgent.children
    .map((childId) => availableAgents.find((a) => a.id === childId))
    .filter((a): a is AgentLite => a !== null)
    .map((child) => buildOneChild(child, task, availableAgents));
}

/**
 * 统一任务入口 hook（参考 AGENT-ROUTING.md §1.2）
 *
 * 触发条件（任一）：
 *   1. 用户未手动选 agent（无 selectedAgent）→ 选 orchestration 类作为入口
 *   2. 用户选了普通 agent 但 mode==='route' 且消息复杂度高（长度>200 或多任务关键词）→ 包装一层 orchestrator
 *   3. 用户选的就是 orchestration agent → 原样返回
 *
 * 返回：{ entryAgent, extraChildren, routed }
 *   - entryAgent: 真正送给后端的顶层 agent
 *   - extraChildren: 当 entryAgent 是 orchestrator 时，需要追加的 child 链（用户原选 agent + 它原本的 children）
 */
export function useEntryAgentResolver(
  availableAgents: AgentLite[],
  selectedAgent: AgentLite | null,
): (message: string) => EntryAgentResolution {
  return useCallback(
    (message: string): EntryAgentResolution => {
      // 1) 用户未选 agent：按 system scope 优先选 orchestration 类 agent 作为入口
      if (!selectedAgent?.id) {
        const systemOrchestrator = availableAgents.find(
          (a) =>
            a.category === 'orchestration' &&
            (a as { scope?: string }).scope === 'system',
        );
        const orchestrator =
          systemOrchestrator ??
          availableAgents.find((a) => a.category === 'orchestration');
        if (orchestrator) {
          return {
            entryAgent: orchestrator,
            extraChildren: undefined,
            routed: true,
          };
        }
        // 没有 orchestration agent 就 fallback 到第一个可用 agent
        return {
          entryAgent: availableAgents[0] ?? null,
          extraChildren: undefined,
          routed: false,
        };
      }

      // 2) 用户已选 orchestration agent：原样返回
      if (selectedAgent.category === 'orchestration') {
        return {
          entryAgent: selectedAgent,
          extraChildren: undefined,
          routed: false,
        };
      }

      // 3) 用户选了普通 agent：仅 mode === 'route' 时强制走 orchestrator，否则保留用户选择
      const { mode } = useModeStore.getState();
      if (mode !== 'route') {
        return {
          entryAgent: selectedAgent,
          extraChildren: undefined,
          routed: false,
        };
      }

      const multiTaskKeywords =
        /并[且行]|先.{0,4}再|分[别析]?[步阶]|and\s+then|plus|以及|另外|同时|并且/i;
      const isComplex =
        message.length > 200 || multiTaskKeywords.test(message);

      if (!isComplex) {
        return {
          entryAgent: selectedAgent,
          extraChildren: undefined,
          routed: false,
        };
      }

      // 找到 orchestrator：优先用 system scope，否则任意 orchestration 类
      const orchestrator =
        availableAgents.find(
          (a) =>
            a.category === 'orchestration' &&
            (a as { scope?: string }).scope === 'system',
        ) ?? availableAgents.find((a) => a.category === 'orchestration');

      if (!orchestrator) {
        // 无 orchestrator 时降级为用户原选 agent
        return {
          entryAgent: selectedAgent,
          extraChildren: undefined,
          routed: false,
        };
      }

      // 把用户原选 agent 挂为 orchestrator 的 child
      // （保留原 agent 自己的 children，让编排图能看到完整链路）
      return {
        entryAgent: orchestrator,
        extraChildren: [selectedAgent.id],
        routed: true,
      };
    },
    [availableAgents, selectedAgent],
  );
}
