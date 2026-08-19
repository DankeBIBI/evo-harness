import { ChatWindow } from "@/components/chat/panels/ChatWindow";
import { useChatStore } from '@/stores/chatStore';
import { useEffect } from 'react';

export default function ChatPage() {
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const lastConversationId = useChatStore((s) => s.lastConversationId);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const conversations = useChatStore((s) => s.conversations);

  useEffect(() => {
    // 只在当前确实没有选中的会话、且最后一次会话存在且为空时，
    // 重新激活它以让用户看到上一次的上下文。否则优先展示新建会话的英雄区。
    if (currentConversationId) return;
    if (!lastConversationId) return;
    const lastConv = conversations.find((c) => c.id === lastConversationId);
    if (lastConv && lastConv.messages.length > 0) {
      setCurrentConversation(lastConversationId);
    }
  }, [currentConversationId, lastConversationId, conversations, setCurrentConversation]);

  return <ChatWindow />;
}
