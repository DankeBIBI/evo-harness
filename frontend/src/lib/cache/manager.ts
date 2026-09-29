/**
 * 缓存能力统一管理器(lib/cache/manager)
 * - 聚合 Tracker / ComposeState / PrefixShape / Compaction 四个子系统
 */

import { planCompaction, type CacheMessage, type CompactPlan } from './compact';
import { ComposeState } from './compose';
import {
  captureShape as captureShapeFn,
  compareShape as compareShapeFn,
  type CacheDiagnostics,
  type PrefixShape,
  type ToolSchemaLike,
} from './prefixShape';
import { CacheTracker, type Usage } from './tracker';

/** 缓存配置 */
export interface CacheConfig {
  /** 是否启用缓存 */
  enabled: boolean;
  /** 是否启用压缩 */
  compactEnabled: boolean;
  /** 压缩触发比例 */
  compactRatio: number;
  /** 压缩后目标比例 */
  compactTarget: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  compactEnabled: true,
  compactRatio: 0.8,
  compactTarget: 0.5,
};

/** 缓存管理器(每个会话对应一个实例) */
export class CacheManager {
  private readonly cfg: CacheConfig;
  private readonly tracker: CacheTracker;
  private readonly composeState: ComposeState;
  private rewriteVer = 0;

  constructor(cfg?: CacheConfig) {
    this.cfg = cfg ?? DEFAULT_CACHE_CONFIG;
    this.tracker = new CacheTracker();
    this.composeState = new ComposeState();
  }

  config(): CacheConfig {
    return this.cfg;
  }

  enabled(): boolean {
    return this.cfg.enabled;
  }

  compactEnabled(): boolean {
    return this.cfg.enabled && this.cfg.compactEnabled;
  }

  trackerRef(): CacheTracker {
    return this.tracker;
  }

  composeStateRef(): ComposeState {
    return this.composeState;
  }

  rewriteVersion(): number {
    return this.rewriteVer;
  }

  /** 压缩成功后递增重写版本号,强制下次请求重建前缀缓存 */
  incrementRewrite(): void {
    this.rewriteVer += 1;
  }

  /** 采集当前会话前缀快照(绑定当前 rewriteVersion) */
  captureShape(systemPrompt: string, toolSchemas: ToolSchemaLike[]): Promise<PrefixShape> {
    return captureShapeFn(systemPrompt, toolSchemas, this.rewriteVer);
  }

  /** 对比两轮前缀快照 */
  compareShape(prev: PrefixShape, cur: PrefixShape): Promise<CacheDiagnostics> {
    return compareShapeFn(prev, cur);
  }

  /** 记录一次请求的 token 用量 */
  recordUsage(usage: Usage): void {
    this.tracker.record(usage);
  }

  /** 规划压缩方案(应用 Manager 配置的压缩规则) */
  planCompaction(messages: CacheMessage[], windowTokens: number, force = false): CompactPlan {
    return planCompaction(messages, windowTokens, {
      ratio: this.cfg.compactRatio,
      targetRatio: this.cfg.compactTarget,
      force,
    });
  }
}
