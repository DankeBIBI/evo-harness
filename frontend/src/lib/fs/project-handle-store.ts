/**
 * 项目根 handle 持久化(IndexedDB,lib/fs/project-handle-store)
 * - 存 1 个 FileSystemDirectoryHandle(key 固定为 'root')
 * - 与 source-handle-store 同模式,IndexedDB 不可用时降级为内存缓存
 * - 不跨会话:降级模式下重启会丢,这是浏览器 API 限制
 */

const DB_NAME = 'wails-project-handles';
// v2:强制触发 onupgradeneeded,修复同名 v1 旧库(缺 store)导致持久化静默失败的场景
const DB_VERSION = 2;
const STORE_NAME = 'handles';
const ROOT_KEY = 'root';

declare global {
  // eslint-disable-next-line no-var
  var __waisProjectHandleDb: Promise<IDBDatabase | null> | undefined;
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

/** 惰性打开 IndexedDB(失败返回 null,调用方降级内存缓存) */
function openDB(): Promise<IDBDatabase | null> {
  if (!isIDBAvailable()) return Promise.resolve(null);
  if (globalThis.__waisProjectHandleDb) return globalThis.__waisProjectHandleDb;

  globalThis.__waisProjectHandleDb = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      globalThis.__waisProjectHandleDb = undefined;
      resolve(null);
      return;
    }
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => {
      globalThis.__waisProjectHandleDb = undefined;
      resolve(null);
    };
    req.onblocked = (): void => {
      globalThis.__waisProjectHandleDb = undefined;
      resolve(null);
    };
  });
  return globalThis.__waisProjectHandleDb;
}

/** 事务完成封装(best-effort) */
function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => resolve();
    tx.onabort = (): void => resolve();
  });
}

/** 内存降级缓存 */
let memoryHandle: FileSystemDirectoryHandle | null = null;

/** 保存项目根 handle,返回是否持久化成功 */
export async function saveProjectHandle(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  memoryHandle = handle;
  const db = await openDB();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, ROOT_KEY);
    await waitTx(tx);
    return true;
  } catch {
    return false;
  }
}

/** 恢复项目根 handle(无授权返回 null) */
export async function loadProjectHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (memoryHandle) return memoryHandle;
  const db = await openDB();
  if (!db) return null;
  return new Promise<FileSystemDirectoryHandle | null>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(ROOT_KEY);
    req.onsuccess = (): void => {
      const handle = req.result as FileSystemDirectoryHandle | undefined;
      if (handle) memoryHandle = handle;
      resolve(handle ?? null);
    };
    req.onerror = (): void => resolve(null);
  });
}

/** 清除项目根 handle(用户切换/卸载时调用) */
export async function clearProjectHandle(): Promise<void> {
  memoryHandle = null;
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(ROOT_KEY);
    await waitTx(tx);
  } catch {
    // best-effort
  }
}