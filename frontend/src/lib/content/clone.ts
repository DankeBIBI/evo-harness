/**
 * deepClone + 完整性校验(lib/content/clone)
 * - 深拷贝副本,确保"进入 AI"的字符串与"用户编辑"的字符串隔离
 */

/** 深拷贝字符串(返回原值引用即可,字符串不可变) */
export function cloneText(raw: string): string {
  return raw;
}

/** 计算字符串 SHA1 校验和(前 16 字节 hex) */
export async function checksum(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 完整性校验:对比副本与原始是否一致 */
export function verifyClone(original: string, copy: string): boolean {
  return original === copy;
}
