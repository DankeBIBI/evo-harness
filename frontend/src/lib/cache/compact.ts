/**
 * 上下文压缩规划(lib/cache/compact)
 * - 滑动窗口: 超出窗口比例时,对可压缩段做摘要,尾部 verbatim 保留
 * - Token 估算统一走 @/lib/tokenEstimate(全仓单一实现)
 */

import { estimateTokens } from '@/lib/tokenEstimate';

/** 压缩默认值 */
export const DEFAULT_COMPACT_RATIO = 0.8;
export const DEFAULT_COMPACT_FORCE_RATIO = 0.9;
export const DEFAULT_COMPACT_TARGET = 0.5;
export const DEFAULT_TAIL_TOKENS = 16384;
export const MIN_RECENT_KEEP = 2;
export const MIN_COMPACT_MESSAGES = 2;
export const COMPACT_ECONOMICS_THRESHOLD = 400;
/** 摘要改写后预计保留的 token 比例(估算净节省时扣除摘要自身开销) */
export const SUMMARY_KEEP_RATIO = 0.3;

/** 压缩所需的最小消息结构(与 models.Message 解耦) */
export interface CacheMessage {
  content: string;
  role: string;
}

/** 压缩计划 */
export interface CompactPlan {
  /** 待压缩消息段(不含 system 与 verbatim tail) */
  compactable: CacheMessage[];
  /** verbatim 保留的尾部消息 */
  tail: CacheMessage[];
  /** 预计节省的 token 数 */
  estimatedSavedTokens: number;
  /** 是否应执行压缩 */
  shouldCompact: boolean;
  /** 跳过/触发原因 */
  reason: string;
}

/** planCompaction 可选项 */
export interface PlanCompactionOptions {
  /** 触发比例(占窗口) */
  ratio?: number;
  /** 压缩后目标比例 */
  targetRatio?: number;
  /** 尾部 verbatim 预算(token) */
  tailTokens?: number;
  /** 最小节省 token 才值得压缩 */
  minSavedTokens?: number;
  /** 强制压缩(跳过阈值与经济性检查) */
  force?: boolean;
}

/** 规划压缩方案(messages 首位应为 system,windowTokens 为模型 max context) */
export function planCompaction(
  messages: CacheMessage[],
  windowTokens: number,
  options: PlanCompactionOptions = {},
): CompactPlan {
  const {
    ratio = DEFAULT_COMPACT_RATIO,
    targetRatio = DEFAULT_COMPACT_TARGET,
    tailTokens = DEFAULT_TAIL_TOKENS,
    minSavedTokens = 0,
    force = false,
  } = options;
  if (messages.length < MIN_COMPACT_MESSAGES) {
    return { compactable: [], tail: messages, estimatedSavedTokens: 0, shouldCompact: false, reason: 'too_few_messages' };
  }

  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (totalTokens <= 0) {
    return { compactable: [], tail: messages, estimatedSavedTokens: 0, shouldCompact: false, reason: 'empty' };
  }

  const triggerThreshold = Math.floor(windowTokens * ratio);
  if (!force && totalTokens <= triggerThreshold) {
    return { compactable: [], tail: messages, estimatedSavedTokens: 0, shouldCompact: false, reason: 'below_threshold' };
  }

  // 尾部 verbatim 保留(最后 N 条消息,预算 tailTokens)
  const tail: CacheMessage[] = [];
  let tailUsed = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const t = estimateTokens(m.content);
    if (tailUsed + t > tailTokens && tail.length >= MIN_RECENT_KEEP) break;
    tail.unshift(m);
    tailUsed += t;
  }

  // 工具配对守卫:tail 首条若是 tool 结果,向前扩展直到包含其 assistant(tool_calls) 父消息,
  // 避免 assistant/tool 被拆进压缩段与 tail 两侧产出协议非法序列(正确性优先于 tail 预算)
  let start = messages.length - tail.length;
  if (messages[start]?.role === 'tool') {
    while (start > 0 && messages[start].role === 'tool') start--;
    if (start > 0 && messages[start].role === 'assistant') start--;
    const pairedTail = messages.slice(start);
    tail.length = 0;
    tail.push(...pairedTail);
    tailUsed = pairedTail.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  }

  // 压缩段从索引 1 起(system 是缓存前缀核心,摘要改写会破坏前缀稳定性)
  const compactable = messages.slice(1, start);
  const compactableTokens = compactable.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );

  // 无可压缩段:tail 吞掉了除 system 外全部消息,不能报"压缩 0 条还省了 N token"
  if (compactable.length === 0 || compactableTokens <= 0) {
    return {
      compactable: [],
      tail,
      estimatedSavedTokens: 0,
      shouldCompact: false,
      reason: 'nothing_to_compact',
    };
  }

  const targetTokens = Math.floor(windowTokens * targetRatio);

  // tail 本身已超压缩目标,数学上无法达成目标,拒绝出计划
  if (!force && tailUsed > targetTokens) {
    return {
      compactable,
      tail,
      estimatedSavedTokens: 0,
      shouldCompact: false,
      reason: 'tail_exceeds_target',
    };
  }

  // 净节省按可压缩段 × (1 - 摘要保留比) 估算,扣除摘要自身 token 开销
  const estimatedSaved = Math.max(
    0,
    Math.floor(compactableTokens * (1 - SUMMARY_KEEP_RATIO)),
  );

  if (!force && estimatedSaved < Math.max(minSavedTokens, COMPACT_ECONOMICS_THRESHOLD)) {
    return { compactable, tail, estimatedSavedTokens: estimatedSaved, shouldCompact: false, reason: 'below_economics' };
  }

  return { compactable, tail, estimatedSavedTokens: estimatedSaved, shouldCompact: true, reason: 'ok' };
}
