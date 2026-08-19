/**
 * Agent 服务(hostServices/AgentService)
 * - 兼容旧 Wails 绑定签名(基于 models.Agent)
 * - 实现为 localStorage 持久化 CRUD
 */

const AGENT_KEY = 'hostServices.agents.v1';

function readAll(): Record<string, unknown>[] {
  try {
    return JSON.parse(localStorage.getItem(AGENT_KEY) ?? '[]') as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function writeAll(items: Record<string, unknown>[]): void {
  localStorage.setItem(AGENT_KEY, JSON.stringify(items));
}

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建 Agent,返回新 id */
export async function Create(agent: Record<string, unknown>): Promise<string> {
  const id = String(agent.id || genId());
  writeAll([...readAll().filter((a) => a.id !== id), { ...agent, id }]);
  return id;
}

/** 删除 Agent */
export async function Delete(id: string): Promise<void> {
  writeAll(readAll().filter((a) => a.id !== id));
}

/** 获取单个 Agent */
export async function Get(id: string): Promise<Record<string, unknown> | null> {
  return readAll().find((a) => a.id === id) ?? null;
}

/** 列出全部 Agent */
export async function List(): Promise<Record<string, unknown>[]> {
  return readAll();
}

/** 更新 Agent */
export async function Update(id: string, agent: Record<string, unknown>): Promise<void> {
  writeAll(readAll().map((a) => (a.id === id ? { ...a, ...agent, id } : a)));
}

/** 确保系统级 Agent 存在(空实现,本地无内置 Agent) */
export async function EnsureSystemAgents(): Promise<void> {
  // no-op: 本地模式无系统内置 Agent
}

/** 导出单个 Agent(JSON 字符串) */
export async function Export(id: string): Promise<string> {
  const item = await Get(id);
  return JSON.stringify(item ?? null, null, 2);
}

/** 导入 Agent(JSON 字符串),返回新 id */
export async function Import(json: string): Promise<string> {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  return Create(parsed);
}
