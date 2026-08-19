/**
 * 流式会话管理模块
 *
 * 把 toolCallRunner + continuationManager 合并为一个 hook 调用：
 *   - 内部持有 eventHandler / processToolCalls / sendContinuation
 *   - 主 hook 在 sendMessage 之前调用 startSession() 拿到 eventHandler
 *   - 通过 ref 串接 eventHandler ↔ sendContinuation ↔ processToolCalls，规避循环引用
 *
 * 关键设计：
 *   - 每次 sendMessage 调用 startSession() 返回新的 eventHandler（绑定到本轮的 convId / assistantMsgId / continuationVersion）
 *   - sendContinuation 引用通过 sendContinuationRef.current 间接获取——避免闭包陷阱
 *   - continuationRoundsRef / originalRequestRef 在本模块内部持有（per-session 状态）
 *   - eventHandler 不需要被外部依赖，主 hook 只用 startSession 返回的 handler 注册 EventsOn
 */

import type { ToolCall, ToolCategory, ToolResult } from '@/lib/tools/base';
import { StreamChat as streamChatAPI } from '@/lib/hostServices/ChatService';
import { EventsOff, EventsOn } from '@/lib/hostServices/eventBus';
import { useCallback, useRef } from 'react';

import { devLog } from '@/lib/devLog';
import { formatErrorFeedback } from '../../lib/chatErrors';
import { useChatStore, type ProgressStage } from '@/stores/chatStore';
import { usePlanStore, type Plan } from '@/stores/planStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { executeToolCall, toolRegistry, toolNameAliases } from '@/lib/tools/registry';
import type { StreamingContext } from './streamingContext';

const LOG = 'chat:streaming';

/**
 * PR-1 (2026-07-10): 把进度写入 chatStore.conversations[id].progress
 * - 顶层 helper,避免内联调用 updateConversation 重复样板
 * - PR-1 review fix (2026-07-10): 改为 setState 直写,避开 updateConversation 触发的 SQLite 持久化路径
 *   (progress 是 ephemeral UI 态,saveConversationToDbAsync payload 不含 progress,白白写盘)
 * - ProgressBar 的订阅 useChatStore((s) => s.conversations.find(...).progress) 仍会触发,UI 同步不受影响
 */
function writeProgress(
  convId: string,
  stage: ProgressStage,
  percent: number,
  message: string,
): void {
  if (!convId) return;
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  const updatedAt = new Date().toISOString();
  useChatStore.setState((state) => {
    const idx = state.conversations.findIndex((c) => c.id === convId);
    if (idx === -1) return state;
    const next = state.conversations.slice();
    next[idx] = { ...next[idx], progress: { message, percent: clampedPercent, stage, updatedAt } };
    return { conversations: next };
  });
}

/**
 * PR-1 (2026-07-10): 解析 <plan> XML 块 → 结构化 Plan
 *
 * 支持三种格式 (按匹配优先级):
 *   1. <plan><summary>...</summary><steps><step>...</step></steps></plan>
 *   2. <plan>...markdown 文本...</plan>
 *   3. 失败 → null,调用方走兜底
 *
 * 注意:返回的 Plan 用于 planStore.submit,PlanStageCard 据此渲染。
 */
function parsePlanXml(text: string): Plan | null {
  const m = text.match(/<plan>([\s\S]*?)<\/plan>/i);
  if (!m) return null;
  const inner = m[1].trim();

  // 模式 1: 结构化 XML（完整 stage 落 assistant）,
  const structured = inner.match(/<summary>([\s\S]*?)<\/summary>\s*<steps>([\s\S]*?)<\/steps>/i);
  if (structured) {
    const summary = structured[1].trim();
    const stepsXml = structured[2];
    const steps: Plan['steps'] = [];
    const stepRegex = /<step(?:\s+id="([^"]+)")?\s*>([\s\S]*?)<\/step>/gi;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = stepRegex.exec(stepsXml)) !== null) {
      const stepBody = match[2].trim();
      const titleMatch = stepBody.match(/<title>([\s\S]*?)<\/title>/i);
      const actionMatch = stepBody.match(/<action>([\s\S]*?)<\/action>/i);
      const riskMatch = stepBody.match(/<risk>(low|med|high)<\/risk>/i);
      steps.push({
        id: match[1] ?? `step-${idx++}`,
        title: titleMatch ? titleMatch[1].trim() : stepBody.split('\n')[0].slice(0, 80),
        action: actionMatch ? actionMatch[1].trim() : stepBody,
        risk: riskMatch ? (riskMatch[1] as 'low' | 'med' | 'high') : undefined,
      });
    }
    if (steps.length === 0) return null;
    return { rawPlan: m[0], steps, summary };
  }

  // 模式 2: 退路 — 把 inner 当 markdown,按行拆成 steps
  const lines = inner
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-\*\d\.]+/, '').trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return {
    rawPlan: m[0],
    steps: lines.map((line, i) => ({
      action: line,
      id: `step-${i}`,
      title: line.slice(0, 60),
    })),
    summary: lines[0],
  };
}

/** 方案 A 兜底: 单条非 file 结果超过此上限则整条省略,防单条撑爆上下文 */
const SINGLE_RESULT_HARD_CAP = 10_000;

/**
 * P0-2: 工具结果累积自动 compact
 *
 * 续传触发前若 accumulatedResults 总字符数超过阈值,自动按 category 智能压缩。
 *
 * 2026-08-19 方案 A: 移除单条截断,改为"跨结果省略"策略
 *   - 旧策略: 单条 > headChars 截断 → AI 拿到半截内容误以为完整
 *     → 判断"信息不足" → 重查 → 结果又被截断 → 死循环
 *   - 新策略: 预算内每条结果完整保留;超预算的整条省略 + [结果已省略] 明确标记
 *     → AI 要么拿到完整数据,要么明确知道"这条没给",可换策略而非盲目重查
 *
 * 策略(category-aware, LLM-free):
 *   - file 类(读文件/grep 等):永远保留完整内容,绝不压缩,不计预算
 *     → 原因:结构化代码 / 文件内容,主体丢失 AI 瞎猜
 *   - 单条 > SINGLE_RESULT_HARD_CAP 的非 file 结果:整条省略(防撑爆上下文)
 *   - 其余:预算(threshold)内完整保留;预算耗尽后省略最早的结果
 *
 * ⚠️ 预算按"最新结果优先"分配(倒序),省略的是 AI 已消费过的早期结果。
 *
 * 输入: 原生 ToolResult[] (processToolCalls push 时已填 category,resolveToolCategory 兜底 'file')
 * 输出: 纯文本片段数组(供 buildContinuationMessage 拼接,不再依赖 XML 包装)
 */
function compactAccumulatedResults(
  results: ToolResult[],
  threshold: number,
): {
  compacted: string[];
  /** 被省略的条数(meta/plan 类,不含豁免的 file 类) */
  truncatedCount: number;
  /** 豁免跳过的 file 类条数 */
  skippedFileCount: number;
  originalChars: number;
  compactedChars: number;
} {
  const stringify = (r: ToolResult) =>
    r.error ? `[工具错误]\n${r.error}` : (r.output ?? '');

  const originalChars = results.reduce((sum, r) => sum + stringify(r).length, 0);
  if (threshold <= 0 || originalChars <= threshold) {
    const cloned = results.map(stringify);
    return {
      compacted: cloned,
      originalChars,
      compactedChars: originalChars,
      truncatedCount: 0,
      skippedFileCount: 0,
    };
  }

  // 预算优先分配给最新结果(倒序分配),省略"最早"的已消费结果
  const keep = new Set<number>();
  let budget = threshold;
  let skippedFileCount = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    const text = stringify(r);
    if (r.category === 'file') {
      // file 类永远完整保留,不计字符预算,不计 truncatedCount
      keep.add(i);
      skippedFileCount++;
      continue;
    }
    // 兜底: 单条超大结果整条省略(超大概率是异常/超大返回),防撑爆上下文
    if (text.length > SINGLE_RESULT_HARD_CAP) continue;
    if (budget >= text.length) {
      keep.add(i);
      budget -= text.length;
    }
  }

  // 正序输出,保持 AI 阅读顺序(省略的替换为标记)
  const compacted: string[] = [];
  let compactedChars = 0;
  let truncatedCount = 0;
  for (let i = 0; i < results.length; i++) {
    const text = stringify(results[i]);
    if (keep.has(i)) {
      compacted.push(text);
      compactedChars += text.length;
    } else {
      const marker = `[结果已省略,原 ${text.length} 字符]`;
      compacted.push(marker);
      compactedChars += marker.length;
      truncatedCount++;
    }
  }
  return { compacted, originalChars, compactedChars, truncatedCount, skippedFileCount };
}

/** 通过 call.name → toolRegistry 查询工具 category;找不到时**保守豁免**(fallback 'file')
 *
 * 为什么不回退 'meta'?
 *   - 未知/老/动态注册的 tool 不应默认走压缩路径(可能误伤)
 *   - 2026-07-04 反例: 老代码 push 的 ToolResult 没 category 时,若走 'meta' →
 *     仍然被截到 500 字符,等同于"未知即压缩",持续触发"对话不准"
 *   - 'file' 是豁免分支,天然安全;新工具注册到 registry 后会被自然分类
 */
function resolveToolCategory(callName: string): ToolCategory {
  const canonical = toolNameAliases[callName] ?? callName;
  const tool = toolRegistry.get(canonical);
  if (!tool) {
    devLog.d(LOG, `resolveToolCategory: unknown tool "${callName}", skip compact by default`);
    return 'file'; // 兜底 = 豁免
  }
  return tool.category;
}

/**
 * P3: 原生 tool_call 累积器 → ToolCall[]
 * 跨 chunk 累积, 任何 call.finished=false 视为不完整（参数 JSON 可能不合法）
 * 返回 calls / originalIds / incompleteFlags 三元组供 processToolCalls 复用
 */
function nativeToolCallsToProcessInputs(buf: Map<number, { anchor?: number; args: string; finished: boolean; id: string; name: string }>): {
  calls: ToolCall[];
  incompleteFlags: boolean[];
  originalIds: string[];
} {
  if (buf.size === 0) {
    return { calls: [], incompleteFlags: [], originalIds: [] };
  }
  const calls: ToolCall[] = [];
  const originalIds: string[] = [];
  const incompleteFlags: boolean[] = [];
  // 按 index 升序推入, 保证 processToolCalls 顺序与模型声明顺序一致
  const sortedIdx = Array.from(buf.keys()).sort((a, b) => a - b);
  for (const idx of sortedIdx) {
    const entry = buf.get(idx);
    if (!entry) continue;
    let parsed: Record<string, unknown> = {};
    let incomplete = !entry.finished;
    if (entry.finished) {
      try {
        const raw = entry.args.trim();
        if (raw) parsed = JSON.parse(raw);
      } catch {
        // finished=true 但 JSON 不合法（上游 provider 偶发）→ 仍标 incomplete
        incomplete = true;
      }
    }
    const call: ToolCall = {
      id: entry.id || `native-${idx}`,
      input: parsed,
      name: entry.name,
    };
    if (typeof entry.anchor === 'number') {
      (call as ToolCall & { _anchor?: number })._anchor = entry.anchor;
    }
    calls.push(call);
    originalIds.push(entry.id || `native-${idx}`);
    incompleteFlags.push(incomplete);
  }
  return { calls, incompleteFlags, originalIds };
}

export interface StreamingSessionCallbacks {
  onAgentExecutionAppend?: (record: any) => void;
  onAgentExecutionBatch?: (records: any[]) => void;
  onDebugLog?: (
    content: string,
    type: 'log' | 'request' | 'response',
    rawData?: unknown,
    source?: 'child-dispatch' | 'continuation' | 'user',
  ) => void;
  onFirstChunk?: () => void;
  onStreamComplete?: (ret: { convId: string; newStats: any }) => void;
  onToolCallUpdated?: (update: any) => void;
  onToolCallsDetected?: (calls: any, ret: { convId: string; msgId: string }) => void;
}

/** startSession 入参：每次 sendMessage 唯一 */
export interface StartSessionArgs {
  assistantMsgId: string;
  chatRequest: StreamChatRequestLike;
  convId: string;
  eventName: string;
  inputTokens: number;
  nextInput: string;
  /** 纯用户输入(不含 history),续传时用于替代 chatRequest.message 避免 history 重复 */
  userInputOnly: string;
  routed: boolean;
}

export interface StreamingSessionReturn {
  /** 启动一轮会话，返回绑定了本轮 context 的 eventHandler */
  startSession: (args: StartSessionArgs) => (data: any) => void;
  /** 卸载/重置时清空 triggerContinuationRef 与 originalRequest */
  cleanup: () => void;
}

export function useStreamingSession(ctx: StreamingContext, cb: StreamingSessionCallbacks): StreamingSessionReturn {
  // 从 ctx 解构别名 — 保持函数体内变量名不变，仅改变源
  const accumulatedResultsRef = ctx.accumulatedResultsRef;
  const continuationVersionRef = ctx.continuationVersionRef;
  const currentConvIdRef = ctx.currentConvIdRef;
  const currentEventNameRef = ctx.currentEventNameRef;
  const executedToolCallIdsRef = ctx.executedToolCallIdsRef;
  const fullContentRef = ctx.fullContentRef;
  const originalAiContentRef = ctx.originalAiContentRef;
  const isMountedRef = ctx.isMountedRef;
  const isPausedRef = ctx.isPausedRef;
  const pendingToolResultsRef = ctx.pendingToolResultsRef;
  const scheduleStreamingUpdate = ctx.scheduleStreamingUpdate;
  const setStreamingContent = ctx.setStreamingContent;
  const setStreamingRawContent = ctx.setStreamingRawContent;
  const setTokenStats = ctx.setTokenStats;
  const stopStreaming = ctx.stopStreaming;
  const streamingContentRef = ctx.streamingContentRef;
  const streamingIdRef = ctx.streamingIdRef;
  const triggerContinuationRef = ctx.sendContinuationRef;
  const updateMessage = ctx.updateMessage;
  const onFeedback = ctx.onFeedback;
  const onAgentNodesFinalize = ctx.onAgentNodesFinalize;
  // session callbacks
  const { onAgentExecutionAppend, onAgentExecutionBatch, onDebugLog, onFirstChunk,
          onStreamComplete, onToolCallUpdated, onToolCallsDetected } = cb;

  // === per-session 状态（在 startSession 内赋值，cleanup 时清空） ===
  // P1-2: 残缺 tool_call 签名集合。模型反复重发同一截断 call(常见于上下文撑爆/输出截断)
  // 时,首次记录签名,之后同签名直接静默 — 避免 "已跳过 N 个残缺 tool_call" 日志轰炸 UI
  // 签名策略: name + JSON.stringify(input).slice(0, 80) → 同工具 + 同截断前缀视为同一 call
  const incompleteCallSignaturesRef = useRef<Set<string>>(new Set());
  // P3: 原生 tool_call 累积器 (跨 chunk 累积, 按 index 合并)
  // 后端 type='tool_call' 事件逐个到, 这里累积到 finished=true 才调 processToolCalls
  // 避免前端再走 "从 content 正则扣 XML" 路径
  type NativeCallBuf = {
    /** 2026-07-07: 后端传来的 anchor, 表示 toolCall 出现时累计 content 字符数 */
    anchor?: number;
    id: string;
    name: string;
    args: string;
    finished: boolean;
  };
  const nativeToolCallsRef = useRef<Map<number, NativeCallBuf>>(new Map());
  /** 已执行的工具调用记录 ({id, name, input})，续传时用于构造 assistant tool_calls 消息 */
  const executedToolCallsRef = useRef<ToolCall[]>([]);
  /** 流式内容字符累积计数器，每 N 字符触发一次 store 写入（防止 crash 丢数据） */
  const flushCharsAccum = useRef(0);
  /** 方案 C (2026-08-19): 上次续传时 originalAiContentRef 的长度,用于增量提取 AI 思考
   *  修复: previousAssistantText 在 startSession 时快照 originalAiContentRef.current,
   *       但此时 originalAiContentRef 刚被 sendMessage 清空为 "",导致续传时 assistant
   *       消息 content 为空 → 模型看不到 AI 上轮的思考(含已确认的路径) → 反复重新搜索 */
  const lastAssistantTextLenRef = useRef(0);
  /** streamingRawContent rAF 节流：避免高频 chunk 直接触发 setState → WebView2 进程崩溃 */
  const streamingRawRafIdRef = useRef<number | null>(null);
  const originalRequestRef = useRef<{
    assistantMsgId: string;
    chatRequest: StreamChatRequestLike;
    convId: string;
    eventName: string;
    /** 纯用户输入(不含 history),续传时用于替代 chatRequest.message 避免 history 重复 */
    userInputOnly: string;
    /** sendMessage 时是否经 orchestrator 路由——续传时需走"以入口视角综合子 Agent 结果"分支 */
    routed: boolean;
    /** AI 上一轮原话(纯文本,不含 tool_result 注入 + sanitize 替换),续传时回传避免"AI 丢失自己思考" */
    previousAssistantText: string;
  } | null>(null);
  const continuationRoundsRef = useRef(0);
  /** 2026-08-19: 每轮续传快照(完整 transcript 按轮组织,每轮只出现一次)
   *  修复旧设计"增量文本 + 全量 tool_calls/results"导致的重复 tool_calls + 缺早期 assistant 文本 */
  const continuationTranscriptRef = useRef<
    Array<{
      assistantText: string;
      toolCalls: ToolCall[];
      resultCount: number;
    }>
  >([]);
  /** 已快照的 toolCalls / results 数量(用于计算每轮新增) */
  const snapshottedToolCallCountRef = useRef(0);
  const snapshottedResultCountRef = useRef(0);
  /** sendContinuation 的间接引用：handleStop 把它置 null 来取消所有待执行的延续 */
  // 当前 session 的快照版版本号（startSession 时记录）
  const currentVersionRef = useRef(0);
  /** PR-1 (2026-07-10): 当前 session 的 progress 阶段 + percent,跨 phase 事件保持 */
  const currentProgressStageRef = useRef<ProgressStage | null>(null);
  const currentProgressPercentRef = useRef<number | null>(null);

  // === 内部函数：执行工具调用 + 累积 result XML + 触发 continuation ===
  const processToolCalls = useCallback(
    (
      calls: ToolCall[],
      originalIds: string[],
      incompleteFlags: boolean[],
      stage: 'done' | 'stream',
      ctx: { assistantMsgId: string; currentVersion: number },
    ) => {
      const newToolCalls: ToolCall[] = [];
      const newOriginalIds: string[] = [];
      const skippedIncompleteNames: string[] = [];
      let suppressedDuplicateIncomplete = 0;
      for (let i = 0; i < calls.length; i++) {
        // 残缺 tool_call（参数 JSON 截断/语法错）→ 直接跳过，不要回传到流式 toast、不要执行
        // 原因：拿残缺参数（如 {"path":"C:/Users/JY"}）去调 ListDir 必失败，
        //       但模型可能在下轮还想要这个工具；过早报"工具执行错误"反而打断 continuation 节奏
        if (incompleteFlags[i]) {
          const call = calls[i];
          // 签名 = name + 参数前 80 字符(截断/不截断都含这个前缀,天然去重)
          // 避免模型反复重发同一残缺 call 时 UI 日志被 `[tool] 已跳过 8 个残缺 tool_call` 刷屏
          const signature = `${call.name}|${JSON.stringify(call.input).slice(0, 80)}`;
          if (incompleteCallSignaturesRef.current.has(signature)) {
            suppressedDuplicateIncomplete++;
            continue;
          }
          incompleteCallSignaturesRef.current.add(signature);
          skippedIncompleteNames.push(call.name);
          continue;
        }
        let originalId: string;
        if (i >= originalIds.length) {
          devLog.e(LOG, 'native tool_call length mismatch', {
            callsLen: calls.length,
            originalIdsLen: originalIds.length,
            stage,
          });
          originalId = calls[i].id;
        } else {
          originalId = originalIds[i];
        }
        if (useSettingsStore.getState().enableToolDedup && executedToolCallIdsRef.current.has(originalId)) continue;
        newToolCalls.push(calls[i]);
        newOriginalIds.push(originalId);
      }
      if (skippedIncompleteNames.length > 0) {
        devLog.w(LOG, `${stage}-phase: 已跳过 ${skippedIncompleteNames.length} 个残缺 tool_call`, {
          names: skippedIncompleteNames,
        });
        onDebugLog?.(
          `[tool] 已跳过 ${skippedIncompleteNames.length} 个残缺 tool_call（参数 JSON 不完整）: ${skippedIncompleteNames.join(', ')}`,
          'log',
        );
      } else if (suppressedDuplicateIncomplete > 0) {
        // 模型重复发同一残缺 call → 静默(不输出 toast/不输出 debug log)
        // 避免日志刷屏。devLog 仍留底,排查时打开 devLog.i 即可
        devLog.d(LOG, `${stage}-phase: 抑制 ${suppressedDuplicateIncomplete} 个重复残缺 tool_call（已记过签名）`);
      }

      if (
        calls.length > 0 &&
        newToolCalls.length === 0 &&
        skippedIncompleteNames.length === 0 &&
        suppressedDuplicateIncomplete === 0
      ) {
        onDebugLog?.(`[tool] 已跳过 ${calls.length} 个重复工具调用`, 'log');
      }
      if (newToolCalls.length > 0) {
        devLog.i(LOG, `${stage}-phase tool calls detected`, {
          count: newToolCalls.length,
          names: newToolCalls.map((c) => c.name),
        });
        pendingToolResultsRef.current += newToolCalls.length;
        onToolCallsDetected?.(newToolCalls, {
          convId: currentConvIdRef.current ?? '',
          msgId: streamingIdRef.current ?? '',
        });
        const toolNames = newToolCalls.map((c) => c.name).join(', ');
        // onFeedback?.(`🔧 执行工具: ${toolNames}`);
        // P19: 在工具执行前检查续传轮数,避免浪费一轮工具执行
        const maxRoundsSnapshot = useSettingsStore.getState().maxContinuationRounds;
        if (continuationRoundsRef.current >= maxRoundsSnapshot) {
          devLog.w(LOG, `${stage}-phase: continuation rounds already at max, skip tool execution`, {
            rounds: continuationRoundsRef.current,
            maxRounds: maxRoundsSnapshot,
          });
          onFeedback?.(`⚠️ 工具调用已达最大轮数 ${maxRoundsSnapshot},跳过执行`);
          // 回退计数 + 不检查 pendingToolResultsRef===0（已达最大轮数,不应触发续传）
          pendingToolResultsRef.current -= newToolCalls.length;
          return;
        }
        newToolCalls.forEach(async (call, i) => {
          // P13: 版本过期检测前置 — 在执行前检查,避免耗时工具结果污染下一轮
          if (continuationVersionRef.current !== ctx.currentVersion) {
            devLog.d(LOG, `tool execute skipped (version expired): ${call.name}`);
            // 递减计数器,避免 pendingToolResultsRef 泄漏导致流式无法 finalize
            pendingToolResultsRef.current--;
            return;
          }
          devLog.i(LOG, `tool execute start (${stage}-phase)`, {
            name: call.name,
            id: call.id,
            input: call.input,
          });
          try {
            const result = await executeToolCall(call);
            // 2026-07-04: 给 result 附带 category,让 compactAccumulatedResults 智能跳过 file 类
            accumulatedResultsRef.current.push({
              ...result,
              category: resolveToolCategory(call.name),
            });
            // 记录已执行的 tool call, 用于续传时构造标准 assistant(tool_calls) 消息
            executedToolCallsRef.current.push({ id: call.id, name: call.name, input: call.input });
            // 2026-07-04 P1-1 终态: 工具结果不再回灌到 fullContent (content 是"纯 AI 文本")
            // 结果通过 onToolCallUpdated 写入 msg.toolCalls[i].result 强类型字段
            // 用户在 ChatMessages 看 toolCall 展开面板,不再在流式文本里看到 "[工具 X 执行结果]"
            devLog.i(LOG, `tool execute done (${stage}-phase)`, {
              name: call.name,
              id: call.id,
            });
            // onFeedback?.(`✅ ${call.name} 完成`);
            onToolCallUpdated?.({
              call: {
                error: undefined,
                id: call.id,
                input: call.input as Record<string, unknown>,
                name: call.name,
                status: 'success',
              },
              convId: currentConvIdRef.current ?? '',
              msgId: streamingIdRef.current ?? '',
            });
          } catch (error) {
            devLog.e(LOG, `tool execute failed (${stage}-phase)`, {
              name: call.name,
              id: call.id,
              error: String(error),
            });
            const errMsg = error instanceof Error ? error.message : String(error);
            const failedResult: ToolResult = { error: errMsg, id: call.id, output: '', category: resolveToolCategory(call.name) };
            accumulatedResultsRef.current.push(failedResult);
            // 错误也不回灌 content,只走 onToolCallUpdated
            onToolCallUpdated?.({
              call: {
                error: errMsg,
                id: call.id,
                input: call.input as Record<string, unknown>,
                name: call.name,
                status: 'error',
              },
              convId: currentConvIdRef.current ?? '',
              msgId: streamingIdRef.current ?? '',
            });
          } finally {
            if (useSettingsStore.getState().enableToolDedup) {
              executedToolCallIdsRef.current.add(newOriginalIds[i]);
            }
            // 关键修复：版本过期仍需递减计数，避免泄漏导致 streamingId 永远不清理
            pendingToolResultsRef.current--;
            if (continuationVersionRef.current !== ctx.currentVersion) return;
            // 工具结果到齐即触发延续
            if (pendingToolResultsRef.current === 0) {
              devLog.i(LOG, `all ${stage}-phase tools finished → trigger continuation`);
              triggerContinuationRef.current?.();
            }
          }
        });
      }
    },
    [
      accumulatedResultsRef,
      continuationVersionRef,
      currentConvIdRef,
      executedToolCallIdsRef,
      fullContentRef,
      onDebugLog,
      onFeedback,
      onToolCallUpdated,
      onToolCallsDetected,
      pendingToolResultsRef,
      scheduleStreamingUpdate,
      streamingContentRef,
      streamingIdRef,
    ],
  );

  /** 发起延续请求 */
  const sendContinuation = useCallback(async () => {
    // P3: 防御性清空 native tool_call 累积器, 避免上轮残留污染本轮续传
    // 显式契约: sendContinuation 前 nativeToolCallsRef 必为空
    //  (done 阶段已 clear, 这里是双保险)
    nativeToolCallsRef.current.clear();
    // 注意: 不要在这里清 executedToolCallsRef — 本轮续传必须用它构造 assistant(tool_calls) 消息
    // 清空时机: startSession 入口(下方已做),这里只重置字符冲刷计数器
    flushCharsAccum.current = 0;
    // 如果已被 handleStop 清空或版本过期，直接返回
    if (!triggerContinuationRef.current || continuationVersionRef.current !== currentVersionRef.current) return;

    // PR-1 (2026-07-10): 扫描本轮 assistant 输出是否含 <plan>...</plan>
    // 如果有 → 写入 planStore → 等待用户 Approve/Refine/Reject
    // 30s 超时自动 Approve,防止 AI 永远阻塞
    // 方案 C (2026-08-19): 与 assistantText 一致,动态读取 originalAiContentRef.current
    // 修复: previousAssistantText 是 startSession 时的空快照,<plan> 块永远检测不到
    const prevAssistantText = originalAiContentRef.current;
    // 2026-08-19: plan decision 不再 push 进 accumulatedResultsRef
    // (会产生 id 不在 assistant toolCalls 里的孤儿 tool 消息 → OpenAI/Anthropic 400)
    // 改为局部变量,随后追加到 assistant 消息文本(同一 assistant 消息内承载)
    let planDecisionNote = '';
    if (/<plan>[\s\S]*?<\/plan>/i.test(prevAssistantText)) {
      const planParse = parsePlanXml(prevAssistantText);
      if (planParse) {
        try {
          devLog.i(LOG, 'plan detected, awaiting user decision', {
            steps: planParse.steps.length,
            msgId: originalRequestRef.current?.assistantMsgId,
          });
          usePlanStore.getState().submit(planParse);
          const decision = await usePlanStore.getState().waitForDecision(30_000);
          planDecisionNote = decision.action === 'approved'
            ? '[plan_decision: approved]'
            : decision.action === 'refined'
              ? `[plan_decision: refined]: ${decision.feedback}`
              : '[plan_decision: rejected]';
          if (decision.action === 'rejected') {
            // 用户拒绝,直接结束流式
            onFeedback?.('🚫 已拒绝 plan,本轮结束');
            return;
          }
        } catch (e) {
          devLog.w(LOG, 'plan decision await failed, fallback approve', { err: String(e) });
        }
      }
    }

    if (continuationRoundsRef.current >= useSettingsStore.getState().maxContinuationRounds) {
      devLog.w(LOG, 'continuation rounds exceeded, forcing stop', {
        rounds: continuationRoundsRef.current,
      });
      onFeedback?.(`⚠️ 工具调用已达最大轮数 ${useSettingsStore.getState().maxContinuationRounds},自动停止`);
      return;
    }
    const currentRound = (continuationRoundsRef.current += 1);

    devLog.i(LOG, 'sendContinuation start', {
      hasChildResults: accumulatedResultsRef.current.length,
      round: currentRound,
    });

    const original = originalRequestRef.current;
    if (!original) {
      devLog.w(LOG, 'sendContinuation: originalRequestRef is null, skip');
      return;
    }

    const { assistantMsgId, convId, eventName: _eventName, userInputOnly, chatRequest } = original;
    const contEventName = `chat-cont-${convId}-${assistantMsgId}-${Date.now()}`;

    if (currentEventNameRef.current) {
      EventsOff(currentEventNameRef.current);
    }
    currentEventNameRef.current = contEventName;

    // P1-2: 续传时清空残缺 call 签名 — continuation 是新 sub-session,模型可能在续传里
    // 重新尝试同一工具(此时参数可能已完整),不应该被上轮的 dedup 状态拦截
    incompleteCallSignaturesRef.current.clear();
    // P17: 自动 compact — 压缩工具结果正文,作用于 continuationMessages 的 tool 消息
    // 2026-08-19: 结果正文改由 tool 消息承载(标准协议),user 消息不再拼接
    const settings = useSettingsStore.getState();
    const totalChars = accumulatedResultsRef.current.reduce((sum, r) =>
      sum + (r.error ? r.error.length : (r.output?.length ?? 0)), 0);
    const effectiveThreshold = settings.enableCompactAccumulated
      ? settings.compactAccumulatedChars
      : Math.min(8000, settings.compactAccumulatedChars);
    const shouldCompact = settings.enableCompactAccumulated || totalChars > effectiveThreshold;
    // compacted 与 accumulatedResultsRef 一一对应(省略项替换为标记)
    const compactResult = shouldCompact
      ? compactAccumulatedResults(accumulatedResultsRef.current, effectiveThreshold)
      : null;
    if (compactResult && compactResult.truncatedCount > 0) {
      devLog.i(LOG, 'auto-compact applied', {
        originalChars: compactResult.originalChars,
        compactedChars: compactResult.compactedChars,
        truncatedCount: compactResult.truncatedCount,
        skippedFileCount: compactResult.skippedFileCount,
      });
      onFeedback?.(
        `📦 工具结果累积 ${compactResult.originalChars} 字符已压缩至 ${compactResult.compactedChars} 字符(${compactResult.truncatedCount} 个非文件类被省略,${compactResult.skippedFileCount > 0 ? `${compactResult.skippedFileCount} 个文件类按原样保留` : '无文件类条目'})`,
      );
    } else if (compactResult && compactResult.skippedFileCount > 0) {
      devLog.d(LOG, 'compact enabled but all results are file-class, no trunc applied', {
        skippedFileCount: compactResult.skippedFileCount,
      });
    }

    // 2026-07-08: 标准续传 — 构造 assistant(tool_calls) + tool result 消息
    // 走 JSON 到 Node 服务(hostServices), 无需 Go models class; 字段即契约
    const continuationMessages: Array<{
      id: string;
      role: string;
      content: string;
      toolCalls?: Array<{ id: string; toolName: string; input: Record<string, unknown>; status: string }>;
      toolCallId?: string;
      toolResults?: Array<{ toolCallId: string; result: string }>;
      createdAt?: string;
    }> = [];

    // assistant 消息: 附带上轮 AI 的思考文本 + tool_calls
    // 方案 C (2026-08-19): 动态增量提取 AI 思考,按轮快照组织成完整 transcript
    // 修复: previousAssistantText 在 startSession 时快照 originalAiContentRef.current,
    //       但此时 originalAiContentRef 刚被 sendMessage 清空为 "",导致续传时 assistant
    //       消息 content 为空 → 模型看不到 AI 上轮的思考(含已确认的路径) → 反复重新搜索
    // 增量提取: 每轮只取新增的 AI 输出,快照进 continuationTranscriptRef,完整 transcript 按轮拼接
    const fullAssistantText = originalAiContentRef.current;
    // plan decision 以文本追加到本条 assistant(不进 tool 消息,避免孤儿 tool_call_id)
    const assistantText =
      fullAssistantText.slice(lastAssistantTextLenRef.current) +
      (planDecisionNote ? `\n${planDecisionNote}` : '');
    lastAssistantTextLenRef.current = fullAssistantText.length;

    // 2026-08-19: 按轮快照本轮新增的 (assistant 文本, toolCalls, results)
    // 完整 transcript 语义:每轮续传携带所有轮次快照,每轮只出现一次
    // 修复旧设计"增量文本 + 全量 tool_calls/results"导致的:重复 tool_calls + 缺早期 assistant 文本
    const newToolCalls = executedToolCallsRef.current.slice(
      snapshottedToolCallCountRef.current,
    );
    const newResultCount =
      accumulatedResultsRef.current.length - snapshottedResultCountRef.current;
    continuationTranscriptRef.current.push({
      assistantText,
      toolCalls: newToolCalls,
      resultCount: newResultCount,
    });
    snapshottedToolCallCountRef.current = executedToolCallsRef.current.length;
    snapshottedResultCountRef.current = accumulatedResultsRef.current.length;

    // 完整 transcript:按轮组织,每轮 assistant(tool_calls) + 该轮 tool 结果
    let roundIdx = 0;
    let resultIdx = 0;
    for (const round of continuationTranscriptRef.current) {
      if (round.assistantText || round.toolCalls.length > 0) {
        continuationMessages.push({
          id: `${assistantMsgId}-assistant-continuation-${roundIdx}`,
          role: 'assistant',
          content: round.assistantText,
          toolCalls:
            round.toolCalls.length > 0
              ? round.toolCalls.map((tc) => ({
                  id: tc.id,
                  toolName: tc.name,
                  input: tc.input,
                  status: 'success',
                }))
              : undefined,
          createdAt: new Date().toISOString(),
        });
      }
      // 该轮的 tool 结果(结果正文用 compact 后的文本,控制续传 token 体积)
      for (let k = 0; k < round.resultCount; k++) {
        const r = accumulatedResultsRef.current[resultIdx];
        resultIdx++;
        const rawContent = r.error ? `[工具错误]\n${r.error}` : (r.output ?? '');
        const resultContent =
          (compactResult
            ? compactResult.compacted[resultIdx - 1] ?? rawContent
            : rawContent) || '[空结果]';
        continuationMessages.push({
          id: `tool-result-${r.id}`,
          role: 'tool',
          content: resultContent,
          toolCallId: r.id,
          toolResults: [
            {
              toolCallId: r.id,
              result: resultContent,
            },
          ],
          createdAt: new Date().toISOString(),
        });
      }
      roundIdx++;
    }

    // 2026-08-19: 丢弃旧的"[续传] 指令 / 入口综合文本"注入设计
    // user message 用纯用户原始内容 — 上下文已由 history + continuationMessages(assistant tool_calls + tool 结果) 完整承载
    // 对齐 OpenAI / Anthropic 官方协议:user 消息只承载用户输入,工具结果必须走 tool 消息
    const nextMessage = original.userInputOnly ?? original.chatRequest.message ?? '';

    const contRequest: StreamChatRequestLike = {
      ...chatRequest,
      eventName: contEventName,
      message: nextMessage,
      continuationMessages,
    };

    // 注册延续事件的处理器（复用主 handler）
    // 注意：这里的事件 handler 通过 processToolCalls 的闭包引用来执行工具
    // 由于 handler 在 startSession 内定义，此处注册需拿到那个 handler
    // 解决：handlerRef 在 startSession 闭包内同步更新
    if (activeHandlerRef.current) {
      EventsOn(contEventName, activeHandlerRef.current);
    }

    // 2026-08-19: 续传也要写 type="request" 日志,source="continuation"
    // 之前所有 type=request 都来自用户主动发起,续传被静默忽略
    // 让"统一日志 → 续传"tab 能看到每次 AI 工具调用后的二次请求元数据
    const contSkillsCount =
      (contRequest as unknown as { skills?: unknown[] }).skills?.length ?? 0;
    const contMessagePreview = contRequest.message?.slice(0, 40) ?? "";
    const contRounds = currentRound;
    onDebugLog?.(
      `R${contRounds} · ${contRequest.agentName ?? contRequest.agentId} · ${contRequest.modelId ?? "?"} · ${contMessagePreview}${contRequest.message && contRequest.message.length > 40 ? "…" : ""} · contMsgs=${continuationMessages.length} · skills=${contSkillsCount}`,
      "request",
      contRequest,
      "continuation",
    );

    try {
      devLog.i(LOG, 'streamChatAPI(cont) call', { contEventName });
      await streamChatAPI(contRequest);
    } catch (error) {
      if (!isMountedRef.current) return;
      devLog.e(LOG, 'streamChatAPI(cont) failed', { error: String(error) });
      const errMsg = error instanceof Error ? error.message : String(error);
      const errorContent = fullContentRef.current
        ? `${fullContentRef.current}\n\n错误: ${errMsg}`
        : `错误: ${errMsg}`;
      fullContentRef.current = errorContent;
      streamingContentRef.current = errorContent;
      updateMessage(convId, assistantMsgId, { content: errorContent });
      onAgentNodesFinalize?.(true);
      stopStreaming();
    }
  }, [
    accumulatedResultsRef,
    continuationRoundsRef,
    continuationVersionRef,
    currentConvIdRef,
    currentEventNameRef,
    fullContentRef,
    isMountedRef,
    onAgentNodesFinalize,
    onDebugLog,
    onFeedback,
    originalAiContentRef,
    originalRequestRef,
    stopStreaming,
    streamingContentRef,
    updateMessage,
  ]);

  // 内部 handler 引用（让 sendContinuation 能注册同一个 handler）
  const activeHandlerRef = useRef<((data: any) => void) | null>(null);

  /** 主入口：启动一轮会话，返回 eventHandler */
  const startSession = useCallback(
    (args: StartSessionArgs): ((data: any) => void) => {
      // 写入 per-session 状态
      originalRequestRef.current = {
        assistantMsgId: args.assistantMsgId,
        chatRequest: args.chatRequest,
        convId: args.convId,
        eventName: args.eventName,
        previousAssistantText: originalAiContentRef.current,
        routed: args.routed,
        userInputOnly: args.userInputOnly,
      };
      continuationRoundsRef.current = 0;
      continuationTranscriptRef.current = [];
      snapshottedToolCallCountRef.current = 0;
      snapshottedResultCountRef.current = 0;
      currentVersionRef.current = continuationVersionRef.current;
      // P1-2: 新一轮清空残缺 call 签名集合(否则上轮 dedup 状态会污染新轮)
      incompleteCallSignaturesRef.current.clear();
      // P3: 新一轮清空原生 tool_call 累积器
      nativeToolCallsRef.current.clear();
      // 清空已执行 tool call 记录, 新 session 从头累积
      executedToolCallsRef.current = [];
      // 重置字符冲刷计数器
      flushCharsAccum.current = 0;
      // 方案 C: 重置增量提取游标(originalAiContentRef 已被 sendMessage 清空)
      lastAssistantTextLenRef.current = 0;
      // 同步 triggerContinuationRef 给 processToolCalls 使用
      triggerContinuationRef.current = sendContinuation;
      // PR-1 (2026-07-10): 启动时立刻写入 reading 阶段,顶部 ProgressBar 立刻亮起来
      writeProgress(args.convId, 'reading', 5, '读取上下文...');
      currentProgressStageRef.current = 'reading';
      currentProgressPercentRef.current = 5;

      const { assistantMsgId, convId, inputTokens, nextInput: _nextInput } = args;

      /**
       * 流式 raw content rAF 节流:合并高频 chunk 到每帧 1 次 setStreamingRawContent
       * 与 streamingController 的 scheduleStreamingUpdate 同模式,避免 WebView2 进程崩溃
       */
      const scheduleStreamingRawUpdate = (next: string) => {
        if (streamingRawRafIdRef.current !== null) return;
        streamingRawRafIdRef.current = requestAnimationFrame(() => {
          streamingRawRafIdRef.current = null;
          if (!isMountedRef.current) return;
          setStreamingRawContent(next);
        });
      };

      const eventHandler = (data: {
        content: string;
        done: boolean;
        error?: boolean;
        type?: string;
        childResults?: any[];
        result?: any;
        cacheRead?: number;
        cacheCreation?: number;
        hitRate?: number;
        costCny?: number;
        // P2-1: dispatch 阶段化事件字段
        phase?: string;
        mode?: string;
        total?: number;
        index?: number;
        name?: string;
        agentId?: string;
        success?: boolean;
        duration?: number;
        planLength?: number;
        successCount?: number;
        // P2-2: 错误码
        code?: number;
        // P3: 原生 tool_call 事件字段 (后端 sink.OnToolCall 平级事件)
        args?: string;
        finished?: boolean;
        toolId?: string;
        // 2026-07-07: 后端携带的 anchor, 用于精确穿插到 content 中
        precedingContentLen?: number;
      }) => {
        if (!isMountedRef.current) return;
        if (data.done) {
          devLog.i(LOG, 'stream done', { totalLen: fullContentRef.current.length });
          // PR-1 (2026-07-10): 流完成 → 进度到 done(没有 dispatch_phase 的情况也兜底)
          if (currentConvIdRef.current && currentProgressStageRef.current !== 'done') {
            currentProgressStageRef.current = 'done';
            currentProgressPercentRef.current = 100;
            writeProgress(currentConvIdRef.current, 'done', 100, '完成');
          }
        }

        onDebugLog?.(
          data.content || (data.done ? '[done]' : '[empty]'),
          'response',
          // P3: 原样透传后端事件 payload, "原" tab 能看到完整 data 字段
          // (type=tool_call 时含 name/args/toolId/index/finished 等)
          data,
        );

        // 首次收到非 done 事件(实际内容到达) → 通知主 hook 关掉响应超时
        // 必须在每条 event 入口都检查(不能用一次性 flag,否则会因 done 事件重复触发)
        if (!data.done) onFirstChunk?.();

        // --- 缓存命中事件 ---
        if (data.type === 'cache_usage' && (data.cacheRead || data.cacheCreation)) {
          const read = data.cacheRead ?? 0;
          const create = data.cacheCreation ?? 0;
          const cost = data.costCny ?? 0;
          setTokenStats((prev: any) => {
            const newRead = prev.cacheReadTokens + read;
            const newCreate = prev.cacheCreationTokens + create;
            const totalInput = newRead + prev.inputTokens;
            const rate = totalInput > 0 ? newRead / totalInput : 0;
            return {
              ...prev,
              cacheReadTokens: newRead,
              cacheCreationTokens: newCreate,
              lastTurnCacheRead: read,
              hitRate: rate,
              totalCostCny: prev.totalCostCny + cost,
            };
          });
          return;
        }

        // P2-1: dispatch 阶段化进度事件
        // 后端 OnDispatchPhase 在每个关键节点发 type="dispatch_phase" + phase 字段
        // 前端识别后用 onFeedback 显示阶段提示(不修改 orchestration graph,因为 child_result 已足够细)
        if (data.type === 'dispatch_phase' && typeof data.phase === 'string') {
          onDebugLog?.(`[dispatch_phase] ${data.phase}`, 'response');
          // PR-1 (2026-07-10): dispatch 阶段化 → 同步写入 chatStore.progress,顶部 ProgressBar 据此渲染
          // 注:每个 phase 用 updateConversation 单独更新,不聚合写,避免连续事件被合并
          const convId = currentConvIdRef.current;
          if (convId) {
            const progressMessage = (() => {
              switch (data.phase) {
                case 'dispatch_start':
                  return `派遣开始 (${data.total ?? 0} 子代理, ${data.mode ?? ''})`;
                case 'plan_start':
                  return '父代理规划中...';
                case 'plan_done':
                  return `父代理规划完成 (${data.planLength ?? 0} 字符)`;
                case 'child_start':
                  return `[${(data.index ?? 0) + 1}/${data.total ?? '?'}] ${data.name ?? ''} 执行中`;
                case 'child_done':
                  return `${data.name ?? ''} ${data.success ? '完成' : '失败'} (${data.duration ?? 0}ms)`;
                case 'synth_start':
                  return '综合子代理结果...';
                case 'synth_done':
                  return '综合完成';
                case 'dispatch_done':
                  return `派遣全部完成 (成功 ${data.successCount ?? 0}/${data.total ?? 0})`;
                default:
                  return String(data.phase);
              }
            })();
            const stageName: ProgressStage = (() => {
              if (data.phase === 'plan_start' || data.phase === 'plan_done') return 'planning';
              if (data.phase === 'dispatch_start' || data.phase === 'child_start' || data.phase === 'child_done') return 'executing';
              if (data.phase === 'synth_start' || data.phase === 'synth_done') return 'reviewing';
              if (data.phase === 'dispatch_done') return 'done';
              return currentProgressStageRef.current ?? 'executing';
            })();
            currentProgressStageRef.current = stageName;
            // 每个阶段自带大概进度(子代理用 index/total)
            const approxPercent = (() => {
              if (data.phase === 'dispatch_start') return 50;
              if (data.phase === 'plan_start') return 40;
              if (data.phase === 'plan_done') return 60;
              if (data.phase === 'child_start' && typeof data.index === 'number' && typeof data.total === 'number') {
                return 60 + Math.round(((data.index + 1) / data.total) * 25);
              }
              // PR-1 review fix (2026-07-10): 后端 child_done payload 没带 total,
              // 放松条件 → 仅依赖 index,percent 沿用上一帧 child_start 的值 + 微推进
              // (避免进度条"卡死"在子代理完成瞬间)
              if (data.phase === 'child_done') {
                const base = currentProgressPercentRef.current ?? 75;
                return Math.min(87, base + 1);
              }
              if (data.phase === 'synth_start') return 88;
              if (data.phase === 'synth_done') return 95;
              if (data.phase === 'dispatch_done') return 100;
              return currentProgressPercentRef.current ?? 50;
            })();
            currentProgressPercentRef.current = approxPercent;
            writeProgress(convId, stageName, approxPercent, progressMessage);
          }
          switch (data.phase) {
            case 'dispatch_start':
              onFeedback?.(`🚀 派遣开始 (${data.total ?? 0} 个子代理, ${data.mode ?? ''})`);
              break;
            case 'plan_start':
              onFeedback?.('📋 父代理规划中...');
              break;
            case 'plan_done':
              onFeedback?.(`📋 父代理规划完成 (${data.planLength ?? 0} 字符)`);
              break;
            case 'child_start':
              onFeedback?.(`🔧 [${(data.index ?? 0) + 1}/${data.total ?? '?'}] ${data.name ?? ''} 执行中`);
              break;
            case 'child_done':
              onFeedback?.(
                data.success
                  ? `✅ ${data.name ?? ''} 完成 (${data.duration ?? 0}ms)`
                  : `❌ ${data.name ?? ''} 失败 (${data.duration ?? 0}ms)`,
              );
              break;
            case 'synth_start':
              onFeedback?.('🧩 综合子代理结果...');
              break;
            case 'synth_done':
              onFeedback?.('🧩 综合完成');
              break;
            case 'dispatch_done':
              onFeedback?.(
                `🏁 派遣全部完成 (成功 ${data.successCount ?? 0}/${data.total ?? 0})`,
              );
              break;
          }
          return;
        }

        // P3: 原生 tool_call 事件 (后端 type='tool_call' 平级事件, 不再走 content+XML)
        // 跨 chunk 累积, finished=true 时调 processToolCalls (走 stream 阶段)
        if (data.type === 'tool_call' && typeof data.name === 'string') {
          const idx = typeof data.index === 'number' ? data.index : nativeToolCallsRef.current.size;
          const id = typeof data.toolId === 'string' ? data.toolId : `native-${idx}`;
          const args = typeof data.args === 'string' ? data.args : '';
          const finished = data.finished === true;
          const anchor =
            typeof data.precedingContentLen === 'number' ? data.precedingContentLen : undefined;
          const prev = nativeToolCallsRef.current.get(idx);
          // P3 修正: finished=true 是终态, args 必是完整累积值 → 覆盖 (不拼接, 避免双累积)
          //         finished=false 是中间态, args 是 delta 片段 → 拼接
          // 旧实现: 不管什么状态都拼接 → finish_reason 哨推累积值时前端再拼一次 → JSON 非法
          const mergedArgs = finished ? args : prev ? prev.args + args : args;
          // finished 一旦 true 不能回退 (防上轮 finished 残留覆盖本轮新增片段)
          const mergedFinished = finished || prev?.finished === true;
          // anchor 同样以最后一次的为准(中间 delta 可能没有 anchor, finished 那次必有)
          const mergedAnchor = anchor ?? prev?.anchor;
          nativeToolCallsRef.current.set(idx, {
            anchor: mergedAnchor,
            args: mergedArgs,
            finished: mergedFinished,
            id: id || prev?.id || `native-${idx}`,
            name: data.name || prev?.name || '',
          });
          // 仅在「首次出现」/「finished 翻转」打日志
          // 后端流式 tool_call 每个 delta 片段都会触发本 case, 无去重会刷屏
          // (复盘 2026-07-18: 22 秒 ≈ 600 条同模板日志, 均来自此处)
          const isFirstSeen = prev == null;
          const finishedFlipped = prev != null && prev.finished !== finished;
          if (isFirstSeen || finishedFlipped) {
            onDebugLog?.(`[tool_call] index=${idx} name=${data.name} finished=${finished} anchor=${mergedAnchor ?? '-'}`, 'response');
          }
          // finished=true 时立即调度 processToolCalls (stream 阶段, 不等 done)
          if (finished) {
            const { calls, incompleteFlags, originalIds } = nativeToolCallsToProcessInputs(
              nativeToolCallsRef.current,
            );
            // 只调度刚 finished 的, 避免重复执行
            processToolCalls(
              calls,
              originalIds,
              incompleteFlags,
              'stream',
              { assistantMsgId, currentVersion: currentVersionRef.current },
            );
            // 已交给 processToolCalls 的 call 清出累积器, 防 done 时重复
            // Map.delete 在 forEach 中是 spec-safe 的, 省一次 Array.from 临时数组
            nativeToolCallsRef.current.forEach((v, k) => {
              if (v.finished) nativeToolCallsRef.current.delete(k);
            });
          }
          return;
        }

        // --- 嵌套派遣事件 ---
        if (typeof data.type === 'string' && data.type === 'child_result' && data.result) {
          onDebugLog?.(`[child_result] ${data.result.agentId} L${data.result.depth ?? 0}`, 'response');
          const r = data.result as {
            agentId: string;
            depth?: number;
            duration?: number;
            endTime?: number;
            error?: string;
            parentId?: string;
            result?: string;
            startTime?: number;
            status?: string;
          };
          const endTs = r.endTime ?? Date.now();
          const startTs = r.startTime ?? endTs;
          onAgentExecutionAppend?.({
            id: `${assistantMsgId}-${r.parentId ?? 'root'}-${r.agentId}`,
            childId: r.agentId,
            msgId: assistantMsgId,
            parentId: r.parentId,
            startTime: startTs,
            endTime: endTs,
            duration: r.duration ?? endTs - startTs,
            result: r.error ?? r.result ?? '',
            status: r.status === 'error' || r.error ? 'error' : 'success',
          });
          return;
        }
        if (data.done && Array.isArray(data.childResults) && data.childResults.length > 0) {
          onDebugLog?.(`[dispatch] 收到 ${data.childResults.length} 个子代理结果`, 'response');
          const now = Date.now();
          onAgentExecutionBatch?.(
            data.childResults.map((r: any, idx: number) => {
              const endTs = r.endTime ?? now;
              const startTs = r.startTime ?? endTs;
              const childId = r.agentId ?? r.id ?? `child-${idx}`;
              return {
                id: `${assistantMsgId}-${r.parentId ?? 'root'}-${childId}`,
                childId,
                msgId: `${assistantMsgId}-${r.id ?? idx}-${startTs}`,
                parentId: r.parentId,
                startTime: startTs,
                endTime: endTs,
                duration: r.duration ?? endTs - startTs,
                result: r.error ?? r.result ?? r.output ?? '',
                status: r.status === 'error' || r.error ? ('error' as const) : ('success' as const),
              };
            }),
          );
        }

        if (data.error) {
          devLog.e(LOG, 'stream error event', { content: data.content, code: data.code });
          // P2-2: 用 i18n 翻译表格式化错误,带修复提示
          const errorMsg = formatErrorFeedback(data.code, data.content ?? '');
          const errorContent = fullContentRef.current
            ? `${fullContentRef.current}\n\n${errorMsg}`
            : errorMsg;
          fullContentRef.current = errorContent;
          streamingContentRef.current = errorContent;
          setStreamingContent(errorContent);
          updateMessage(convId, assistantMsgId, { content: errorContent });
          onFeedback?.(errorMsg);
          stopStreaming();
          return;
        }

        if (data.content) {
          // PR-1 (2026-07-10): 第一次 chunk 到达,reading → analyzing
          // PR-1 review fix (2026-07-10): dispatch_phase 可能抢先到达并把 stage 改成 executing/planning,
          // 此时 ==='reading' 判定失败会跳过 analyzing。改为"还没进入派遣/审查/完成阶段就允许推进"
          const stage = currentProgressStageRef.current;
          if (stage !== 'analyzing' && stage !== 'planning' && stage !== 'executing' && stage !== 'reviewing' && stage !== 'done') {
            currentProgressStageRef.current = 'analyzing';
            currentProgressPercentRef.current = 25;
            writeProgress(convId, 'analyzing', 25, '分析问题...');
          }
          if (fullContentRef.current.length + data.content.length > useSettingsStore.getState().streamingMaxLength) {
            fullContentRef.current += data.content;
            streamingContentRef.current = fullContentRef.current;
            // P3: 原生 tool_call 路径下 content 不再含 XML, 直接累积
            originalAiContentRef.current += data.content;
            scheduleStreamingRawUpdate(originalAiContentRef.current);
            updateMessage(convId, assistantMsgId, { content: fullContentRef.current });
            onFeedback?.(`响应过长已自动停止（超过 ${useSettingsStore.getState().streamingMaxLength} 字符限制）`);
            onAgentNodesFinalize?.(true);
            stopStreaming();
            return;
          }
          // P3: 原生 tool_call 路径下 content 仅为纯 AI 文本（无 <tool_call> 注入）
          //     fullContent / originalAiContentRef 都直接累积 data.content
          originalAiContentRef.current += data.content;
          scheduleStreamingRawUpdate(originalAiContentRef.current);
          fullContentRef.current += data.content;
          streamingContentRef.current = fullContentRef.current;
          // 每累积 500 字符刷一次 store（防止 crash 丢整个回复）
          flushCharsAccum.current += data.content.length;
          if (flushCharsAccum.current >= 500) {
            flushCharsAccum.current = 0;
            updateMessage(convId, assistantMsgId, {
              content: fullContentRef.current,
              rawContent: originalAiContentRef.current,
            });
          }
        }

        if (data.done) {
          // 纯原生 tool_call 路径: 若累积器中还有未 finished 的 call,提示用户
          if (nativeToolCallsRef.current.size > 0) {
            const unfin = Array.from(nativeToolCallsRef.current.values()).filter((c) => !c.finished);
            if (unfin.length > 0) {
              onFeedback?.(`⚠️ ${unfin.length} 个原生 tool_call 未闭合,已跳过该段`);
            }
            nativeToolCallsRef.current.clear();
          }
          // 原生 tool_call 在流式阶段已调过 processToolCalls(stream),此处无需重做
          if (pendingToolResultsRef.current > 0) {
            return;
          }

          updateMessage(convId, assistantMsgId, {
            content: fullContentRef.current,
            // P3: 写入原始 AI 输出,不含 tool_result 注入 + sanitize 替换
            rawContent: originalAiContentRef.current,
          });
          // 完成时重置冲刷计数器
          flushCharsAccum.current = 0;
          // token 落库
          const finalOutputTokens = (function (text: string): number {
            if (!text) return 0;
            const chineseChars = (text.match(/\p{Script=Han}/gu) || []).length;
            const englishWords = (text.match(/[a-z]+/gi) || []).length;
            const otherChars = [...text].length - chineseChars - englishWords;
            return Math.ceil(chineseChars + englishWords * 1.3 + otherChars * 0.25);
          })(fullContentRef.current);
          let computedStats: any = null;
          setTokenStats((prev: any) => {
            const newInput = prev.inputTokens + inputTokens;
            const newOutput = prev.outputTokens + finalOutputTokens;
            const newTotal = newInput + newOutput;
            const newStats = {
              inputTokens: newInput,
              outputTokens: newOutput,
              totalTokens: newTotal,
              cacheReadTokens: prev.cacheReadTokens,
              cacheCreationTokens: prev.cacheCreationTokens,
              lastTurnCacheRead: prev.lastTurnCacheRead,
              hitRate: prev.hitRate,
              totalCostCny: prev.totalCostCny,
            };
            computedStats = newStats;
            return newStats;
          });
          onStreamComplete?.({ convId, newStats: computedStats });
          onAgentNodesFinalize?.(false);
          stopStreaming();
          return;
        }

        // 纯原生 tool_call 路径: content 不再含 <tool_call> XML, 无需正则扫描兜底
        // 节省: 每次 content chunk 省一次 O(n) 正则扫描 (fullContent 可能几十 KB)

        if (!isPausedRef.current) {
          scheduleStreamingUpdate(fullContentRef.current);
        }
      };

      activeHandlerRef.current = eventHandler;
      return eventHandler;
    },
    [
      accumulatedResultsRef,
      continuationRoundsRef,
      continuationVersionRef,
      currentConvIdRef,
      currentEventNameRef,
      currentVersionRef,
      executedToolCallIdsRef,
      fullContentRef,
      isMountedRef,
      isPausedRef,
      onAgentExecutionAppend,
      onAgentExecutionBatch,
      onAgentNodesFinalize,
      onDebugLog,
      onFeedback,
      onStreamComplete,
      onToolCallUpdated,
      onToolCallsDetected,
      pendingToolResultsRef,
      processToolCalls,
      scheduleStreamingUpdate,
      sendContinuation,
      setStreamingContent,
      setTokenStats,
      stopStreaming,
      streamingContentRef,
      streamingIdRef,
      updateMessage,
    ],
  );

  const cleanup = useCallback(() => {
    triggerContinuationRef.current = null;
    originalRequestRef.current = null;
    activeHandlerRef.current = null;
    continuationRoundsRef.current = 0;
    continuationTranscriptRef.current = [];
    snapshottedToolCallCountRef.current = 0;
    snapshottedResultCountRef.current = 0;
  }, []);

  return { startSession, cleanup };
}
