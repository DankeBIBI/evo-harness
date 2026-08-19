/**
 * 空白/换行/控制字符归一(lib/content/normalize)
 * - 折叠 3+ 连续空行 → 1
 * - 去 BOM / 零宽字符
 * - 统一 LF
 */

const ZERO_WIDTH = /[\u200b-\u200f\u2028\u2029\ufeff]/g;
const BOM = /^\uFEFF/;

/** 归一文本(折叠连续空行、去 BOM/零宽、统一 LF) */
export function normalize(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(BOM, '')
    .replace(ZERO_WIDTH, '')
    .replace(/\n{3,}/g, '\n\n');
}
