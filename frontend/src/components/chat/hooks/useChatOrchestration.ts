import { useState, useCallback } from 'react';
import type {
  AgentExecutionRecord,
  AgentNode,
} from '@/components/agent/AgentOrchestrationGraph';

export function useChatOrchestration() {
  const [showOrchestration, setShowOrchestration] = useState(false);
  const [agentNodes, setAgentNodes] = useState<AgentNode[]>([]);
  const [agentExecutions, setAgentExecutions] = useState<
    AgentExecutionRecord[]
  >([]);

  const toggleOrchestration = useCallback(() => {
    setShowOrchestration((prev) => !prev);
  }, []);

  const initAgentNodes = useCallback(
    (
      mainAgent: {
        id: string;
        name: string;
        role: string;
        children?: string[];
      },
      availableAgents: Array<{ id: string; name: string; role: string }>,
    ) => {
      if (!mainAgent.children?.length) {
        setAgentNodes([]);
        return;
      }

      const startTime = Date.now();
      const mainNode: AgentNode = {
        id: mainAgent.id,
        name: mainAgent.name,
        role: mainAgent.role,
        startTime,
        status: 'running',
        children: mainAgent.children,
      };

      const childNodes: AgentNode[] = mainAgent.children.map((childId) => {
        const childAgentInfo = availableAgents.find((a) => a.id === childId);
        return {
          id: childId,
          name: childAgentInfo?.name || childId,
          role: childAgentInfo?.role || '',
          status: 'pending' as const,
        };
      });

      setAgentNodes([mainNode, ...childNodes]);
      setAgentExecutions([]);
    },
    [],
  );

  const finalizeAgentNodes = useCallback((isError = false) => {
    setAgentNodes((prev) =>
      prev.map((node) => ({
        ...node,
        duration: node.startTime ? Date.now() - node.startTime : undefined,
        status: isError ? 'error' : 'success',
      })),
    );
  }, []);

  /**
   * 追加/更新一条子 Agent 执行记录
   * 用于接收后端 child_result 事件时实时回填（消息级渲染）
   */
  const appendExecution = useCallback((record: AgentExecutionRecord) => {
    setAgentExecutions((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...record };
        return next;
      }
      return [...prev, record];
    });
  }, []);

  /** 批量追加/更新（用于 dispatch 事件携带多个子结果） */
  const appendExecutions = useCallback((records: AgentExecutionRecord[]) => {
    if (records.length === 0) return;
    setAgentExecutions((prev) => {
      const map = new Map(prev.map((r) => [r.id, r]));
      for (const r of records) {
        const existing = map.get(r.id);
        map.set(r.id, existing ? { ...existing, ...r } : r);
      }
      return Array.from(map.values());
    });
  }, []);

  /** 发送请求时把 children 全部置为 running，初始化 records（用于消息级 UI） */
  const startChildExecutions = useCallback(
    (parentId: string, childIds: string[], msgId: string) => {
      const now = Date.now();
      const records: AgentExecutionRecord[] = childIds.map((cid) => ({
        id: `${msgId}-${parentId}-${cid}`,
        parentId,
        childId: cid,
        msgId,
        startTime: now,
        status: 'running',
      }));
      setAgentExecutions(records);
    },
    [],
  );

  return {
    showOrchestration,
    setShowOrchestration,
    toggleOrchestration,
    agentNodes,
    setAgentNodes,
    agentExecutions,
    setAgentExecutions,
    initAgentNodes,
    finalizeAgentNodes,
    appendExecution,
    appendExecutions,
    startChildExecutions,
  };
}
