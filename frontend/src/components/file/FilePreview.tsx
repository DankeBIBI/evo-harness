/**
 * FilePreview — 单文件内容预览(右栏下半部分)
 *
 * 2026-07-06 P1-2 新增
 * 单一职责: 给定文件路径, 拉取内容, 渲染。
 *   - 上方: 文件名 + 大小 + 关闭按钮
 *   - 下方: 滚动文本区(等宽字体, 横滚)
 *   - 加载中: 旋转 Loader
 *   - 失败: 错误提示
 *
 * 性能:
 *   - 每次 filePath 变化重新拉取(不缓存, 因为文件可能改了)
 *   - 大文件(>500KB)只显示前 200KB, 提示截断
 */

import { useEffect, useState } from 'react';

import { X, FileText, Loader2, AlertCircle, MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { readFileContent } from '@/lib/fs/project-file-service';

interface FilePreviewProps {
  /** 要预览的文件路径(相对项目根) */
  filePath: string;
  /** 关闭预览(由 FileTreeSidebar 控制) */
  onClose: () => void;
  /** 将当前文件引用插入聊天输入框。 */
  onInsert?: (path: string) => void;
}

const MAX_PREVIEW_BYTES = 200 * 1024; // 200KB 上限, 防止 1GB 日志卡死 WebView

export function FilePreview({ filePath, onClose, onInsert }: FilePreviewProps) {
  const [content, setContent] = useState<null | string>(null);
  const [error, setError] = useState<null | string>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setTruncated(false);

    (async () => {
      try {
        /** 从统一服务读(实时磁盘,刷新后依然可读) */
        const text = await readFileContent(filePath);
        if (cancelled) return;
        if (text.length > MAX_PREVIEW_BYTES) {
          setContent(text.slice(0, MAX_PREVIEW_BYTES));
          setTruncated(true);
        } else {
          setContent(text);
        }
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // 短名(取 basename)
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
	const directoryPath = filePath.slice(0, Math.max(0, filePath.length - fileName.length)).replace(/[\\/]$/, '');

  return (
    <div className="border-border/40 bg-card flex h-full min-h-0 flex-col rounded-md border">
      {/* 头部 */}
      <div className="border-border/40 flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
        <FileText className="text-muted-foreground h-[12px] w-[12px] shrink-0" />
    <div className="min-w-0 flex-1" title={filePath}>
      <span className="text-foreground/80 block truncate font-mono text-xs font-medium">
      {fileName}
      </span>
      {directoryPath && (
      <span className="text-muted-foreground block truncate font-mono text-[10px]">
        {directoryPath}
      </span>
      )}
    </div>
        <Button
      aria-label="插入聊天"
      className="text-muted-foreground hover:text-foreground h-6 w-6"
      onClick={() => onInsert?.(filePath)}
      size="icon"
      title="插入聊天上下文"
      variant="ghost">
      <MessageSquarePlus className="h-[12px] w-[12px]" />
    </Button>
    <Button
          aria-label="关闭预览"
          className="text-muted-foreground hover:text-foreground h-6 w-6"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="h-[12px] w-[12px]" />
        </Button>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
            <Loader2 className="h-[14px] w-[14px] animate-spin" />
            <span>加载中...</span>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <p className="text-muted-foreground text-xs leading-relaxed">{error}</p>
          </div>
        ) : (
          <>
            <pre className="text-foreground/90 overflow-x-auto p-2 font-mono text-[11px] leading-relaxed">
              {content}
            </pre>
            {truncated && (
              <div className="text-muted-foreground bg-muted/40 border-border/40 border-t px-2 py-1.5 text-center text-xs">
                文件过大, 仅显示前 {Math.round(MAX_PREVIEW_BYTES / 1024)} KB
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
