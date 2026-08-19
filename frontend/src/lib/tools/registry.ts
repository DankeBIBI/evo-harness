/**
 * AI tool-call registry.
 */

import type {
	ModelConfig,
	Tool,
	ToolCall,
	ToolProtocol,
	ToolResult,
} from "./base";

import { useToolConfirmStore } from "@/stores/toolConfirmStore";
import { useToolPermissionStore } from "@/stores/toolPermissionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSkillStore, type Skill } from "@/stores/skillStore";
import {
	type ChatEvent,
	makeToolCallArgsDelta,
	makeToolCallArgsDone,
	makeToolCallBegin,
	makeToolCallResult,
	type TurnId,
} from "../../chat/protocol/events";
import {
	askUserTool,
	fileTools,
	getToolDefTool,
	grepFilesTool,
	listToolsTool,
	replaceInFileRegexTool,
	submitPlanTool,
	todoAddTool,
	todoClearCompletedTool,
	todoDeleteTool,
	todoEditTool,
	todoListTool,
	todoSetPriorityTool,
	todoToggleTool,
	todoUpdateStatusTool,
	todoWriteTool,
} from "./builtin";

// One global tool registry, keyed by canonical tool name.
export const toolRegistry = new Map<string, Tool>();

// Current model config (used to derive the active protocol).
let currentModelConfig: ModelConfig | null = null;

/** Convert kebab/snake-case to PascalCase. */
export function toPascalCase(name: string): string {
	return name
		.replace(/[-_](.)/g, (_, c) => c.toUpperCase())
		.replace(/^(.)/, (_, c) => c.toUpperCase());
}

/** Tool name -> canonical tool name alias map. */
export const toolNameAliases: Record<string, string> = {
	Glob: "SearchFiles",
	Grep: "GrepFiles",
	List: "ListDir",
	Read: "ReadFile",
	Delete: "DeleteFile",
	Remove: "DeleteFile",
	Replace: "ReplaceInFile",
	Edit: "ReplaceInFile",
	Search: "SearchFiles",
	Write: "WriteFile",
	GrepRegex: "GrepFiles",
	GrepContent: "GrepFiles",
	RegexSearch: "GrepFiles",
	RegexReplace: "ReplaceInFileRegex",
	ReplaceRegex: "ReplaceInFileRegex",
	FileDelete: "DeleteFile",
	FileRemove: "DeleteFile",
	FileReplace: "ReplaceInFile",
	FileEdit: "ReplaceInFile",
	FileRead: "ReadFile",
	FileWrite: "WriteFile",
	FileSearch: "SearchFiles",
	DirList: "ListDir",
	ListDirectory: "ListDir",
	ListDir: "ListDir",
	GrepFiles: "GrepFiles",
	ReplaceInFileRegex: "ReplaceInFileRegex",
	// 2026-07-23: 工具名统一 PascalCase,canonical 名直接用 PascalCase
	// camelCase 简称作为 alias 兜底(防 LLM 偶尔发 PascalCase 驼峰混入),snake_case 旧键已全部清理
	submitPlan: "SubmitPlan",
	todoWrite: "TodoWrite",
	todoAdd: "TodoAdd",
	todoList: "TodoList",
	todoToggle: "TodoToggle",
	todoUpdateStatus: "TodoUpdateStatus",
	todoEdit: "TodoEdit",
	todoSetPriority: "TodoSetPriority",
	todoDelete: "TodoDelete",
	todoClearCompleted: "TodoClearCompleted",
	// Meta tools (auto-discovery)
	listTools: "ListTools",
	getToolDef: "GetToolDef",
	// Interactive tool
	askUser: "AskUser",
	readfile: "ReadFile",
	writefile: "WriteFile",
	deletefile: "DeleteFile",
	replaceinfile: "ReplaceInFile",
	searchfiles: "SearchFiles",
	listdir: "ListDir",
	delete: "DeleteFile",
	remove: "DeleteFile",
	replace: "ReplaceInFile",
	edit: "ReplaceInFile",
	glob: "SearchFiles",
	grep: "GrepFiles",
	read: "ReadFile",
	write: "WriteFile",
	search: "SearchFiles",
	list: "ListDir",
	replaceinfileregex: "ReplaceInFileRegex",
	grepfiles: "GrepFiles",
};

/** Initialize the registry with all built-in tools. */
function initRegistry() {
	for (const tool of fileTools) toolRegistry.set(tool.name, tool);
	toolRegistry.set(grepFilesTool.name, grepFilesTool);
	toolRegistry.set(replaceInFileRegexTool.name, replaceInFileRegexTool);
	toolRegistry.set(submitPlanTool.name, submitPlanTool);
	// 2026-07-24: AskUser — 暂停执行,等用户回答 1-4 个结构化问题(单/多/文本)
	toolRegistry.set(askUserTool.name, askUserTool);
	toolRegistry.set(todoWriteTool.name, todoWriteTool);
	// 2026-07-23: 细粒度 todo 工具族 — 让 AI 能对单条 todo 做 add/toggle/status/edit/priority/delete/clear/list
	toolRegistry.set(todoAddTool.name, todoAddTool);
	toolRegistry.set(todoListTool.name, todoListTool);
	toolRegistry.set(todoToggleTool.name, todoToggleTool);
	toolRegistry.set(todoUpdateStatusTool.name, todoUpdateStatusTool);
	toolRegistry.set(todoEditTool.name, todoEditTool);
	toolRegistry.set(todoSetPriorityTool.name, todoSetPriorityTool);
	toolRegistry.set(todoDeleteTool.name, todoDeleteTool);
	toolRegistry.set(todoClearCompletedTool.name, todoClearCompletedTool);
	// Meta tools: discoverability
	toolRegistry.set(listToolsTool.name, listToolsTool);
	toolRegistry.set(getToolDefTool.name, getToolDefTool);
}

initRegistry();

/** Set the current model config (used for tool filtering / protocol selection). */
export function setModelConfig(config: ModelConfig | null) {
	currentModelConfig = config;
}

/** Get the current protocol name from the model config provider field. */
export function getCurrentProtocol(): ToolProtocol {
	if (!currentModelConfig) return "openai";
	switch (currentModelConfig.provider.toLowerCase()) {
		case "anthropic":
			return "anthropic";
		case "azure":
			return "azure";
		case "claude-code":
			return "claude-code";
		case "gemini":
		case "google":
			return "google";
		default:
			return "openai";
	}
}

/** All registered tool names, including alias entries. */
export function getAllToolNames(): Set<string> {
	const names = new Set<string>();
	for (const name of toolRegistry.keys()) names.add(name);
	for (const alias of Object.keys(toolNameAliases)) names.add(alias);
	return names;
}

/** Check whether a tool name is valid (registered name OR alias). */
export function isValidToolName(name: string): boolean {
	return toolRegistry.has(name) || name in toolNameAliases;
}

/**
 * Build a fallback ToolCall from a native stream chunk (used when the upstream
 * provider sent no `id` — uncommon but allowed). Preserves the original
 * PascalCase + raw-name so runToolCallBody can still hit the skill store.
 */
function buildNativeCallFromChunk(input: {
	args: string;
	id: string;
	index: number;
	name: string;
}): { call: ToolCall; originalId: string; originalName: string } {
	const originalId = input.id || `native-${input.index}`;
	let parsed: Record<string, unknown> = {};
	if (input.args.trim()) {
		try {
			parsed = JSON.parse(input.args.trim());
		} catch {
			parsed = { _raw: input.args.trim() };
		}
	}
	return {
		call: { id: originalId, input: parsed, name: input.name },
		originalId,
		originalName: input.name,
	};
}

// Tool-permission checker (injected by ToolPermissionStore).
let permissionChecker:
	| ((toolName: string) => "auto" | "ask" | "disabled")
	| null = null;

/** Inject a permission checker. */
export function setToolPermissionChecker(
	fn: (toolName: string) => "auto" | "ask" | "disabled",
) {
	permissionChecker = fn;
}

/**
 * Event emitter for the canonical tool-call lifecycle:
 *   tool_call_begin -> tool_call_args_delta -> tool_call_args_done -> tool_call_result
 * Callers that don't need the stream (see the `executeToolCall` shim below) pass a noop.
 */
export type ToolCallEventEmitter = (event: ChatEvent) => void;

const noopToolCallEmitter: ToolCallEventEmitter = () => {};

/** plan 模式白名单(原名 READ_ONLY_TOOLS,实际语义是「plan 档位下允许执行」)
 *  - 真正只读工具:ReadFile / SearchFiles / ListDir / GrepFiles / ListTools / GetToolDef
 *  - plan 阶段需要的写工具:SubmitPlan(提交计划待用户审批)+ 全部 Todo*(AI 先建任务清单)
 *  canonical 名以 PascalCase 为主(2026-07-23 统一)
 */
const READ_ONLY_TOOLS = new Set([
	"ReadFile",
	"ReadFileRange",
	"SearchFiles",
	"ListDir",
	"GrepFiles",
	"ListTools",
	"GetToolDef",
	"SubmitPlan",
	"AskUser",
	"TodoWrite",
	"TodoList",
	"TodoAdd",
	"TodoToggle",
	"TodoUpdateStatus",
	"TodoEdit",
	"TodoSetPriority",
	"TodoDelete",
	"TodoClearCompleted",
]);

/**
 * 知识型 skill "声明式调用": AI 输出 `<tool_call name="<skill.name>">` 时,
 * 不是真正执行函数,而是返回该 skill 的内容供 AI 参考.
 *
 * 流程:
 *  1) 查 useSkillStore.skills 是否含 name 等于 call.name 的 skill
 *  2) 找到 → 返回 skill 内容(让 AI 读),记 onFeedback 让用户看到
 *  3) 找不到 → 走原 Unknown tool 分支报错
 *
 * 为避免 registry 静态缓存过期,skill 不预注册到 toolRegistry,仅此处动态查找.
 */
function invokeSkill(skill: Skill, input: Record<string, unknown>): string {
	const parts: string[] = [`[已加载 skill: ${skill.name}]`];
	if (skill.description) {
		parts.push(`说明: ${skill.description}`);
	}
	if (skill.tags && skill.tags.length > 0) {
		parts.push(`标签: ${skill.tags.join(", ")}`);
	}
	if (input && Object.keys(input).length > 0) {
		parts.push(`调用参数: ${JSON.stringify(input)}`);
	}
	if (skill.code) {
		parts.push(`\n--- skill 内容 ---\n${skill.code}`);
	}
	return parts.join("\n");
}

/**
 * Shared worker: registry lookup, permission check, confirm-store handshake,
 * and the actual tool.execute call. Both public entry points funnel through
 * this so the two paths cannot drift.
 */
async function runToolCallBody(call: ToolCall): Promise<ToolResult> {
	const realName = toolNameAliases[call.name] || call.name;
	const tool = toolRegistry.get(realName);
	const protocol = getCurrentProtocol();

	console.log("[executeToolCall]", {
		protocol,
		callName: call.name,
		realName,
		registeredTools: [...toolRegistry.keys()],
		toolFound: !!tool,
	});

	if (!tool) {
		// 查 skillStore: 知识型 skill 不是 tool,但允许 AI 用 `<tool_call name="<skill.name>">` 声明式调用
		// 找到 → 返回 skill 内容作为 tool_result(AI 读完后会基于其内容继续作答)
		// 注意: call.name 已被 toPascalCase 转换,需按原始 name 查找
		const rawName =
			(call as ToolCall & { _rawName?: string })._rawName || call.name;
		const skill = useSkillStore
			.getState()
			.skills.find(
				(s) =>
					s.name === rawName || s.name === call.name || s.name === realName,
			);
		if (skill) {
			return { id: call.id, output: invokeSkill(skill, call.input) };
		}
		return {
			error: `Unknown tool [${protocol}]: ${call.name}`,
			id: call.id,
			output: "",
		};
	}

	// 全局档位优先:plan / auto 直接覆盖单工具 mode
	const toolMode = useSettingsStore.getState().toolMode;
	if (toolMode === "plan" && !READ_ONLY_TOOLS.has(realName)) {
		return {
			error: `当前为「计划」档位,禁止执行 ${realName}(可切到「编辑」或「自动」)`,
			id: call.id,
			output: "",
		};
	}
	if (toolMode === "auto") {
		// 自动档:即便绕过 permission check,被管理员 disabled 的工具仍要拦截
		const mode = permissionChecker?.(realName) || "auto";
		if (mode === "disabled") {
			return {
				error: `Tool ${realName} is disabled by administrator`,
				id: call.id,
				output: "",
			};
		}
		// 直接执行,不弹窗、不走单工具 mode
		try {
			const output = await tool.execute(call.input, call);
			return { id: call.id, output };
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
				id: call.id,
				output: "",
			};
		}
	}

	// Permission check(edit 档:按单工具 mode)
	const mode = permissionChecker?.(realName) || "auto";
	if (mode === "disabled") {
		return {
			error: `Tool ${realName} is disabled by administrator`,
			id: call.id,
			output: "",
		};
	}

	if (mode === "ask") {
		const keyParam =
			(call.input.path as string) ||
			(call.input.command as string) ||
			(call.input.filePath as string) ||
			"";
		const action = await useToolConfirmStore.getState().request({
			toolName: realName,
			params: call.input,
			keyParam,
		});
		if (action === "deny") {
			return {
				error: `User denied execution of ${realName}`,
				id: call.id,
				output: "",
			};
		}
		if (action === "allow-always") {
			useToolPermissionStore.getState().setPermission(realName, "auto");
		}
	}

	try {
		const output = await tool.execute(call.input, call);
		return { id: call.id, output };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			id: call.id,
			output: "",
		};
	}
}

/**
 * Function that actually runs a tool call and returns its result.
 *
 * `executeToolCallWithEvents` uses the registry's `runToolCallBody` as
 * the default. Higher-level orchestrators (e.g. `ToolCallExecutor`)
 * inject their own `runTool` to add pre-checks like a storm-breaker
 * or to route execution through a different backend. The event
 * lifecycle (begin / args_delta / args_done / result) fires regardless
 * of what the runner returns.
 */
export type ToolRunner = (call: ToolCall) => Promise<ToolResult>;

/**
 * Execute a single tool call, emitting the canonical
 * tool_call_begin / args_delta / args_done / result event sequence
 * via the supplied emitter.
 *
 * The emitted turnId defaults to `tool-${call.id}`; emitters that need
 * the real session turnId (e.g. the live session reducer) should close
 * over the correct value or re-stamp the event before dispatch.
 *
 * If `runTool` is omitted, the default `runToolCallBody` is used, which
 * goes through the registry, permission check, confirm handshake, and
 * tool.execute. Custom runners can short-circuit with a synthetic result
 * (e.g. for storm-suppressed calls) without losing the event stream.
 */
export async function executeToolCallWithEvents(
	call: ToolCall,
	emit: ToolCallEventEmitter = noopToolCallEmitter,
	runTool: ToolRunner = runToolCallBody,
): Promise<ToolResult> {
	const turnId: TurnId = `tool-${call.id}`;

	emit(makeToolCallBegin(turnId, call.id, call.name));

	const argsText = JSON.stringify(call.input ?? {});
	if (argsText) {
		emit(makeToolCallArgsDelta(turnId, call.id, argsText));
	}
	let parsedArgs: Record<string, unknown> | null = null;
	try {
		const parsed = JSON.parse(argsText);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			parsedArgs = parsed as Record<string, unknown>;
		}
	} catch {
		parsedArgs = null;
	}
	emit(makeToolCallArgsDone(turnId, call.id, parsedArgs));

	const result = await runTool(call);
	emit(makeToolCallResult(turnId, call.id, result));
	return result;
}

/**
 * Backward-compatible shim. Existing `Promise<ToolResult>` callers (e.g.
 * useChatStreaming.ts) keep working unchanged while the new event path
 * is wired up incrementally.
 */
export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
	return executeToolCallWithEvents(call, noopToolCallEmitter);
}

/** Register a single tool. The protocol parameter is kept for backward compat. */
export function registerTool(tool: Tool, _protocol: ToolProtocol = "openai") {
	toolRegistry.set(tool.name, tool);
}

/** Register a batch of tools. */
export function registerTools(
	tools: Tool[],
	protocol: ToolProtocol = "openai",
) {
	tools.forEach((tool) => registerTool(tool, protocol));
}

/** Get all registered tools. */
export function getRegisteredTools(): Tool[] {
	return [...toolRegistry.values()];
}

/** Build a JSON-formatted tool list for the AI prompt. */
export function buildToolsForAI(): string {
	const tools = getRegisteredTools();
	const toolsJson = JSON.stringify(
		tools.map((t) => ({ description: t.description, name: t.name })),
		null,
		2,
	);
	return `Available tools:\n${toolsJson}`;
}
