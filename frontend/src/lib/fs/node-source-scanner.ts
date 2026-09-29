/**
 * Node 文件服务源扫描(lib/fs/node-source-scanner)
 * - 在 dev 环境(VS Code SimpleBrowser / WebView2 等不支持 showDirectoryPicker 的浏览器)走 Node 文件服务
 * - 直接以 file-server.mjs 的项目根为基座扫描,无需任何用户授权弹窗
 * - 与 lib/fs/source-scanner.ts 共用 ProjectAnalysis / analyzeProject 抽象
 */

import { isNodeServerAvailable, nodeFs } from './nodeAdapter';
import type { AgentInfo, ProjectAnalysis, RuleInfo, SkillInfo } from './scanner';
import type { ScanSource } from './source-scanner';

const PROJECT_ROOT_NAME = 'project';

const SCAN_TARGETS: Record<ScanSource, string[]> = {
  project: ['skills', 'agents'],
  user: ['skills', 'agents'],
  'claude-project': ['.claude/agents', '.claude/skills', 'agents', 'skills'],
  'claude-user': ['.claude/agents', '.claude/skills', 'agents', 'skills'],
};

/** 把项目根相对路径解析成 { name, path }。 */
function rootNameFromPath(rootPath: string): string {
  const trimmed = rootPath.replace(/\\/g, '/').replace(/\/+$/g, '');
  if (!trimmed) return PROJECT_ROOT_NAME;
  const last = trimmed.split('/').filter(Boolean).pop();
  return last || PROJECT_ROOT_NAME;
}

/** 解析所选目录条目(允许是文件,文件返回 fileName) */
function toEntry(item: { name: string; isDir: boolean }): { fileName: string; isDir: boolean } {
  return { fileName: item.name, isDir: item.isDir };
}

/** 在多个候选根(.claude、用户主目录等)中合并 skills/agents。 */
async function collectFromRoots(roots: string[]): Promise<{ skills: SkillInfo[]; agents: AgentInfo[]; rules: RuleInfo[]; basePath: string }> {
  const skills: SkillInfo[] = [];
  const agents: AgentInfo[] = [];
  const rules: RuleInfo[] = [];
  const seenSkill = new Set<string>();
  const seenAgent = new Set<string>();
  let basePath = '';

  for (const root of roots) {
    if (basePath === '') basePath = root;
    const skillEntries = await listIfDir(`${root}/skills`);
    for (const raw of skillEntries) {
      const item = toEntry(raw);
      if (item.isDir) {
        const found = await scanSkillDir(`${root}/skills/${item.fileName}`);
        if (found && !seenSkill.has(found.path)) {
          skills.push(found);
          seenSkill.add(found.path);
        }
      } else if (item.fileName.endsWith('.md') || item.fileName.endsWith('.json')) {
        const content = await readIfFile(`${root}/skills/${item.fileName}`);
        if (content === null) continue;
        const path = `${root}/skills/${item.fileName}`;
        if (seenSkill.has(path)) continue;
        const fields = item.fileName.endsWith('.json')
          ? parseJsonDefinition(content)
          : parseFrontmatter(content).fields;
        skills.push({
          description: readString(fields.description) ?? extractDescription(content),
          name: readString(fields.name) ?? item.fileName.replace(/\.(md|json)$/i, ''),
          path,
          rules: readStringArray(fields.rules),
          content,
        });
        seenSkill.add(path);
      }
    }

    const agentEntries = await listIfDir(`${root}/agents`);
    for (const raw of agentEntries) {
      const item = toEntry(raw);
      const found = await scanAgentPath(`${root}/agents/${item.fileName}`, item.isDir, item.fileName);
      if (found && !seenAgent.has(found.path)) {
        agents.push(found);
        seenAgent.add(found.path);
      }
    }

    const ruleEntries = await listIfDir(root);
    for (const item of ruleEntries) {
      if (item.isDir) continue;
      if (!item.name.endsWith('.md') && !item.name.endsWith('.txt')) continue;
      const content = await readIfFile(`${root}/${item.name}`);
      if (content === null) continue;
      rules.push({
        content,
        description: extractDescription(content),
        name: item.name,
        path: `${root}/${item.name}`,
      });
    }
  }

  return { agents, basePath, rules, skills };
}

/** 读取目录下的一层条目(空目录/不存在返回空)。 */
async function listIfDir(relPath: string): Promise<Array<{ name: string; isDir: boolean }>> {
  try {
    const items = await nodeFs.list(relPath);
    return items.map((item) => ({ isDir: item.isDir, name: item.name }));
  } catch {
    return [];
  }
}

async function readIfFile(relPath: string): Promise<string | null> {
  try {
    return await nodeFs.read(relPath);
  } catch {
    return null;
  }
}

/** 探测 file-server 是否已注册受信任的额外根(例如 ~/.claude)。 */
async function getTrustedExtraRoots(): Promise<string[]> {
  try {
    const res = await fetch(`${(await import('./nodeAdapter')).NODE_SERVER_URL}/api/health`);
    const data = (await res.json()) as
      | { extraRoots?: Array<{ name?: string; path?: string } | string> }
      | undefined;
    const list = data?.extraRoots ?? [];
    return list
      .map((entry) => (typeof entry === 'string' ? entry : entry?.path))
      .filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

/** 在受信任根里的相对路径(用于前缀 @trusted/0/...) */
function trustedRel(extraIndex: number, tail: string): string {
  return `@trusted/${extraIndex}/${tail}`.replace(/\/+$/g, '');
}

/** 解析 frontmatter / JSON 中字段的最小实现,避免与 lib/fs/frontmatter 重复导入。 */
function parseFrontmatter(content: string): { fields: Record<string, unknown> } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { fields: {} };
  const lines = match[1].split(/\r?\n/);
  const fields: Record<string, unknown> = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    if (!key) continue;
    if (raw.startsWith('[') && raw.endsWith(']')) {
      fields[key] = raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      fields[key] = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  }
  return { fields };
}

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

function extractDescription(content: string): string {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\r?\n?/, '');
  for (const line of withoutFrontmatter.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    if (text.startsWith('#') || text.startsWith('//') || text.startsWith('/*')) continue;
    return text.slice(0, 200);
  }
  return '';
}

async function readRules(rulesDir: string): Promise<string[]> {
  const items = await listIfDir(rulesDir);
  return items
    .filter((item) => !item.isDir && (item.name.endsWith('.md') || item.name.endsWith('.txt')))
    .map((item) => item.name);
}

/** 扫描单个 Skill 目录(对应 skills/<name>/SKILL.md|SKILL.json)。 */
async function scanSkillDir(relDir: string): Promise<SkillInfo | null> {
  const md = await readIfFile(`${relDir}/SKILL.md`);
  const json = md === null ? await readIfFile(`${relDir}/SKILL.json`) : null;
  const content = md ?? json;
  if (content === null) return null;
  const fields = json !== null ? parseJsonDefinition(json) : parseFrontmatter(content).fields;
  const rules = await readRules(`${relDir}/rules`);
  const dirName = relDir.split('/').pop() || relDir;
  return {
    description: readString(fields.description) ?? extractDescription(content),
    name: readString(fields.name) ?? dirName,
    path: `${relDir}/${json !== null ? 'SKILL.json' : 'SKILL.md'}`,
    rules: [...new Set([...rules, ...readStringArray(fields.rules)])],
    content,
  };
}

/** 扫描单个 Agent 目录或文件(对应 agents/<name>/AGENT.md|AGENT.json,或 agents/<name>.md|json)。 */
async function scanAgentPath(relPath: string, isDir: boolean, entryName: string): Promise<AgentInfo | null> {
  if (!isDir) {
    if (!entryName.endsWith('.md') && !entryName.endsWith('.json')) return null;
    const content = await readIfFile(relPath);
    if (content === null) return null;
    const fields = entryName.endsWith('.json')
      ? parseJsonDefinition(content)
      : parseFrontmatter(content).fields;
    return {
      description: readString(fields.description) ?? extractDescription(content),
      fileName: entryName,
      name: readString(fields.name) ?? entryName.replace(/\.(md|json)$/i, ''),
      path: relPath,
      subAgents: readStringArray(fields.subAgents ?? fields.subagents),
      content,
    };
  }
  for (const candidate of ['AGENT.md', 'agent.md', 'AGENT.json', 'agent.json']) {
    const content = await readIfFile(`${relPath}/${candidate}`);
    if (content === null) continue;
    const fields = candidate.endsWith('.json')
      ? parseJsonDefinition(content)
      : parseFrontmatter(content).fields;
    const subEntries = await listIfDir(`${relPath}/agents`);
    const subAgents = subEntries.filter((item) => item.isDir).map((item) => item.name);
    return {
      description: readString(fields.description) ?? extractDescription(content),
      fileName: candidate,
      name: readString(fields.name) ?? entryName,
      path: `${relPath}/${candidate}`,
      subAgents: [...new Set([...subAgents, ...readStringArray(fields.subAgents ?? fields.subagents)])],
      content,
    };
  }
  return null;
}

/** 通过 Node 文件服务分析当前项目根的 Agent/Skill。 */
export async function analyzeProjectFromNode(
  source: ScanSource = 'project',
): Promise<ProjectAnalysis | null> {
  if (!(await isNodeServerAvailable())) return null;
  const health = await (await fetch(`${(await import('./nodeAdapter')).NODE_SERVER_URL}/api/health`))
    .json()
    .catch(() => null) as
    | {
        root?: string;
        rootName?: string;
        extraRoots?: Array<{ name: string; path: string }>;
      }
    | null;
  const projectRoot = health?.root ?? '';
  const projectName = projectRoot ? rootNameFromPath(projectRoot) : PROJECT_ROOT_NAME;

  // 解析“@trusted/N/” 前缀到具体节点(用于访问 ~/.claude 等)
  const extraRoots = health?.extraRoots
    ? health.extraRoots
        .map((entry) => (typeof entry === 'string' ? entry : entry?.path))
        .filter((p): p is string => typeof p === 'string')
    : await getTrustedExtraRoots();
  const claudeTrustedIndex = extraRoots.findIndex(
    (p) => typeof p === 'string' && p.replace(/\\/g, '/').endsWith('/.claude'),
  );

  // 各来源对应扫描根(逐个尝试,缺失即跳过)
  const roots: string[] = [];
  if (source === 'project') {
    roots.push('');
  } else if (source === 'user') {
    const homeEntries = await listIfDir('');
    if (homeEntries.some((e) => e.isDir && e.name === 'home')) roots.push('home');
    if (roots.length === 0) roots.push('');
  } else if (source === 'claude-project') {
    roots.push('.claude', '');
    if (claudeTrustedIndex >= 0) {
      roots.push(trustedRel(claudeTrustedIndex, 'agents'));
      roots.push(trustedRel(claudeTrustedIndex, 'skills'));
    }
  } else if (source === 'claude-user') {
    // 1) 项目内 .claude; 2) file-server 受信任根(一般是 ~/.claude)
    roots.push('.claude', '');
    if (claudeTrustedIndex >= 0) {
      roots.push(trustedRel(claudeTrustedIndex, ''));
      roots.push(trustedRel(claudeTrustedIndex, 'agents'));
      roots.push(trustedRel(claudeTrustedIndex, 'skills'));
    }
  }

  const collected = await collectFromRoots(roots);
  const hasClaude = roots.some((r) => r === '.claude' || r.startsWith('@trusted/'));
  return {
    agents: collected.agents,
    availableFolders: Object.keys(SCAN_TARGETS),
    basePath: hasClaude
      ? `${projectName} (.claude)`
      : projectName,
    rules: collected.rules,
    skills: collected.skills,
  };
}
