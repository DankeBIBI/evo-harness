/** 把当前会话的 messages 序列化为 AI 历史 messages 数组(对齐 OpenAI / Anthropic 协议) */

import type { ChatMessage } from "@/lib/chat/protocol";

/** 历史消息输入(兼容 chatStore.Message 的结构子集,保留工具调用信息以便重建 tool 配对)
 *  - role='tool' 的独立消息用 toolCallId
 *  - assistant 消息用 toolCalls + toolResults(结果挂在 assistant 上,重建时拆成 tool 消息) */
export interface HistoryMessageInput {
	content: string;
	role: string;
	toolCallId?: string;
	toolCalls?: Array<{
		id: string;
		input: Record<string, unknown>;
		toolName: string;
	}>;
	toolResults?: Array<{
		result: unknown;
		toolCallId: string;
	}>;
}

// 2026-07-23: 缩到 6000 字符 — 原 12000 会让"上次任务的 assistant 完整输出"挤掉
const MAX_HISTORY_CHARS = 6_000;

/** 剥掉 <think> 内联思考块(模型自带推理过程,不进历史) */
function stripInlineThinkTags(content: string): string {
	return content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 2026-07-23: 进一步把"工具调用 trace"从历史 assistant 输出里剥掉
 *
 * 流式期间 chatStore.Message.content 里会包含 "已调用 TodoAdd..." "已读文件 xxx"
 * 这类 dev/活动日志,它们是当时的执行回显,不是回答内容;但带进历史会让 AI
 * 误以为"上次任务就是这些工具调用",产生锚定效应。
 */
function stripToolTraceLines(content: string): string {
	const lines = content.split('\n');
	const kept: string[] = [];
	for (const line of lines) {
		const t = line.trim();
		if (/^[\s📄🔧✅❌]*\d*[\s·]*(列出|新增|编辑|删除|切换|更新|调整|清理|查看|读取|搜索|提交计划|已读|已写|已编辑|已删除|已写入).{0,40}\d+\s*ms/i.test(t)) continue;
		if (t.startsWith('📄 ')) continue;
		if (/^=+\s*$/.test(t)) continue;
		kept.push(line);
	}
	return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 工具结果转字符串(与 provider 的 tool 消息 content 一致) */
const stringifyToolResult = (result: unknown): string => {
	if (typeof result === 'string') return result;
	if (result === undefined || result === null) return '';
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
};

/** 把"对话历史"消息数组序列化为 ChatMessage[]（完整轮次截断 + 工具调用对保留）
 *  - 对齐 OpenAI / Anthropic 协议:messages 数组,user/assistant 严格交替
 *  - 2026-08-19: 保留 assistant(tool_calls) → tool 消息配对(不再只留纯文本),
 *    工具上下文不丢失;按"完整轮次"截断,不拆散配对
 *  - 官方权威依据:
 *    - OpenAI: "you store the transcript and send the accumulated `messages` array on each request"
 *    - Anthropic: "you always send the full conversational history to the API"
 */
export function buildHistoryMessages(
	messages: HistoryMessageInput[] | undefined,
): { messages: ChatMessage[]; truncatedCount: number } {
	const empty: { messages: ChatMessage[]; truncatedCount: number } = {
		messages: [],
		truncatedCount: 0,
	};
	if (!messages || !Array.isArray(messages) || messages.length === 0) {
		return empty;
	}

	// 只看 user / assistant / tool(system 不进历史)
	const filtered = messages.filter(
		(m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool',
	);
	if (filtered.length === 0) return empty;

	// 按 user 消息为界切分为完整轮次,保证 assistant(tool_calls)→tool 配对不拆散
	const rounds: HistoryMessageInput[][] = [];
	let cur: HistoryMessageInput[] = [];
	for (const m of filtered) {
		if (m.role === 'user' && cur.length > 0) {
			rounds.push(cur);
			cur = [];
		}
		cur.push(m);
	}
	if (cur.length > 0) rounds.push(cur);

	// 从最新轮往前保留完整轮次(最新轮必保,后续轮超限即停)
	const kept: HistoryMessageInput[] = [];
	let charCount = 0;
	for (let i = rounds.length - 1; i >= 0; i--) {
		const roundChars = rounds[i].reduce((n, m) => {
			// 字符预算含工具调用对(assistant toolCalls input + toolResults 结果)
			let c =
				n + stripInlineThinkTags(stripToolTraceLines(m.content)).length;
			for (const tc of m.toolCalls ?? []) {
				c += JSON.stringify(tc.input ?? {}).length + 40;
			}
			for (const tr of m.toolResults ?? []) {
				c += stringifyToolResult(tr.result).length + 20;
			}
			return c;
		}, 0);
		if (kept.length > 0 && charCount + roundChars > MAX_HISTORY_CHARS) break;
		// push 保持轮内顺序(最新轮在前,最后整体 reverse)
		for (const m of rounds[i]) kept.push(m);
		charCount += roundChars;
	}
	kept.reverse();

	const truncatedCount = filtered.length - kept.length;

	// 转 ChatMessage[] — 保留工具调用对:assistant(tool_calls) 紧跟 tool 消息
	const chatMessages: ChatMessage[] = [];
	for (const m of kept) {
		if (m.role === 'tool') {
			// 独立 tool 消息:仅当前一条 assistant 的 toolCalls 含该 id 时透传,否则丢弃(孤儿 tool_result 会 400)
			const prev = chatMessages[chatMessages.length - 1];
			const paired =
				prev?.role === 'assistant' &&
				(prev.toolCalls ?? []).some((tc) => tc.id === m.toolCallId);
			if (paired) {
				chatMessages.push({
					content: m.content,
					role: 'tool',
					toolCallId: m.toolCallId,
				});
			}
			continue;
		}
		if (m.role === 'assistant') {
			const content = stripToolTraceLines(stripInlineThinkTags(m.content));
			const toolCalls = (m.toolCalls ?? [])
				.filter((tc) => tc.id && tc.toolName)
				.map((tc) => ({
					id: tc.id,
					input: tc.input ?? {},
					toolName: tc.toolName,
				}));
			// 只保留有对应 toolResults 的 toolCalls,否则孤儿 tool_calls 会让 OpenAI 400
			const resultsById = new Map(
				(m.toolResults ?? []).map((r) => [r.toolCallId, r.result]),
			);
			const validToolCalls = toolCalls.filter((tc) =>
				resultsById.has(tc.id),
			);
			if (content || validToolCalls.length > 0) {
				chatMessages.push({
					content,
					role: 'assistant',
					...(validToolCalls.length > 0
						? { toolCalls: validToolCalls }
						: {}),
				});
				// 每个 tool result 拆成独立 tool 消息(紧跟 assistant)
				for (const tc of validToolCalls) {
					chatMessages.push({
						content: stringifyToolResult(resultsById.get(tc.id)),
						role: 'tool',
						toolCallId: tc.id,
					});
				}
			}
			continue;
		}
		// user
		chatMessages.push({
			content: stripToolTraceLines(stripInlineThinkTags(m.content)),
			role: 'user',
		});
	}

	// 重建后校验:Anthropic 要求首条为 user,丢弃前缀 assistant/tool 残留
	while (chatMessages.length > 0 && chatMessages[0].role !== 'user') {
		chatMessages.shift();
	}

	return { messages: chatMessages, truncatedCount };
}
