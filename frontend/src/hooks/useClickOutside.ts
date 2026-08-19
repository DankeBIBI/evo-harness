import { useEffect, type RefObject } from 'react';

/** 点击外部 / ESC 关闭 hook(用于 popover / dropdown / 画布菜单) */
export function useClickOutside(
  containerRef: RefObject<HTMLElement>,
  onClose: () => void,
  /** 是否启用监听(默认 true) */
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, onClose, enabled]);
}