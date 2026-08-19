import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  CheckCircle2,
  Pencil,
  Plug,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useMCPStore, type MCPServer } from '@/stores/mcpStore';

const typeLabels: Record<MCPServer['type'], string> = {
  http: 'HTTP',
  sse: 'SSE',
  stdio: 'STDIO',
};

export default function MCPPage() {
  const servers = useMCPStore((s) => s.servers);
  const load = useMCPStore((s) => s.load);
  const addServer = useMCPStore((s) => s.addServer);
  const removeServer = useMCPStore((s) => s.removeServer);
  const toggleServer = useMCPStore((s) => s.toggleServer);
  const [draft, setDraft] = useState({ command: '', name: '', type: 'stdio' as MCPServer['type'], url: '' });

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = () => {
    if (!draft.name) return;
    addServer({
      args: [],
      command: draft.command,
      env: {},
      headers: {},
      isEnabled: true,
      lastConnectedAt: null,
      name: draft.name,
      type: draft.type,
      url: draft.url,
    });
    setDraft({ command: '', name: '', type: 'stdio', url: '' });
  };

  const handleDelete = (id: string) => {
    removeServer(id);
  };

  const handleToggle = (server: MCPServer) => {
    toggleServer(server.id, !server.isEnabled);
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MCP 管理</h1>
          <p className="text-muted-foreground">
            连接和管理 MCP Server,扩展 AI 工具能力
          </p>
        </div>
      </div>

      {/* 新增表单 */}
      <Card className="mb-6">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="名称"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as MCPServer['type'] })}
          >
            <option value="stdio">STDIO</option>
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
          </select>
          {draft.type === 'stdio' ? (
            <input
              className="rounded-md border px-3 py-2 text-sm md:col-span-2"
              placeholder="命令(如 npx)"
              value={draft.command}
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
            />
          ) : (
            <input
              className="rounded-md border px-3 py-2 text-sm md:col-span-2"
              placeholder="URL"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            />
          )}
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-[16px] w-[16px]" />
            添加
          </Button>
        </CardContent>
      </Card>

      {/* 服务器列表 */}
      <div className="flex flex-col gap-4">
        {servers.length === 0 && (
          <div className="text-muted-foreground py-12 text-center text-sm">
            暂无 MCP Server,使用上方表单添加
          </div>
        )}
        {servers.map((server) => (
          <Card key={server.id} className="transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-6">
                <div className="flex flex-1 items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                      server.isEnabled
                        ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {server.isEnabled ? (
                      <CheckCircle2 className="h-6 w-6" />
                    ) : (
                      <XCircle className="h-6 w-6" />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{server.name}</h3>
                      <Badge
                        variant={server.isEnabled ? 'success' : 'secondary'}
                        className="text-[10px] uppercase tracking-wider"
                      >
                        {server.isEnabled ? '运行中' : '已停用'}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="outline" className="text-[10px] tracking-wider">
                        {typeLabels[server.type]}
                      </Badge>
                      <code className="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-muted/50 px-2.5 py-1 font-mono text-xs">
                        {server.type === 'stdio'
                          ? `${server.command} ${server.args?.join(' ') ?? ''}`
                          : server.url}
                      </code>
                    </div>

                    {server.lastConnectedAt && (
                      <span className="text-muted-foreground/60 text-xs">
                        上次连接:{server.lastConnectedAt}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={server.isEnabled ? '停用' : '启用'}
                    onClick={() => handleToggle(server)}
                  >
                    <Plug className="h-[16px] w-[16px]" />
                  </Button>
                  <Button variant="ghost" size="icon" title="编辑">
                    <Pencil className="h-[16px] w-[16px]" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title="删除"
                    onClick={() => handleDelete(server.id)}
                  >
                    <Trash2 className="h-[16px] w-[16px]" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}