/**
 * 对话协议类型(lib/chat/protocol)
 */

/** 工具 Schema(与旧 models.ToolSchema 对齐) */
export interface ToolSchema {
	description: string;
	name: string;
	parameters: Record<string, unknown>;
}

/** 单轮对话消息(对齐 OpenAI / Anthropic 协议 messages[] 数组项) */
export interface ChatMessage {
	content: string;
	role: "assistant" | "tool" | "user";
	toolCallId?: string;
	toolCalls?: Array<{
		id: string;
		input: Record<string, unknown>;
		toolName: string;
	}>;
}

/** 续传附加消息(assistant + tool results) */
export interface ContinuationMessage {
	content: string;
	id: string;
	role: string;
	toolCallId?: string;
	toolCalls?: Array<{
		id: string;
		input: Record<string, unknown>;
		toolName: string;
		status?: string;
	}>;
	toolResults?: Array<{ toolCallId: string; result: string }>;
	createdAt?: string;
}

/** 原生工具调用(流中累积后解析) */
export interface NativeToolCall {
	/** 工具名 */
	name: string;
	/** 参数 JSON 字符串(累积) */
	args: string;
	/** 是否已结束 */
	finished: boolean;
	/** 工具 id */
	toolId?: string;
	/** 流中位置锚点(前序文本长度) */
	precedingContentLen?: number;
	/** index 归并键 */
	index: number;
}

