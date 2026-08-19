/**
 * 上下文压缩规划(lib/cache/compact)
 * - 与 Go services/cache/compact.go 1:1 迁移
 * - 滑动窗口: 超出窗口比例时,对可压缩段做摘要,尾部 verbatim 保留
 */

/** 压缩默认值 */
export const DEFAULT_COMPACT_RATIO = 0.8;
export const DEFAULT_COMPACT_FORCE_RATIO = 0.9;
export const DEFAULT_COMPACT_TARGET = 0.5;
export const DEFAULT_TAIL_TOKENS = 16384;
export const MIN_RECENT_KEEP = 2;
export const MIN_COMPACT_MESSAGES = 2;
export const COMPACT_ECONOMICS_THRESHOLD = 400;
/** 中文 / token 估算系数(约 1.6 char/token) */
export const CHARS_PER_TOKEN = 1.6;
/** 英文 / token 估算系数(约 4 char/token) */
export const ENGLISH_CHARS_PER_TOKEN = 4.0;

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

/** 判断是否为中日韩字符(含汉字、平假名、片假名、韩文) */
function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af)
  );
}

/** 估算消息 token 数(中文按 1.6 char/token,非中文按 4 char/token) */
export function estimateTokens(content: string): number {
  if (!content) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of content) {
    if (isCJK(ch)) {
      cjk += 1;
    } else if (ch > '\x20') {
      other += 1;
    }
  }
  if (cjk === 0) return Math.floor(other / ENGLISH_CHARS_PER_TOKEN);
  if (other === 0) return Math.floor(cjk / CHARS_PER_TOKEN);
  return Math.floor(cjk / CHARS_PER_TOKEN) + Math.floor(other / ENGLISH_CHARS_PER_TOKEN);
}

/** 规划压缩方案(messages 首位应为 system,windowTokens 为模型 max context) */
export function planCompaction(
  messages: CacheMessage[],
  windowTokens: number,
  ratio = DEFAULT_COMPACT_RATIO,
  targetRatio = DEFAULT_COMPACT_TARGET,
  tailTokens = DEFAULT_TAIL_TOKENS,
  minSavedTokens = 0,
  force = false,
): CompactPlan {
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

  // 压缩段从索引 1 起(system 是缓存前缀核心,摘要改写会破坏前缀稳定性)
  const compactable = messages.slice(1, messages.length - tail.length);

  const targetTokens = Math.floor(windowTokens * targetRatio);
  const estimatedSaved = Math.max(0, totalTokens - targetTokens);

  if (!force && estimatedSaved < Math.max(minSavedTokens, COMPACT_ECONOMICS_THRESHOLD)) {
    return { compactable, tail, estimatedSavedTokens: estimatedSaved, shouldCompact: false, reason: 'below_economics' };
  }

  return { compactable, tail, estimatedSavedTokens: estimatedSaved, shouldCompact: true, reason: 'ok' };
}
