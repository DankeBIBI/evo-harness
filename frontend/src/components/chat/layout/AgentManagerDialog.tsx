import { cn } from "@/lib/utils";
import {
	Bot,
	ChevronRight,
	ChevronsUpDown,
	FileText,
	Inbox,
	Lightbulb,
	Plug,
	Plus,
	Search,
	Terminal,
	Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/Input";
import { formatAgentName, useEnabledAgents, useAgentStore } from "@/stores/agentStore";
import { type AgentCategory } from "@/stores/layoutStore";
import { useMCPStore } from "@/stores/mcpStore";
import { formatSkillName, useEnabledSkills, useSkillStore } from "@/stores/skillStore";
import { useSourceStore } from "@/stores/sourceStore";

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
	const agents = useEnabledAgents();
	const skills = useEnabledSkills();
	const fetchAgents = useAgentStore((s) => s.fetchAgents);
	const fetchSkills = useSkillStore((s) => s.fetchSkills);
	const toggleSkill = useSkillStore((s) => s.toggleSkill);
	const selectedSkillIds = useSkillStore((s) => s.selectedSkillIds);
	const showSourceLabel = useSourceStore((s) => s.config.showSourceLabel);
	const mcpServers = useMCPStore((s) => s.servers);
	const loadMCP = useMCPStore((s) => s.load);

	useEffect(() => {
		loadMCP();
		void Promise.all([fetchAgents(), fetchSkills()]);
	}, [fetchAgents, fetchSkills, loadMCP]);

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
							name: formatAgentName(agent, showSourceLabel),
						})),
					},
				],
			};
		}

		if (activeCategory === "skills") {
			const selectedVisibleCount = skills.filter((skill) =>
				selectedSkillIds.includes(skill.id),
			).length;
			return {
				...base,
				groups: [
					{
						label: `已导入 (${selectedVisibleCount}/${skills.length} 已选)`,
						items: skills.map((skill) => ({
							active: selectedSkillIds.includes(skill.id),
							description: skill.description || skill.type || "暂无描述",
							name: formatSkillName(skill, showSourceLabel),
							onClick: () => toggleSkill(skill.id),
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
	}, [
		activeCategory,
		agents,
		mcpServers,
		selectedSkillIds,
		showSourceLabel,
		skills,
		toggleSkill,
	]);

	/** 单次遍历:按关键词过滤分组,同时派生"是否有可见项"驱动空状态 */
	const visibleGroups = useMemo(() => {
		if (!query) {
			return content.groups;
		}

		const q = query.toLowerCase();

		return content.groups.map((group) => ({
			...group,
			items: group.items.filter((it) =>
				it.name.toLowerCase().includes(q),
			),
		}));
	}, [content, query]);
	const hasVisible = useMemo(
		() => visibleGroups.some((g) => g.items.length > 0),
		[visibleGroups],
	);

	return (
		<div className="bg-card flex h-full flex-col">
			{/* 父级(SettingsDialog)已提供左侧 tab + 顶部标题,
			    此处只渲染当前 tab 的内容区(右栏) */}
			<div className="flex min-h-0 flex-1 flex-col">
				{/* 标题 + 描述 */}
				<div className="px-6 pt-5">
					<h2 className="text-foreground text-base font-semibold">
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
						<div className="bg-background border-border/60 focus-within:border-primary/40 flex min-h-9 flex-1 items-center gap-2 rounded-md border px-3 py-1.5 transition-colors duration-150 focus-within:ring-2 focus-within:ring-primary/10">
							<Search className="text-muted-foreground h-4 w-4 shrink-0" />
							<Input
								className="bg-transparent text-foreground placeholder:text-muted-foreground/50 h-auto border-0 p-0 text-xs shadow-none focus-visible:ring-0"
								onChange={(e) => setQuery(e.target.value)}
								placeholder="输入以搜索..."
								value={query}
							/>
						</div>
						<NewItemButton category={activeCategory} />
					</div>

					{/* 列表 */}
					<div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
						{visibleGroups.map((group) => (
							<GroupSection
								count={group.items.length}
								key={group.label}
								label={group.label}>
								{group.items.map((it) => (
									<div
										aria-pressed={it.onClick ? it.active === true : undefined}
										className={cn(
											"border-border/40 rounded-md border-b px-2 py-3 transition-colors duration-150 last:border-b-0",
											it.onClick && "hover:bg-accent/20 cursor-pointer",
											it.active && "bg-primary/10 ring-primary/20 ring-1",
										)}
										key={it.name}
										onClick={it.onClick}
										onKeyDown={(event) => {
											if (it.onClick && (event.key === "Enter" || event.key === " ")) {
												event.preventDefault();
												it.onClick();
											}
										}}
										role={it.onClick ? "button" : undefined}
										tabIndex={it.onClick ? 0 : undefined}>
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

						{/* 空状态:无数据或搜索无匹配 */}
						{!hasVisible ? (
							<EmptyState query={query} reset={() => setQuery("")} />
						) : null}
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

	const label = useMemo(() => {
		const map: Record<AgentCategory, string> = {
			cli: "命令",
			agents: "智能体",
			skills: "技能",
			prompts: "指令",
			hooks: "挂钩",
			mcp: "MCP",
			plugins: "插件",
		};
		return map[category] ?? category;
	}, [category]);

	const baseClass =
		// min-h + py:高度随全局字体令牌自适应,避免固定高度下文字溢出
		"bg-primary text-primary-foreground hover:bg-primary/90 flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-colors duration-150";

	if (scope.length === 0) {
		return (
			<button className={baseClass} type="button">
				<Plus className="h-4 w-4" />
				新建{label}
			</button>
		);
	}

	return (
		<div className="relative">
			<button
				className={baseClass}
				onClick={() => setShowScope((v) => !v)}
				type="button">
				<Plus className="h-4 w-4" />
				<span>新建{label}</span>
				<ChevronsUpDown className="h-3.5 w-3.5 opacity-70" />
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
						<div className="text-muted-foreground px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider">
							选择写入位置
						</div>
						{scope.map((file) => (
							<button
								className="text-foreground/90 hover:bg-accent/40 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150"
								key={file}
								onClick={() => {
									setShowScope(false);
									// TODO: 实际新建到 file
								}}
								type="button">
								<FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
								<span className="truncate font-mono">{file}</span>
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function EmptyState({ query, reset }: { query: string; reset: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
			<div className="bg-muted/40 border-border/40 flex h-12 w-12 items-center justify-center rounded-full border">
				<Inbox className="text-muted-foreground h-5 w-5" />
			</div>
			<div className="space-y-1">
				<p className="text-foreground/80 text-sm font-medium">
					{query ? "未找到匹配项" : "暂无内容"}
				</p>
				<p className="text-muted-foreground text-xs">
					{query
						? `没有与“${query}”相关的结果`
						: "点击右上角按钮即可创建"}
				</p>
			</div>
			{query && (
				<button
					className="text-primary hover:text-primary/80 text-xs font-medium transition-colors duration-150"
					onClick={reset}
					type="button">
					清除搜索
				</button>
			)}
		</div>
	);
}
