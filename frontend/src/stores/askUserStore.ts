import { create } from 'zustand';

/** 问题类型：单选 / 多选 / 自由文本 */
export type AskUserQuestionType = 'multi' | 'single' | 'text';

/** single / multi 选项 */
export interface AskUserOption {
  label: string;
  value: string;
  description?: string;
}

/** 单个问题 */
export interface AskUserQuestion {
  id: string;
  question: string;
  type: AskUserQuestionType;
  options?: AskUserOption[];
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
}

/** 答案映射：单选/文本 → string, 多选 → string[] */
export type AskUserAnswers = Record<string, string | string[]>;

/** 等待 Promise resolve 时携带的状态 */
export interface AskUserWaitState {
  cancelled: boolean;
  submitted: boolean;
  answers: AskUserAnswers;
}

/** 某个 tcId 的完整状态 — pending 期间内存中, settled 后用 snapshot 留给 UI 折叠显示 */
export interface PendingAskUser {
  /** 用户提交/取消的答案(可能为已答或空) */
  answers: AskUserAnswers;
  /** 已经 resolve/cancel 过了,UI 应进入折叠态 */
  cancelled: boolean;
  questions: AskUserQuestion[];
  /** resolve Promise — submit/cancel 时调它 */
  resolve: ((state: AskUserWaitState) => void) | null;
  /** resolve Promise 已触发过了(去重用) */
  settled: boolean;
  /** 自动 cancel 计时器 */
  timeoutId: number | null;
}

/** 已答快照(供折叠态渲染)— 即使 pending 状态已清,UI 仍能拿到最终答案 */
export interface AskUserSnapshot {
  answers: AskUserAnswers;
  cancelled: boolean;
  questions: AskUserQuestion[];
}

interface AskUserState {
  /**
   * 按 tcId 索引的 pending map。
   * - tc 还在等 → entry.resolve 非空
   * - tc 已 submit/cancel → 移到 snapshots,这里清空
   */
  pending: Map<string, PendingAskUser>;
  /** 已结束的 tc 快照(折叠态用),不再被 waitForAnswer 等待 */
  snapshots: Map<string, AskUserSnapshot>;
  /** 5 分钟无操作自动 cancel(防 AI 永久阻塞) */
  DEFAULT_TIMEOUT_MS: number;
  submitByTcId: (tcId: string, questions: AskUserQuestion[]) => void;
  resolveByTcId: (tcId: string, answers: AskUserAnswers) => void;
  cancelByTcId: (tcId: string) => void;
  /** 同步读取 pending(用于 React 订阅) */
  getPending: (tcId: string) => PendingAskUser | undefined;
  /** 同步读取 snapshot(用于 React 订阅) */
  getSnapshot: (tcId: string) => AskUserSnapshot | undefined;
  /** 异步等待某个 tcId 的用户回答; tc 已 settled 时立即返回快照 */
  waitByTcId: (tcId: string, timeoutMs?: number) => Promise<AskUserWaitState>;
  /** 清空所有(tc 切换/对话切换时由 ChatWindow 调用) */
  clearAll: () => void;
}

/** 默认 5 分钟无操作自动 cancel — 避免 AI 永久阻塞,用户也能从卡死的 UI 退出 */
const DEFAULT_TIMEOUT_MS = 300_000;

export const useAskUserStore = create<AskUserState>((set, get) => ({
  pending: new Map(),
  snapshots: new Map(),
  DEFAULT_TIMEOUT_MS,

  submitByTcId: (tcId, questions) => {
    // 重复 submit 同 tcId(LLM 同一工具多发):合并 questions,不重置 resolve
    const cur = get().pending.get(tcId);
    if (cur && !cur.settled) {
      const seen = new Set(cur.questions.map((q) => q.id));
      const merged = [...cur.questions];
      for (const q of questions) {
        if (!seen.has(q.id)) merged.push(q);
      }
      if (cur.timeoutId !== null) clearTimeout(cur.timeoutId);
      const next = new Map(get().pending);
      next.set(tcId, { ...cur, questions: merged, timeoutId: null });
      set({ pending: next });
      return;
    }
    if (cur && cur.timeoutId !== null) {
      clearTimeout(cur.timeoutId);
    }
    const next = new Map(get().pending);
    next.set(tcId, {
      answers: {},
      cancelled: false,
      questions,
      resolve: null,
      settled: false,
      timeoutId: null,
    });
    set({ pending: next });
  },

  resolveByTcId: (tcId, answers) => {
    const cur = get().pending.get(tcId);
    if (!cur || cur.settled) return;
    if (cur.timeoutId !== null) clearTimeout(cur.timeoutId);
    // 1) snapshot 留折叠态
    const snapMap = new Map(get().snapshots);
    snapMap.set(tcId, {
      answers,
      cancelled: false,
      questions: cur.questions,
    });
    // 2) 从 pending 移除
    const next = new Map(get().pending);
    next.delete(tcId);
    set({ pending: next, snapshots: snapMap });
    // 3) resolve Promise
    cur.resolve?.({ answers, cancelled: false, submitted: true });
  },

  cancelByTcId: (tcId) => {
    const cur = get().pending.get(tcId);
    if (!cur || cur.settled) return;
    if (cur.timeoutId !== null) clearTimeout(cur.timeoutId);
    const snapMap = new Map(get().snapshots);
    snapMap.set(tcId, {
      answers: cur.answers,
      cancelled: true,
      questions: cur.questions,
    });
    const next = new Map(get().pending);
    next.delete(tcId);
    set({ pending: next, snapshots: snapMap });
    cur.resolve?.({ answers: {}, cancelled: true, submitted: false });
  },

  getPending: (tcId) => get().pending.get(tcId),
  getSnapshot: (tcId) => get().snapshots.get(tcId),

  waitByTcId: (tcId, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    // 已结束 → 立即返回快照
    const snap = get().snapshots.get(tcId);
    if (snap) {
      return Promise.resolve({
        answers: snap.answers,
        cancelled: snap.cancelled,
        submitted: !snap.cancelled,
      });
    }
    // 新建 Promise + 5 分钟 timeout
    return new Promise<AskUserWaitState>((resolve) => {
      const next = new Map(get().pending);
      const cur = next.get(tcId);
      if (!cur) {
        // 极端 case:tc 还没 submit 就 wait → 直接 cancelled
        resolve({ answers: {}, cancelled: true, submitted: false });
        return;
      }
      const timeoutId = window.setTimeout(() => {
        const live = get().pending.get(tcId);
        if (live && !live.settled) {
          const snapMap = new Map(get().snapshots);
          snapMap.set(tcId, {
            answers: live.answers,
            cancelled: true,
            questions: live.questions,
          });
          const m = new Map(get().pending);
          m.delete(tcId);
          set({ pending: m, snapshots: snapMap });
          live.resolve?.({ answers: {}, cancelled: true, submitted: false });
        }
      }, timeoutMs);
      next.set(tcId, { ...cur, resolve, timeoutId });
      set({ pending: next });
    });
  },

  clearAll: () => {
    const cur = get().pending;
    for (const entry of cur.values()) {
      if (entry.timeoutId !== null) clearTimeout(entry.timeoutId);
      entry.resolve?.({ answers: {}, cancelled: true, submitted: false });
    }
    set({ pending: new Map(), snapshots: new Map() });
  },
}));
