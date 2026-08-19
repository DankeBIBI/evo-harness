import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ModelApiKeyBadge } from '@/components/ModelApiKeyBadge';
import { Model, useModelStore } from '@/stores/modelStore';
import {
    Brain,
    CheckCircle2,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  copilot: 'CLI',
  ollama: 'Ollama',
  gemini: 'Gemini',
  custom: '自定义',
};

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
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [addAvailableModels, setAddAvailableModels] = useState<string[]>([]);
  const [editAvailableModels, setEditAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [newModel, setNewModel] = useState({
    name: '',
    provider: 'openai' as const,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    provider: 'openai' as Model['provider'],
    baseUrl: '',
    apiKey: '',
  });

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleFetchModels = useCallback(async () => {
    if (!newModel.baseUrl) return;
    setFetchingModels(true);
    try {
      const models = await fetchAvailableModels(
        newModel.baseUrl,
        newModel.apiKey,
        newModel.provider,
      );
      setAddAvailableModels(models);
      if (models.length > 0 && !newModel.name) {
        setNewModel((prev) => ({ ...prev, name: models[0] }));
      }
    } finally {
      setFetchingModels(false);
    }
  }, [
    newModel.baseUrl,
    newModel.apiKey,
    newModel.provider,
    fetchAvailableModels,
  ]);

  const handleProviderOrUrlChange = (
    field: 'provider' | 'baseUrl',
    value: string,
  ) => {
    setNewModel((prev) => ({ ...prev, [field]: value }));
    setAddAvailableModels([]);
  };

  const handleEditProviderOrUrlChange = (
    field: 'provider' | 'baseUrl',
    value: string,
  ) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    setEditAvailableModels([]);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const success = await testModel(id);
      alert(success ? '测试成功！' : '测试失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleAddModel = async () => {
    if (!newModel.name || !newModel.baseUrl) {
      alert('请填写模型名称和 Base URL');
      return;
    }
    try {
      await addModel({
        name: newModel.name,
        provider: newModel.provider,
        baseUrl: newModel.baseUrl,
        apiKey: newModel.apiKey,
        isEnabled: true,
        maxInputTokens: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsToolCall: true,
        supportsVision: true,
      } as Omit<Model, 'createdAt' | 'id'>);
      setShowAddForm(false);
      setNewModel({
        name: '',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
      });
      setAddAvailableModels([]);
    } catch {
      alert('添加模型失败');
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
      name: model.name,
      provider: model.provider,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey || '',
    });
    setEditAvailableModels([]);
  };

  const handleCancelEdit = () => {
    setEditingModel(null);
    setEditForm({ name: '', provider: 'openai', baseUrl: '', apiKey: '' });
    setEditAvailableModels([]);
  };

  const handleFetchEditModels = useCallback(async () => {
    if (!editForm.baseUrl) return;
    setFetchingModels(true);
    try {
      const models = await fetchAvailableModels(
        editForm.baseUrl,
        editForm.apiKey,
        editForm.provider,
      );
      setEditAvailableModels(models);
    } finally {
      setFetchingModels(false);
    }
  }, [
    editForm.baseUrl,
    editForm.apiKey,
    editForm.provider,
    fetchAvailableModels,
  ]);

  const handleUpdateModel = async () => {
    if (!editingModel || !editForm.name || !editForm.baseUrl) {
      alert('请填写模型名称和 Base URL');
      return;
    }
    try {
      await updateModel(editingModel.id, {
        name: editForm.name,
        provider: editForm.provider,
        baseUrl: editForm.baseUrl,
        apiKey: editForm.apiKey,
      });
      handleCancelEdit();
    } catch {
      alert('更新模型失败');
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">模型管理</h2>
          <p className="text-muted-foreground text-sm">
            配置和管理 AI 模型，支持多种提供商
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-2 " />
          {showAddForm ? '取消' : '添加模型'}
        </Button>
      </div>

      {/* 添加模型表单 */}
      {showAddForm && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  模型名称
                </label>
                {addAvailableModels.length > 0 ? (
                  <select
                    className="bg-muted/40 flex h-10 w-full rounded-xl px-3 py-2 text-sm focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newModel.name}
                    onChange={(e) =>
                      setNewModel({ ...newModel, name: e.target.value })
                    }
                  >
                    <option value="">请选择模型</option>
                    {addAvailableModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={newModel.name}
                    onChange={(e) =>
                      setNewModel({ ...newModel, name: e.target.value })
                    }
                    placeholder="如：GPT-4 或手动输入"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">提供商</label>
                <select
                  className="bg-muted/40 flex h-10 w-full rounded-xl px-3 py-2 text-sm focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={newModel.provider}
                  onChange={(e) =>
                    handleProviderOrUrlChange('provider', e.target.value)
                  }
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama</option>
                  <option value="gemini">Gemini</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  Base URL
                </label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={newModel.baseUrl}
                    onChange={(e) =>
                      handleProviderOrUrlChange('baseUrl', e.target.value)
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleFetchModels}
                    disabled={fetchingModels || !newModel.baseUrl}
                  >
                    {fetchingModels ? (
                      <Loader2 className=" animate-spin" />
                    ) : (
                      <RefreshCw className="" />
                    )}
                    <span className="ml-2">查询模型</span>
                  </Button>
                </div>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  API Key
                </label>
                <Input
                  type="password"
                  value={newModel.apiKey}
                  onChange={(e) =>
                    setNewModel({ ...newModel, apiKey: e.target.value })
                  }
                  placeholder="sk-..."
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                取消
              </Button>
              <Button onClick={handleAddModel}>确认添加</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 编辑模型表单 */}
      {editingModel && (
        <Card className="ring-2 ring-primary/20 mb-4">
          <CardContent className="p-4">
            <h3 className="mb-4 text-lg font-semibold">编辑模型</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  模型名称
                </label>
                {editAvailableModels.length > 0 ? (
                  <select
                    className="bg-muted/40 flex h-10 w-full rounded-xl px-3 py-2 text-sm focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                  >
                    <option value="">请选择模型</option>
                    {editAvailableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    placeholder="如：GPT-4 或手动输入"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">提供商</label>
                <select
                  className="bg-muted/40 flex h-10 w-full rounded-xl px-3 py-2 text-sm focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={editForm.provider}
                  onChange={(e) =>
                    handleEditProviderOrUrlChange('provider', e.target.value)
                  }
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama</option>
                  <option value="gemini">Gemini</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  Base URL
                </label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={editForm.baseUrl}
                    onChange={(e) =>
                      handleEditProviderOrUrlChange('baseUrl', e.target.value)
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleFetchEditModels}
                    disabled={fetchingModels || !editForm.baseUrl}
                  >
                    {fetchingModels ? (
                      <Loader2 className=" animate-spin" />
                    ) : (
                      <RefreshCw className="" />
                    )}
                    <span className="ml-2">查询模型</span>
                  </Button>
                </div>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  API Key
                </label>
                <Input
                  type="password"
                  value={editForm.apiKey}
                  onChange={(e) =>
                    setEditForm({ ...editForm, apiKey: e.target.value })
                  }
                  placeholder="sk-..."
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancelEdit}>
                取消
              </Button>
              <Button onClick={handleUpdateModel}>保存修改</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}

      {error && (
        <div className="text-destructive py-4 text-center">
          加载失败: {error}
          <Button variant="link" onClick={fetchModels}>
            重试
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {models.map((model) => (
          <Card
            key={model.id}
            className={
              selectedModelId === model.id ? 'ring-primary ring-2' : ''
            }
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 flex h-14 w-14 items-center justify-center rounded-full">
                    <Brain className="text-primary h-8 w-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{model.name}</h3>
                      {model.isEnabled ? (
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      ) : (
                        <XCircle className="text-muted-foreground h-6 w-6" />
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {providerLabels[model.provider] || model.provider}
                      </Badge>
                      <span className="text-muted-foreground max-w-[260px] truncate text-xs">
                        {model.baseUrl}
                      </span>
                      <ModelApiKeyBadge apiKey={model.apiKey} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="mr-2 flex gap-1">
                    {model.supportsToolCall && (
                      <Badge variant="secondary" className="text-xs">
                        工具调用
                      </Badge>
                    )}
                    {model.supportsStreaming && (
                      <Badge variant="secondary" className="text-xs">
                        流式
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(model.id)}
                    disabled={testingId === model.id}
                  >
                    {testingId === model.id ? (
                      <Loader2 className="mr-1 h-[14px] w-[14px] animate-spin" />
                    ) : (
                      '测试'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectModel(model.id)}
                  >
                    {selectedModelId === model.id ? '已选中' : '选中'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditClick(model)}
                  >
                    <Pencil className="mr-1 h-[14px] w-[14px]" />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(model.id)}
                  >
                    <Trash2 className="mr-1 h-[14px] w-[14px]" />
                    删除
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
