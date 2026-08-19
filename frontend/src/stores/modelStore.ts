/**
 * 模型 store (带本地缓存层)
 * - 主存储仍在 Go ModelService(供 chat_service 读取)
 * - TS 端 localStorage 缓存,加快 UI 渲染速度、减少 Go 调用
 * - 写操作: write-through(同时更新 Go 和 localStorage)
 * - API Key 加密存储,key 用 name(name 重复时按 name 取最新)
 */

import { create } from "zustand";

import {
	Add,
	Delete,
	List,
	ListAvailableModels,
	Select,
	Test,
	Update,
} from "../lib/hostServices/ModelService";
import {
	getEncrypted,
	getPlain,
	setEncrypted,
	setPlain,
} from "../lib/storage/secure-storage";

const CACHE_KEY = "models.cache.v1";
const APIKEY_BY_ID = "apikey.id.";
const APIKEY_BY_NAME = "apikey.name.";

export type ModelProvider =
	| "anthropic"
	| "copilot"
	| "custom"
	| "gemini"
	| "ollama"
	| "openai";

export interface Model {
	/** APIKey 明文(从加密存储读取);空串表示未配置 */
	apiKey?: string;
	/** API 版本(如 Azure OpenAI 必填) */
	apiVersion?: string;
	/** 服务地址 */
	baseUrl: string;
	createdAt: string;
	id: string;
	isEnabled: boolean;
	maxInputTokens: number;
	maxOutputTokens: number;
	name: string;
	provider: ModelProvider;
	supportsStreaming: boolean;
	supportsToolCall: boolean;
	supportsVision: boolean;
	/** 请求超时(秒),0 表示不超时 */
	timeout: number;
	/** 采样温度 */
	temperature: number;
}

/** localStorage 缓存(不存 API Key) */
type CachedModel = Omit<Model, "apiKey">;

interface ModelState {
	addModel: (model: Omit<Model, "createdAt" | "id">) => Promise<void>;
	deleteModel: (id: string) => Promise<void>;
	error: null | string;
	fetchAvailableModels: (
		baseURL: string,
		apiKey: string,
		provider: string,
	) => Promise<string[]>;
	fetchModels: () => Promise<void>;
	loading: boolean;
	models: Model[];
	selectedModelId: null | string;
	selectModel: (id: null | string) => void;
	testModel: (id: string) => Promise<boolean>;
	updateModel: (id: string, model: Partial<Model>) => Promise<void>;
}

function loadCache(): CachedModel[] {
	const raw = getPlain(CACHE_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as CachedModel[]) : [];
	} catch {
		return [];
	}
}

function saveCache(list: CachedModel[]): void {
	setPlain(CACHE_KEY, JSON.stringify(list));
}

async function readApiKey(modelId: string, modelName: string): Promise<string> {
	const byId = await getEncrypted(APIKEY_BY_ID + modelId);
	if (byId) return byId;
	return (await getEncrypted(APIKEY_BY_NAME + modelName)) ?? "";
}

async function writeApiKey(
	modelId: string,
	modelName: string,
	plain: string,
): Promise<void> {
	if (!plain) return;
	await setEncrypted(APIKEY_BY_ID + modelId, plain);
	await setEncrypted(APIKEY_BY_NAME + modelName, plain);
}

/** 统一 hydration:取缓存或 Go 数据 + 解密 API Key */
async function hydrateModels(input: CachedModel[]): Promise<Model[]> {
	return Promise.all(
		input.map(async (c) => ({
			...c,
			apiKey: await readApiKey(c.id, c.name),
		})),
	);
}

/** Wails 生成的 models.Model 含 convertValues 方法,剥掉后转我们的 Model */
function stripWails(m: Record<string, unknown>): CachedModel {
	const { convertValues: _, ...rest } = m as CachedModel & {
		convertValues?: unknown;
	};
	return rest;
}

export const useModelStore = create<ModelState>((set, get) => ({
	addModel: async (model) => {
		set({ error: null, loading: true });
		try {
			const { apiKey: _ignored, ...payload } = model;
			await Add(payload as Record<string, unknown>);
			// 写 API Key 时还不知道 id,先用 name 作为 key,fetchModels 后会按 id 同步
			if (model.apiKey) {
				await setEncrypted(APIKEY_BY_NAME + model.name, model.apiKey);
			}
			await get().fetchModels();
			// fetchModels 后补一份 id-key(供后续 updateModel/fetchModels 直接命中)
			const fresh = get().models;
			const created = fresh.find((m) => m.name === model.name);
			if (created && model.apiKey) {
				await writeApiKey(created.id, created.name, model.apiKey);
			}
		} catch (error) {
			set({ error: String(error), loading: false });
			throw error;
		}
	},

	deleteModel: async (id) => {
		set({ error: null, loading: true });
		try {
			await Delete(id);
			await get().fetchModels();
		} catch (error) {
			set({ error: String(error), loading: false });
			throw error;
		}
	},

	error: null,

	fetchAvailableModels: async (baseURL, apiKey, provider) => {
		set({ error: null });
		try {
			const result = await ListAvailableModels(baseURL, apiKey, provider);
			return result || [];
		} catch (error) {
			set({ error: String(error) });
			return [];
		}
	},

	fetchModels: async () => {
		set({ error: null, loading: true });
		try {
			const result = (await List()) as unknown as Array<
				Record<string, unknown>
			>;
			const list = (result || []).map(stripWails);
			saveCache(list);
			const hydrated = await hydrateModels(list);
			set({ loading: false, models: hydrated });
		} catch (error) {
			// 降级到 localStorage 缓存
			const cached = loadCache();
			const hydrated = await hydrateModels(cached);
			set({ models: hydrated, error: String(error), loading: false });
		}
	},

	loading: false,

	models: [],

	selectedModelId: null,

	selectModel: async (id) => {
		if (!id) return;
		try {
			await Select(id);
			set({ selectedModelId: id });
			await get().fetchModels();
		} catch (error) {
			set({ error: String(error) });
		}
	},

	testModel: async (id) => {
		try {
			const result: unknown = await Test(id);
			return result === true;
		} catch (error) {
			set({ error: String(error) });
			return false;
		}
	},

	updateModel: async (id, updates) => {
		set({ error: null, loading: true });
		try {
			const current = get().models.find((m) => m.id === id);
			const { apiKey, ...rest } = updates;
			if (apiKey !== undefined && current) {
				await writeApiKey(id, current.name, apiKey);
			}
			await Update(id, rest as Record<string, unknown>);
			await get().fetchModels();
		} catch (error) {
			set({ error: String(error), loading: false });
			throw error;
		}
	},
}));
