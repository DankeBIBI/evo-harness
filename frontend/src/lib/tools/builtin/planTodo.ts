/**
 * Built-in special tools:
 *  - SubmitPlan (awaits user approval)
 *  - 9 todo tools (1 batch entry + 8 fine-grained) — AI 用原生 function call 主动管理任务清单
 *
 * 所有 todo_* 工具的作用域**严格限定在 tool.execute 被调用时的当前会话**——
 *  1) 通过 useChatStore.getState().currentConversationId 取得 convId
 *  2) 所有 store 操作都携带 convId(todoStore 已按 conversationId 隔离)
 *  3) 若 AI 试图用旧 convId 的 todo.id 操作(用户在工具执行期间切换了会话),校验失败直接拒绝
 *
 * 这避免了「用户在 A 会话看到 B 会话 todo 被改」「AI 跨会话污染」等场景。
 */

import type { Tool } from '../base';
import { useTodoStore, type Todo, type TodoStatus } from '@/stores/todoStore';
import { useChatStore } from '@/stores/chatStore';
import { usePlanStore } from '@/stores/planStore';

/** 从 useChatStore 取当前 convId,无会话时抛 string(供 tool.execute 返回错误文案) */
function getActiveConvIdOrThrow(): string | null {
  const convId = useChatStore.getState().currentConversationId;
  return convId ?? null;
}

/** AI status 字符串 → TodoStatus(与 todoStore 内部 normalizeAIStatus 保持一致) */
function normalizeAIStatus(raw: string | undefined): TodoStatus {
  if (raw === 'in_progress' || raw === 'completed' || raw === 'pending') {
    return raw;
  }
  return 'pending';
}

/** 校验 todo.id 是否属于当前 convId(防止 AI 用过期 id 误改他会话 todo) */
function assertTodoBelongsToCurrentConv(todo: Todo | undefined, convId: string): todo is Todo {
  if (!todo) return false;
  // 旧数据(无 conversationId)视为合法,允许操作(向后兼容)
  if (!todo.conversationId) return true;
  return todo.conversationId === convId;
}

/** SubmitPlan tool — submit a plan and await user approval. */
export const submitPlanTool: Tool = {
  category: 'plan',
  description:
    'Submit a multi-step execution plan for user approval. After invocation, wait for the user to approve, refine, or reject, and return the approval result. Only available in plan mode.',
  planAllowed: true,
  execute: async (params) => {
    const steps = (params.steps as Array<{
      id: string;
      title: string;
      action: string;
      risk?: string;
      targets?: string[];
    }>) || [];

    const plan = {
      summary: (params.summary as string) || '',
      steps: steps.map((s) => ({
        id: s.id || '',
        title: s.title || '',
        action: s.action || '',
        risk: (s.risk as 'low' | 'med' | 'high') || undefined,
        targets: s.targets || undefined,
      })),
      rawPlan: (params.plan as string) || '',
    };

    // Persist to store
    usePlanStore.getState().submit(plan);

    // 等待用户审批;waitForDecision 内置 30s 超时自动 approve,
    // 避免用户不响应时 Promise 永挂、pendingToolResults 计数不归零卡死会话链路
    const decision = await usePlanStore.getState().waitForDecision();

    if (decision.action === 'approved') {
      return 'OK: plan approved, please continue execution.';
    }
    if (decision.action === 'refined') {
      const feedback = decision.feedback;
      return `Plan needs refinement. User feedback: ${feedback}\nPlease adjust the plan based on the feedback and resubmit.`;
    }
    return 'Plan rejected. Please ask the user for new requirements.';
  },
  name: 'SubmitPlan',
  params: {
    properties: {
      plan: { description: 'Full markdown plan description', type: 'string' },
      steps: {
        description: 'Plan steps (each with id/title/action/risk/targets)',
        items: {
          properties: {
            action: { description: 'What this step does', type: 'string' },
            id: { description: 'Unique step id', type: 'string' },
            risk: {
              description: 'Risk level of this step',
              enum: ['high', 'low', 'med'],
              type: 'string',
            },
            targets: { description: 'Files or resources affected', items: { type: 'string' }, type: 'array' },
            title: { description: 'Short step title', type: 'string' },
          },
          required: ['id', 'title', 'action'],
          type: 'object',
        },
        type: 'array',
      },
      summary: { description: '~80 word executive summary', type: 'string' },
    },
    required: ['plan', 'steps', 'summary'],
    type: 'object',
  },
};

/** TodoWrite tool — AI creates/updates the task list for the current session.
 *  Legacy batch entry. Prefer the 7 fine-grained Todo* mutation tools below for token
 *  efficiency and partial mutations (TodoList 是 discover 类,不算 mutation).
 *  Kept for back-compat with existing prompts / models.
 */
export const todoWriteTool: Tool = {
  category: 'plan',
  description:
    'Replace the entire AI task list for the current session. Pass empty array to clear. Prefer fine-grained TodoAdd / TodoToggle / TodoUpdateStatus / TodoEdit / TodoSetPriority / TodoDelete / TodoClearCompleted for partial mutations.',
  mutating: true,
  planAllowed: true,
  execute: async (params) => {
    const todos = params.todos as Array<{
      content: string;
      status: string;
      activeForm: string;
    }> | undefined;

    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoWrite ignored.';

    if (!todos || todos.length === 0) {
      // 空数组：清空当前会话的 AI todo（不删 user todo / 不动其他会话）
      useTodoStore.getState().replaceAITodos([], convId);
      return 'AI task list cleared.';
    }

    // 一次性替换：清空当前会话旧 AI todo + 写入新数组，保留 user todo 与其他会话
    useTodoStore.getState().replaceAITodos(
      todos.map((t) => ({
        activeForm: t.activeForm || '',
        content: t.content,
        status: t.status,
      })),
      convId,
    );

    return `Task list updated (${todos.length} items)`;
  },
  name: 'TodoWrite',
  params: {
    properties: {
      todos: {
        description: 'Task items (empty array clears AI tasks)',
        items: {
          properties: {
            activeForm: { description: 'Present-continuous label, e.g. "Reading files"', type: 'string' },
            content: { description: 'Task description', type: 'string' },
            status: {
              description: 'Task status',
              enum: ['completed', 'in_progress', 'pending'],
              type: 'string',
            },
          },
          required: ['content', 'status'],
          type: 'object',
        },
        type: 'array',
      },
    },
    type: 'object',
  },
};

// ────────────────────────────────────────────────────────────────
// todo 工具族(2026-07-23 全部走原生 function call)
//
// 设计目标:
//   1) 与 UI 操作对称 — 用户能做的 8 个动作,AI 都能做(add/toggle/status/edit/priority/delete/clearCompleted/replace)
//   2) convId 严格隔离 — 工具执行时从 useChatStore 读 currentConversationId,
//      所有 store 调用携带 convId;若 AI 提供的 id 不属于该 convId,直接拒绝
//   3) 错误信息明确 — 返回的 string 包含具体 id / 原因,LLM 可读、可自纠
//   4) 工具 schema 由 ToolsSchema 原生注入 system prompt,无需在 prompt 文本里教 AI 怎么用
//
// TodoWrite 仍作为整体替换入口保留(向后兼容已有会话历史);新增 / 修改单条 todo 用细粒度工具。
// ────────────────────────────────────────────────────────────────

/** TodoAdd — AI 新增一条 todo 到当前会话
 *  返回新 todo 的 id,后续 TodoToggle / TodoUpdateStatus / TodoEdit / TodoDelete 需用此 id
 */
export const todoAddTool: Tool = {
  category: 'plan',
  description:
    "Add a single todo to the current session's task list. Returns the new todo's id. Scoped to the active conversation only.",
  mutating: true,
  planAllowed: true,
  execute: async (params) => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoAdd ignored.';

    const text = (params.text as string | undefined)?.trim();
    if (!text) return 'TodoAdd failed: text is required and must be non-empty.';

    const priority = (params.priority as Todo['priority'] | undefined) ?? 'medium';
    // source='ai' 与批量入口创建的 todo 保持一致(避免 TodoList 渲染歧义 + 让 AI 标签生效)
    const newId = useTodoStore.getState().addTodo(text, convId, priority, 'ai');
    return `todo added: id=${newId} text="${text}" priority=${priority}`;
  },
  name: 'TodoAdd',
  params: {
    properties: {
      priority: {
        description: 'Task priority (defaults to medium)',
        enum: ['high', 'low', 'medium'],
        type: 'string',
      },
      text: { description: 'Task description', type: 'string' },
    },
    required: ['text'],
    type: 'object',
  },
};

/** TodoList — AI 列出当前会话的所有 todo
 *  单条操作工具(TodoToggle/edit/delete 等)都依赖 id,本工具是它们的"前置 discover"工具
 *  返回 JSON 字符串: [{ id, text, status, priority, completed, source }, ...]
 *  按 source 排序(ai 在前,user 在后),createdAt 升序
 */
export const todoListTool: Tool = {
  category: 'plan',
  description:
    "List all todos in the current session. Returns JSON array of {id, text, status, priority, completed, source}. Use this first to discover ids before TodoToggle / TodoEdit / TodoDelete / TodoUpdateStatus / TodoSetPriority.",
  execute: async () => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return JSON.stringify({ error: 'no_active_conversation', todos: [] });

    const list = useTodoStore
      .getState()
      .todos.filter((t) => !t.conversationId || t.conversationId === convId)
      .map((t) => ({
        completed: t.completed,
        id: t.id,
        priority: t.priority,
        source: t.source,
        status: t.status,
        text: t.text,
      }))
      // ai 优先(AI 自己创建的先看到),user 其次;内部按 createdAt 升序
      .sort((a, b) => {
        if (a.source !== b.source) return a.source === 'ai' ? -1 : 1;
        return 0;
      });

    return JSON.stringify({ conversationId: convId, todos: list });
  },
  name: 'TodoList',
  params: {
    properties: {},
    type: 'object',
  },
};

/** TodoToggle — AI 切换单条 todo 完成态(completed ↔ pending)
 *  注意: 不切 in_progress — 状态切换用 TodoUpdateStatus
 */
export const todoToggleTool: Tool = {
  category: 'plan',
  description:
    "Toggle a single todo's completed state (completed <-> pending). Use TodoUpdateStatus to set in_progress.",
  mutating: true,
  planAllowed: true,
  execute: async (params) => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoToggle ignored.';

    const id = params.id as string | undefined;
    if (!id) return 'TodoToggle failed: id is required.';

    const todo = useTodoStore.getState().todos.find((t) => t.id === id);
    if (!assertTodoBelongsToCurrentConv(todo, convId)) {
      return `TodoToggle failed: todo ${id} not found in current conversation ${convId}.`;
    }

    useTodoStore.getState().toggleTodo(id);
    return `todo ${id} toggled (now ${todo!.completed ? 'pending' : 'completed'})`;
  },
  name: 'TodoToggle',
  params: {
    properties: {
      id: { description: 'Todo id (from TodoList or earlier TodoAdd result)', type: 'string' },
    },
    required: ['id'],
    type: 'object',
  },
};

/** TodoUpdateStatus — AI 设置单条 todo 状态(pending/in_progress/completed) */
export const todoUpdateStatusTool: Tool = {
  category: 'plan',
  description:
    "Set a single todo's status to pending / in_progress / completed. Use this to mark a task as in-progress when starting work.",
  mutating: true,
  planAllowed: true,
  execute: async (params) => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoUpdateStatus ignored.';

    const id = params.id as string | undefined;
    if (!id) return 'TodoUpdateStatus failed: id is required.';
    const rawStatus = params.status as string | undefined;
    const status = normalizeAIStatus(rawStatus);
    if (rawStatus && rawStatus !== status) {
      return `TodoUpdateStatus failed: unknown status "${rawStatus}", expected pending|in_progress|completed.`;
    }

    const todo = useTodoStore.getState().todos.find((t) => t.id === id);
    if (!assertTodoBelongsToCurrentConv(todo, convId)) {
      return `TodoUpdateStatus failed: todo ${id} not found in current conversation ${convId}.`;
    }

    useTodoStore.getState().updateTodoStatus(id, status);
    return `todo ${id} status -> ${status}`;
  },
  name: 'TodoUpdateStatus',
  params: {
    properties: {
      id: { description: 'Todo id', type: 'string' },
      status: {
        description: 'New status',
        enum: ['completed', 'in_progress', 'pending'],
        type: 'string',
      },
    },
    required: ['id', 'status'],
    type: 'object',
  },
};

/** TodoEdit — AI 改单条 todo 的文字 */
export const todoEditTool: Tool = {
  category: 'plan',
  description: 'Edit the text of a single todo. Status / priority are not changed.',
  mutating: true,
  planAllowed: true,
  execute: async (params) => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoEdit ignored.';

    const id = params.id as string | undefined;
    if (!id) return 'TodoEdit failed: id is required.';
    const text = (params.text as string | undefined)?.trim();
    if (!text) return 'TodoEdit failed: text is required and must be non-empty.';

    const todo = useTodoStore.getState().todos.find((t) => t.id === id);
    if (!assertTodoBelongsToCurrentConv(todo, convId)) {
      return `TodoEdit failed: todo ${id} not found in current conversation ${convId}.`;
    }

    useTodoStore.getState().editTodo(id, text);
    return `todo ${id} text updated`;
  },
  name: 'TodoEdit',
  params: {
    properties: {
      id: { description: 'Todo id', type: 'string' },
      text: { description: 'New task description', type: 'string' },
    },
    required: ['id', 'text'],
    type: 'object',
  },
};

/** TodoSetPriority — AI 改单条 todo 优先级 */
export const todoSetPriorityTool: Tool = {
  category: 'plan',
  description: 'Set the priority of a single todo (high / medium / low).',
  mutating: true,
  planAllowed: true,
  execute: async (params) => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoSetPriority ignored.';

    const id = params.id as string | undefined;
    if (!id) return 'TodoSetPriority failed: id is required.';
    const priority = params.priority as Todo['priority'] | undefined;
    if (priority !== 'high' && priority !== 'medium' && priority !== 'low') {
      return `TodoSetPriority failed: priority must be high|medium|low, got "${priority}".`;
    }

    const todo = useTodoStore.getState().todos.find((t) => t.id === id);
    if (!assertTodoBelongsToCurrentConv(todo, convId)) {
      return `TodoSetPriority failed: todo ${id} not found in current conversation ${convId}.`;
    }

    useTodoStore.getState().setPriority(id, priority);
    return `todo ${id} priority -> ${priority}`;
  },
  name: 'TodoSetPriority',
  params: {
    properties: {
      id: { description: 'Todo id', type: 'string' },
      priority: {
        description: 'New priority',
        enum: ['high', 'low', 'medium'],
        type: 'string',
      },
    },
    required: ['id', 'priority'],
    type: 'object',
  },
};

/** TodoDelete — AI 删除单条 todo */
export const todoDeleteTool: Tool = {
  category: 'plan',
  description: 'Delete a single todo from the current session.',
  mutating: true,
  planAllowed: true,
  execute: async (params) => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoDelete ignored.';

    const id = params.id as string | undefined;
    if (!id) return 'TodoDelete failed: id is required.';

    const todo = useTodoStore.getState().todos.find((t) => t.id === id);
    if (!assertTodoBelongsToCurrentConv(todo, convId)) {
      return `TodoDelete failed: todo ${id} not found in current conversation ${convId}.`;
    }

    useTodoStore.getState().deleteTodo(id);
    return `todo ${id} deleted`;
  },
  name: 'TodoDelete',
  params: {
    properties: {
      id: { description: 'Todo id to delete', type: 'string' },
    },
    required: ['id'],
    type: 'object',
  },
};

/** TodoClearCompleted — AI 清掉当前会话所有已完成 todo
 *  行为对齐前端 TodoList.clearCompleted:按 convId 过滤,不动 user todo / 其他会话
 */
export const todoClearCompletedTool: Tool = {
  category: 'plan',
  description:
    'Remove all completed todos from the current session. Other sessions and user todos are untouched.',
  mutating: true,
  planAllowed: true,
  execute: async () => {
    const convId = getActiveConvIdOrThrow();
    if (!convId) return 'No active conversation; TodoClearCompleted ignored.';

    const before = useTodoStore.getState().todos.filter(
      (t) => t.conversationId === convId && t.completed,
    ).length;
    useTodoStore.getState().clearCompleted(convId);
    return `cleared ${before} completed todo(s) from conversation ${convId}`;
  },
  name: 'TodoClearCompleted',
  params: {
    properties: {},
    type: 'object',
  },
};

