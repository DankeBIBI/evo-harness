/**
 * 工具结果缓存(lib/cache/toolResult)
 * - 新增: 按 (toolName, paramsHash, fileMtime) 缓存工具执行结果
 * - 用途: AI 在同一 turn 多次调 ReadFile 同路径 → 第二次直接返回缓存不读 FS
 * - 失效: mtime 变化(文件改动) / TTL 过期 / 主动清空
 */

interface CacheEntry<T> {
  /** 缓存内容 */
  value: T;
  /** 存入时间戳(ms) */
  createdAt: number;
  /** 文件 mtime(可选项,变化即失效) */
  fileMtime?: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** 简化 sha1(用于 paramsHash,非密码学场景) */
export function sha1(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** 工具结果缓存 key */
export interface ToolResultCacheKey {
  /** 工具名(PascalCase) */
  tool: string;
  /** 参数哈希(如 sha1(path)) */
  paramsHash: string;
  /** 文件 mtime(可选,变化即失效) */
  fileMtime?: number;
}

function buildKey(k: ToolResultCacheKey): string {
  return `${k.tool}:${k.paramsHash}:${k.fileMtime ?? ''}`;
}

/** 带缓存的工具执行(命中返回缓存,未命中执行 fn 并存入) */
export async function cachedExecute<T>(
  key: ToolResultCacheKey,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cacheKey = buildKey(key);
  const hit = store.get(cacheKey) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (hit && now - hit.createdAt < ttl) {
    // mtime 变化 → 视为失效
    if (hit.fileMtime === undefined || key.fileMtime === undefined || hit.fileMtime === key.fileMtime) {
      return hit.value;
    }
  }

  const value = await fn();
  store.set(cacheKey, { value, createdAt: now, fileMtime: key.fileMtime });
  return value;
}

/** 清空全部工具结果缓存(用户点"重置缓存"时调用) */
export function clearToolResultCache(): void {
  store.clear();
}

/** 当前缓存条目数(诊断用) */
export function toolResultCacheSize(): number {
  return store.size;
}
