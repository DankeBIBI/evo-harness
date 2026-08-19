import type { Conversation, Message, ToolCall, ToolResult } from '@/stores/chatStore';

import { Button } from '@/components/ui/Button';
import { Download, FileJson } from 'lucide-react';
import { useCallback } from 'react';

function escapeMarkdown(text: string): string {
  return text
    .replace(/\|/g, '\\|')
    .replace(/\n(#{1,6})\s/g, '\n\\$1 ')
    .replace(/([-*_~`>])/g, '\\$1');
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

function truncate(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function formatToolInput(input: Record<string, unknown>): string {
  try {
    const str = JSON.stringify(input, null, 2);
    return str.length > 500 ? str.slice(0, 497) + '...' : str;
  } catch {
    return String(input);
  }
}

/** 从消息的 content 提取首屏摘要，去除 <think> 块 + 代码 + 文件块 */
function extractSummary(msg: Message, maxLen = 60): string {
  const raw = msg.content || '';
  // 2026-07-04 P1-1 终态: content 已是纯文本,不再剥 tool_call/tool_result 标签
  const clean = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```[\s\S]*?```/g, '[代码]')
    .replace(/@@FILE:[^\n]*\n[\s\S]*?(?=@@FILE:|$)/g, '[文件]')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(clean, maxLen);
}

function formatToolCallForMarkdown(toolCall: ToolCall, toolResult?: ToolResult): string {
  const statusIcon = toolCall.status === 'error' ? '❌' : toolCall.status === 'pending' ? '⏳' : '✅';
  const durationStr = toolCall.duration ? ` (${toolCall.duration}ms)` : '';

  let md = `> **🔧 工具调用:** \`${toolCall.toolName}\` ${statusIcon}${durationStr}\n`;
  md += `> **ID:** \`${toolCall.id}\`\n`;
  md += `> **参数:**\n`;
  md += `> \`\`\`json\n> ${formatToolInput(toolCall.input).replace(/\n/g, '\n> ')}\n> \`\`\`\n`;

  if (toolCall.error) {
    md += `> **错误:** ${escapeMarkdown(truncate(toolCall.error, 200))}\n`;
  }

  if (toolResult) {
    const resultStr = typeof toolResult.result === 'string'
      ? toolResult.result
      : JSON.stringify(toolResult.result, null, 2);
    const truncated = resultStr.length > 1000
      ? resultStr.slice(0, 997) + '...'
      : resultStr;
    md += `> **结果:**\n`;
    md += `> \`\`\`\n> ${truncated.replace(/\n/g, '\n> ')}\n> \`\`\`\n`;
  }

  md += '\n';
  return md;
}

function formatMessageAsMarkdown(msg: Message): string {
  const time = formatTime(msg.createdAt);
  let md = '';

  switch (msg.role) {
    case 'user': {
      md += `## 👤 用户 · ${time}\n\n`;
      md += `${msg.content}\n`;
      break;
    }
    case 'assistant': {
      md += `## 🤖 助手 · ${time}\n\n`;
      // 2026-07-04 P1-1 终态: 工具调用走 chatStore.Message.toolCalls 强类型字段
      // 不再从 rawContent 里 parseAndFormatInlineToolCalls 正则抠 XML
      md += `${msg.content}\n`;
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        md += '\n<details>\n<summary>🔧 工具调用详情（点击展开）</summary>\n\n';
        for (const tc of msg.toolCalls) {
          const tr = msg.toolResults?.find((r) => r.toolCallId === tc.id);
          md += formatToolCallForMarkdown(tc, tr);
        }
        md += '</details>\n';
      }
      if (msg.error) {
        md += `\n> ⚠️ **错误:** ${escapeMarkdown(msg.error)}\n`;
      }
      break;
    }
    case 'system': {
      md += `## ⚙️ 系统 · ${time}\n\n`;
      md += `${msg.content}\n`;
      break;
    }
    case 'tool': {
      md += `## 🔧 工具 · ${time}\n\n`;
      md += `${msg.content}\n`;
      break;
    }
  }

  md += '\n---\n\n';
  return md;
}

export function conversationToMarkdown(conversation: Conversation): string {
  const title = conversation.title || '未命名会话';
  const createdAt = formatTime(conversation.createdAt);
  const updatedAt = formatTime(conversation.updatedAt);

  let md = `# ${escapeMarkdown(title)}\n\n`;
  md += `> **创建时间:** ${createdAt}\n`;
  md += `> **更新时间:** ${updatedAt}\n`;
  md += `> **会话 ID:** \`${conversation.id}\`\n\n`;

  // Agent 信息
  if (conversation.agentMeta) {
    md += `## Agent\n\n`;
    md += `| 字段 | 值 |\n|---|---|\n`;
    md += `| 名称 | ${escapeMarkdown(conversation.agentMeta.name)} |\n`;
    md += `| ID | \`${conversation.agentId}\` |\n`;
    md += `| 角色 | ${escapeMarkdown(conversation.agentMeta.role.slice(0, 200))} |\n`;
    if (conversation.agentMeta.collaborationMode) {
      md += `| 协作模式 | ${conversation.agentMeta.collaborationMode} |\n`;
    }
    if (conversation.agentMeta.tools.length > 0) {
      md += `| 工具 | ${conversation.agentMeta.tools.map(t => `\`${t}\``).join(', ')} |\n`;
    }
    if (conversation.agentMeta.skills.length > 0) {
      md += `| 技能 | ${conversation.agentMeta.skills.join(', ')} |\n`;
    }
    md += '\n';
  }

  // 模型信息
  if (conversation.context?.modelName || conversation.context?.modelId) {
    md += `## 模型\n\n`;
    md += `| 字段 | 值 |\n|---|---|\n`;
    if (conversation.context?.modelName) {
      md += `| 名称 | ${escapeMarkdown(conversation.context.modelName)} |\n`;
    }
    if (conversation.context?.modelId) {
      md += `| ID | \`${conversation.context.modelId}\` |\n`;
    }
    md += '\n';
  }

  // 项目信息
  md += `## 项目\n\n`;
  md += `| 字段 | 值 |\n|---|---|\n`;
  md += `| 路径 | \`${conversation.context?.projectPath || '未指定'}\` |\n`;
  if (conversation.context?.currentFilePath) {
    md += `| 当前文件 | \`${conversation.context.currentFilePath}\` |\n`;
  }
  md += '\n';

  // Token 统计
  const stats = conversation.tokenStats;
  if (stats) {
    md += `## Token 统计\n\n`;
    md += `| 字段 | 数值 |\n|---|---|\n`;
    md += `| 输入 | ${stats.inputTokens.toLocaleString()} |\n`;
    md += `| 输出 | ${stats.outputTokens.toLocaleString()} |\n`;
    md += `| **总计** | **${stats.totalTokens.toLocaleString()}** |\n`;
    md += '\n';
  }

  // 消息统计
  const userMsgs = conversation.messages.filter(m => m.role === 'user').length;
  const assistantMsgs = conversation.messages.filter(m => m.role === 'assistant').length;
  /** 单条消息里嵌的 tool_call 数：优先从声明字段拿（P3+ 后 rawContent 不再含 XML）；
   *  新消息直接用 m.toolCalls;历史消息兼容：若 toolCalls 为空则从 content 字面回填 */
  const countEmbeddedToolCalls = (m: { content?: string; toolCalls?: ToolCall[] }) => {
    if (m.toolCalls && m.toolCalls.length > 0) return m.toolCalls.length;
    return (m.content ?? '').match(/<tool_call/g)?.length ?? 0;
  };
  const toolCallCount = conversation.messages.reduce(
    (sum, m) => sum + countEmbeddedToolCalls(m),
    0,
  );
  md += `## 消息统计\n\n`;
  md += `| 字段 | 数量 |\n|---|---|\n`;
  md += `| 用户消息 | ${userMsgs} |\n`;
  md += `| AI 回复 | ${assistantMsgs} |\n`;
  md += `| 工具调用 | ${toolCallCount} |\n`;
  md += `| 总消息数 | ${conversation.messages.length} |\n`;
  md += '\n---\n\n';

  // 消息正文
  md += `## 对话记录\n\n`;
  for (const msg of conversation.messages) {
    md += formatMessageAsMarkdown(msg);
  }

  return md;
}

function downloadFile(filename: string, content: string, mimeType = 'text/markdown') {
  // BOM 前缀强制 Windows 识别为 UTF-8,防止乱码
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 导出对话原始数据 JSON,不做任何处理,保留 tool_call/tool_result/think 等全部原始内容 */
export function conversationToRawJSON(conversation: Conversation): string {
  return JSON.stringify(
    {
      id: conversation.id,
      title: conversation.title,
      agentId: conversation.agentId,
      agentMeta: conversation.agentMeta,
      context: conversation.context,
      tokenStats: conversation.tokenStats,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        rawContent: msg.rawContent || null,
        toolCalls: msg.toolCalls || null,
        toolResults: msg.toolResults || null,
        error: msg.error || null,
        modelId: msg.modelId || null,
        createdAt: msg.createdAt,
      })),
    },
    null,
    2,
  );
}

interface ExportButtonProps {
  conversation: Conversation;
  className?: string;
}

export function ExportButton({ conversation, className }: ExportButtonProps) {
  const handleExport = useCallback(() => {
    const markdown = conversationToMarkdown(conversation);
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeTitle = (conversation.title || '会话')
      .replace(/[\\/:*?"<>|]/g, '-')
      .slice(0, 40);
    const filename = `conversation-${safeTitle}-${dateStr}.md`;
    downloadFile(filename, markdown);
  }, [conversation]);

  return (
    <Button
      className={className}
      onClick={handleExport}
      size="icon"
      title="导出当前会话 (Markdown)"
      variant="ghost"
    >
      <Download className="h-5 w-5" />
    </Button>
  );
}

export function ExportRawButton({ conversation, className }: ExportButtonProps) {
  const handleExport = useCallback(() => {
    const json = conversationToRawJSON(conversation);
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeTitle = (conversation.title || '会话')
      .replace(/[\\/:*?"<>|]/g, '-')
      .slice(0, 40);
    const filename = `conversation-raw-${safeTitle}-${dateStr}.json`;
    downloadFile(filename, json, 'application/json');
  }, [conversation]);

  return (
    <Button
      className={className}
      onClick={handleExport}
      size="icon"
      title="导出原始数据 (JSON,保留全部 tool_call/think 等原始内容)"
      variant="ghost"
    >
      <FileJson className="h-5 w-5" />
    </Button>
  );
}
