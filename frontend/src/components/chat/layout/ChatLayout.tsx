import { cn } from '@/lib/utils';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import type { FileChange } from '@/components/editor/CodeReviewPanel';
import { useChatStore } from '@/stores/chatStore';
import { useLayoutStore } from '@/stores/layoutStore';

import { FileTreeSidebar } from './FileTreeSidebar';
import { ResizeHandle } from './ResizeHandle';
import { SessionSidebar } from './SessionSidebar';

/**
 * ChatLayout — 3 栏 IDE 风格布局容器
 *
 * 结构（横向 flex）:
 *   [顶部栏由 AppLayout 的 CustomTitleBar onChatPage 接管]
 *   [SessionSidebar]  [主内容区（含 mini-toolbar）]  [FileTreeSidebar]
 *
 * Less UI §四 8px 间距 + §二 精密控制档紧凑对齐
 * Less UI §三 全局 ≤ 3 档阴影 / 圆角
 *
 * 行为:
 *   - 侧栏显隐受 layoutStore 控制
 *   - 折叠动画: width 0↔240/288 + opacity, 200ms
 *
 * (2026-08-18) 统一日志按钮已从主区右上角浮层迁到顶部栏(CustomTitleBar),
 *               其显隐状态走 layoutStore.unifiedLogOpen,本组件不再透传 onToggleUnifiedLog / showUnifiedLog
 */
export function ChatLayout({
  changes,
  children,
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
  /** P1-2 (2026-07-10): 文件变更列表 —— 透传给右栏 "变更" tab */
  changes?: FileChange[];
  children: React.ReactNode;
  /** P1-2 (2026-07-10): 变更面板展开/折叠受控 */
  expanded?: boolean;
  /** P1-2 (2026-07-10): 单文件丢弃 —— 写回 originalContent + 从记录移除 */
  onDiscard?: (change: FileChange) => void;
  /** P1-2 (2026-07-10): 全部丢弃 —— 批量回滚 */
  onDiscardAll?: () => void;
  /** P1-2 (2026-07-10): 变更面板展开/折叠回调 */
  onExpandedChange?: (expanded: boolean) => void;
  /** 右栏选中文件后回调（用于把文件内容回填到聊天输入框） */
  onFileContentToInput?: (path: string, content: string) => void;
  /** P1-2 (2026-07-10): 单文件保留 —— 从记录移除 */
  onKeep?: (change: FileChange) => void;
  /** P1-2 (2026-07-10): 全部保留 —— 清空记录 */
  onKeepAll?: () => void;
  /** P1-2 (2026-07-10): 点击文件行触发 —— 打开 diff 弹窗 */
  onOpenDiff?: (change: FileChange) => void;
  /** 右栏切换项目目录后回调（用于同步到 useChatProject） */
  onProjectPathChange?: (path: string) => void;
  projectPath?: string;
}) {
  const navigate = useNavigate();
  const addConversation = useChatStore((s) => s.addConversation);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const leftVisible = useLayoutStore((s) => s.leftSidebarVisible);
  const leftCollapsed = useLayoutStore((s) => s.leftCollapsed);
  const rightVisible = useLayoutStore((s) => s.rightSidebarVisible);
  const rightCollapsed = useLayoutStore((s) => s.rightCollapsed);
  const leftWidth = useLayoutStore((s) => s.leftWidth);
  const rightWidth = useLayoutStore((s) => s.rightWidth);
  const setLeftWidth = useLayoutStore((s) => s.setLeftWidth);
  const setRightWidth = useLayoutStore((s) => s.setRightWidth);
  const resetLeftWidth = useLayoutStore((s) => s.resetLeftWidth);
  const resetRightWidth = useLayoutStore((s) => s.resetRightWidth);
  /**
   * ResizeHandle 触发的是"本次鼠标移动的 delta 像素", 转成 store 调用
   * (setLeftWidth / setRightWidth 内部会 clamp + 极窄自动收起)
   */
  const handleLeftResize = useCallback(
    (delta: number) => setLeftWidth(leftWidth + delta),
    [leftWidth, setLeftWidth],
  );
  const handleRightResize = useCallback(
    (delta: number) => setRightWidth(rightWidth + delta),
    [rightWidth, setRightWidth],
  );
  /**
   * 左栏三态 → 宽度:
   *  - leftVisible=false        → 0    (完全隐藏, 主区左上角 会出现 PanelLeftOpen)
   *  - leftCollapsed=true       → 48   (VS Code Activity Bar 风格图标条)
   *  - leftCollapsed=false      → leftWidth (用户拖拽后的完整侧栏)
   */
  const leftRenderWidth = leftVisible
    ? leftCollapsed
      ? 48
      : leftWidth
    : 0;
  /**
   * 右栏三态 → 宽度(2026-08-18 与左栏对称):
   *  - rightVisible=false       → 0    (主区右上角显示 PanelRightOpen)
   *  - rightCollapsed=true      → 48   (图标条 + 变更数角标)
   *  - rightCollapsed=false     → rightWidth
   */
  const rightRenderWidth = rightVisible
    ? rightCollapsed
      ? 48
      : rightWidth
    : 0;
  const handleCreateConversation = () => {
    const newConvId = `conv-${Date.now()}`;
    const now = new Date().toISOString();

    addConversation({
      agentId: '',
      createdAt: now,
      debugLogs: [],
      id: newConvId,
      isArchived: false,
      isStarred: false,
      lastMessageAt: now,
      messages: [],
      title: '新会话',
      updatedAt: now,
    });
    setCurrentConversation(newConvId);
    navigate('/chat');
  };

  const toggleLeftSidebar = useLayoutStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);

  return (
    <div
      className={cn(
        'bg-background flex h-full min-h-0 flex-col',
        'text-foreground',
      )}
    >
      {/* 顶部栏由 AppLayout 的 CustomTitleBar onChatPage 提供 */}

      <div className="flex min-h-0 flex-1 gap-2 p-2 pt-0">
        <CollapsibleSidebar
          visible={leftVisible}
          width={leftRenderWidth}
        >
          <SessionSidebar onCreateConversation={handleCreateConversation} />
        </CollapsibleSidebar>

        {/* 左栏 resize handle — 仅在“完整模式”且可见时才挂载(图标条模式无 resize) */}
        {leftVisible && !leftCollapsed && (
          <ResizeHandle
            direction="right"
            onDoubleClick={resetLeftWidth}
            onResize={handleLeftResize}
          />
        )}

        <main className="border-border/70 bg-card relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
          {/* 左上角: 展开左栏(收起时显示) — 毛玻璃容器,与右上角对称 */}
          {!leftVisible && (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border/40 bg-background/60 px-1.5 py-1 backdrop-blur-md">
              <Button
                aria-label="展开左栏"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
                onClick={toggleLeftSidebar}
                size="icon"
                variant="ghost"
              >
                <PanelLeftOpen className="h-[14px] w-[14px]" />
              </Button>
            </div>
          )}
          {/* 右上角工具栏 — 毛玻璃容器
              (2026-08-18) 仅保留“展开右栏”按钮;统一日志已迁到顶部栏(CustomTitleBar) */}
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border/40 bg-background/60 px-1.5 py-1 backdrop-blur-md">
            {!rightVisible && (
              <Button
                aria-label="展开右栏"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
                onClick={toggleRightSidebar}
                size="icon"
                variant="ghost"
              >
                <PanelRightOpen className="h-[14px] w-[14px]" />
              </Button>
            )}
          </div>
          {children}
        </main>

        {/* 右栏 resize handle — 仅在"完整模式"且可见时才挂载 */}
        {rightVisible && !rightCollapsed && (
          <ResizeHandle
            direction="left"
            onDoubleClick={resetRightWidth}
            onResize={handleRightResize}
          />
        )}

        <CollapsibleSidebar
          visible={rightVisible}
          width={rightRenderWidth}
        >
          <FileTreeSidebar
            changes={changes}
            expanded={expanded}
            onDiscard={onDiscard}
            onDiscardAll={onDiscardAll}
            onExpandedChange={onExpandedChange}
            onFileContentToInput={onFileContentToInput}
            onKeep={onKeep}
            onKeepAll={onKeepAll}
            onOpenDiff={onOpenDiff}
            onProjectPathChange={onProjectPathChange}
            projectPath={projectPath}
          />
        </CollapsibleSidebar>
      </div>
    </div>
  );
}

/** 折叠侧栏：用 width 过渡而非 unmount（保持状态）
 *  P1-2 (2026-07-06): 接受 width prop 用于拖动宽度, 收起时 width=0
 */
function CollapsibleSidebar({
  visible,
  width,
  children,
}: {
  visible: boolean;
  /** 当前宽度(px), 收起时传 0 */
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'shrink-0 overflow-hidden transition-[width,opacity] duration-200',
        visible ? 'opacity-100' : 'w-0 opacity-0',
      )}
      style={{ width: visible ? width : 0 }}
    >
      {children}
    </div>
  );
}
