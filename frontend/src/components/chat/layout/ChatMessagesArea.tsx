import { ChatMessages, type ChatMessagesProps } from '../messages/ChatMessages';
import { ChatWelcome } from '../messages/ChatWelcome';

/**
 * ChatMessagesArea — 聊天主内容区（极简版）
 *
 * 极简设计:
 *   - 空态: 居中显示 ChatWelcome（首页式占位：欢迎语 + 建议提示词）
 *   - 聊天态: 直接显示 ChatMessages
 *   - 无面包屑 / 无告警（按图1 极简风格）
 *
 * Less UI §二 精密控制档: 单一焦点
 */
export interface ChatMessagesAreaProps
  extends Omit<ChatMessagesProps, 'conversationId' | 'messages'> {
  conversation: import('@/stores/chatStore').Conversation | undefined;
  hasMessages: boolean;
  /** 点击 ChatWelcome 的建议提示词时回调（把文字回填到输入框） */
  onSuggestionClick?: (text: string) => void;
}

export function ChatMessagesArea({
  conversation,
  hasMessages,
  onSuggestionClick,
  ...chatMessagesProps
}: ChatMessagesAreaProps) {
  if (!hasMessages || !conversation) {
    return <ChatWelcome onSuggestionClick={onSuggestionClick} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ChatMessages
        {...chatMessagesProps}
        conversationId={conversation.id}
        messages={conversation.messages}
      />
    </div>
  );
}
