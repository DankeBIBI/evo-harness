/**
 * 流式节流控制模块
 *
 * 职责：
 *  - rAF 节流：合并高频 chunk 到每帧一次 setState（避免 WebView2 渲染进程崩溃）
 *  - 生命周期：stopStreaming / handleStop / handlePause / handleStopAndSend
 *  - 跨模块 ref 重置：executedToolCallIdsRef / pendingToolResultsRef / accumulatedResultsRef
 *
 * 共享 ref 全部由主 hook 持有并以参数传入（避免与 toolCallRunner / continuationManager 循环引用）
 */

import { EventsOff } from '@/lib/hostServices/eventBus';
import { useCallback, useRef } from 'react';

import type { StreamingContext } from './streamingContext';

export function useStreamingController(ctx: StreamingContext): {
  cancelStreamingRaf: () => void;
  handlePause: () => void;
  handleStop: () => void;
  handleStopAndSend: () => Promise<void>;
  scheduleStreamingUpdate: (content: string) => void;
  stopStreaming: () => void;
} {

  // --- 流式 rAF 节流：合并高频 chunk 到每个动画帧触发一次 setState，避免主线程卡死 ---
  const streamingRafIdRef = useRef<number | null>(null);
  const pendingStreamingContentRef = useRef<string>('');

  /**
   * 流式 rAF 节流调度器
   * 合并同一动画帧内的多次 chunk 累积，每个 frame 至多触发一次 setStreamingContent
   * 避免高频 setState + 全量重渲染导致主线程阻塞 → WebView2 进程崩溃
   *
   * 注意：曾尝试 startTransition 包裹 setState，但 React 18 严格模式/短消息场景下
   * 与 rAF 组合会出现渲染循环导致 WebView2 进程崩溃，已回退。
   */
  const scheduleStreamingUpdate = useCallback(
    (content: string) => {
      pendingStreamingContentRef.current = content;
      if (streamingRafIdRef.current !== null) return;
      streamingRafIdRef.current = requestAnimationFrame(() => {
        streamingRafIdRef.current = null;
        if (ctx.isPausedRef.current) return;
        ctx.setStreamingContent(pendingStreamingContentRef.current);
      });
    },
    [ctx],
  );

  const cancelStreamingRaf = useCallback(() => {
    if (streamingRafIdRef.current !== null) {
      cancelAnimationFrame(streamingRafIdRef.current);
      streamingRafIdRef.current = null;
    }
  }, []);

  const stopStreaming = useCallback(() => {
    ctx.clearResponseTimeout();
    cancelStreamingRaf();
    if (ctx.currentEventNameRef.current) {
      EventsOff(ctx.currentEventNameRef.current);
      ctx.currentEventNameRef.current = null;
    }
    if (!ctx.isMountedRef.current) return;
    const msgId = ctx.streamingIdRef.current;
    const convId = ctx.currentConvIdRef.current;
    const bufferedContent = ctx.fullContentRef.current;
    if (msgId && convId && bufferedContent) {
      ctx.updateMessage(convId, msgId, {
        content: bufferedContent,
        rawContent: ctx.originalAiContentRef.current,
      });
    }
    ctx.setStreamingId(null);
    // S1 (2026-09-06): 同步置空 streamingIdRef,消除与 React state 的同步窗口期
    // 修复: 旧实现只 setStreamingId(null)(异步),ref 靠 useEffect 在 re-render 后才同步,
    //       窗口期内 processToolCalls 的 onToolCallsDetected/onToolCallUpdated 会读到旧 msgId,
    //       在 handleStopAndSend 场景可能把新会话工具写到旧消息
    ctx.streamingIdRef.current = null;
    ctx.setIsPaused(false);
    ctx.isPausedRef.current = false;
    ctx.isProcessingQueueRef.current = false;
    ctx.executedToolCallIdsRef.current.clear();
    ctx.pendingToolResultsRef.current = 0;
    ctx.waitingForContinuationRef.current = false;
    ctx.sendContinuationRef.current = null;
    ctx.accumulatedResultsRef.current = [];
    // M2 (2026-09-06): 清理原生 tool_call 累积器,避免中途停止后残留到下次发送
    ctx.nativeToolCallsRef.current.clear();
    // M3 (2026-09-06): 取消挂起的 raw rAF,避免停止后用陈旧内容覆盖 setStreamingRawContent('')
    if (ctx.streamingRawRafIdRef.current !== null) {
      cancelAnimationFrame(ctx.streamingRawRafIdRef.current);
      ctx.streamingRawRafIdRef.current = null;
    }
    ctx.fullContentRef.current = '';
    ctx.streamingContentRef.current = '';
    ctx.setStreamingRawContent('');
  }, [ctx, cancelStreamingRaf]);

  const handlePause = useCallback(() => {
    const nextPaused = !ctx.isPausedRef.current;
    ctx.isPausedRef.current = nextPaused;
    ctx.setIsPaused(nextPaused);
    // S2 (2026-09-06): 暂停→恢复时主动重同步一次
    // 修复: 暂停期间 chunk 仍累积到 fullContentRef,但 scheduleStreamingUpdate 被跳过;
    //       若恢复后无新 chunk 到达(如等待工具结果),UI 停留在暂停前内容,用户误以为输出丢失
    if (!nextPaused && ctx.fullContentRef.current) {
      ctx.scheduleStreamingUpdate(ctx.fullContentRef.current);
    }
  }, [ctx]);

  const handleStop = useCallback(() => {
    if (ctx.currentEventNameRef.current) {
      EventsOff(ctx.currentEventNameRef.current);
    }
    cancelStreamingRaf();
    stopStreaming();
  }, [cancelStreamingRaf, ctx, stopStreaming]);

  const handleStopAndSend = useCallback(async () => {
    handleStop();
    await ctx.sendFromQueue();
  }, [handleStop, ctx]);

  return {
    cancelStreamingRaf,
    handlePause,
    handleStop,
    handleStopAndSend,
    scheduleStreamingUpdate,
    stopStreaming,
  };
}