import { LazyAgentGraph } from '@/components/agent/LazyAgentGraph';
import { useAnalysisStore } from '@/stores/analysisStore';
import {
  listDirectories,
  pickDirectory,
  type DirectoryEntry,
} from '@/lib/fs/directory-handle';
import { analyzeProject } from '@/lib/fs/scanner';
import { ChevronLeft, FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

/** 目录栈,支持回退到父目录 */
interface DirectoryNode {
  entry: DirectoryEntry;
  handle: FileSystemDirectoryHandle;
}

export default function ProjectAnalysisPage() {
  const {
    analysis,
    directories,
    error,
    loading,
    setAnalysis,
    setCurrentPath,
    setDirectories,
    setError,
    setLoading,
    setRootHandle,
    mountToAgentStore,
    mountToSkillStore,
  } = useAnalysisStore();

  const [pathStack, setPathStack] = useState<DirectoryNode[]>([]);
  const [currentLabel, setCurrentLabel] = useState('');
  const [rootHandle, setLocalRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  /** 当前所在目录 handle(分析当前目录用) */
  const [currentHandle, setCurrentHandle] = useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    return () => {
      setAnalysis(null);
      setRootHandle(null);
    };
  }, [setAnalysis, setRootHandle]);

  const handleSetRoot = (handle: FileSystemDirectoryHandle | null) => {
    setLocalRootHandle(handle);
    setRootHandle(handle);
  };

  const loadRoot = async () => {
    try {
      setLoading(true);
      const handle = await pickDirectory();
      if (!handle) return;
      handleSetRoot(handle);
      setCurrentLabel(handle.name);
      setCurrentHandle(handle);
      const entries = (await listDirectories(handle)).map((e) => ({ ...e, size: 0 }));
      setDirectories(entries);
      setPathStack([]);
    } catch (err) {
      setError(`选择目录失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const loadChild = async (entry: DirectoryEntry) => {
    if (!rootHandle) return;
    setLoading(true);
    try {
      const handle = await rootHandle.getDirectoryHandle(entry.name);
      const entries = (await listDirectories(handle)).map((e) => ({ ...e, size: 0 }));
      setPathStack((prev) => [...prev, { entry, handle }]);
      setCurrentLabel([...pathStack.map((n) => n.entry.name), entry.name].join('/'));
      setCurrentHandle(handle);
      setDirectories(entries);
    } catch (err) {
      setError(`加载目录失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = async () => {
    if (pathStack.length === 0) {
      handleSetRoot(null);
      setDirectories([]);
      setCurrentLabel('');
      setCurrentHandle(null);
      return;
    }
    const next = pathStack.slice(0, -1);
    setPathStack(next);
    if (next.length === 0 && rootHandle) {
      setCurrentLabel(rootHandle.name);
      setCurrentHandle(rootHandle);
      setDirectories((await listDirectories(rootHandle)).map((e) => ({ ...e, size: 0 })));
    } else {
      const parent = next[next.length - 1];
      setCurrentLabel(next.map((n) => n.entry.name).join('/'));
      setCurrentHandle(parent.handle);
      setDirectories((await listDirectories(parent.handle)).map((e) => ({ ...e, size: 0 })));
    }
  };

  /** 分析当前所在目录(当前目录为 .claude 或含 .claude 子目录时有效) */
  const handleAnalyzeCurrent = async () => {
    if (!currentHandle) return;
    setLoading(true);
    try {
      let target: FileSystemDirectoryHandle = currentHandle;
      // 当前目录不是 .claude 且含 .claude 子目录 → 进入子目录扫
      if (currentHandle.name !== '.claude') {
        try {
          target = await currentHandle.getDirectoryHandle('.claude');
        } catch {
          // 无 .claude 子目录,直接扫当前目录
        }
      }
      const result = await analyzeProject(target);
      setAnalysis(result);
      setCurrentPath(`/${target.name}/.claude`);
    } catch (err) {
      setError(`分析失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (dir: DirectoryEntry) => {
    if (!dir.hasClair || !rootHandle) return;
    setLoading(true);
    try {
      const dirHandle = await rootHandle.getDirectoryHandle(dir.name);
      // .claude 目录本身即配置根,直接扫;否则进入其 .claude 子目录
      const clairSub = dir.name === '.claude'
        ? dirHandle
        : await dirHandle.getDirectoryHandle('.claude');
      const result = await analyzeProject(clairSub);
      setAnalysis(result);
      setCurrentPath(`/${dir.name}/.claude`);
    } catch (err) {
      setError(`分析失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMountToStores = async () => {
    setLoading(true);
    try {
      await mountToAgentStore();
      await mountToSkillStore();
    } catch (err) {
      setError(`挂载失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">AI 集成项目管理</h1>
        <p className="text-muted-foreground text-sm">
          选择包含 .claude 目录的项目，自动导入 Skills、Agents 和 Rules
        </p>
      </div>

      <div className="bg-card rounded-2xl p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="text-primary" />
            <h2 className="text-lg font-semibold text-foreground">选择项目</h2>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <button
              className="hover:text-foreground rounded-xl px-3 py-1 transition-colors hover:bg-muted/50"
              onClick={loadRoot}
            >
              {rootHandle ? '重新选择' : '选择目录'}
            </button>
            <button
              className="hover:text-foreground flex items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-muted/50 disabled:opacity-30"
              disabled={!rootHandle}
              onClick={handleGoBack}
              title="返回上级"
            >
              <ChevronLeft className="" />
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <div className="bg-muted text-muted-foreground flex-1 truncate rounded-xl px-3 py-2 font-mono text-xs">
            {currentLabel || '尚未选择目录'}
          </div>
        </div>

        {rootHandle && (
          <div className="mb-4 flex items-center gap-2">
            <button
              className="bg-primary hover:bg-primary/90 flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors disabled:opacity-40"
              disabled={loading}
              onClick={handleAnalyzeCurrent}
            >
              <Sparkles className="h-[12px] w-[12px]" />
              分析当前目录
            </button>
            <span className="text-muted-foreground text-xs">
              当前目录为 .claude 配置根或含 .claude 子目录时可用
            </span>
          </div>
        )}

        {!rootHandle ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            点击「选择目录」授权访问本地文件夹
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {directories?.map((dir) => (
              <div className="flex items-center gap-2" key={dir.path}>
                <button
                  className="hover:bg-accent flex flex-1 items-center gap-3 rounded-xl bg-muted/30 p-3 text-left transition-colors disabled:opacity-50"
                  disabled={loading}
                  onClick={() => loadChild(dir)}
                >
                  {loading ? (
                    <Loader2 className="text-muted-foreground animate-spin" />
                  ) : (
                    <FolderOpen
                      className={`${dir.hasClair ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{dir.name}</div>
                    {dir.hasClair && (
                      <div className="text-primary flex items-center gap-1 text-xs">
                        .claude
                      </div>
                    )}
                  </div>
                </button>
                {dir.hasClair && (
                  <button
                    className="bg-primary hover:bg-primary/90 flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium text-primary-foreground transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAnalyze(dir);
                    }}
                  >
                    <Sparkles className="h-[12px] w-[12px]" />
                    分析
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-destructive mt-4 text-sm">{error}</p>}
      </div>

      {analysis && (
        <div className="bg-card mt-6 rounded-2xl shadow-soft p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">分析结果</h2>
            <div className="flex gap-2">
              <button
                className="bg-primary/10 text-primary hover:bg-primary/20 rounded-lg px-3 py-1 text-sm transition-colors"
                onClick={handleMountToStores}
              >
                挂载到 Agent/Skill
              </button>
              <button
                className="text-muted-foreground hover:text-foreground rounded-lg px-2 py-1 text-sm transition-colors hover:bg-muted/50"
                onClick={() => setAnalysis(null)}
              >
                关闭
              </button>
            </div>
          </div>

          {analysis.skills?.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-foreground">
                Skills ({analysis.skills.length})
              </h3>
              <div className="flex flex-col gap-3">
                {analysis.skills.map((skill: any, idx: number) => (
                  <div className="bg-muted/50 rounded-xl p-4" key={idx}>
                    <div className="text-sm font-medium text-foreground">{skill.name}</div>
                    {skill.description && (
                      <p className="text-muted-foreground mt-1 text-xs">{skill.description}</p>
                    )}
                    {skill.type && (
                      <span className="bg-primary/10 text-primary mt-2 inline-block rounded-lg px-2 py-0.5 text-xs">
                        {skill.type}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.agents?.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-foreground">
                Agents ({analysis.agents.length})
              </h3>
              <div className="mb-4 rounded-2xl bg-muted/30 p-4">
                <LazyAgentGraph agents={analysis.agents} />
              </div>
              <div className="flex flex-col gap-3">
                {analysis.agents.map((agent: any, idx: number) => (
                  <div className="bg-muted/50 rounded-xl p-4" key={idx}>
                    <div className="text-sm font-medium text-foreground">{agent.name}</div>
                    {agent.description && (
                      <p className="text-muted-foreground mt-1 text-xs">{agent.description}</p>
                    )}
                    {agent.role && (
                      <span className="bg-accent/50 mt-2 inline-block rounded-lg px-2 py-0.5 text-xs">
                        {agent.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.rules?.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-foreground">
                Rules ({analysis.rules.length})
              </h3>
              <div className="flex flex-col gap-3">
                {analysis.rules.map((rule: any, idx: number) => (
                  <div className="bg-muted/50 rounded-xl p-4" key={idx}>
                    <div className="text-sm font-medium text-foreground">{rule.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.skills?.length === 0 &&
            analysis.agents?.length === 0 &&
            analysis.rules?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                未找到 Skills、Agents 或 Rules 配置
              </p>
            )}
        </div>
      )}
    </div>
  );
}