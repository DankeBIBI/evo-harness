/**
 * Turn Tail Injection 拼接(lib/cache/compose)
 * - 动态信息(plan mode / memory update / background jobs)注入 user message 开头,
 *   不进 system prompt,避免破坏缓存前缀稳定性
 */

/** tail 注入标记名 */
export const TAIL_MARKER_PLAN_MODE = 'PlanModeMarker';
export const TAIL_MARKER_MEMORY_UPDATE = 'memory-update';
export const TAIL_MARKER_BACKGROUND_JOBS = 'background-jobs';
export const TAIL_MARKER_CACHE_DIAGNOSTICS = 'cache-diagnostics';

/** turn tail 注入的拼接输入 */
export interface ComposeInput {
  /** 用户原始输入 */
  userText: string;
  /** 是否处于 Plan Mode */
  planMode?: boolean;
  /** 待注入的 memory 更新内容(可为空) */
  pendingMemory?: string;
  /** 已完成的后台任务摘要(可为空) */
  bgJobsCompleted?: string;
  /** 缓存诊断信息(可为空,仅诊断模式下注入) */
  cacheDiagnostics?: string;
}

/**
 * 拼接最终发给模型的 user message
 * 顺序: Plan Mode marker → Memory update → Background jobs → Cache diagnostics → 原始 user text
 */
export function compose(input: ComposeInput): string {
  const parts: string[] = [];

  if (input.planMode) {
    parts.push(`<${TAIL_MARKER_PLAN_MODE}>\n当前处于 Plan Mode,只读分析,禁止写操作。\n</${TAIL_MARKER_PLAN_MODE}>\n`);
  }
  if (input.pendingMemory) {
    parts.push(`<${TAIL_MARKER_MEMORY_UPDATE}>\n${input.pendingMemory}\n</${TAIL_MARKER_MEMORY_UPDATE}>\n`);
  }
  if (input.bgJobsCompleted) {
    parts.push(`<${TAIL_MARKER_BACKGROUND_JOBS}>\n${input.bgJobsCompleted}\n</${TAIL_MARKER_BACKGROUND_JOBS}>\n`);
  }
  if (input.cacheDiagnostics) {
    parts.push(`<${TAIL_MARKER_CACHE_DIAGNOSTICS}>\n${input.cacheDiagnostics}\n</${TAIL_MARKER_CACHE_DIAGNOSTICS}>\n`);
  }

  parts.push(input.userText);
  return parts.join('\n');
}

/** tail 注入状态(单会话,一次性消费) */
export class ComposeState {
  private planMode = false;
  private pendingMemory = '';
  private bgJobsCompleted = '';
  private cacheDiagnosticsOn = false;

  setPlanMode(enabled: boolean): void {
    this.planMode = enabled;
  }

  setPendingMemory(content: string): void {
    this.pendingMemory = content;
  }

  setBgJobsCompleted(content: string): void {
    this.bgJobsCompleted = content;
  }

  setCacheDiagnosticsOn(on: boolean): void {
    this.cacheDiagnosticsOn = on;
  }

  /** 消费状态并清空一次性字段 */
  build(userText: string): string {
    const result = compose({
      userText,
      planMode: this.planMode,
      pendingMemory: this.pendingMemory,
      bgJobsCompleted: this.bgJobsCompleted,
      cacheDiagnostics: this.cacheDiagnosticsOn ? '[enabled]' : undefined,
    });
    this.pendingMemory = '';
    this.bgJobsCompleted = '';
    return result;
  }
}
