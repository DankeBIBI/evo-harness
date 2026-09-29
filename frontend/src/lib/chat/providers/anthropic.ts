/**
 * Anthropic Messages Provider(lib/chat/providers/anthropic)
 * - Messages + SSE + cache_control: ephemeral 自动
 * - 命中率走 usage.cache_read_input_tokens
 */

import type { ChatMessage } from "../protocol";
import type { ChatProvider, ProviderModel } from "./base";
import { getModelCapabilities } from "./capabilities";

/** Anthropic 请求(extends 全局基座 + 自有历史消息) */
export interface AnthropicChatRequestLike extends StreamChatRequestLike {
	/** 历史消息(Anthropic messages 数组) */
	history?: Array<ChatMessage>;
}

/** 组装 Anthropic Messages 请求体 */
export function buildAnthropicBody(
	req: AnthropicChatRequestLike,
	model: ProviderModel,
): Record<string, unknown> {
	const messages: Array<Record<string, unknown>> = [];
	const capabilities = getModelCapabilities(model);
	// Anthropic 协议要点:
	//   - system 走顶级 system 字段,不在 messages 里
	//   - tool_result 必须是 user message 的 content 数组项,不是独立 tool role
	//   - tool_use 必须是 assistant message 的 content 数组项
	//   - 多个 tool_result 必须合并到同一个 user message:
	//     "all tool_result blocks within a single user message"
	//   - user/assistant 必须严格交替:连续同角色必须合并,否则 400 "roles must alternate"
	const appendToolResult = (m: {
		content: string;
		toolCallId?: string;
		id?: string;
	}) => {
		const block = {
			content: m.content,
			tool_use_id: m.toolCallId ?? m.id ?? "",
			type: "tool_result",
		};
		const last = messages[messages.length - 1];
		// 上一条是 user 且 content 是数组(说明也是 tool_result 来源)→ 追加
		if (last?.role === "user" && Array.isArray(last.content)) {
			(last.content as Record<string, unknown>[]).push(block);
		} else {
			messages.push({ content: [block], role: "user" });
		}
	};
	/** 追加纯文本 user 消息;若上一条已是 user 则合并(Anthropic 要求交替) */
	const pushUserText = (text: string) => {
		const last = messages[messages.length - 1];
		if (last?.role === "user") {
			if (Array.isArray(last.content)) {
				(last.content as Record<string, unknown>[]).push({
					text,
					type: "text",
				});
			} else {
				last.content = [
					{ text: last.content as string, type: "text" },
					{ text, type: "text" },
				];
			}
		} else {
			messages.push({ content: text, role: "user" });
		}
	};
	const pushAssistant = (m: {
		content: string;
		providerContentBlocks?: Array<Record<string, unknown>>;
		toolCalls?: Array<{
			id: string;
			input: Record<string, unknown>;
			toolName: string;
		}>;
	}) => {
		const blocks: Record<string, unknown>[] = m.providerContentBlocks?.length
			? m.providerContentBlocks.map((block) => ({ ...block }))
			: [];
		const toolCallsById = new Map((m.toolCalls ?? []).map((tc) => [tc.id, tc]));
		const rawToolUseIds = new Set<string>();
		for (const block of blocks) {
			if (block.type !== "tool_use") continue;
			const id = String(block.id ?? "");
			if (id) rawToolUseIds.add(id);
			const call = toolCallsById.get(id);
			if (call) {
				block.input = call.input;
				block.name = call.toolName;
			}
		}
		const hasRawText = blocks.some((block) => block.type === "text");
		if (m.content && !hasRawText) blocks.push({ text: m.content, type: "text" });
		(m.toolCalls ?? []).filter((tc) => !rawToolUseIds.has(tc.id)).forEach((tc) => {
			blocks.push({
				id: tc.id,
				input: tc.input,
				name: tc.toolName,
				type: "tool_use",
			});
		});
		if (blocks.length === 0) return;
		const last = messages[messages.length - 1];
		if (last?.role === "assistant") {
			// 连续 assistant → 合并 blocks(Anthropic 要求交替)
			(last.content as Record<string, unknown>[]).push(...blocks);
		} else {
			messages.push({ content: blocks, role: "assistant" });
		}
	};
	(req.history ?? []).forEach((m) => {
		if (m.role === "user") pushUserText(m.content);
		else if (m.role === "assistant") pushAssistant(m);
		else if (m.role === "tool") appendToolResult(m);
	});
	(req.continuationMessages ?? []).forEach((m) => {
		if (m.role === "assistant") pushAssistant(m);
		else if (m.role === "tool") appendToolResult(m);
	});
	const historyMessageCount = messages.length;
	// 当前 user 消息仅在初始请求追加；工具续传以 tool_result 作为末条 user 内容。
	if (req.appendCurrentUser !== false) pushUserText(req.message);

	const tools = (req.toolsSchema ?? []).map((t) => ({
		description: t.description,
		input_schema: t.parameters,
		name: t.name,
	}));
	if (capabilities.promptCache === "anthropic-explicit" && tools.length > 0) {
		Object.assign(tools[tools.length - 1], {
			cache_control: { type: "ephemeral" },
		});
	}

	/** 在历史尾部设置增量缓存断点；连同 tools/system 总数不超过 Anthropic 的 4 个。 */
	if (capabilities.promptCache === "anthropic-explicit" && historyMessageCount > 0) {
		const candidates = [historyMessageCount - 1];
		// 超过约 20 个内容块时补一个较早断点，避免回溯窗口失效。
		let blockCount = 0;
		for (let i = historyMessageCount - 1; i >= 0; i--) {
			const content = messages[i].content;
			blockCount += Array.isArray(content) ? content.length : 1;
			if (blockCount >= 18) {
				candidates.unshift(i);
				break;
			}
		}
		for (const index of [...new Set(candidates)].slice(-2)) {
			const message = messages[index];
			if (Array.isArray(message.content)) {
				const blocks = message.content as Record<string, unknown>[];
				if (blocks.length > 0) {
					blocks[blocks.length - 1] = {
						...blocks[blocks.length - 1],
						cache_control: { type: "ephemeral" },
					};
				}
			} else if (typeof message.content === "string") {
				message.content = [
					{
						cache_control: { type: "ephemeral" },
						text: message.content,
						type: "text",
					},
				];
			}
		}
	}

	const staticSystem = req.systemStatic ?? req.role ?? "";
	const dynamicSystem = req.systemContext ?? "";
	const systemBlocks: Array<Record<string, unknown>> = [];
	if (staticSystem) {
		systemBlocks.push({
			...(capabilities.promptCache === "anthropic-explicit"
				? { cache_control: { type: "ephemeral" } }
				: {}),
			text: staticSystem,
			type: "text",
		});
	}
	if (dynamicSystem) systemBlocks.push({ text: dynamicSystem, type: "text" });

	return {
		max_tokens: (req.modelConfig?.maxTokens as number) ?? 4096,
		messages,
		// 2026-08-17 修复:用 model.name 而非 req.modelId
		// 根因 — ChatService 走 fallback 时 req.modelId 可能为空串,
		//          此时发到 Anthropic 的 model="" 会触发 400 "unknown model"
		model: model.name,
		stream: true,
		// 主动缓存:system 段标 cache_control ephemeral,命中率由 usage.cache_read_input_tokens 统计
		system: systemBlocks.length > 0 ? systemBlocks : undefined,
		tools: tools.length > 0 ? tools : undefined,
	};
}

/** Anthropic Provider 实现 */
export class AnthropicProvider implements ChatProvider {
	readonly name = "anthropic";
	readonly isAnthropic = true;
	private sawInitialUsage = false;

	buildUrl(model: ProviderModel): string {
		return `${model.baseUrl.replace(/\/+$/, "")}/v1/messages`;
	}

	buildHeaders(model: ProviderModel): Record<string, string> {
		return {
			"Content-Type": "application/json",
			"anthropic-version": "2023-06-01",
			Authorization: `Bearer ${model.apiKey ?? ""}`,
		};
	}

	buildBody(
		req: AnthropicChatRequestLike,
		model: ProviderModel,
	): Record<string, unknown> {
		return buildAnthropicBody(req, model);
	}

	/** Anthropic 的 data: 行一般无独立语义,交由 handleEvent 配对处理 */
	handleChunk(_payload: Record<string, unknown>, _cb: StreamCallbacks): void {
		// no-op: 事件由 handleEvent 处理
	}

	/** Anthropic 事件解析(event: 行 + data: 行配对) */
	handleEvent(
		event: string,
		payload: Record<string, unknown>,
		cb: StreamCallbacks,
	): void {
		// content_block_start: tool_use 的 id/name 在此事件携带
		// 注意: 流式下参数只由 content_block_delta.partial_json 增量提供,start 的 input 恒为空对象,
		//       序列化会污染 args(如 '{}' 前缀),故 args 一律置空
		if (event === "content_block_start") {
			const block = payload.content_block as {
				id?: string;
				name?: string;
				type?: string;
			};
			if (block?.type) {
				cb.onAssistantMetadata?.({
					contentBlock: block as Record<string, unknown>,
					contentBlockIndex: (payload.index as number) ?? 0,
					phase: "start",
				});
			}
			if (block?.type === "tool_use" && block.name) {
				cb.onToolCall({
					args: "",
					finished: false,
					index: (payload.index as number) ?? 0,
					name: block.name,
					toolId: block.id,
				});
			}
			return;
		}
		if (event === "content_block_delta") {
			const delta = payload.delta as {
				partial_json?: string;
				text?: string;
				thinking?: string;
				type?: string;
			};
			if (delta) {
				cb.onAssistantMetadata?.({
					contentBlock: delta as Record<string, unknown>,
					contentBlockIndex: (payload.index as number) ?? 0,
					phase: "delta",
				});
			}
			if (delta?.text) {
				cb.onContent(delta.text);
			}
			if (delta?.partial_json) {
				cb.onToolCall({
					args: delta.partial_json,
					finished: false,
					index: (payload.index as number) ?? 0,
					name: "",
					toolId: `tool-${(payload.index as number) ?? 0}`,
				});
			}
			return;
		}
		if (event === "content_block_stop") {
			cb.onAssistantMetadata?.({
				contentBlockIndex: (payload.index as number) ?? 0,
				phase: "stop",
			});
			cb.onToolCall({
				args: "",
				finished: true,
				index: (payload.index as number) ?? 0,
				name: "",
				toolId: `tool-${(payload.index as number) ?? 0}`,
			});
			return;
		}
		if (event === "message_delta") {
			const usage = payload.usage as {
				cache_creation_input_tokens?: number;
				cache_read_input_tokens?: number;
				input_tokens?: number;
				output_tokens?: number;
			};
			if (usage) {
				cb.onUsage?.({
					cacheCreation: this.sawInitialUsage
						? 0
						: (usage.cache_creation_input_tokens ?? 0),
					cacheRead: this.sawInitialUsage
						? 0
						: (usage.cache_read_input_tokens ?? 0),
					costCny: 0,
					input: usage.input_tokens,
					output: usage.output_tokens,
				});
			}
			return;
		}
		if (event === "message_start") {
			const usage = (payload.message as { usage?: Record<string, number> })
				?.usage;
			if (usage) {
				this.sawInitialUsage = true;
				cb.onUsage?.({
					cacheCreation: usage.cache_creation_input_tokens ?? 0,
					cacheRead: usage.cache_read_input_tokens ?? 0,
					costCny: 0,
					input: usage.input_tokens ?? 0,
					output: usage.output_tokens ?? 0,
				});
			}
			return;
		}
		// 2026-08-17 修复:message_stop 表示完整对话结束 → 触发 onDone
		// 之前未触发 → UI 永远停在 streaming
		if (event === "message_stop") {
			cb.onDone();
			return;
		}
	}
}
