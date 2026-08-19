import {
    CodeReviewPanel,
    type FileChange,
} from '@/components/editor/CodeReviewPanel';
import { EditorChatInput } from '@/components/editor/EditorChatInput';
import { Button } from '@/components/ui/Button';
import {
    ChevronRight,
    Lightbulb,
    Sparkles,
    Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  timestamp: Date;
}

// Demo data for file changes
const demoChanges: FileChange[] = [
  {
    id: '1',
    filePath: 'src/components/Chat/MessageBubble.tsx',
    originalContent:
      'export function MessageBubble({ message }: { message: ChatMessage }) {\n  return (\n    <div className="rounded-lg p-4">\n      <p>{message.content}</p>\n    </div>\n  );\n}',
    newContent:
      'export function MessageBubble({ message }: { message: ChatMessage }) {\n  const [expanded, setExpanded] = useState(false);\n  \n  return (\n    <div className="rounded-xl border p-4 transition-all hover:shadow-md">\n      <div className="flex items-center gap-2 mb-2">\n        <Avatar className="h-6 w-6" />\n        <span className="text-sm font-medium">{message.role}</span>\n      </div>\n      <p className="text-sm leading-relaxed">{message.content}</p>\n      {message.timestamp && (\n        <span className="mt-2 text-xs text-muted-foreground">\n          {formatTime(message.timestamp)}\n        </span>\n      )}\n    </div>\n  );\n}',
    status: 'pending',
  },
  {
    id: '2',
    filePath: 'src/hooks/useChat.ts',
    originalContent:
      'export function useChat() {\n  const [messages, setMessages] = useState<Message[]>([]);\n  \n  const sendMessage = async (text: string) => {\n    const res = await fetch("/api/chat", {\n      method: "POST",\n      body: JSON.stringify({ text }),\n    });\n    const data = await res.json();\n    setMessages(prev => [...prev, data]);\n  };\n  \n  return { messages, sendMessage };\n}',
    newContent:
      'export function useChat() {\n  const [messages, setMessages] = useState<Message[]>([]);\n  const [isLoading, setIsLoading] = useState(false);\n  const abortRef = useRef<AbortController | null>(null);\n  \n  const sendMessage = async (text: string) => {\n    setIsLoading(true);\n    abortRef.current = new AbortController();\n    \n    try {\n      const res = await fetch("/api/chat", {\n        method: "POST",\n        body: JSON.stringify({ text }),\n        signal: abortRef.current.signal,\n      });\n      if (!res.ok) throw new Error("Request failed");\n      const data = await res.json();\n      setMessages(prev => [...prev, data]);\n    } catch (err) {\n      if (err.name !== "AbortError") {\n        toast.error("发送失败: " + err.message);\n      }\n    } finally {\n      setIsLoading(false);\n      abortRef.current = null;\n    }\n  };\n  \n  const cancel = () => abortRef.current?.abort();\n  \n  return { messages, sendMessage, isLoading, cancel };\n}',
    status: 'pending',
  },
  {
    id: '3',
    filePath: 'src/utils/format.ts',
    originalContent:
      'export function formatDate(date: Date) {\n  return date.toLocaleString();\n}',
    newContent:
      'export function formatDate(date: Date, opts?: Intl.DateTimeFormatOptions) {\n  return new Intl.DateTimeFormat("zh-CN", {\n    year: "numeric",\n    month: "2-digit",\n    day: "2-digit",\n    hour: "2-digit",\n    minute: "2-digit",\n    ...opts,\n  }).format(date);\n}\n\nexport function formatRelativeTime(date: Date) {\n  const diff = Date.now() - date.getTime();\n  const minutes = Math.floor(diff / 60000);\n  if (minutes < 1) return "刚刚";\n  if (minutes < 60) return `${minutes}分钟前`;\n  const hours = Math.floor(minutes / 60);\n  if (hours < 24) return `${hours}小时前`;\n  return formatDate(date, { month: "short", day: "numeric" });\n}',
    status: 'pending',
  },
];

export default function EditorPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '你好！我是你的 AI 编程助手。你可以让我帮你：\n\n• 重构代码\n• 修复 Bug\n• 添加新功能\n• 优化性能\n\n直接在下方输入你的需求，我会生成代码修改建议。',
      timestamp: new Date(),
    },
  ]);
  const [changes, setChanges] = useState<FileChange[]>(demoChanges);
  const [showThinking, setShowThinking] = useState(true);
  const [reviewCollapsed, setReviewCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content:
        '我已经分析了你的需求，并生成了以下代码修改建议。\n\n主要改动包括：\n1. 优化了 MessageBubble 组件，添加了头像和时间戳\n2. 重构了 useChat Hook，增加了 loading 状态和请求取消功能\n3. 增强了日期格式化工具，支持相对时间显示\n\n你可以在右侧面板查看每个文件的详细差异，选择接受或撤销。',
      thinking:
        '1. 分析用户需求：用户想要改进聊天组件\n2. 检查现有代码：MessageBubble 过于简单，useChat 缺少错误处理\n3. 确定改进方案：\n   - 添加头像、时间戳、hover 效果\n   - 增加 loading 状态和 abort controller\n   - 扩展日期格式化功能\n4. 生成代码并验证语法正确性',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
  }, [input]);

  const handleAccept = useCallback((change: { id: string }) => {
    setChanges((prev) =>
      prev.map((c) => (c.id === change.id ? { ...c, status: 'accepted' as const } : c)),
    );
  }, []);

  const handleReject = useCallback((change: { id: string }) => {
    setChanges((prev) =>
      prev.map((c) => (c.id === change.id ? { ...c, status: 'rejected' as const } : c)),
    );
  }, []);

  const handleAcceptAll = useCallback(() => {
    setChanges((prev) =>
      prev.map((c) =>
        c.status === 'pending' ? { ...c, status: 'accepted' as const } : c,
      ),
    );
  }, []);

  const handleRejectAll = useCallback(() => {
    setChanges((prev) =>
      prev.map((c) =>
        c.status === 'pending' ? { ...c, status: 'rejected' as const } : c,
      ),
    );
  }, []);

  const pendingCount = changes.filter((c) => c.status === 'pending').length;
  const acceptedCount = changes.filter((c) => c.status === 'accepted').length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Sparkles className=" text-primary" />
        <div>
          <h1 className="text-sm font-semibold">AI 编程助手</h1>
          <p className="text-xs text-muted-foreground">
            智能代码编辑与审查
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            className={`h-7 gap-1.5 text-xs ${showThinking ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={() => setShowThinking(!showThinking)}
            size="sm"
            variant="ghost"
          >
            <Lightbulb className="h-[14px] w-[14px]" />
            思考过程
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-auto px-5 py-4">
            <div className="flex flex-col gap-5">
              {messages.map((msg) => (
                <div className="flex flex-col gap-2" key={msg.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        msg.role === 'user'
                          ? 'bg-primary/15'
                          : 'bg-amber-500/15'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <Terminal className="h-[14px] w-[14px] text-primary" />
                      ) : (
                        <Sparkles className="h-[14px] w-[14px] text-amber-600" />
                      )}
                    </div>
                    <span className="text-xs font-medium">
                      {msg.role === 'user' ? '你' : 'AI 助手'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {msg.timestamp.toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {msg.thinking && showThinking && (
                    <div className="ml-8 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <Lightbulb className="h-[14px] w-[14px]" />
                        思考过程
                      </div>
                      <div className="space-y-1 text-xs leading-relaxed text-amber-800/80 dark:text-amber-400/70">
                        {msg.thinking.split('\n').map((line, i) => (
                          <div className="flex gap-2" key={i}>
                            <ChevronRight className="mt-0.5 h-[12px] w-[12px] shrink-0" />
                            <span>{line.replace(/^\d+\.\s*/, '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="ml-8">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Integrated Chat Input + Todo + Accept Bar */}
          <EditorChatInput
            acceptedCount={acceptedCount}
            input={input}
            onAcceptAll={handleAcceptAll}
            onInputChange={setInput}
            onRevertAll={handleRejectAll}
            onSend={handleSend}
            pendingCount={pendingCount}
          />
        </div>

        {/* Collapsible Right panel - Code Review */}
        <CodeReviewPanel
          changes={changes}
          collapsed={reviewCollapsed}
          onAcceptChange={handleAccept}
          onRejectChange={handleReject}
          onToggleCollapse={() => setReviewCollapsed((v) => !v)}
        />
      </div>
    </div>
  );
}
