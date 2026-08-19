/**
 * 流式读取封装(lib/chat/stream)
 * - fetch + SSE 行拆分,按 provider 类型路由到对应解析器
 * - 累积 NativeToolCall(index 归并),finished 时回调
 */

import type { ChatProvider, ProviderModel } from "./providers/base";
import { extractEventName, parseSseData, splitLines } from "./sseParser";
import { devLog } from "@/lib/devLog";

/** 累积器内部结构 */
interface AccEntry {
	args: string;
	finished: boolean;
	id: string;
	name: string;
}

/** 流式聊天(核心:发起 fetch + 解析 SSE + 回调) */
export async function streamChat(
	provider: ChatProvider,
	model: ProviderModel,
	req: StreamChatRequestLike,
	cb: StreamCallbacks,
): Promise<void> {
	const url = provider.buildUrl(model);
	const headers = provider.buildHeaders(model);
	const body = provider.buildBody(req, model);

	const toolAcc = new Map<number, AccEntry>();
	let textLen = 0;
	// 2026-08-17:done 事件幂等触发标记,避免流末尾多条 finish_reason 重复回调
	let streamDoneCalled = false;

	const flushTool = (index: number): void => {
		const acc = toolAcc.get(index);
		if (!acc) return;
		cb.onToolCall({
			args: acc.args,
			finished: acc.finished,
			index,
			name: acc.name,
			precedingContentLen: textLen,
			toolId: acc.id,
		});
		if (acc.finished) toolAcc.delete(index);
	};

	// 累积工具调用(OpenAI 按 index 分片)
	// 关键: 只覆盖非空字段,避免后续分片空 name/id 冲掉首分片累积的真实值
	const accumulate = (index: number, patch: Partial<AccEntry>): void => {
		const prev = toolAcc.get(index) ?? {
			args: "",
			finished: false,
			id: `tool-${index}`,
			name: "",
		};
		const next: AccEntry = {
			args: prev.args,
			finished: prev.finished,
			id: prev.id,
			name: prev.name,
		};
		if (patch.args) next.args = prev.args + patch.args;
		if (patch.finished) next.finished = true;
		if (patch.name) next.name = patch.name;
		if (patch.id) next.id = patch.id;
		toolAcc.set(index, next);
	};

	try {
		const resp = await fetch(url, {
			body: JSON.stringify(body),
			headers,
			method: "POST",
			signal: AbortSignal.timeout(
				(req.timeout ?? 0) > 0 ? (req.timeout as number) * 1000 : 600_000,
			),
		});
		if (!resp.ok || !resp.body) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
		}

		const reader = resp.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let pendingEvent = "";

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			// 取消检查:用户点停止后立即停止消费与派发
			if (cb.isCancelled()) return;
			buffer += decoder.decode(value, { stream: true });

			const { lines, rest } = splitLines(buffer);
			buffer = rest;

			for (const line of lines) {
				if (provider.isAnthropic) {
					const event = extractEventName(line);
					if (event !== null) {
						pendingEvent = event;
						continue;
					}
				}
				const payload = parseSseData(line);
				if (!payload) continue;

				if (provider.isAnthropic && pendingEvent) {
					provider.handleEvent?.(pendingEvent, payload, {
						...cb,
						onContent: (t) => {
							textLen += t.length;
							cb.onContent(t);
						},
						onToolCall: (tc) => {
							accumulate(tc.index, {
								args: tc.args,
								finished: tc.finished,
								id: tc.toolId,
								name: tc.name,
							});
							if (tc.finished) flushTool(tc.index);
						},
					});
					pendingEvent = "";
				} else {
					provider.handleChunk(payload, {
						...cb,
						onContent: (t) => {
							textLen += t.length;
							cb.onContent(t);
						},
						onToolCall: (tc) => {
							accumulate(tc.index, {
								args: tc.args,
								finished: tc.finished,
								id: tc.toolId,
								name: tc.name,
							});
							if (tc.finished) flushTool(tc.index);
						},
					});
					// OpenAI 流末尾:finish_reason 触发逻辑
					const choices = payload.choices as
						| Array<{ finish_reason?: string }>
						| undefined;
					const finishReason = choices?.[0]?.finish_reason;
					if (finishReason === "tool_calls") {
						// 累积器仍有未 finished 的工具调用 → 统一收尾 flush
						toolAcc.forEach((_acc, i) => {
							const entry = toolAcc.get(i);
							if (entry && !entry.finished) {
								toolAcc.set(i, { ...entry, finished: true });
								flushTool(i);
							}
						});
					} else if (finishReason) {
						// 2026-08-17 修复:'stop'/'length'/'content_filter' 等终态 finish_reason → 触发 onDone
						// 之前未触发 → UI 永远停在 streaming,不知道何时收尾 assistant 消息
						if (!streamDoneCalled) {
							streamDoneCalled = true;
							cb.onDone();
						}
					}
				}
			}
		}
	} catch (error) {
		// 2026-08-19: 之前是 no-op throw error 透传;加诊断日志便于追溯
		devLog.e("stream", "streamChat failed", { error: String(error) });
		throw error;
	}
}
