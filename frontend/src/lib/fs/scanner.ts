/**
 * 项目扫描器(TS 端实现,替代 Go AnalyzerService 部分功能)
 * - 输入:用户授权的根目录 handle
 * - 输出:扫描结果(skills/agents/rules)
 * - 字段命名与 stores/analysisStore.ts 的 SkillInfo/AgentInfo/RuleInfo 保持一致
 */

import { readFile } from './directory-handle';
import { extractDescription, parseFrontmatter } from './frontmatter';

/** 类型兼容 stores/analysisStore.ts 的字段 */
export interface SkillInfo {
  description: string;
  name: string;
  path: string;
  /** 该 skill 目录下的 rules/*.md 文件名列表 */
  rules: string[];
  /** SKILL.md 完整内容(供 mountToSkillStore 使用) */
  content: string;
}

export interface AgentInfo {
  description: string;
  /** Markdown 文件名 */
  fileName: string;
  name: string;
  path: string;
  /** Agent 子目录名列表 */
  subAgents: string[];
  /** Agent MD 文件完整内容 */
  content: string;
}

export interface RuleInfo {
  content: string;
  description: string;
  name: string;
  path: string;
}

export interface ProjectAnalysis {
  /** 项目根标识(.claude 目录名) */
  basePath: string;
  availableFolders: string[];
  agents: AgentInfo[];
  rules: RuleInfo[];
  skills: SkillInfo[];
}

/** 宽松读取 JSON 定义中的字段。 */
function parseJsonDefinition(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 扫描 skills 目录(兼容两种形态:子目录 SKILL.md 与单文件 .md) */
export async function analyzeSkills(
  root: FileSystemDirectoryHandle,
): Promise<SkillInfo[]> {
  let skillsDir: FileSystemDirectoryHandle;
  try {
    skillsDir = await root.getDirectoryHandle('skills');
  } catch {
    // 用户可能直接选择了 skills 目录，或某个包含 SKILL.md 的单独 Skill 目录。
    if (root.name.toLowerCase() === 'skills') return analyzeSkillsDirectory(root);
    const single = await analyzeSingleSkillDirectory(root);
    return single ? [single] : [];
  }

  return analyzeSkillsDirectory(skillsDir);
}

/** 扫描 skills 目录中的所有定义。 */
async function analyzeSkillsDirectory(
  skillsDir: FileSystemDirectoryHandle,
): Promise<SkillInfo[]> {
  const out: SkillInfo[] = [];

  for await (const [name, child] of skillsDir.entries()) {
    if (child.kind === 'file') {
      // 形态 2: skills/xxx.md — 单个文件即一个 Skill
      if (!name.endsWith('.md') && !name.endsWith('.json')) continue;
      const fileHandle = child as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.text();
      const fields = name.endsWith('.json')
        ? parseJsonDefinition(content)
        : content ? parseFrontmatter(content).fields : {};
      out.push({
        description: readString(fields.description) ?? extractDescription(content),
        name: readString(fields.name) ?? name.replace(/\.(md|json)$/i, ''),
        path: `skills/${name}`,
        rules: readStringArray(fields.rules),
        content,
      });
      continue;
    }
    // 形态 1: skills/xxx/SKILL.md 或 SKILL.json — 子目录
    const dir = child as FileSystemDirectoryHandle;
    const skillMd = await readFile(dir, 'SKILL.md');
    const skillJson = skillMd === null ? await readFile(dir, 'SKILL.json') : null;
    const definition = skillMd ?? skillJson;
    if (definition === null) continue;
    const fields = skillJson !== null
      ? parseJsonDefinition(skillJson)
      : definition ? parseFrontmatter(definition).fields : {};
    // 收集 rules/*.md 文件名
    const rules: string[] = [];
    try {
      const rulesDir = await dir.getDirectoryHandle('rules');
      for await (const [rName, rChild] of rulesDir.entries()) {
        if (rChild.kind === 'file' && rName.endsWith('.md')) {
          rules.push(rName);
        }
      }
    } catch {
      // rules 子目录不存在则忽略
    }
    out.push({
      description: readString(fields.description) ?? extractDescription(definition),
      name: readString(fields.name) ?? name,
      path: `skills/${name}`,
      rules: [...new Set([...rules, ...readStringArray(fields.rules)])],
      content: definition,
    });
  }
  return out;
}

/** 读取用户直接选中的单个 Skill 目录。 */
async function analyzeSingleSkillDirectory(
  dir: FileSystemDirectoryHandle,
): Promise<SkillInfo | null> {
  const skillMd = await readFile(dir, 'SKILL.md');
  const skillJson = skillMd === null ? await readFile(dir, 'SKILL.json') : null;
  const definition = skillMd ?? skillJson;
  if (definition === null) return null;
  const fields = skillJson !== null
    ? parseJsonDefinition(skillJson)
    : definition ? parseFrontmatter(definition).fields : {};
  return {
    description: readString(fields.description) ?? extractDescription(definition),
    name: readString(fields.name) ?? dir.name,
    path: skillJson !== null ? 'SKILL.json' : 'SKILL.md',
    rules: readStringArray(fields.rules),
    content: definition,
  };
}

/** 扫描 agents 目录(兼容两种形态:单文件 .md 与子目录 AGENT.md) */
export async function analyzeAgents(
  root: FileSystemDirectoryHandle,
): Promise<AgentInfo[]> {
  let agentsDir: FileSystemDirectoryHandle;
  try {
    agentsDir = await root.getDirectoryHandle('agents');
  } catch {
    // 用户可能直接选择了 agents 目录，或某个包含 AGENT.md 的单独 Agent 目录。
    if (root.name.toLowerCase() === 'agents') return analyzeAgentsDirectory(root);
    const single = await analyzeSingleAgentDirectory(root);
    return single ? [single] : [];
  }

  return analyzeAgentsDirectory(agentsDir);
}

/** 扫描 agents 目录中的所有定义。 */
async function analyzeAgentsDirectory(
  agentsDir: FileSystemDirectoryHandle,
): Promise<AgentInfo[]> {
  const out: AgentInfo[] = [];

  const readAgentContent = async (
    dir: FileSystemDirectoryHandle,
    names: string[],
  ): Promise<{ content: string; fileName: string }> => {
    for (const name of names) {
      const c = await readFile(dir, name);
      if (c !== null) return { content: c, fileName: name };
    }
    return { content: '', fileName: '' };
  };

  for await (const [name, child] of agentsDir.entries()) {
    if (child.kind === 'file') {
      // 形态 1: agents/xxx.md — 单个文件即一个 Agent
      if (!name.endsWith('.md') && !name.endsWith('.json')) continue;
      const fileHandle = child as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.text();
      const fields = name.endsWith('.json')
        ? parseJsonDefinition(content)
        : content ? parseFrontmatter(content).fields : {};
      out.push({
        description: readString(fields.description) ?? extractDescription(content),
        fileName: name,
        name: readString(fields.name) ?? name.replace(/\.(md|json)$/i, ''),
        path: `agents/${name}`,
        subAgents: readStringArray(fields.subAgents ?? fields.subagents),
        content,
      });
    } else if (child.kind === 'directory') {
      // 形态 2: agents/xxx/AGENT.md — 子目录内 MD 文件
      const dir = child as FileSystemDirectoryHandle;
      const { content, fileName } = await readAgentContent(
        dir,
        ['AGENT.md', 'agent.md', 'AGENT.json', 'agent.json', 'README.md'],
      );
      if (!content) continue;
      const fields = fileName.endsWith('.json')
        ? parseJsonDefinition(content)
        : parseFrontmatter(content).fields;
      // 收集 sub-agents
      const subAgents: string[] = [];
      try {
        const subDir = await dir.getDirectoryHandle('agents');
        for await (const [, subChild] of subDir.entries()) {
          if (subChild.kind === 'directory') subAgents.push(subChild.name);
        }
      } catch {
        // agents 子目录不存在
      }
      out.push({
        description: readString(fields.description) ?? extractDescription(content),
        fileName,
        name: readString(fields.name) ?? name,
        path: `agents/${name}`,
        subAgents: [
          ...new Set([
            ...subAgents,
            ...readStringArray(fields.subAgents ?? fields.subagents),
          ]),
        ],
        content,
      });
    }
  }
  return out;
}

/** 读取用户直接选中的单个 Agent 目录。 */
async function analyzeSingleAgentDirectory(
  dir: FileSystemDirectoryHandle,
): Promise<AgentInfo | null> {
  const names = ['AGENT.md', 'agent.md', 'AGENT.json', 'agent.json'];
  for (const fileName of names) {
    const content = await readFile(dir, fileName);
    if (content === null) continue;
    const fields = fileName.endsWith('.json')
      ? parseJsonDefinition(content)
      : content ? parseFrontmatter(content).fields : {};
    return {
      description: readString(fields.description) ?? extractDescription(content),
      fileName,
      name: readString(fields.name) ?? dir.name,
      path: fileName,
      subAgents: readStringArray(fields.subAgents ?? fields.subagents),
      content,
    };
  }
  return null;
}

/** 扫描 rules 目录(.md 规则文件) */
export async function analyzeRules(
  root: FileSystemDirectoryHandle,
): Promise<RuleInfo[]> {
  const out: RuleInfo[] = [];
  for await (const [name, child] of root.entries()) {
    if (child.kind !== 'file') continue;
    if (!name.endsWith('.md') && !name.endsWith('.txt')) continue;
    const handle = child as FileSystemFileHandle;
    const file = await handle.getFile();
    const content = await file.text();
    out.push({
      content,
      description: extractDescription(content),
      name,
      path: name,
    });
  }
  return out;
}

/** 一站式扫描(skills + agents + rules) */
export async function analyzeProject(
  root: FileSystemDirectoryHandle,
): Promise<ProjectAnalysis> {
  const [skills, agents, rules] = await Promise.all([
    analyzeSkills(root),
    analyzeAgents(root),
    analyzeRules(root),
  ]);
  return {
    agents,
    availableFolders: [],
    basePath: root.name ?? '',
    rules,
    skills,
  };
}