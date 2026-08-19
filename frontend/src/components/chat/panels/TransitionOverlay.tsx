import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TransitionOverlayProps {
	/** 触发动画 */
	active: boolean;
	/** 起始位置（点击的对话项中心） */
	pos: { x: number; y: number };
	/** 动画完成回调 */
	onComplete: () => void;
}

/** 展开阶段 ms */
const EXPAND_DURATION = 500;
/** 渐隐阶段 ms */
const FADE_DURATION = 300;

export function TransitionOverlay({ active, pos, onComplete }: TransitionOverlayProps) {
	const [visible, setVisible] = useState(false);
	const overlayRef = useRef<HTMLDivElement>(null);
	const iconRef = useRef<HTMLDivElement>(null);

	/** Effect 1: active 变化时设置可�?*/
	useEffect(() => {
		if (active) setVisible(true);
	}, [active]);

	/** Effect 2: DOM 就绪后启动动�?*/
	useEffect(() => {
		if (!visible) return;

		const overlay = overlayRef.current;
		const icon = iconRef.current;
		if (!overlay || !icon) return;

		let isMounted = true;
		let fadeAnim: Animation | null = null;

		// 展开动画：图标从点击位置放大，背景色铺满
		const expandAnim = overlay.animate(
			[
				{
					clipPath: `circle(0px at ${pos.x}px ${pos.y}px)`,
					opacity: 1,
				},
				{
					clipPath: `circle(150% at ${pos.x}px ${pos.y}px)`,
					opacity: 1,
				},
			],
			{
				duration: EXPAND_DURATION,
				easing: "cubic-bezier(0.4, 0, 0.2, 1)",
				fill: "forwards",
			},
		);

		// 图标从点击位置弹跳放大到居中
		icon.animate(
			[
				{
					left: `${pos.x}px`,
					top: `${pos.y}px`,
					transform: "translate(-50%, -50%) scale(1)",
					opacity: 1,
				},
				{
					left: "50%",
					top: "50%",
					transform: "translate(-50%, -50%) scale(1.6)",
					opacity: 1,
					offset: 0.6,
				},
				{
					left: "50%",
					top: "50%",
					transform: "translate(-50%, -50%) scale(1.2)",
					opacity: 1,
				},
			],
			{
				duration: EXPAND_DURATION,
				easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
				fill: "forwards",
			},
		);

		expandAnim.onfinish = () => {
			if (!isMounted) return;

			// 渐隐整个 overlay
			fadeAnim = overlay.animate(
				[{ opacity: 1 }, { opacity: 0 }],
				{
					duration: FADE_DURATION,
					easing: "ease-in",
					fill: "forwards",
				},
			);

			fadeAnim.onfinish = () => {
				if (!isMounted) return;
				setVisible(false);
				onComplete();
			};
		};

		return () => {
			isMounted = false;
			expandAnim.cancel();
			fadeAnim?.cancel();
		};
	}, [visible, pos, onComplete]);

	if (!visible) return null;

	return createPortal(
		<div
			ref={overlayRef}
			className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center"
			style={{
				backgroundColor: "hsl(var(--primary) / 0.15)",
				backdropFilter: "blur(4px)",
				opacity: 0,
			}}>
			<div
				ref={iconRef}
				className="fixed"
				style={{
					left: pos.x,
					top: pos.y,
					transform: "translate(-50%, -50%)",
				}}>
				<div className="bg-primary flex h-16 w-16 items-center justify-center rounded-2xl shadow-2xl">
					<MessageSquare className="text-primary-foreground h-8 w-8" />
				</div>
			</div>
		</div>,
		document.body,
	);
}
