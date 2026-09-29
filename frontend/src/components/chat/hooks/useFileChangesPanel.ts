import { useCallback, useState } from 'react';

import type { FileChange } from '@/components/editor/CodeReviewPanel';
import { useFileReviewStore } from '@/stores/fileReviewStore';

/** 触发 CodeDiffViewer 弹窗的参数 */
export interface OpenDiffPayload {
  filePath: string;
  newContent: string;
  originalContent: string;
}

/**
 * 写回文件原内容 —— 把 AI 已落盘的修改回滚到 originalContent
 * 返回 true 表示写回成功, false 表示失败(文件不存在 / 权限不足等)
 */
async function rollbackFile(change: FileChange): Promise<boolean> {
  try {
    const { WriteFile } = await import('@/lib/hostServices/FileService');
    await WriteFile(change.filePath, change.originalContent);
    return true;
  } catch {
    return false;
  }
}

/**
 * useFileChangesPanel —— 文件变更面板状态聚合
 *
 * 用途：把"文件变更"面板的状态/回调从 ChatWindow 抽出来
 *   - 状态: reviewChanges (变更列表) + fileChangesExpanded (展开/折叠)
 *   - 回调: 4 个 keep/discard handler + onOpenDiff
 *   - 暴露 setReviewChanges: 供 ChatWindow 的 onToolCallUpdated / applyCodeChanges 回调推入新变更
 *
 * 触发：P1-2 (2026-07-10) 把 FileChangesBar 从中间底部移到右侧 "变更" tab 后抽取
 */
export function useFileChangesPanel(params: {
  /** 反馈提示回调 —— ChatWindow 注入 addChatFeedback */
  onFeedback: (text: string) => void;
  /** 打开 diff 弹窗 —— ChatWindow 桥接给 setPendingCodeChange */
  onOpenDiff: (payload: OpenDiffPayload) => void;
}) {
  const { onFeedback, onOpenDiff } = params;
  // 2026-08-31: 状态改用 fileReviewStore 共享,这样左栏 SessionSidebar 也能订阅
  const reviewChanges = useFileReviewStore((s) => s.changes);
  const setReviewChanges = useFileReviewStore((s) => s.setChanges);
  const [fileChangesExpanded, setFileChangesExpanded] = useState(false);

  /** 单文件保留 —— 从 reviewChanges 移除(AI 已落盘的变更留在盘上, 仅清除记录) */
  const handleKeepFileChange = useCallback(
    (change: FileChange) => {
      setReviewChanges((prev) => prev.filter((c) => c.id !== change.id));
      onFeedback(`已保留 ${change.filePath}`);
    },
    [onFeedback],
  );

  /** 单文件丢弃 —— 写回 originalContent + 从 reviewChanges 移除(回滚变更) */
  const handleDiscardFileChange = useCallback(
    async (change: FileChange) => {
      const ok = await rollbackFile(change);
      if (ok) {
        setReviewChanges((prev) => prev.filter((c) => c.id !== change.id));
        onFeedback(`已回滚 ${change.filePath}`);
      } else {
        onFeedback(`回滚失败: ${change.filePath}`);
      }
    },
    [onFeedback],
  );

  /** 全部保留 —— 清空 reviewChanges */
  const handleKeepAllFileChanges = useCallback(() => {
    setReviewChanges([]);
    onFeedback('已保留所有变更');
  }, [onFeedback]);

  /** 全部丢弃 —— 顺序写回所有 originalContent + 清空 reviewChanges */
  const handleDiscardAllFileChanges = useCallback(async () => {
    const allChanges = reviewChanges;
    let successCount = 0;
    let failCount = 0;
    for (const change of allChanges) {
      if (await rollbackFile(change)) {
        successCount += 1;
      } else {
        failCount += 1;
      }
    }
    setReviewChanges([]);
    onFeedback(
      `已回滚 ${successCount} 个文件${failCount > 0 ? `, ${failCount} 个失败` : ''}`,
    );
  }, [reviewChanges, onFeedback]);

  /** 点击文件行触发 —— 桥接给 onOpenDiff */
  const handleOpenDiff = useCallback(
    (change: FileChange) => {
      onOpenDiff({
        filePath: change.filePath,
        newContent: change.newContent,
        originalContent: change.originalContent,
      });
    },
    [onOpenDiff],
  );

  return {
    changes: reviewChanges,
    expanded: fileChangesExpanded,
    onDiscard: handleDiscardFileChange,
    onDiscardAll: handleDiscardAllFileChanges,
    onExpandedChange: setFileChangesExpanded,
    onKeep: handleKeepFileChange,
    onKeepAll: handleKeepAllFileChanges,
    onOpenDiff: handleOpenDiff,
    setReviewChanges,
  };
}

export type UseFileChangesPanelResult = ReturnType<typeof useFileChangesPanel>;
