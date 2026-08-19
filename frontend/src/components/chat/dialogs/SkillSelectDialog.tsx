import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAnalysisStore } from "@/stores/analysisStore";
import { useSkillStore, type Skill, type SkillType } from "@/stores/skillStore";
import {
    FileText,
    Pencil,
    Plus,
    Save,
    Search,
    Trash2,
    Wrench,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const typeLabels: Record<SkillType, string> = {
	tool: "工具",
	retrieval: "检索",
	generation: "生成",
	mcp: "MCP",
	prompt: "提示词",
};

export function SkillSelectDialog({ open, onOpenChange }: Props) {
	const { skills, addSkill, deleteSkill, updateSkill } = useSkillStore();
	const { readFileContent, writeFileContent } = useAnalysisStore();

	const [search, setSearch] = useState("");
	const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
	const [editContent, setEditContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [showNewForm, setShowNewForm] = useState(false);
	const [newName, setNewName] = useState("");
	const [newDesc, setNewDesc] = useState("");

	const filteredSkills = useMemo(
		() =>
			skills.filter(
				(s) =>
					(s.name || "").toLowerCase().includes(search.toLowerCase()) ||
					(s.description || "").toLowerCase().includes(search.toLowerCase()),
			),
		[skills, search],
	);

	const handleEditSource = async (skill: Skill) => {
		if (!skill.filePath) {
			alert("该 Skill 无关联源文件");
			return;
		}
		setEditingSkillId(skill.id);
		try {
			const content = await readFileContent(skill.filePath);
			setEditContent(content);
		} catch {
			setEditContent(skill.content || "");
		}
	};

	const handleSaveSource = async (skill: Skill) => {
		if (!skill.filePath) return;
		setIsSaving(true);
		try {
			await writeFileContent(skill.filePath, editContent);
			await updateSkill(skill.id, { content: editContent });
			setEditingSkillId(null);
		} catch (error) {
			alert(`保存失败: ${error}`);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (id: string) => {
		if (!window.confirm("确定要删除这个 Skill 吗？")) return;
		try {
			await deleteSkill(id);
		} catch (error) {
			alert(`删除失败: ${error}`);
		}
	};

	const handleCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		try {
			await addSkill({
				name,
				description: newDesc.trim(),
				type: "prompt",
				scope: "user",
				config: {},
				isTemplate: false,
				isPublic: false,
				tags: [],
			});
			setShowNewForm(false);
			setNewName("");
			setNewDesc("");
		} catch (error) {
			alert(`创建失败: ${error}`);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Wrench className="" />
						管理 Skills
					</DialogTitle>
				</DialogHeader>

				<div className="relative">
					<Search className="text-muted-foreground absolute left-3 top-1/2  -translate-y-1/2" />
					<Input
						className="pl-9"
						placeholder="搜索 Skill..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>

				<div className="max-h-[400px] space-y-2 overflow-auto">
					{filteredSkills.length === 0 ? (
						<div className="text-muted-foreground py-8 text-center">
							{search ? "未找到匹配的 Skill" : "暂无 Skill，请先分析项目导入"}
						</div>
					) : (
						filteredSkills.map((skill) => (
							<div key={skill.id}>
								<div className="hover:bg-muted flex items-center gap-4 rounded-lg border p-4 transition-colors">
									<div className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
										<Wrench className="text-primary " />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium">{skill.name}</span>
											<Badge variant="outline" className="text-xs">
												{typeLabels[skill.type] || skill.type}
											</Badge>
											{skill.filePath && (
												<Badge
													variant="secondary"
													className="text-xs"
													title={skill.filePath}>
													源文件
												</Badge>
											)}
										</div>
										<p className="text-muted-foreground truncate text-sm">
											{skill.description || "无描述"}
										</p>
									</div>
									<div className="flex gap-1">
										{skill.filePath && (
											<Button
												size="icon"
												variant="ghost"
												onClick={() => handleEditSource(skill)}
												title="编辑源文件">
												<FileText className="" />
											</Button>
										)}
										<Button
											size="icon"
											variant="ghost"
											onClick={() => {
												setNewName(skill.name);
												setNewDesc(skill.description || "");
												setShowNewForm(false);
											}}
											title="编辑名称">
											<Pencil className="" />
										</Button>
										<Button
											size="icon"
											variant="ghost"
											className="text-destructive"
											onClick={() => handleDelete(skill.id)}
											title="删除">
											<Trash2 className="" />
										</Button>
									</div>
								</div>

								{/* 行内源文件编辑器 */}
								{editingSkillId === skill.id && (
									<div className="ml-4 mt-1 border-l-2 pl-4">
										<Textarea
											className="min-h-[120px] resize-y font-mono text-xs"
											value={editContent}
											onChange={(e) => setEditContent(e.target.value)}
										/>
										<div className="mt-2 flex items-center gap-2">
											<Button
												size="sm"
												onClick={() => handleSaveSource(skill)}
												disabled={isSaving}>
												<Save className="mr-1 " />
												{isSaving ? "保存中..." : "保存"}
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setEditingSkillId(null)}>
												<X className="mr-1 " />
												取消
											</Button>
										</div>
									</div>
								)}
							</div>
						))
					)}
				</div>

				{/* 新建表单 */}
				{showNewForm && (
					<div className="space-y-2 rounded-lg border p-4">
						<Input
							placeholder="Skill 名称"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
						<Input
							placeholder="描述（可选）"
							value={newDesc}
							onChange={(e) => setNewDesc(e.target.value)}
						/>
						<div className="flex items-center gap-2">
							<Button size="sm" onClick={handleCreate}>
								创建
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setShowNewForm(false)}>
								取消
							</Button>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						关闭
					</Button>
					<Button onClick={() => setShowNewForm(true)}>
						<Plus className="mr-2 " />
						新建 Skill
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
