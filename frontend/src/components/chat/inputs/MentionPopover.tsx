import { Bot, File, Wrench, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** 候选项基础字段(由父组件决定如何填充) */
export interface MentionItem {
  id: string;
  name: string;
  /** 副标题/描述(可空) */
  description?: string;
  /** 来源短标签,显示在名称后 */
  sourceLabel?: string;
  /** 候选项类型 — 决定图标 */
  type: 'file' | 'agent' | 'skill';
}

interface MentionPopoverProps {
  items: MentionItem[];
  loading?: boolean;
  onClose: () => void;
  /**
   * 选中某项后的回调。
   * - 多选场景 (skill / file): 追加选中,不关闭弹层
   * - 单选场景 (agent): 选中后立即关闭弹层(由父组件自己处理)
   */
  onSelect: (item: MentionItem) => void;
  open: boolean;
  placeholder?: string;
  trigger: '/' | '@';
}

const TYPE_ICONS = {
  agent: Bot,
  file: File,
  skill: Wrench,
} as const;

/** MentionPopover 通用 @ / / 触发弹层 */
export function MentionPopover({
  items,
  loading = false,
  onClose,
  onSelect,
  open,
  placeholder = '搜索...',
  trigger,
}: MentionPopoverProps) {
  const [keyword, setKeyword] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 单次遍历 + 关键词过滤(避免两次 filter)
  const filtered = useMemo(() => {
    if (!keyword) return items;
    const k = keyword.toLowerCase();
    const out: MentionItem[] = [];
    for (const it of items) {
      if (it.name.toLowerCase().includes(k) ||
        (it.description?.toLowerCase().includes(k) ?? false)) {
        out.push(it);
      }
    }
    return out;
  }, [items, keyword]);

  // 选中项变更时滚动到可见区
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLDivElement>(
      `[data-idx="${selectedIndex}"]`,
    );
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // 打开时聚焦 + 复位
  useEffect(() => {
    if (open) {
      setKeyword('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          // 多选: Enter 追加选中但不关闭弹层
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, onSelect, onClose, selectedIndex],
  );

  if (!open) return null;

  return (
    <div
      className="bg-popover text-popover-foreground absolute bottom-full left-0 z-50 mb-1 w-[320px] rounded-lg border p-2 shadow-lg"
      onKeyDown={handleKey}
      role="listbox"
    >
      <div className="relative mb-2 flex items-center gap-1">
        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs">
          {trigger}
        </span>
        <input
          className="bg-background flex-1 rounded border px-2 py-1 text-sm outline-none focus:border-primary"
          onChange={(e) => {
            setKeyword(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder={placeholder}
          ref={inputRef}
          value={keyword}
        />
        <button
          aria-label="关闭"
          className="hover:bg-accent rounded p-1"
          onClick={onClose}
          type="button"
        >
          <X className="h-[14px] w-[14px]" />
        </button>
      </div>

      <div
        className="max-h-[240px] overflow-y-auto"
        ref={listRef}
        role="presentation"
      >
        {loading ? (
          <div className="text-muted-foreground py-4 text-center text-sm">
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground py-4 text-center text-sm">
            未找到匹配项
          </div>
        ) : (
          filtered.map((item, idx) => {
            const Icon = TYPE_ICONS[item.type] || File;
            const isActive = idx === selectedIndex;
            return (
              <div
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${
                  isActive ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                data-idx={idx}
                key={item.id}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                role="option"
                aria-selected={isActive}
              >
                <Icon className="text-primary h-[16px] w-[16px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {item.name}
                    </span>
                    {item.sourceLabel && (
                      <span className="text-muted-foreground text-xs">
                        ({item.sourceLabel})
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-muted-foreground truncate text-xs">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="text-muted-foreground mt-1 flex items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-2">
          <span>↑↓ 选择</span>
          <span>⏎ 添加</span>
          <span>Esc 关闭</span>
        </div>
        <button
          aria-label="完成选择"
          className="hover:bg-accent rounded px-1.5 py-0.5 text-xs font-medium"
          onClick={onClose}
          type="button"
        >
          完成 ↵
        </button>
      </div>
    </div>
  );
}
