/**
 * AI 工具调用 Hook
 * 管理工具调用的状态和执行
 */

import { useCallback, useState } from 'react';
import type { ToolCall } from '@/lib/tools/base';

export interface ToolCallState {
  id: string;
  name: string;
  params: Record<string, unknown>;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: string;
  error?: string;
}

export function useToolCall() {
  const [toolCalls, setToolCalls] = useState<ToolCallState[]>([]);

  // 添加工具调用
  const addToolCall = useCallback((call: ToolCall) => {
    setToolCalls((prev) => [
      ...prev,
      {
        id: call.id,
        name: call.name,
        params: call.input,
        status: 'pending',
      },
    ]);
  }, []);

  // 更新工具调用状态
  const updateToolCallStatus = useCallback(
    (id: string, status: ToolCallState['status'], result?: string, error?: string) => {
      setToolCalls((prev) =>
        prev.map((tc) =>
          tc.id === id ? { ...tc, status, result, error } : tc,
        ),
      );
    },
    [],
  );

  // 清除已完成/错误的工具调用
  const clearToolCalls = useCallback(() => {
    setToolCalls([]);
  }, []);

  // 获取待执行的工具调用
  const pendingToolCalls = toolCalls.filter((tc) => tc.status === 'pending');

  return {
    toolCalls,
    pendingToolCalls,
    addToolCall,
    updateToolCallStatus,
    clearToolCalls,
  };
}
