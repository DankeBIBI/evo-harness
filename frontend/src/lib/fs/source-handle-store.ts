/**
 * 来源目录授权 handle 持久化(IndexedDB,lib/fs/source-handle-store)
 * - 按 source 存储已授权的 FileSystemDirectoryHandle,重启后自动恢复扫描
 * - IndexedDB 不可用(SSR/私密模式/禁用)时降级为内存缓存,不跨会话
 */

const DB_NAME = 'wails-source-handles';
// v2:强制触发 onupgradeneeded,修复同名 v1 旧库(缺 store)导致持久化静默失败的场景
const DB_VERSION = 2;
const STORE_NAME = 'handles';

declare global {
  // eslint-disable-next-line no-var
  var __waisSourceHandleDb: Promise<IDBDatabase | null> | undefined;
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
  if (globalThis.__waisSourceHandleDb) return globalThis.__waisSourceHandleDb;

  globalThis.__waisSourceHandleDb = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      globalThis.__waisSourceHandleDb = undefined;
      resolve(null);
      return;
    }
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'source' });
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => {
      globalThis.__waisSourceHandleDb = undefined;
      resolve(null);
    };
    req.onblocked = (): void => {
      globalThis.__waisSourceHandleDb = undefined;
      resolve(null);
    };
  });
  return globalThis.__waisSourceHandleDb;
}

/** 事务完成封装(best-effort) */
function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => resolve();
    tx.onabort = (): void => resolve();
  });
}

/** 内存降级缓存(source → handle) */
const memoryCache = new Map<string, FileSystemDirectoryHandle>();

/** 保存来源授权 handle,返回是否持久化成功 */
export async function saveSourceHandle(
  source: string,
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  memoryCache.set(source, handle);
  const db = await openDB();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ source, handle });
    await waitTx(tx);
    return true;
  } catch {
    return false;
  }
}

/** 恢复来源授权 handle(无授权返回 null) */
export async function loadSourceHandle(
  source: string,
): Promise<FileSystemDirectoryHandle | null> {
  const cached = memoryCache.get(source);
  if (cached) return cached;
  const db = await openDB();
  if (!db) return null;
  return new Promise<FileSystemDirectoryHandle | null>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(source);
    req.onsuccess = (): void => {
      const record = req.result as
        | { source: string; handle: FileSystemDirectoryHandle }
        | undefined;
      if (record?.handle) memoryCache.set(source, record.handle);
      resolve(record?.handle ?? null);
    };
    req.onerror = (): void => resolve(null);
  });
}

/** 查询来源是否已有当前会话或持久化的目录授权。 */
export async function hasSourceHandle(source: string): Promise<boolean> {
  return (await loadSourceHandle(source)) !== null;
}
