import { create } from 'zustand';

/** 单步计划 — type-source 在此,外部复用 */
export interface PlanStep {
  id: string;
  title: string;
  action: string;
  risk?: 'low' | 'med' | 'high';
  targets?: string[];
}

export interface Plan {
  summary: string;
  steps: PlanStep[];
  rawPlan: string;
  /** 提出该计划时的会话 ID（用于跨会话去重） */
  conversationId?: string;
  /** 提出该计划时的 assistant 消息 ID（用于 UI 锚定） */
  assistantMsgId?: string;
}

/** 计划决策结果 */
export type PlanDecision =
  | { action: 'approved' }
  | { action: 'refined'; feedback: string }
  | { action: 'rejected' };

interface PlanState {
  /** 当前待审批的计划 */
  pendingPlan: Plan | null;
  /** 计划审批状态 */
  status: 'idle' | 'pending' | 'approved' | 'refined' | 'rejected';
  /** 用户反馈（refine 时） */
  feedback: string;
  /** 提交计划（带会话上下文） */
  submit: (plan: Plan) => void;
  /** 批准 */
  approve: () => void;
  /** 优化（带反馈） */
  refine: (feedback: string) => void;
  /** 拒绝 */
  reject: () => void;
  /** 重置 */
  reset: () => void;
  /**
   * 异步等待用户决策 — 调用方 await,UI 渲染 PlanStageCard 后由 approve/refine/reject resolve
   * 30s 超时自动 approve（避免 AI 卡死）
   */
  waitForDecision: (timeoutMs?: number) => Promise<PlanDecision>;
  /** 等待审批的 Promise resolver（内部用,debug 时可见） */
  _resolve: ((action: 'approved' | 'refined' | 'rejected', feedback?: string) => void) | null;
  /** 等待中的 reject（用于 clearTimeout） */
  _timeoutId: number | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export const usePlanStore = create<PlanState>((set, get) => ({
  pendingPlan: null,
  status: 'idle',
  feedback: '',
  _resolve: null,
  _timeoutId: null,

  submit: (plan) => {
    set({ pendingPlan: plan, status: 'pending', feedback: '' });
  },

  approve: () => {
    const { _resolve, _timeoutId } = get();
    if (_timeoutId !== null) {
      clearTimeout(_timeoutId);
      set({ _timeoutId: null });
    }
    // 决策完成即清空 resolver:防止下一轮 submit 后 waitForDecision 误入「复用 pending」分支而不设超时
    set({ status: 'approved', _resolve: null });
    _resolve?.('approved');
  },

  refine: (feedback) => {
    const { _resolve, _timeoutId } = get();
    if (_timeoutId !== null) {
      clearTimeout(_timeoutId);
      set({ _timeoutId: null });
    }
    set({ status: 'refined', feedback, _resolve: null });
    _resolve?.('refined', feedback);
  },

  reject: () => {
    const { _resolve, _timeoutId } = get();
    if (_timeoutId !== null) {
      clearTimeout(_timeoutId);
      set({ _timeoutId: null });
    }
    set({ status: 'rejected', _resolve: null });
    _resolve?.('rejected');
  },

  reset: () => {
    const { _timeoutId } = get();
    if (_timeoutId !== null) {
      clearTimeout(_timeoutId);
    }
    set({
      pendingPlan: null,
      status: 'idle',
      feedback: '',
      _resolve: null,
      _timeoutId: null,
    });
  },

  /**
   * 等待用户决策 Promise — 30s 默认超时自动 approve（避免 AI 阻塞）
   * 同一时刻只能 wait 一次：再次调用会立即返回上一次 decision
   * PR-1 review fix (2026-07-10): 已在 approved/refined/rejected 状态下调用立即返回缓存决策,不再傻等 30s
   */
  waitForDecision: (timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const state = get();
    // 已决策短路 — 不再傻等 timeout,直接返回缓存结果
    if (state.status === 'approved') {
      return Promise.resolve<PlanDecision>({ action: 'approved' });
    }
    if (state.status === 'rejected') {
      return Promise.resolve<PlanDecision>({ action: 'rejected' });
    }
    if (state.status === 'refined') {
      return Promise.resolve<PlanDecision>({
        action: 'refined',
        feedback: state.feedback,
      });
    }
    // 已有 pending 时复用同一个 Promise,避免重复弹 PlanStageCard
    if (state._resolve && state.status === 'pending') {
      return new Promise<PlanDecision>((resolve) => {
        const prevResolve = state._resolve!;
        const chained = (action: 'approved' | 'refined' | 'rejected', fb?: string) => {
          prevResolve(action, fb);
          if (action === 'approved') resolve({ action: 'approved' });
          else if (action === 'refined') resolve({ action: 'refined', feedback: fb ?? '' });
          else resolve({ action: 'rejected' });
        };
        set({ _resolve: chained });
      });
    }

    return new Promise<PlanDecision>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        const { _resolve: cur } = get();
        // 超时兜底：自动 approve + 把状态切到 approved（避免 pending 一直挂着）
        if (cur && get().status === 'pending') {
          cur('approved');
          set({ status: 'approved', _resolve: null, _timeoutId: null });
        }
        resolve({ action: 'approved' });
      }, timeoutMs);

      const onDecision = (
        action: 'approved' | 'refined' | 'rejected',
        feedback?: string,
      ) => {
        if (action === 'approved') resolve({ action: 'approved' });
        else if (action === 'refined') resolve({ action: 'refined', feedback: feedback ?? '' });
        else resolve({ action: 'rejected' });
      };

      set({ _resolve: onDecision, _timeoutId: timeoutId });
    });
  },
}));
