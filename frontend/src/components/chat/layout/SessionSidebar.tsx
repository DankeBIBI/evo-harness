import { cn } from "@/lib/utils";
import {
	Bot,
	ChevronDown,
	ChevronRight,
	FileText,
	Lightbulb,
	MessageSquare,
	PanelLeftClose,
	PanelLeftOpen,
	Plug,
	Search,
	Settings,
	Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// Material Web 组件(2026-08-17):用 <md-list> + <md-list-item> 渲染"自定义"折叠区
// 主题色由 --md-sys-color-* 变量映射到项目 HSL
import "@material/web/list/list.js";
import "@material/web/list/list-item.js";

import { ChatList } from "@/components/chat/panels/ChatList";
import { Button } from "@/components/ui/Button";
import { useAgentStore } from "@/stores/agentStore";
import { useLayoutStore, type AgentCategory } from "@/stores/layoutStore";
import { useMCPStore } from "@/stores/mcpStore";
import { usePromptStore } from "@/stores/promptStore";
import {
	useSettingsDialogStore,
	type SettingsTab,
} from "@/stores/settingsDialogStore";
import { useSkillStore } from "@/stores/skillStore";

const toolCategories: Array<{
	key: SettingsTab;
	icon: typeof Bot;
	label: string;
}> = [{ key: "plugins", icon: Wrench, label: "插件" }];

/**
 * SessionSidebar — 极简左栏（Cursor 风格）
 *
 * 双模式(2026-08-18):
 * - 完整模式(collapsed=false): 原行为,宽 leftWidth, 顶部“收起”按钮
 * - 图标条模式(collapsed=true): ~48px 单列图标,保留关键入口快捷操作,
 *   点最下方 PanelLeftOpen 展开回完整模式
 */
interface SessionSidebarProps {
	onCreateConversation: () => void;
}

export function SessionSidebar({ onCreateConversation }: SessionSidebarProps) {
	const openSettingsTo = useSettingsDialogStore((s) => s.openTo);
	const [showSearch, setShowSearch] = useState(false);
	const [showConversations, setShowConversations] = useState(true);
	// "自定义"折叠区展开状态(2026-08-17:Material Web 风格折叠)
	const [customExpanded, setCustomExpanded] = useState(true);
	const collapsed = useLayoutStore((s) => s.leftCollapsed);
	const toggleCollapsed = useLayoutStore((s) => s.toggleLeftCollapsed);
	// 完全隐藏态下在主区左上角已有 PanelLeftOpen 按钮,侧栏本身不需额外按钮
	// 这里仅负责“完整⇄图标条”折叠
	const agents = useAgentStore((s) => s.agents);
	const prompts = usePromptStore((s) => s.prompts);
	const skills = useSkillStore((s) => s.skills);
	const mcpServers = useMCPStore((s) => s.servers);
	const loadMCP = useMCPStore((s) => s.load);

	useEffect(() => {
		loadMCP();
	}, [loadMCP]);

	const categoryCounts = useMemo<Record<AgentCategory, number>>(
		() => ({
			agents: agents.length,
			cli: 0,
			hooks: 0,
			mcp: mcpServers.length,
			plugins: 0,
			prompts: prompts.length,
			skills: skills.length,
		}),
		[agents.length, mcpServers.length, prompts.length, skills.length],
	);

	return (
		<aside
			className={cn(
				"border-border/70 bg-background group flex h-full w-full shrink-0 flex-col rounded-lg border",
			)}
			data-collapsed={collapsed ? "true" : "false"}>
			{/* 图标条模式主体(2026-08-18) — VS Code Activity Bar 风格: 纵列 48px 图标 */}
			<nav
				aria-label="侧栏快捷入口"
				className={cn(
					"flex h-full w-full flex-col items-center gap-1 px-1 py-2",
					"group-data-[collapsed=false]:hidden", // 完整模式下隐藏
				)}>
				<IconBarButton
					icon={MessageSquare}
					label="会话"
					onClick={toggleCollapsed}
				/>
				<IconBarButton
					icon={Search}
					label="搜索"
					onClick={() => {
						toggleCollapsed();
						setShowSearch(true);
					}}
				/>
				<IconBarButton
					icon={Wrench}
					label="插件"
					onClick={() => openSettingsTo("plugins")}
				/>
				<div className="mt-auto flex w-full flex-col items-center gap-1">
					<div className="bg-border/60 h-px w-6" />
					<IconBarButton
						icon={Settings}
						label="设置"
						onClick={() => openSettingsTo()}
					/>
					<IconBarButton
						icon={PanelLeftOpen}
						label="展开侧栏"
						onClick={toggleCollapsed}
					/>
				</div>
			</nav>

			{/* 完整模式主体(2026-08-18) — 原行为,加 data-full 供 CSS 隐藏 */}
			<div
				className={cn(
					"flex h-full w-full flex-col",
					"group-data-[collapsed=true]:hidden", // 图标条模式下隐藏
				)}
				data-full="">
				<div className="flex h-10 shrink-0 items-center gap-1 px-2">
					<span className="text-muted-foreground px-1 text-xs font-medium">
						会话
					</span>

				<Button
					aria-label="新建会话"
					className="bg-muted/40 hover:bg-muted text-muted-foreground h-6 gap-1 rounded-md px-1.5 text-xs"
					onClick={onCreateConversation}
					size="sm"
					variant="ghost">
					<span className="font-mono text-[10px]">新</span>
					<span className="font-mono text-[10px]">Ctrl+N</span>
				</Button>

				<div className="ml-auto flex items-center gap-0.5">
					<Button
						aria-label="搜索会话"
						className="text-muted-foreground hover:text-foreground h-6 w-6"
						onClick={() => setShowSearch((prev) => !prev)}
						size="icon"
						variant={showSearch ? "secondary" : "ghost"}>
						<Search className="h-[14px] w-[14px]" />
					</Button>
						<Button
						aria-label="折叠为图标条"
						className="text-muted-foreground hover:text-foreground h-6 w-6"
						onClick={toggleCollapsed}
						size="icon"
						title="折叠为图标条"
						variant="ghost">
						<PanelLeftClose className="h-[14px] w-[14px]" />
					</Button>
				</div>
			</div>

			<div className="min-h-0 flex-1 border-t border-border/50">
				<button
					className="text-muted-foreground hover:bg-accent/50 hover:text-foreground flex h-[30px] w-full items-center gap-1.5 px-3 text-left text-xs transition-colors"
					onClick={() => setShowConversations((prev) => !prev)}
					type="button">
					{showConversations ? (
						<ChevronDown className="h-[13px] w-[13px]" />
					) : (
						<ChevronRight className="h-[13px] w-[13px]" />
					)}
					<span className="flex-1 font-medium">最近对话</span>
					<span className="text-[10px] opacity-70">
						{showConversations ? "收起" : "展开"}
					</span>
				</button>
				{showConversations && (
					<div className="h-[calc(100%-2rem)] overflow-y-auto">
						<ChatList
							className="bg-background border-0"
							compact
							showSearch={showSearch}
						/>
					</div>
				)}
			</div>

			{/* "自定义"折叠区(2026-08-17:Material Web 风格) */}
			<div className="border-border/70 shrink-0 border-t px-2 py-2">
				<button
					aria-expanded={customExpanded}
					className="text-muted-foreground hover:text-foreground flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-xs font-medium transition-colors"
					onClick={() => setCustomExpanded((v) => !v)}
					type="button">
					{customExpanded ? (
						<ChevronDown className="h-[13px] w-[13px]" />
					) : (
						<ChevronRight className="h-[13px] w-[13px]" />
					)}
					<span className="flex-1 text-left">自定义</span>
					<span className="text-[10px] opacity-70">
						{customExpanded ? "收起" : "展开"}
					</span>
				</button>
				{customExpanded && (
					<md-list className="md-list-compact" style={{ padding: "0 4px" }}>
						{toolCategories.map((tool) => (
							<md-list-item
								key={tool.key}
								type="button"
								onClick={() => openSettingsTo(tool.key)}>
								<span
									slot="start"
									className="flex shrink-0 items-center justify-center">
									<tool.icon className="text-muted-foreground h-[14px] w-[14px]" />
								</span>
								<span slot="headline" className="text-xs">
									{tool.label}
								</span>
								<span
									slot="trailing-supporting-text"
									className="tabular-nums text-xs opacity-70">
									{categoryCounts[tool.key]}
								</span>
							</md-list-item>
						))}
					</md-list>
				)}

				{/* 分隔线 + 设置入口(全局设置,不属于"自定义"分类) */}
				<div className="border-border/40 my-2 border-t" />
				<button
					aria-label="设置"
					className="text-muted-foreground hover:bg-accent/50 hover:text-foreground mt-1 flex h-6 w-full items-center gap-2 rounded-md px-1.5 text-xs transition-colors duration-150"
					onClick={() => openSettingsTo()}
					type="button">
					<Settings className="h-[14px] w-[14px] shrink-0" />
					<span className="flex-1 text-left">设置</span>
				</button>
			</div>
			</div>
		</aside>
	);
}

/**
 * IconBarButton — 图标条上的单图标按钮(2026-08-18)
 * 设计:36×36 圆形 hover 背景,label 作为原生 title tooltip,
 *       不依赖 Portal — 严格锁定在 48px 图标条布局内
 */
function IconBarButton({
	icon: Icon,
	label,
	onClick,
}: {
	icon: typeof MessageSquare;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			aria-label={label}
			className={cn(
				"text-muted-foreground hover:bg-accent hover:text-foreground",
				"flex h-9 w-9 items-center justify-center rounded-md",
				"transition-colors duration-150",
				"focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
			)}
			onClick={onClick}
			title={label}
			type="button">
			<Icon className="h-[18px] w-[18px]" />
		</button>
	);
}
