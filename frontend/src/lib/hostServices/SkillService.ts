/**
 * Skill 服务(hostServices/SkillService)
 * - 兼容旧 Wails 绑定签名(基于 models.Skill)
 * - 实现为 localStorage 持久化 CRUD
 */

const SKILL_KEY = 'hostServices.skills.v1';

function readAll(): Record<string, unknown>[] {
  try {
    return JSON.parse(localStorage.getItem(SKILL_KEY) ?? '[]') as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function writeAll(items: Record<string, unknown>[]): void {
  localStorage.setItem(SKILL_KEY, JSON.stringify(items));
}

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建 Skill,返回新 id */
export async function Create(skill: Record<string, unknown>): Promise<string> {
  const id = String(skill.id || genId());
  writeAll([...readAll().filter((s) => s.id !== id), { ...skill, id }]);
  return id;
}

/** 删除 Skill */
export async function Delete(id: string): Promise<void> {
  writeAll(readAll().filter((s) => s.id !== id));
}

/** 列出全部 Skill */
export async function List(): Promise<Record<string, unknown>[]> {
  return readAll();
}

/** 更新 Skill */
export async function Update(id: string, skill: Record<string, unknown>): Promise<void> {
  writeAll(readAll().map((s) => (s.id === id ? { ...s, ...skill, id } : s)));
}

/** 调试 Skill(本地无执行环境,返回占位信息) */
export async function Debug(id: string, _input: string): Promise<Record<string, unknown>> {
  const skill = readAll().find((s) => s.id === id);
  if (!skill) throw new Error(`Skill 不存在:${id}`);
  return { id, message: '本地模式不支持 Skill 调试执行', name: skill.name };
}
