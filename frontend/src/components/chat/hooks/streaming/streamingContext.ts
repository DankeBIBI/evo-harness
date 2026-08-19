/**
 * StreamingContext — 流式会话共享状态容器
 *
 * 把原本散落在 useChatStreaming 的 20+ 个 ref 集中到一个对象,
 * 子模块 (controller/session) 只接收一个 ctx 参数,不再层层透传。
 *
 * 生命周期: useChatStreaming.createStreamingContext() 创建,
 * 组件卸载时 ctx.dispose() 清理。
 */

import type { ToolResult } from '@/lib/tools/base';
import type { QueuedMessage } from './queueManager';

export interface StreamingContext {
  // -- Refs（跨模块共享的 mutable 状态，避免闭包陷阱） --

  /** 工具调用结果累积器 — 每轮工具执行完成后 push，续传时作为 childResults 传给 AI */
  accumulatedResultsRef: React.MutableRefObject<ToolResult[]>;
  /** 延续请求版本号 — 每次 sendMessage 递增，防止旧 session 的续传污染新一轮 */
  continuationVersionRef: React.MutableRefObject<number>;
  /** 当前会话的 agentId — handleStop 时传给后端 CancelChat */
  currentAgentIdRef: React.MutableRefObject<null | string>;
  /** 当前会话 convId — 切换会话时更新，闭包中取最新值 */
  currentConvIdRef: React.MutableRefObject<null | string>;
  /** 当前 Wails 事件名 "chat-stream-{convId}-{msgId}" — stop 时 EventsOff 取消订阅 */
  currentEventNameRef: React.MutableRefObject<null | string>;
  /** 已执行工具调用 ID 集合 — enableToolDedup 开启时跳过重复调用 */
  executedToolCallIdsRef: React.MutableRefObject<Set<string>>;
  /** 完整流式文本（含 AI 输出 + tool_result 注入），最终写入 msg.content */
  fullContentRef: React.MutableRefObject<string>;
  /** 是否已收到首个 chunk — 用于超时检测：超时前未收到即判定为无响应 */
  hasReceivedDataRef: React.MutableRefObject<boolean>;
  /** 组件是否仍挂载 — 卸载后跳过所有 setState 避免内存泄漏 */
  isMountedRef: React.MutableRefObject<boolean>;
  /** 流式是否暂停 — 暂停期间 rAF 节流跳过 setStreamingContent */
  isPausedRef: React.MutableRefObject<boolean>;
  /** 队列是否正在处理中 — 防止并发重复消费 */
  isProcessingQueueRef: React.MutableRefObject<boolean>;
  /** 上次发给 AI 的 toolMode 档位 — 变化时拼一段提示通知 AI */
  lastSentToolModeRef: React.MutableRefObject<'auto' | 'edit' | 'plan'>;
  /** 消息队列 — 流式期间用户发的新消息暂存于此 */
  messageQueueRef: React.MutableRefObject<QueuedMessage[]>;
  /** 纯 AI 输出（不含 tool_result 注入），存入 Message.rawContent 供回显/日志 */
  originalAiContentRef: React.MutableRefObject<string>;
  /** 待完成的工具调用计数 — 归零时触发 sendContinuation */
  pendingToolResultsRef: React.MutableRefObject<number>;
  /** 响应超时定时器句柄 — 请求前设置，首 chunk 或完成时清除 */
  responseTimeoutRef: React.MutableRefObject<null | ReturnType<typeof setTimeout>>;
  /** 续传触发函数 — session 启动时写入 sendContinuation，handleStop 时置 null 取消 */
  sendContinuationRef: React.MutableRefObject<(() => Promise<void>) | null>;
  /** 当前流式内容快照（rAF 节流前的未脱敏文本），stop 时用于兜底刷写到 store */
  streamingContentRef: React.MutableRefObject<string>;
  /** 当前流式消息 ID — 非 null 表示正在流式中，null 表示空闲 */
  streamingIdRef: React.MutableRefObject<null | string>;
  /** 是否正在等待续传返回 — 防止重复触发 sendContinuation */
  waitingForContinuationRef: React.MutableRefObject<boolean>;

  // -- State setters（useState 的 setter，子模块需要更新 React UI） --

  /** 切换暂停状态 */
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  /** 更新流式主文本（Markdown 渲染用） */
  setStreamingContent: (v: string) => void;
  /** 设置/清空流式消息 ID */
  setStreamingId: (v: null | string) => void;
  /** 更新流式纯 AI 文本（已剥 tool_call 包装，UnifiedLog "原" tab 用） */
  setStreamingRawContent: (v: string) => void;
  /** 更新会话级 token 统计（含缓存命中），用函数式 updater 避免闭包过期 */
  setTokenStats: (updater: (prev: any) => any) => void;

  // -- Callbacks（主 hook 注入的闭包，子模块不持有实现，只调用） --

  /** 清除响应超时定时器 */
  clearResponseTimeout: () => void;
  /** 向用户反馈消息（toast / status bar） */
  onFeedback?: (message: string) => void;
  /** Agent 编排图最终化 — 通知 ChatWindow 完成/失败状态 */
  onAgentNodesFinalize?: (isError: boolean) => void;
  /** rAF 节流调度器 — 合并高频 chunk 到每个动画帧触发一次 setState */
  scheduleStreamingUpdate: (content: string) => void;
  /** 停止流式 — 取消订阅 + 清空状态 + 兜底刷写内容到 store */
  stopStreaming: () => void;
  /** 更新 chatStore 中的消息内容（content / rawContent） */
  updateMessage: (
    convId: string,
    msgId: string,
    update: Partial<{ content: string; rawContent: string }>,
  ) => void;
  /** 调用后端 CancelChat 真正中断 HTTP stream */
  cancelChatOnBackend?: (agentId: string, conversationId: string) => Promise<boolean>;
  /** 停止当前流后立即发送队列首条 */
  sendFromQueue: () => Promise<void>;

  // -- 生命周期 --

  /** 销毁 context — 组件卸载时清理 */
  dispose: () => void;
}

/**
 * 创建 StreamingContext 实例
 *
 * 入参为 useChatStreaming 持有的全部 ref + setter + 回调的集合。
 * 其中 scheduleStreamingUpdate / stopStreaming 为占位值，
 * 由 useStreamingController 返回后立即回填到 ctx 上。
 *
 * 各字段含义参见 StreamingContext 接口定义上的 JSDoc。
 */
export function createStreamingContext(
  overrides: Partial<StreamingContext> & {
    accumulatedResultsRef: React.MutableRefObject<ToolResult[]>;
    continuationVersionRef: React.MutableRefObject<number>;
    currentAgentIdRef: React.MutableRefObject<null | string>;
    currentConvIdRef: React.MutableRefObject<null | string>;
    currentEventNameRef: React.MutableRefObject<null | string>;
    executedToolCallIdsRef: React.MutableRefObject<Set<string>>;
    fullContentRef: React.MutableRefObject<string>;
    hasReceivedDataRef: React.MutableRefObject<boolean>;
    isMountedRef: React.MutableRefObject<boolean>;
    isPausedRef: React.MutableRefObject<boolean>;
    isProcessingQueueRef: React.MutableRefObject<boolean>;
    lastSentToolModeRef: React.MutableRefObject<'auto' | 'edit' | 'plan'>;
    messageQueueRef: React.MutableRefObject<QueuedMessage[]>;
    originalAiContentRef: React.MutableRefObject<string>;
    pendingToolResultsRef: React.MutableRefObject<number>;
    responseTimeoutRef: React.MutableRefObject<null | ReturnType<typeof setTimeout>>;
    sendContinuationRef: React.MutableRefObject<(() => Promise<void>) | null>;
    streamingContentRef: React.MutableRefObject<string>;
    streamingIdRef: React.MutableRefObject<null | string>;
    waitingForContinuationRef: React.MutableRefObject<boolean>;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
    setStreamingContent: (v: string) => void;
    setStreamingId: (v: null | string) => void;
    setStreamingRawContent: (v: string) => void;
    setTokenStats: (updater: (prev: any) => any) => void;
    clearResponseTimeout: () => void;
    scheduleStreamingUpdate: (content: string) => void;
    stopStreaming: () => void;
    updateMessage: (
      convId: string,
      msgId: string,
      update: Partial<{ content: string; rawContent: string }>,
    ) => void;
    onFeedback?: (message: string) => void;
    onAgentNodesFinalize?: (isError: boolean) => void;
    cancelChatOnBackend?: (agentId: string, conversationId: string) => Promise<boolean>;
    sendFromQueue: () => Promise<void>;
  },
): StreamingContext {
  const ctx: StreamingContext = {
    // refs
    accumulatedResultsRef: overrides.accumulatedResultsRef,
    continuationVersionRef: overrides.continuationVersionRef,
    currentAgentIdRef: overrides.currentAgentIdRef,
    currentConvIdRef: overrides.currentConvIdRef,
    currentEventNameRef: overrides.currentEventNameRef,
    executedToolCallIdsRef: overrides.executedToolCallIdsRef,
    fullContentRef: overrides.fullContentRef,
    hasReceivedDataRef: overrides.hasReceivedDataRef,
    isMountedRef: overrides.isMountedRef,
    isPausedRef: overrides.isPausedRef,
    isProcessingQueueRef: overrides.isProcessingQueueRef,
    lastSentToolModeRef: overrides.lastSentToolModeRef,
    messageQueueRef: overrides.messageQueueRef,
    originalAiContentRef: overrides.originalAiContentRef,
    pendingToolResultsRef: overrides.pendingToolResultsRef,
    responseTimeoutRef: overrides.responseTimeoutRef,
    sendContinuationRef: overrides.sendContinuationRef,
    streamingContentRef: overrides.streamingContentRef,
    streamingIdRef: overrides.streamingIdRef,
    waitingForContinuationRef: overrides.waitingForContinuationRef,
    // setters
    setIsPaused: overrides.setIsPaused,
    setStreamingContent: overrides.setStreamingContent,
    setStreamingId: overrides.setStreamingId,
    setStreamingRawContent: overrides.setStreamingRawContent,
    setTokenStats: overrides.setTokenStats,
    // callbacks
    clearResponseTimeout: overrides.clearResponseTimeout,
    onFeedback: overrides.onFeedback,
    onAgentNodesFinalize: overrides.onAgentNodesFinalize,
    scheduleStreamingUpdate: overrides.scheduleStreamingUpdate,
    stopStreaming: overrides.stopStreaming,
    updateMessage: overrides.updateMessage,
    cancelChatOnBackend: overrides.cancelChatOnBackend,
    sendFromQueue: overrides.sendFromQueue,
    // lifecycle
    dispose: () => {
      /* 主 hook 的 useEffect cleanup 已处理各项清理,此处预留 */
    },
  };
  return ctx;
}
