/**
 * CustomTitleBar — 统一顶部栏（Frameless 模式）
 */

import {
	ArrowLeft,
	ArrowRight,
	FileSearch,
	Home,
	Mic,
	Minimize2,
	PictureInPicture2,
	RefreshCw,
	Square,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useChatStore } from "@/stores/chatStore";
import {
	Quit,
	WindowIsMaximised,
	WindowMinimise,
	WindowToggleMaximise,
	WindowUnmaximise,
} from "@/wailsjs/runtime/runtime";

// Wails 约定: div style 加 "--wails-draggable: drag" 即可被识别为可拖拽区
const DRAG_STYLE: React.CSSProperties = {
	["--wails-draggable" as string]: "drag",
};
const NO_DRAG_STYLE: React.CSSProperties = {
	["--wails-draggable" as string]: "no-drag",
};

interface CustomTitleBarProps {
	/** chat 页面扩展区(导航 + 会话标题 + 麦克风 + 更新)是否显示 */
	onChatPage?: boolean;
	/** (2026-08-18) 点击顶栏“统一日志”按钮 — 跨页面共享显隐 */
	onToggleUnifiedLog?: () => void;
	/** (2026-08-18) 统一日志是否打开,用于按钮 active 态 */
	unifiedLogOpen?: boolean;
}

export function CustomTitleBar({
	onChatPage = false,
	onToggleUnifiedLog,
	unifiedLogOpen = false,
}: CustomTitleBarProps) {
	/** 窗口是否最大化 — 用于切换 □ / ▣ 图标 */
	const [isMaximised, setIsMaximised] = useState(false);

	const navigate = useNavigate();
	const location = useLocation();
	const navigationType = useNavigationType();
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);
	const title = currentConversation?.title ?? "新会话 · smartfactory";

	// -- 路由历史栈 --
	const pastRef = useRef<string[]>([]);
	const futureRef = useRef<string[]>([]);
	const prevPathRef = useRef<string>(location.pathname);
	const [canBack, setCanBack] = useState(false);
	const [canForward, setCanForward] = useState(false);

	const refreshNavState = useCallback(() => {
		setCanBack(pastRef.current.length > 0);
		setCanForward(futureRef.current.length > 0);
	}, []);

	useEffect(() => {
		const prev = prevPathRef.current;
		const curr = location.pathname;

		if (prev === curr) return;

		if (navigationType === "PUSH") {
			pastRef.current.push(prev);
			futureRef.current = [];
		} else if (navigationType === "POP") {
			if (pastRef.current[pastRef.current.length - 1] === curr) {
				futureRef.current.unshift(prev);
				pastRef.current.pop();
			} else if (futureRef.current.length > 0) {
				pastRef.current.push(prev);
				futureRef.current.shift();
			}
		}

		prevPathRef.current = curr;
		refreshNavState();
	}, [location.pathname, navigationType, refreshNavState]);

	const handleBack = useCallback(() => {
		if (pastRef.current.length === 0) return;
		navigate(-1);
	}, [navigate]);

	const handleForward = useCallback(() => {
		if (futureRef.current.length === 0) return;
		navigate(1);
	}, [navigate]);

	const handleHome = useCallback(() => {
		navigate("/");
	}, [navigate]);

	const isHome = location.pathname === "/";

	/** Wails runtime 是否可用(浏览器/纯 WebView 环境为 false) */
	const runtimeAvailable =
		typeof window !== "undefined" &&
		!!(window as unknown as { runtime?: unknown }).runtime;
	/** H5/浏览器下完全不传拖拽 style:仅 Wails 环境需要,让 DOM 上看不到 --wails-draggable 属性 */
	const dragStyle: React.CSSProperties | undefined = runtimeAvailable
		? DRAG_STYLE
		: undefined;
	const noDragStyle: React.CSSProperties | undefined = runtimeAvailable
		? NO_DRAG_STYLE
		: undefined;

	/** 挂载时拉一次最大化状态,避免图标一开始就错 */
	useEffect(() => {
		if (!runtimeAvailable) return;
		let cancelled = false;
		WindowIsMaximised()
			.then((v) => {
				if (!cancelled) setIsMaximised(v);
			})
			.catch(() => {
				// runtime 调用失败(Wails dev 未就绪)→ 静默忽略,保持默认 false
			});
		return () => {
			cancelled = true;
		};
	}, [runtimeAvailable]);

	const handleMinimize = useCallback(() => {
		if (runtimeAvailable) WindowMinimise();
	}, [runtimeAvailable]);

	const handleMaximizeToggle = useCallback(() => {
		if (!runtimeAvailable) return;
		if (isMaximised) {
			WindowUnmaximise();
			setIsMaximised(false);
		} else {
			WindowToggleMaximise();
			setIsMaximised(true);
		}
	}, [isMaximised, runtimeAvailable]);

	const handleClose = useCallback(() => {
		// 调前端 runtime.Quit() → 触发 Go 端 OnShutdown 优雅退出
		if (runtimeAvailable) Quit();
	}, [runtimeAvailable]);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			// 排除三按钮区域的双击
			const target = e.target as HTMLElement;
			if (target.closest("[data-titlebar-button]")) return;
			handleMaximizeToggle();
		},
		[handleMaximizeToggle],
	);

	return (
		<div
			className="border-border/40 bg-background/80 flex h-9 shrink-0 items-center justify-between gap-2 border-b  backdrop-blur-md select-none"
			onDoubleClick={handleDoubleClick}
			style={dragStyle}>
			<div className="flex h-full shrink-0 items-center gap-2 pr-2 px-2">
				<span
					aria-hidden
					className="text-warning-50 text-sm font-bold bg-primary flex h-[22px] w-[22px] items-center justify-center rounded-md leading-none">
					E
				</span>
				<span className="text-primary truncate text-xs font-semibold leading-none">
					Evo
				</span>
				<span className=" ml-[-7px] text-foreground/80 truncate text-xs font-medium leading-none">
					Harness
				</span>
			</div>

			{/* 中(chat 页扩展):导航 + 会话标题 */}
			{onChatPage && (
				<>
						<div className="flex shrink-0 items-center" style={noDragStyle}>
						<Button
							aria-label="后退"
							className="text-muted-foreground hover:text-foreground h-7 w-7"
							disabled={!canBack}
							onClick={handleBack}
							size="icon"
							variant="ghost">
							<ArrowLeft className="h-[14px] w-[14px]" />
						</Button>
						<Button
							aria-label="前进"
							className="text-muted-foreground hover:text-foreground h-7 w-7"
							disabled={!canForward}
							onClick={handleForward}
							size="icon"
							variant="ghost">
							<ArrowRight className="h-[14px] w-[14px]" />
						</Button>
						{!isHome && (
							<Button
								aria-label="返回主页"
								className="text-muted-foreground hover:text-foreground h-7 w-7"
								onClick={handleHome}
								size="icon"
								variant="ghost">
								<Home className="h-[14px] w-[14px]" />
							</Button>
						)}
					</div>
					<div
						className="flex-1 flex items-center justify-center "
						style={dragStyle}>
						<div
							className="w-full border-border/40 bg-muted/20 text-foreground/80 flex h-7 min-w-0  items-center gap-2 rounded-md border px-5 text-xs "
							style={dragStyle}>
							<span className="truncate">{title}</span>
						</div>
					</div>
				</>
			)}

			{/* 右:chat 页扩展按钮 + 窗口管理(仅 Wails 环境显示三按钮) */}
			<div className="flex h-full shrink-0 items-center" style={noDragStyle}>
				{onChatPage && onToggleUnifiedLog && (
					<button
						aria-label={unifiedLogOpen ? "关闭统一日志" : "打开统一日志"}
						className={
							unifiedLogOpen
								? "bg-muted/60 text-foreground flex h-full aspect-square items-center justify-center transition-colors"
								: "text-muted-foreground hover:bg-muted/60 hover:text-foreground flex h-full aspect-square items-center justify-center transition-colors"
						}
						data-titlebar-button
						onClick={onToggleUnifiedLog}
						title={unifiedLogOpen ? "关闭统一日志" : "打开统一日志(原/前端/后端)"}
						type="button">
						<FileSearch className="h-[14px] w-[14px]" />
					</button>
				)}
				{runtimeAvailable && (
					<>
						<button
							aria-label="最小化"
							className="text-muted-foreground hover:bg-muted/60 hover:text-foreground flex h-full aspect-square items-center justify-center transition-colors"
							data-titlebar-button
							onClick={handleMinimize}
							type="button">
							<Minimize2 className="h-[14px] w-[14px]" />
						</button>
						<button
							aria-label={isMaximised ? "还原" : "最大化"}
							className="text-muted-foreground hover:bg-muted/60 hover:text-foreground flex h-full aspect-square items-center justify-center transition-colors"
							data-titlebar-button
							onClick={handleMaximizeToggle}
							type="button">
							{isMaximised ? (
								<PictureInPicture2 className="h-[14px] w-[14px]" />
							) : (
								<Square className="h-[12px] w-[12px]" />
							)}
						</button>
						<button
							aria-label="关闭"
							className="text-muted-foreground hover:bg-red-500/90 hover:text-white flex h-full aspect-square items-center justify-center transition-colors"
							data-titlebar-button
							onClick={handleClose}
							type="button">
							<X className="h-[14px] w-[14px]" />
						</button>
					</>
				)}
			</div>
		</div>
	);
}
