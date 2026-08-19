/**
 * 代理服务(hostServices/ProxyService)
 * - 兼容旧 Wails 绑定签名(ProxyServerConfig / ProxyRequestLog)
 * - 前端化后代理能力降级:配置与日志 localStorage 持久化,运行状态恒为 false
 */

const PROXY_KEY = 'hostServices.proxyConfig.v1';
const PROXY_LOGS_KEY = 'hostServices.proxyLogs.v1';
const PROXY_STATS_KEY = 'hostServices.proxyStats.v1';

interface ProxyRoute {
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
}

export interface ProxyConfig {
  host: string;
  apiKey: string;
  enabled: boolean;
  interceptMode: boolean;
  port: number;
  routes: ProxyRoute[];
}

interface ProxyStats {
  requests?: number;
  tokens?: number;
  [key: string]: unknown;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** 获取代理配置(默认关闭) */
export async function GetConfig(): Promise<ProxyConfig> {
  return readJson<ProxyConfig>(PROXY_KEY, {
    apiKey: '',
    enabled: false,
    host: '127.0.0.1',
    interceptMode: false,
    port: 9090,
    routes: [],
  });
}

/** 更新代理配置 */
export async function UpdateConfig(config: ProxyConfig): Promise<void> {
  writeJson(PROXY_KEY, config);
}

/** 代理是否运行(前端化后恒为 false) */
export async function IsRunning(): Promise<boolean> {
  return false;
}

/** 获取请求日志 */
export async function GetLogs(): Promise<Record<string, unknown>[]> {
  return readJson<Record<string, unknown>[]>(PROXY_LOGS_KEY, []);
}

/** 清空请求日志 */
export async function ClearLogs(): Promise<void> {
  writeJson(PROXY_LOGS_KEY, []);
}

/** 获取统计信息 */
export async function GetStats(): Promise<Record<string, number>> {
  return readJson<Record<string, number>>(PROXY_STATS_KEY, { requests: 0, tokens: 0 });
}

/** 处理拦截请求(本地模式直接放行) */
export async function HandleIntercept(
  _params: { action: 'cancel' | 'forward' | 'modify'; modifiedBody?: Record<string, unknown>; requestId: string },
): Promise<void> {
  // no-op: 前端化后无真实代理进程
}

/** 启动代理(不支持) */
export async function Start(): Promise<void> {
  throw new Error('前端化模式下代理服务不可用');
}

/** 停止代理(不支持) */
export async function Stop(): Promise<void> {
  throw new Error('前端化模式下代理服务不可用');
}
