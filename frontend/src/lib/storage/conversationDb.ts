/**
 * 会话持久化(IndexedDB,lib/storage/conversationDb)
 * - 替代 localStorage hostApi 的会话存储(REFACTOR-FRONTEND-MIGRATION Phase 4)
 * - 失败策略:IndexedDB 不可用(SSR/私密模式/禁用)时自动降级为 localStorage
 * - 入口与 conversationApi.ts 签名一致:List/Get/Create/Update/Delete
 */

import { hostApi } from '../hostApi';

const DB_NAME = 'wails-conversations';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

/** 跨 HMR 共享 dbPromise 句柄 */
declare global {
  // eslint-disable-next-line no-var
  var __waisConvDbPromise: Promise<IDBDatabase | null> | undefined;
}

/** 当前环境是否支持 IndexedDB */
function isIDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
  } catch {
    return false;
  }
}

/** 惰性打开 IndexedDB(失败返回 null,调用方降级 localStorage) */
function openDB(): Promise<IDBDatabase | null> {
  if (!isIDBAvailable()) return Promise.resolve(null);
  if (globalThis.__waisConvDbPromise) return globalThis.__waisConvDbPromise;

  globalThis.__waisConvDbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      globalThis.__waisConvDbPromise = undefined;
      resolve(null);
      return;
    }
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => {
      globalThis.__waisConvDbPromise = undefined;
      resolve(null);
    };
    req.onblocked = (): void => {
      globalThis.__waisConvDbPromise = undefined;
      resolve(null);
    };
  });
  return globalThis.__waisConvDbPromise;
}

/** 事务完成封装(best-effort) */
function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => resolve();
    tx.onabort = (): void => resolve();
  });
}

/** 是否可用 IDB 的缓存标记(首次探测后固定) */
let idbUsable: boolean | null = null;

async function usable(): Promise<boolean> {
  if (idbUsable === null) {
    const db = await openDB();
    idbUsable = db !== null;
  }
  return idbUsable;
}

/** 用 IDB 列出全部会话 */
async function idbList(): Promise<Record<string, unknown>[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = (): void => resolve((req.result as Record<string, unknown>[]) ?? []);
    req.onerror = (): void => resolve([]);
  });
}

/** 用 IDB 保存会话 */
async function idbPut(conv: Record<string, unknown>): Promise<void> {
  const db = await openDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(conv);
  await waitTx(tx);
}

/** 用 IDB 删除会话 */
async function idbDelete(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await waitTx(tx);
}

/** 列出全部会话(优先 IDB,降级 localStorage) */
export async function listConversations(): Promise<Record<string, unknown>[]> {
  if (await usable()) return idbList();
  const stored = await hostApi.listConversations();
  return stored;
}

/** 获取单个会话(不存在返回 null) */
export async function getConversation(id: string): Promise<Record<string, unknown> | null> {
  if (await usable()) {
    const all = await idbList();
    return all.find((c) => c.id === id) ?? null;
  }
  return hostApi.getConversation(id);
}

/** 保存/覆盖会话 */
export async function saveConversation(conv: Record<string, unknown>): Promise<void> {
  if (await usable()) {
    await idbPut(conv);
    return;
  }
  await hostApi.saveConversation({ ...conv } as Parameters<typeof hostApi.saveConversation>[0]);
}

/** 删除单个会话 */
export async function deleteConversation(id: string): Promise<void> {
  if (await usable()) {
    await idbDelete(id);
    return;
  }
  await hostApi.deleteConversation(id);
}

/** 批量删除会话 */
export async function deleteConversations(ids: string[]): Promise<void> {
  if (await usable()) {
    for (const id of ids) await idbDelete(id);
    return;
  }
  await hostApi.deleteConversations(ids);
}
