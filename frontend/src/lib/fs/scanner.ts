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

/** 扫描 skills 目录(兼容两种形态:子目录 SKILL.md 与单文件 .md) */
export async function analyzeSkills(
  root: FileSystemDirectoryHandle,
): Promise<SkillInfo[]> {
  const out: SkillInfo[] = [];
  let skillsDir: FileSystemDirectoryHandle;
  try {
    skillsDir = await root.getDirectoryHandle('skills');
  } catch {
    return out;
  }

  for await (const [name, child] of skillsDir.entries()) {
    if (child.kind === 'file') {
      // 形态 2: skills/xxx.md — 单个文件即一个 Skill
      if (!name.endsWith('.md')) continue;
      const fileHandle = child as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.text();
      const fields = content ? parseFrontmatter(content).fields : {};
      out.push({
        description: fields.description ?? extractDescription(content),
        name: fields.name ?? name.replace(/\.md$/, ''),
        path: `skills/${name}`,
        rules: [],
        content,
      });
      continue;
    }
    // 形态 1: skills/xxx/SKILL.md — 子目录
    const dir = child as FileSystemDirectoryHandle;
    const skillMd = await readFile(dir, 'SKILL.md');
    if (skillMd === null) continue;
    const fields = skillMd ? parseFrontmatter(skillMd).fields : {};
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
      description: fields.description ?? extractDescription(skillMd ?? ''),
      name: fields.name ?? name,
      path: `skills/${name}`,
      rules,
      content: skillMd ?? '',
    });
  }
  return out;
}

/** 扫描 agents 目录(兼容两种形态:单文件 .md 与子目录 AGENT.md) */
export async function analyzeAgents(
  root: FileSystemDirectoryHandle,
): Promise<AgentInfo[]> {
  const out: AgentInfo[] = [];
  let agentsDir: FileSystemDirectoryHandle;
  try {
    agentsDir = await root.getDirectoryHandle('agents');
  } catch {
    return out;
  }

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
      if (!name.endsWith('.md')) continue;
      const fileHandle = child as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.text();
      const fields = content ? parseFrontmatter(content).fields : {};
      out.push({
        description: fields.description ?? extractDescription(content),
        fileName: name,
        name: fields.name ?? name.replace(/\.md$/, ''),
        path: `agents/${name}`,
        subAgents: [],
        content,
      });
    } else if (child.kind === 'directory') {
      // 形态 2: agents/xxx/AGENT.md — 子目录内 MD 文件
      const dir = child as FileSystemDirectoryHandle;
      const { content, fileName } = await readAgentContent(dir, ['AGENT.md', 'agent.md', 'README.md']);
      if (!content) continue;
      const fields = content ? parseFrontmatter(content).fields : {};
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
        description: fields.description ?? extractDescription(content),
        fileName,
        name: fields.name ?? name,
        path: `agents/${name}`,
        subAgents,
        content,
      });
    }
  }
  return out;
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