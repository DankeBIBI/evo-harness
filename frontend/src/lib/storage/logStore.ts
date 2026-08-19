/**
 * 前端日志存储(基于 IndexedDB)
 *
 * 用途:替代原本 Go 后端的 LogService,让日志可以纯前端持久化
 * 失败策略:所有写入失败静默 —— 日志是 best-effort,绝不能阻塞 UI
 *   - SSR 环境(无 window/indexedDB)
 *   - Safari 私密浏览模式 / Firefox 隐私窗口 / 浏览器禁用 IndexedDB
 *   - 配额超限
 *
 * 入口:
 *   - nowTimestamp():返回毫秒时间戳,供调用方打 entry.timestamp 时使用
 *   - write(entry):单条写入(内部 microtask 批量化,与 writeBatch 共用事务)
 *   - writeBatch(entries):批量写入(同事务,失败整体 swallow)
 */

const DB_NAME = 'wails-logs';
const DB_VERSION = 1;
const STORE_NAME = 'logs';
const INDEX_TIMESTAMP = 'byTimestamp';
const INDEX_SCOPE = 'byScope';

/** 跨 HMR 共享 dbPromise 句柄(模块级 const 在 HMR 时被重置,会导致多连接) */
declare global {
  // eslint-disable-next-line no-var
  var __waisLogDbPromise: Promise<IDBDatabase | null> | undefined;
}

export type LogLevel = 'debug' | 'error' | 'info' | 'warn';

/** 日志条目(写入 IndexedDB 的 record) */
export interface LogEntry {
  level: LogLevel;
  message: string;
  scope: string;
  /** 毫秒时间戳,由 nowTimestamp() 产生 */
  timestamp: number;
}

/** 当前毫秒时间戳 */
export function nowTimestamp(): number {
  return Date.now();
}

/** 当前环境是否支持 IndexedDB(SSR / 禁用 都返回 false) */
function isIDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
  } catch {
    // 极少数 sandboxed iframe 抛 SecurityError
    return false;
  }
}

/**
 * 惰性打开 IndexedDB,缓存到 globalThis 防止 HMR 多连接
 *
 * 降级策略:
 *   - isIDBAvailable() 为 false → 恒不可用,直接 resolve(null) 且不缓存
 *   - indexedDB.open 同步抛错 / onerror / onblocked → resolve(null)
 *     且清空缓存,允许下一次调用重试(用户授权后、polyfill 延迟注入等场景)
 */
function openDB(): Promise<IDBDatabase | null> {
  if (!isIDBAvailable()) return Promise.resolve(null);
  if (globalThis.__waisLogDbPromise) return globalThis.__waisLogDbPromise;

  globalThis.__waisLogDbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      globalThis.__waisLogDbPromise = undefined;
      resolve(null);
      return;
    }
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          autoIncrement: true,
        });
        store.createIndex(INDEX_TIMESTAMP, 'timestamp', { unique: false });
        store.createIndex(INDEX_SCOPE, 'scope', { unique: false });
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => {
      globalThis.__waisLogDbPromise = undefined;
      resolve(null);
    };
    req.onblocked = (): void => {
      globalThis.__waisLogDbPromise = undefined;
      resolve(null);
    };
  });
  return globalThis.__waisLogDbPromise;
}

/** 吞掉 onerror/onabort,统一通过 oncomplete 判定结束(best-effort) */
function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => resolve();
    tx.onabort = (): void => resolve();
  });
}

/** 批量写入(同事务,失败静默) */
export async function writeBatch(entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const entry of entries) {
      store.add(entry);
    }
    await waitTx(tx);
  } catch {
    // 静默:日志落盘 best-effort(覆盖配额超限 / store 不存在 / 不可克隆)
  }
}

/**
 * 单条写入 —— 内部 microtask 合并到下一批,避免高频调用产生 N 个独立事务
 *
 * 语义:
 *   - 调用方立即拿到 fulfilled Promise.resolve(),真正的写入发生在下一个 microtask
 *   - 与原 `async write` 接口行为一致(Promise<void> + 永不 reject)
 *   - chatStore 的 `writeLog(...).catch(()=>{})` 不受影响,.catch 永不触发
 */
let pendingBatch: LogEntry[] = [];
let batchScheduled = false;

export function write(entry: LogEntry): Promise<void> {
  pendingBatch.push(entry);
  if (!batchScheduled) {
    batchScheduled = true;
    queueMicrotask(() => {
      const batch = pendingBatch;
      pendingBatch = [];
      batchScheduled = false;
      void writeBatch(batch);
    });
  }
  return Promise.resolve();
}
