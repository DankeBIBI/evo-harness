import { cn } from '@/lib/utils';
import { File, FileSearch, FolderTree, PanelRightClose, PanelRightOpen, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { FilePreview } from '@/components/file/FilePreview';
import { ProjectSelector } from '@/components/file/ProjectSelector';
import { useLayoutStore } from '@/stores/layoutStore';
import { useFileReviewStore } from '@/stores/fileReviewStore';

import type { FileChange } from '@/components/editor/CodeReviewPanel';
import { CodeReviewPanel } from '@/components/editor/CodeReviewPanel';

type SidebarTab = 'changes' | 'files';

/** 选择项目后自动切到 files tab，让用户立即看到文件树
 * 仅在 projectPath 发生变化时触发；用户后续手动切回 changes tab 不会被强制拉回 */
function useAutoSwitchToFilesTab(
	projectPath: string | undefined,
	setTab: (tab: SidebarTab) => void,
) {
	/** 初始值故意等于 projectPath,避免首次 mount 时强制覆盖 tab(用户已手动选的 tab 不会被无意义重置) */
	const prevPathRef = useRef<string | undefined>(projectPath);
	useEffect(() => {
		if (projectPath && projectPath !== prevPathRef.current) {
			setTab('files');
		}
		prevPathRef.current = projectPath;
	}, [projectPath, setTab]);
}

/**
 * FileTreeSidebar — 右栏(变更 / 文件 双 tab)
 *
 * P1-2 调整 (2026-07-10): 把"文件变更"从中间底部移到右侧 "变更" tab
 *   - "变更" tab: 嵌入 FileChangesBar(由 ChatWindow 注入 props)
 *   - "文件" tab: 嵌入 ProjectSelector + FilePreview
 */
export function FileTreeSidebar({
  changes,
  expanded,
  onDiscard,
  onDiscardAll,
  onExpandedChange,
  onFileContentToInput,
  onKeep,
  onKeepAll,
  onOpenDiff,
  onProjectPathChange,
  projectPath,
}: {
  /** FileChangesBar 注入 —— AI 已落盘的变更列表 */
  changes?: FileChange[];
  /** FileChangesBar 展开/折叠受控 */
  expanded?: boolean;
  /** 单文件丢弃 —— 写回 originalContent + 从记录移除 */
  onDiscard?: (change: FileChange) => void;
  /** 全部丢弃 —— 批量回滚 */
  onDiscardAll?: () => void;
  /** 展开/折叠回调 */
  onExpandedChange?: (expanded: boolean) => void;
  /** 右栏双击文件时回填到聊天输入框(由 ChatWindow 注入) */
  onFileContentToInput?: (path: string, content: string) => void;
  /** 单文件保留 —— 从记录移除 */
  onKeep?: (change: FileChange) => void;
  /** 全部保留 —— 清空记录 */
  onKeepAll?: () => void;
  /** 点击文件行触发 —— 打开 diff 弹窗 */
  onOpenDiff?: (change: FileChange) => void;
  /** 右栏切换项目目录后同步到 useChatProject(由 ChatWindow 注入) */
  onProjectPathChange?: (path: string) => void;
  projectPath?: string;
}) {
  const [tab, setTab] = useState<SidebarTab>('changes');
  /** 当前预览中的文件路径(无则下半显示空状态) */
  const [previewPath, setPreviewPath] = useState<null | string>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [treeRatio, setTreeRatio] = useState(58);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitDragRef = useRef(false);
  const collapsed = useLayoutStore((s) => s.rightCollapsed);
  const toggleCollapsed = useLayoutStore((s) => s.toggleRightCollapsed);
  // 2026-08-31: 直接订阅 fileReviewStore,右栏"变更"tab 渲染 CodeReviewPanel
  const reviewChanges = useFileReviewStore((s) => s.changes);
  const setReviewChanges = useFileReviewStore((s) => s.setChanges);
  /** 接受变更 —— 写盘 + 更新 status */
  const handleAcceptChange = useCallback(
    async (change: FileChange) => {
      try {
        const { WriteFile } = await import('@/lib/hostServices/FileService');
        await WriteFile(change.filePath, change.newContent);
        setReviewChanges((prev) =>
          prev.map((c) =>
            c.id === change.id ? { ...c, status: 'accepted' as const } : c,
          ),
        );
        // TODO: 走 store + 统一 toast(目前 ChatWindow 通过 addChatFeedback 显示)
        // 此处先打 devLog,等 store toast 接入后改走 store
        const { devLog } = await import('@/lib/devLog');
        devLog.i('file-review', `已接受: ${change.filePath}`);
      } catch (error) {
        const { devLog } = await import('@/lib/devLog');
        devLog.e('file-review', `保存失败: ${String(error)}`);
      }
    },
    [setReviewChanges],
  );
  /** 拒绝变更 —— 写回 originalContent + 更新 status */
  const handleRejectChange = useCallback(
    async (change: FileChange) => {
      try {
        const { WriteFile } = await import('@/lib/hostServices/FileService');
        await WriteFile(change.filePath, change.originalContent);
        setReviewChanges((prev) =>
          prev.map((c) =>
            c.id === change.id ? { ...c, status: 'rejected' as const } : c,
          ),
        );
      } catch {
        const { devLog } = await import('@/lib/devLog');
        devLog.e('file-review', `回滚失败: ${change.filePath}`);
      }
    },
    [setReviewChanges],
  );
	useAutoSwitchToFilesTab(projectPath, setTab);

	// (2026-08-18) 变更 tab 角标数
	const changeCount = reviewChanges.length;

  const handleSplitPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    splitDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);
  const handleSplitPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!splitDragRef.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const next = ((event.clientY - rect.top) / rect.height) * 100;
    setTreeRatio(Math.max(25, Math.min(78, next)));
  }, []);
  const stopSplitDrag = useCallback(() => {
    splitDragRef.current = false;
  }, []);

	return (
		<aside
			className={cn(
				'border-border/70 bg-card group flex h-full w-full shrink-0 flex-col rounded-lg border',
			)}
			data-collapsed={collapsed ? 'true' : 'false'}
		>
			{/* ───── 图标条模式 (VS Code Activity Bar 风格) ───── */}
			<nav
				aria-label="右栏快捷入口"
				className={cn(
					'flex h-full w-full flex-col items-center gap-1 px-1 py-2',
					'group-data-[collapsed=false]:hidden',
				)}>
				<RightIconBarButton
					badge={changeCount > 0 ? changeCount : undefined}
					icon={FileSearch}
					label="变更"
          onClick={() => {
            setTab('changes');
            toggleCollapsed();
          }}
				/>
				<RightIconBarButton
					icon={FolderTree}
					label="文件"
          onClick={() => {
            setTab('files');
            toggleCollapsed();
          }}
				/>
				<div className="mt-auto flex w-full flex-col items-center gap-1">
					<div className="bg-border/60 h-px w-6" />
					<RightIconBarButton
						icon={PanelRightOpen}
						label="展开右栏"
						onClick={toggleCollapsed}
					/>
				</div>
			</nav>

			{/* ───── 完整模式 (原行为) ───── */}
			<div
				className={cn(
					'flex h-full w-full min-w-0 flex-col',
					'group-data-[collapsed=true]:hidden',
				)}>
      <div className="flex h-10 shrink-0 items-center gap-3 px-3">
        <button
          className={cn(
            'relative flex h-full items-center gap-1 text-xs transition-colors duration-150 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
            tab === 'changes'
              ? 'text-foreground font-medium after:bg-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setTab('changes')}
          type="button"
        >
          变更
      {changeCount > 0 && (
      <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] tabular-nums">
        {changeCount > 99 ? '99+' : changeCount}
      </span>
      )}
        </button>
        <button
          className={cn(
			'relative flex h-full items-center text-xs transition-colors duration-150 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
            tab === 'files'
			  ? 'text-foreground font-medium after:bg-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setTab('files')}
          type="button"
        >
          文件
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            aria-label="搜索"
      className={cn(
        'text-muted-foreground hover:text-foreground h-6 w-6',
        searchOpen && tab === 'files' && 'bg-accent text-accent-foreground',
      )}
      onClick={() => {
        setTab('files');
        setSearchOpen((value) => !value);
      }}
            size="icon"
      title="搜索项目文件"
            variant="ghost"
          >
            <Search className="h-[14px] w-[14px]" />
          </Button>
          <Button
            aria-label="折叠为图标条"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={toggleCollapsed}
            size="icon"
            title="折叠为图标条"
            variant="ghost"
          >
            <PanelRightClose className="h-[14px] w-[14px]" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'files' ? (
		  <div className="flex min-h-0 flex-1 flex-col" ref={splitContainerRef}>
            {/* 上半:文件树(有预览时压缩到 50%, 无预览时占满) */}
			<div
			  className="min-h-0 overflow-hidden"
			  style={{ height: previewPath ? `${treeRatio}%` : '100%' }}>
              <ProjectSelector
                onFileSelect={(path, content) => {
                  // 单击 = 预览(不弹回填, 避免误触)
                  setPreviewPath(path);
                  void content; // 暂时不读 content, 预览走 FilePreview 自己读
                }}
                onProjectChange={(path) => onProjectPathChange?.(path)}
        onFileInsert={(path, content) => onFileContentToInput?.(path, content)}
        onSearchOpenChange={setSearchOpen}
                projectPath={projectPath}
        searchOpen={searchOpen}
        selectedPath={previewPath}
              />
            </div>

            {/* 下半:预览(只在有 previewPath 时渲染) */}
            {previewPath && (
        <>
        <div
          aria-label="调整文件树和预览高度"
          className="group flex h-2 shrink-0 touch-none cursor-row-resize items-center px-2"
          onDoubleClick={() => setTreeRatio(58)}
          onPointerCancel={stopSplitDrag}
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={stopSplitDrag}
          role="separator"
          title="拖动调整预览高度 · 双击恢复">
          <div className="bg-border group-hover:bg-primary/60 h-px w-full transition-colors" />
        </div>
        <div className="min-h-0 flex-1 px-2 pb-2">
                <FilePreview
                  filePath={previewPath}
          onInsert={(path) => onFileContentToInput?.(path, '')}
                  onClose={() => setPreviewPath(null)}
                />
        </div>
        </>
            )}
      </div>
        ) : (
          /* "变更" tab: 2026-08-31 改用 CodeReviewPanel(完整 diff 视图, 接 store) */
          <div className="min-h-0 flex-1">
            <CodeReviewPanel
              changes={reviewChanges}
              onAcceptChange={handleAcceptChange}
              onRejectChange={handleRejectChange}
            />
          </div>
        )}
      </div>
			</div>
    </aside>
  );
}

/**
 * RightIconBarButton — 右栏图标条上的单图标按钮(2026-08-18)
 * 与左栏 IconBarButton 风格一致;支持右上角数字角标(变更数提示)
 */
function RightIconBarButton({
	icon: Icon,
	label,
	onClick,
	badge,
}: {
	icon: typeof File;
	label: string;
	onClick: () => void;
	/** 角标数字(未传或 0 则不显示) */
	badge?: number;
}) {
	return (
		<button
			aria-label={label}
			className={cn(
				'text-muted-foreground hover:bg-accent hover:text-foreground',
				'relative flex h-9 w-9 items-center justify-center rounded-md',
				'transition-colors duration-150',
				'focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none',
			)}
			onClick={onClick}
			title={label}
			type="button">
			<Icon className="h-[18px] w-[18px]" />
			{badge !== undefined && badge > 0 && (
				<span
					aria-label={`${badge} 项`}
					className={cn(
						'bg-primary text-primary-foreground',
						'absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1',
						'rounded-full text-[10px] font-medium leading-[16px]',
						'flex items-center justify-center tabular-nums',
					)}>
					{badge > 99 ? '99+' : badge}
				</span>
			)}
		</button>
	);
}
