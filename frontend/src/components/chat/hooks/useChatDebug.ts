import { useCallback, useState } from 'react';
// P3: 调试日志独立维护(高频 addDebugLog 不再触发 conversations 重渲染)
import { useDebugLogStore } from '@/stores/debugLogStore';

/** useChatDebug 只负责调试面板的显示/隐藏，数据由 debugLogStore 统一管理 */
export function useChatDebug(conversationId?: string | null) {
  const [showDebugLog, setShowDebugLog] = useState(false);

  // P3: 从独立 debugLogStore 读,订阅粒度只跟 debugLogs 字段,不再触发 conversations 重渲染
  const debugLogs = useDebugLogStore((state) =>
    conversationId ? state.logsByConv[conversationId] ?? [] : [],
  );

  const _clearLocal = useCallback(() => {
    if (conversationId) {
      useDebugLogStore.getState().clearLogs(conversationId);
    }
  }, [conversationId]);

  const toggleDebugLog = useCallback(() => {
    setShowDebugLog((prev) => !prev);
  }, []);

  return {
    showDebugLog,
    setShowDebugLog,
    debugLogs,
    clearDebugLogs: _clearLocal,
    toggleDebugLog,
  };
}
