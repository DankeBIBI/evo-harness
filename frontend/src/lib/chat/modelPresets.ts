export interface ModelTokenPreset {
	maxInputTokens: number;
	maxOutputTokens: number;
}

const DEFAULT_PRESET: ModelTokenPreset = {
	maxInputTokens: 128_000,
	maxOutputTokens: 8_192,
};

/** Known context limits used when adding a model; users can still edit them later. */
export function getModelTokenPreset(modelName: string): ModelTokenPreset {
	const name = modelName.toLowerCase();
	if (/^minimax-m3(?:\b|-)/i.test(modelName)) {
		return { maxInputTokens: 1_000_000, maxOutputTokens: 8_192 };
	}
	if (/^minimax-m2(?:\b|\.)/i.test(modelName)) {
		return { maxInputTokens: 204_800, maxOutputTokens: 8_192 };
	}
	if (name.includes("m2-her")) {
		return { maxInputTokens: 65_536, maxOutputTokens: 8_192 };
	}
	return DEFAULT_PRESET;
}