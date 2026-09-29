import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ModelApiKeyBadge } from '@/components/ModelApiKeyBadge';
import {
	useLlmProviderStore,
	type LlmProvider,
} from '@/stores/llmProviderStore';
import {
	type Model,
	type ModelProvider,
	useModelStore,
} from '@/stores/modelStore';
import {
	Brain,
	Building2,
	Check,
	Inbox,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Server,
	Trash2,
	X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getModelTokenPreset } from '@/lib/chat/modelPresets';

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  copilot: 'CLI',
  ollama: 'Ollama',
  gemini: 'Gemini',
  custom: '自定义',
};

/** 新增模型的默认参数 */
const DEFAULT_MODEL_FIELDS = {
  isEnabled: true,
  maxInputTokens: 128000,
  maxOutputTokens: 8192,
  supportsStreaming: true,
  supportsToolCall: true,
  supportsVision: true,
  temperature: 0.7,
  timeout: 0,
};

const PROVIDER_TYPE_OPTIONS: Array<{ label: string; value: ModelProvider }> = [
	{ label: 'OpenAI 兼容', value: 'openai' },
	{ label: 'Anthropic', value: 'anthropic' },
	{ label: 'Ollama', value: 'ollama' },
	{ label: 'Gemini', value: 'gemini' },
	{ label: '自定义', value: 'custom' },
];

export default function ModelsSettingsView() {
	const {
		models,
		loading,
		error,
		fetchModels,
		fetchAvailableModels,
		deleteModel,
		testModel,
		selectModel,
		selectedModelId,
		addModel,
		updateModel,
	} = useModelStore();
	const {
		providers,
		fetchProviders,
		addProvider,
		updateProvider,
		deleteProvider,
		getApiKey,
	} = useLlmProviderStore();

	// ── 提供商表单 ──
	const [providerFormOpen, setProviderFormOpen] = useState(false);
	const [editingProviderId, setEditingProviderId] = useState<null | string>(
		null,
	);
	const [savingProvider, setSavingProvider] = useState(false);
	const [providerForm, setProviderForm] = useState({
		apiKey: '',
		baseUrl: '',
		name: '',
		type: 'openai' as ModelProvider,
	});

	// ── 添加模型面板(挂在提供商卡片下) ──
	const [addingProviderId, setAddingProviderId] = useState<null | string>(
		null,
	);
	const [availableModels, setAvailableModels] = useState<string[]>([]);
	const [fetchingModels, setFetchingModels] = useState(false);
	const [queryError, setQueryError] = useState<null | string>(null);
	const [pickedModels, setPickedModels] = useState<string[]>([]);
	const [manualName, setManualName] = useState('');
	const [addingModels, setAddingModels] = useState(false);

	// ── 编辑模型 ──
	const [editingModel, setEditingModel] = useState<Model | null>(null);
	const [editForm, setEditForm] = useState({
		apiKey: '',
		baseUrl: '',
		name: '',
	});

	const [testingId, setTestingId] = useState<null | string>(null);

	useEffect(() => {
		fetchModels();
		fetchProviders();
	}, [fetchModels, fetchProviders]);

	/** 模型按提供商分组(baseUrl+type 双匹配),未匹配的归入 others */
	const groups = useMemo(() => {
		const list = providers.map((p) => ({
			items: models.filter(
				(m) => m.provider === p.type && m.baseUrl === p.baseUrl,
			),
			provider: p,
		}));
		const matched = new Set(list.flatMap((g) => g.items.map((m) => m.id)));
		return { list, others: models.filter((m) => !matched.has(m.id)) };
	}, [providers, models]);

	// ── 提供商:打开表单(编辑时预填并读取密钥) ──
	const openProviderForm = async (provider?: LlmProvider) => {
		if (!provider) {
			setEditingProviderId(null);
			setProviderForm({
				apiKey: '',
				baseUrl: '',
				name: '',
				type: 'openai',
			});
			setProviderFormOpen(true);

			return;
		}
		setEditingProviderId(provider.id);
		setProviderForm({
			apiKey: '',
			baseUrl: provider.baseUrl,
			name: provider.name,
			type: provider.type,
		});
		setProviderFormOpen(true);
		const key = await getApiKey(provider.id);
		setProviderForm((prev) => ({ ...prev, apiKey: key }));
	};

	const closeProviderForm = () => {
		setProviderFormOpen(false);
		setEditingProviderId(null);
	};

	// ── 提供商:保存(新增 / 编辑) ──
	const handleSaveProvider = async () => {
		if (!providerForm.baseUrl.trim()) {
			alert('请填写 Base URL');

			return;
		}
		setSavingProvider(true);
		try {
			if (editingProviderId) {
				await updateProvider(editingProviderId, providerForm);
			} else {
				await addProvider(providerForm);
			}
			closeProviderForm();
		} catch {
			alert('保存提供商失败');
		} finally {
			setSavingProvider(false);
		}
	};

	// ── 提供商:删除(不影响已添加的模型) ──
	const handleDeleteProvider = async (provider: LlmProvider) => {
		if (!confirm(`删除提供商「${provider.name}」?\n已添加的模型不受影响。`)) {
			return;
		}
		await deleteProvider(provider.id);
		if (addingProviderId === provider.id) {
			setAddingProviderId(null);
		}
	};

	// ── 添加模型面板:展开时自动查询该 URL 可用模型 ──
	const queryAvailable = async (provider: LlmProvider) => {
		setFetchingModels(true);
		setQueryError(null);
		try {
			const apiKey = await getApiKey(provider.id);
			const list = await fetchAvailableModels(
				provider.baseUrl,
				apiKey,
				provider.type,
			);
			setAvailableModels(list);
		} catch {
			setAvailableModels([]);
			setQueryError('查询失败，请检查 Base URL 与 API Key');
		} finally {
			setFetchingModels(false);
		}
	};

	const toggleAddPanel = async (provider: LlmProvider) => {
		if (addingProviderId === provider.id) {
			setAddingProviderId(null);
			setAvailableModels([]);
			setPickedModels([]);
			setManualName('');

			return;
		}
		setAddingProviderId(provider.id);
		setAvailableModels([]);
		setPickedModels([]);
		setManualName('');
		await queryAvailable(provider);
	};

	const togglePick = (name: string) => {
		setPickedModels((prev) =>
			prev.includes(name)
				? prev.filter((n) => n !== name)
				: [...prev, name],
		);
	};

	// ── 在提供商下新增一个模型(复制连接信息,兼容 Go 后端) ──
	const addModelUnder = async (provider: LlmProvider, name: string) => {
		await addModel({
			...DEFAULT_MODEL_FIELDS,
			...getModelTokenPreset(name),
			apiKey: await getApiKey(provider.id),
			baseUrl: provider.baseUrl,
			name,
			provider: provider.type,
		});
	};

	const handleAddPicked = async (provider: LlmProvider) => {
		if (pickedModels.length === 0) return;
		setAddingModels(true);
		try {
			for (const name of pickedModels) {
				await addModelUnder(provider, name);
			}
			setPickedModels([]);
		} catch {
			alert('添加模型失败');
		} finally {
			setAddingModels(false);
		}
	};

	const handleAddManual = async (provider: LlmProvider) => {
		const name = manualName.trim();
		if (!name) return;
		setAddingModels(true);
		try {
			await addModelUnder(provider, name);
			setManualName('');
		} catch {
			alert('添加模型失败');
		} finally {
			setAddingModels(false);
		}
	};

	// ── 模型操作 ──
	const handleTest = async (id: string) => {
		setTestingId(id);
		try {
			const success = await testModel(id);
			alert(success ? '测试成功！' : '测试失败');
		} finally {
			setTestingId(null);
		}
	};

	const handleDelete = async (id: string) => {
		if (confirm('确定要删除这个模型吗？')) {
			await deleteModel(id);
		}
	};

	const handleEditClick = (model: Model) => {
		setEditingModel(model);
		setEditForm({
			apiKey: model.apiKey || '',
			baseUrl: model.baseUrl,
			name: model.name,
		});
	};

	const handleUpdateModel = async () => {
		if (!editingModel || !editForm.name || !editForm.baseUrl) {
			alert('请填写模型名称和 Base URL');

			return;
		}
		try {
			await updateModel(editingModel.id, editForm);
			setEditingModel(null);
		} catch {
			alert('更新模型失败');
		}
	};

	return (
		<div className="flex flex-1 flex-col p-6 pt-5">
			{/* 页头 */}
			<div className="mb-4">
				<h2 className="text-base font-semibold">模型管理</h2>
				<p className="text-muted-foreground mt-1 text-xs">
					先创建提供商（BaseURL / APIKey），再在其下快捷添加模型
				</p>
			</div>

			{error && (
				<div className="text-destructive py-4 text-center">
					加载失败: {error}
					<Button variant="link" onClick={fetchModels}>
						重试
					</Button>
				</div>
			)}

			{/* ═══ 提供商 ═══ */}
			<section>
				<div className="mb-2 flex items-center justify-between">
					<h3 className="text-muted-foreground text-xs font-medium">
						提供商（{providers.length}）
					</h3>
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							providerFormOpen ? closeProviderForm() : openProviderForm()
						}>
						{providerFormOpen ? (
							<>
								<X className="mr-1 h-[14px] w-[14px]" />
								取消
							</>
						) : (
							<>
								<Plus className="mr-1 h-[14px] w-[14px]" />
								添加提供商
							</>
						)}
					</Button>
				</div>

				{/* 提供商表单 */}
				{providerFormOpen && (
					<Card className="border-border/60 mb-3 border">
						<CardContent className="space-y-3 p-4">
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="mb-1 block text-xs font-medium">
										类型
									</label>
									<select
										className="bg-muted/40 focus:ring-primary/20 flex h-9 w-full rounded-lg px-2 py-1.5 text-sm focus:bg-background focus:outline-none focus:ring-2"
										value={providerForm.type}
										onChange={(e) =>
											setProviderForm({
												...providerForm,
												type: e.target.value as ModelProvider,
											})
										}>
										{PROVIDER_TYPE_OPTIONS.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="mb-1 block text-xs font-medium">
										名称（选填）
									</label>
									<Input
										className="h-9"
										value={providerForm.name}
										onChange={(e) =>
											setProviderForm({
												...providerForm,
												name: e.target.value,
											})
										}
										placeholder="如 OpenAI 官方"
									/>
								</div>
							</div>
							<div>
								<label className="mb-1 block text-xs font-medium">
									Base URL
								</label>
								<Input
									className="h-9"
									value={providerForm.baseUrl}
									onChange={(e) =>
										setProviderForm({
											...providerForm,
											baseUrl: e.target.value,
										})
									}
									placeholder="https://api.openai.com/v1"
								/>
							</div>
							<div>
								<label className="mb-1 block text-xs font-medium">
									API Key
								</label>
								<Input
									className="h-9"
									type="password"
									value={providerForm.apiKey}
									onChange={(e) =>
										setProviderForm({
											...providerForm,
											apiKey: e.target.value,
										})
									}
									placeholder={
										editingProviderId ? '已配置，留空则不修改' : 'sk-...'
									}
								/>
							</div>
							<div className="flex justify-end gap-2">
								<Button size="sm" variant="outline" onClick={closeProviderForm}>
									取消
								</Button>
								<Button
									size="sm"
									disabled={savingProvider}
									onClick={handleSaveProvider}>
									{savingProvider && (
										<Loader2 className="mr-1 h-[14px] w-[14px] animate-spin" />
									)}
									{editingProviderId ? '保存修改' : '创建提供商'}
								</Button>
							</div>
						</CardContent>
					</Card>
				)}

				{/* 提供商列表 */}
				<div className="space-y-2">
					{providers.map((provider) => {
						const count = models.filter(
							(m) =>
								m.provider === provider.type &&
								m.baseUrl === provider.baseUrl,
						).length;

						return (
							<Card
								key={provider.id}
								className={
									addingProviderId === provider.id
										? 'border-border/60 ring-primary ring-2'
										: 'border-border/60 border'
								}>
								<CardContent className="p-3">
									<div className="flex items-center gap-3">
										<div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
											<Server className="h-4 w-4" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5">
												<span
													className="truncate text-sm font-medium"
													title={provider.name}>
													{provider.name}
												</span>
												<Badge
													variant="outline"
													className="shrink-0 whitespace-nowrap text-[11px]">
													{providerLabels[provider.type] || provider.type}
												</Badge>
												<span className="text-muted-foreground shrink-0 whitespace-nowrap text-[11px]">
													{count} 个模型
												</span>
											</div>
											<p className="text-muted-foreground mt-0.5 truncate text-xs">
												{provider.baseUrl}
											</p>
										</div>
										<div className="flex shrink-0 items-center gap-1">
											<Button
												size="sm"
												onClick={() => toggleAddPanel(provider)}>
												<Plus className="mr-1 h-[14px] w-[14px]" />
												添加模型
											</Button>
											<Button
												aria-label="编辑提供商"
												size="sm"
												title="编辑"
												variant="outline"
												onClick={() => openProviderForm(provider)}>
												<Pencil className="h-[14px] w-[14px]" />
											</Button>
											<Button
												aria-label="删除提供商"
												className="text-destructive hover:bg-destructive/10"
												size="sm"
												title="删除"
												variant="outline"
												onClick={() => handleDeleteProvider(provider)}>
												<Trash2 className="h-[14px] w-[14px]" />
											</Button>
										</div>
									</div>

									{/* 添加模型面板:自动查询可用模型 + 快捷勾选 */}
									{addingProviderId === provider.id && (
										<div className="mt-3 space-y-2 border-t border-border/40 pt-3">
											<div className="flex items-center gap-2">
												<Button
													size="sm"
													variant="outline"
													disabled={fetchingModels}
													onClick={() => queryAvailable(provider)}>
													{fetchingModels ? (
														<Loader2 className="mr-1 h-[14px] w-[14px] animate-spin" />
													) : (
														<RefreshCw className="mr-1 h-[14px] w-[14px]" />
													)}
													重新查询
												</Button>
												<span className="text-muted-foreground text-xs">
													{fetchingModels
														? '正在查询可用模型...'
														: `${availableModels.length} 个可选`}
												</span>
											</div>

										{queryError && (
											<p className="text-destructive text-xs">{queryError}</p>
										)}

											{availableModels.length > 0 && (
												<div className="flex flex-wrap gap-1.5">
													{availableModels.map((name) => {
														const picked = pickedModels.includes(name);

														return (
															<button
																key={name}
																type="button"
																onClick={() => togglePick(name)}
																className={
																	picked
																		? 'border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors'
																		: 'border-border/60 hover:bg-accent/40 text-foreground/80 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors'
																}>
																{picked && (
																	<Check className="h-3 w-3 shrink-0" />
																)}
																<span className="max-w-[220px] truncate font-mono">
																	{name}
																</span>
															</button>
														);
													})}
												</div>
											)}

											<div className="flex items-center gap-2">
												<Input
													className="h-8 flex-1"
													value={manualName}
													onChange={(e) => setManualName(e.target.value)}
													placeholder="或手动输入模型名，如 gpt-4o-mini"
												/>
												<Button
													size="sm"
													variant="outline"
													disabled={addingModels || !manualName.trim()}
													onClick={() => handleAddManual(provider)}>
													添加
												</Button>
											</div>

											{pickedModels.length > 0 && (
												<Button
													size="sm"
													className="w-full"
													disabled={addingModels}
													onClick={() => handleAddPicked(provider)}>
													{addingModels && (
														<Loader2 className="mr-1 h-[14px] w-[14px] animate-spin" />
													)}
													添加所选（{pickedModels.length}）
												</Button>
											)}
										</div>
									)}
								</CardContent>
							</Card>
						);
					})}

					{providers.length === 0 && !loading && (
						<div className="text-muted-foreground border-border/40 rounded-lg border border-dashed py-6 text-center text-xs">
							暂无提供商，点击右上角「添加提供商」开始
						</div>
					)}
				</div>
			</section>

			{/* ═══ 模型(按提供商分组) ═══ */}
			<section className="mt-5">
				<h3 className="text-muted-foreground mb-2 text-xs font-medium">
					模型（{models.length}）
				</h3>

				{loading && (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
					</div>
				)}

				{groups.list.map(({ provider, items }) => (
					<div key={provider.id} className="mb-4">
						<div className="text-foreground/80 mb-1.5 flex items-center gap-1.5 text-xs font-medium">
							<Building2 className="text-muted-foreground h-3.5 w-3.5" />
							{provider.name}
							<span className="text-muted-foreground tabular-nums">
								{items.length}
							</span>
						</div>
						<div className="space-y-2">
							{items.map((model) => renderModelCard(model))}
						</div>
					</div>
				))}

				{groups.others.length > 0 && (
					<div className="mb-4">
						<div className="text-foreground/80 mb-1.5 flex items-center gap-1.5 text-xs font-medium">
							<Building2 className="text-muted-foreground h-3.5 w-3.5" />
							其他来源
							<span className="text-muted-foreground tabular-nums">
								{groups.others.length}
							</span>
						</div>
						<div className="space-y-2">
							{groups.others.map((model) => renderModelCard(model))}
						</div>
					</div>
				)}

				{!loading && models.length === 0 && providers.length > 0 && (
					<div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
						<div className="bg-muted/40 border-border/40 flex h-12 w-12 items-center justify-center rounded-full border">
							<Inbox className="text-muted-foreground h-5 w-5" />
						</div>
						<p className="text-muted-foreground text-xs">
							点击提供商卡片上的「添加模型」，自动查询该 URL 的可用模型
						</p>
					</div>
				)}
			</section>

			{/* 编辑模型 */}
			{editingModel && (
				<Card className="border-border/60 mt-4 border">
					<CardContent className="space-y-3 p-4">
						<h3 className="text-base font-semibold">编辑模型</h3>
						<div>
							<label className="mb-1 block text-xs font-medium">模型名称</label>
							<Input
								className="h-9"
								value={editForm.name}
								onChange={(e) =>
									setEditForm({ ...editForm, name: e.target.value })
								}
							/>
						</div>
						<div>
							<label className="mb-1 block text-xs font-medium">Base URL</label>
							<Input
								className="h-9"
								value={editForm.baseUrl}
								onChange={(e) =>
									setEditForm({ ...editForm, baseUrl: e.target.value })
								}
							/>
						</div>
						<div>
							<label className="mb-1 block text-xs font-medium">API Key</label>
							<Input
								className="h-9"
								type="password"
								value={editForm.apiKey}
								onChange={(e) =>
									setEditForm({ ...editForm, apiKey: e.target.value })
								}
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => setEditingModel(null)}>
								取消
							</Button>
							<Button size="sm" onClick={handleUpdateModel}>
								保存修改
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);

	/** 单个模型卡片(两段式:信息+操作 / 能力标签) */
	function renderModelCard(model: Model) {
		const selected = selectedModelId === model.id;

		return (
			<Card
				key={model.id}
				className={
					selected
						? 'border-border/60 ring-primary ring-2'
						: 'border-border/60 border'
				}>
				<CardContent className="p-3">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
							<Brain className="h-4 w-4" />
						</div>
						<div className="min-w-[120px] flex-1">
							<div className="flex items-center gap-1.5">
								<h4 className="truncate text-sm font-medium">{model.name}</h4>
								{!model.isEnabled && (
									<Badge
										variant="outline"
										className="text-muted-foreground shrink-0 whitespace-nowrap text-[11px]">
										未启用
									</Badge>
								)}
							</div>
							<p className="text-muted-foreground mt-0.5 truncate text-xs">
								{model.baseUrl}
							</p>
						</div>
						<div className="ml-auto flex shrink-0 items-center gap-1">
							<Button
								size="sm"
								variant="outline"
								className="whitespace-nowrap"
								disabled={testingId === model.id}
								onClick={() => handleTest(model.id)}>
								{testingId === model.id ? (
									<Loader2 className="h-[14px] w-[14px] animate-spin" />
								) : (
									'测试'
								)}
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="whitespace-nowrap"
								onClick={() => selectModel(model.id)}>
								{selected ? '已选中' : '选中'}
							</Button>
							<Button
								aria-label="编辑"
								size="sm"
								title="编辑"
								variant="outline"
								onClick={() => handleEditClick(model)}>
								<Pencil className="h-[14px] w-[14px]" />
							</Button>
							<Button
								aria-label="删除"
								className="text-destructive hover:bg-destructive/10"
								size="sm"
								title="删除"
								variant="outline"
								onClick={() => handleDelete(model.id)}>
								<Trash2 className="h-[14px] w-[14px]" />
							</Button>
						</div>
					</div>
					<div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
						{model.supportsToolCall && (
							<Badge
								variant="secondary"
								className="shrink-0 whitespace-nowrap text-[11px]">
								工具调用
							</Badge>
						)}
						{model.supportsStreaming && (
							<Badge
								variant="secondary"
								className="shrink-0 whitespace-nowrap text-[11px]">
								流式
							</Badge>
						)}
						<span className="flex-1" />
						<ModelApiKeyBadge apiKey={model.apiKey} />
					</div>
				</CardContent>
			</Card>
		);
	}
}
