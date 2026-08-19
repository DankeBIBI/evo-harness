import {
	Bot,
	FileText,
	Info,
	Lightbulb,
	Plug,
	Server,
	Settings as SettingsIcon,
	Sliders,
	Wrench,
} from "lucide-react";
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import {
	useSettingsDialogStore,
	type SettingsTab,
} from "@/stores/settingsDialogStore";
import { cn } from "@/lib/utils";
// Material Web 组件(2026-08-17 引用):关于 tab 用 <md-filled-tonal-button> 演示
// design system 集成;主题色由 index.css 的 --md-sys-color-* 变量映射
import "@material/web/button/filled-tonal-button.js";

import { AgentManagerContent } from "../chat/layout/AgentManagerDialog";
import GeneralSettingsView from "../../pages/settings/GeneralSettingsView";
import ModelsSettingsView from "../../pages/settings/ModelsSettingsView";
import SourcesSettingsView from "../../pages/settings/SourcesSettingsView";

interface TabDef {
	description: string;
	icon: LucideIcon;
	key: SettingsTab;
	label: string;
}

/** tab 顺序: 6 类"自定义" + 通用 + 模型 + 数据源 + 关于 */
const TABS: TabDef[] = [
	{
		key: "agents",
		label: "智能体",
		icon: Bot,
		description: "导入与管理 Agent",
	},
	{
		key: "skills",
		label: "技能",
		icon: Lightbulb,
		description: "为 Agent 配置可调用技能",
	},
	{
		key: "prompts",
		label: "指令",
		icon: FileText,
		description: "提示词模板库",
	},
	{
		key: "hooks",
		label: "挂钩",
		icon: Wrench,
		description: "工具调用前后钩子",
	},
	{
		key: "mcp",
		label: "MCP 服务器",
		icon: Plug,
		description: "Model Context Protocol 服务",
	},
	{ key: "plugins", label: "插件", icon: Server, description: "扩展插件" },
	{
		key: "general",
		label: "通用",
		icon: SettingsIcon,
		description: "主题 / 语言 / 字体",
	},
	{ key: "models", label: "模型", icon: Sliders, description: "模型参数配置" },
	{
		key: "sources",
		label: "数据源",
		icon: FileText,
		description: "Agent 数据来源",
	},
	{ key: "about", label: "关于", icon: Info, description: "应用信息" },
];

export function SettingsDialog() {
	const open = useSettingsDialogStore((s) => s.open);
	const close = useSettingsDialogStore((s) => s.close);
	const tab = useSettingsDialogStore((s) => s.tab);
	const setTab = useSettingsDialogStore((s) => s.setTab);

	const activeDef = useMemo(
		() => TABS.find((t) => t.key === tab) ?? TABS[0],
		[tab],
	);

	return (
		<Dialog onOpenChange={(v) => !v && close()} open={open}>
			<DialogContent className="max-w-[85vw] min-h-0 max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
				<div className="bg-card flex min-h-0 flex-1">
					{/* 左侧 tab 栏(固定不滚动) */}
					<div className="border-border/40 bg-muted/20 flex w-[200px] shrink-0 flex-col border-r">
						<DialogHeader className="border-border/40 shrink-0 gap-0 border-b px-8 py-3">
							<DialogTitle className="text-foreground/90 text font-medium tracking-normal">
								设置
							</DialogTitle>
						</DialogHeader>
						<nav className="min-h-0 flex-1 overflow-hidden p-2" role="tablist">
							<div className="text-muted-foreground mb-1 px-2 text-[16px] font-medium tracking-wider uppercase">
								自定义
							</div>
							{TABS.slice(0, 6).map((t) => (
								<TabButton
									active={tab === t.key}
									icon={t.icon}
									key={t.key}
									label={t.label}
									onClick={() => setTab(t.key)}
								/>
							))}
							<div className="text-muted-foreground mt-3 mb-1 px-2 text-[18px] font-medium tracking-wider uppercase">
								全局
							</div>
							{TABS.slice(6).map((t) => (
								<TabButton
									active={tab === t.key}
									icon={t.icon}
									key={t.key}
									label={t.label}
									onClick={() => setTab(t.key)}
								/>
							))}
						</nav>
					</div>

					{/* 右侧内容区 */}
					<div className="flex-1 overflow-y-scroll">
						{tab === "general" && <GeneralSettingsView />}
						{tab === "models" && <ModelsSettingsView />}
						{tab === "sources" && <SourcesSettingsView />}
						{tab === "about" && <AboutView />}
						{/* 6 类"自定义"全部复用 AgentManagerContent(category=tab) */}
						{(tab === "agents" ||
							tab === "skills" ||
							tab === "prompts" ||
							tab === "hooks" ||
							tab === "mcp" ||
							tab === "plugins") && (
							<AgentManagerContent
								activeCategory={tab}
								onCategoryChange={(c) => setTab(c as SettingsTab)}
								onClose={close}
							/>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function TabButton({
	active,
	icon: Icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: LucideIcon;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			aria-selected={active}
			className={cn(
				"flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs transition-colors duration-150",
				active
					? "bg-primary/10 text-foreground font-medium"
					: "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
			)}
			onClick={onClick}
			role="tab"
			type="button">
			<Icon className="h-[14px] w-[14px] shrink-0" />
			<span className="flex-1 text-left">{label}</span>
		</button>
	);
}

function AboutView() {
	return (
		<div className="max-w-2xl space-y-6 p-6">
			<div>
				<h4 className="text-foreground text-sm font-medium">Evo Harness</h4>
				<p className="text-muted-foreground mt-1 text-xs">
					AI 编码与创作工作台
				</p>
			</div>
			<dl className="space-y-2 text-xs">
				<div className="flex justify-between border-b border-border/40 py-1.5">
					<dt className="text-muted-foreground">版本</dt>
					<dd>1.0.0</dd>
				</div>
				<div className="flex justify-between border-b border-border/40 py-1.5">
					<dt className="text-muted-foreground">框架</dt>
					<dd>Wails + React 18 + TypeScript</dd>
				</div>
				<div className="flex justify-between border-b border-border/40 py-1.5">
					<dt className="text-muted-foreground">UI 库</dt>
					<dd>Material Web · shadcn/ui · Lucide</dd>
				</div>
			</dl>
			{/* Material Web 组件演示(2026-08-17 引入):
			   - 项目主题色由 --md-sys-color-* 映射到 HSL 变量
			   - 实际渲染走 Material Design 3 规范 */}
			<div className="flex items-center gap-2 pt-2">
				<md-filled-tonal-button>查看 Material Web 文档</md-filled-tonal-button>
			</div>
		</div>
	);
}
