import { File, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getChildren,
  searchProjectFiles,
} from '@/lib/fs/project-file-service';

interface FileItem {
  depth?: number;
  isDir: boolean;
  modTime: number;
  name: string;
  path: string;
  size: number;
}

/** ProjectFileItem → 弹层行数据 */
function toFileItem(item: {
  isDir: boolean;
  name: string;
  path: string;
  size: number;
}): FileItem {
  return {
    isDir: item.isDir,
    modTime: 0,
    name: item.name,
    path: item.path,
    size: item.size,
  };
}

interface FileMentionPopoverProps {
  onClose: () => void;
  onSelectFile: (path: string) => void;
  open: boolean;
  projectPath?: string;
}

export function FileMentionPopover({
  onClose,
  onSelectFile,
  open,
  projectPath,
}: FileMentionPopoverProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 搜索文件(实时磁盘递归,统一服务)
  const searchFiles = useCallback(
    async (keyword: string) => {
      if (!projectPath) return;
      setLoading(true);
      try {
        const matched = await searchProjectFiles(keyword, 20);
        setFiles(matched.filter((e) => !e.isDir).map(toFileItem));
        setSelectedIndex(0);
      } catch (err) {
        console.warn('搜索项目文件失败:', err);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [projectPath],
  );

  // 初始加载根目录文件(实时读磁盘第一层文件)
  const loadRootFiles = useCallback(async () => {
    if (!projectPath) {
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      const items = await getChildren('');
      setFiles(items.filter((e) => !e.isDir).map(toFileItem));
      setSelectedIndex(0);
    } catch (err) {
      console.warn('加载根目录文件失败:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  // 打开时加载
  useEffect(() => {
    if (open) {
      setSearchKeyword('');
      if (projectPath) {
        loadRootFiles();
      } else {
        setFiles([]);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, projectPath, loadRootFiles]);

  // 搜索防抖
  useEffect(() => {
    if (!searchKeyword.trim()) {
      loadRootFiles();
      return;
    }
    const timer = setTimeout(() => {
      searchFiles(searchKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword, searchFiles, loadRootFiles]);

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, files.length - 1));

        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));

        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (files[selectedIndex]) {
          handleSelect(files[selectedIndex]);
        }

        break;
      }
      case 'Escape': {
        e.preventDefault();
        onClose();

        break;
      }
      // No default
    }
  };

  // 选中文件
  const handleSelect = (file: FileItem) => {
    onSelectFile(file.path);
    onClose();
  };

  // 滚动到选中项
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="border-border bg-popover text-popover-foreground absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-lg border shadow-xl">
      {/* 搜索框 */}
      <div className="border-border flex items-center gap-2 border-b p-2">
        <Search className="text-muted-foreground  shrink-0" />
        <input
          className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
          onChange={(e) => setSearchKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索文件..."
          ref={inputRef}
          type="text"
          value={searchKeyword}
        />
        {searchKeyword && (
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setSearchKeyword('')}
          >
            <X className="" />
          </button>
        )}
      </div>

      {/* 文件列表 */}
      <div className="max-h-60 overflow-auto" ref={listRef}>
        {loading ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            加载中...
          </div>
        ) : files.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            {searchKeyword
              ? '未找到匹配文件'
              : projectPath
                ? '暂无文件'
                : '请先在顶部选择项目文件夹'}
          </div>
        ) : (
          files.map((file, index) => (
            <div
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${
                index === selectedIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
              data-index={index}
              key={file.path}
              onClick={() => handleSelect(file)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <File
                className={` shrink-0 ${index === selectedIndex ? 'text-primary-foreground' : 'text-muted-foreground'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{file.name}</div>
                <div
                  className={`truncate text-xs ${index === selectedIndex ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                >
                  {file.path}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部提示 */}
      <div className="bg-muted/50 border-border text-muted-foreground border-t px-3 py-2 text-xs">
        按 <kbd className="bg-muted rounded px-1 py-0.5">Enter</kbd> 选择 ·{' '}
        <kbd className="bg-muted rounded px-1 py-0.5">↑↓</kbd> 导航 ·{' '}
        <kbd className="bg-muted rounded px-1 py-0.5">Esc</kbd> 关闭
      </div>
    </div>
  );
}
