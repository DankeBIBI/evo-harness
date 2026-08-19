/**
 * 全局聊天协议类型(src/types/chat.d.ts)
 * - 供前端任意模块直接使用,无需 import
 * - 与 lib/chat/protocol.ts 中同名类型结构对齐
 */

/** 工具 Schema(与 lib/chat/protocol.ts 同名类型结构一致) */
interface ToolSchema {
	/** 工具功能描述(注入模型,影响调用意图) */
	description: string;
	/** 工具名(唯一标识,供模型引用) */
	name: string;
	/** 工具参数 JSON Schema */
	parameters: Record<string, unknown>;
}

/** StreamChat 请求(与 lib/chat/protocol.ts 同名类型结构一致) */
interface StreamChatRequestLike {
	/** 代理 id(本次会话绑定的智能体) */
	agentId: string;
	/** 代理名称(仅用于日志/展示) */
	agentName?: string;
	/** 子代理列表(协作模式下的子任务代理) */
	childAgents?: unknown[];
	/** 协作模式标识 */
	collaborationMode?: string;
	/** 会话 id(取消流时 CancelChat 的匹配键) */
	convId?: string;
	/** 分发类型(后端路由/派发策略) */
	dispatchType?: string;
	/** 事件名(SSE 增量事件经 eventBus 派发的 key) */
	eventName: string;
	/** 用户输入消息内容 */
	message: string;
	/** 模型附加配置(温度/top_p 等) */
	modelConfig?: Record<string, unknown>;
	/** 模型 id(为空时取 modelStore 当前选中模型) */
	modelId?: string;
	/** 父代理 id(协作模式归属) */
	parentAgentId?: string;
	/** 角色(system/user/assistant) */
	role?: string;
	/** 工具调用模式 */
	toolMode?: string;
	/** 请求超时(ms) */
	timeout?: number;
	/** 启用的工具名列表 */
	tools?: string[];
	/** 工具 Schema 数组(供模型声明工具) */
	toolsSchema?: ToolSchema[];
	/** 续传附加消息(assistant + tool results) */
	continuationMessages?: Array<{
		/** 消息文本内容 */
		content: string;
		/** 消息 id */
		id: string;
		/** 消息角色 */
		role: string;
		/** 关联工具调用 id */
		toolCallId?: string;
		/** 工具调用列表 */
		toolCalls?: Array<{
			/** 工具调用 id */
			id: string;
			/** 工具入参 */
			input: Record<string, unknown>;
			/** 工具名 */
			toolName: string;
		}>;
	}>;
}

/** 流事件回调集合(provider → 调用方) */
interface StreamCallbacks {
	/** 文本增量回调(SSE 每块内容) */
	onContent: (text: string) => void;
	/** 工具调用回调(累积完成时触发) */
	onToolCall: (call: NativeToolCall) => void;
	/** 用量统计回调(缓存命中/创建/费用) */
	onUsage?: (usage: {
		/** 缓存读取 token 数 */
		cacheRead: number;
		/** 缓存创建 token 数 */
		cacheCreation: number;
		/** 本次费用(元) */
		costCny: number;
	}) => void;
	/** 流结束回调(幂等,只触发一次) */
	onDone: () => void;
	/** 错误回调(携带错误信息与错误码) */
	onError: (message: string, code?: number) => void;
	/** 是否已取消(取消后停止派发) */
	isCancelled: () => boolean;
}
