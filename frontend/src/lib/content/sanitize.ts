/**
 * 防注入(lib/content/sanitize)
 * - 截断控制字符(\x00-\x08 等)
 * - 剔除 RTL override 等不可见字符
 * - HTML 转义只在最终渲染层做,不影响 prompt
 */

const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
const RTL_OVERRIDES = /[\u202a-\u202e\u2066-\u2069]/g;

/** 剔除控制字符与 RTL 覆盖字符(保护代码块内容不受影响) */
export function sanitize(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(RTL_OVERRIDES, '');
}
