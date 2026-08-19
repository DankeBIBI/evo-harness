/**
 * ToolGrantDialog — 会话级工具放行弹窗
 *
 * 从聊天输入框的 "Skills / Tools" 按钮打开：
 *   - 按分类(file/interactive/plan/meta)树形分组展示全部已注册工具
 *   - 勾选 = 放行给当前会话(写入 sessionToolStore,合并进 effectiveTools)
 *   - 常驻工具显示"默认"角标,不参与勾选(取消不掉,任何会话都放行)
 */

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import type { ToolCategory } from '@/lib/tools/base';
import { getRegisteredTools } from '@/lib/tools/registry';
import { cn } from '@/lib/utils';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';
import {
	RESIDENT_TOOLS,
	RESIDENT_TOOL_SET,
	useSessionToolStore,
} from '@/stores/sessionToolStore';
import {
	Check,
	ChevronDown,
	ClipboardCheck,
	FileText,
	ListChecks,
	MessageSquare,
	RotateCcw,
	Search,
	Settings2,
	Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface Props {
	/** 会话 ID(无会话时为 null,保存按钮禁用) */
	convId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** 分类展示元信息(图标 + 中文名) */
const CATEGORY_META: Record<
	ToolCategory,
	{ icon: typeof FileText; label: string }
> = {
	file: { icon: FileText, label: '文件' },
	interactive: { icon: MessageSquare, label: '交互' },
	meta: { icon: ListChecks, label: '元工具' },
	plan: { icon: ClipboardCheck, label: '计划' },
};

const CATEGORY_ORDER: ToolCategory[] = ['file', 'interactive', 'plan', 'meta'];

interface ToolCheckboxProps {
	checked: boolean;
	disabled?: boolean;
	onChange: () => void;
}

/** 内联复选框(原生 input 样式不好统一,用手写 button + Check 图标) */
function ToolCheckbox({ checked, disabled, onChange }: ToolCheckboxProps) {
	return (
		<button
			aria-checked={checked}
			className={cn(
				'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
				checked
					? 'border-primary bg-primary'
					: 'border-muted-foreground/30 bg-transparent hover:border-muted-foreground/60',
				disabled && 'cursor-not-allowed opacity-60',
			)}
			disabled={disabled}
			onClick={(e) => {
				e.stopPropagation();
				onChange();
			}}
			role="checkbox"
			type="button"
		>
			{checked && <Check className="h-3 w-3 text-primary-foreground" />}
		</button>
	);
}

export function ToolGrantDialog({ convId, open, onOpenChange }: Props) {
	const { getAllowedTools, resetAllowedTools, setAllowedTools } =
		useSessionToolStore();

	/** 本地勾选态:常驻工具恒选中(禁改),额外放行 = 选中集 - 常驻 */
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(RESIDENT_TOOLS),
	);
	const [search, setSearch] = useState('');
	const [collapsed, setCollapsed] = useState<Set<ToolCategory>>(
		() => new Set(),
	);

	const tools = useMemo(() => getRegisteredTools(), []);

	/** 打开时同步当前会话已保存的勾选(无会话时保持默认选中态) */
	useEffect(() => {
		if (!open || !convId) return;
		const granted = getAllowedTools(convId);
		setSelected(new Set([...RESIDENT_TOOLS, ...granted]));
		setSearch('');
	}, [convId, getAllowedTools, open]);

	/** 按分类分组 + 搜索过滤 */
	const grouped = useMemo(() => {
		const q = search.trim().toLowerCase();
		const map = new Map<ToolCategory, typeof tools>();
		for (const t of tools) {
			if (
				q &&
				!t.name.toLowerCase().includes(q) &&
				!t.description.toLowerCase().includes(q)
			) {
				continue;
			}
			const arr = map.get(t.category) ?? [];
			arr.push(t);
			map.set(t.category, arr);
		}
		return map;
	}, [search, tools]);

	/** 有内容的分类列表(保持固定顺序) */
	const groups = useMemo(
		() =>
			CATEGORY_ORDER.map((cat) => ({ cat, list: grouped.get(cat) ?? [] })).filter(
				(g) => g.list.length > 0,
			),
		[grouped],
	);

	/** 可勾选工具总数 / 已勾选数(不含常驻) */
	const totalExtra = useMemo(
		() => tools.filter((t) => !RESIDENT_TOOL_SET.has(t.name)).length,
		[tools],
	);
	const selectedExtra = useMemo(
		() => tools.filter((t) => selected.has(t.name) && !RESIDENT_TOOL_SET.has(t.name)).length,
		[selected, tools],
	);

	const toggleTool = (name: string) => {
		if (RESIDENT_TOOL_SET.has(name)) return;
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(name)) {
				next.delete(name);
			} else {
				next.add(name);
			}
			return next;
		});
	};

	const toggleGroupCollapsed = (cat: ToolCategory) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(cat)) {
				next.delete(cat);
			} else {
				next.add(cat);
			}
			return next;
		});
	};

	/** 组内全选/全不选(仅非常驻工具) */
	const toggleGroupAll = (list: typeof tools) => {
		const nonResident = list.filter((t) => !RESIDENT_TOOL_SET.has(t.name));
		if (nonResident.length === 0) return;
		const allChecked = nonResident.every((t) => selected.has(t.name));
		setSelected((prev) => {
			const next = new Set(prev);
			for (const t of nonResident) {
				if (allChecked) {
					next.delete(t.name);
				} else {
					next.add(t.name);
				}
			}
			return next;
		});
	};

	const handleSelectAll = () => {
		setSelected(new Set([...RESIDENT_TOOLS, ...tools.map((t) => t.name)]));
	};

	const handleClearAll = () => {
		setSelected(new Set(RESIDENT_TOOLS));
	};

	const handleReset = () => {
		if (!convId) return;
		resetAllowedTools(convId);
		setSelected(new Set(RESIDENT_TOOLS));
	};

	const handleSave = () => {
		if (!convId) return;
		const extra = [...selected].filter((t) => !RESIDENT_TOOL_SET.has(t));
		setAllowedTools(convId, extra);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center justify-between">
						<span className="flex items-center gap-2">
							<Wrench className="" />
							工具放行
						</span>
						<Button
							className="h-7 gap-1 text-xs"
							onClick={() =>
								useSettingsDialogStore.getState().openTo('skills')
							}
							size="sm"
							title="管理 Skills(提示词/技能)"
							variant="ghost"
						>
							<Settings2 className="h-3.5 w-3.5" />
							管理 Skills
						</Button>
					</DialogTitle>
				</DialogHeader>

				{/* 工具栏:搜索 + 全选/清空 + 重置 */}
				<div className="flex items-center gap-2">
					<div className="relative flex-1">
						<Search className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
						<Input
							className="pl-9"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="搜索工具..."
							value={search}
						/>
					</div>
					<Button
						className="shrink-0"
						onClick={handleSelectAll}
						size="sm"
						variant="outline"
					>
						全选
					</Button>
					<Button
						className="shrink-0"
						onClick={handleClearAll}
						size="sm"
						variant="outline"
					>
						清空
					</Button>
					<Button
						className="shrink-0"
						onClick={handleReset}
						size="sm"
						title="清空当前会话的工具放行配置"
						variant="ghost"
					>
						<RotateCcw className="" />
					</Button>
				</div>

				{/* 勾选计数 */}
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>
						已放行 <span className="text-primary font-medium">{selectedExtra}</span> /{' '}
						{totalExtra} 个可选工具
					</span>
					{convId ? (
						<span className="bg-muted rounded-md px-1.5 py-0.5">
							放行范围:当前会话
						</span>
					) : (
						<span className="text-destructive">
							请先开始一个会话,再配置工具放行
						</span>
					)}
				</div>

				{/* 工具分组列表 */}
				<div className="max-h-[420px] space-y-3 overflow-auto">
					{groups.length === 0 ? (
						<div className="text-muted-foreground py-8 text-center">
							{search ? '未找到匹配的工具' : '暂无已注册工具'}
						</div>
					) : (
						groups.map(({ cat, list }) => {
							const meta = CATEGORY_META[cat];
							const Icon = meta.icon;
							const isCollapsed = collapsed.has(cat);
							const nonResident = list.filter(
								(t) => !RESIDENT_TOOL_SET.has(t.name),
							);
							const groupChecked =
								nonResident.length > 0 &&
								nonResident.every((t) => selected.has(t.name));

							return (
								<div key={cat} className="rounded-lg border">
									{/* 组头 */}
									<div
										className="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-t-lg px-3 py-2 transition-colors"
										onClick={() => toggleGroupCollapsed(cat)}
									>
										<ToolCheckbox
											checked={groupChecked}
											disabled={nonResident.length === 0}
											onChange={() => toggleGroupAll(list)}
										/>
										<Icon className="text-primary h-5 w-5" />
										<span className="text-sm font-medium">{meta.label}</span>
										<span className="text-muted-foreground text-xs">
											{list.length}
										</span>
										<ChevronDown
											className={cn(
												'text-muted-foreground ml-auto h-5 w-5 transition-transform',
												!isCollapsed && 'rotate-180',
											)}
										/>
									</div>

									{/* 组内工具 */}
									{!isCollapsed && (
										<div className="border-t">
											{list.map((tool) => {
												const isResident = RESIDENT_TOOL_SET.has(
													tool.name,
												);
												const checked =
													selected.has(tool.name) || isResident;
												return (
													<div
														key={tool.name}
														className="hover:bg-muted/40 flex items-center gap-3 border-b px-3 py-2 transition-colors last:border-b-0"
														onClick={() => toggleTool(tool.name)}
													>
														<ToolCheckbox
															checked={checked}
															disabled={isResident}
															onChange={() => toggleTool(tool.name)}
														/>
														<div className="min-w-0 flex-1">
															<div className="flex items-center gap-2">
																<span className="truncate text-sm font-medium">
																	{tool.name}
																</span>
																{isResident && (
																	<Badge
																		className="shrink-0 text-xs"
																		variant="secondary"
																	>
																		默认
																	</Badge>
																)}
															</div>
															<p className="text-muted-foreground truncate text-xs">
																{tool.description}
															</p>
														</div>
													</div>
												);
											})}
										</div>
									)}
								</div>
							);
						})
					)}
				</div>

				<DialogFooter className="items-center">
					<span className="text-muted-foreground mr-auto text-xs">
						勾选的工具将对当前会话放行,新会话可随时在此调整
					</span>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						取消
					</Button>
					<Button disabled={!convId} onClick={handleSave}>
						保存放行
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
