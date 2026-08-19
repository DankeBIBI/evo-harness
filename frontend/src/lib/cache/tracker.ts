/**
 * 缓存命中指标追踪器(lib/cache/tracker)
 * - 与 Go services/cache/tracker.go 1:1 迁移
 * - 单会话累计计数: 缓存命中 / 未命中 / 输出 / turn 数
 */

/** 单次请求的 token 用量 */
export interface Usage {
  /** 新增输入 token(不含缓存命中与写入) */
  inputTokens: number;
  /** 输出 token */
  outputTokens: number;
  /** 缓存命中读取 token */
  cacheReadTokens: number;
  /** 首次写入缓存 token(仅主动缓存有值) */
  cacheCreationTokens: number;
}

/** 会话级缓存统计快照 */
export interface SessionCacheStats {
  /** 累计缓存命中 token */
  cacheHitTokens: number;
  /** 累计缓存未命中 token */
  cacheMissTokens: number;
  /** 累计输出 token */
  outputTokens: number;
  /** 累计 turn 数 */
  turnCount: number;
  /** 聚合命中率(0-1) */
  hitRate: number;
  /** 最近一次 turn 命中率(0-1) */
  lastTurnHitRate: number;
}

/** 单轮命中率: cacheRead / (cacheRead + input);总输入为 0 返回 0 */
export function usageHitRate(u: Usage): number {
  const total = u.cacheReadTokens + u.inputTokens;
  return total === 0 ? 0 : u.cacheReadTokens / total;
}

/** 缓存追踪器(纯内存计数,可多实例) */
export class CacheTracker {
  private cacheHit = 0;
  private cacheMiss = 0;
  private output = 0;
  private turnCount = 0;
  private lastUsage: Usage | null = null;

  /** 记录一次请求的 token 用量 */
  record(usage: Usage): void {
    this.cacheHit += usage.cacheReadTokens;
    // miss = 新增输入 + 主动写入
    this.cacheMiss += usage.inputTokens + usage.cacheCreationTokens;
    this.output += usage.outputTokens;
    this.turnCount += 1;
    this.lastUsage = { ...usage };
  }

  /** 返回全会话聚合统计快照(副本,外部修改不影响内部) */
  session(): SessionCacheStats {
    const total = this.cacheHit + this.cacheMiss;
    const rate = total > 0 ? this.cacheHit / total : 0;
    return {
      cacheHitTokens: this.cacheHit,
      cacheMissTokens: this.cacheMiss,
      outputTokens: this.output,
      turnCount: this.turnCount,
      hitRate: rate,
      lastTurnHitRate: this.lastUsage ? usageHitRate(this.lastUsage) : 0,
    };
  }

  /** 重置所有累计计数(新建会话时用,compaction 禁止调用) */
  reset(): void {
    this.cacheHit = 0;
    this.cacheMiss = 0;
    this.output = 0;
    this.turnCount = 0;
    this.lastUsage = null;
  }
}
