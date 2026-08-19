import { useState } from "react";

import type { Message } from "@/stores/chatStore";

import type { AgentExecutionRecord } from "@/components/agent/AgentOrchestrationGraph";

import type { PendingCodeChange } from "../hooks/useChatCodeApply";

import { useSettingsStore } from "@/stores/settingsStore";

import {
  ArrowDown,
  Bot,
  Clipboard,
  ClipboardCheck,
  Clock3,
  Copy,
  File,
  FileCode,
  MessageSquare,
  RotateCcw,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { AgentExecutionList } from "@/components/chat/panels/AgentExecutionList";
import { StreamingMessage } from "@/components/chat/messages/StreamingMessage";

export interface ChatMessagesProps {
  agentExecutions?: AgentExecutionRecord[];
  availableAgents?: Array<{ id: string; name: string; role?: string }>;
  messageQueue?: string[];
  messages: Message[];
  conversationId?: string;
  onCodeChangeClick: (
    filePath: string,
    newContent: string,
    originalContent: string,
  ) => void;
  onResend?: (content: string) => void;
  pendingCodeChange: null | PendingCodeChange;
  streamingContent: string;
  streamingId: null | string;
}

/** 从文件名提取短名 */
function shortName(path: string): string {
  const fileName = path.split(/[/\\]/).pop() || path;
  const nameExt = fileName.replace(/\.[^.]+$/, "") || fileName;
  return nameExt.length > 12 ? `${nameExt.slice(0, 10)}..` : nameExt;
}

/** 将文本中的 @[path] 渲染为文件图标标签 */
function renderMessageContent(text: string): React.ReactNode {
  const parts = text.split(/(@\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^@\[([^\]]+)\]$/);
    if (!match) return <span key={i}>{part}</span>;
    const path = match[1];
    if (!path.includes("/") && !path.includes("\\"))
      return <span key={i}>{part}</span>;
    return (
      <span
        key={i}
        className="bg-primary-foreground/20 text-primary-foreground inline-flex items-center gap-1 rounded-md border border-primary-foreground/30 px-1.5 py-0.5 align-middle text-xs font-medium"
        title={path}
      >
        <File className="h-[14px] w-[14px] shrink-0" />
        <span className="max-w-[140px] truncate">{shortName(path)}</span>
      </span>
    );
  });
}

export function ChatMessages({
  agentExecutions,
  availableAgents,
  messageQueue,
  messages,
  onCodeChangeClick,
  onResend,
  streamingContent,
  streamingId,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<null | string>(null);
  const [rawDataMsg, setRawDataMsg] = useState<null | Message>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const immersiveChatMode = useSettingsStore((s) => s.immersiveChatMode);

  /**
   * 滚到容器底部
   * 注意:改用 container.scrollTo 而不是 messagesEndRef.scrollIntoView,
   * 避免 scrollIntoView 拉动 window / 外层祖先容器(这是 Wails WebView2 渲染进程
   * 崩溃的常见诱因之一),同时省一次 reflow。
   */
  const scrollToBottom = (smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const targetTop = container.scrollHeight;
    if (smooth) {
      container.scrollTo({ top: targetTop, behavior: "smooth" });
    } else {
      container.scrollTop = targetTop;
    }
  };

  /** 检测是否接近底部（100px 阈值） */
  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  /** 监听用户手动滚动：离开底部 → 锁定；滚回底部 → 解锁 */
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => setIsNearBottom(checkNearBottom());
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [checkNearBottom]);

  /** 新用户消息 / 流式更新时：仅当在底部才自动滚 */
  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      if (isNearBottom) scrollToBottom(false);
    }
    prevMsgCountRef.current = messages.length;
    // intentionally only on messages.length change — streaming is handled below
  }, [messages.length]);

  /** 流式内容更新时持续滚底（仅当用户在底部）
   * 三道防线降低 reflow / 渲染压力:
   * 1) 依赖 streamingContent.length 而非整个字符串,避免每次 Object.is 都相等时重跑
   * 2) rAF 节流:同一帧内的多次滚动请求合并为一次,典型 60Hz SSE 下从 60 次/秒降到 60 次/秒但批量处理
   * 3) 用 container.scrollTo 而非 scrollIntoView,见上方 scrollToBottom 注
   * 这是 WebView2 渲染进程崩溃（kind 2）的主要诱因之一。 */
  const streamRafRef = useRef<number | null>(null);
  useEffect(() => {
    // 状态翻转时(用户上翻 / 流式结束)主动取消挂起的 rAF,避免下一帧强行滚底
    if (!streamingId || !streamingContent || !isNearBottom) {
      if (streamRafRef.current !== null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
      return;
    }
    if (streamRafRef.current !== null) return;
    streamRafRef.current = requestAnimationFrame(() => {
      streamRafRef.current = null;
      scrollToBottom(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingContent?.length, streamingId, isNearBottom]);
  useEffect(
    () => () => {
      if (streamRafRef.current !== null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
    },
    [],
  );

  /** 流式结束时强制滚底一次 */
  const prevStreamingRef = useRef(streamingId);
  useEffect(() => {
    if (prevStreamingRef.current && !streamingId) {
      scrollToBottom();
      setIsNearBottom(true);
    }
    prevStreamingRef.current = streamingId;
  }, [streamingId]);

  /** 复制内容到剪贴板（Clipboard API + execCommand 降级） */
  const copyToClipboard = async (text: string) => {
    // 优先 Clipboard API
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }

    // 降级 execCommand（支持非安全上下文如 Wails）
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      /* fall through */
    }

    return false;
  };

  const handleCopy = async (msg: Message) => {
    const ok = await copyToClipboard(msg.content);
    if (ok) {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div
      className="relative h-full min-h-0 flex-1 overflow-auto px-6 py-4"
      ref={scrollContainerRef}
    >
      {messages.length === 0 && !streamingId && (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center">
          <MessageSquare className="mb-3 h-[50px] w-[50px] opacity-20" />
          <b className="mb-2 text-2xl font-bold"> 开始一段新对话</b>
          <p className="text-sm">输入消息开始聊天</p>
        </div>
      )}

      {messages
        .filter((msg) => msg.id !== streamingId)
        .map((msg) => (
          <div
            className={`mb-4 flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            key={msg.id}
          >
            {/* 头像 */}
            <div
              className={`mt-1 flex h-[36px] w-[36px] flex-shrink-0 items-center justify-center rounded-full ${
                msg.role === "user"
                  ? "bg-primary/10"
                  : immersiveChatMode
                    ? "bg-transparent"
                    : "bg-muted shadow-soft"
              }`}
            >
              {msg.role === "user" ? (
                <User className="text-primary h-[20px] w-[20px]" />
              ) : (
                <Bot
                  className={
                    immersiveChatMode
                      ? "text-muted-foreground/40 h-[20px] w-[20px]"
                      : "text-muted-foreground h-[20px] w-[20px]"
                  }
                />
              )}
            </div>

            {/* 气泡 + 操作按钮容器 */}
            <div className="group relative min-w-0 mt-[30px] max-w-[85%] lg:max-w-[75%]">
              {msg.role === "user" ? (
                <div className="bg-primary  text-primary-foreground shadow-soft overflow-hidden rounded-2xl rounded-tr-sm py-[10px] px-[10px] text-[15px] leading-relaxed">
                  <div className="overflow-hidden whitespace-pre-wrap break-words">
                    {renderMessageContent(msg.content)}
                  </div>
                </div>
              ) : (
                <div
                  className={
                    immersiveChatMode
                      ? "min-w-0 overflow-hidden px-1 pt-5 pb-1"
                      : "bg-card shadow-soft min-w-0 overflow-hidden rounded-2xl rounded-tl-sm px-5 pt-5 pb-4"
                  }
                >
                  <StreamingMessage
                    content={msg.content}
                    isStreaming={false}
                    toolCalls={msg.toolCalls}
                  />
                  {/* 检测代码修改标记 */}
                  <CodeModifyButtons
                    content={msg.content}
                    onCodeChangeClick={onCodeChangeClick}
                  />
                  {/* 消息级渲染：仅展示属于本条 msg 的子 Agent 执行记录（per-message 隔离） */}
                  {(() => {
                    const mine = (agentExecutions ?? []).filter(
                      (r) => r.msgId === msg.id,
                    );
                    return mine.length > 0 ? (
                      <AgentExecutionList
                        availableAgents={availableAgents ?? []}
                        records={mine}
                      />
                    ) : null;
                  })()}
                </div>
              )}

              {/* 操作按钮 - 绝对定位到气泡右上角,避免占用垂直空间导致与下一条消息重叠 */}
              <div
                className={`absolute -top-3 z-10 ${
                  msg.role === "user" ? "right-2" : "left-2"
                } flex items-center gap-1 rounded-lg border border-border/40 bg-card/95 p-0.5 shadow-sm ring-1 ring-background/10 opacity-0 transition-opacity group-hover:opacity-100 hover:!opacity-100 backdrop-blur-sm`}
              >
                {/* 复制 */}
                <button
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                  onClick={() => handleCopy(msg)}
                  title="复制内容"
                >
                  {copiedId === msg.id ? (
                    <>
                      <ClipboardCheck className="h-[12px] w-[12px] text-green-500" />
                      <span className="text-green-500">已复制</span>
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-[12px] w-[12px]" />
                      <span>复制</span>
                    </>
                  )}
                </button>

                {/* 重新发送（仅用户消息） */}
                {msg.role === "user" && onResend && (
                  <button
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                    onClick={() => onResend(msg.content)}
                    title="重新发送"
                  >
                    <RotateCcw className="h-[12px] w-[12px]" />
                    <span>重发</span>
                  </button>
                )}

                {/* 查看原始数据（AI 消息） */}
                {msg.role !== "user" && msg.content && (
                  <button
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                    onClick={() => setRawDataMsg(msg)}
                    title="查看 AI 原始输出"
                  >
                    <FileCode className="h-[12px] w-[12px]" />
                    <span>原始数据</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

      {/* 流式消息 */}
      {streamingId && (
        <div className="mb-4 flex flex-row gap-3">
          <div
            className={`mt-1 flex h-[36px] w-[36px] flex-shrink-0 items-center justify-center rounded-full ${
              immersiveChatMode ? "bg-transparent" : "bg-muted shadow-soft"
            }`}
          >
            <Bot
              className={
                immersiveChatMode
                  ? "text-muted-foreground/40 h-[20px] w-[20px]"
                  : "text-muted-foreground h-[20px] w-[20px]"
              }
            />
          </div>
          <div
            className={
              immersiveChatMode
                ? "min-w-0 overflow-hidden px-1 py-1"
                : "bg-card shadow-soft min-w-0 overflow-hidden rounded-2xl rounded-tl-sm px-5 py-4"
            }
          >
            {/* 派生 isStreaming：流式时显示"执行中"，结束时切"完成"（之前硬编码 true 导致 UI 永远卡在执行中） */}
            {(() => {
              // 2026-07-06 P1-2: 从会话 store 查流式消息的 toolCalls,渲染活动日志
              // 流式消息在会话中存在(useChatStreaming addMessage 创建),只是被下面 filter 排除
              const streamingMsg = messages.find((m) => m.id === streamingId);
              return (
                <StreamingMessage
                  content={streamingContent}
                  isStreaming={!!streamingId}
                  toolCalls={streamingMsg?.toolCalls}
                />
              );
            })()}
          </div>
        </div>
      )}

      {/* 排队消息幽灵气泡 */}
      {messageQueue &&
        messageQueue.length > 0 &&
        messageQueue.map((item, idx) => (
          <div
            className="mb-2 flex flex-row gap-3 opacity-50"
            key={`queue-${idx}`}
          >
            <div className="bg-primary/10 mt-1 flex h-[36px] w-[36px] flex-shrink-0 items-center justify-center rounded-full">
              <User className="text-primary h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 max-w-[85%] lg:max-w-[75%]">
              <div className="bg-muted/50 text-muted-foreground overflow-hidden rounded-2xl rounded-tr-sm px-4 py-2.5 text-[14px]">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-[14px] w-[14px] shrink-0" />
                  <span className="truncate">{item}</span>
                  {idx === 0 && streamingId && (
                    <span className="text-muted-foreground/60 shrink-0 text-xs">
                      排队中{" "}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

      {/* 原始数据查看弹窗 */}
      {rawDataMsg && (
        <RawDataDialog
          message={rawDataMsg}
          onClose={() => setRawDataMsg(null)}
        />
      )}

      <div ref={messagesEndRef} />

      {/* 回到底部浮动按钮 — 仅在用户上翻时出现 */}
      {!isNearBottom && messages.length > 0 && (
        <button
          className="bg-card border-border hover:bg-muted absolute bottom-4 right-6 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-all"
          onClick={() => {
            scrollToBottom();
            setIsNearBottom(true);
          }}
          title="回到底部"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

/** 原始数据查看弹窗 */
function RawDataDialog({
  message,
  onClose,
}: {
  message: Message;
  onClose: () => void;
}) {
  const tabs = [
    { key: "raw", label: "原始输出" },
    { key: "display", label: "显示内容" },
  ] as const;
  const [activeTab, setActiveTab] =
    useState<(typeof tabs)[number]["key"]>("raw");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card shadow-soft mx-4 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl">
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-6 py-4">
          <h3 className="text-sm font-semibold">AI 原始数据</h3>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg p-1 transition-colors"
            onClick={onClose}
          >
            <X className="" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 px-6 pb-2">
          {tabs.map((tab) => (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <pre className="bg-muted overflow-auto rounded-xl p-4 text-xs leading-relaxed">
            <code>
              {activeTab === "raw"
                ? message.rawContent || message.content
                : message.content}
            </code>
          </pre>
        </div>

        {/* 底部信息 */}
        <div className="flex items-center justify-between px-6 py-4 text-xs">
          <span>
            {activeTab === "raw"
              ? `原始长度: ${((message.rawContent || message.content)?.length ?? 0).toLocaleString()} 字符`
              : `显示长度: ${(message.content?.length ?? 0).toLocaleString()} 字符`}
          </span>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-lg px-2 py-1 transition-colors"
            onClick={async () => {
              const text =
                activeTab === "raw"
                  ? ((message.rawContent || message.content) ?? "")
                  : (message.content ?? "");
              // Clipboard API + execCommand 降级
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
              }
            }}
          >
            <Copy className="h-[12px] w-[12px]" />
            <span>复制</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface CodeModifyButtonsProps {
  content: string;
  onCodeChangeClick: (
    filePath: string,
    newContent: string,
    originalContent: string,
  ) => void;
}

function CodeModifyButtons({
  content,
  onCodeChangeClick,
}: CodeModifyButtonsProps) {
  const codeModifyPattern = /@@FILE:([^\n]+)/g;
  const matches = [...content.matchAll(codeModifyPattern)];
  // 使用 Map 避免同一消息多个 @@FILE 时状态互相覆盖
  const [loadingMap, setLoadingMap] = useState<Map<string, boolean>>(new Map());
  const [errorMap, setErrorMap] = useState<Map<string, string>>(new Map());

  if (matches.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {matches.map((match, i) => {
        const filePath = match[1].trim();
        const isLoading = loadingMap.get(filePath) ?? false;

        return (
          <button
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            key={i}
            disabled={isLoading}
            onClick={async () => {
              setErrorMap((prev) => {
                const n = new Map(prev);
                n.delete(filePath);
                return n;
              });
              setLoadingMap((prev) => {
                const n = new Map(prev);
                n.set(filePath, true);
                return n;
              });
              const { ReadFile } =
                await import("@/lib/hostServices/FileService");
              try {
                // 5秒超时
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("读取超时")), 5000),
                );
                const readPromise = ReadFile(filePath);
                const originalContent = (await Promise.race([
                  readPromise,
                  timeoutPromise,
                ])) as string;
                const escapedPath = filePath?.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  String.raw`\$&`,
                );
                const blockPattern = new RegExp(
                  `@@FILE:${escapedPath}[\\s\\S]*?\\\`\\\`\\\`[\\w]*\\n([\\s\\S]*?)\\\`\\\`\\\``,
                );
                const blockMatch = content.match(blockPattern);
                if (blockMatch) {
                  onCodeChangeClick(
                    filePath,
                    blockMatch[1].trim(),
                    originalContent ?? "",
                  );
                  return;
                }

                setErrorMap((prev) => {
                  const n = new Map(prev);
                  n.set(filePath, `未找到 ${filePath} 的可修改代码块`);
                  return n;
                });
              } catch (error) {
                console.error("读取文件失败:", error);
                setErrorMap((prev) => {
                  const n = new Map(prev);
                  n.set(
                    filePath,
                    `读取文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
                  );
                  return n;
                });
              } finally {
                setLoadingMap((prev) => {
                  const n = new Map(prev);
                  n.set(filePath, false);
                  return n;
                });
              }
            }}
          >
            {isLoading ? "读取中..." : `修改 ${filePath.split(/[/\\]/).pop()}`}
          </button>
        );
      })}
      {[...errorMap.values()].map((msg, idx) => (
        <p className="text-destructive w-full text-xs" key={idx}>
          {msg}
        </p>
      ))}
    </div>
  );
}
