/**
 * 内容处理器主入口(lib/content/processor)
 * - 所有 user submit 必经此入口: clone → chips → normalize → sanitize → compose
 * - 纯函数 + 副本化,确保 "进入 AI" 与 "用户编辑" 隔离
 */

import { parseChips } from './chips';
import { cloneText } from './clone';
import { compose as composeMarkers } from '../cache/compose';
import { normalize } from './normalize';
import { sanitize } from './sanitize';
import type { ContentContext, ContentResult } from './types';

/** 唯一入口:所有 user submit 都调本函数 */
export function processContent(raw: string, ctx: ContentContext): ContentResult {
  // 1. 副本化(字符串不可变,直接引用即可)
  const original = cloneText(raw);

  // 2. 解析 chips(不删原文)
  const chips = parseChips(raw);

  // 3. 归一(折叠空行 / 去 BOM / 统一 LF)
  const normalized = normalize(raw);

  // 4. 防注入(截断控制字符)
  const cleaned = sanitize(normalized);

  // 5. 按 markers 拼装(Tail Injection 段在 user 头部)
  const composed = composeMarkers({
    userText: cleaned,
    planMode: ctx.markers?.planMode,
    pendingMemory: ctx.markers?.memory,
    bgJobsCompleted: ctx.markers?.bgJobs,
  });

  return { composed, chips, original };
}
