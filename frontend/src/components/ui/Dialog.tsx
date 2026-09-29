import { cn } from '@/lib/utils';
import { useSettingsStore, type DialogAnimation } from '@/stores/settingsStore';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { toCanvas } from 'html-to-image';
import { X } from 'lucide-react';
import * as React from 'react';

/* ─── 动画 keyframes 工厂 ─── */

function getKeyframes(anim: Exclude<DialogAnimation, 'default' | 'magic'>) {
  const IN_OFFSET = '48px';
  const OUT_OFFSET = '36px';
  // 入场/退场各只有一对关键帧,速度曲线由全局单一缓动驱动,浏览器原生插值保证全程连续无顿挫
  const map: Record<string, { in: Keyframe[]; out: Keyframe[] }> = {
    top: {
      in: [
        { opacity: 0, transform: `translate(-50%, calc(-50% - ${IN_OFFSET})) scale(0.95)` },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: `translate(-50%, calc(-50% - ${OUT_OFFSET})) scale(0.97)` },
      ],
    },
    bottom: {
      in: [
        { opacity: 0, transform: `translate(-50%, calc(-50% + ${IN_OFFSET})) scale(0.95)` },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: `translate(-50%, calc(-50% + ${OUT_OFFSET})) scale(0.97)` },
      ],
    },
    left: {
      in: [
        { opacity: 0, transform: `translate(calc(-50% - ${IN_OFFSET}), -50%) scale(0.95)` },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: `translate(calc(-50% - ${OUT_OFFSET}), -50%) scale(0.97)` },
      ],
    },
    right: {
      in: [
        { opacity: 0, transform: `translate(calc(-50% + ${IN_OFFSET}), -50%) scale(0.95)` },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      out: [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: `translate(calc(-50% + ${OUT_OFFSET}), -50%) scale(0.97)` },
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

/** Genie 收缩帧渲染:2px 行高降低 drawImage 次数,收紧行间相位差让瀑布整体移动不撕裂 */
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
  const ROW_H = 2;
  const rowCount = Math.max(1, Math.ceil(targetRect.height / ROW_H));

  for (let row = 0; row < rowCount; row += 1) {
    const srcY = row * ROW_H;
    const rowRatio = row / rowCount;
    const rowXStart = direction === 'close' ? (1 - rowRatio) * 0.18 : rowRatio * 0.18;
    const xProgress = clamp((progress - rowXStart) / (1 - rowXStart), 0, 1);
    const xEase = easeInOutCubic(xProgress);
    const rowYStart = direction === 'close' ? (1 - rowRatio) * 0.06 : rowRatio * 0.06;
    const yProgress = clamp((progress - rowYStart) / (1 - rowYStart), 0, 1);
    const yEase = easeInQuad(yProgress);
    const left = direction === 'close'
      ? lerp(targetRect.left, origin.x, xEase)
      : lerp(origin.x, targetRect.left, xEase);
    const right = direction === 'close'
      ? lerp(targetRect.right, origin.x, xEase)
      : lerp(origin.x, targetRect.right, xEase);
    const destY = direction === 'close'
      ? lerp(targetRect.top + srcY, origin.y, yEase)
      : lerp(origin.y, targetRect.top + srcY, yEase);
    const rowWidth = right - left;

    if (rowWidth < 0.8) continue;

    ctx.drawImage(snapshot, 0, srcY, targetRect.width, ROW_H, left, destY, rowWidth, ROW_H);
  }

  // 高光走 easeInOutCubic 连续曲线,alpha 上限 0.12 更克制,半径放大更柔和
  const glowProgress = direction === 'close' ? progress : 1 - progress;
  const alpha = easeInOutCubic(glowProgress) * 0.12;
  if (alpha < 0.01) return;

  const gradient = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 72);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

/** magic 打开:从触发点小尺寸模糊态 FLIP 展开到屏幕中央(纯变换动画,无截图等待,杜绝先闪现再动画) */
function runMagicOpen(el: HTMLElement, origin: Point) {
  if (typeof el.animate !== 'function') {
    return { cancel() {} };
  }

  const safeOrigin = getPointOnViewport(origin);
  const rect = el.getBoundingClientRect();
  const dx = safeOrigin.x - (rect.left + rect.width / 2);
  const dy = safeOrigin.y - (rect.top + rect.height / 2);
  const scale = clamp(Math.max(96 / rect.width, 64 / rect.height), 0.08, 0.5);

  const anim = el.animate(
    [
      { opacity: 0, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`, filter: 'blur(10px)' },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', filter: 'blur(0px)' },
    ],
    { duration: MAGIC_OPEN_DUR, easing: EASE_OUT, fill: 'both' },
  );

  return {
    cancel() {
      anim.cancel();
    },
  };
}

/** Genie 关闭:截图后逐行收缩到触发点(快照到手立即隐藏本体,避免收缩画面下方漏出完整弹窗) */
function runGenieClose(el: HTMLElement, origin: Point) {
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
    if (cancelled || !snapshotCanvas) return;

    // 在每一帧重新获取 rect，确保使用最新的位置尺寸
    const rect = el.getBoundingClientRect();
    // 元素已被卸载(timer 先于截图完成触发)时终止绘制,避免画面定格在收缩一半的状态
    if (rect.width === 0 || rect.height === 0) {
      cleanup();
      return;
    }

    const t = clamp01((now - start) / MAGIC_CLOSE_DUR);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cleanup();
      return;
    }

    renderGenieFrame(ctx, snapshotCanvas, width, height, t, 'close', safeOrigin, rect);

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
      return;
    }

    cleanup();
  }

  // 等待下一帧，确保元素已完全渲染后再捕获快照
  requestAnimationFrame(() => {
    if (cancelled) return;

    // 快照前恢复可见,防止快速开关场景下 inline opacity=0 导致拍到透明图
    el.style.opacity = '';

    toCanvas(el, { pixelRatio: 1, cacheBust: false }).then((snapshot) => {
      if (cancelled) return;

      snapshotCanvas = snapshot;
      el.style.opacity = '0';
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

function getAnimKeyframes(anim: DialogAnimation) {
  switch (anim) {
    case 'default': return { in: [], out: [] };
    case 'magic': return { in: [], out: [] };
    default: return getKeyframes(anim);
  }
}

const OPEN_DUR = 340;
const CLOSE_DUR = 220;
const MAGIC_OPEN_DUR = 360;
const MAGIC_CLOSE_DUR = 280;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** 带轻微过冲的出场曲线,单段连续,替代手工多帧 spring */
const EASE_OUT_BACK = 'cubic-bezier(0.34, 1.45, 0.64, 1)';
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

  const clearMagicMotion = React.useCallback(() => {
    magicMotionRef.current?.cancel();
    magicMotionRef.current = null;
  }, []);

  /** 播放关闭动画后隐藏 */
  const handleClose = React.useCallback(() => {
    // 幂等守卫:关闭动画进行中重复触发(ESC/点遮罩)不再重启动画
    if (closingRef.current) return;

    const el = contentRef.current;
    clearCloseNotifyTimer();
    clearMagicTimers();
    clearMagicMotion();
    if (!el) { setPresentOpen(false); return; }
    closingRef.current = true;
    animRef.current?.cancel();

    if (dialogAnimation === 'magic') {
      magicMotionRef.current = runGenieClose(el, magicOriginRef.current);
      magicCloseTimerRef.current = window.setTimeout(() => {
        magicCloseTimerRef.current = null;
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
  }, [clearCloseNotifyTimer, clearMagicMotion, clearMagicTimers, dialogAnimation]);

  React.useEffect(() => () => {
    clearCloseNotifyTimer();
    clearMagicTimers();
    clearMagicMotion();
    animRef.current?.cancel();
    animRef.current = null;
    closingRef.current = false;
  }, [clearCloseNotifyTimer, clearMagicMotion, clearMagicTimers]);

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

  /** 打开后播放动画:useLayoutEffect 在 paint 前同步启动,WAAPI 首帧即接管,无闪现也无不可见窗口 */
  React.useLayoutEffect(() => {
    if (!isCustom || !presentOpen) return;

    const el = contentRef.current;
    // ref 未挂载(异常场景)时无法播动画,元素保持自然可见,不会黑屏
    if (!el) return;
    if (closingRef.current) return;

    animRef.current?.cancel();

    /** 超时兜底:无论 onfinish/oncancel 是否触发,到期后强制清理保证元素可见 */
    const scheduleFallback = (duration: number) => {
      clearMagicTimers();
      magicOpenTimerRef.current = window.setTimeout(() => {
        magicOpenTimerRef.current = null;
        clearMagicInlineStyles(el);
        magicMotionRef.current?.cancel();
        magicMotionRef.current = null;
      }, duration + 120);
    };

    if (dialogAnimation === 'magic') {
      clearMagicMotion();
      magicMotionRef.current = runMagicOpen(el, magicOriginRef.current);
      scheduleFallback(MAGIC_OPEN_DUR);

      return () => {
        clearMagicTimers();
        clearMagicMotion();
      };
    }

    const kfs = getAnimKeyframes(dialogAnimation);
    if (!kfs.in.length || typeof el.animate !== 'function') {
      clearMagicInlineStyles(el);

      return;
    }

    animRef.current = el.animate(kfs.in, { duration: OPEN_DUR, easing: EASE_OUT_BACK, fill: 'forwards' });
    animRef.current.onfinish = () => {
      clearMagicInlineStyles(el);
      animRef.current = null;
    };
    animRef.current.oncancel = () => {
      clearMagicInlineStyles(el);
      animRef.current = null;
    };
    scheduleFallback(OPEN_DUR);

    return () => {
      clearMagicTimers();
    };
  }, [presentOpen, isCustom, dialogAnimation, clearMagicMotion, clearMagicTimers]);

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
>(({ className, style, ...props }, ref) => {
  const dialogAnimation = useSettingsStore((s) => s.dialogAnimation);
  // 自定义动画时遮罩时长与内容动画对齐,避免弹窗已收走而遮罩残留或提前消失
  const overlayDuration = dialogAnimation === 'magic'
    ? MAGIC_CLOSE_DUR
    : dialogAnimation === 'default' ? undefined : CLOSE_DUR;

  return (
    <DialogPrimitive.Overlay
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
        'data-[state=closed]:duration-200 data-[state=open]:duration-300',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      style={overlayDuration ? { animationDuration: `${overlayDuration}ms`, ...style } : style}
      ref={ref}
      {...props}
    />
  );
});
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
          <X />
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

