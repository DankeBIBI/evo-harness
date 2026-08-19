import { ToolConfirmDialog } from "@/components/chat/dialogs/ToolConfirmDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { CustomTitleBar } from "@/components/layout/CustomTitleBar";
import { useTheme } from "@/hooks/useTheme";
import { useLayoutStore } from "@/stores/layoutStore";
import { KeepAlive } from "keepalive-for-react";
import { useMemo } from "react";
import { useLocation, useOutlet } from "react-router-dom";

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
			<CustomTitleBar
				onChatPage={location.pathname === "/chat"}
				onToggleUnifiedLog={toggleUnifiedLog}
				unifiedLogOpen={unifiedLogOpen}
			/>
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
