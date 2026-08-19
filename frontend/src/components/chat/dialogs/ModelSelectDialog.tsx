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
import { Model } from '@/stores/modelStore';
import { CheckCircle2, Plus, Search, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  models: Model[];
  onOpenChange: (open: boolean) => void;
  onSelectModel: (id: string) => void;
  open: boolean;
  selectedModelId: null | string;
}

const providerLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  copilot: 'CLI',
  custom: '自定义',
  gemini: 'Gemini',
  ollama: 'Ollama',
  openai: 'OpenAI',
};

export function ModelSelectDialog({
  models,
  onOpenChange,
  onSelectModel,
  open,
  selectedModelId,
}: Props) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.provider.toLowerCase().includes(search.toLowerCase()),
  );

  /** 关闭弹窗并跳到 /models 管理页（新增/编辑/删除/测试连接） */
  const handleOpenManager = () => {
    onOpenChange(false);
    // 150ms 等 Dialog 关闭动画结束再路由,避免动画期间页面切换体感割裂
    setTimeout(() => {
      // 守卫:脱离 <Router> 上下文时 useNavigate 返回 undefined
      if (typeof navigate === 'function') navigate('/models');
    }, 150);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl border border-border/80 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2">
              选择模型
              <Badge className="text-xs" variant="secondary">
                {models.length}
              </Badge>
            </DialogTitle>
            <Button
              onClick={handleOpenManager}
              size="sm"
              title="新增 / 编辑 / 删除 / 测试模型"
              variant="outline"
            >
              <Plus className="mr-1 h-[14px] w-[14px]" />
              添加
            </Button>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2  -translate-y-1/2" />
            <Input
              className="pl-9 border-border/80 focus-visible:ring-primary/30"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型..."
              value={search}
            />
          </div>
        </DialogHeader>
        <div className="max-h-[400px] space-y-2 overflow-auto pr-1">
          {filteredModels.length === 0 ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              <p>未找到匹配的模型</p>
              <Button
                className="mt-3"
                onClick={handleOpenManager}
                size="sm"
                variant="link"
              >
                去添加模型 →
              </Button>
            </div>
          ) : (
            filteredModels.map((model) => (
              <div
                className={`flex cursor-pointer items-center gap-4 rounded-lg border bg-white p-4 transition-colors ${
                  selectedModelId === model.id
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border/60 hover:border-primary/40 hover:bg-muted/40'
                }`}
                key={model.id}
                onClick={() => onSelectModel(model.id)}
              >
                {/* 统一图标容器：40x40 圆形 */}
                <div className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                  {model.isEnabled ? (
                    <CheckCircle2 className="text-primary " />
                  ) : (
                    <XCircle className="text-muted-foreground " />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{model.name}</span>
                    <Badge className="text-xs" variant="outline">
                      {providerLabels[model.provider] || model.provider}
                    </Badge>
                    {!model.isEnabled && (
                      <Badge className="text-xs" variant="secondary">
                        禁用
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-sm">
                    {model.baseUrl}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
