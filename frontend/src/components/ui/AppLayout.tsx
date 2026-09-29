import { ToolConfirmDialog } from "@/components/chat/dialogs/ToolConfirmDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useTheme } from "@/hooks/useTheme";
import { useLayoutStore } from "@/stores/layoutStore";
import { KeepAlive } from "keepalive-for-react";
import { lazy, Suspense, useMemo } from "react";
import type { ComponentType } from "react";
import { useLocation, useOutlet } from "react-router-dom";

// CustomTitleBar 始终懒加载挂载(品牌栏 / 路由导航 / 回主页 在 H5/浏览器环境也要显示)。
// Wails 专属行为(拖拽 style、窗口管理按钮)由组件内部按 window.runtime 是否存在自行判断。
// 不管 Wails 还是 H5，都需要能挂载,不再用 hasWailsRuntime 提前设 null。
/** CustomTitleBar 入参(与组件 props 对齐) */
interface TitleBarProps {
	/** chat 页面扩展区是否显示 */
	onChatPage?: boolean;
	/** 点击顶栏“统一日志”按钮 */
	onToggleUnifiedLog?: () => void;
	/** 统一日志是否打开 */
	unifiedLogOpen?: boolean;
}

const titleBarLoader = import.meta.glob<{
	CustomTitleBar: ComponentType<TitleBarProps>;
}>("/src/components/layout/CustomTitleBar.tsx");
// CustomTitleBar 只有命名导出(named export),React.lazy 要求 default,
// 这里用 .then() 把 named export 适配为 default 形式
const CustomTitleBar = lazy(async () => {
	const mod = await titleBarLoader[
		"/src/components/layout/CustomTitleBar.tsx"
	]();
	return { default: mod.CustomTitleBar };
});

export function AppLayout() {
	useTheme(); // 应用主题
	const location = useLocation();
	const outlet = useOutlet();
	// (2026-08-18) 统一日志状态从 layoutStore 读,与顶栏按钮共享
	const unifiedLogOpen = useLayoutStore((s) => s.unifiedLogOpen);
	const toggleUnifiedLog = useLayoutStore((s) => s.toggleUnifiedLog);

	const activeCacheKey = useMemo(() => {
		return location.pathname;
	}, [location.pathname]);

	return (
		<div className="bg-background text-foreground flex flex-col h-screen w-screen overflow-hidden font-sans selection:bg-muted/50">
			{/* CustomTitleBar: H5/浏览器也要显示(品牌 + 路由导航),仅 Wails 环境挂上拖拽 + 窗口管理 */}
			<Suspense fallback={null}>
				<CustomTitleBar
					onChatPage={location.pathname === "/chat"}
					onToggleUnifiedLog={toggleUnifiedLog}
					unifiedLogOpen={unifiedLogOpen}
				/>
			</Suspense>
			<main className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden mt-1">
				<KeepAlive activeCacheKey={activeCacheKey} include={["/chat"]} max={10}>
					{outlet}
				</KeepAlive>
			</main>
			<ToolConfirmDialog />
			<SettingsDialog />
		</div>
	);
}
