import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import {
    useToolPermissionStore,
    type ToolPermissionMode,
} from "@/stores/toolPermissionStore";
import {
    Ban,
    CheckCircle,
    HelpCircle,
    RotateCcw,
    Search,
    Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getRegisteredTools } from "@/lib/tools/registry";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const modeConfig: Record<
	ToolPermissionMode,
	{
		icon: typeof CheckCircle;
		label: string;
		variant: "default" | "outline" | "destructive";
	}
> = {
	auto: { icon: CheckCircle, label: "自动允许", variant: "default" },
	ask: { icon: HelpCircle, label: "每次询问", variant: "outline" },
	disabled: { icon: Ban, label: "禁用", variant: "destructive" },
};

const modeCycle: ToolPermissionMode[] = ["auto", "ask", "disabled"];

export function ToolSelectDialog({ open, onOpenChange }: Props) {
	const [search, setSearch] = useState("");
	const { permissions, setPermission, resetToDefaults } =
		useToolPermissionStore();

	const tools = useMemo(() => getRegisteredTools(), []);
	const filteredTools = useMemo(
		() =>
			tools.filter(
				(t) =>
					t.name.toLowerCase().includes(search.toLowerCase()) ||
					t.description.toLowerCase().includes(search.toLowerCase()),
			),
		[tools, search],
	);

	const handleCycle = (toolName: string) => {
		const current = permissions[toolName] || "auto";
		const currentIdx = modeCycle.indexOf(current);
		const next = modeCycle[(currentIdx + 1) % modeCycle.length];
		setPermission(toolName, next);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Wrench className="" />
						工具权限管理
					</DialogTitle>
				</DialogHeader>

				<div className="flex items-center gap-2">
					<div className="relative flex-1">
						<Search className="text-muted-foreground absolute left-3 top-1/2  -translate-y-1/2" />
						<Input
							className="pl-9"
							placeholder="搜索工具..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<Button
						size="sm"
						variant="ghost"
						onClick={resetToDefaults}
						title="重置为默认权限">
						<RotateCcw className="" />
					</Button>
				</div>

				{/* 图例 */}
				<div className="flex items-center gap-3 text-xs text-muted-foreground">
					{modeCycle.map((mode) => {
						const { icon: Icon, label } = modeConfig[mode];
						return (
							<span key={mode} className="flex items-center gap-1">
								<Icon className="h-[14px] w-[14px]" />
								{label}
							</span>
						);
					})}
				</div>

				<div className="max-h-[420px] space-y-2 overflow-auto">
					{filteredTools.length === 0 ? (
						<div className="text-muted-foreground py-8 text-center">
							{search ? "未找到匹配的工具" : "暂无已注册工具"}
						</div>
					) : (
						filteredTools.map((tool) => {
							const mode = permissions[tool.name] || "auto";
							const cfg = modeConfig[mode];
							const Icon = cfg.icon;

							return (
								<div
									key={tool.name}
									className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors">
									<div className="bg-primary/10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full">
										<Wrench className="text-primary " />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="truncate text-sm font-medium">
												{tool.name}
											</span>
											<Badge
												variant={
													cfg.variant === "destructive"
														? "destructive"
														: "outline"
												}
												className="shrink-0 text-xs">
												<Icon className="mr-1 h-[12px] w-[12px]" />
												{cfg.label}
											</Badge>
										</div>
										<p className="text-muted-foreground truncate text-xs">
											{tool.description}
										</p>
									</div>
									<Button
										size="sm"
										variant={cfg.variant}
										onClick={() => handleCycle(tool.name)}
										className="shrink-0 gap-1">
										<Icon className="h-[14px] w-[14px]" />
										<span className="hidden sm:inline">{cfg.label}</span>
									</Button>
								</div>
							);
						})
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
