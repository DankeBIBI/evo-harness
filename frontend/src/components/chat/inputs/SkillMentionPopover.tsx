import type { Skill } from '@/stores/skillStore';
import { formatSkillName } from '@/stores/skillStore';
import { SOURCE_LABELS } from '@/stores/sourceStore';
import { useSkillStore } from '@/stores/skillStore';
import { MentionPopover, type MentionItem } from "@/components/chat/inputs/MentionPopover";

interface SkillMentionPopoverProps {
  onClose: () => void;
  onSelect: (skill: Skill) => void;
  open: boolean;
}

/**
 * / Skill 候选弹层
 *
 * 直接展示 useSkillStore.skills 里的全部
 * 加载/过滤由 store + useEffect 监听 source config 变化统一处理
 * 弹层只负责展示,不做二次过滤
 */
export function SkillMentionPopover({
  onClose,
  onSelect,
  open,
}: SkillMentionPopoverProps) {
  const skills = useSkillStore((s) => s.skills);

  const items: MentionItem[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    sourceLabel: s.source === 'user-db' ? undefined : SOURCE_LABELS[s.source],
    type: 'skill' as const,
  }));

  return (
    <MentionPopover
      items={items}
      onClose={onClose}
      onSelect={(item) => {
        const skill = skills.find((s) => s.id === item.id);
        if (skill) onSelect(skill);
      }}
      open={open}
      placeholder="搜索 Skill..."
      trigger="/"
    />
  );
}

/** 渲染 Skill chip 时使用的友好名称 */
export const getSkillDisplayName = (skill: Skill, showLabel: boolean): string =>
  formatSkillName(skill, showLabel);
