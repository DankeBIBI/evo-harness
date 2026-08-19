import { useEffect, useState } from 'react';
import type { AgentNode } from './AgentOrchestrationGraph';

interface Props {
  agents: any[];
}

// 懒加载 Agent 编排图表组件
export function LazyAgentGraph({ agents }: Props) {
  const [AgentGraphComponent, setAgentGraphComponent] = useState<any>(null);

  useEffect(() => {
    // 动态导入组件
    import('./AgentOrchestrationGraph').then((module) => {
      setAgentGraphComponent(() => module.AgentOrchestrationGraph);
    });
  }, []);

  if (!AgentGraphComponent) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        加载图表组件...
      </div>
    );
  }

  // 转换为 AgentNode 格式
  const agentNodes: AgentNode[] = agents.map((agent) => ({
    id: agent.name,
    name: agent.name,
    role: 'agent',
    status: 'idle' as const,
    children: agent.subAgents || [],
  }));

  // 添加子 agent
  agents.forEach((agent) => {
    if (agent.subAgents) {
      agent.subAgents.forEach((sub: string) => {
        if (!agentNodes.find((n) => n.id === sub)) {
          agentNodes.push({
            id: sub,
            name: sub,
            role: 'sub-agent',
            status: 'idle' as const,
          });
        }
      });
    }
  });

  return (
    <AgentGraphComponent
      executions={[]}
      height={400}
      nodes={agentNodes}
      width={800}
    />
  );
}
