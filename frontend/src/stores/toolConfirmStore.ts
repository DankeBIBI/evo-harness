import { create } from 'zustand';

export interface ToolConfirmRequest {
  /** 工具名称 */
  toolName: string;
  /** 格式化后的参数（用于展示） */
  params: Record<string, unknown>;
  /** 受影响的关键参数（如文件路径） */
  keyParam: string;
  /** 内部使用：每个 request 独立的 resolve,由 resolveAll 按新语义触发 */
  resolve: (action: 'allow-once' | 'allow-always' | 'deny') => void;
}

interface ToolConfirmState {
  /** 当前展示的请求（弹窗始终显示第一个） */
  pending: ToolConfirmRequest | null;
  /** 同批等待中的所有请求（含 pending） */
  batched: ToolConfirmRequest[];
  /** 发起确认请求:自动合并到当前批次,共享用户操作 */
  request: (req: Omit<ToolConfirmRequest, 'resolve'>) => Promise<'allow-once' | 'allow-always' | 'deny'>;
  /** 用户操作后分发:deny 整批终止;allow-* 仅作用于当前展示的 pending(allow-always 连同同工具排队请求一并放行) */
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
    const { batched, pending } = get();
    if (!pending || batched.length === 0) return;

    // deny 是安全默认:整批终止,AI 收到全部 denied
    if (action === 'deny') {
      const snapshot = batched;
      set({ batched: [], pending: null });
      snapshot.forEach((r) => r.resolve('deny'));
      return;
    }

    // allow-once 仅放行当前展示的这一个请求;
    // allow-always 因权限已按工具名持久化为 auto,同工具的排队请求一并放行(放行后同样会被判 auto);
    // 其余工具保持排队,等待用户逐个处理
    const release =
      action === 'allow-always'
        ? batched.filter((r) => r.toolName === pending.toolName)
        : [pending];
    const rest = batched.filter((r) => !release.includes(r));
    set({ batched: rest, pending: rest[0] ?? null });
    release.forEach((r) => r.resolve(action));
  },
}));
