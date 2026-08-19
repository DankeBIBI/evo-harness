import { create } from 'zustand';
import { devLog } from '@/lib/devLog';
import type { DebugLog } from '@/types/debugLog';

/** 调试日志条目 — 类型唯一源在 @/types/debugLog,此处 re-export 兼容旧 import */
export type { DebugLog } from '@/types/debugLog';

/** 每会话内存最大保留条数(滚动窗口) */
const MAX_DEBUG_LOGS = 500;
/** localStorage 每会话最多持久化条数(控制体积,防 QuotaExceeded 静默失败→刷新后日志消失) */
const MAX_STORED_LOGS = 100;
/** localStorage 全局最多持久化条数(跨会话合计,多会话累积仍会超 5MB,必须全局 cap) */
const GLOBAL_MAX_STORED = 200;
/** localStorage 超限兜底:每会话只保留最近条数 */
const MIN_STORED_LOGS = 30;
/** rawData 顶层字符串字段截断长度 */
const MAX_STR_CHARS = 3_000;
/** history/messages 数组最多保留条数 */
const MAX_ARRAY_ITEMS = 10;
/** history/messages 单条 content 截断长度 */
const MAX_MSG_CHARS = 800;

const STORAGE_KEY = 'evo-harness:debugLogs';

interface DebugLogState {
  /** 按会话 ID 缓存的日志(仅当前会话,关闭后清空) */
  logsByConv: Record<string, DebugLog[]>;
  /** 追加一条日志(同时更新内存 + 持久化到 IndexedDB) */
  addLog: (conversationId: string, log: DebugLog) => void;

  /** 清空指定会话日志 */
  clearLogs: (conversationId: string) => void;
  /** 清空全部日志 */
  clearAll: () => void;
}

/** 截断字符串,超长保留头部 + 标注省略 */
const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}…[截断 ${s.length} 字符]` : s;

/** 递归裁剪 rawData(内存保留完整版,localStorage 只存裁剪版,控制体积防超限) */
const sanitizeRawData = (raw: unknown): unknown => {
  if (Array.isArray(raw)) {
    return raw.slice(-MAX_ARRAY_ITEMS).map((item) => {
      if (
        item &&
        typeof item === 'object' &&
        'content' in item &&
        typeof item.content === 'string'
      ) {
        return { ...item, content: truncate(item.content, MAX_MSG_CHARS) };
      }
      return item;
    });
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        out[k] = truncate(v, MAX_STR_CHARS);
      } else if (Array.isArray(v)) {
        out[k] = sanitizeRawData(v);
      } else if (v && typeof v === 'object') {
        out[k] = sanitizeRawData(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return raw;
};

/** 生成持久化精简快照(不修改内存 state,rawData 裁剪后落 localStorage) */
const buildStorageSnapshot = (
  logsByConv: Record<string, DebugLog[]>,
  keep: number,
): Record<string, DebugLog[]> => {
  const snapshot: Record<string, DebugLog[]> = {};
  for (const [convId, logs] of Object.entries(logsByConv)) {
    snapshot[convId] = logs.slice(-keep).map((log) =>
      log.rawData === undefined
        ? log
        : { ...log, rawData: sanitizeRawData(log.rawData) },
    );
  }
  return snapshot;
};

const loadLogs = (): Record<string, DebugLog[]> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/** 全局裁剪:跨会话合计最多保留 GLOBAL_MAX_STORED 条(按 time 近似排序保留最新) */
const capGlobally = (
  logsByConv: Record<string, DebugLog[]>,
): Record<string, DebugLog[]> => {
  const all: { convId: string; log: DebugLog; time: string }[] = [];
  for (const [convId, logs] of Object.entries(logsByConv)) {
    for (const log of logs) all.push({ convId, log, time: log.time });
  }
  all.sort((a, b) => (a.time < b.time ? -1 : 1));
  const kept = all.slice(-GLOBAL_MAX_STORED);
  const out: Record<string, DebugLog[]> = {};
  for (const { convId, log } of kept) {
    (out[convId] ??= []).push(log);
  }
  return out;
};

/** 持久化到 localStorage:先裁剪版 + 每会话最近 MAX_STORED_LOGS 条 + 全局 cap,超限降级,仍失败记录告警 */
const saveLogs = (logsByConv: Record<string, DebugLog[]>) => {
  if (typeof window === 'undefined') return;
  const slim = buildStorageSnapshot(logsByConv, MAX_STORED_LOGS);
  const total = Object.values(slim).reduce((n, logs) => n + logs.length, 0);
  const payload = total > GLOBAL_MAX_STORED ? capGlobally(slim) : slim;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return;
  } catch {
    // 首次失败(容量超限) → 降级:每会话只保留更少条数再试
  }
  try {
    const verySlim = buildStorageSnapshot(logsByConv, MIN_STORED_LOGS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(verySlim));
  } catch {
    // 仍然失败:记录告警。内存日志不受影响(本会话可见),仅刷新后丢失
    devLog.w(
      'debugLogStore',
      'localStorage 日志持久化失败(容量超限),刷新后日志将丢失',
    );
  }
};

export const useDebugLogStore = create<DebugLogState>((set) => ({
  logsByConv: loadLogs(),
  addLog: (conversationId, log) => {
    set((state) => {
      const existing = state.logsByConv[conversationId] ?? [];
      // 滚动窗口:保留最近 MAX_DEBUG_LOGS 条
      const next = [...existing, log].slice(-MAX_DEBUG_LOGS);
      const logsByConv = { ...state.logsByConv, [conversationId]: next };
      return { logsByConv };
    });
    if (log.type === 'request') {
      // request 日志(发起/续传源数据)数量少且是核心诉求 → 立即同步持久化,保证刷新不丢
      saveLogs(useDebugLogStore.getState().logsByConv);
    } else {
      // response/log 流式日志数量大 → 节流合并写(性能),刷新前由 pagehide/beforeunload 兜底 flush
      scheduleSave();
    }
  },
  clearLogs: (conversationId) =>
    set((state) => {
      const { [conversationId]: _, ...rest } = state.logsByConv;
      saveLogs(rest);
      return { logsByConv: rest };
    }),
  clearAll: () => {
    saveLogs({});
    set({ logsByConv: {} });
  },
}));

/** 持久化节流:高频 addLog(流式响应大量日志)时合并写入,避免每次全量序列化卡 UI */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveDirty = false;
const scheduleSave = () => {
  saveDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!saveDirty) return;
    saveDirty = false;
    saveLogs(useDebugLogStore.getState().logsByConv);
  }, 300);
};

// 刷新/关闭页面前同步兜底 flush:取消挂起的节流 timer,立即把最后一批日志写入 localStorage
// (localStorage.setItem 是同步的,刷新前一定会执行完,杜绝 300ms 节流导致的最后一批丢失)
if (typeof window !== 'undefined') {
  const flushNow = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (saveDirty) {
      saveDirty = false;
      saveLogs(useDebugLogStore.getState().logsByConv);
    }
  };
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', flushNow);
}
