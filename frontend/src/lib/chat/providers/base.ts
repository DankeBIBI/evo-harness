/**
 * Provider 抽象(lib/chat/providers/base)
 * - Provider 接口:构建请求体 + 解析流事件
 * - 本轮实现:openai(兼容层) + anthropic(Messages)
 */

import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai";

/** 模型配置(来自 modelStore) */
export interface ProviderModel {
	apiKey?: string;
	baseUrl: string;
	name: string;
	provider: string;
	[key: string]: unknown;
}

/** Provider 接口 */
export interface ChatProvider {
	/** 识别名 */
	readonly name: string;
	/** 是否为 Anthropic Messages 协议(影响 URL/事件解析) */
	readonly isAnthropic: boolean;
	/** 构建请求 URL */
	buildUrl(model: ProviderModel): string;
	/** 构建请求头 */
	buildHeaders(model: ProviderModel): Record<string, string>;
	/** 构建请求体 */
	buildBody(
		req: StreamChatRequestLike,
		model: ProviderModel,
	): Record<string, unknown>;
	/** 解析单个 SSE 数据块并回调(OpenAI:每行 JSON;Anthropic:event+data 配对) */
	handleChunk(payload: Record<string, unknown>, cb: StreamCallbacks): void;
	/** Anthropic 特有:处理事件名(data 前的 event: 行) */
	handleEvent?(
		event: string,
		payload: Record<string, unknown>,
		cb: StreamCallbacks,
	): void;
	/** 流结束后采集前缀形状(诊断用) */
	captureShape?(req: StreamChatRequestLike): Promise<unknown>;
}

/** 按模型 provider 识别符创建对应 Provider 实例 */
export function createProvider(providerName: string): ChatProvider {
	if (providerName === "anthropic") {
		return new AnthropicProvider();
	}
	return new OpenAICompatibleProvider();
}
