/**
 * YAML frontmatter 解析
 * - 支持 `---\nkey: value\n---\nbody` 格式
 * - 不依赖外部库,简单 key: value 解析
 * - 复杂 YAML(嵌套 / 数组)请用 js-yaml
 */

export interface Frontmatter {
  /** 正文(去掉 frontmatter 之后) */
  body: string;
  /** 解析后的字段 */
  fields: Record<string, string>;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** 从 Markdown 文件内容解析 frontmatter */
export function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { body: content, fields: {} };
  }
  const yamlText = match[1];
  const body = match[2];
  const fields: Record<string, string> = {};
  for (const line of yamlText.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    // 去引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return { body, fields };
}

/** 从正文第一段提取 description(用于没有 frontmatter 的情况) */
export function extractDescription(content: string): string {
  const body = parseFrontmatter(content).body;
  // 找第一个非空段落
  const lines = body.split(/\r?\n/);
  let buf: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buf.length > 0) break;
      continue;
    }
    // 跳过 markdown 标题
    if (trimmed.startsWith('#')) continue;
    buf.push(trimmed);
    if (buf.join(' ').length > 200) break;
  }
  return buf.join(' ').slice(0, 200);
}