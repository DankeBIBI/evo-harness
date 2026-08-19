import { cn } from '@/lib/utils';
import { Minus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface TokenStatsProps {
  className?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** 缓存命中 token 数 — 来自后端 usage.cache_read_input_tokens */
  cacheReadTokens?: number;
  /** 主动写入缓存 token 数 — M2.x + cache_control 模式 */
  cacheCreationTokens?: number;
  /** 命中率 (0-1) */
  hitRate?: number;
  /** 估算成本（CNY）— 可选 */
  sessionCostCny?: number;
  /** Storm breaker 抑制次数 */
  stormSuppressed?: number;
  /** 工具结果压缩节省字符数 */
  compressionSavings?: number;
}

export function TokenStats({
  className,
  inputTokens,
  outputTokens,
  totalTokens,
  cacheReadTokens = 0,
  cacheCreationTokens = 0,
  hitRate = 0,
  sessionCostCny,
  stormSuppressed,
  compressionSavings,
}: TokenStatsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const placementFrameRef = useRef<null | number>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPlacement, setPanelPlacement] = useState<'bottom' | 'top'>(
    'bottom',
  );

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  const outputRatio = useMemo(() => {
    if (totalTokens <= 0) return 0;
    return Math.min(outputTokens / totalTokens, 1);
  }, [outputTokens, totalTokens]);

  const inputRatio = useMemo(() => {
    if (totalTokens <= 0) return 0;
    return Math.min(inputTokens / totalTokens, 1);
  }, [inputTokens, totalTokens]);

  const inputPercentage =
    totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const outputPercentage =
    totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;
  const clampPercentage = (value: number) => Math.min(Math.max(value, 0), 100);

  const updatePanelPlacement = () => {
    const triggerElement = triggerRef.current;
    const panelElement = panelRef.current;

    if (!triggerElement || !panelElement) return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const panelHeight = panelElement.offsetHeight;
    const viewportHeight = window.innerHeight;
    const preferredGap = 8;
    const spaceBelow = viewportHeight - triggerRect.bottom - preferredGap;
    const spaceAbove = triggerRect.top - preferredGap;

    const canOpenBelow = spaceBelow >= panelHeight;
    const canOpenAbove = spaceAbove >= panelHeight;

    if (canOpenBelow) {
      setPanelPlacement('bottom');
      return;
    }

    if (canOpenAbove) {
      setPanelPlacement('top');
      return;
    }

    setPanelPlacement(spaceAbove > spaceBelow ? 'top' : 'bottom');
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowClick = (event: MouseEvent) => {
      if (!isOpen) return;

      const target = event.target as Node | null;
      const isInsidePanel = target ? panelRef.current?.contains(target) : false;
      const isInsideTrigger = target
        ? triggerRef.current?.contains(target)
        : false;

      if (!target || (!isInsidePanel && !isInsideTrigger)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handleWindowClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleWindowClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    updatePanelPlacement();

    const schedulePlacementUpdate = () => {
      if (placementFrameRef.current !== null) return;

      placementFrameRef.current = window.requestAnimationFrame(() => {
        placementFrameRef.current = null;
        updatePanelPlacement();
      });
    };

    const handleResize = () => {
      schedulePlacementUpdate();
    };

    const handleScroll = () => {
      schedulePlacementUpdate();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      if (placementFrameRef.current !== null) {
        window.cancelAnimationFrame(placementFrameRef.current);
        placementFrameRef.current = null;
      }

      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleTogglePanel = () => {
    setIsOpen((prev) => !prev);
  };

  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const inputStroke = circumference * inputRatio;
  const outputStroke = circumference * outputRatio;
  let trendLabel = '输入与输出持平';
  let trendIcon = <Minus className="h-[14px] w-[14px]" />;

  if (outputTokens > inputTokens) {
    trendLabel = '输出高于输入';
    trendIcon = <TrendingUp className="h-[14px] w-[14px] text-orange-500" />;
  } else if (outputTokens < inputTokens) {
    trendLabel = '输入高于输出';
    trendIcon = <TrendingDown className="h-[14px] w-[14px] text-green-500" />;
  }

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <button
        aria-expanded={isOpen}
        aria-label="查看 Token 统计"
        className={cn(
          'group relative flex h-9 w-9 items-center justify-center rounded-xl',
          'focus:ring-primary/40 transition-all duration-200 hover:scale-[1.03] focus:outline-none focus:ring-2',
          'bg-background ring-border/70 shadow-sm ring-1',
        )}
        onClick={handleTogglePanel}
        ref={triggerRef}
        type="button"
      >
        <div className="relative h-9 w-9">
          <div className="bg-muted absolute inset-0 rounded-xl" />
          <div
            className="absolute left-0 top-0 h-9 rounded-xl bg-amber-500/80 transition-all duration-300"
            style={{ width: `${clampPercentage(inputPercentage)}%` }}
          />
          <div
            className="absolute left-0 top-0 h-9 rounded-xl bg-emerald-500/80 transition-all duration-300"
            style={{ width: `${clampPercentage(outputPercentage)}%` }}
          />
          <div className="bg-background/90 absolute inset-0 flex flex-col items-center justify-center rounded-xl text-[8px] leading-none">
            <span className="text-foreground font-semibold tabular-nums">
              {formatNumber(totalTokens)}
            </span>
            <span className="text-muted-foreground mt-0.5">Token</span>
          </div>
        </div>

        {/* <div className="bg-primary text-primary-foreground absolute -right-0.5 -top-0.5 rounded-full p-0.5 shadow-sm">
          <ChevronDown
            className={cn(
              'h-[12px] w-[12px] transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </div> */}
      </button>

      {isOpen && (
        <div
          className={cn(
            'bg-popover text-popover-foreground absolute right-0 z-50 w-72 rounded-xl border p-3 shadow-lg',
            panelPlacement === 'top'
              ? 'bottom-[calc(100%+0.5rem)] origin-bottom-right'
              : 'top-[calc(100%+0.5rem)] origin-top-right',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          ref={panelRef}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Token 统计</div>
              <div className="text-muted-foreground text-xs">
                当前会话的输入、输出与总计
              </div>
            </div>
            <button
              aria-label="关闭 Token 统计"
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full p-1 transition-colors"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X className="" />
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="bg-muted/60 flex items-center justify-between rounded-lg px-3 py-2">
              <span className="text-muted-foreground">输入</span>
              <span className="font-medium tabular-nums">
                {formatNumber(inputTokens)}
              </span>
            </div>
            <div className="bg-muted/60 flex items-center justify-between rounded-lg px-3 py-2">
              <span className="text-muted-foreground">输出</span>
              <span className="font-medium tabular-nums">
                {formatNumber(outputTokens)}
              </span>
            </div>
            <div className="bg-primary/10 text-primary flex items-center justify-between rounded-lg px-3 py-2">
              <span className="font-medium">总计</span>
              <span className="font-semibold tabular-nums">
                {formatNumber(totalTokens)}
              </span>
            </div>

            {/* 缓存命中统计 — Cache-First 架构核心指标 */}
            {cacheReadTokens > 0 && (
              <div className="bg-emerald-50 flex items-center justify-between rounded-lg px-3 py-2 dark:bg-emerald-950/20">
                <span className="text-emerald-700 text-xs dark:text-emerald-300">缓存命中</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-emerald-700 text-sm font-semibold tabular-nums dark:text-emerald-300">
                    {formatNumber(cacheReadTokens)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                      hitRate >= 0.7
                        ? 'bg-emerald-500 text-white'
                        : hitRate >= 0.3
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-400 text-white'
                    }`}
                  >
                    {(hitRate * 100).toFixed(0)}%
                  </span>
                </span>
              </div>
            )}
            {cacheCreationTokens > 0 && (
              <div className="bg-violet-50 flex items-center justify-between rounded-lg px-3 py-2 dark:bg-violet-950/20">
                <span className="text-violet-700 text-xs dark:text-violet-300">写入缓存</span>
                <span className="text-violet-700 text-sm font-medium tabular-nums dark:text-violet-300">
                  {formatNumber(cacheCreationTokens)}
                </span>
              </div>
            )}

            {/* 成本统计 */}
            {sessionCostCny !== undefined && (
              <div className="bg-muted/60 flex items-center justify-between rounded-lg px-3 py-2">
                <span className="text-muted-foreground">会话消费</span>
                <span className={`font-medium tabular-nums ${sessionCostCny > 0.5 ? 'text-amber-500' : sessionCostCny > 0.1 ? 'text-yellow-500' : ''}`}>
                  ¥{sessionCostCny.toFixed(4)}
                </span>
              </div>
            )}

            {/* 性能优化统计 */}
            {stormSuppressed !== undefined && stormSuppressed > 0 && (
              <div className="bg-green-50 flex items-center justify-between rounded-lg px-3 py-2 dark:bg-green-950/20">
                <span className="text-green-600 text-xs dark:text-green-400">风暴抑制</span>
                <span className="text-green-600 font-medium tabular-nums dark:text-green-400">
                  {stormSuppressed} 次
                </span>
              </div>
            )}
            {compressionSavings !== undefined && compressionSavings > 0 && (
              <div className="bg-blue-50 flex items-center justify-between rounded-lg px-3 py-2 dark:bg-blue-950/20">
                <span className="text-blue-600 text-xs dark:text-blue-400">压缩节省</span>
                <span className="text-blue-600 font-medium tabular-nums dark:text-blue-400">
                  {compressionSavings.toLocaleString()} 字符
                </span>
              </div>
            )}
          </div>

          <div className="bg-background mt-3 space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">输入占比</span>
              <span className="tabular-nums">
                {inputPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
                style={{ width: `${clampPercentage(inputPercentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">输出占比</span>
              <span className="tabular-nums">
                {outputPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                style={{ width: `${clampPercentage(outputPercentage)}%` }}
              />
            </div>
          </div>

          <div className="text-muted-foreground mt-3 flex items-center gap-2 text-[11px]">
            <span className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              输入 {formatNumber(inputTokens)}
            </span>
            <span className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              输出 {formatNumber(outputTokens)}
            </span>
          </div>

          {outputTokens > 0 && (
            <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
              <span>趋势</span>
              {trendIcon}
              <span>{trendLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
