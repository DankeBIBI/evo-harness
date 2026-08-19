/**
 * dev 模式日志工具
 * - 控制台彩色输出(DEV 模式带色彩),方便定位卡点
 * - 自动从 Error().stack 提取调用方位置(文件:行号)
 * - 异步写入 IndexedDB(原 Go LogService 已迁移到 lib/storage/logStore.ts)
 * - 防抖批量:高频日志先攒批,每 500ms 或攒满 20 条批量 flush
 *
 * @example
 * ```ts
 * import { devLog } from '@/lib/devLog';
 * devLog.i('chat:streaming', 'sendMessage start', { convId, input });
 * devLog.e('chat:streaming', 'executeToolCall failed', { call, error });
 * ```
 */

import { nowTimestamp, writeBatch } from './storage/logStore';

type Level = 'debug' | 'error' | 'info' | 'warn';

const STYLES: Record<Level, string> = {
  debug: 'color:#6b7280;font-weight:600',
  error: 'color:#ef4444;font-weight:700',
  info: 'color:#3b82f6;font-weight:600',
  warn: 'color:#f59e0b;font-weight:600',
};

const ICONS: Record<Level, string> = {
  debug: '🔍',
  error: '❌',
  info: 'ℹ️',
  warn: '⚠️',
};

const FLUSH_BATCH = 20;
const FLUSH_INTERVAL_MS = 500;

/** 待发送批(模块级单例,避免在 hot reload 下重置) */
const pendingLogs: Array<{
  level: Level;
  message: string;
  scope: string;
  source: string;
  timestamp: number;
}> = [];

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

/** 调度一次 flush(防抖) */
function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

/** 真正推送一批到 IndexedDB */
async function flush(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (isFlushing || pendingLogs.length === 0) return;
  isFlushing = true;

  // 取出当前批(避免后续 push 影响)
  const batch = pendingLogs.splice(0, pendingLogs.length);

  try {
    await writeBatch(
      batch.map((entry) => ({
        level: entry.level,
        message: entry.message,
        scope: entry.scope,
        timestamp: nowTimestamp(),
      })),
    );
  } catch {
    // 静默失败:IndexedDB 不可用时(隐私模式)不抛错
  } finally {
    isFlushing = false;
    // flush 期间又有新日志入队,继续排程
    if (pendingLogs.length > 0) scheduleFlush();
  }
}

/** 从 Error stack 中提取调用方位置(相对路径 + 行号) */
function pickLocation(): string {
  const stack = new Error().stack || '';
  // 按栈帧名过滤,跳过 devLog 内部帧(pickLocation/emit),兼容性优于固定 lines[3]
  for (const frame of stack.split('\n')) {
    if (
      frame.includes('devLog') ||
      frame.includes('pickLocation') ||
      frame.includes('emit')
    ) {
      continue;
    }
    // 匹配 "at fn (path:line:col)" 或 "at path:line:col"
    const m = frame.match(/\((.+?):\d+:\d+\)|at\s+(.+?):\d+:\d+/);
    const raw = m?.[1] || m?.[2] || '';
    if (!raw) continue;
    const norm = raw.replace(/\\/g, '/');
    const parts = norm.split('/');
    // 截取 src/ 后两段,避免控制台被绝对路径撑爆
    const idx = parts.lastIndexOf('src');
    const tail = idx >= 0 ? parts.slice(idx + 1) : parts;
    const loc = tail.slice(-2).join('/');
    if (loc) return loc;
  }
  return '?:?';
}

/** 把任意 args 序列化为单行字符串(便于落盘与 grep) */
function serializeArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function emit(level: Level, scope: string, args: unknown[]): void {
  const loc = pickLocation();
  const header = `${ICONS[level]} [${level.toUpperCase()}][${scope}] ${loc}`;
  const style = STYLES[level];

  // 1) 控制台彩色输出(始终保留,方便实时调试)
  if (level === 'debug') {
    console.log(`%c${header}`, style, ...args);
  } else {
    console[level](`%c${header}`, style, ...args);
  }

  // 2) 后端持久化(DEV/PROD 都启用 —— 关 DevTools 也能查日志)
  pendingLogs.push({
    level,
    message: serializeArgs(args),
    scope,
    source: loc,
    timestamp: Date.now(),
  });

  if (pendingLogs.length >= FLUSH_BATCH) {
    void flush();
  } else {
    scheduleFlush();
  }
}

/** dev 模式日志工具(短别名 d/i/w/e 减少打字量) */
export const devLog = {
  d: (scope: string, ...args: unknown[]): void => emit('debug', scope, args),
  e: (scope: string, ...args: unknown[]): void => emit('error', scope, args),
  i: (scope: string, ...args: unknown[]): void => emit('info', scope, args),
  w: (scope: string, ...args: unknown[]): void => emit('warn', scope, args),
};

/** 测试/卸载时强制 flush(防止最后一批日志丢失) */
export const flushDevLog = (): Promise<void> => flush();
