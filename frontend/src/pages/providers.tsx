import { DataFlowVisualizer } from '@/components/provider/DataFlowVisualizer';
import { InterceptPanel } from '@/components/provider/InterceptPanel';
import { RequestLogViewer } from '@/components/provider/RequestLogViewer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { DEFAULT_PROXY_HOST, ProxyModelRoute, useProviderStore } from '@/stores/providerStore';
import {
    Activity,
    Globe,
    Link,
    Network,
    Pencil,
    Play,
    Plus,
    Shield,
    Square,
    ToggleLeft,
    ToggleRight,
    Trash2,
    Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const validateHost = (host: string): boolean => {
  if (!host) return true; // 空值使用默认值
  const validHostRegex = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;
  return validHostRegex.test(host);
};

export default function ProvidersPage() {
  const {
    addRoute, clearLogs, destroy, handleIntercept, init,
    pausedRequests, proxyConfig, proxyRunning, removeRoute,
    requestLogs, stats, updateConfig, updateRoute,
  } = useProviderStore();

  const [showAddRoute, setShowAddRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [newRoute, setNewRoute] = useState<Partial<ProxyModelRoute>>({
    name: '', modelName: '', targetBaseUrl: '', targetApiKey: '',
    targetModel: '', temperature: 0, maxTokens: 0, systemPrompt: '',
    streamByDefault: true, enabled: true,
  });

  useEffect(() => {
    init();
    return () => destroy();
  }, [init, destroy]);

  const handleAddRoute = () => {
    if (!newRoute.name || !newRoute.modelName || !newRoute.targetBaseUrl) return;
    addRoute(newRoute as Omit<ProxyModelRoute, 'id'>);
    setNewRoute({
      name: '', modelName: '', targetBaseUrl: '', targetApiKey: '',
      targetModel: '', temperature: 0, maxTokens: 0, systemPrompt: '',
      streamByDefault: true, enabled: true,
    });
    setShowAddRoute(false);
  };

  const handleToggleProxy = async () => {
    await updateConfig({ enabled: !proxyRunning });
  };

  const proxyUrl = `http://${proxyConfig.host || DEFAULT_PROXY_HOST}:${proxyConfig.port}/v1`;
  const enabledRouteCount = proxyConfig.routes.filter((r) => r.enabled).length;

  return (
    <div className="space-y-5 overflow-auto">
      {/* ── Header ── */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-semibold tracking-tight">Provider 代理</h1>
          <p className="text-muted-foreground text-[13px] -mt-1">
            按模型路由到不同 AI 服务 · 调用端只对接一个 URL
          </p>
        </div>
        {proxyRunning && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[hsl(var(--success))]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
            运行中
          </span>
        )}
      </header>

      {/* ── Server + Stats 合并为一行 ── */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row gap-5">
            {/* 左侧：服务配置 */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Globe className="h-5 w-5 text-muted-foreground" />
                代理服务配置
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">主机名</label>
                  <Input
                    type="text"
                    value={proxyConfig.host}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (validateHost(value)) {
                        updateConfig({ host: value });
                      }
                    }}
                    disabled={proxyRunning}
                    placeholder="127.0.0.1"
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">端口</label>
                  <Input
                    type="number"
                    value={proxyConfig.port}
                    onChange={(e) => {
                      const port = Number(e.target.value);
                      if (port >= 1024 && port <= 65535) {
                        updateConfig({ port });
                      }
                    }}
                    disabled={proxyRunning}
                    min={1024}
                    max={65535}
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">统一 API Key</label>
                  <Input
                    type="password"
                    value={proxyConfig.apiKey}
                    onChange={(e) => updateConfig({ apiKey: e.target.value })}
                    placeholder="留空不验证"
                    className="h-8 text-[13px]"
                  />
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2">
                <Button
                  variant={proxyRunning ? 'destructive' : 'default'}
                  size="sm"
                  onClick={handleToggleProxy}
                  disabled={!proxyRunning && enabledRouteCount === 0}
                >
                  {proxyRunning
                    ? <><Square className="mr-1.5 h-[14px] w-[14px]" />停止</>
                    : <><Play className="mr-1.5 h-[14px] w-[14px]" />启动</>}
                </Button>
                <Button
                  variant={proxyConfig.interceptMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateConfig({ interceptMode: !proxyConfig.interceptMode })}
                >
                  <Shield className="mr-1.5 h-[14px] w-[14px]" />
                  {proxyConfig.interceptMode ? '拦截模式' : '启用拦截'}
                </Button>
                {pausedRequests.length > 0 && (
                  <Badge variant="destructive" className="text-[11px]">{pausedRequests.length}</Badge>
                )}
              </div>

              {/* 代理地址 */}
              {proxyRunning && (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
                  <Link className="h-[14px] w-[14px] shrink-0" />
                  <code className="bg-background px-2 py-0.5 rounded border text-foreground font-mono">{proxyUrl}</code>
                  <button
                    className="ml-auto text-[11px] text-foreground/60 hover:text-foreground transition-colors"
                    onClick={() => navigator.clipboard.writeText(proxyUrl)}
                  >
                    复制
                  </button>
                </div>
              )}
            </div>

            {/* 右侧：统计指标 */}
            <div className="lg:w-48 grid grid-cols-2 gap-2">
              {[
                { label: '总请求', value: stats['totalRequests'] || 0, icon: Activity, color: '' },
                { label: '成功', value: stats['successRequests'] || 0, icon: Zap, color: 'text-[hsl(var(--success))]' },
                { label: '失败', value: stats['errorRequests'] || 0, icon: Network, color: 'text-[hsl(var(--destructive))]' },
                { label: '拦截', value: stats['pendingIntercept'] || 0, icon: Shield, color: 'text-[hsl(var(--warning))]' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40">
                  <Icon className={`h-[14px] w-[14px] ${color || 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
                    <p className={`text-[15px] font-semibold leading-tight ${color}`}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Model Routes ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-[14px] flex items-center gap-2">
            模型路由
            <span className="text-[11px] font-normal text-muted-foreground">
              {enabledRouteCount}/{proxyConfig.routes.length} 启用
            </span>
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => setShowAddRoute(true)}>
            <Plus className="mr-1 h-[12px] w-[12px]" />添加
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {proxyConfig.routes.length === 0 && !showAddRoute ? (
            <div className="text-center py-10 text-muted-foreground text-[13px]">
              <p>还没有模型路由</p>
              <p className="text-[12px] mt-1 opacity-60">点击「添加」配置第一个 AI 模型</p>
            </div>
          ) : (
            <div className="space-y-2">
              {proxyConfig.routes.map((route) => (
                <div
                  key={route.id}
                  className={`group border rounded-xl px-4 py-3 transition-all ${
                    route.enabled
                      ? 'hover:bg-muted/40 hover:border-foreground/10'
                      : 'opacity-40 hover:opacity-60'
                  }`}
                >
                  {editingRouteId === route.id ? (
                    <RouteEditor
                      route={route}
                      onSave={(updates) => { updateRoute(route.id, updates); setEditingRouteId(null); }}
                      onCancel={() => setEditingRouteId(null)}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => updateRoute(route.id, { enabled: !route.enabled })}
                        >
                          {route.enabled
                            ? <ToggleRight className=" text-[hsl(var(--success))]" />
                            : <ToggleLeft className="" />}
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium truncate">{route.name}</span>
                            <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {route.modelName}
                            </span>
                            {route.streamByDefault && (
                              <span className="text-[10px] text-muted-foreground/70">SSE</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            → {route.targetModel || route.modelName} @ {route.targetBaseUrl}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setEditingRouteId(route.id)}
                        >
                          <Pencil className="h-[14px] w-[14px]" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => removeRoute(route.id)}
                        >
                          <Trash2 className="h-[14px] w-[14px]" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {showAddRoute && (
                <RouteEditor
                  route={newRoute}
                  isNew
                  onSave={(updates) => {
                    addRoute(updates as Omit<ProxyModelRoute, 'id'>);
                    setShowAddRoute(false);
                  }}
                  onCancel={() => setShowAddRoute(false)}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Intercept Panel ── */}
      {pausedRequests.length > 0 && (
        <InterceptPanel requests={pausedRequests} onAction={handleIntercept} />
      )}

      {/* ── Data Flow ── */}
      {requestLogs.length > 0 && <DataFlowVisualizer />}

      {/* ── Request Logs ── */}
      <RequestLogViewer logs={requestLogs} onClear={clearLogs} />
    </div>
  );
}

/* ── Route Editor ── */

function RouteEditor({
  route, isNew, onSave, onCancel,
}: {
  route: Partial<ProxyModelRoute>;
  isNew?: boolean;
  onSave: (updates: Partial<ProxyModelRoute>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<ProxyModelRoute>>({ ...route });
  const update = (key: keyof ProxyModelRoute, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4 border border-foreground/10 rounded-xl p-4 bg-muted/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="路由名称">
          <Input value={form.name || ''} onChange={(e) => update('name', e.target.value)} placeholder="GPT-4o 主力" className="h-8 text-[13px]" />
        </Field>
        <Field label="对外模型名">
          <Input value={form.modelName || ''} onChange={(e) => update('modelName', e.target.value)} placeholder="gpt-4o" className="h-8 text-[13px] font-mono" />
        </Field>
        <Field label="目标服务地址">
          <Input value={form.targetBaseUrl || ''} onChange={(e) => update('targetBaseUrl', e.target.value)} placeholder="https://api.openai.com" className="h-8 text-[13px]" />
        </Field>
        <Field label="目标 API Key">
          <Input type="password" value={form.targetApiKey || ''} onChange={(e) => update('targetApiKey', e.target.value)} placeholder="sk-..." className="h-8 text-[13px]" />
        </Field>
        <Field label="目标模型名" hint="留空则与对外名相同">
          <Input value={form.targetModel || ''} onChange={(e) => update('targetModel', e.target.value)} placeholder="gpt-4o-2024-08-06" className="h-8 text-[13px] font-mono" />
        </Field>
        <Field label="Temperature" hint="0 = 不覆盖">
          <Input type="number" step="0.1" min="0" max="2" value={form.temperature || 0} onChange={(e) => update('temperature', Number(e.target.value))} className="h-8 text-[13px]" />
        </Field>
        <Field label="Max Tokens" hint="0 = 不覆盖">
          <Input type="number" value={form.maxTokens || 0} onChange={(e) => update('maxTokens', Number(e.target.value))} className="h-8 text-[13px]" />
        </Field>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={form.streamByDefault ?? true} onChange={(e) => update('streamByDefault', e.target.checked)} className="rounded" />
            <span className="text-[12px]">流式输出</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={form.enabled ?? true} onChange={(e) => update('enabled', e.target.checked)} className="rounded" />
            <span className="text-[12px]">启用</span>
          </label>
        </div>
      </div>
      <Field label="System Prompt（追加到请求）">
        <textarea
          className="w-full h-16 p-2 border rounded-lg text-[12px] resize-y bg-background leading-relaxed"
          value={form.systemPrompt || ''}
          onChange={(e) => update('systemPrompt', e.target.value)}
          placeholder="可选，追加到请求的 system message 中"
        />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" className="text-[12px]" onClick={onCancel}>取消</Button>
        <Button size="sm" className="text-[12px]" onClick={() => onSave(form)} disabled={!form.name || !form.modelName || !form.targetBaseUrl}>
          {isNew ? '添加路由' : '保存'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5">
        <label className="text-[11px] font-medium text-foreground/80">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground/60">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
