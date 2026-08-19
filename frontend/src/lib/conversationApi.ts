/**
 * 会话持久化 API(REFACTOR-FRONTEND-MIGRATION Phase 4)
 *
 * 已从 Wails IPC 切换到 IndexedDB(conversationDb,自动降级 localStorage)。
 * 对外签名保持不变(返回 JSON 字符串 / void),调用方无需改动。
 */

import {
  deleteConversation,
  deleteConversations,
  getConversation,
  listConversations,
  saveConversation,
} from './storage/conversationDb';

/** 获取全部会话(返回 JSON 字符串,需 JSON.parse) */
export async function ListConversations(): Promise<string> {
  return JSON.stringify(await listConversations());
}

/** 获取单个会话 */
export async function GetConversation(id: string): Promise<string> {
  return JSON.stringify(await getConversation(id));
}

/** 创建会话(传入 JSON 字符串) */
export async function CreateConversation(jsonStr: string): Promise<void> {
  await saveConversation(JSON.parse(jsonStr) as Record<string, unknown>);
}

/** 更新会话字段 */
export async function UpdateConversation(
  id: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const current = await getConversation(id).catch(() => null);
  await saveConversation({ ...(current ?? {}), ...updates, id });
}

/** 更新 token 统计 */
export async function UpdateConversationTokenStats(
  id: string,
  stats: Record<string, unknown>,
): Promise<void> {
  const current = await getConversation(id).catch(() => null);
  await saveConversation({ ...(current ?? {}), id, tokenStats: stats });
}

/** 删除会话 */
export async function DeleteConversation(id: string): Promise<void> {
  await deleteConversation(id);
}

/** 批量删除 */
export async function DeleteMultipleConversations(ids: string[]): Promise<void> {
  await deleteConversations(ids);
}

/** 追加单条消息 */
export async function AddMessage(convID: string, msgJSON: string): Promise<void> {
  const msg = JSON.parse(msgJSON);
  const current = (await getConversation(convID).catch(() => null)) as {
    messages?: unknown[];
  } | null;
  const messages = Array.isArray(current?.messages) ? current!.messages : [];
  await saveConversation({ ...(current ?? {}), id: convID, messages: [...messages, msg] });
}

/** 更新会话中指定消息 */
export async function UpdateMessage(
  convID: string,
  msgID: string,
  updatesJSON: string,
): Promise<void> {
  const current = (await getConversation(convID).catch(() => null)) as {
    messages?: Array<{ id: string } & Record<string, unknown>>;
  } | null;
  const updates = JSON.parse(updatesJSON);
  const messages = (current?.messages ?? []).map((m) =>
    m.id === msgID ? { ...m, ...updates } : m,
  );
  await saveConversation({ ...(current ?? {}), id: convID, messages });
}
