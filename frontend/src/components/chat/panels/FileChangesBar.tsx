import {
    Check,
    ChevronDown,
    ChevronRight,
    FileCode,
    Folder,
    FolderOpen,
    Undo2,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { FileChange } from "@/components/editor/CodeReviewPanel";

import { Badge } from "@/components/ui/Badge";

import { diffWithStats } from "../lib/diff";
import {
    buildFileTree,
    countFilesRecursive,
    PATH_SEP_RE,
    type TreeNode,
} from "../lib/fileTree";

interface FileChangesBarProps {
    changes: FileChange[];
    /** 受控的展开/折叠状态(由父组件管理) */
    expanded: boolean;
    /**
     * 点击文件行触发:由父组件决定如何打开 diff(本组件只触发,不持有 modal 状态)
     * 2026-07-10: 改为 optional, 与 onKeep/onDiscard 契约一致
     */
    onOpenDiff?: (change: FileChange) => void;
    /**
     * 受控的展开/折叠回调(由父组件管理)
     * 2026-07-10: 改为 optional, 与 onKeep/onDiscard 契约一致
     */
    onExpandedChange?: (expanded: boolean) => void;
    /**
     * "保留" 变更: 从记录中移除(不变更文件, 仅 UI 状态变更)
     * 2026-07-06 P1-2 新增: AI 已落盘的变更也能从记录中清除, 不修改文件
     */
    onKeep?: (change: FileChange) => void;
    /**
     * "丢弃" 变更: 写回 originalContent + 从记录中移除
     * 2026-07-06 P1-2 新增: 回滚 AI 已经落盘的修改
     */
    onDiscard?: (change: FileChange) => void;
    /** summary 头部 "全部保留" 回调: 对所有 pending change 调 onKeep */
    onKeepAll?: () => void;
    /** summary 头部 "全部丢弃" 回调: 对所有 pending change 调 onDiscard */
    onDiscardAll?: () => void;
}

/**
 * 文件变更栏 —— 挂载在 ChatInput 上方
 * - 默认折叠为单行 summary: 文件数徽标 + 总 +/- 行数
 * - 展开后按目录树展示,文件行可点击触发 onOpenDiff
 * - 已接受/已拒绝的文件行用透明度 + ✓/✗ 标记区分(与 CodeReviewPanel 语义一致)
 * - 行数统计使用 LCS 真 diff(与 CodeReviewPanel 数值完全一致)
 */
export function FileChangesBar({
    changes,
    expanded,
    onDiscard,
    onDiscardAll,
    onExpandedChange,
    onKeep,
    onKeepAll,
    onOpenDiff,
}: FileChangesBarProps) {
    const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

    // 文件路径 -> 原始 FileChange 的查表(回调时用,避免反复扫描数组)
    const changeByPath = useMemo(() => {
        const map = new Map<string, FileChange>();
        for (const c of changes) map.set(c.filePath, c);
        return map;
    }, [changes]);

    // 每个 change 的真实 +/- 行数(基于 LCS diff,与 CodeReviewPanel 同源算法)
    const statsByPath = useMemo(() => {
        const map = new Map<string, { added: number; removed: number }>();
        for (const c of changes) {
            map.set(
                c.filePath,
                diffWithStats(c.originalContent, c.newContent).stats,
            );
        }
        return map;
    }, [changes]);

    // 文件状态查表(accepted/rejected/pending 用于文件行视觉区分)
    const statusByPath = useMemo(() => {
        const map = new Map<string, FileChange["status"]>();
        for (const c of changes) map.set(c.filePath, c.status);
        return map;
    }, [changes]);

    // 总 +/- 行数(单次 reduce,O(n))
    const totalStats = useMemo(
        () =>
            changes.reduce(
                (acc, c) => {
                    const s = statsByPath.get(c.filePath) ?? acc;
                    acc.added += s.added;
                    acc.removed += s.removed;
                    return acc;
                },
                { added: 0, removed: 0 },
            ),
        [changes, statsByPath],
    );

    // 待确认数量
    const pendingCount = useMemo(
        () => changes.filter((c) => c.status === "pending").length,
        [changes],
    );

    // 树状结构
    const tree = useMemo(() => buildFileTree(changes), [changes]);

    const handleToggleDir = (path: string) => {
        setCollapsedDirs((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const handleToggleBar = () => {
        onExpandedChange?.(!expanded);
    };

    const handleOpenFile = (filePath: string) => {
        const target = changeByPath.get(filePath);
        if (target) onOpenDiff?.(target);
    };

    /** 2026-07-06 P1-2: 单文件保留/丢弃 — 阻止冒泡避免触发 onOpenFile */
    const handleKeep = (
        e: React.MouseEvent,
        filePath: string,
    ) => {
        e.stopPropagation();
        const target = changeByPath.get(filePath);
        if (target) onKeep?.(target);
    };
    const handleDiscard = (
        e: React.MouseEvent,
        filePath: string,
    ) => {
        e.stopPropagation();
        const target = changeByPath.get(filePath);
        if (target) onDiscard?.(target);
    };

    if (changes.length === 0) return null;

    return (
        <div className="mb-2 overflow-hidden rounded-lg border border-border/70 bg-card">
            {/* ── Summary Bar(始终可见,可点击折叠/展开) ── */}
            <button
                aria-expanded={expanded}
                className="hover:bg-muted/40 flex h-[40px] w-full items-center justify-between gap-2 rounded-none border-0 px-3 text-left text-xs font-normal transition-colors duration-150"
                onClick={handleToggleBar}
                type="button"
            >
                <div className="flex min-w-0 items-center gap-2">
                    {expanded ? (
                        <ChevronDown className="text-muted-foreground h-[14px] w-[14px] shrink-0" />
                    ) : (
                        <ChevronRight className="text-muted-foreground h-[14px] w-[14px] shrink-0" />
                    )}
                    <FileCode className="text-primary h-[14px] w-[14px] shrink-0" />
                    <span className="truncate font-medium">文件变更</span>
                    <Badge
                        className="bg-primary/15 text-primary hover:bg-primary/15 text-[10px] px-1.5 py-0"
                        variant="secondary"
                    >
                        {changes.length}
                    </Badge>
                    {pendingCount > 0 && pendingCount < changes.length && (
                        <Badge
                            className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 text-[10px] px-1.5 py-0"
                            variant="secondary"
                        >
                            待确认 {pendingCount}
                        </Badge>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-green-600">+{totalStats.added}</span>
                    <span className="text-red-600">-{totalStats.removed}</span>
                </div>
                {/* 2026-07-06 P1-2: 全部保留/丢弃快捷操作(仅在有回调时渲染) */}
                {(onKeepAll || onDiscardAll) && pendingCount > 0 && (
                    <div
                        className="flex shrink-0 items-center gap-1 border-l border-border/40 pl-1.5"
                        onClick={(e) => e.stopPropagation()}>
                        {onKeepAll && (
                            <button
                                aria-label="全部保留"
                                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex h-6 items-center gap-0.5 rounded px-1.5 text-[11px] transition-colors"
                                onClick={() => onKeepAll()}
                                type="button">
                                <Check className="h-[12px] w-[12px]" />
                                <span>保留</span>
                            </button>
                        )}
                        {onDiscardAll && (
                            <button
                                aria-label="全部丢弃"
                                className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10 flex h-6 items-center gap-0.5 rounded px-1.5 text-[11px] transition-colors"
                                onClick={() => onDiscardAll()}
                                type="button">
                                <Undo2 className="h-[12px] w-[12px]" />
                                <span>丢弃</span>
                            </button>
                        )}
                    </div>
                )}
            </button>

            {/* ── 树状详情(展开时渲染) ── */}
            {expanded && (
                <div className="max-h-48 overflow-auto border-t border-border/60 px-2 py-1">
                    <TreeRow
                        collapsedDirs={collapsedDirs}
                        depth={0}
                        fullPath=""
                        node={tree}
                        onDiscard={handleDiscard}
                        onKeep={handleKeep}
                        onOpenFile={handleOpenFile}
                        onToggleDir={handleToggleDir}
                        statsByPath={statsByPath}
                        statusByPath={statusByPath}
                    />
                </div>
            )}
        </div>
    );
}

/** ── 树节点递归渲染 ── */
function TreeRow({
    collapsedDirs,
    depth,
    fullPath,
    node,
    onDiscard,
    onKeep,
    onOpenFile,
    onToggleDir,
    statsByPath,
    statusByPath,
}: {
    collapsedDirs: Set<string>;
    depth: number;
    fullPath: string;
    node: TreeNode;
    onDiscard: (e: React.MouseEvent, filePath: string) => void;
    onKeep: (e: React.MouseEvent, filePath: string) => void;
    onOpenFile: (filePath: string) => void;
    onToggleDir: (path: string) => void;
    statsByPath: Map<string, { added: number; removed: number }>;
    statusByPath: Map<string, FileChange["status"]>;
}) {
    if (node.type === "file") {
        return (
            <FileRow
                depth={depth}
                filePath={node.filePath}
                key={node.filePath}
                onDiscard={onDiscard}
                onKeep={onKeep}
                onOpen={onOpenFile}
                stats={statsByPath.get(node.filePath) ?? { added: 0, removed: 0 }}
                status={statusByPath.get(node.filePath) ?? "pending"}
            />
        );
    }

    // 根目录(name="")不显示外壳,直接渲染子项
    if (depth === 0) {
        return (
            <>
                {Array.from(node.children.entries()).map(([name, child]) => (
                    <TreeRow
                        collapsedDirs={collapsedDirs}
                        depth={depth + 1}
                        fullPath={name}
                        key={name}
                        node={child}
                        onDiscard={onDiscard}
                        onKeep={onKeep}
                        onOpenFile={onOpenFile}
                        onToggleDir={onToggleDir}
                        statsByPath={statsByPath}
                        statusByPath={statusByPath}
                    />
                ))}
            </>
        );
    }

    // 子目录:可折叠,徽标显示递归文件总数
    const isCollapsed = collapsedDirs.has(fullPath);
    const totalFileCount = countFilesRecursive(node);

    return (
        <>
            <button
                className="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs transition-colors duration-150"
                onClick={() => onToggleDir(fullPath)}
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
                type="button"
            >
                {isCollapsed ? (
                    <ChevronRight className="h-[12px] w-[12px] shrink-0" />
                ) : (
                    <ChevronDown className="h-[12px] w-[12px] shrink-0" />
                )}
                {isCollapsed ? (
                    <Folder className="text-muted-foreground h-[12px] w-[12px] shrink-0" />
                ) : (
                    <FolderOpen className="text-muted-foreground h-[12px] w-[12px] shrink-0" />
                )}
                <span className="truncate font-medium">{node.name}</span>
                <span className="text-muted-foreground ml-1 text-[10px]">
                    {totalFileCount} 个文件
                </span>
            </button>
            {!isCollapsed && (
                <>
                    {Array.from(node.children.entries()).map(([name, child]) => (
                        <TreeRow
                            collapsedDirs={collapsedDirs}
                            depth={depth + 1}
                            fullPath={`${fullPath}/${name}`}
                            key={`${fullPath}/${name}`}
                            node={child}
                            onDiscard={onDiscard}
                            onKeep={onKeep}
                            onOpenFile={onOpenFile}
                            onToggleDir={onToggleDir}
                            statsByPath={statsByPath}
                            statusByPath={statusByPath}
                        />
                    ))}
                </>
            )}
        </>
    );
}

/** ── 文件行(叶子节点) ── */
function FileRow({
    depth,
    filePath,
    onDiscard,
    onKeep,
    onOpen,
    stats,
    status,
}: {
    depth: number;
    filePath: string;
    onDiscard: (e: React.MouseEvent, filePath: string) => void;
    onKeep: (e: React.MouseEvent, filePath: string) => void;
    onOpen: (filePath: string) => void;
    stats: { added: number; removed: number };
    status: FileChange["status"];
}) {
    const parts = filePath.split(PATH_SEP_RE);
    const fileName = parts.pop() || filePath;
    const dir = parts.join("/");
    const isDone = status !== "pending";
    const iconColor =
        status === "accepted"
            ? "text-green-600"
            : status === "rejected"
                ? "text-red-600"
                : "text-primary";

    return (
        <button
            aria-label={`查看 ${filePath} 的 diff`}
            className={`hover:bg-muted/50 group flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors duration-150 ${
                isDone ? "opacity-60" : ""
            }`}
            onClick={() => onOpen(filePath)}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            title={`点击查看 ${filePath} 的 diff`}
            type="button"
        >
            <FileCode className={`h-[12px] w-[12px] shrink-0 ${iconColor}`} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{fileName}</div>
                {dir && (
                    <div className="text-muted-foreground truncate text-[10px]">
                        {dir}
                    </div>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
                <span className="text-green-600">+{stats.added}</span>
                <span className="text-red-600">-{stats.removed}</span>
            </div>
            {status === "accepted" && (
                <span className="text-[10px] text-green-600">✓</span>
            )}
            {status === "rejected" && (
                <span className="text-[10px] text-red-600">✗</span>
            )}
            {/* 2026-07-06 P1-2: pending 状态显示保留/丢弃按钮 (hover 显现) */}
            {status === "pending" && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {onKeep && (
                        <span
                            aria-label={`保留 ${filePath}`}
                            className="text-muted-foreground hover:text-green-600 hover:bg-green-500/10 flex h-5 w-5 cursor-pointer items-center justify-center rounded transition-colors"
                            onClick={(e) => onKeep(e, filePath)}
                            role="button">
                            <Check className="h-[11px] w-[11px]" />
                        </span>
                    )}
                    {onDiscard && (
                        <span
                            aria-label={`丢弃 ${filePath}`}
                            className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10 flex h-5 w-5 cursor-pointer items-center justify-center rounded transition-colors"
                            onClick={(e) => onDiscard(e, filePath)}
                            role="button">
                            <X className="h-[11px] w-[11px]" />
                        </span>
                    )}
                </div>
            )}
        </button>
    );
}
