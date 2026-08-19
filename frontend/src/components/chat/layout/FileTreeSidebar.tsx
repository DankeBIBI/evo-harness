import { cn } from '@/lib/utils';
import { File, FileSearch, FolderTree, PanelRightClose, PanelRightOpen, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { FilePreview } from '@/components/file/FilePreview';
import { ProjectSelector } from '@/components/file/ProjectSelector';
import { useLayoutStore } from '@/stores/layoutStore';

import type { FileChange } from '@/components/editor/CodeReviewPanel';
import { FileChangesBar } from '@/components/chat/panels/FileChangesBar';

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
  const collapsed = useLayoutStore((s) => s.rightCollapsed);
  const toggleCollapsed = useLayoutStore((s) => s.toggleRightCollapsed);
	useAutoSwitchToFilesTab(projectPath, setTab);

	// (2026-08-18) 变更 tab 角标数
	const changeCount = changes?.length ?? 0;

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
					onClick={toggleCollapsed}
				/>
				<RightIconBarButton
					icon={FolderTree}
					label="文件"
					onClick={toggleCollapsed}
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
            'text-xs transition-colors duration-150',
            tab === 'changes'
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setTab('changes')}
          type="button"
        >
          变更
        </button>
        <button
          className={cn(
            'text-xs transition-colors duration-150',
            tab === 'files'
              ? 'text-foreground font-medium'
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
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            size="icon"
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
          <>
            {/* 上半:文件树(有预览时压缩到 50%, 无预览时占满) */}
            <div className={cn('min-h-0 overflow-hidden', previewPath ? 'h-1/2' : 'h-full')}>
              <ProjectSelector
                onFileSelect={(path, content) => {
                  // 单击 = 预览(不弹回填, 避免误触)
                  setPreviewPath(path);
                  void content; // 暂时不读 content, 预览走 FilePreview 自己读
                }}
                onProjectChange={(path) => onProjectPathChange?.(path)}
                projectPath={projectPath}
              />
            </div>

            {/* 下半:预览(只在有 previewPath 时渲染) */}
            {previewPath && (
              <div className="min-h-0 flex-1 p-2 pt-0">
                <FilePreview
                  filePath={previewPath}
                  onClose={() => setPreviewPath(null)}
                />
              </div>
            )}
          </>
        ) : (
          /* "变更" tab: 展示 FileChangesBar(由 ChatWindow 注入 props) */
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {changes && changes.length > 0 ? (
              <FileChangesBar
                changes={changes}
                expanded={expanded ?? false}
                onDiscard={onDiscard}
                onDiscardAll={onDiscardAll}
                onExpandedChange={onExpandedChange}
                onKeep={onKeep}
                onKeepAll={onKeepAll}
                onOpenDiff={onOpenDiff}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  暂无文件变更。AI 修改文件后, 变更会出现在这里。
                </p>
              </div>
            )}
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
