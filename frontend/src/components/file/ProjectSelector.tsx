/**
 * ProjectSelector — 项目文件选择器(右栏"文件" tab 上半部分)
 * - 基于 useProjectFiles:选目录 / 恢复 / 懒加载 / 读文件
 * - 顶部:项目根名 + 选择 / 刷新按钮
 * - 文件树:第一层(响应式 store) + 目录懒加载展开
 * - 文件单击 → onFileSelect(path, content)(由 FileTreeSidebar 预览)
 */

import {
	AlertCircle,
	ChevronRight,
	ChevronsUp,
	File,
	FolderOpen,
	FolderPlus,
	FolderTree,
	MoreHorizontal,
	Loader2,
	RefreshCw,
	Search,
	X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useProjectFiles } from '@/hooks/useProjectFiles';
import {
	loadRootName,
	type ProjectFileItem,
} from '@/lib/fs/project-file-service';
import { cn } from '@/lib/utils';

interface ProjectSelectorProps {
	/** 单击文件 → 预览(由 FileTreeSidebar 控制) */
	onFileSelect?: (path: string, content: string) => void;
	/** 切换项目目录后同步到 useChatProject(由 ChatWindow 注入) */
	onProjectChange?: (path: string) => void;
	/** 当前项目根路径(由外部注入) */
	projectPath?: string;
	/** 当前预览文件，用于树节点高亮。 */
	selectedPath?: string | null;
	/** 双击文件时插入聊天上下文。 */
	onFileInsert?: (path: string, content: string) => void;
	/** 外部标题栏触发搜索。 */
	searchOpen?: boolean;
	onSearchOpenChange?: (open: boolean) => void;
}

const NOISY_ROOT_DIRS = new Set([
	'.git',
	'.idea',
	'.next',
	'.turbo',
	'build',
	'dist',
	'node_modules',
	'target',
]);

export function ProjectSelector({
	onFileSelect,
	onProjectChange,
	projectPath,
	selectedPath,
	onFileInsert,
	searchOpen = false,
	onSearchOpenChange,
}: ProjectSelectorProps) {
	const {
		firstLevel,
		selectProject,
		restoreProject,
		reauthorizeProject,
		getChildren,
		readFileContent,
		searchProjectFiles,
	} = useProjectFiles();
	/** 项目根名(选择 / 恢复后更新) */
	const [rootName, setRootName] = useState<string>(
		() => projectPath || loadRootName(),
	);
	/** 展开的目录集合 */
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
	/** 目录子层缓存(懒加载) */
	const [childrenCache, setChildrenCache] = useState<
		Map<string, ProjectFileItem[]>
	>(new Map());
	/** 加载中的目录集合 */
	const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
	/** 加载失败的目录集合 */
	const [errorDirs, setErrorDirs] = useState<Set<string>>(new Set());
	/** 选择 / 刷新进行中 */
	const [busy, setBusy] = useState(false);
	const [query, setQuery] = useState('');
	const [searching, setSearching] = useState(false);
	const [searchResults, setSearchResults] = useState<ProjectFileItem[]>([]);
	const [showNoisyDirs, setShowNoisyDirs] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const searchRequestRef = useRef(0);

	const visibleFirstLevel = useMemo(
		() =>
			showNoisyDirs
				? firstLevel
				: firstLevel.filter(
						(item) => !item.isDir || !NOISY_ROOT_DIRS.has(item.name.toLowerCase()),
					),
		[firstLevel, showNoisyDirs],
	);
	const noisyRootCount = useMemo(
		() => firstLevel.filter((item) => item.isDir && NOISY_ROOT_DIRS.has(item.name.toLowerCase())).length,
		[firstLevel],
	);

	useEffect(() => {
		if (searchOpen) searchInputRef.current?.focus();
	}, [searchOpen]);

	useEffect(() => {
		const keyword = query.trim();
		const requestId = ++searchRequestRef.current;
		if (!keyword) {
			setSearchResults([]);
			setSearching(false);
			return;
		}
		setSearching(true);
		const timer = window.setTimeout(() => {
			void searchProjectFiles(keyword, 80)
				.then((items) => {
					if (requestId === searchRequestRef.current) setSearchResults(items);
				})
				.catch(() => {
					if (requestId === searchRequestRef.current) setSearchResults([]);
				})
				.finally(() => {
					if (requestId === searchRequestRef.current) setSearching(false);
				});
		}, 180);
		return () => window.clearTimeout(timer);
	}, [query, searchProjectFiles]);

	// 挂载时恢复持久化项目
	useEffect(() => {
		void restoreProject().then((ok) => {
			if (ok) setRootName(loadRootName());
		});
	}, [restoreProject]);

	// 外部切换项目时同步根名并清空树状态
	useEffect(() => {
		if (projectPath) {
			setRootName(projectPath);
			setExpandedDirs(new Set());
			setChildrenCache(new Map());
			setLoadingDirs(new Set());
			setErrorDirs(new Set());
		}
	}, [projectPath]);

	// 选择项目
	const handleSelect = useCallback(async () => {
		setBusy(true);
		try {
			const ok = await selectProject();
			if (ok) {
				setRootName(loadRootName());
				setExpandedDirs(new Set());
				setChildrenCache(new Map());
				setErrorDirs(new Set());
				onProjectChange?.(loadRootName());
			}
		} finally {
			setBusy(false);
		}
	}, [selectProject, onProjectChange]);

	// 刷新:重新授权(升级到 readwrite)并重建第一层
	const handleRefresh = useCallback(async () => {
		setBusy(true);
		try {
			const ok = await reauthorizeProject();
			if (ok) {
				setRootName(loadRootName());
				setExpandedDirs(new Set());
				setChildrenCache(new Map());
				setErrorDirs(new Set());
			}
		} finally {
			setBusy(false);
		}
	}, [reauthorizeProject]);

	// 展开 / 收起目录(懒加载子层)
	const toggleDir = useCallback(
		async (path: string) => {
			const isExpanded = expandedDirs.has(path);
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				if (isExpanded) next.delete(path);
				else next.add(path);
				return next;
			});
			if (!isExpanded && !childrenCache.has(path)) {
				setLoadingDirs((prev) => new Set(prev).add(path));
				setErrorDirs((prev) => {
					const next = new Set(prev);
					next.delete(path);
					return next;
				});
				try {
					const items = await getChildren(path);
					setChildrenCache((prev) => new Map(prev).set(path, items));
				} catch (err) {
					console.warn('加载目录失败:', path, err);
					setChildrenCache((prev) => new Map(prev).set(path, []));
					setErrorDirs((prev) => new Set(prev).add(path));
				} finally {
					setLoadingDirs((prev) => {
						const next = new Set(prev);
						next.delete(path);
						return next;
					});
				}
			}
		},
		[expandedDirs, childrenCache, getChildren],
	);

	// 单击文件 → 读内容 → 预览
	const handleFileClick = useCallback(
		async (path: string) => {
			try {
				const content = await readFileContent(path);
				onFileSelect?.(path, content);
			} catch (err) {
				console.warn('读取文件失败:', path, err);
			}
		},
		[readFileContent, onFileSelect],
	);

	const handleFileInsert = useCallback(
		async (path: string) => {
			try {
				const content = await readFileContent(path);
				onFileInsert?.(path, content);
			} catch (err) {
				console.warn('读取文件失败:', path, err);
			}
		},
		[readFileContent, onFileInsert],
	);

	const closeSearch = useCallback(() => {
		setQuery('');
		setSearchResults([]);
		onSearchOpenChange?.(false);
	}, [onSearchOpenChange]);

	// 递归渲染树节点(普通函数,非组件)
	const renderNode = (item: ProjectFileItem, depth: number) => {
		const indent = { paddingLeft: `${depth * 14 + 6}px` };
		if (item.isDir) {
			const isExpanded = expandedDirs.has(item.path);
			const isLoading = loadingDirs.has(item.path);
			const hasError = errorDirs.has(item.path);
			const children = childrenCache.get(item.path);
			return (
				<div key={item.path}>
					<button
						className="hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex h-7 w-full items-center gap-1 rounded-md pr-1 text-left text-xs focus-visible:ring-1 focus-visible:outline-none"
						draggable
						onClick={() => void toggleDir(item.path)}
						onDragStart={(e) => {
							// 拖拽到 ChatInput:写入 wails 文件路径 MIME,由 ChatInput 识别并插入文件 chip
							e.dataTransfer.setData("application/x-wails-file-path", item.path);
							e.dataTransfer.effectAllowed = "copy";
						}}
						style={indent}
						title={item.path}
						type="button"
					>
						<ChevronRight
							className={cn(
								'text-muted-foreground h-3 w-3 shrink-0 transition-transform',
								isExpanded && 'rotate-90',
							)}
						/>
						{isLoading ? (
							<Loader2 className="text-muted-foreground h-3.5 w-3.5 shrink-0 animate-spin" />
						) : hasError ? (
							<AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
						) : (
							<FolderOpen className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
						)}
						<span className="truncate">{item.name}</span>
					</button>
					{isExpanded && children?.map((child) => renderNode(child, depth + 1))}
				</div>
			);
		}
		return (
			<button
				className={cn(
					'hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex h-7 w-full items-center gap-1.5 rounded-md pr-1 text-left text-xs focus-visible:ring-1 focus-visible:outline-none',
					selectedPath === item.path && 'bg-accent text-accent-foreground',
				)}
				draggable
				key={item.path}
				onClick={() => void handleFileClick(item.path)}
				onDoubleClick={() => void handleFileInsert(item.path)}
				onDragStart={(e) => {
					// 拖拽到 ChatInput:写入 wails 文件路径 MIME,由 ChatInput 识别并插入文件 chip
					e.dataTransfer.setData("application/x-wails-file-path", item.path);
					e.dataTransfer.effectAllowed = "copy";
				}}
				style={indent}
				title={item.path}
				type="button"
			>
				{/* 图标区占位对齐目录行的 chevron+gap(12+4) */}
				<File className="text-muted-foreground ml-[16px] h-3.5 w-3.5 shrink-0" />
				<span className="truncate">{item.name}</span>
			</button>
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/* 顶部:项目名 + 刷新 / 选择 */}
			<div className="border-border/40 flex h-9 shrink-0 items-center gap-1 border-b px-2">
				<FolderTree className="text-muted-foreground h-4 w-4 shrink-0" />
				<span
					className="text-foreground/80 flex-1 truncate text-xs font-medium"
					title={rootName}
				>
					{rootName || '未选择项目'}
				</span>
				<Button
					aria-label="收起全部目录"
					className="text-muted-foreground hover:text-foreground h-6 w-6"
					disabled={expandedDirs.size === 0}
					onClick={() => setExpandedDirs(new Set())}
					size="icon"
					title="收起全部目录"
					variant="ghost"
				>
					<ChevronsUp className="h-3.5 w-3.5" />
				</Button>
				<Button
					aria-label="刷新项目"
					className="text-muted-foreground hover:text-foreground h-6 w-6"
					disabled={busy}
					onClick={handleRefresh}
					size="icon"
					title="刷新"
					variant="ghost"
				>
					<RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
				</Button>
				<Button
					aria-label="选择项目"
					className="text-muted-foreground hover:text-foreground h-6 w-6"
					disabled={busy}
					onClick={handleSelect}
					size="icon"
					title="选择项目文件夹"
					variant="ghost"
				>
					<FolderPlus className="h-3.5 w-3.5" />
				</Button>
			</div>

			{searchOpen && (
				<div className="border-border/40 bg-muted/20 flex h-10 shrink-0 items-center gap-1.5 border-b px-2">
					<Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
					<input
						aria-label="搜索项目文件"
						className="placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-xs outline-none"
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Escape') closeSearch();
						}}
						placeholder="按文件名搜索…"
						ref={searchInputRef}
						value={query}
					/>
					{searching && <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />}
					<Button aria-label="关闭搜索" className="h-6 w-6" onClick={closeSearch} size="icon" variant="ghost">
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			)}

			{/* 文件树 */}
			<div className="min-h-0 flex-1 overflow-auto p-1">
				{rootName ? (
					query.trim() ? (
						searchResults.length > 0 ? (
							searchResults.map((item) => (
								<button
									className={cn(
										'hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
										selectedPath === item.path && 'bg-accent text-accent-foreground',
									)}
									key={item.path}
									onClick={() => void handleFileClick(item.path)}
									onDoubleClick={() => void handleFileInsert(item.path)}
									title={`${item.path}\n双击插入聊天`}
									type="button">
									<File className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-xs">{item.name}</span>
										<span className="text-muted-foreground block truncate text-[10px]">{item.path}</span>
									</span>
								</button>
							))
						) : !searching ? (
							<div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
								没有匹配“{query.trim()}”的文件
							</div>
						) : null
					) : visibleFirstLevel.length > 0 ? (
						<>
							{visibleFirstLevel.map((item) => renderNode(item, 0))}
							{noisyRootCount > 0 && (
								<button
									className="text-muted-foreground hover:bg-muted hover:text-foreground mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px]"
									onClick={() => setShowNoisyDirs((value) => !value)}
									type="button">
									<MoreHorizontal className="h-3.5 w-3.5" />
									{showNoisyDirs ? '隐藏依赖与生成目录' : `显示 ${noisyRootCount} 个隐藏目录`}
								</button>
							)}
						</>
					) : (
						<div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-xs">
							<p>暂无文件,点击右上角刷新重试</p>
						</div>
					)
				) : (
					<div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs">
						<FolderTree className="h-8 w-8 opacity-40" />
						<p>尚未选择项目文件夹</p>
						<Button onClick={handleSelect} size="sm" variant="outline">
							选择项目文件夹
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
