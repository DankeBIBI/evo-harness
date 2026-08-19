/**
 * 聊天服务(hostServices/ChatService)
 * - StreamChat: 前端直接调用模型 provider(OpenAI 兼容 + Anthropic Messages),SSE 解析后经 eventBus 派发事件
 * - 事件协议与旧后端一致:content 增量 / tool_call / done / error / cache_usage
 * - 实现委托 lib/chat/(providers + stream)
 */

import { EventsEmit } from "@/lib/hostServices/eventBus";
import { captureShape, type PrefixShape } from "@/lib/cache/prefixShape";
import { streamChat } from "@/lib/chat/stream";
import { createProvider } from "@/lib/chat/providers/base";
import type { NativeToolCall } from "@/lib/chat/protocol";
import { useModelStore } from "@/stores/modelStore";

/** 取消请求标记(按 agentId+convId) */
const cancelFlags = new Map<string, boolean>();

/** 每会话前缀快照(供 diagnostics) */
const shapeStore = new Map<string, PrefixShape>();

/** 取消进行中的流(返回是否命中取消标记) */
export async function CancelChat(
	agentId: string,
	convId: string,
): Promise<boolean> {
	const key = `${agentId}::${convId}`;
	cancelFlags.set(key, true);
	return true;
}

/** 文本增量事件 */
function emitContent(eventName: string, content: string): void {
	EventsEmit(eventName, { content });
}

/** 工具调用事件 */
function emitToolCall(eventName: string, call: NativeToolCall): void {
	EventsEmit(eventName, {
		type: "tool_call",
		args: call.args,
		finished: call.finished,
		index: call.index,
		name: call.name,
		precedingContentLen: call.precedingContentLen,
		toolId: call.toolId,
	});
}

/** 完成事件 */
function emitDone(eventName: string): void {
	EventsEmit(eventName, { done: true });
}

/** 错误事件 */
function emitError(eventName: string, content: string, code = 1): void {
	EventsEmit(eventName, { code, content, error: true });
}

/** 从 modelStore 取选中模型配置 — fallback 到第一个可用模型 */
function resolveModel(req: StreamChatRequestLike) {
	const store = useModelStore.getState();
	const explicitId = req.modelId ?? store.selectedModelId;

	if (explicitId) {
		const model = store.models.find((m) => m.id === explicitId);
		if (model) return model;

		if (!model) {
			return store.models[0];
		}

		throw new Error(`模型 ${explicitId} 未找到,请在模型管理中选择可用模型`);
	}
	// fallback: 未传 modelId 且 store 未选中时, 取第一个可用模型
	const fallback = store.models.find((m) => m.isEnabled) ?? store.models[0];
	if (!fallback) {
		throw new Error("模型未配置,请在模型管理中添加并选择可用模型");
	}
	return fallback;
}

/** 发起流式聊天(核心入口,事件经 eventBus 派发到 req.eventName) */
export async function StreamChat(req: StreamChatRequestLike): Promise<void> {
	const eventName = req.eventName;
	const cancelKey = `${req.agentId}::${req.convId ?? ""}`;

	let model;
	try {
		model = resolveModel(req);
	} catch (error) {
		emitError(
			eventName,
			error instanceof Error ? error.message : String(error),
		);
		throw error;
	}

	const provider = createProvider(model.provider);

	try {
		await streamChat(provider, model, req, {
			isCancelled: () => cancelFlags.get(cancelKey) === true,
			onContent: (text) => emitContent(eventName, text),
			onToolCall: (call) => emitToolCall(eventName, call),
			onUsage: (usage) => {
				EventsEmit(eventName, {
					type: "cache_usage",
					cacheRead: usage.cacheRead,
					cacheCreation: usage.cacheCreation,
					costCny: usage.costCny,
				});
			},
			onDone: () => {
				emitDone(eventName);
			},
			onError: (message, code) => emitError(eventName, message, code),
		});

		if (cancelFlags.get(cancelKey)) {
			cancelFlags.delete(cancelKey);
			return;
		}
		// 采集前缀形状(供缓存诊断),与上轮对比,变化时随 done 事件带出
		const shape = await captureShape(req.role ?? "", req.toolsSchema ?? [], 0);
		const prevShape = shapeStore.get(eventName);
		shapeStore.set(eventName, shape);
		if (prevShape && prevShape.prefixHash !== shape.prefixHash) {
			EventsEmit(eventName, { prefixChanged: true, type: "cache_usage" });
		}
		cancelFlags.delete(cancelKey);
	} catch (error) {
		if (cancelFlags.get(cancelKey)) {
			cancelFlags.delete(cancelKey);
			return;
		}
		const msg = error instanceof Error ? error.message : String(error);
		emitError(eventName, msg);
		cancelFlags.delete(cancelKey);
		throw error;
	}
}
