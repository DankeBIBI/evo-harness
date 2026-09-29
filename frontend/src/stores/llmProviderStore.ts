/**
 * LLM 提供商 store(localStorage + 加密 APIKey)
 * - 提供商是"添加模型"的前置实体:先建提供商(BaseURL/APIKey),再在其下快捷添加模型
 * - 模型仍走 Go ModelService(兼容现有聊天链路),创建时从提供商复制连接信息
 * - APIKey 与模型一致走加密存储,localStorage 只存非敏感字段
 */

import { create } from "zustand";

import type { ModelProvider } from "./modelStore";
import {
	getEncrypted,
	getPlain,
	setEncrypted,
	setPlain,
} from "../lib/storage/secure-storage";

const CACHE_KEY = "llmproviders.cache.v1";
const APIKEY_PREFIX = "llmprovider.apikey.";

/** LLM 提供商(不含 APIKey 明文) */
export interface LlmProvider {
	/** 服务地址 */
	baseUrl: string;
	createdAt: string;
	id: string;
	/** 显示名(如 "OpenAI 官方") */
	name: string;
	/** 协议类型,决定请求适配方式 */
	type: ModelProvider;
}

interface LlmProviderState {
	addProvider: (input: {
		apiKey: string;
		baseUrl: string;
		name: string;
		type: ModelProvider;
	}) => Promise<LlmProvider>;
	deleteProvider: (id: string) => Promise<void>;
	error: null | string;
	fetchProviders: () => Promise<void>;
	/** 读取提供商 APIKey 明文(加密存储) */
	getApiKey: (id: string) => Promise<string>;
	loading: boolean;
	providers: LlmProvider[];
	/** 编辑提供商;apiKey 传空串表示不修改 */
	updateProvider: (
		id: string,
		input: { apiKey: string; baseUrl: string; name: string; type: ModelProvider },
	) => Promise<void>;
}

function loadCache(): LlmProvider[] {
	const raw = getPlain(CACHE_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as LlmProvider[]) : [];
	} catch {
		return [];
	}
}

function saveCache(list: LlmProvider[]): void {
	setPlain(CACHE_KEY, JSON.stringify(list));
}

function genId(): string {
	return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useLlmProviderStore = create<LlmProviderState>((set, get) => ({
	providers: [],
	loading: false,
	error: null,

	fetchProviders: async () => {
		set({ loading: true });
		try {
			set({ providers: loadCache(), error: null });
		} finally {
			set({ loading: false });
		}
	},

	addProvider: async (input) => {
		const provider: LlmProvider = {
			baseUrl: input.baseUrl.trim(),
			createdAt: new Date().toISOString(),
			id: genId(),
			name: input.name.trim() || input.type,
			type: input.type,
		};
		await setEncrypted(APIKEY_PREFIX + provider.id, input.apiKey);
		const next = [...get().providers, provider];
		saveCache(next);
		set({ providers: next });
		return provider;
	},

	deleteProvider: async (id) => {
		// 覆写为空串即视为清除(secure-storage 无删除接口)
		await setEncrypted(APIKEY_PREFIX + id, "");
		const next = get().providers.filter((p) => p.id !== id);
		saveCache(next);
		set({ providers: next });
	},

	getApiKey: (id) => getEncrypted(APIKEY_PREFIX + id).then((v) => v ?? ""),
	updateProvider: async (id, input) => {
		if (input.apiKey) {
			await setEncrypted(APIKEY_PREFIX + id, input.apiKey);
		}
		const next = get().providers.map((p) =>
			p.id === id
				? {
						...p,
						baseUrl: input.baseUrl.trim(),
						name: input.name.trim() || input.type,
						type: input.type,
					}
				: p,
		);
		saveCache(next);
		set({ providers: next });
	},
}));
