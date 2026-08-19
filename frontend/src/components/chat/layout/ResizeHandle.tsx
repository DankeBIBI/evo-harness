/**
 * ResizeHandle — 侧栏宽度拖动手柄
 *
 * 2026-07-06 P1-2 新增
 *
 * 行为:
 *  - mousedown 捕获, mousemove 改 width, mouseup 释放
 *  - mousemove 用 requestAnimationFrame 节流,避免高频 setState
 *  - 双击 = 恢复默认宽度
 *  - hover 时光标变 col-resize, 把手变明显(2px → 4px)
 *
 * 配合 layoutStore.setLeftWidth / setRightWidth 使用:
 *   setLeftWidth 会自动 clamp 到 [0, 480], 极窄(<60)时自动收起侧栏
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ResizeHandleProps {
	/** 拖动方向: 'right' 表示向右拖动改 width(对左栏), 'left' 反之(对右栏) */
	direction: "left" | "right";
	/** 当前 width,用于 setLeftWidth / setRightWidth */
	onResize: (deltaPx: number) => void;
	/** 双击 = 恢复默认 */
	onDoubleClick?: () => void;
	/** 自定义类名 */
	className?: string;
}

const HANDLE_WIDTH = 4; // hover 后变 6

export function ResizeHandle({
	className,
	direction,
	onDoubleClick,
	onResize,
}: ResizeHandleProps) {
	const [isDragging, setIsDragging] = useState(false);
	/** 拖动起始时记录的鼠标 X 坐标 + 当前 width */
	const dragStateRef = useRef<{
		rafId: number | null;
		startX: number;
	} | null>(null);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
		dragStateRef.current = { rafId: null, startX: e.clientX };
	}, []);

	// mousemove / mouseup 用原生事件 + passive: false,挂在 document 上
	// 这样鼠标拖出 handle 区域也能继续拖
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
			// direction: 'right' = 左栏(向右拖增大 width), 'left' = 右栏(向左拖增大 width)
			const delta = e.clientX - state.startX - lastDelta;
			lastDelta = e.clientX - state.startX;
			// right 方向: 正向 delta 增大 width; left 方向: 反向
			const signedDelta = direction === "right" ? delta : -delta;
			pendingDelta += signedDelta * 0.05;
			// 单次事件最多入队一次 delta, 用 rAF flush
			if (state.rafId === null) {
				state.rafId = requestAnimationFrame(flush);
			}
		};

		const handleMouseUp = () => {
			if (state.rafId !== null) {
				cancelAnimationFrame(state.rafId);
				state.rafId = null;
			}
			// flush 最后一次 pending
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
			className={cn(
				"group relative z-10 transition-all flex w-0 shrink-0 cursor-col-resize items-center justify-center",
				"hover:w-1.5",
				isDragging && "w-1.5",
				className,
			)}
			onDoubleClick={onDoubleClick}
			onMouseDown={handleMouseDown}
			title="拖动调整宽度 · 双击恢复默认">
			{/* 中线指示(hover 才显示) */}
			<div
				className={cn(
					"bg-primary/40 h-full w-px transition-all",
					"group-hover:w-0.5 group-hover:bg-primary/70",
					isDragging && "w-0.5 bg-primary",
				)}
			/>
			{/* 圆点 hit area: 加大可点击区域 */}
			<div
				className={cn(
					"absolute inset-y-0 -inset-x-1",
					HANDLE_WIDTH % 2 === 0 ? "" : "",
				)}
			/>
		</div>
	);
}
