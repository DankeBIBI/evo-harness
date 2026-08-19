import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ProxyRequestLog } from '@/stores/providerStore';
import { Edit, Play, XCircle } from 'lucide-react';
import { useState } from 'react';

interface InterceptPanelProps {
  onAction: (requestId: string, action: 'cancel' | 'forward' | 'modify', modifiedBody?: Record<string, unknown>) => Promise<void>;
  requests: ProxyRequestLog[];
}

export function InterceptPanel({ requests, onAction }: InterceptPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState('');

  const startEdit = (request: ProxyRequestLog) => {
    setEditingId(request.id);
    setEditedBody(JSON.stringify(request.requestBody, null, 2));
  };

  const forward = (requestId: string) => {
    if (editingId === requestId) {
      try {
        onAction(requestId, 'modify', JSON.parse(editedBody));
        setEditingId(null);
      } catch { alert('JSON 格式错误'); }
    } else {
      onAction(requestId, 'forward');
    }
  };

  return (
    <Card className="border-[hsl(var(--warning))]/30">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-[14px]">拦截的请求</CardTitle>
        <span className="text-[11px] text-[hsl(var(--warning))] font-medium">{requests.length} 等待处理</span>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {requests.map((req) => (
            <div key={req.id} className="border border-[hsl(var(--warning))]/15 rounded-xl p-3 bg-[hsl(var(--warning))]/3">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-[11px] font-medium">{req.method}</span>
                <span className="text-[11px] text-muted-foreground truncate">{req.path}</span>
                {req.matchedRoute && <span className="text-[10px] text-muted-foreground/60">· {req.matchedRoute}</span>}
              </div>

              {editingId === req.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full h-24 p-2 border rounded-lg font-mono text-[11px] resize-y bg-background leading-relaxed"
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => forward(req.id)}>
                      <Play className="mr-1 h-[12px] w-[12px]" />修改并转发
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setEditingId(null)}>取消</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <pre className="bg-muted/60 p-2 rounded-lg text-[11px] overflow-x-auto max-h-24 text-foreground/70">
                    {JSON.stringify(req.requestBody, null, 2)}
                  </pre>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => forward(req.id)}>
                      <Play className="mr-1 h-[12px] w-[12px]" />转发
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => startEdit(req)}>
                      <Edit className="mr-1 h-[12px] w-[12px]" />修改
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive" onClick={() => onAction(req.id, 'cancel')}>
                      <XCircle className="mr-1 h-[12px] w-[12px]" />取消
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
