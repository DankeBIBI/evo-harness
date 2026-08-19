import * as ProxyService from '@/lib/hostServices/ProxyService';
import { EventsOn } from '@/lib/hostServices/eventBus';
import { create } from 'zustand';

// 默认配置常量
export const DEFAULT_PROXY_HOST = '127.0.0.1';
export const DEFAULT_PROXY_PORT = 9090;

export type ProxyModelRoute = {
  enabled: boolean;
  id: string;
  maxTokens: number;
  modelName: string;
  name: string;
  streamByDefault: boolean;
  systemPrompt: string;
  targetApiKey: string;
  targetBaseUrl: string;
  targetModel: string;
  temperature: number;
};

export type ProxyRequestLog = {
  duration: number;
  error?: string;
  id: string;
  inputTokens?: number;
  isStreaming: boolean;
  matchedRoute: string;
  method: string;
  outputTokens?: number;
  path: string;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  responseStatus: number;
  status: string;
  streamChunks?: string[];
  timestamp: string;
  totalTokens?: number;
};

export type ProxyConfig = {
  host: string;
  apiKey: string;
  enabled: boolean;
  interceptMode: boolean;
  port: number;
  routes: ProxyModelRoute[];
};

interface ProxyState {
  addRoute: (route: Omit<ProxyModelRoute, 'id'>) => void;
  clearLogs: () => Promise<void>;
  destroy: () => void;
  handleIntercept: (requestId: string, action: 'cancel' | 'forward' | 'modify', modifiedBody?: Record<string, unknown>) => Promise<void>;
  init: () => Promise<void>;
  pausedRequests: ProxyRequestLog[];
  proxyConfig: ProxyConfig;
  proxyRunning: boolean;
  removeRoute: (id: string) => void;
  requestLogs: ProxyRequestLog[];
  stats: { [key: string]: number };
  updateConfig: (config: Partial<ProxyConfig>) => Promise<void>;
  updateRoute: (id: string, updates: Partial<ProxyModelRoute>) => void;
}

const DEFAULT_CONFIG: ProxyConfig = {
  host: DEFAULT_PROXY_HOST,
  apiKey: '',
  enabled: false,
  interceptMode: false,
  port: DEFAULT_PROXY_PORT,
  routes: [],
};

let eventCleanups: Array<() => void> = [];

export const useProviderStore = create<ProxyState>((set, get) => ({
  pausedRequests: [],
  proxyConfig: DEFAULT_CONFIG,
  proxyRunning: false,
  requestLogs: [],
  stats: {},

  init: async () => {
    get().destroy();

    try {
      const config = (await ProxyService.GetConfig()) as unknown as ProxyConfig;
      // 空配置(未初始化)时保留 DEFAULT_CONFIG,避免 routes 缺失导致 addRoute 崩溃
      set({ proxyConfig: { ...DEFAULT_CONFIG, ...config } });
    } catch (e) {
      console.error('[ProviderStore] Failed to load config:', e);
    }

    try {
      const running = await ProxyService.IsRunning();
      set({ proxyRunning: running });
    } catch { /* ignore */ }

    try {
      const logs = (await ProxyService.GetLogs()) as unknown as ProxyRequestLog[];
      set({ requestLogs: logs || [] });
    } catch { /* ignore */ }

    try {
      const stats = await ProxyService.GetStats();
      set({ stats: stats || {} });
    } catch { /* ignore */ }

    eventCleanups.push(
      EventsOn('proxy:started', () => set({ proxyRunning: true })),
      EventsOn('proxy:stopped', () => set({ proxyRunning: false })),
      EventsOn('proxy:request:new', (log: ProxyRequestLog) => {
        set((s) => ({ requestLogs: [...s.requestLogs, log] }));
      }),
      EventsOn('proxy:request:sending', (log: ProxyRequestLog) => {
        set((s) => ({ requestLogs: s.requestLogs.map((l) => (l.id === log.id ? { ...l, ...log } : l)) }));
      }),
      EventsOn('proxy:request:stream:chunk', (data: { requestId: string; chunk: string }) => {
        set((s) => ({
          requestLogs: s.requestLogs.map((l) => {
            if (l.id !== data.requestId) return l;
            return { ...l, streamChunks: [...(l.streamChunks || []), data.chunk] };
          }),
        }));
      }),
      EventsOn('proxy:request:paused', (log: ProxyRequestLog) => {
        set((s) => ({
          pausedRequests: s.pausedRequests.find((r) => r.id === log.id)
            ? s.pausedRequests
            : [...s.pausedRequests, log],
          requestLogs: s.requestLogs.map((l) => (l.id === log.id ? { ...l, ...log } : l)),
        }));
      }),
      EventsOn('proxy:request:completed', (log: ProxyRequestLog) => {
        set((s) => ({
          pausedRequests: s.pausedRequests.filter((r) => r.id !== log.id),
          requestLogs: s.requestLogs.map((l) => (l.id === log.id ? { ...l, ...log } : l)),
        }));
        ProxyService.GetStats().then((stats) => set({ stats: stats || {} }));
      }),
      EventsOn('proxy:request:error', (log: ProxyRequestLog) => {
        set((s) => ({
          pausedRequests: s.pausedRequests.filter((r) => r.id !== log.id),
          requestLogs: s.requestLogs.map((l) => (l.id === log.id ? { ...l, ...log } : l)),
        }));
        ProxyService.GetStats().then((stats) => set({ stats: stats || {} }));
      }),
      EventsOn('proxy:request:cancelled', (data: { requestId: string }) => {
        set((s) => ({ pausedRequests: s.pausedRequests.filter((r) => r.id !== data.requestId) }));
      }),
      EventsOn('proxy:logs:clear', () => {
        set({ requestLogs: [], pausedRequests: [], stats: {} });
      }),
    );
  },

  destroy: () => {
    eventCleanups.forEach((cleanup) => cleanup());
    eventCleanups = [];
  },

  addRoute: (route) => {
    const newRoute: ProxyModelRoute = {
      ...route,
      id: `route-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    };
    set((s) => {
      const newConfig = { ...s.proxyConfig, routes: [...s.proxyConfig.routes, newRoute] };
      // 同步到后端
      ProxyService.UpdateConfig(newConfig);
      return { proxyConfig: newConfig };
    });
  },

  removeRoute: (id) => {
    set((s) => {
      const newConfig = { ...s.proxyConfig, routes: s.proxyConfig.routes.filter((r) => r.id !== id) };
      ProxyService.UpdateConfig(newConfig);
      return { proxyConfig: newConfig };
    });
  },

  updateRoute: (id, updates) => {
    set((s) => {
      const newConfig = {
        ...s.proxyConfig,
        routes: s.proxyConfig.routes.map((r) => (r.id === id ? { ...r, ...updates } : r)),
      };
      ProxyService.UpdateConfig(newConfig);
      return { proxyConfig: newConfig };
    });
  },

  updateConfig: async (config) => {
    const current = get().proxyConfig;
    const merged = { ...current, ...config };

    try {
      await ProxyService.UpdateConfig(merged);
      // 成功后再更新本地状态
      set({ proxyConfig: merged });
      const running = await ProxyService.IsRunning();
      set({ proxyRunning: running });
    } catch (error) {
      console.error('[ProviderStore] Failed to update config:', error);
      // 回滚本地状态
      set({ proxyConfig: current });
    }
  },

  handleIntercept: async (requestId, action, modifiedBody) => {
    await ProxyService.HandleIntercept({ action, modifiedBody, requestId });
  },

  clearLogs: async () => {
    await ProxyService.ClearLogs();
    set({ requestLogs: [], pausedRequests: [], stats: {} });
  },
}));
