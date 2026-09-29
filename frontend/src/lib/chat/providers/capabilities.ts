type CapabilityModel = {
	baseUrl: string;
	name: string;
	provider: string;
};

export type ModelVendor = "anthropic" | "minimax" | "openai" | "unknown";
export type PromptCacheMode = "anthropic-explicit" | "passive" | "none";
export type ReasoningFormat =
	| "anthropic-blocks"
	| "inline-think"
	| "minimax-reasoning-details"
	| "none";

export interface ModelCapabilities {
	promptCache: PromptCacheMode;
	protocol: "anthropic-messages" | "openai-chat";
	preserveReasoningInHistory: boolean;
	reasoningFormat: ReasoningFormat;
	supportsInterleavedThinking: boolean;
	supportsStreamUsage: boolean;
	vendor: ModelVendor;
}

function includesAny(value: string, candidates: string[]): boolean {
	return candidates.some((candidate) => value.includes(candidate));
}

/**
 * Derive protocol extensions from the concrete endpoint/model rather than from
 * the wire protocol alone. Compatible APIs frequently implement only a subset
 * of OpenAI/Anthropic extensions, so unknown endpoints stay conservative.
 */
export function getModelCapabilities(model: CapabilityModel): ModelCapabilities {
	const provider = model.provider.toLowerCase();
	const modelName = model.name.toLowerCase();
	const baseUrl = model.baseUrl.toLowerCase();
	const protocol =
		provider === "anthropic" ? "anthropic-messages" : "openai-chat";

	let vendor: ModelVendor = "unknown";
	if (
		modelName.startsWith("minimax-") ||
		includesAny(baseUrl, ["api.minimax.cn", "api.minimax.io", "api.minimaxi.com"])
	) {
		vendor = "minimax";
	} else if (
		includesAny(baseUrl, ["api.anthropic.com"]) ||
		modelName.startsWith("claude-")
	) {
		vendor = "anthropic";
	} else if (
		provider === "openai" && includesAny(baseUrl, ["api.openai.com"])
	) {
		vendor = "openai";
	}

	const isMiniMaxM3 = vendor === "minimax" && /^minimax-m3(?:\b|-)/i.test(model.name);
	const isMiniMaxM2 = vendor === "minimax" && /^minimax-m2(?:\b|\.)/i.test(model.name);
	const explicitAnthropicCache =
		protocol === "anthropic-messages" &&
		(vendor === "anthropic" || isMiniMaxM2) &&
		!isMiniMaxM3;

	let reasoningFormat: ReasoningFormat = "none";
	if (protocol === "anthropic-messages") reasoningFormat = "anthropic-blocks";
	else if (isMiniMaxM3) reasoningFormat = "minimax-reasoning-details";
	else if (vendor === "minimax") reasoningFormat = "inline-think";

	return {
		promptCache: explicitAnthropicCache
			? "anthropic-explicit"
			: isMiniMaxM3
				? "passive"
				: "none",
		protocol,
		preserveReasoningInHistory: reasoningFormat !== "none",
		reasoningFormat,
		supportsInterleavedThinking:
			reasoningFormat === "anthropic-blocks" || isMiniMaxM3,
		supportsStreamUsage: vendor === "minimax" || vendor === "openai",
		vendor,
	};
}