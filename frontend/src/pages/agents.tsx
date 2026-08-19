import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
    Card,
    CardContent,
} from '@/components/ui/Card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import {
    Bot,
    Loader2,
    MessageCircle,
    Pencil,
    Plus,
    Search,
    Star,
    Trash2,
    Upload,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    Agent,
    AgentCategory,
    AgentMode,
    AgentScope,
    CollaborationMode,
    useAgentStore,
} from '@/stores/agentStore';

/** 分类颜色映射 - 项目风格 */
const categoryColors: Record<string, { bg: string; text: string }> = {
  analysis: { bg: 'bg-blue-500/10', text: 'text-blue-600' },
  coding: { bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
  domain: { bg: 'bg-purple-500/10', text: 'text-purple-600' },
  general: { bg: 'bg-muted', text: 'text-muted-foreground' },
  orchestration: { bg: 'bg-orange-500/10', text: 'text-orange-600' },
  translation: { bg: 'bg-cyan-500/10', text: 'text-cyan-600' },
  writing: { bg: 'bg-pink-500/10', text: 'text-pink-600' },
};

const categoryLabels: Record<string, string> = {
  analysis: '分析',
  coding: '编程',
  domain: '领域',
  general: '通用',
  orchestration: '编排',
  translation: '翻译',
  writing: '写作',
};

const scopeLabels: Record<string, string> = {
  project: '项目',
  system: '系统',
  team: '团队',
  user: '个人',
};

type AgentFormState = {
  agentMode: AgentMode;
  category: AgentCategory;
  collaborationMode: CollaborationMode;
  description: string;
  isPublic: boolean;
  isTemplate: boolean;
  modelId: string;
  name: string;
  role: string;
  scope: AgentScope;
  skillsText: string;
  tagsText: string;
  toolsText: string;
};

type FeedbackState = {
  message: string;
  type: 'error' | 'success';
} | null;

const defaultFormState: AgentFormState = {
  agentMode: 'primary',
  category: 'general',
  collaborationMode: 'sequential',
  description: '',
  isPublic: false,
  isTemplate: false,
  modelId: 'gpt-4',
  name: '',
  role: '',
  scope: 'user',
  skillsText: '',
  tagsText: '',
  toolsText: '',
};

const parseListText = (value: string) =>
  value
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/** 解析 agent.md 文件，提取 frontmatter 和内容 */
const parseAgentMarkdown = (
  content: string,
): Partial<AgentFormState> | null => {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter: Record<string, string> = {};
  frontmatterMatch[1].split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    frontmatter[key] = value;
  });

  const result: Partial<AgentFormState> = {};

  if (frontmatter.name) result.name = frontmatter.name;
  if (frontmatter.description) result.description = frontmatter.description;
  if (frontmatter.model) result.modelId = frontmatter.model;

  const validCategories: AgentCategory[] = [
    'analysis',
    'coding',
    'domain',
    'general',
    'orchestration',
    'translation',
    'writing',
  ];
  if (
    frontmatter.category &&
    validCategories.includes(frontmatter.category as AgentCategory)
  ) {
    result.category = frontmatter.category as AgentCategory;
  }

  const validScopes: AgentScope[] = ['project', 'system', 'team', 'user'];
  if (
    frontmatter.scope &&
    validScopes.includes(frontmatter.scope as AgentScope)
  ) {
    result.scope = frontmatter.scope as AgentScope;
  }

  // 从内容中提取 role（第一个 ## 后的内容作为角色说明）
  const contentPart = content.replace(/^---[\s\S]*?---\n/, '');
  const roleMatch = contentPart.match(/^##?\s+(?:角色|Role)[\s\S]*?\n([\s\S]*?)(?=^##|\n\n|$)/im);
  if (roleMatch) {
    const roleText = roleMatch[1].trim().slice(0, 200);
    result.role = roleText;
  }

  // 从 frontmatter 提取 skills
  if (frontmatter.skills) {
    result.skillsText = frontmatter.skills;
  }

  // 从 frontmatter 提取 tags
  if (frontmatter.tags) {
    result.tagsText = frontmatter.tags;
  }

  return result;
};

const getFormStateFromAgent = (agent: Agent): AgentFormState => ({
  agentMode: agent.agentMode,
  category: agent.category,
  collaborationMode: agent.collaborationMode || 'sequential',
  description: agent.description || '',
  isPublic: agent.isPublic,
  isTemplate: agent.isTemplate,
  modelId: agent.modelId,
  name: agent.name,
  role: agent.role,
  scope: agent.scope,
  skillsText: agent.skills.join('，'),
  tagsText: agent.tags.join('，'),
  toolsText: agent.tools.join('，'),
});

const buildAgentPayload = (formState: AgentFormState) => ({
  agentMode: formState.agentMode,
  category: formState.category,
  collaborationMode: formState.collaborationMode,
  description: formState.description.trim(),
  executionConfig: {
    retryCount: 1,
    timeout: 120,
  },
  isPublic: formState.isPublic,
  isTemplate: formState.isTemplate,
  modelConfig: {
    temperature: 0.7,
  },
  modelId: formState.modelId.trim(),
  name: formState.name.trim(),
  role: formState.role.trim() || '通用 AI Agent',
  scope: formState.scope,
  skills: parseListText(formState.skillsText),
  tags: parseListText(formState.tagsText),
  tools: parseListText(formState.toolsText),
});

export default function AgentsPage() {
  const navigate = useNavigate();
  const {
    addAgent,
    agents,
    deleteAgent,
    error,
    fetchAgents,
    loading,
    selectAgent,
    selectedAgentId,
    updateAgent,
  } = useAgentStore();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [formState, setFormState] = useState<AgentFormState>(defaultFormState);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingDeleteAgent, setPendingDeleteAgent] = useState<Agent | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 处理导入 agent.md 文件 */
  const handleImportAgent = () => {
    fileInputRef.current?.click();
  };

  /** 处理文件选择 */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const target = event.target;
    const file = target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      setFeedback({ message: '请选择 .md 文件', type: 'error' });
      target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = parseAgentMarkdown(content);

      if (!parsed) {
        setFeedback({ message: '无法解析 agent.md 文件格式', type: 'error' });
        target.value = '';
        return;
      }

      // 合并解析结果到表单（空字符串不覆盖已有值）
      setFormState((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        description: parsed.description || prev.description,
        modelId: parsed.modelId || prev.modelId,
        category: parsed.category || prev.category,
        scope: parsed.scope || prev.scope,
        role: parsed.role || prev.role,
        skillsText: parsed.skillsText || prev.skillsText,
        tagsText: parsed.tagsText || prev.tagsText,
      }));

      setFeedback({ message: '已导入 agent.md 文件', type: 'success' });
      target.value = '';

      // 自动打开新建对话框
      setEditingAgent(null);
      setDialogOpen(true);
    };
    reader.onerror = () => {
      setFeedback({ message: '文件读取失败', type: 'error' });
      target.value = '';
    };
    reader.readAsText(file);
  };

  /** 自动清除反馈消息 */
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const filteredAgents = useMemo(() => {
    let result = agents;

    // 分类筛选
    if (selectedCategory !== 'all') {
      result = result.filter((agent) => agent.category === selectedCategory);
    }

    const keyword = search.trim().toLowerCase();

    if (!keyword) return result;

    return result.filter((agent) => {
      const fields = [
        agent.name,
        agent.description,
        agent.role,
        agent.modelId,
        categoryLabels[agent.category],
        scopeLabels[agent.scope],
        ...agent.skills,
        ...agent.tags,
      ].filter(Boolean);

      return fields.some((field) =>
        String(field).toLowerCase().includes(keyword),
      );
    });
  }, [agents, search, selectedCategory]);

  const handleOpenCreateDialog = () => {
    setFeedback(null);
    setEditingAgent(null);
    setFormState({ ...defaultFormState });
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (agent: Agent) => {
    setFeedback(null);
    setEditingAgent(agent);
    setFormState(getFormStateFromAgent(agent));
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingAgent(null);
    setFormState({ ...defaultFormState });
    setFeedback(null);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) handleCloseDialog();
  };

  const handleChangeFormState = <K extends keyof AgentFormState>(
    key: K,
    value: AgentFormState[K],
  ) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!formState.name.trim()) {
      setFeedback({ message: '请填写 Agent 名称', type: 'error' });
      return;
    }

    if (!formState.modelId.trim()) {
      setFeedback({ message: '请填写模型 ID', type: 'error' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const payload = buildAgentPayload(formState);

      if (editingAgent) {
        await updateAgent(editingAgent.id, payload);
      } else {
        await addAgent(payload);
      }

      setFeedback({
        message: editingAgent ? 'Agent 更新成功' : 'Agent 创建成功',
        type: 'success',
      });
      handleCloseDialog();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('提交 Agent 失败:', err);
      setFeedback({
        message: editingAgent ? '更新 Agent 失败' : '创建 Agent 失败',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  /** 仅 user-db / system 源的 Agent 可设为全局默认（其他源受项目/系统生命周期约束） */
  const isDefaultableAgent = (agent: Agent) =>
    agent.source === 'user-db' || agent.source === 'system';

  /** 将指定 Agent 设为新建对话时的默认 agent */
  const handleSetDefaultAgent = (agent: Agent) => {
    if (!isDefaultableAgent(agent)) {
      setFeedback({
        message: `「${agent.name}」来自 ${agent.source} 源,不可设为默认`,
        type: 'error',
      });
      return;
    }
    selectAgent(agent.id);
    setFeedback({ message: `已将「${agent.name}」设为默认 Agent`, type: 'success' });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteAgent || deleting) return;

    setDeleting(true);
    try {
      await deleteAgent(pendingDeleteAgent.id);
      setFeedback({ message: 'Agent 删除成功', type: 'success' });
      setPendingDeleteAgent(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('删除 Agent 失败:', err);
      setFeedback({ message: '删除 Agent 失败', type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      {/* 页面标题区 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent 管理</h1>
          <p className="text-muted-foreground">
            创建和管理你的 AI Agent，配置角色、模型和技能
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleImportAgent} variant="ghost">
            <Upload className="mr-2 " />
            导入
          </Button>
          <Button onClick={handleOpenCreateDialog}>
            <Plus className="mr-2 " />
            新建
          </Button>
          <input
            className="hidden"
            accept=".md"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
        </div>
      </div>

      {/* 搜索和统计 */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            className="pl-10"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索..."
            value={search}
          />
        </div>
        <div className="text-muted-foreground text-sm">
          {filteredAgents.length} 个 Agent
        </div>
      </div>

      {/* 分类筛选标签 */}
      <div aria-label="分类筛选" className="mb-6 flex flex-wrap gap-2" role="group">
        {Object.entries(categoryLabels).map(([value, label]) => {
          const color = categoryColors[value] || categoryColors.general;
          const isActive = selectedCategory === value;
          return (
            <button
              aria-pressed={isActive}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? `${color.bg} ${color.text}`
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              key={value}
              onClick={() => setSelectedCategory(value)}
            >
              {label}
            </button>
          );
        })}
        {selectedCategory !== 'all' && (
          <button
            className="text-muted-foreground hover:text-foreground rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            onClick={() => setSelectedCategory('all')}
          >
            清除
          </button>
        )}
      </div>

      {error ? (
        <div className="bg-destructive/10 text-destructive mb-4 rounded-xl px-4 py-3 text-sm">
          Agent 加载失败：{error}
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : null}

      {/* Agent 卡片网格 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAgents.map((agent) => {
          const color = categoryColors[agent.category] || categoryColors.general;
          const isDefault = selectedAgentId === agent.id;
          return (
            <Card
              className={`group relative flex flex-col transition-shadow hover:shadow-md cursor-pointer ${
                isDefault ? 'ring-2 ring-primary/50' : ''
              }`}
              key={agent.id}
              onClick={() => navigate(`/chat?agentId=${encodeURIComponent(agent.id)}`)}
            >
              <CardContent className="flex flex-1 flex-col p-5">
                {/* 顶部：图标 + 名称 + 分类 + 默认标记 */}
                <div className="mb-4 flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color.bg}`}>
                    <Bot className={`h-6 w-6 ${color.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">
                        {agent.name}
                      </h3>
                      {isDefault ? (
                        <Badge className="shrink-0 gap-1" variant="default">
                          <Star className="h-3 w-3 fill-current" />
                          默认
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground truncate text-sm">
                      {agent.modelId}
                    </p>
                  </div>
                </div>

                {/* 描述 */}
                <p className="text-muted-foreground mb-4 line-clamp-2 text-sm flex-1">
                  {agent.description || agent.role || '暂无描述'}
                </p>

                {/* 底部：操作按钮 */}
                <div className="flex items-center gap-2 mt-auto pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={() =>
                      navigate(`/chat?agentId=${encodeURIComponent(agent.id)}`)
                    }
                    size="sm"
                  >
                    <MessageCircle className="mr-1.5 h-[16px] w-[16px]" />
                    对话
                  </Button>
                  <Button
                    aria-label={
                      isDefault
                        ? '当前默认 Agent'
                        : isDefaultableAgent(agent)
                          ? '设为默认 Agent'
                          : '该来源 Agent 不可设为默认'
                    }
                    disabled={isDefault}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSetDefaultAgent(agent);
                    }}
                    size="icon"
                    title={
                      isDefault
                        ? '当前默认 Agent'
                        : isDefaultableAgent(agent)
                          ? '设为默认 Agent'
                          : `来自 ${agent.source} 源的 Agent 不可设为默认`
                    }
                    variant="ghost"
                    className={
                      isDefault
                        ? 'text-primary'
                        : isDefaultableAgent(agent)
                          ? 'text-muted-foreground hover:text-primary'
                          : 'text-muted-foreground/40 cursor-not-allowed'
                    }
                  >
                    <Star
                      aria-hidden="true"
                      className={`h-[16px] w-[16px] ${isDefault ? 'fill-current' : ''}`}
                    />
                  </Button>
                  <Button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleOpenEditDialog(agent);
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Pencil className="h-[16px] w-[16px]" />
                  </Button>
                  <Button
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingDeleteAgent(agent);
                    }}
                    size="icon"
                    variant="ghost"
                    className="text-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-[16px] w-[16px]" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 空状态 */}
      {!loading && filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="bg-muted/50 mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
            <Bot className="text-muted-foreground/50 h-8 w-8" />
          </div>
          <p className="text-muted-foreground mb-1 text-sm font-medium">
            {search || selectedCategory !== 'all'
              ? '暂无匹配的 Agent'
              : '还没有 Agent'}
          </p>
          <p className="text-muted-foreground/60 text-xs">
            {search || selectedCategory !== 'all'
              ? '尝试调整搜索关键词或筛选条件'
              : '点击「新建」创建第一个 Agent'}
          </p>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAgent ? '编辑 Agent' : '新建 Agent'}
            </DialogTitle>
            <DialogDescription>
              配置 Agent 的基础信息、角色定位和技能列表。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input
                onChange={(event) =>
                  handleChangeFormState('name', event.target.value)
                }
                placeholder="例如：代码评审助手"
                value={formState.name}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">模型 ID</label>
              <Input
                onChange={(event) =>
                  handleChangeFormState('modelId', event.target.value)
                }
                placeholder="例如：gpt-4.1"
                value={formState.modelId}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">分类</label>
              <Select
                onValueChange={(value) =>
                  handleChangeFormState('category', value as AgentCategory)
                }
                value={formState.category}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">作用域</label>
              <Select
                onValueChange={(value) =>
                  handleChangeFormState('scope', value as AgentScope)
                }
                value={formState.scope}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择作用域" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(scopeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">角色说明</label>
              <Input
                onChange={(event) =>
                  handleChangeFormState('role', event.target.value)
                }
                placeholder="例如：负责代码生成、重构与问题排查"
                value={formState.role}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">描述</label>
              <Textarea
                onChange={(event) =>
                  handleChangeFormState('description', event.target.value)
                }
                placeholder="补充 Agent 的使用场景和特点"
                rows={4}
                value={formState.description}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">技能</label>
              <Input
                onChange={(event) =>
                  handleChangeFormState('skillsText', event.target.value)
                }
                placeholder="使用逗号分隔，例如：代码审查，重构，测试"
                value={formState.skillsText}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">工具</label>
              <Input
                onChange={(event) =>
                  handleChangeFormState('toolsText', event.target.value)
                }
                placeholder="例如：terminal，search"
                value={formState.toolsText}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">标签</label>
              <Input
                onChange={(event) =>
                  handleChangeFormState('tagsText', event.target.value)
                }
                placeholder="例如：研发，助手"
                value={formState.tagsText}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleCloseDialog} variant="outline">
              取消
            </Button>
            <Button disabled={submitting} onClick={handleSubmit}>
              {submitting ? (
                <Loader2 className="mr-2  animate-spin" />
              ) : null}
              {editingAgent ? '保存修改' : '创建 Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeleteAgent)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteAgent(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除 Agent</DialogTitle>
            <DialogDescription>
              {pendingDeleteAgent
                ? `确定删除 Agent「${pendingDeleteAgent.name}」吗？该操作不可撤销。`
                : '确定删除当前 Agent 吗？'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setPendingDeleteAgent(null)}
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={deleting}
              onClick={handleConfirmDelete}
              variant="destructive"
            >
              {deleting ? (
                <Loader2 className="mr-2  animate-spin" />
              ) : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
