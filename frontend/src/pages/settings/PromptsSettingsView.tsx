import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
	usePromptStore,
	type Prompt,
	type PromptScope,
} from '@/stores/promptStore';
import {
	FileText,
	FolderOpen,
	Globe,
	Inbox,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react';
import { useState } from 'react';

const SCOPE_OPTIONS: Array<{ label: string; value: PromptScope }> = [
	{ label: '全局', value: 'global' },
	{ label: '项目', value: 'project' },
	{ label: '文件', value: 'file' },
];

const SCOPE_META: Record<
	PromptScope,
	{ hint: string; icon: typeof Globe; label: string }
> = {
	file: { hint: '文件匹配模式，如 *.tsx', icon: FileText, label: '文件' },
	global: { hint: '所有会话生效', icon: Globe, label: '全局' },
	project: { hint: '项目路径', icon: FolderOpen, label: '项目' },
};

const EMPTY_FORM = {
	content: '',
	enabled: true,
	filePattern: '',
	name: '',
	projectPath: '',
	scope: 'global' as PromptScope,
};

/** 启用状态小勾(自绘,与项目内 CheckIcon 风格一致) */
function CheckMark({ className }: { className?: string }) {
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

export default function PromptsSettingsView() {
	const {
		addPrompt,
		deletePrompt,
		prompts,
		togglePrompt,
		updatePrompt,
	} = usePromptStore();

	const [formOpen, setFormOpen] = useState(false);
	const [editingId, setEditingId] = useState<null | string>(null);
	const [form, setForm] = useState({ ...EMPTY_FORM });

	const openCreate = () => {
		setEditingId(null);
		setForm({ ...EMPTY_FORM });
		setFormOpen(true);
	};

	const openEdit = (prompt: Prompt) => {
		setEditingId(prompt.id);
		setForm({
			content: prompt.content,
			enabled: prompt.enabled,
			filePattern: prompt.filePattern || '',
			name: prompt.name,
			projectPath: prompt.projectPath || '',
			scope: prompt.scope,
		});
		setFormOpen(true);
	};

	const closeForm = () => {
		setFormOpen(false);
		setEditingId(null);
	};

	const canSave =
		form.name.trim().length > 0 &&
		form.content.trim().length > 0 &&
		(form.scope !== 'project' || form.projectPath.trim().length > 0) &&
		(form.scope !== 'file' || form.filePattern.trim().length > 0);

	const handleSave = () => {
		if (!canSave) return;
		const payload = {
			content: form.content.trim(),
			enabled: form.enabled,
			filePattern:
				form.scope === 'file' ? form.filePattern.trim() : undefined,
			name: form.name.trim(),
			order: 0,
			projectPath:
				form.scope === 'project' ? form.projectPath.trim() : undefined,
			scope: form.scope,
		};
		if (editingId) {
			updatePrompt(editingId, payload);
		} else {
			addPrompt(payload);
		}
		closeForm();
	};

	const handleDelete = (prompt: Prompt) => {
		if (confirm(`删除提示词「${prompt.name}」？`)) {
			deletePrompt(prompt.id);
			if (editingId === prompt.id) closeForm();
		}
	};

	return (
		<div className="flex flex-1 flex-col p-6 pt-5">
			{/* 页头 */}
			<div className="mb-4 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-base font-semibold">提示词管理</h2>
					<p className="text-muted-foreground mt-1 text-xs">
						按作用域（全局 / 项目 / 文件）维护可复用的提示词模板
					</p>
				</div>
				<Button
					className="shrink-0 whitespace-nowrap"
					onClick={() => (formOpen ? closeForm() : openCreate())}>
					{formOpen ? (
						<>
							取消
						</>
					) : (
						<>
							<Plus className="mr-1.5 h-4 w-4" />
							新建提示词
						</>
					)}
				</Button>
			</div>

			{/* 新建 / 编辑表单 */}
			{formOpen && (
				<Card className="border-border/60 mb-4 border">
					<CardContent className="space-y-3 p-4">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="mb-1 block text-xs font-medium">名称</label>
								<Input
									className="h-9"
									value={form.name}
									onChange={(e) =>
										setForm({ ...form, name: e.target.value })
									}
									placeholder="如：代码审查指令"
								/>
							</div>
							<div>
								<label className="mb-1 block text-xs font-medium">作用域</label>
								<select
									className="bg-muted/40 focus:ring-primary/20 flex h-9 w-full rounded-lg px-2 py-1.5 text-sm focus:bg-background focus:outline-none focus:ring-2"
									value={form.scope}
									onChange={(e) =>
										setForm({
											...form,
											scope: e.target.value as PromptScope,
										})
									}>
									{SCOPE_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</div>
						</div>

						{form.scope === 'project' && (
							<div>
								<label className="mb-1 block text-xs font-medium">
									项目路径
								</label>
								<Input
									className="h-9"
									value={form.projectPath}
									onChange={(e) =>
										setForm({ ...form, projectPath: e.target.value })
									}
									placeholder="d:/Project/my-app"
								/>
							</div>
						)}
						{form.scope === 'file' && (
							<div>
								<label className="mb-1 block text-xs font-medium">
									文件匹配模式
								</label>
								<Input
									className="h-9"
									value={form.filePattern}
									onChange={(e) =>
										setForm({ ...form, filePattern: e.target.value })
									}
									placeholder="*.tsx 或 src/**/*.ts"
								/>
							</div>
						)}

						<div>
							<label className="mb-1 block text-xs font-medium">内容</label>
							<textarea
								className="border-border bg-background focus:ring-primary/20 min-h-[110px] w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
								value={form.content}
								onChange={(e) =>
									setForm({ ...form, content: e.target.value })
								}
								placeholder="提示词内容..."
							/>
						</div>

						<div className="flex items-center justify-between">
							<label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
								<input
									checked={form.enabled}
									type="checkbox"
									onChange={(e) =>
										setForm({ ...form, enabled: e.target.checked })
									}
								/>
								启用
							</label>
							<div className="flex gap-2">
								<Button size="sm" variant="outline" onClick={closeForm}>
									取消
								</Button>
								<Button size="sm" disabled={!canSave} onClick={handleSave}>
									{editingId ? '保存修改' : '创建'}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* 列表 */}
			<div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
				{prompts.length === 0 && !formOpen && (
					<div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
						<div className="bg-muted/40 border-border/40 flex h-12 w-12 items-center justify-center rounded-full border">
							<Inbox className="text-muted-foreground h-5 w-5" />
						</div>
						<div className="space-y-1">
							<p className="text-foreground/80 text-sm font-medium">暂无提示词</p>
							<p className="text-muted-foreground text-xs">
								点击右上角「新建提示词」添加第一条模板
							</p>
						</div>
					</div>
				)}

				{prompts.map((prompt) => {
					const meta = SCOPE_META[prompt.scope];
					const ScopeIcon = meta.icon;

					return (
						<Card key={prompt.id} className="border-border/60 border">
							<CardContent className="flex items-start gap-3 p-3">
								{/* 启用开关 */}
								<button
									aria-label={prompt.enabled ? '停用' : '启用'}
									className={
										prompt.enabled
											? 'bg-primary border-primary text-primary-foreground mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors'
											: 'border-muted-foreground/50 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors'
									}
									title={prompt.enabled ? '点击停用' : '点击启用'}
									type="button"
									onClick={() => togglePrompt(prompt.id)}>
									{prompt.enabled && <CheckMark className="h-3 w-3" />}
								</button>

								{/* 信息区 */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span
											className={
												prompt.enabled
													? 'truncate text-sm font-medium'
													: 'text-muted-foreground truncate text-sm font-medium line-through'
											}>
											{prompt.name}
										</span>
										<Badge
											variant="outline"
											className="shrink-0 whitespace-nowrap text-[11px]">
											<ScopeIcon className="mr-0.5 h-3 w-3" />
											{meta.label}
										</Badge>
										{prompt.scope === 'project' && prompt.projectPath && (
											<span className="text-muted-foreground max-w-[160px] truncate font-mono text-[11px]">
												{prompt.projectPath}
											</span>
										)}
										{prompt.scope === 'file' && prompt.filePattern && (
											<span className="text-muted-foreground max-w-[160px] truncate font-mono text-[11px]">
												{prompt.filePattern}
											</span>
										)}
									</div>
									<p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
										{prompt.content}
									</p>
								</div>

								{/* 操作区 */}
								<div className="flex shrink-0 items-center gap-1">
									<Button
										aria-label="编辑"
										size="sm"
										title="编辑"
										variant="outline"
										onClick={() => openEdit(prompt)}>
										<Pencil className="h-[14px] w-[14px]" />
									</Button>
									<Button
										aria-label="删除"
										className="text-destructive hover:bg-destructive/10"
										size="sm"
										title="删除"
										variant="outline"
										onClick={() => handleDelete(prompt)}>
										<Trash2 className="h-[14px] w-[14px]" />
									</Button>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
