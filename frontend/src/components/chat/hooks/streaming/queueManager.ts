/**
 * 消息队列管理模块
 *
 * 职责：
 *  - 入队 / 出队 / 重排 / 清空 / 按索引移除
 *  - 通过 ref + setState 同步暴露给 ChatInput 队列 UI
 *  - isProcessingQueueRef 跨模块共享（sendMessage 期间不允许重入）
 *
 * 不含：sendFromQueue / processQueueWithConvId
 *  - 这两个依赖 sendMessage，会产生循环引用，保留在主 hook 编排
 */

import type { FileMentionReference } from '../useChatWorkspace';
import { useCallback, useRef, useState } from 'react';

/** 队列消息结构(供 useChatStreaming 内部及 ChatInput 队列 UI 共用) */
export interface QueuedMessage {
  /** 目标会话 ID — 入队时记录，出队后用此 convId 而非当前活跃会话 */
  convId: string;
  fileMentions: FileMentionReference[];
  input: string;
  skillMentions?: string[];
}

export function useMessageQueue(): {
  clearQueue: () => void;
  dequeueMessage: () => null | QueuedMessage;
  enqueueMessage: (
    convId: string,
    nextInput: string,
    fileMentions?: FileMentionReference[],
    skillMentions?: string[],
  ) => void;
  isProcessingQueueRef: React.MutableRefObject<boolean>;
  messageQueue: QueuedMessage[];
  messageQueueRef: React.MutableRefObject<QueuedMessage[]>;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  syncQueue: (nextQueue: QueuedMessage[]) => void;
} {
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const messageQueueRef = useRef<QueuedMessage[]>([]);
  /** 跨模块共享：sendMessage 期间不允许重入 */
  const isProcessingQueueRef = useRef(false);

  const syncQueue = useCallback((nextQueue: QueuedMessage[]) => {
    messageQueueRef.current = nextQueue;
    setMessageQueue(nextQueue);
  }, []);

  const dequeueMessage = useCallback((): null | QueuedMessage => {
    if (messageQueueRef.current.length === 0) return null;
    const [nextInput] = messageQueueRef.current;
    const nextQueue = messageQueueRef.current.slice(1);
    syncQueue(nextQueue);
    return nextInput;
  }, [syncQueue]);

  const enqueueMessage = useCallback(
    (
      convId: string,
      nextInput: string,
      fileMentions: FileMentionReference[] = [],
      skillMentions: string[] = [],
    ) => {
      const nextQueue = [
        ...messageQueueRef.current,
        { convId, fileMentions, input: nextInput, skillMentions } as QueuedMessage,
      ];
      syncQueue(nextQueue);
    },
    [syncQueue],
  );

  /** 从队列中移除指定索引的消息（用户主动撤回） */
  const removeFromQueue = useCallback(
    (index: number) => {
      if (index < 0 || index >= messageQueueRef.current.length) return;
      const nextQueue = messageQueueRef.current.filter((_, i) => i !== index);
      syncQueue(nextQueue);
    },
    [syncQueue],
  );

  /** 重排队列(用于 todolist 拖拽排序):把 from 索引移到 to 索引 */
  const reorderQueue = useCallback(
    (from: number, to: number) => {
      const arr = messageQueueRef.current;
      if (
        from < 0 ||
        to < 0 ||
        from >= arr.length ||
        to >= arr.length ||
        from === to
      ) {
        return;
      }
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      syncQueue(next);
    },
    [syncQueue],
  );

  /** 清空整个队列 */
  const clearQueue = useCallback(() => {
    syncQueue([]);
  }, [syncQueue]);

  return {
    clearQueue,
    dequeueMessage,
    enqueueMessage,
    isProcessingQueueRef,
    messageQueue,
    messageQueueRef,
    removeFromQueue,
    reorderQueue,
    syncQueue,
  };
}
