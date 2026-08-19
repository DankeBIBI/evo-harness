/**
 * 缓存前缀形状快照(lib/cache/prefixShape)
 * - 作用: 每轮开始前对 "system prompt + tools schema" 取哈希,turn 结束后与上轮对比
 * - 哈希变化则标记前缀失效,提示缓存重建
 * - 与 Go services/cache/prefix_shape.go 1:1 迁移
 */

/** 工具 schema 摘要(参与 toolsHash 计算) */
export interface ToolSchemaLike {
  description: string;
  name: string;
  parameters: Record<string, unknown>;
}

/** 缓存前缀形状快照 */
export interface PrefixShape {
  /** 系统提示词 SHA256 前 16 字节(hex) */
  systemHash: string;
  /** 工具 schema 规范化后 SHA256 前 16 字节(hex) */
  toolsHash: string;
  /** systemHash + toolsHash 联合哈希(用于快速对比) */
  prefixHash: string;
  /** 会话重写版本号(compaction 后递增,强制下次重建) */
  rewriteVer: number;
}

/** 前缀变化原因 */
export type ChangedReason =
  | 'system'
  | 'tools'
  | 'log_rewrite'
  | 'unchanged';

/** 缓存诊断结果 */
export interface CacheDiagnostics {
  /** 前缀是否变化 */
  prefixChanged: boolean;
  /** 变化原因 */
  reason: ChangedReason;
  /** 当前快照 */
  currentShape: PrefixShape;
}

/** 计算字符串 SHA256,取前 16 字节 hex 编码 */
async function hashString(s: string): Promise<string> {
  if (!s) return '';
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 规范化工具 schema 列表后取哈希(先按 name 排序保证内容一致则哈希一致) */
async function hashToolSchemas(schemas: ToolSchemaLike[]): Promise<string> {
  if (schemas.length === 0) return '';
  const sorted = [...schemas].sort((a, b) => a.name.localeCompare(b.name));
  const combined = sorted
    .map((s) => JSON.stringify({ description: s.description, name: s.name, parameters: s.parameters }))
    .join('\x00');
  return hashString(combined);
}

/** 采集当前前缀快照 */
export async function captureShape(
  systemPrompt: string,
  toolSchemas: ToolSchemaLike[],
  ver: number,
): Promise<PrefixShape> {
  const sysHash = await hashString(systemPrompt);
  const tHash = await hashToolSchemas(toolSchemas);
  const combined = `${sysHash}|${tHash}|${ver}`;
  return {
    systemHash: sysHash,
    toolsHash: tHash,
    prefixHash: await hashString(combined),
    rewriteVer: ver,
  };
}

/** 对比两轮快照,返回诊断结果 */
export async function compareShape(
  prev: PrefixShape,
  cur: PrefixShape,
): Promise<CacheDiagnostics> {
  if (prev.prefixHash === cur.prefixHash) {
    return { prefixChanged: false, reason: 'unchanged', currentShape: cur };
  }
  let reason: ChangedReason = 'unchanged';
  if (prev.rewriteVer !== cur.rewriteVer) {
    reason = 'log_rewrite';
  } else if (prev.systemHash !== cur.systemHash) {
    reason = 'system';
  } else if (prev.toolsHash !== cur.toolsHash) {
    reason = 'tools';
  }
  return { prefixChanged: true, reason, currentShape: cur };
}
