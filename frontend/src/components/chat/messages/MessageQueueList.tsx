import { GripVertical, Play, X } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import type { QueuedMessage } from '../hooks/useChatStreaming';

interface MessageQueueListProps {
  onClear: () => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onRunNow: (index: number) => void;
  queue: QueuedMessage[];
}

/** todolist 风格消息队列:可拖拽排序、删除、单条立即执行、清空
 *  在 ChatInput 上方渲染,执行中时也可继续往里堆
 */
export function MessageQueueList({
  onClear,
  onRemove,
  onReorder,
  onRunNow,
  queue,
}: MessageQueueListProps) {
  const [dragIndex, setDragIndex] = useState<null | number>(null);
  const [hoverIndex, setHoverIndex] = useState<null | number>(null);

  if (queue.length === 0) return null;

  const handleDragStart = (e: DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // 必须 setData 才能在 Firefox 触发 drop
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && dragIndex !== index) setHoverIndex(index);
  };

  const handleDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null) return;
    onReorder(dragIndex, index);
    setDragIndex(null);
    setHoverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setHoverIndex(null);
  };

  return (
    <div className="border-border bg-muted/30  mb-1 max-h-48 shrink-0 overflow-auto rounded-md border">
      <div className="text-muted-foreground flex items-center justify-between px-2 py-1 text-[10px]">
        <span>📋 队列 ({queue.length})</span>
        <button
          className="hover:text-foreground"
          onClick={onClear}
          type="button"
        >
          清空
        </button>
      </div>
      <ul className="space-y-0.5 px-1 pb-1">
        {queue.map((msg, idx) => {
          const isDragging = dragIndex === idx;
          const isHover = hoverIndex === idx && dragIndex !== null && dragIndex !== idx;
          const preview = msg.input.length > 60 ? `${msg.input.slice(0, 60)}…` : msg.input;
          return (
            <li
              className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
                isDragging
                  ? 'bg-primary/20 opacity-50'
                  : isHover
                    ? 'bg-primary/10'
                    : 'hover:bg-muted/50'
              }`}
              draggable
              key={`${msg.input}-${idx}`}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
            >
              <GripVertical className="text-muted-foreground h-3 w-3 shrink-0 cursor-grab" />
              <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                #{idx + 1}
              </span>
              <span className="text-foreground min-w-0 flex-1 truncate" title={msg.input}>
                {preview || '(空消息)'}
              </span>
              {msg.fileMentions.length > 0 && (
                <span className="bg-primary/15 text-primary shrink-0 rounded px-1 text-[10px]">
                  📎{msg.fileMentions.length}
                </span>
              )}
              <button
                aria-label="立即执行"
                className="text-muted-foreground hover:text-primary shrink-0 rounded p-0.5"
                onClick={() => onRunNow(idx)}
                title="立即执行(打断当前对话)"
                type="button"
              >
                <Play className="h-3 w-3" />
              </button>
              <button
                aria-label="删除"
                className="text-muted-foreground hover:text-destructive shrink-0 rounded p-0.5"
                onClick={() => onRemove(idx)}
                title="从队列移除"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
