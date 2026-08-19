import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ProxyRequestLog } from '@/stores/providerStore';
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy, Clock, Coins, Loader2, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';

interface RequestLogViewerProps {
  logs: ProxyRequestLog[];
  onClear: () => void;
}

function formatLogText(log: ProxyRequestLog): string {
  const lines: string[] = [];
  lines.push(`[${log.method}] ${log.path}  (${log.status})`);
  if (log.matchedRoute) lines.push(`Route: ${log.matchedRoute}`);
  if (log.responseStatus > 0) lines.push(`HTTP ${log.responseStatus}`);
  if (log.duration > 0) lines.push(`Duration: ${log.duration}ms`);
  if (log.inputTokens !== undefined) lines.push(`Input Tokens: ${log.inputTokens}`);
  if (log.outputTokens !== undefined) lines.push(`Output Tokens: ${log.outputTokens}`);
  if (log.totalTokens !== undefined) lines.push(`Total Tokens: ${log.totalTokens}`);
  if (log.requestBody) {
    lines.push('--- Request ---');
    lines.push(JSON.stringify(log.requestBody, null, 2));
  }
  if (log.isStreaming && log.streamChunks?.length) {
    lines.push(`--- Stream (${log.streamChunks.length} chunks) ---`);
    lines.push(log.streamChunks.join('\n'));
  }
  if (log.responseBody) {
    lines.push('--- Response ---');
    lines.push(JSON.stringify(log.responseBody, null, 2));
  }
  if (log.error) {
    lines.push('--- Error ---');
    lines.push(log.error);
  }
  return lines.join('\n');
}

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-[14px] w-[14px] text-[hsl(var(--success))]" />;
    case 'error':
    case 'cancelled': return <XCircle className="h-[14px] w-[14px] text-[hsl(var(--destructive))]" />;
    case 'sending':
    case 'pending': return <Loader2 className="h-[14px] w-[14px] animate-spin text-foreground/30" />;
    default: return <Clock className="h-[14px] w-[14px] text-foreground/20" />;
  }
};

const StatusLabel = ({ status }: { status: string }) => {
  const map: Record<string, { text: string; cls: string }> = {
    completed: { text: '完成', cls: 'text-[hsl(var(--success))]' },
    error: { text: '错误', cls: 'text-[hsl(var(--destructive))]' },
    sending: { text: '发送中', cls: 'text-foreground/50' },
    pending: { text: '等待', cls: 'text-foreground/40' },
    paused: { text: '拦截', cls: 'text-[hsl(var(--warning))]' },
    cancelled: { text: '取消', cls: 'text-foreground/30' },
  };
  const info = map[status] || { text: status, cls: 'text-foreground/30' };
  return <span className={`text-[10px] ${info.cls}`}>{info.text}</span>;
};

export function RequestLogViewer({ logs, onClear }: RequestLogViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  }, []);

  const copyOne = useCallback((log: ProxyRequestLog) => copy(formatLogText(log), log.id), [copy]);
  const copyAll = useCallback(() => copy(logs.map(formatLogText).join('\n' + '─'.repeat(50) + '\n'), 'all'), [logs, copy]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-[14px]">请求日志</CardTitle>
        <div className="flex items-center gap-1.5">
          {logs.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={copyAll}>
              <ClipboardCopy className="mr-1 h-[12px] w-[12px]" />
              {copiedId === 'all' ? '已复制' : '全部复制'}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onClear}>
            清空
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {logs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-[13px]">
            暂无请求日志
          </div>
        ) : (
          <div className="space-y-1 max-h-[480px] overflow-y-auto">
            {logs.slice().reverse().map((log) => (
              <div
                key={log.id}
                className="border rounded-xl px-3 py-2 hover:bg-muted/40 transition-colors group"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-2 min-w-0 cursor-pointer flex-1"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <StatusIcon status={log.status} />
                    <span className="font-mono text-[11px] font-medium">{log.method}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{log.path}</span>
                    {log.isStreaming && <span className="text-[10px] font-mono text-muted-foreground/40">SSE</span>}
                    <StatusLabel status={log.status} />
                    {log.duration > 0 && <span className="text-[10px] text-muted-foreground/50">{log.duration}ms</span>}
                    {log.responseStatus > 0 && <span className="text-[10px] text-muted-foreground/50">{log.responseStatus}</span>}
                    {log.totalTokens !== undefined ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-primary/70" title={`Input: ${log.inputTokens} / Output: ${log.outputTokens}`}>
                        <Coins className="h-[12px] w-[12px]" />
                        {log.totalTokens}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      className="p-1 rounded hover:bg-muted text-muted-foreground/40 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); copyOne(log); }}
                    >
                      <ClipboardCopy className="h-[12px] w-[12px]" />
                    </button>
                    {expandedId === log.id
                      ? <ChevronUp className="h-[14px] w-[14px] text-muted-foreground/40" />
                      : <ChevronDown className="h-[14px] w-[14px] text-muted-foreground/40" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === log.id && (
                  <div className="mt-2 space-y-2 pl-5">
                    {log.totalTokens !== undefined ? (
                      <div className="flex gap-3 text-[11px]">
                        <span className="text-muted-foreground">Input: <b className="text-foreground">{log.inputTokens}</b></span>
                        <span className="text-muted-foreground">Output: <b className="text-foreground">{log.outputTokens}</b></span>
                        <span className="text-muted-foreground">Total: <b className="text-primary">{log.totalTokens}</b></span>
                      </div>
                    ) : null}
                    <DetailBlock title="请求体" content={JSON.stringify(log.requestBody, null, 2)} />
                    {log.isStreaming && log.streamChunks && log.streamChunks.length > 0 && (
                      <DetailBlock title={`流式 (${log.streamChunks.length})`} content={log.streamChunks.join('\n')} maxHeight="max-h-32" />
                    )}
                    {log.responseBody && <DetailBlock title="响应体" content={JSON.stringify(log.responseBody, null, 2)} />}
                    {log.error && <DetailBlock title="错误" content={log.error} error />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailBlock({ title, content, error, maxHeight }: { title: string; content: string; error?: boolean; maxHeight?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-foreground/60 mb-1">{title}</p>
      <pre className={`text-[11px] leading-relaxed p-2 rounded-lg overflow-x-auto ${maxHeight || 'max-h-48'} ${
        error ? 'bg-destructive/5 text-[hsl(var(--destructive))]' : 'bg-muted/60 text-foreground/80'
      }`}>
        {content}
      </pre>
    </div>
  );
}
