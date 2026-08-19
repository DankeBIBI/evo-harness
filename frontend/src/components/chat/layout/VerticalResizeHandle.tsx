/**
 * VerticalResizeHandle — 上下方向的高度拖动手柄
 *
 * 参照同目录 ResizeHandle(左右拖宽):
 *  - mousedown 捕获, mousemove 改 height, mouseup 释放
 *  - mousemove 用 requestAnimationFrame 节流
 *  - 双击 = 恢复默认高度
 *  - hover 时光标 row-resize,把手变明显
 *
 *   <VerticalResizeHandle
 *     direction="up"  // 'up' = 顶部手柄向上拖增大, 'down' = 底部手柄向下拖增大
 *     onResize={(delta) => setH(h => clamp(h + delta, 120, 70vh))}
 *     onDoubleClick={() => setH(null)}
 *   />
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface VerticalResizeHandleProps {
	/** 'up' 顶部手柄,向上拖=增大; 'down' 底部手柄,向下拖=增大 */
	direction: "up" | "down";
	/** 累计 delta(像素,正负与 direction 一致) */
	onResize: (deltaPx: number) => void;
	/** 双击恢复默认 */
	onDoubleClick?: () => void;
	/** 自定义类名 */
	className?: string;
	/** 手柄内部渲染(如 grip 图标); 不传则手柄为透明 hit-area */
	children?: React.ReactNode;
}

export function VerticalResizeHandle({
	children,
	className,
	direction,
	onDoubleClick,
	onResize,
}: VerticalResizeHandleProps) {
	const [isDragging, setIsDragging] = useState(false);
	const dragStateRef = useRef<{
		rafId: number | null;
		startY: number;
	} | null>(null);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
		dragStateRef.current = { rafId: null, startY: e.clientY };
	}, []);

	useEffect(() => {
		if (!isDragging) return;
		const state = dragStateRef.current;
		if (!state) return;

		let lastDelta = 0;
		let pendingDelta = 0;

		const flush = () => {
			state.rafId = null;
			if (pendingDelta !== 0) {
				onResize(pendingDelta);
				pendingDelta = 0;
			}
		};

		const handleMouseMove = (e: MouseEvent) => {
			const rawDelta = e.clientY - state.startY - lastDelta;
			lastDelta = e.clientY - state.startY;
			// 'up' 顶部手柄: 向上拖 clientY 减小,delta 取负变正
			const signedDelta = direction === "up" ? -rawDelta : rawDelta;
			pendingDelta += signedDelta;
			if (state.rafId === null) {
				state.rafId = requestAnimationFrame(flush);
			}
		};

		const handleMouseUp = () => {
			if (state.rafId !== null) {
				cancelAnimationFrame(state.rafId);
				state.rafId = null;
			}
			if (pendingDelta !== 0) {
				onResize(pendingDelta);
				pendingDelta = 0;
			}
			lastDelta = 0;
			dragStateRef.current = null;
			setIsDragging(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, direction, onResize]);

	return (
		<div
			className={cn("cursor-row-resize", className)}
			onDoubleClick={onDoubleClick}
			onMouseDown={handleMouseDown}
			title="拖动调整高度 · 双击恢复默认">
			{children}
		</div>
	);
}