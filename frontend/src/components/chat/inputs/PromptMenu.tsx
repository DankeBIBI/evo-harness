import type { Prompt, PromptScope } from "@/stores/promptStore";

import { usePromptStore } from "@/stores/promptStore";
import {
	ChevronDown,
	ChevronUp,
	FileText,
	FolderOpen,
	Globe,
	Plus,
	Trash2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

/** 公共图标映射 */
const scopeIcons: Record<PromptScope, React.ReactNode> = {
	file: <FileText className="h-[14px] w-[14px]" />,
	global: <Globe className="h-[14px] w-[14px]" />,
	project: <FolderOpen className="h-[14px] w-[14px]" />,
};

/** Check 图标组件 */
function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth={3}
			viewBox="0 0 24 24">
			<path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

interface PromptMenuProps {
	currentFilePath?: string;
	onSelectPrompt?: (prompt: Prompt) => void;
	projectPath?: string;
}

export function PromptMenu({
	currentFilePath,
	onSelectPrompt,
	projectPath,
}: PromptMenuProps) {
	const {
		addPrompt,
		deletePrompt,
		getMatchedPrompts,
		prompts,
		togglePrompt,
		updatePrompt,
	} = usePromptStore();

	const [isOpen, setIsOpen] = useState(false);
	const [editingId, setEditingId] = useState<null | string>(null);
	const [showAddForm, setShowAddForm] = useState(false);

	// 新建表单状态
	const [newPrompt, setNewPrompt] = useState({
		content: "",
		enabled: true,
		filePattern: "",
		name: "",
		order: 0,
		projectPath: "",
		scope: "global" as PromptScope,
	});

	const matchedPrompts = getMatchedPrompts(projectPath, currentFilePath);

	const handleAddPrompt = () => {
		if (!newPrompt.name.trim() || !newPrompt.content.trim()) return;

		addPrompt({
			content: newPrompt.content.trim(),
			enabled: newPrompt.enabled,
			filePattern:
				newPrompt.scope === "file" ? newPrompt.filePattern : undefined,
			name: newPrompt.name.trim(),
			order: newPrompt.order,
			projectPath:
				newPrompt.scope === "project" ? newPrompt.projectPath : undefined,
			scope: newPrompt.scope,
		});

		setNewPrompt({
			content: "",
			enabled: true,
			filePattern: "",
			name: "",
			order: 0,
			projectPath: "",
			scope: "global",
		});
		setShowAddForm(false);
	};

	return (
		<div className="relative">
			<Button
				className=" bg-background flex items-center gap-1.5 px-2 text-xs "
				onClick={() => setIsOpen(!isOpen)}>
				<FileText className="h-[14px] w-[14px]" />
				<span>提示词</span>
				{matchedPrompts.length > 0 && (
					<span className="bg-primary/20 text-primary rounded px-1.5 py-0.5 text-[10px]">
						{matchedPrompts.length}
					</span>
				)}
				{isOpen ? (
					<ChevronUp className="h-[12px] w-[12px]" />
				) : (
					<ChevronDown className="h-[12px] w-[12px]" />
				)}
			</Button>

			{isOpen && (
				<div className="bg-background border-border absolute bottom-full left-0 z-50 mb-1 max-h-96 w-96 overflow-auto rounded-lg border shadow-lg">
					{/* 已匹配的提示词 */}
					{matchedPrompts.length > 0 && (
						<div className="border-border border-b p-2">
							<div className="text-muted-foreground mb-2 text-xs">
								当前上下文匹配的提示词
							</div>
							{matchedPrompts.map((prompt) => (
								<MatchedPromptItem
									key={prompt.id}
									onSelect={() => onSelectPrompt?.(prompt)}
									onToggle={() => togglePrompt(prompt.id)}
									prompt={prompt}
								/>
							))}
						</div>
					)}

					{/* 所有提示词列表 */}
					<div className="p-2">
						<div className="mb-2 flex items-center justify-between">
							<span className="text-muted-foreground text-xs">所有提示词</span>
							<button
								className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 rounded px-2 py-1 text-xs"
								onClick={() => setShowAddForm(!showAddForm)}>
								<Plus className="h-[12px] w-[12px]" />
								新建
							</button>
						</div>

						{/* 新建表单 */}
						{showAddForm && (
							<div className="bg-muted/50 border-border mb-3 rounded-lg border p-3">
								<div className="space-y-2">
									<input
										className="border-border bg-background w-full rounded border px-2 py-1 text-sm"
										onChange={(e) =>
											setNewPrompt({ ...newPrompt, name: e.target.value })
										}
										placeholder="提示词名称"
										type="text"
										value={newPrompt.name}
									/>
									<textarea
										className="border-border bg-background min-h-[80px] w-full resize-y rounded border px-2 py-1 text-sm"
										onChange={(e) =>
											setNewPrompt({ ...newPrompt, content: e.target.value })
										}
										placeholder="提示词内容..."
										value={newPrompt.content}
									/>
									<div className="flex gap-2">
										<select
											className="border-border bg-background rounded border px-2 py-1 text-sm"
											onChange={(e) =>
												setNewPrompt({
													...newPrompt,
													scope: e.target.value as PromptScope,
												})
											}
											value={newPrompt.scope}>
											<option value="global">全局</option>
											<option value="project">项目</option>
											<option value="file">文件</option>
										</select>
										{newPrompt.scope === "project" && (
											<input
												className="border-border bg-background flex-1 rounded border px-2 py-1 text-sm"
												onChange={(e) =>
													setNewPrompt({
														...newPrompt,
														projectPath: e.target.value,
													})
												}
												placeholder="项目路径"
												type="text"
												value={newPrompt.projectPath}
											/>
										)}
										{newPrompt.scope === "file" && (
											<input
												className="border-border bg-background flex-1 rounded border px-2 py-1 text-sm"
												onChange={(e) =>
													setNewPrompt({
														...newPrompt,
														filePattern: e.target.value,
													})
												}
												placeholder="文件匹配模式 (e.g. *.tsx)"
												type="text"
												value={newPrompt.filePattern}
											/>
										)}
									</div>
									<div className="flex items-center justify-between">
										<label className="text-muted-foreground flex items-center gap-1.5 text-xs">
											<input
												checked={newPrompt.enabled}
												onChange={(e) =>
													setNewPrompt({
														...newPrompt,
														enabled: e.target.checked,
													})
												}
												type="checkbox"
											/>
											启用
										</label>
										<button
											className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs disabled:opacity-50"
											disabled={
												!newPrompt.name.trim() ||
												!newPrompt.content.trim() ||
												(newPrompt.scope === "project" &&
													!newPrompt.projectPath.trim()) ||
												(newPrompt.scope === "file" &&
													!newPrompt.filePattern.trim())
											}
											onClick={handleAddPrompt}>
											保存
										</button>
									</div>
								</div>
							</div>
						)}

						{/* 提示词列表 */}
						{prompts.length === 0 ? (
							<div className="text-muted-foreground py-4 text-center text-xs">
								暂无提示词，点击"新建"添加
							</div>
						) : (
							<div className="space-y-1">
								{prompts.map((prompt) => (
									<PromptItem
										isEditing={editingId === prompt.id}
										key={prompt.id}
										onDelete={() => deletePrompt(prompt.id)}
										onEdit={() =>
											setEditingId(editingId === prompt.id ? null : prompt.id)
										}
										onToggle={() => togglePrompt(prompt.id)}
										onUpdate={(updates) => updatePrompt(prompt.id, updates)}
										prompt={prompt}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function MatchedPromptItem({
	onSelect,
	onToggle,
	prompt,
}: {
	onSelect: () => void;
	onToggle: () => void;
	prompt: Prompt;
}) {
	return (
		<div className="hover:bg-muted/50 group flex items-center gap-2 rounded p-2">
			<button
				className={`flex  items-center justify-center rounded border transition-colors ${
					prompt.enabled
						? "bg-primary border-primary text-primary-foreground"
						: "border-muted-foreground"
				}`}
				onClick={onToggle}>
				{prompt.enabled && <CheckIcon className="h-[12px] w-[12px]" />}
			</button>
			<button className="flex-1 text-left" onClick={onSelect}>
				<div className="text-sm font-medium">{prompt.name}</div>
				<div className="text-muted-foreground flex items-center gap-1 text-xs">
					{scopeIcons[prompt.scope]}
					<span>
						{prompt.content.slice(0, 50)}
						{prompt.content.length > 50 ? "..." : ""}
					</span>
				</div>
			</button>
		</div>
	);
}

function PromptItem({
	isEditing,
	onDelete,
	onEdit,
	onToggle,
	onUpdate,
	prompt,
}: {
	isEditing: boolean;
	onDelete: () => void;
	onEdit: () => void;
	onToggle: () => void;
	onUpdate: (updates: Partial<Prompt>) => void;
	prompt: Prompt;
}) {
	const [editForm, setEditForm] = useState({
		content: prompt.content,
		filePattern: prompt.filePattern || "",
		name: prompt.name,
		projectPath: prompt.projectPath || "",
		scope: prompt.scope,
	});

	const handleSave = () => {
		onUpdate({
			content: editForm.content,
			filePattern: editForm.scope === "file" ? editForm.filePattern : undefined,
			name: editForm.name,
			projectPath:
				editForm.scope === "project" ? editForm.projectPath : undefined,
			scope: editForm.scope,
		});
		onEdit();
	};

	if (isEditing) {
		return (
			<div className="bg-muted/50 border-border rounded-lg border p-2">
				<div className="space-y-2">
					<input
						className="border-border bg-background w-full rounded border px-2 py-1 text-sm"
						onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
						type="text"
						value={editForm.name}
					/>
					<textarea
						className="border-border bg-background min-h-[60px] w-full resize-y rounded border px-2 py-1 text-sm"
						onChange={(e) =>
							setEditForm({ ...editForm, content: e.target.value })
						}
						value={editForm.content}
					/>
					<select
						className="border-border bg-background w-full rounded border px-2 py-1 text-sm"
						onChange={(e) =>
							setEditForm({ ...editForm, scope: e.target.value as PromptScope })
						}
						value={editForm.scope}>
						<option value="global">全局</option>
						<option value="project">项目</option>
						<option value="file">文件</option>
					</select>
					{editForm.scope === "project" && (
						<input
							className="border-border bg-background w-full rounded border px-2 py-1 text-sm"
							onChange={(e) =>
								setEditForm({ ...editForm, projectPath: e.target.value })
							}
							placeholder="项目路径"
							type="text"
							value={editForm.projectPath}
						/>
					)}
					{editForm.scope === "file" && (
						<input
							className="border-border bg-background w-full rounded border px-2 py-1 text-sm"
							onChange={(e) =>
								setEditForm({ ...editForm, filePattern: e.target.value })
							}
							placeholder="文件匹配模式"
							type="text"
							value={editForm.filePattern}
						/>
					)}
					<div className="flex justify-end gap-2">
						<button
							className="text-muted-foreground hover:text-foreground px-2 py-1 text-xs"
							onClick={onEdit}>
							取消
						</button>
						<button
							className="bg-primary text-primary-foreground rounded px-2 py-1 text-xs"
							onClick={handleSave}>
							保存
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="hover:bg-muted/50 group flex items-center gap-2 rounded p-2">
			<button
				className={`flex  flex-shrink-0 items-center justify-center rounded border ${
					prompt.enabled
						? "bg-primary border-primary text-primary-foreground"
						: "border-muted-foreground"
				}`}
				onClick={onToggle}>
				{prompt.enabled && <CheckIcon className="h-[12px] w-[12px]" />}
			</button>
			<div className="min-w-0 flex-1" onClick={onEdit}>
				<div className="cursor-pointer truncate text-sm font-medium">
					{prompt.name}
				</div>
				<div className="text-muted-foreground flex items-center gap-1 truncate text-xs">
					{scopeIcons[prompt.scope]}
					<span>
						{prompt.content.slice(0, 40)}
						{prompt.content.length > 40 ? "..." : ""}
					</span>
				</div>
			</div>
			<button
				className="text-muted-foreground hover:text-destructive p-1 opacity-0 transition-opacity group-hover:opacity-100"
				onClick={onDelete}>
				<Trash2 className="h-[14px] w-[14px]" />
			</button>
		</div>
	);
}
