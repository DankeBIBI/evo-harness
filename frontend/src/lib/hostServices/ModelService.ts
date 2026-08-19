/**
 * 模型服务(hostServices/ModelService)
 * - 兼容旧 Wails 绑定签名(基于 models.Model)
 * - 实现为 localStorage 持久化 CRUD;ListAvailableModels 走 provider 探活
 */

const MODEL_KEY = 'hostServices.models.v1';

interface StoredModel {
  baseUrl: string;
  id: string;
  isEnabled: boolean;
  name: string;
  provider: string;
  [key: string]: unknown;
}

function readAll(): StoredModel[] {
  try {
    return JSON.parse(localStorage.getItem(MODEL_KEY) ?? '[]') as StoredModel[];
  } catch {
    return [];
  }
}

function writeAll(items: StoredModel[]): void {
  localStorage.setItem(MODEL_KEY, JSON.stringify(items));
}

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 新增模型 */
export async function Add(model: Record<string, unknown>): Promise<void> {
  const id = String(model.id || genId());
  writeAll([...readAll().filter((m) => m.id !== id), { ...model, id } as StoredModel]);
}

/** 删除模型 */
export async function Delete(id: string): Promise<void> {
  writeAll(readAll().filter((m) => m.id !== id));
}

/** 列出全部模型 */
export async function List(): Promise<StoredModel[]> {
  return readAll();
}

/** 选中模型(记录到 localStorage) */
export async function Select(id: string): Promise<void> {
  localStorage.setItem('hostServices.selectedModelId', id);
}

/** 更新模型 */
export async function Update(id: string, model: Record<string, unknown>): Promise<void> {
  writeAll(readAll().map((m) => (m.id === id ? { ...m, ...model, id } as StoredModel : m)));
}

/** 测试模型连通性(简单探活) */
export async function Test(id: string): Promise<Record<string, unknown>> {
  const model = readAll().find((m) => m.id === id);
  if (!model) throw new Error(`模型不存在:${id}`);
  if (!model.apiKey) throw new Error('未配置 API Key');
  const baseUrl = String(model.baseUrl).replace(/\/+$/, '');
  const url = model.provider === 'anthropic'
    ? `${baseUrl}/v1/messages`
    : `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${String(model.apiKey)}`,
  };
  if (model.provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';
  const body = model.provider === 'anthropic'
    ? { max_tokens: 16, messages: [{ content: 'ping', role: 'user' }], model: model.name, stream: false }
    : { max_tokens: 16, messages: [{ content: 'ping', role: 'user' }], model: model.name, stream: false };
  const resp = await fetch(url, {
    body: JSON.stringify(body),
    headers,
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
  });
  const ok = resp.ok;
  const errText = ok ? '' : (await resp.text().catch(() => '')).slice(0, 200);
  return { ok, status: resp.status, error: ok ? undefined : errText };
}

/** 拉取可选模型列表(依赖 provider 兼容端点,失败返回空数组) */
export async function ListAvailableModels(
  _baseUrl: string,
  _apiKey: string,
  _provider: string,
): Promise<string[]> {
  // 前端化后模型清单以本地配置为准,不再从 provider 拉取
  return [];
}
