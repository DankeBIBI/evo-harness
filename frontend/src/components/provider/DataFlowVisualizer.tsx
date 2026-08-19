import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useProviderStore } from '@/stores/providerStore';
import { Activity, ArrowDown, ArrowUp, Clock, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function DataFlowVisualizer() {
  const { requestLogs } = useProviderStore();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [requestLogs]);

  const borderColor = (status: string) => {
    switch (status) {
      case 'completed': return 'border-l-[hsl(var(--success))]';
      case 'error': return 'border-l-[hsl(var(--destructive))]';
      case 'sending': return 'border-l-foreground/30';
      case 'paused': return 'border-l-[hsl(var(--warning))]';
      default: return 'border-l-foreground/15';
    }
  };

  const Icon = ({ status }: { status: string }) => {
    switch (status) {
      case 'completed': return <ArrowDown className="h-[14px] w-[14px] text-[hsl(var(--success))]" />;
      case 'error': return <XCircle className="h-[14px] w-[14px] text-[hsl(var(--destructive))]" />;
      case 'sending': return <Loader2 className="h-[14px] w-[14px] animate-spin text-foreground/40" />;
      case 'paused': return <Clock className="h-[14px] w-[14px] text-[hsl(var(--warning))]" />;
      default: return <ArrowUp className="h-[14px] w-[14px] text-foreground/30" />;
    }
  };

  const time = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return ''; }
  };

  const summary = (log: typeof requestLogs[0]) => {
    if (log.error) return log.error;
    if (log.isStreaming && log.streamChunks?.length) return `SSE · ${log.streamChunks.length} chunks`;
    if (log.requestBody?.['model']) return `model: ${log.requestBody['model']}`;
    return log.status;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-[14px] flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          数据流
        </CardTitle>
        <span className="text-[11px] text-muted-foreground">{requestLogs.length} 条</span>
      </CardHeader>
      <CardContent className="pt-0">
        {requestLogs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-[13px]">
            <Activity className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p>启动代理后，请求将在此实时显示</p>
          </div>
        ) : (
          <div ref={containerRef} className="space-y-1.5 max-h-[360px] overflow-y-auto">
            {requestLogs.map((log) => (
              <div
                key={log.id}
                className={`border-l-2 ${borderColor(log.status)} bg-muted/30 rounded-r-lg px-3 py-2 hover:bg-muted/50 transition-colors`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon status={log.status} />
                    <span className="font-mono text-[11px] font-medium">{log.method}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{log.path}</span>
                    {log.matchedRoute && <span className="text-[10px] text-muted-foreground/60">· {log.matchedRoute}</span>}
                    {log.isStreaming && <span className="text-[10px] text-muted-foreground/40 font-mono">SSE</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                    {log.duration > 0 && <span>{log.duration}ms</span>}
                    <span>{time(log.timestamp)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5 ml-5.5">
                  {summary(log)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
