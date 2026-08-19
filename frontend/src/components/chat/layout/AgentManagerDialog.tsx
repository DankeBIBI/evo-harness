import { cn } from "@/lib/utils";
import {
	Bot,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	ChevronsUpDown,
	ExternalLink,
	FileText,
	Lightbulb,
	Maximize2,
	Plug,
	Plus,
	Search,
	Terminal,
	Wrench,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/Input";
import { SidebarItem } from "@/components/common/SidebarItem";
import { useAgentStore } from "@/stores/agentStore";
import { type AgentCategory } from "@/stores/layoutStore";
import { useMCPStore } from "@/stores/mcpStore";
import { usePromptStore } from "@/stores/promptStore";
import { useSkillStore } from "@/stores/skillStore";

import { categoryContent, type CategoryContent } from "./agentCategoryContent";

/**
 * AgentManagerContent — "智能体自定义" 管理内容(2026-08-17 改造)
 *
 * 原 AgentManagerDialog(Dialog 壳 + 内容) 已并入 SettingsDialog,
 * 此处仅保留 Content 部分供 SettingsDialog 复用。
 *
 * 布局(内部双栏):
 *   左 200px: 7 个类别 + 数量徽章
 *   右弹性: 标题 + 描述 + 搜索 + 新建工具栏 + 列表
 */
const categories: Array<{
	key: AgentCategory;
	icon: typeof Bot;
	label: string;
}> = [
	{ key: "cli", icon: Terminal, label: "命令行" },
	{ key: "agents", icon: Bot, label: "智能体" },
	{ key: "skills", icon: Lightbulb, label: "技能" },
	{ key: "prompts", icon: FileText, label: "指令" },
	{ key: "hooks", icon: Wrench, label: "挂钩" },
	{ key: "mcp", icon: Plug, label: "MCP服务器" },
	{ key: "plugins", icon: Wrench, label: "插件" },
];

export function AgentManagerContent({
	activeCategory,
	onCategoryChange,
	onClose,
}: {
	activeCategory: AgentCategory;
	onCategoryChange: (c: AgentCategory) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	// 2026-08-17: 复用 AgentManagerContent 在 SettingsDialog 多个 tab 间,
	// 切 tab 时重置搜索关键词,避免污染下一个 tab 的列表过滤
	useEffect(() => {
		setQuery("");
	}, [activeCategory]);
	const agents = useAgentStore((s) => s.agents);
	const prompts = usePromptStore((s) => s.prompts);
	const skills = useSkillStore((s) => s.skills);
	const mcpServers = useMCPStore((s) => s.servers);
	const loadMCP = useMCPStore((s) => s.load);

	useEffect(() => {
		loadMCP();
	}, [loadMCP]);

	const content = useMemo<CategoryContent>(() => {
		const base = categoryContent[activeCategory];

		if (activeCategory === "agents") {
			return {
				...base,
				groups: [
					{
						label: "已导入",
						items: agents.map((agent) => ({
							description: agent.description || agent.role || "暂无描述",
							name: agent.name,
						})),
					},
				],
			};
		}

		if (activeCategory === "skills") {
			const toggleSkill = useSkillStore.getState().toggleSkill;
			const selectedSkillIds = useSkillStore((s) => s.selectedSkillIds);
			return {
				...base,
				groups: [
					{
						label: `已导入 (${selectedSkillIds.length}/${skills.length} 已选)`,
						items: skills.map((skill) => ({
							active: selectedSkillIds.includes(skill.id),
							description: skill.description || skill.type || "暂无描述",
							name: skill.name,
							onClick: () => toggleSkill(skill.id),
						})),
					},
				],
			};
		}

		if (activeCategory === "prompts") {
			return {
				...base,
				groups: [
					{
						label: "已添加",
						items: prompts.map((prompt) => ({
							description: prompt.content || "暂无描述",
							name: prompt.name,
						})),
					},
				],
			};
		}

		if (activeCategory === "mcp") {
			return {
				...base,
				groups: [
					{
						label: "已连接",
						items: mcpServers.map((server) => ({
							description: server.type || "暂无描述",
							name: server.name || server.id || "未命名 MCP 服务器",
						})),
					},
				],
			};
		}

		return base;
	}, [activeCategory, agents, mcpServers, prompts, skills]);

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
		<div className="bg-card flex h-full flex-col">
			{/* 父级(SettingsDialog)已提供左侧 tab + 顶部标题,
			    此处只渲染当前 tab 的内容区(右栏) */}
			<div className="flex min-h-0 flex-1 flex-col">
				{/* 标题 + 描述 */}
				<div className="px-6 pt-5">
					<h2 className="text-foreground text-lg font-semibold">
						{content.title}
						</h2>
						<p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
							{content.description}{" "}
							<a className="text-primary hover:text-primary/80 cursor-pointer">
								{content.linkLabel}
							</a>
						</p>
					</div>

					{/* 搜索 + 新建 */}
					<div className="mt-4 flex items-center gap-2 px-6">
						<div className="bg-muted/30 border-border/40 flex h-8 flex-1 items-center gap-2 rounded-md border px-3">
							<Search className="text-muted-foreground h-[14px] w-[14px]" />
							<Input
								className="bg-transparent text-foreground placeholder:text-muted-foreground/60 h-6 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
								onChange={(e) => setQuery(e.target.value)}
								placeholder="输入以搜索..."
								value={query}
							/>
						</div>
						<NewItemButton category={activeCategory} />
					</div>

					{/* 列表 */}
					<div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
						{content.groups.map((group) => (
							<GroupSection
								count={group.items.length}
								key={group.label}
								label={group.label}>
								{group.items
									.filter((it) =>
										query
											? it.name.toLowerCase().includes(query.toLowerCase())
											: true,
									)
									.map((it) => (
										<div
											className="border-border/40 hover:bg-accent/20 border-b px-1 py-3 transition-colors duration-150 last:border-b-0"
											key={it.name}>
											<div className="text-foreground/90 text-xs font-medium">
												{it.name}
											</div>
											<div className="text-muted-foreground mt-1 line-clamp-2 text-[11px] leading-relaxed">
												{it.description}
											</div>
										</div>
									))}
							</GroupSection>
						))}
					</div>
				</div>
			</div>
	);
}

function GroupSection({
	label,
	count,
	children,
	defaultOpen = true,
}: {
	label: string;
	count: number;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="mb-4">
			<button
				className="text-foreground/80 hover:text-foreground flex w-full items-center gap-1.5 py-1.5 text-xs font-medium"
				onClick={() => setOpen((v) => !v)}
				type="button">
				{open ? (
					<ChevronRight className="h-[12px] w-[12px] rotate-90 transition-transform duration-150" />
				) : (
					<ChevronRight className="h-[12px] w-[12px] transition-transform duration-150" />
				)}
				<span>{label}</span>
				<span className="text-muted-foreground tabular-nums">{count}</span>
			</button>
			{open && <div className="ml-0">{children}</div>}
		</div>
	);
}

function NewItemButton({ category }: { category: AgentCategory }) {
	const scope = useMemo(() => {
		// 模拟不同类别对应的可写入文件列表
		if (
			category === "skills" ||
			category === "agents" ||
			category === "prompts"
		) {
			return [
				"LICENSE",
				"turbo.json",
				"vben-admin.code-workspace",
				"vitest.config.ts",
				"vitest.workspace.ts",
			];
		}
		return [];
	}, [category]);

	const [showScope, setShowScope] = useState(false);

	if (scope.length === 0) {
		return (
			<button
				className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150"
				type="button">
				<Plus className="h-[14px] w-[14px]" />
				New {category}
			</button>
		);
	}

	return (
		<div className="relative">
			<button
				className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150"
				onClick={() => setShowScope((v) => !v)}
				type="button">
				<Plus className="h-[14px] w-[14px]" />
				<span>New {category} (Workspace)</span>
				<ChevronsUpDown className="h-[12px] w-[12px] opacity-70" />
			</button>

			{showScope && (
				<>
					{/* 点击外部关闭 */}
					<div
						aria-label="close-scope"
						className="fixed inset-0 z-40"
						onClick={() => setShowScope(false)}
					/>
					{/* 作用域下拉（弹窗底部） */}
					<div
						className={cn(
							"bg-popover border-border/60 absolute right-0 bottom-full z-50 mb-1 w-72 rounded-md border p-1 shadow-lg",
							"animate-in fade-in-0 zoom-in-95 duration-150",
						)}>
						{scope.map((file) => (
							<button
								className="text-foreground/90 hover:bg-accent/40 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150"
								key={file}
								onClick={() => {
									setShowScope(false);
									// TODO: 实际新建到 file
								}}
								type="button">
								<ChevronsRight className="text-primary h-[12px] w-[12px]" />
								<span className="truncate font-mono">{file}</span>
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}
