import { create } from 'zustand';

export interface ToolConfirmRequest {
  /** 工具名称 */
  toolName: string;
  /** 格式化后的参数（用于展示） */
  params: Record<string, unknown>;
  /** 受影响的关键参数（如文件路径） */
  keyParam: string;
  /** 内部使用：每个 request 独立的 resolve,等待用户统一操作后批量触发 */
  resolve: (action: 'allow-once' | 'allow-always' | 'deny') => void;
}

interface ToolConfirmState {
  /** 当前展示的请求（弹窗始终显示第一个） */
  pending: ToolConfirmRequest | null;
  /** 同批等待中的所有请求（含 pending） */
  batched: ToolConfirmRequest[];
  /** 发起确认请求:自动合并到当前批次,共享用户操作 */
  request: (req: Omit<ToolConfirmRequest, 'resolve'>) => Promise<'allow-once' | 'allow-always' | 'deny'>;
  /** 用户操作后批量触发所有 batched 的 resolve */
  resolveAll: (action: 'allow-once' | 'allow-always' | 'deny') => void;
}

export const useToolConfirmStore = create<ToolConfirmState>((set, get) => ({
  pending: null,
  batched: [],

  request: (req) => {
    return new Promise<'allow-once' | 'allow-always' | 'deny'>((resolve) => {
      set((state) => {
        // 收集本次 req 加入 batched;若 pending 为空则把第一个设为 pending
        const next: ToolConfirmRequest = { ...req, resolve };
        const batched = [...state.batched, next];
        const pending = state.pending ?? next;
        return { batched, pending };
      });
    });
  },

  resolveAll: (action) => {
    const { batched } = get();
    if (batched.length === 0) return;
    // 关键修复:一次性 resolve 所有 batched,而不是链式 deny 前一个
    const snapshot = batched;
    set({ batched: [], pending: null });
    snapshot.forEach((r) => r.resolve(action));
  },
}));
