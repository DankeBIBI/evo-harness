import { useSettingsStore } from '@/stores/settingsStore';
import { useRef, type KeyboardEvent } from 'react';

/** 档位枚举(顺序决定 segmented 渲染顺序与方向键循环) */
const MODES = ['plan', 'edit', 'auto'] as const;
type ToolMode = (typeof MODES)[number];

/** 档位展示文案(集中维护,设置页可复用) */
const MODE_META: Record<ToolMode, { label: string; hint: string }> = {
  auto: { hint: '所有工具自动通过', label: '自动' },
  edit: { hint: '写操作需确认', label: '编辑' },
  plan: { hint: '只允许读操作', label: '计划' },
};

/**
 * AI 工具权限档位选择器(紧凑 segmented control)
 *
 * 档位语义:
 *   - plan: 只允许读操作,写类工具直接拒绝
 *   - edit: 按单工具 mode,写操作需弹窗确认
 *   - auto: 跳过所有权限检查,工具自动执行
 *
 * 放置位置:ChatInput 工具栏第二行工具区
 * 键盘支持:Arrow Left/Right/Up/Down 循环切换,Home/End 跳首/尾
 */
export function ToolModeSelector() {
  const toolMode = useSettingsStore((s) => s.toolMode);
  const setToolMode = useSettingsStore((s) => s.setToolMode);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent, currentIdx: number) => {
    let nextIdx = currentIdx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (currentIdx + 1) % MODES.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (currentIdx - 1 + MODES.length) % MODES.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = MODES.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextMode = MODES[nextIdx];
    setToolMode(nextMode);
    buttonRefs.current[nextIdx]?.focus();
  };

  return (
    <div
      aria-label="AI 工具权限档位"
      className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/30 p-0.5"
      role="radiogroup"
    >
      {MODES.map((mode, idx) => {
        const isActive = toolMode === mode;
        const meta = MODE_META[mode];
        return (
          <button
            aria-checked={isActive}
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40'
                : 'text-muted-foreground hover:bg-background/40 hover:text-foreground'
            }`}
            key={mode}
            onClick={() => setToolMode(mode)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            role="radio"
            tabIndex={isActive ? 0 : -1}
            title={meta.hint}
            type="button"
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
