/** 调试日志条目 - 唯一类型源
 *
 * 三处旧独立 interface 已废弃,全部 re-export 自此:
 *   - chatStore.DebugLog
 *   - debugLogStore.DebugLog
 *   - DebugLogPanel.DebugLog (旧)
 *
 * 新增字段时只改这里即可,避免多源不同步(2026-07-04 code_review 🔴#3)
 */

/** 请求发起方:区分"用户点发送按钮"和"AI 工具调用后自动续传"
 *  - 2026-08-19 新增:之前所有 type=request 日志都来自用户主动发起,续传被忽略 */
export type DebugLogSource = "child-dispatch" | "continuation" | "user";

export interface DebugLog {
	/** 调试文本(用于折叠 header 展示) */
	content: string;
	/** 未格式化的原始数据(后端推送事件 payload / 提交给接口的请求对象);前端原 tab 用 */
	rawData?: unknown;
	/** 请求发起方(默认 user,旧数据无字段时按 user 处理)
	 *  - user:用户点击发送按钮触发的请求
	 *  - continuation:AI 工具调用后自动续传(让模型看到 tool result 继续推理)
	 *  - child-dispatch:协作模式派发子代理(目前与 user 共用同一 chatRequest) */
	source?: DebugLogSource;
	/** 日志时间,前端格式化展示 */
	time: string;
	/** 日志类型 */
	type: "log" | "request" | "response" | "tool";
}