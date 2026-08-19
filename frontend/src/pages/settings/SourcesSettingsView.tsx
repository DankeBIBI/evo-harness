import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { authorizeAndScanSource, rescanAllSources } from '@/lib/fs/source-scanner';
import { useAgentStore } from '@/stores/agentStore';
import {
  SOURCE_LABELS,
  useSourceStore,
  type Source,
} from '@/stores/sourceStore';
import { useSkillStore } from '@/stores/skillStore';
import { Folder, FolderOpen, Home, RefreshCw, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/** 单个来源开关项 */
interface SourceToggleItem {
  /** 后端 source 字符串 */
  source: Exclude<Source, 'system' | 'user-db'>;
  /** 标题 */
  title: string;
  /** 副标题 */
  desc: string;
  /** 启用/禁用文案 */
  enabledText: string;
  /** 图标 */
  icon: typeof Folder;
}

const TOGGLE_ITEMS: SourceToggleItem[] = [
  {
    source: 'project',
    title: '项目目录',
    desc: '授权项目根后扫描其 agents/* + skills/*',
    enabledText: '已启用(工作项目根)',
    icon: Folder,
  },
  {
    source: 'user',
    title: '用户目录',
    desc: '授权目录后扫描其 agents/* + skills/*',
    enabledText: '已启用(用户主目录)',
    icon: Home,
  },
  {
    source: 'claude-project',
    title: 'Claude 项目目录',
    desc: '授权目录 .claude 后扫描 agents/* + skills/*',
    enabledText: '已启用(Claude 项目)',
    icon: FolderOpen,
  },
  {
    source: 'claude-user',
    title: 'Claude 用户目录',
    desc: '授权 ~/.claude 后扫描 agents/* + skills/*',
    enabledText: '已启用(Claude 用户)',
    icon: FolderOpen,
  },
];

/** 取每个来源当前的 enabled 状态 */
const readEnabled = (
  cfg: { project: boolean; user: boolean; claudeProject: boolean; claudeUser: boolean },
  source: SourceToggleItem['source'],
): boolean => {
  switch (source) {
    case 'project':
      return cfg.project;
    case 'user':
      return cfg.user;
    case 'claude-project':
      return cfg.claudeProject;
    case 'claude-user':
      return cfg.claudeUser;
  }
};

export default function SourcesSettingsView() {
  const { config, fetchConfig, toggleSource, setShowSourceLabel, loading } =
    useSourceStore();
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const fetchSkills = useSkillStore((s) => s.fetchSkills);
  const [refreshing, setRefreshing] = useState(false);
  const [scanError, setScanError] = useState<null | string>(null);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  /** 切换后重拉列表(前端化后列表来自 localStorage,仅刷新缓存) */
  const handleToggle = async (source: SourceToggleItem['source']) => {
    await toggleSource(source);
    await Promise.all([fetchAgents(), fetchSkills()]);
  };

  /** 授权目录 → 扫描 → 挂载到对应来源(handle 持久化后启动自动扫描) */
  const handleScanDirectory = async (source: Exclude<Source, 'system' | 'user-db'>) => {
    setRefreshing(true);
    setScanError(null);
    try {
      const count = await authorizeAndScanSource(source);
      if (count === -1) return; // 用户取消选择,不提示
      if (count === 0) {
        setScanError('未扫描到 Agent / Skill,请确认所选目录包含 agents/、skills/ 结构');
      }
      await Promise.all([fetchAgents(), fetchSkills()]);
    } catch (err) {
      setScanError(`扫描失败: ${err}`);
    } finally {
      setRefreshing(false);
    }
  };

  /** 用已持久化的授权 handle 静默重扫全部来源(不弹目录选择器) */
  const handleRescan = async () => {
    setRefreshing(true);
    setScanError(null);
    try {
      await rescanAllSources();
      await Promise.all([fetchAgents(), fetchSkills()]);
    } catch (err) {
      setScanError(`刷新失败: ${err}`);
    } finally {
      setRefreshing(false);
    }
  };


  /** 统计每个来源加载到的条目数 */
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of useAgentStore.getState().agents) {
      counts[a.source] = (counts[a.source] || 0) + 1;
    }
    for (const s of useSkillStore.getState().skills) {
      counts[s.source] = (counts[s.source] || 0) + 1;
    }
    return counts;
  }, [useAgentStore((s) => s.agents), useSkillStore((s) => s.skills)]);

  return (
    <div className="max-w-2xl space-y-6 pb-8">
      {/* 来源启用 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Folder className="text-primary h-[18px] w-[18px]" />
            <CardTitle className="text-base">Agent / Skill 来源</CardTitle>
          </div>
          <CardDescription>
            开启后会自动扫描对应目录下的 .md / .json 文件,作为只读 Agent / Skill 加载
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {TOGGLE_ITEMS.map((item) => {
            const enabled = readEnabled(config, item.source);
            const Icon = item.icon;
            return (
              <div
                className="flex items-center justify-between rounded-lg border p-3"
                key={item.source}
              >
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                    <Icon className="text-primary h-[16px] w-[16px]" />
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-sm">{item.desc}</p>
                    <p className="text-muted-foreground text-xs">
                      当前: {enabled ? item.enabledText : '未启用'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={loading || refreshing}
                    onClick={() => handleScanDirectory(item.source)}
                    size="sm"
                    variant="outline">
                    <FolderOpen className="mr-1 h-[14px] w-[14px]" />
                    扫描
                  </Button>
                  <Button
                    disabled={loading}
                    onClick={() => handleToggle(item.source)}
                    size="sm"
                    variant={enabled ? 'default' : 'outline'}>
                    {enabled ? '已开启' : '已关闭'}
                  </Button>
                </div>
              </div>
            );
          })}
          {scanError && (
            <p className="text-destructive mt-2 text-xs">{scanError}</p>
          )}
        </CardContent>
      </Card>

      {/* 显示选项 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="text-primary h-[18px] w-[18px]" />
            <CardTitle className="text-base">显示选项</CardTitle>
          </div>
          <CardDescription>控制 Agent / Skill 列表中的来源标签显示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">显示来源标签</p>
              <p className="text-muted-foreground text-sm">
                在 Agent / Skill 名称后追加 (source) 标签(如 coder (claude))
              </p>
            </div>
            <Button
              disabled={loading}
              onClick={() => setShowSourceLabel(!config.showSourceLabel)}
              size="sm"
              variant={config.showSourceLabel ? 'default' : 'outline'}>
              {config.showSourceLabel ? '已开启' : '已关闭'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 统计 + 手动刷新 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="text-primary h-[18px] w-[18px]" />
            <CardTitle className="text-base">加载状态</CardTitle>
          </div>
          <CardDescription>按来源统计当前已加载条目数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(
            ['system', 'user-db', 'project', 'user', 'claude-project', 'claude-user'] as Source[]
          ).map((s) => (
            <div
              className="text-muted-foreground flex items-center justify-between text-sm"
              key={s}>
              <span>({SOURCE_LABELS[s]}) {s}</span>
              <span className="font-mono">{sourceCounts[s] || 0} 条</span>
            </div>
          ))}
          <div className="pt-2">
            <Button
              disabled={refreshing}
              onClick={handleRescan}
              size="sm"
              variant="outline">
              <RefreshCw className={`mr-2 h-[16px] w-[16px] ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '刷新中...' : '重新扫描'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
