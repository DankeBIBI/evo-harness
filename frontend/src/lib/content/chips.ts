/**
 * chips 解析(lib/content/chips)
 * - `@agent`、`/skill` 与带行号的文件引用解析
 * - 不删原文(原文原样进 prompt)
 */

import type { FileChip } from './types';

/** 解析结果 */
export interface ChipsResult {
  agents: string[];
  skills: string[];
  files: FileChip[];
}

/** 解析 @agent 引用 */
function parseAgents(raw: string): string[] {
  const out = new Set<string>();
  const re = /@([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

/** 解析 /skill 引用 */
function parseSkills(raw: string): string[] {
  const out = new Set<string>();
  const re = /\/(skill|skill)\/([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out.add(m[2]);
  }
  return [...out];
}

/** 解析带起止行号的文件引用 */
function parseFiles(raw: string): FileChip[] {
  const out: FileChip[] = [];
  const seen = new Set<string>();
  const re = /@\[([^\]:]+)(?::(\d+)-(\d+))?\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const path = m[1].trim();
    const key = m[2] ? `${path}:${m[2]}-${m[3]}` : path;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      path,
      range: m[2] && m[3] ? [Number(m[2]), Number(m[3])] : undefined,
    });
  }
  return out;
}

/** 解析全部 chips(不修改原文) */
export function parseChips(raw: string): ChipsResult {
  return {
    agents: parseAgents(raw),
    skills: parseSkills(raw),
    files: parseFiles(raw),
  };
}
