import { useMemo, useRef } from "react";

import type { ToolCall } from "@/stores/chatStore";

/** 文本段：think/output/file */
export interface Segment {
	content: string;
	done: boolean;
	type: "file" | "output" | "think";
	/** 段在 content 中的起始偏移 — 稳定 id,用于 React key(避免 type 变化导致组件重建丢折叠态) */
	start: number;
}

/** 单条工具调用段 — 渲染为一个 ToolCallActivity */
export interface ToolCallSegment {
	done: boolean;
	tc: ToolCall;
	type: "toolcall";
}

/** 连续多个 toolCall 合并后的折叠块 */
export interface ToolGroupSegment {
	tcs: ToolCall[];
	type: "toolgroup";
}

/** 渲染层统一类型 */
export type VisibleSegment = Segment | ToolCallSegment | ToolGroupSegment;

/** 标签常量 — 唯一来源 */
const THINK_START = "<think>";
const THINK_END = "</think>";
const FILE_PREFIX = "@@FILE:";

/** 相邻 ≥ TOOL_GROUP_THRESHOLD 个 toolCall 折成 ToolGroup */
const TOOL_GROUP_THRESHOLD = 3;

/** B2 (2026-09-06): think 标签字符长度 — 后端 textLen 累加原始 content(含标签),
 *  前端 think 段 content 不含标签,需补回才能与 precedingContentLen 坐标同源 */
const THINK_START_TAG_LEN = " thinking".length; // 9
const THINK_END_TAG_LEN = " response".length; // 9

/** 提取 anchor(强类型,不再 as any) */
const getAnchor = (tc: ToolCall): number | undefined => tc._anchor;

/**
 * 解析 content 中的 <think> 与 @@FILE: 块,其余为 output
 * 2026-08-31 优化: 用 indexOf 替代正则,O(n) 单次扫描
 */
export function parseContent(content: string, allDone: boolean): Segment[] {
	const segments: Segment[] = [];
	let buffer = "";
	let bufferStart = 0;
	let inThink = false;
	let i = 0;

	while (i < content.length) {
		if (inThink) {
			const endIdx = content.indexOf(THINK_END, i);
			if (endIdx === -1) {
				buffer += content.slice(i);
				if (buffer) {
					segments.push({
						content: buffer,
						done: allDone,
						start: bufferStart,
						type: "think",
					});
				}
				buffer = "";
				i = content.length;
			} else {
				buffer += content.slice(i, endIdx);
				if (buffer) {
					segments.push({
						content: buffer,
						done: true,
						start: bufferStart,
						type: "think",
					});
					buffer = "";
				}
				i = endIdx + THINK_END.length;
				inThink = false;
			}
			continue;
		}

		if (content.startsWith(THINK_START, i)) {
			if (buffer) {
				segments.push({
					content: buffer,
					done: true,
					start: bufferStart,
					type: "output",
				});
				buffer = "";
			}
			i += THINK_START.length;
			inThink = true;
			bufferStart = i;
			continue;
		}

		// @@FILE: 块 — 用 indexOf 找下一个 @@FILE: 边界
		if (content.startsWith(FILE_PREFIX, i)) {
			if (buffer) {
				segments.push({
					content: buffer,
					done: true,
					start: bufferStart,
					type: "output",
				});
				buffer = "";
			}
			// 从 i+1 起搜下一个 FILE_PREFIX
			const nextIdx = content.indexOf(FILE_PREFIX, i + 1);
			const endIndex = nextIdx > 0 ? nextIdx : content.length;
			segments.push({
				content: content.slice(i, endIndex),
				done: allDone,
				start: i,
				type: "file",
			});
			i = endIndex;
			continue;
		}

		if (buffer === "") bufferStart = i;
		buffer += content[i];
		i++;
	}
	if (buffer) {
		segments.push({
			content: buffer,
			done: allDone,
			start: bufferStart,
			type: "output",
		});
	}
	return segments;
}

/**
 * 把 toolCall 按 _anchor 精确穿插到 output/file 段(不穿插到 think)
 * 2026-08-31 bugfix: 之前 texts 包含 think,导致工具可能错插到 think 内
 * 修复: texts 只取 type !== "think" 段,think 永远独立显示
 * 2026-09-06 B2: 偏移统计改为全量段(含 think),与后端 precedingContentLen 全量坐标对齐;
 *               think 段仍不穿插(anchor 落在 think 内的 tc 追加到末尾)
 */
function interleaveToolCalls(
	textSegments: Segment[],
	tcs: ToolCall[],
): (Segment | ToolCallSegment)[] {
	if (tcs.length === 0) {
		return textSegments;
	}
	// 1) 收集所有段的字符偏移(含 think,与后端全量坐标对齐)
	//    B2: think 段 content 不含标签字符,需补回标签长度(已闭合 +18,未闭合 +9)
	const offsetList: { end: number; seg: Segment; start: number }[] = [];
	let cursor = 0;
	for (const seg of textSegments) {
		const tagLen =
			seg.type === "think"
				? seg.done
					? THINK_START_TAG_LEN + THINK_END_TAG_LEN
					: THINK_START_TAG_LEN
				: 0;
		const len = seg.content.length + tagLen;
		offsetList.push({ end: cursor + len, seg, start: cursor });
		cursor += len;
	}
	// 2) 按 _anchor 升序;无 anchor 排到末尾
	const withAnchor = tcs
		.map((tc) => ({ tc, anchor: getAnchor(tc) }))
		.filter(
			(x): x is { tc: ToolCall; anchor: number } =>
				typeof x.anchor === "number",
		)
		.sort((a, b) => a.anchor - b.anchor);
	const noAnchor = tcs.filter((tc) => typeof getAnchor(tc) !== "number");

	// 3) 合并: 遍历所有段,每段先 push 自身,再 push 落在 [start, end] 的 tc
	//    think 段不穿插(工具调用发生在思考期间,显示在 think 之后)
	//    B2: 闭区间 anchor <= end — 后端 anchor = tool call flush 时的 textLen,
	//        紧跟某段末尾的 tool call anchor 恰等于该段 end,开区间会漏匹配
	const result: (Segment | ToolCallSegment)[] = [];
	let tcIdx = 0;
	for (const { start, end, seg } of offsetList) {
		result.push(seg);
		if (seg.type === "think") continue;
		while (
			tcIdx < withAnchor.length &&
			withAnchor[tcIdx].anchor >= start &&
			withAnchor[tcIdx].anchor <= end
		) {
			const tc = withAnchor[tcIdx].tc;
			result.push({ done: tc.status !== "pending", tc, type: "toolcall" });
			tcIdx++;
		}
	}
	// 4) 剩余的 tc (anchor 越界 / 落在 think 内 / 无 anchor) 追加到末尾
	for (; tcIdx < withAnchor.length; tcIdx++) {
		const tc = withAnchor[tcIdx].tc;
		result.push({ done: tc.status !== "pending", tc, type: "toolcall" });
	}
	for (const tc of noAnchor) {
		result.push({ done: tc.status !== "pending", tc, type: "toolcall" });
	}
	return result;
}

/** 连续 ≥ 3 个 toolCall 折成 ToolGroup,1-2 个还原成单行 */
function mergeToolOps(
	items: (Segment | ToolCallSegment)[],
): VisibleSegment[] {
	const result: VisibleSegment[] = [];
	let toolBucket: ToolCall[] = [];
	const flushBucket = () => {
		if (toolBucket.length === 0) return;
		if (toolBucket.length >= TOOL_GROUP_THRESHOLD) {
			result.push({ tcs: toolBucket, type: "toolgroup" });
		} else {
			for (const tc of toolBucket) {
				result.push({ done: tc.status !== "pending", tc, type: "toolcall" });
			}
		}
		toolBucket = [];
	};
	for (const item of items) {
		if (item.type === "toolcall") {
			// R3 (2026-09-06): AskUser 不参与 ToolGroup 合并,单独渲染
			// (StreamingMessage 渲染为 null,由 AskUserDock 承载),
			// 避免"单独时不可见、进组时可见"的行为不一致
			if (item.tc.toolName === "AskUser") {
				flushBucket();
				result.push(item);
			} else {
				toolBucket.push(item.tc);
			}
		} else {
			flushBucket();
			result.push(item);
		}
	}
	flushBucket();
	return result;
}

/**
 * Hook: 解析 content + 穿插 toolCalls + 折叠 ToolGroup
 * 2026-08-31 新增: 抽离自 StreamingMessage,符合 feature-hook-extract-rules
 * 返回原始 segments(供 tailPreview) + visibleSegments(供主渲染)
 * 2026-09-06 P1: 增量解析 — 追加模式下只重解析最后一个未闭合段,避免长流每帧全量 O(n) 扫描
 */
export function useStreamingSegments(
	content: string,
	toolCalls: ToolCall[] | undefined,
	isStreaming: boolean,
): { segments: Segment[]; visibleSegments: VisibleSegment[] } {
	/** 上次解析结果缓存(供增量路径复用) */
	const cacheRef = useRef<{ content: string; segments: Segment[] } | null>(null);

	const segments = useMemo<Segment[]>(() => {
		const cache = cacheRef.current;
		// 增量路径: 新内容以旧内容开头(追加模式)
		if (
			cache &&
			content.startsWith(cache.content) &&
			content.length > cache.content.length
		) {
			// 找最后一个未闭合段(done=false)的索引
			let lastOpenIdx = -1;
			for (let i = cache.segments.length - 1; i >= 0; i--) {
				if (!cache.segments[i].done) {
					lastOpenIdx = i;
					break;
				}
			}
			if (lastOpenIdx >= 0) {
				// 计算该段起始偏移(前面所有段长度之和)
				let offset = 0;
				for (let i = 0; i < lastOpenIdx; i++) {
					offset += cache.segments[i].content.length;
				}
				// 从 offset 重新解析尾部(含新内容)。offset 必落在标签位置或纯文本开头,
				// parseContent 默认状态即可正确处理(think/file 标签在 offset 处会被重新识别)
				const tail = parseContent(content.slice(offset), !isStreaming);
				const adjustedTail = tail.map((s) => ({ ...s, start: s.start + offset }));
				const merged = [...cache.segments.slice(0, lastOpenIdx), ...adjustedTail];
				cacheRef.current = { content, segments: merged };
				return merged;
			}
			// 所有段已闭合 → 新内容为新段
			const tail = parseContent(
				content.slice(cache.content.length),
				!isStreaming,
			);
			const adjustedTail = tail.map((s) => ({
				...s,
				start: s.start + cache.content.length,
			}));
			const merged = [...cache.segments, ...adjustedTail];
			cacheRef.current = { content, segments: merged };
			return merged;
		}
		// 全量路径(content 回退 / isStreaming 翻转 / 首次)
		const parsed = parseContent(content, !isStreaming);
		cacheRef.current = { content, segments: parsed };
		return parsed;
	}, [content, isStreaming]);

	const visibleSegments = useMemo<VisibleSegment[]>(() => {
		const tcs = toolCalls ?? [];
		const interleave = interleaveToolCalls(segments, tcs);
		return mergeToolOps(interleave);
	}, [segments, toolCalls]);

	return { segments, visibleSegments };
}

/**
 * Hook: 流式底部打字机预览
 * 取最近 ~60 字符的 output 段作为"AI 正在说什么"
 */
export function useStreamingTailPreview(
	content: string,
	segments: Segment[],
	isStreaming: boolean,
): string {
	return useMemo(() => {
		if (!isStreaming) return "";
		// O1 (2026-09-06): 从尾部倒序遍历,避免 [...segments].reverse() 每帧拷贝
		let lastOutput: Segment | undefined;
		for (let i = segments.length - 1; i >= 0; i--) {
			if (segments[i].type === "output") {
				lastOutput = segments[i];
				break;
			}
		}
		const raw = lastOutput?.content ?? content ?? "";
		const cleaned = raw.replace(/\s+/g, " ").trim();
		return cleaned.length > 60 ? `…${cleaned.slice(-60)}` : cleaned;
	}, [segments, content, isStreaming]);
}
