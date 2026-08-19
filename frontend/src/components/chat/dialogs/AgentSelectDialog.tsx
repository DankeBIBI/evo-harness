import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import type { LucideIcon } from 'lucide-react';
import { Bot, Plus, Search } from 'lucide-react';
import { useState } from 'react';

interface Agent {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: string;
}

interface Props {
  agents: Agent[];
  selectedAgent: Agent;
  onSelectAgent: (agent: Agent) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryLabels: Record<string, string> = {
  analysis: '分析',
  coding: '编程',
  domain: '领域',
  general: '通用',
  orchestration: '编排',
  translation: '翻译',
  writing: '写作',
};

export function AgentSelectDialog({
  agents,
  selectedAgent,
  onSelectAgent,
  open,
  onOpenChange,
}: Props) {
  const [search, setSearch] = useState('');
  const filteredAgents = agents.filter(
    (a) => a.name.includes(search) || a.description.includes(search),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-5 border border-border/80">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="text-primary h-[18px] w-[18px]" />
            选择 Agent
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-[16px] w-[16px] -translate-y-1/2" />
          <Input
            className="pl-9 border-border/80 focus-visible:ring-primary/30"
            placeholder="搜索 Agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[400px] space-y-2 overflow-auto">
          {filteredAgents.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              未找到匹配的 Agent
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const IconComponent = agent.icon || Bot;
              return (
                <div
                  key={agent.id}
                  className={`flex cursor-pointer items-center gap-4 rounded-lg border bg-card p-4 transition-colors duration-150 ease-out ${
                    selectedAgent.id === agent.id
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                      : 'border-border/60 hover:border-primary/40 hover:bg-muted/40'
                  }`}
                  onClick={() => onSelectAgent(agent)}
                >
                  {/* 统一图标容器：40x40 圆形 */}
                  <div className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                    <IconComponent className="text-primary h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {categoryLabels[agent.category] || agent.category}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground truncate text-sm">
                      {agent.description}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled title="新建功能开发中">
            <Plus className="mr-2 h-[16px] w-[16px]" />
            新建 Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
