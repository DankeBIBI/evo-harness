/**
 * SSE 解析器(lib/chat/sseParser)
 * - OpenAI 兼容:data: 行 JSON 解析
 * - Anthropic:event: 行 + data: 行配对
 */

/** 解析 SSE data 行(去掉 "data:" 前缀,忽略 [DONE]) */
export function parseSseData(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 按 \n 拆行返回完整行数组,残余留回 buffer */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  return { lines, rest };
}

/** 提取 event: 行的值(Anthropic) */
export function extractEventName(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('event:')) return null;
  return trimmed.slice(6).trim();
}
