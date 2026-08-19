import { cn } from '@/lib/utils';
import { useSettingsStore, type DialogAnimation } from '@/stores/settingsStore';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { toCanvas } from 'html-to-image';
import { X } from 'lucide-react';
import * as React from 'react';

/* ─── 动画 keyframes 工厂 ─── */

function getKeyframes(anim: Exclude<DialogAnimation, 'default' | 'magic'>) {
  const map: Record<string, { in: Keyframe[]; out: Keyframe[] }> = {
    // 入场 = 4 帧关键帧模拟 spring 末段(微过冲 → 收敛)
    // 退场 = 2 帧,无回弹,匀减速收回
    top: {
      in: [
        { offset: 0, opacity: 0, transform: 'translate(-50%, -120%) scale(0.94)' },
        { offset: 0.78, opacity: 1, transform: 'translate(-50%, -50%) scale(1.02)', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        { offset: 0.92, opacity: 1, transform: 'translate(-50%, -50%) scale(0.99)', easing: 'linear' },
        { offset: 1, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: 'translate(-50%, -120%) scale(0.96)' },
      ],
    },
    bottom: {
      in: [
        { offset: 0, opacity: 0, transform: 'translate(-50%, 20%) scale(0.94)' },
        { offset: 0.78, opacity: 1, transform: 'translate(-50%, -50%) scale(1.02)', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        { offset: 0.92, opacity: 1, transform: 'translate(-50%, -50%) scale(0.99)', easing: 'linear' },
        { offset: 1, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: 'translate(-50%, 20%) scale(0.96)' },
      ],
    },
    left: {
      in: [
        { offset: 0, opacity: 0, transform: 'translate(-120%, -50%) scale(0.94)' },
        { offset: 0.78, opacity: 1, transform: 'translate(-50%, -50%) scale(1.02)', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        { offset: 0.92, opacity: 1, transform: 'translate(-50%, -50%) scale(0.99)', easing: 'linear' },
        { offset: 1, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: 'translate(-120%, -50%) scale(0.96)' },
      ],
    },
    right: {
      in: [
        { offset: 0, opacity: 0, transform: 'translate(20%, -50%) scale(0.94)' },
        { offset: 0.78, opacity: 1, transform: 'translate(-50%, -50%) scale(1.02)', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        { offset: 0.92, opacity: 1, transform: 'translate(-50%, -50%) scale(0.99)', easing: 'linear' },
        { offset: 1, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: 'translate(20%, -50%) scale(0.96)' },
      ],
    },
  };
  return map[anim] || { in: [], out: [] };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface Point {
  x: number;
  y: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function getViewportCenter() {
  const { width, height } = getViewportSize();
  return { x: width / 2, y: height / 2 };
}

function getPointOnViewport(point: Point) {
  const { width, height } = getViewportSize();
  return {
    x: clamp(point.x, 0, width),
    y: clamp(point.y, 0, height),
  };
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function easeInOutCubic(value: number) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInQuad(value: number) {
  const t = clamp01(value);
  return t * t;
}

function easeOutQuad(value: number) {
  const t = clamp01(value);
  return 1 - (1 - t) * (1 - t);
}

function clearMagicInlineStyles(el: HTMLElement) {
  el.style.opacity = '';
  el.style.transform = '';
  el.style.borderRadius = '';
  el.style.clipPath = '';
  el.style.filter = '';
  el.style.boxShadow = '';
  el.style.transformOrigin = '';
  el.style.willChange = '';
}

function renderGenieFrame(
  ctx: CanvasRenderingContext2D,
  snapshot: HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number,
  progress: number,
  direction: 'open' | 'close',
  origin: Point,
  targetRect: DOMRect,
) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  const rowCount = Math.max(1, Math.floor(targetRect.height));

  for (let y = 0; y < rowCount; y += 1) {
    const rowRatio = y / rowCount;
    // 行间相位差从 0.65 缩到 0.35(Y 方向从 0.2 缩到 0.1),让瀑布更连贯
    const rowXStart = direction === 'close' ? (1 - rowRatio) * 0.35 : rowRatio * 0.35;
    const xProgress = clamp((progress - rowXStart) / (1 - rowXStart), 0, 1);
    const xEase = easeInOutCubic(xProgress);
    const rowYStart = direction === 'close' ? (1 - rowRatio) * 0.1 : rowRatio * 0.1;
    const yProgress = clamp((progress - rowYStart) / (1 - rowYStart), 0, 1);
    const yEase = easeInQuad(yProgress);
    const left = direction === 'close'
      ? lerp(targetRect.left, origin.x, xEase)
      : lerp(origin.x, targetRect.left, xEase);
    const right = direction === 'close'
      ? lerp(targetRect.right, origin.x, xEase)
      : lerp(origin.x, targetRect.right, xEase);
    const destY = direction === 'close'
      ? lerp(targetRect.top + y, origin.y, yEase)
      : lerp(origin.y, targetRect.top + y, yEase);
    const rowWidth = right - left;

    if (rowWidth < 0.8) continue;

    ctx.drawImage(snapshot, 0, y, targetRect.width, 1, left, destY, rowWidth, 1);
  }

  // 高光改为 easeInOutCubic 连续曲线,去掉 75% 突现阈值;alpha 上限从 0.3 降到 0.18 更克制
  const glowProgress = direction === 'close' ? progress : 1 - progress;
  const alpha = easeInOutCubic(glowProgress) * 0.18;
  if (alpha < 0.01) return;

  const gradient = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 55);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

function runMagicMotion(el: HTMLElement, origin: Point, duration: number, direction: 'open' | 'close') {
  let rafId: number | null = null;
  let cancelled = false;
  let snapshotCanvas: HTMLCanvasElement | null = null;
  let start = 0;
  const safeOrigin = getPointOnViewport(origin);
  const { width, height } = getViewportSize();
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '2147483647';
  canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.body.appendChild(canvas);

  function cleanup() {
    canvas.remove();
    clearMagicInlineStyles(el);
  }

  function frame(now: number) {
    if (cancelled) return;
    if (!snapshotCanvas) return;

    // 在每一帧重新获取 rect，确保使用最新的位置尺寸
    const rect = el.getBoundingClientRect();

    const t = clamp01((now - start) / duration);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cleanup();
      return;
    }

    renderGenieFrame(ctx, snapshotCanvas, width, height, t, direction, safeOrigin, rect);

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
      return;
    }

    cleanup();
  }

  // 等待下一帧，确保元素已完全渲染后再捕获快照
  requestAnimationFrame(() => {
    if (cancelled) return;

    toCanvas(el, { pixelRatio: 1, cacheBust: false }).then((snapshot) => {
      if (cancelled) return;

      snapshotCanvas = snapshot;
      el.style.opacity = direction === 'open' ? '0' : '1';
      start = performance.now();
      rafId = requestAnimationFrame(frame);
    }).catch(() => {
      cleanup();
    });
  });

  return {
    cancel() {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      cleanup();
    },
  };
}

/**
 * macOS Genie 打开动画
 * 从点击位置的小压缩状态 → 展开到屏幕中央
 */
function runMagicOpen(el: HTMLElement, origin: Point) {
  return runMagicMotion(el, origin, MAGIC_OPEN_DUR, 'open');
}

/**
 * macOS Genie 关闭动画
 * 从屏幕中央的完整窗口 → 压缩收缩到点击锚点
 */
function runMagicClose(el: HTMLElement, origin: Point) {
  return runMagicMotion(el, origin, MAGIC_CLOSE_DUR, 'close');
}

function getAnimKeyframes(anim: DialogAnimation) {
  switch (anim) {
    case 'default': return { in: [], out: [] };
    case 'magic': return { in: [], out: [] };
    default: return getKeyframes(anim);
  }
}

const OPEN_DUR = 380;
const CLOSE_DUR = 220;
const MAGIC_OPEN_DUR = 420;
const MAGIC_CLOSE_DUR = 280;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_IN = 'ease-in';

/** 全局最近点击位置（SSR 安全初始化） */
let _lastClick = { x: 0, y: 0 };
/** 外部显式设置的动画原点（优先级高于 _lastClick） */
let _explicitOrigin: Point | null = null;

function updateLastClick(e: PointerEvent) {
  _lastClick = { x: e.clientX, y: e.clientY };
}

/**
 * 外部调用：在触发 Dialog 打开前，设置动画起始坐标（按钮中心）
 * 设置后会在下一次 Dialog 打开时消费并自动清除
 */
export function setDialogOrigin(point: Point) {
  _explicitOrigin = point;
}

/** 消费显式原点，若无则回退到 _lastClick */
function consumeOrigin(): Point {
  if (_explicitOrigin) {
    const p = _explicitOrigin;
    _explicitOrigin = null;
    return p;
  }
  return _lastClick;
}

/* ─── Context：在 Dialog 和 DialogContent 之间共享 ref ─── */

interface DialogAnimCtx {
  contentRef: React.RefObject<HTMLDivElement | null>;
  animRef: React.RefObject<Animation | null>;
}
const DialogAnimContext = React.createContext<DialogAnimCtx | null>(null);

/* ─── Dialog 根组件 ─── */

function Dialog({ children, ...props }: DialogPrimitive.DialogProps) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    _lastClick = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    window.addEventListener('pointerdown', updateLastClick, { passive: true });
    return () => window.removeEventListener('pointerdown', updateLastClick);
  }, []);

  const dialogAnimation = useSettingsStore((s) => s.dialogAnimation);
  const isCustom = dialogAnimation !== 'default';
  const isControlled = props.open !== undefined;
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const animRef = React.useRef<Animation | null>(null);
  const magicMotionRef = React.useRef<{ cancel: () => void } | null>(null);
  const openRafRef = React.useRef<number | null>(null);
  const closingRef = React.useRef(false);
  const closeNotifyTimerRef = React.useRef<number | null>(null);
  const magicCloseTimerRef = React.useRef<number | null>(null);
  const magicOpenTimerRef = React.useRef<number | null>(null);
  const magicOriginRef = React.useRef<Point>(getViewportCenter());
  const [presentOpen, setPresentOpen] = React.useState(!!props.defaultOpen);
  const prevOpenRef = React.useRef(false);

  const targetOpen = isControlled ? !!props.open : presentOpen;

  const clearCloseNotifyTimer = React.useCallback(() => {
    if (!closeNotifyTimerRef.current) return;
    clearTimeout(closeNotifyTimerRef.current);
    closeNotifyTimerRef.current = null;
  }, []);

  const clearMagicTimers = React.useCallback(() => {
    if (magicCloseTimerRef.current) {
      clearTimeout(magicCloseTimerRef.current);
      magicCloseTimerRef.current = null;
    }

    if (magicOpenTimerRef.current) {
      clearTimeout(magicOpenTimerRef.current);
      magicOpenTimerRef.current = null;
    }
  }, []);

  const clearOpenRaf = React.useCallback(() => {
    if (openRafRef.current === null) return;
    cancelAnimationFrame(openRafRef.current);
    openRafRef.current = null;
  }, []);

  const clearMagicMotion = React.useCallback(() => {
    magicMotionRef.current?.cancel();
    magicMotionRef.current = null;
  }, []);

  /** 播放关闭动画后隐藏 */
  const handleClose = React.useCallback(() => {
    const el = contentRef.current;
    clearCloseNotifyTimer();
    clearOpenRaf();
    clearMagicTimers();
    clearMagicMotion();
    if (!el) { setPresentOpen(false); return; }
    closingRef.current = true;
    animRef.current?.cancel();

    if (dialogAnimation === 'magic') {
      magicMotionRef.current = runMagicClose(el, magicOriginRef.current);
      magicCloseTimerRef.current = window.setTimeout(() => {
        magicCloseTimerRef.current = null as any;
        setPresentOpen(false);
        closingRef.current = false;
        magicMotionRef.current = null;
      }, MAGIC_CLOSE_DUR);
      return;
    }

    const kfs = getAnimKeyframes(dialogAnimation);
    if (!kfs.out.length || typeof el.animate !== 'function') {
      clearMagicInlineStyles(el);
      setPresentOpen(false);
      closingRef.current = false;
      return;
    }

    animRef.current = el.animate(kfs.out, { duration: CLOSE_DUR, easing: EASE_IN, fill: 'forwards' });
    animRef.current.onfinish = () => {
      clearMagicInlineStyles(el);
      animRef.current = null;
      setPresentOpen(false);
      closingRef.current = false;
    };
    animRef.current.oncancel = () => {
      clearMagicInlineStyles(el);
      animRef.current = null;
      closingRef.current = false;
    };
  }, [clearCloseNotifyTimer, clearOpenRaf, clearMagicMotion, dialogAnimation]);

  React.useEffect(() => () => {
    clearCloseNotifyTimer();
    clearOpenRaf();
    clearMagicTimers();
    clearMagicMotion();
    animRef.current?.cancel();
    animRef.current = null;
    closingRef.current = false;
  }, [clearCloseNotifyTimer, clearMagicMotion, clearMagicTimers, clearOpenRaf]);

  /** 监听 open 变化 */
  React.useEffect(() => {
    if (!isCustom) {
      clearCloseNotifyTimer();
      setPresentOpen(!!targetOpen);
      return;
    }
    if (targetOpen && !prevOpenRef.current) {
      // 打开
      clearCloseNotifyTimer();
      clearOpenRaf();
      clearMagicTimers();
      clearMagicMotion();
      magicOriginRef.current = getPointOnViewport(consumeOrigin());
      if (closingRef.current) {
        animRef.current?.cancel();
        closingRef.current = false;
      }
      setPresentOpen(true);
    } else if (!targetOpen && prevOpenRef.current && !closingRef.current) {
      // 关闭
      handleClose();
    }
    prevOpenRef.current = !!targetOpen;
  }, [clearCloseNotifyTimer, targetOpen, isCustom, handleClose]);

  /** 打开后播放动画 */
  React.useEffect(() => {
    if (!isCustom || !presentOpen) return;
    const el = contentRef.current;
    if (!el) return;

    const id = requestAnimationFrame(() => {
      openRafRef.current = null;
      if (closingRef.current) return;
      animRef.current?.cancel();
      if (dialogAnimation === 'magic') {
        clearMagicMotion();
        magicMotionRef.current = runMagicOpen(el, magicOriginRef.current);
        magicOpenTimerRef.current = window.setTimeout(() => {
          magicOpenTimerRef.current = null as any;
          clearMagicInlineStyles(el);
          magicMotionRef.current = null;
        }, MAGIC_OPEN_DUR);
        return;
      }

      const kfs = getAnimKeyframes(dialogAnimation);
      if (!kfs.in.length || typeof el.animate !== 'function') {
        clearMagicInlineStyles(el);
        return;
      }

      el.style.opacity = '0';

      animRef.current = el.animate(kfs.in, { duration: OPEN_DUR, easing: EASE_OUT, fill: 'forwards' });
      animRef.current.onfinish = () => {
        clearMagicInlineStyles(el);
        animRef.current = null;
      };
      animRef.current.oncancel = () => {
        clearMagicInlineStyles(el);
        animRef.current = null;
      };
    });
    openRafRef.current = id;
    return () => {
      clearOpenRaf();
      // 清理可能残留的 magic 打开 timer,避免快速连续开关时旧 timer 还在 setTimeout 队列里
      clearMagicTimers();
    };
  }, [presentOpen, isCustom, dialogAnimation, clearMagicTimers]);

  const ctx = React.useMemo(() => ({ contentRef, animRef }), []);

  return (
    <DialogAnimContext.Provider value={ctx}>
      <DialogPrimitive.Root
        {...props}
        open={presentOpen}
        onOpenChange={(open) => {
          if (!open && isCustom) {
            handleClose();
            // 延迟通知外部
            clearCloseNotifyTimer();
            closeNotifyTimerRef.current = setTimeout(() => {
              (closeNotifyTimerRef as React.MutableRefObject<number | null>).current = null;
              props.onOpenChange?.(false);
            }, (dialogAnimation === 'magic' ? MAGIC_CLOSE_DUR : CLOSE_DUR) + 50);
          } else {
            clearCloseNotifyTimer();
            setPresentOpen(open);
            props.onOpenChange?.(open);
          }
        }}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogAnimContext.Provider>
  );
}

/* ─── 子组件 ─── */

const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
      'data-[state=closed]:duration-200 data-[state=open]:duration-300',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    ref={ref}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const dialogAnimation = useSettingsStore((s) => s.dialogAnimation);
  const isDefault = dialogAnimation === 'default';
  const ctx = React.useContext(DialogAnimContext);

  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (ctx) (ctx.contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref, ctx],
  );

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'bg-card/95 fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-6 rounded-2xl border border-border/60 p-6 shadow-soft',
          isDefault && cn(
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:duration-200 data-[state=open]:duration-300',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-95',
          ),
          className,
        )}
        ref={mergedRef}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-lg opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none hover:bg-muted/50 p-1">
          <X className="" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title className={cn('text-lg font-semibold leading-none tracking-tight', className)} ref={ref} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} ref={ref} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger
};

