/**
 * Host 适配层入口(REFACTOR-FRONTEND-MIGRATION Phase 4)
 * - initHost: 应用启动时初始化(注册环境探测、恢复持久化句柄)
 * - hostApi: 会话/偏好等基础数据的跨端统一 HTTP 式 API(当前为 localStorage 实现)
 */

/** 会话消息(持久化结构) */
export interface StoredConversation {
  id: string;
  messages?: unknown[];
  tokenStats?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 简单 JSON 存储封装(localStorage 持久化) */
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

const CONV_KEY = 'hostApi.conversations.v1';

function listStored(): StoredConversation[] {
  return readJson<StoredConversation[]>(CONV_KEY, []);
}

function findStored(id: string): StoredConversation | null {
  return listStored().find((c) => c.id === id) ?? null;
}

function saveStored(conv: StoredConversation): void {
  const all = listStored();
  const idx = all.findIndex((c) => c.id === conv.id);
  const normalized: StoredConversation = { ...conv, messages: conv.messages ?? [] };
  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.unshift(normalized);
  }
  writeJson(CONV_KEY, all);
}

/** hostApi 对象:conversationApi 等模块依赖的统一数据入口 */
export const hostApi = {
  /** 列出全部会话 */
  async listConversations(): Promise<StoredConversation[]> {
    return listStored();
  },

  /** 获取单个会话(不存在返回 null) */
  async getConversation(id: string): Promise<StoredConversation | null> {
    return findStored(id);
  },

  /** 保存/覆盖会话 */
  async saveConversation(conv: StoredConversation): Promise<void> {
    saveStored(conv);
  },

  /** 删除单个会话 */
  async deleteConversation(id: string): Promise<void> {
    const rest = listStored().filter((c) => c.id !== id);
    writeJson(CONV_KEY, rest);
  },

  /** 批量删除会话 */
  async deleteConversations(ids: string[]): Promise<void> {
    const set = new Set(ids);
    const rest = listStored().filter((c) => !set.has(c.id));
    writeJson(CONV_KEY, rest);
  },
};

/** 应用启动初始化(幂等) */
export function initHost(): void {
  // 预留:后续在此恢复 FileSystem 授权句柄 / 探测宿主环境
  if (typeof localStorage === 'undefined') return;
  if (!localStorage.getItem(CONV_KEY)) {
    writeJson(CONV_KEY, []);
  }
}
