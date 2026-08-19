import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Check, FileText, Save, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface CodeChange {
  filePath: string;
  newContent: string;
  originalContent: string;
}

interface CodeDiffViewerProps {
  change: CodeChange;
  onCancel: () => void;
  onConfirm: (newContent: string) => void;
}

export function CodeDiffViewer({
  change,
  onCancel,
  onConfirm,
}: CodeDiffViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(change.newContent);

  // 计算 diff 行（基于 LCS 算法，双列行号）
  const diffLines = useMemo(() => {
    const original = change.originalContent.split('\n');
    const modified = editedContent.split('\n');

    const m = original.length;
    const n = modified.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0),
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (original[i - 1] === modified[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const result: Array<{
      content: string;
      origLineNum: number | null;
      modLineNum: number | null;
      type: 'added' | 'removed' | 'same';
    }> = [];

    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && original[i - 1] === modified[j - 1]) {
        result.unshift({
          content: original[i - 1],
          origLineNum: i,
          modLineNum: j,
          type: 'same',
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({
          content: modified[j - 1],
          origLineNum: null,
          modLineNum: j,
          type: 'added',
        });
        j--;
      } else {
        result.unshift({
          content: original[i - 1],
          origLineNum: i,
          modLineNum: null,
          type: 'removed',
        });
        i--;
      }
    }

    return result;
  }, [change.originalContent, editedContent]);

  // 统计
  const stats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  const fileName = change.filePath.split(/[/\\]/).pop() || '未命名';

  // 键盘快捷键：Escape 关闭，Ctrl+S 保存
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onConfirm(editedContent);
      }
    },
    [onCancel, onConfirm, editedContent],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 编辑模式下计算行号
  const editLineCount = editedContent.split('\n').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-2xl bg-card text-card-foreground shadow-soft">
      {/* 头部 */}
      <div className="flex items-center justify-between bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <FileText className=" text-primary" />
          <div>
            <div className="text-sm font-medium">{fileName}</div>
            <div className="max-w-md truncate text-xs text-muted-foreground">
              {change.filePath}
            </div>
          </div>
          <div className="flex gap-2">
            <Badge className="text-xs" variant="success">
              +{stats.added}
            </Badge>
            <Badge className="text-xs" variant="destructive">
              -{stats.removed}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsEditing(!isEditing)}
            size="sm"
            variant="ghost"
          >
            {isEditing ? '查看差异' : '编辑'}
          </Button>
          <Button onClick={onCancel} size="sm" variant="ghost">
            <X className="" />
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="max-h-96 overflow-auto">
        {isEditing ? (
          /* 编辑模式 — 带行号的 textarea */
          <div className="flex">
            {/* 行号列 */}
            <div className="select-none border-r border-border bg-muted/50 px-2 py-3 text-right font-mono text-xs leading-5 text-muted-foreground">
              {Array.from({ length: editLineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* 编辑区 */}
            <textarea
              className="min-h-96 flex-1 resize-none border-0 bg-background p-3 font-mono text-sm leading-5 text-foreground outline-none"
              onChange={(e) => setEditedContent(e.target.value)}
              spellCheck={false}
              value={editedContent}
            />
          </div>
        ) : (
          /* 差异模式 */
          <table className="w-full font-mono text-sm">
            <tbody>
              {diffLines.map((line, index) => (
                <tr
                  className={`${
                    line.type === 'added'
                      ? 'bg-green-500/10 dark:bg-green-900/30'
                      : line.type === 'removed'
                        ? 'bg-red-500/10 dark:bg-red-900/30'
                        : 'hover:bg-muted/50'
                  }`}
                  key={index}
                >
                  {/* 原始文件行号 */}
                  <td className="w-12 select-none border-r border-border px-2 py-0.5 text-right font-mono text-xs text-muted-foreground/60">
                    {line.origLineNum ?? ''}
                  </td>
                  {/* 修改后文件行号 */}
                  <td className="w-12 select-none border-r border-border px-2 py-0.5 text-right font-mono text-xs text-muted-foreground/60">
                    {line.modLineNum ?? ''}
                  </td>
                  <td className="w-6 select-none px-1 py-0.5 text-center font-mono text-xs">
                    {line.type === 'added' && (
                      <span className="text-green-600 dark:text-green-400">+</span>
                    )}
                    {line.type === 'removed' && (
                      <span className="text-red-600 dark:text-red-400">-</span>
                    )}
                  </td>
                  <td className="whitespace-pre px-2 py-0.5 font-mono text-sm">
                    {line.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-end gap-2 border-t border-border bg-muted px-4 py-3">
        <Button onClick={onCancel} size="sm" variant="outline">
          <X className="mr-1 " />
          取消
        </Button>
        <Button
          onClick={() => onConfirm(editedContent)}
          size="sm"
          variant="default"
        >
          <Save className="mr-1 " />
          保存修改
        </Button>
      </div>
        </div>
      </div>
    </div>
  );
}
