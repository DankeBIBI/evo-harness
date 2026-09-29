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
import { devLog } from "@/lib/devLog";
import {
	askUserTool,
	fileTools,
	getToolDefTool,
	grepFilesTool,
	listToolsTool,
	loadSkillTool,
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
	toolRegistry.set(loadSkillTool.name, loadSkillTool);
}

initRegistry();

/**
 * 从注册表现有工具名派生小写/驼峰两种机械变体别名。
 *
 * 只保留机械变体覆盖历史会话回放与 LLM 偶发的大小写漂移;
 * 同义词猜测(Glob/Grep/Edit 等手工映射)已删除——canonical 名经原生 toolsSchema
 * 下发后模型服从率极高,同义词兑底只剩误匹配风险(会劫持同名 skill)。
 */
function buildToolNameAliases(): Record<string, string> {
	const aliases: Record<string, string> = {};
	for (const name of toolRegistry.keys()) {
		aliases[name.toLowerCase()] = name;
		const camel = name.charAt(0).toLowerCase() + name.slice(1);
		if (camel !== name) {
			aliases[camel] = name;
		}
		// snake/kebab 变体(read_file),兑现 GetToolDef 对 snake_case 入参的兼容承诺
		const snake = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
		if (snake !== name) {
			aliases[snake] = name;
		}
	}
	return aliases;
}

/** Tool name -> canonical tool name alias map(从注册表派生,单一事实来源). */
export const toolNameAliases: Record<string, string> = buildToolNameAliases();

/** Set the current model config (used for tool filtering / protocol selection). */
export function setModelConfig(config: ModelConfig | null) {
	currentModelConfig = config;
}

/** Get the protocol name for a model config(缺省用 setModelConfig 设置的全局值). */
export function getCurrentProtocol(
	config: ModelConfig | null = currentModelConfig,
): ToolProtocol {
	if (!config) return "openai";
	switch (config.provider.toLowerCase()) {
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

const LOG = "chat:toolRegistry";

/**
 * 工具执行上下文(可注入覆盖,缺省直读 zustand store)。
 * 显式传参让 registry 脱离全局可变状态可单测,也为多会话隔离留出口。
 */
export interface ToolRunContext {
	/** 当前模型配置(推导协议名);缺省用 setModelConfig 设置的全局值 */
	modelConfig?: ModelConfig | null;
	/** 全局档位;缺省读 settingsStore.toolMode */
	toolMode?: "auto" | "edit" | "plan";
	/** 单工具权限解析;缺省读 toolPermissionStore */
	getPermission?: (toolName: string) => "auto" | "ask" | "disabled";
}

/** Levenshtein 编辑距离(短串专用,无性能优化需求) */
function levenshtein(a: string, b: string): number {
	if (a === b) {
		return 0;
	}

	const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
		const row = Array<number>(b.length + 1).fill(0);
		row[0] = i;
		return row;
	});
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			dp[i][j] = Math.min(
				dp[i - 1][j] + 1,
				dp[i][j - 1] + 1,
				dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
	}
	return dp[a.length][b.length];
}

/** Unknown tool 时给出最接近的候选名(编辑距离 ≤2 或大小写不敏感包含),让 AI 一轮自纠 */
function suggestToolNames(input: string): string[] {
	if (!input) {
		return [];
	}

	const lower = input.toLowerCase();
	return [...toolRegistry.keys()]
		.map((n) => ({ d: levenshtein(lower, n.toLowerCase()), n }))
		.filter(
			(x) =>
				x.d <= 2 ||
				x.n.toLowerCase().includes(lower) ||
				lower.includes(x.n.toLowerCase()),
		)
		.sort((a, b) => a.d - b.d)
		.slice(0, 3)
		.map((x) => x.n);
}

/** 按调用名查知识型 skill(canonical 未命中时才查,支持 PascalCase 归一化匹配) */
function findSkillByCallName(name: string): Skill | undefined {
	const normalized = name.trim().replace(/^\/+/, '').toLowerCase();
	const candidates = new Set([
		normalized,
		toPascalCase(normalized).toLowerCase(),
	]);
	return useSkillStore.getState().skills.find((skill) =>
		candidates.has(skill.name.trim().replace(/^\/+/, '').toLowerCase()),
	);
}

/** 写类工具按资源 key(文件路径)串行化的锁表:key -> 当前执行链(永不 reject) */
const resourceLocks = new Map<string, Promise<unknown>>();

/**
 * 从工具入参提取资源 key(path / filePath / dirPath 任一非空字符串)。
 * 归一化仅做分隔符统一 + 小写:Windows 大小写不敏场景可正确互斥;
 * Linux 大小写敏感场景会过度串行化(只损并行度不出错);
 * 相对/绝对拼写差异不会合并为同一 key(极端时少串行一次,偏安全侧)
 */
function resourceKeyOf(input: Record<string, unknown>): string | null {
	const raw = input.path ?? input.filePath ?? input.dirPath;
	if (typeof raw !== "string" || raw === "") {
		return null;
	}

	return raw.replace(/\\/g, "/").toLowerCase();
}

/** 同一资源路径上的写操作排队执行,防并发 read-modify-write 交错丢更新 */
function runWithResourceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const prev = resourceLocks.get(key) ?? Promise.resolve();
	const run = prev.then(fn, fn);
	// 锁链上只挂永不 reject 的 settled 版本,避免未处理 rejection 在锁表内累积
	const settled = run.then(
		() => undefined,
		() => undefined,
	);
	resourceLocks.set(key, settled);
	void settled.finally(() => {
		if (resourceLocks.get(key) === settled) {
			resourceLocks.delete(key);
		}
	});
	return run;
}

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
	const body = skill.content || skill.code;
	if (body) {
		parts.push(`\n--- skill 内容 ---\n${body}`);
	}
	return parts.join("\n");
}

/**
 * Shared worker: registry lookup, permission check, confirm-store handshake,
 * and the actual tool.execute call. All execution paths funnel through this.
 *
 * 解析优先级:canonical 注册名 > 知识型 skill > 别名表。
 * skill 查找放在别名解析之前,修复「skill 名恰为别名键(如 Read/Edit)时被静默劫持到
 * 文件工具」的问题;canonical 直接命中时不查 skill,避免同名 skill 遮蔽真实工具。
 */
async function runToolCallBody(
	call: ToolCall,
	ctx?: ToolRunContext,
): Promise<ToolResult> {
	const directTool = toolRegistry.get(call.name);
	if (!directTool) {
		// 知识型 skill 不是 tool,但允许 AI 用 `<tool_call name="<skill.name>">` 声明式调用:
		// 找到 → 返回 skill 内容作为 tool_result(AI 读完后基于其内容继续作答)。
		// skill 只返回文本不落盘,plan 档位下同样放行(属只读知识加载)。
		const skill = findSkillByCallName(call.name);
		if (skill) {
			return { id: call.id, output: invokeSkill(skill, call.input) };
		}
	}

	const realName = directTool
		? call.name
		: toolNameAliases[call.name] || call.name;
	const tool = directTool ?? toolRegistry.get(realName);
	const protocol = getCurrentProtocol(ctx?.modelConfig);

	devLog.d(LOG, "executeToolCall", {
		callName: call.name,
		protocol,
		realName,
		toolFound: !!tool,
	});

	if (!tool) {
		// 错误信息附最接近候选 + 完整可用列表,AI 无需再花一轮 ListTools 即可自纠
		const suggestions = suggestToolNames(call.name);
		const available = [...toolRegistry.keys()].sort((a, b) =>
			a.localeCompare(b),
		);
		return {
			error:
				`Unknown tool [${protocol}]: ${call.name}` +
				(suggestions.length > 0 ? ` (closest: ${suggestions.join(", ")})` : "") +
				`. Available tools: ${available.join(", ")}. ` +
				"Call GetToolDef(name=...) to inspect parameters before retrying.",
			id: call.id,
			output: "",
		};
	}

	// 全局档位优先:plan / auto 直接覆盖单工具 mode。
	// plan 门禁由工具定义上的 mutating/planAllowed 标志驱动(单一事实来源,不再维护手抄白名单)
	const toolMode = ctx?.toolMode ?? useSettingsStore.getState().toolMode;
	if (
		toolMode === "plan" &&
		tool.mutating === true &&
		tool.planAllowed !== true
	) {
		return {
			error: `当前为「计划」档位,禁止执行 ${realName}(可切到「编辑」或「自动」)`,
			id: call.id,
			output: "",
		};
	}

	// 权限直读 store(废除 ChatWindow useEffect 注入,消除挂载前 checker 为 null 的 fail-open 窗口)
	const mode =
		ctx?.getPermission?.(realName) ??
		(useToolPermissionStore.getState().getPermission(realName) || "auto");
	if (mode === "disabled") {
		return {
			error: `Tool ${realName} is disabled by administrator`,
			id: call.id,
			output: "",
		};
	}

	// auto 档直通单工具 ask;但高危工具(danger,如 DeleteFile)默认仍强制确认,
	// 用户对它点过「始终允许」(权限=auto)后不再重复弹窗
	const needConfirm =
		toolMode === "auto"
			? tool.danger === true && mode !== "auto"
			: mode === "ask";
	if (needConfirm) {
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
		// 写类(mutating)且能提取资源路径 → 排队串行执行,防并发写交错丢更新
		const lockKey = tool.mutating === true ? resourceKeyOf(call.input) : null;
		const output = lockKey
			? await runWithResourceLock(lockKey, () => tool.execute(call.input, call))
			: await tool.execute(call.input, call);
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
 * Execute a single tool call through the registry:
 * 名称解析(canonical > skill > alias)、plan 门禁、权限检查、confirm 握手、
 * 写串行化与 tool.execute 全部在此收敛。
 *
 * `ctx` 可注入覆盖模型配置/档位/权限解析(缺省直读 zustand store),
 * 便于单测与多会话隔离。
 */
export async function executeToolCall(
	call: ToolCall,
	ctx?: ToolRunContext,
): Promise<ToolResult> {
	return runToolCallBody(call, ctx);
}

/** Get all registered tools. */
export function getRegisteredTools(): Tool[] {
	return [...toolRegistry.values()];
}
