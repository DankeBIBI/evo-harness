import { Button } from '@/components/ui/Button';
import { useClickOutside } from '@/hooks/useClickOutside';
import type { VideoNodeKind } from '@/types/canvas';
import { ChevronDown, Film, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { NODE_TYPE_OPTIONS } from '../constants';

interface VideoToolbarProps {
  /** 新增节点回调 */
  onAddNode: (kind: VideoNodeKind) => void;
}

/** 顶部工具栏:标题 + 新增节点类型下拉 */
export function VideoToolbar({ onAddNode }: VideoToolbarProps) {
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部 / ESC 关闭下拉(#1)
  const closePicker = useCallback(() => setTypePickerOpen(false), []);
  useClickOutside(containerRef, closePicker, typePickerOpen);

  const handleToggle = useCallback(() => {
    setTypePickerOpen((v) => !v);
  }, []);

  const handleSelectKind = useCallback(
    (kind: VideoNodeKind) => {
      onAddNode(kind);
      setTypePickerOpen(false);
    },
    [onAddNode],
  );

  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b px-4">
      <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
        <Film className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight">AI 视频站</h1>
        <p className="text-muted-foreground truncate text-xs">
          在无限画布上编排故事情节,拖拽节点实时连线
        </p>
      </div>

      {/* 新增节点类型选择 */}
      <div className="relative" ref={containerRef}>
        <Button
          className="gap-1.5"
          size="sm"
          variant="outline"
          onClick={handleToggle}
        >
          <Plus className="h-4 w-4" />
          新增节点
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
        {typePickerOpen && (
          <div className="bg-popover text-popover-foreground absolute right-0 z-20 mt-1 w-40 rounded-md border p-1 shadow-lg">
            {NODE_TYPE_OPTIONS.map((opt) => (
              <button
                className="hover:bg-accent flex w-full items-center rounded-sm px-2 py-1.5 text-sm"
                key={opt.kind}
                onClick={() => handleSelectKind(opt.kind)}
              >
                {opt.label}节点
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}