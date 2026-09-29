/** Skill 发现/加载工具。 */

import { useSkillStore, type Skill } from '@/stores/skillStore';
import type { Tool } from '../base';

/** 统一 Skill 名称:兼容 /less-ui-skill、大小写以及首尾空格。 */
export function normalizeSkillName(name: string): string {
  return name.trim().replace(/^\/+/, '').toLowerCase();
}

/** 根据用户/模型输入查找 Skill。 */
export function findSkillByName(name: string): Skill | undefined {
  const normalized = normalizeSkillName(name);
  return useSkillStore.getState().skills.find(
    (skill) => normalizeSkillName(skill.name) === normalized,
  );
}

/** 将 Skill 转成模型可消费的完整文本。 */
export function serializeSkill(skill: Skill): string {
  const parts = [`[已加载 Skill: ${skill.name}]`];
  if (skill.description) parts.push(`说明: ${skill.description}`);
  if (skill.tags.length > 0) parts.push(`标签: ${skill.tags.join(', ')}`);
  if (skill.filePath) parts.push(`来源: ${skill.filePath}`);
  const body = skill.content || skill.code || '';
  if (body) parts.push(`\n--- Skill 正文 ---\n${body}`);
  else parts.push('\n[该 Skill 没有可用正文]');
  return parts.join('\n');
}

export const loadSkillTool: Tool = {
  category: 'meta',
  description:
    'Load the complete instructions of an imported Skill by name. ' +
    'Use this when a task matches a Skill shown in the system prompt. ' +
    'Accepts names with or without a leading slash, for example "less-ui-skill" or "/less-ui-skill".',
  execute: async (params) => {
    const name = typeof params.name === 'string' ? params.name : '';
    if (!name) throw new Error('Missing Skill name');
    const skill = findSkillByName(name);
    if (!skill) {
      const available = useSkillStore.getState().skills.map((item) => item.name).sort();
      return JSON.stringify({
        error: `Skill "${name}" not found`,
        availableSkills: available,
      }, null, 2);
    }
    return serializeSkill(skill);
  },
  name: 'LoadSkill',
  params: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Imported Skill name, with or without a leading slash.',
      },
    },
  },
};
