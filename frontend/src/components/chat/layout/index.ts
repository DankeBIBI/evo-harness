/**
 * ChatLayout 桶导出
 *
 * 使用:
 *   import { ChatLayout, AgentManagerDialog } from '@/components/chat/layout';
 */

// ── 主框架 ──
export { ChatLayout } from './ChatLayout';

// ── 三栏组件 ──
export { SessionSidebar } from './SessionSidebar';
export { FileTreeSidebar } from './FileTreeSidebar';

// ── 中栏子件 ──
export { ChatMessagesArea } from './ChatMessagesArea';

// ── 内容组件(供 SettingsDialog 复用) ──
export { AgentManagerContent } from './AgentManagerDialog';

// ── 数据 ──
export { categoryContent, type CategoryItem, type CategoryGroup, type CategoryContent } from './agentCategoryContent';
