import type { Agent } from '@/stores/agentStore';
import { formatAgentName } from '@/stores/agentStore';
import { SOURCE_LABELS } from '@/stores/sourceStore';
import { useAgentStore } from '@/stores/agentStore';
import { MentionPopover, type MentionItem } from "@/components/chat/inputs/MentionPopover";

interface AgentMentionPopoverProps {
  onClose: () => void;
  onSelect: (agent: Agent) => void;
  open: boolean;
}

/**
 * @ Agent 候选弹层
 *
 * 直接展示 useAgentStore.agents 里的全部
 * 加载/过滤由 store + useEffect 监听 source config 变化统一处理
 */
export function AgentMentionPopover({
  onClose,
  onSelect,
  open,
}: AgentMentionPopoverProps) {
  const agents = useAgentStore((s) => s.agents);

  const items: MentionItem[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    sourceLabel: a.source === 'user-db' || a.source === 'system' ? undefined : SOURCE_LABELS[a.source],
    type: 'agent' as const,
  }));

  return (
    <MentionPopover
      items={items}
      onClose={onClose}
      onSelect={(item) => {
        const agent = agents.find((a) => a.id === item.id);
        if (agent) onSelect(agent);
      }}
      open={open}
      placeholder="搜索 Agent..."
      trigger="@"
    />
  );
}

/** 渲染 Agent chip 时使用的友好名称(由 useSourceStore 决定) */
export const getAgentDisplayName = (agent: Agent, showLabel: boolean): string =>
  formatAgentName(agent, showLabel);
