/** 工具调用反馈（多消息 + 自动超时） */

export interface ChatFeedbackItem {
	createdAt: number;
	id: string;
	text: string;
}

/** 默认超时 3 秒 */
export const CHAT_FEEDBACK_TIMEOUT_MS = 3000;

/** 生成唯一 id（基于时间戳 + 随机后缀） */
export function createChatFeedbackId(): string {
	return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从 items 中过滤掉超时的，返回 [存活, 移除] */
export function partitionExpiredFeedback(
	items: ChatFeedbackItem[],
	now: number = Date.now(),
	timeoutMs: number = CHAT_FEEDBACK_TIMEOUT_MS,
): { active: ChatFeedbackItem[]; expired: ChatFeedbackItem[] } {
	const active: ChatFeedbackItem[] = [];
	const expired: ChatFeedbackItem[] = [];
	for (const item of items) {
		if (now - item.createdAt >= timeoutMs) expired.push(item);
		else active.push(item);
	}
	return { active, expired };
}
