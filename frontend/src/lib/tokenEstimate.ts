/**
 * 统一 Token 估算(lib/tokenEstimate)
 * - cl100k_base 近似: 中文 ~0.6 token/字, 英文 ~0.75 token/词(约 4 字符/词), 代码符号 ~0.3, 其余 ~0.25
 * - 全仓唯一实现: ChatInput / useChatStreaming / lib/cache/compact 共用,禁止再拷贝副本
 */

/** 估算文本 Token 数 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/\p{Script=Han}/gu) || []).length;
  // 单次遍历同时累计英文 token 数与字符数
  let englishTokens = 0;
  let englishChars = 0;
  for (const w of text.match(/[a-z]+/gi) || []) {
    englishChars += w.length;
    englishTokens += Math.ceil(w.length / 4);
  }
  const codeChars = (text.match(/[{}\[\]()=;:<>`~!@#$%^&*+\-|\\/]/g) || [])
    .length;
  // 扣除已归类的中文/英文字母/代码符号,剩余为数字/空格/标点/emoji 等
  const otherChars = Math.max(
    0,
    [...text].length - chineseChars - englishChars - codeChars,
  );
  return Math.ceil(
    chineseChars * 0.6 +
      englishTokens * 0.75 +
      codeChars * 0.3 +
      otherChars * 0.25,
  );
}
