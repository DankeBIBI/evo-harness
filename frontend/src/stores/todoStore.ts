import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TodoSource = 'user' | 'ai';
export type TodoStatus = 'completed' | 'in_progress' | 'pending';

export interface Todo {
  completed: boolean;
  /** 所属会话 ID（无值 = 旧数据/全局） */
  conversationId?: string;
  createdAt: string;
  id: string;
  priority: 'high' | 'low' | 'medium';
  /** 任务来源:用户手动添加 = 'user',AI 通过 todo_* 工具创建 = 'ai' */
  source: TodoSource;
  /** 任务状态（AI 协议字段）；与 completed 互斥，优先看 status */
  status: TodoStatus;
  text: string;
}

/** AI 工具传入的单条 todo 任务(批量入口使用) */
export interface AITodoItem {
  activeForm: string;
  content: string;
  status: string;
}

interface TodoState {
  addTodo: (
    text: string,
    conversationId?: string,
    priority?: Todo['priority'],
    source?: TodoSource,
  ) => string;
  clearCompleted: (conversationId?: string) => void;
  deleteTodo: (id: string) => void;
  deleteTodos: (ids: string[]) => void;
  deleteTodosByConversation: (conversationId: string) => void;
  editTodo: (id: string, text: string) => void;
  /** 替换所有 AI 创建的 todo（清空旧 AI todo，按新数组写入；保留 user todo） */
  replaceAITodos: (todos: AITodoItem[], conversationId: string) => void;
  setPriority: (id: string, priority: Todo['priority']) => void;
  toggleTodo: (id: string) => void;
  todos: Todo[];
  /** 更新单条 todo 的 status（同时同步 completed 字段） */
  updateTodoStatus: (id: string, status: TodoStatus) => void;
}

let nextId = 1;
const generateId = () => `todo-${Date.now()}-${nextId++}`;

/** 标准化 AI status 字符串：pending / in_progress / completed / 其它 → pending */
function normalizeAIStatus(raw: string | undefined): TodoStatus {
  if (raw === 'in_progress' || raw === 'completed' || raw === 'pending') {
    return raw;
  }
  return 'pending';
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set) => ({
      todos: [],

      addTodo: (text, conversationId, priority = 'medium', source = 'user') => {
        const id = generateId();
        set((state) => ({
          todos: [
            ...state.todos,
            {
              completed: false,
              conversationId,
              createdAt: new Date().toISOString(),
              id,
              priority,
              source,
              status: 'pending',
              text,
            },
          ],
        }));
        return id;
      },

      toggleTodo: (id) =>
        set((state) => ({
          todos: state.todos.map((t) => {
            if (t.id !== id) return t;
            const completed = !t.completed;
            return {
              ...t,
              completed,
              status: completed ? 'completed' : 'pending',
            };
          }),
        })),

      deleteTodo: (id) =>
        set((state) => ({
          todos: state.todos.filter((t) => t.id !== id),
        })),

      deleteTodos: (ids) =>
        set((state) => ({
          todos: state.todos.filter((t) => !ids.includes(t.id)),
        })),

      editTodo: (id, text) =>
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === id ? { ...t, text } : t,
          ),
        })),

      setPriority: (id, priority) =>
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === id ? { ...t, priority } : t,
          ),
        })),

      updateTodoStatus: (id, status) =>
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === id ? { ...t, completed: status === 'completed', status } : t,
          ),
        })),

      replaceAITodos: (aiTodos, conversationId) =>
        set((state) => {
          // 只替换同一会话的 AI todo,保留其他会话与 user todo
          const userTodos = state.todos.filter(
            (t) => t.source !== 'ai' || t.conversationId !== conversationId,
          );
          const now = new Date().toISOString();
          const newAITodos: Todo[] = aiTodos.map((item) => {
            const status = normalizeAIStatus(item.status);
            return {
              completed: status === 'completed',
              conversationId,
              createdAt: now,
              id: generateId(),
              priority: 'medium',
              source: 'ai',
              status,
              text: item.content,
            };
          });
          return { todos: [...userTodos, ...newAITodos] };
        }),

      clearCompleted: (conversationId) =>
        set((state) => ({
          todos: state.todos.filter(
            (t) =>
              !t.completed ||
              (conversationId !== undefined && t.conversationId !== conversationId),
          ),
        })),

      deleteTodosByConversation: (conversationId) =>
        set((state) => ({
          todos: state.todos.filter((t) => t.conversationId !== conversationId),
        })),
    }),
    {
      migrate: (persistedState, _version) => {
        // 旧数据没有 source/status 字段，迁移为 user/pending
        if (persistedState && typeof persistedState === 'object' && 'todos' in persistedState) {
          const state = persistedState as { todos: Todo[] };
          return {
            ...state,
            todos: (state.todos ?? []).map((t) => ({
              ...t,
              source: t.source ?? 'user',
              status: t.status ?? (t.completed ? 'completed' : 'pending'),
            })),
          };
        }
        return persistedState;
      },
      name: 'todo-storage',
      version: 1,
    },
  ),
);
