/**
 * OpenAI 兼容 Provider(lib/chat/providers/openai)
 * - Chat Completions + SSE,兼容 OpenAI / DeepSeek / 自定义 BaseURL
 * - 本地 prefixShape 自追踪(无协议级缓存字段)
 */

import type { ChatMessage } from "../protocol";
import type { ChatProvider, ProviderModel } from "./base";

/** OpenAI 兼容请求(extends 全局基座 + 自有历史消息) */
export interface OpenAiChatRequestLike extends StreamChatRequestLike {
	/** 历史消息(OpenAI messages 数组) */
	history?: Array<ChatMessage>;
}

/** 组装 OpenAI 兼容请求体 */
export function buildOpenAiBody(
	req: OpenAiChatRequestLike,
	model: ProviderModel,
): Record<string, unknown> {
	const messages: Array<Record<string, unknown>> = [];
	if (req.role) messages.push({ role: "system", content: req.role });
	// 历史轮次:按 OpenAI 协议顺序排在 system 之后、continuationMessages 之前
	// 替代旧的"⚠️ 对话历史"字符串拼接
	const pushAssistant = (m: {
		content: string;
		toolCalls?: Array<{
			id: string;
			input: Record<string, unknown>;
			toolName: string;
		}>;
	}) => {
		const hasTools = Array.isArray(m.toolCalls) && m.toolCalls.length > 0;
		// 跳过空 content + 无 tool_calls 的 assistant(Groq / Mistral 严格模式会 400)
		if (!m.content && !hasTools) return;
		const item: Record<string, unknown> = {
			role: "assistant",
			content: m.content,
		};
		if (hasTools) {
			item.tool_calls = m.toolCalls!.map((tc) => ({
				function: { arguments: JSON.stringify(tc.input), name: tc.toolName },
				id: tc.id,
				type: "function",
			}));
		}
		messages.push(item);
	};
	const pushTool = (m: {
		content: string;
		toolCallId?: string;
		id?: string;
	}) => {
		messages.push({
			role: "tool",
			content: m.content,
			tool_call_id: m.toolCallId ?? m.id ?? "",
		});
	};
	(req.history ?? []).forEach((m) => {
		if (m.role === "user") messages.push({ role: "user", content: m.content });
		else if (m.role === "assistant") pushAssistant(m);
		else if (m.role === "tool") pushTool(m);
	});
	(req.continuationMessages ?? []).forEach((m) => {
		if (m.role === "assistant") pushAssistant(m);
		else if (m.role === "tool") pushTool(m);
	});
	messages.push({ role: "user", content: req.message });

	const tools = (req.toolsSchema ?? []).map((t) => ({
		function: {
			description: t.description,
			name: t.name,
			parameters: t.parameters,
		},
		type: "function",
	}));

	return {
		messages,
		model: model.name,
		stream: true,
		tools: tools.length > 0 ? tools : undefined,
	};
}

/** OpenAI 兼容 Provider 实现 */
export class OpenAICompatibleProvider implements ChatProvider {
	readonly name = "openai";
	readonly isAnthropic = false;

	buildUrl(model: ProviderModel): string {
		return `${model.baseUrl.replace(/\/+$/, "")}/chat/completions`;
	}

	buildHeaders(model: ProviderModel): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${model.apiKey ?? ""}`,
		};
	}

	buildBody(
		req: OpenAiChatRequestLike,
		model: ProviderModel,
	): Record<string, unknown> {
		return buildOpenAiBody(req, model);
	}

	/** 解析单个 SSE data 块(OpenAI:每行 JSON) */
	handleChunk(payload: Record<string, unknown>, cb: StreamCallbacks): void {
		const choices = payload.choices as Array<{
			delta?: {
				content?: string;
				tool_calls?: Array<{
					function?: { arguments?: string; name?: string };
					id?: string;
					index?: number;
				}>;
			};
			finish_reason?: string;
		}>;
		const choice = choices?.[0];
		if (!choice) return;

		const delta = choice.delta ?? {};
		if (delta.content) {
			cb.onContent(delta.content);
		}
		if (delta.tool_calls && delta.tool_calls.length > 0) {
			// OpenAI 流式 tool_calls 按 index 分片累积,合并后整体回调
			const merged: Array<{
				args: string;
				finished: boolean;
				id: string;
				index: number;
				name: string;
			}> = delta.tool_calls.map((tc) => ({
				args: tc.function?.arguments ?? "",
				finished: choice.finish_reason === "tool_calls",
				id: tc.id ?? "",
				index: tc.index ?? 0,
				name: tc.function?.name ?? "",
			}));
			merged.forEach((tc) => {
				cb.onToolCall({
					args: tc.args,
					finished: tc.finished,
					index: tc.index,
					name: tc.name,
					toolId: tc.id,
				});
			});
		}
	}
}
