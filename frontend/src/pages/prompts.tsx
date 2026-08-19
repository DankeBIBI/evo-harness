import type { Prompt, PromptScope } from '@/stores/promptStore';

import { Button } from '@/components/ui/Button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { usePromptStore } from '@/stores/promptStore';
import {
    Check,
    Edit2,
    FileText,
    FolderOpen,
    Globe,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { useState } from 'react';

const scopeIcons: Record<PromptScope, React.ReactNode> = {
  file: <FileText className="" />,
  global: <Globe className="" />,
  project: <FolderOpen className="" />,
};

const scopeLabels: Record<PromptScope, string> = {
  file: '文件',
  global: '全局',
  project: '项目',
};

interface PromptFormData {
  name: string;
  content: string;
  scope: PromptScope;
  filePattern: string;
  projectPath: string;
  enabled: boolean;
}

const defaultFormData: PromptFormData = {
  name: '',
  content: '',
  scope: 'global',
  filePattern: '',
  projectPath: '',
  enabled: true,
};

export default function PromptsPage() {
  const { prompts, addPrompt, updatePrompt, deletePrompt, togglePrompt } =
    usePromptStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PromptFormData>(defaultFormData);

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.content.trim()) return;

    if (editingId) {
      updatePrompt(editingId, {
        name: formData.name.trim(),
        content: formData.content.trim(),
        scope: formData.scope,
        filePattern:
          formData.scope === 'file' ? formData.filePattern : undefined,
        projectPath:
          formData.scope === 'project' ? formData.projectPath : undefined,
        enabled: formData.enabled,
      });
      setEditingId(null);
    } else {
      addPrompt({
        name: formData.name.trim(),
        content: formData.content.trim(),
        scope: formData.scope,
        filePattern:
          formData.scope === 'file' ? formData.filePattern : undefined,
        projectPath:
          formData.scope === 'project' ? formData.projectPath : undefined,
        enabled: formData.enabled,
        order: 0,
      });
      setIsCreating(false);
    }

    setFormData(defaultFormData);
  };

  const handleEdit = (prompt: Prompt) => {
    setEditingId(prompt.id);
    setFormData({
      name: prompt.name,
      content: prompt.content,
      scope: prompt.scope,
      filePattern: prompt.filePattern || '',
      projectPath: prompt.projectPath || '',
      enabled: prompt.enabled,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData(defaultFormData);
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">提示词管理</h1>
          <p className="text-muted-foreground">
            管理和编辑您的提示词模板，在对话时自动匹配使用
          </p>
        </div>
        {!isCreating && !editingId && (
          <Button
            onClick={() => setIsCreating(true)}
            variant="default"
          >
            <Plus className="mr-2 " />
            新建提示词
          </Button>
        )}
      </div>

      {/* 新建/编辑表单 */}
      {(isCreating || editingId) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingId ? '编辑提示词' : '新建提示词'}</CardTitle>
            <CardDescription>
              创建提示词模板，在特定上下文自动匹配使用
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-muted-foreground mb-1 block text-sm">
                  名称
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })}
                  placeholder="输入提示词名称"
                />
              </div>

              <div className="col-span-2">
                <label className="text-muted-foreground mb-1 block text-sm">
                  内容
                </label>
                <Textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })}
                  placeholder="输入提示词内容..."
                  rows={6}
                />
              </div>

              <div>
                <label className="text-muted-foreground mb-1 block text-sm">
                  作用域
                </label>
                <select
                  value={formData.scope}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      scope: e.target.value as PromptScope,
                    })
                  }
                  className="bg-muted/40 w-full rounded-xl px-3 py-2 text-sm focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="global">全局 - 所有场景可用</option>
                  <option value="project">项目 - 指定项目路径</option>
                  <option value="file">文件 - 指定文件模式</option>
                </select>
              </div>

              {formData.scope === 'project' && (
                <div>
                  <label className="text-muted-foreground mb-1 block text-sm">
                    项目路径
                  </label>
                  <Input
                    value={formData.projectPath}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        projectPath: e.target.value,
                      })
                    }
                    placeholder="如: D:\project\myapp"
                  />
                </div>
              )}

              {formData.scope === 'file' && (
                <div>
                  <label className="text-muted-foreground mb-1 block text-sm">
                    文件模式
                  </label>
                  <Input
                    value={formData.filePattern}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        filePattern: e.target.value,
                      })
                    }
                    placeholder="如: *.tsx, src/**/*.vue"
                  />
                </div>
              )}

              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={(e) =>
                    setFormData({ ...formData, enabled: e.target.checked })
                  }
                />
                <label htmlFor="enabled" className="text-sm">
                  启用此提示词
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel}>
                <X className="mr-2 " />
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.name.trim() || !formData.content.trim()}
              >
                <Check className="mr-2 " />
                {editingId ? '保存' : '创建'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 提示词列表 */}
      {prompts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="text-muted-foreground mb-4 h-12 w-12" />
            <p className="text-muted-foreground text-lg">暂无提示词</p>
            <p className="text-muted-foreground mt-1 text-sm">
              点击上方按钮创建您的第一个提示词
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {prompts.map((prompt) => (
            <Card key={prompt.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        prompt.enabled
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {scopeIcons[prompt.scope]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3
                          className={`font-medium ${
                            !prompt.enabled && 'text-muted-foreground'
                          }`}
                        >
                          {prompt.name}
                        </h3>
                        <span className="text-muted-foreground rounded bg-muted px-2 py-0.5 text-xs">
                          {scopeLabels[prompt.scope]}
                        </span>
                      </div>
                      <p
                        className="text-muted-foreground mt-1 line-clamp-2 text-sm"
                      >
                        {prompt.content}
                      </p>
                      {prompt.scope === 'project' && prompt.projectPath && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          路径: {prompt.projectPath}
                        </p>
                      )}
                      {prompt.scope === 'file' && prompt.filePattern && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          文件: {prompt.filePattern}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePrompt(prompt.id)}
                      title={prompt.enabled ? '禁用' : '启用'}
                    >
                      <Check
                        className={` ${
                          prompt.enabled
                            ? 'text-green-500'
                            : 'text-muted-foreground'
                        }`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(prompt)}
                    >
                      <Edit2 className="" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePrompt(prompt.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
