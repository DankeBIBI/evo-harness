import type { Prompt } from '@/stores/promptStore';

import { useCallback } from 'react';

import { buildHistoryMessages } from '../lib/chatHistory';
import type { HistoryMessageInput } from '../lib/chatHistory';
import type { ChatMessage } from '@/lib/chat/protocol';

export interface FileMentionReference {
  path: string;
  token: string;
}

const MAX_CONTEXT_FILES = 20;
const MAX_CONTEXT_FILE_CHARS = 12_000;
const MAX_TOTAL_FILE_CONTEXT_CHARS = 48_000;

export function useChatWorkspace() {
  const formatError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  const getWorkspacePath = useCallback(
    (filePath: string, projectPath: string) => {
      const trimmedPath = filePath.trim();
      if (
        !projectPath ||
        /^[a-z]:[\\/]/i.test(trimmedPath) ||
        trimmedPath.startsWith('\\\\') ||
        trimmedPath.startsWith('/')
      ) {
        return trimmedPath;
      }

      const separator = projectPath.includes('\\') ? '\\' : '/';
      return `${projectPath.replace(/[\\/]+$/, '')}${separator}${trimmedPath.replace(/^[\\/]+/, '')}`;
    },
    [],
  );

  const buildWorkspaceMessage = useCallback(
    async (
      userInput: string,
      projectPath: string,
      currentFilePath: string,
      fileMentions: FileMentionReference[] = [],
      matchedPrompts?: Prompt[],
      conversationHistory?: HistoryMessageInput[],
      modelOptions?: { maxInputTokens?: number; preserveReasoning?: boolean },
    ): Promise<{
      systemContext: string;
      userMessage: string;
      userInputOnly: string;
      historyMessages: ChatMessage[];
    }> => {
      const fileMentionMap = new Map(
        fileMentions.map((mention) => [mention.token, mention.path]),
      );
      const fileRefs = [...userInput.matchAll(/@\[([^\]]+)\]/g)]
        .map((match) => {
          const token = match[1];
          const mappedPath = fileMentionMap.get(token);

          if (mappedPath) {
            return mappedPath;
          }

          if (
            token.includes('/') ||
            token.includes('\\') ||
            token.startsWith('.') ||
            /^[a-z]:[\\/]/i.test(token) ||
            token.startsWith('\\\\')
          ) {
            return getWorkspacePath(token, projectPath);
          }

          return '';
        })
        .filter(Boolean);
      // 当前轮引用优先；再从历史用户消息中恢复最近引用过的文件。
      // 这些路径已随 Message 持久化，刷新/重启后仍能恢复上下文交接。
      const historicalFileRefs = (conversationHistory ?? [])
        .flatMap((message) => message.referencedFiles ?? [])
        .reverse();
      const orderedFileRefs = [...new Set([...fileRefs, ...historicalFileRefs])]
        .filter(Boolean)
        .slice(0, MAX_CONTEXT_FILES);
      const fileContext: string[] = [];
	  let totalFileContextChars = 0;

      if (orderedFileRefs.length > 0) {
        const { ReadFile } = await import('@/lib/hostServices/FileService');
        for (const filePath of orderedFileRefs) {
		  if (totalFileContextChars >= MAX_TOTAL_FILE_CONTEXT_CHARS) break;
          try {
            const content = await ReadFile(filePath);
			const remaining = MAX_TOTAL_FILE_CONTEXT_CHARS - totalFileContextChars;
			const limit = Math.min(MAX_CONTEXT_FILE_CHARS, remaining);
			const excerpt = content.slice(0, limit);
            fileContext.push(
			  `### ${filePath}\n\`\`\`\n${excerpt}${content.length > limit ? '\n...[truncated]' : ''}\n\`\`\``,
            );
			totalFileContextChars += excerpt.length;
          } catch (error) {
            fileContext.push(
              `### ${filePath}\n读取失败: ${formatError(error)}`,
            );
          }
        }
      }

      // 过滤掉空内容的提示词
      const validPrompts =
        matchedPrompts?.filter((p) => p.content.trim()) || [];

      // 构建提示词部分
      const promptsSection =
        validPrompts.length > 0
          ? [
              '',
              '[自定义提示词]',
              ...validPrompts.map((p) => `## ${p.name}\n${p.content.trim()}`),
              '',
            ].join('\n')
          : '';

      // 对话历史：只取 user/assistant、滑动窗口截断、stripForAI 摘要去标签
      // 2026-08-19 重构:历史轮次走结构化 messages 数组(history 字段),
      //   不再拼字符串进 user message — 对齐 OpenAI/Anthropic 官方协议
      const maxInputTokens = modelOptions?.maxInputTokens ?? 128_000;
      const historyBudget = Math.max(12_000, Math.min(500_000, Math.floor(maxInputTokens * 0.5)));
      const { messages: historyChatMessages } = buildHistoryMessages(conversationHistory, {
        maxHistoryTokens: historyBudget,
        preserveReasoning: modelOptions?.preserveReasoning,
      });

      // 全部为空时直接返回 user input,空 system 段
      const hasSystemContent =
        !!projectPath ||
        !!currentFilePath ||
        orderedFileRefs.length > 0 ||
        validPrompts.length > 0;
      if (!hasSystemContent && historyChatMessages.length === 0) {
        return {
          historyMessages: [],
          systemContext: '',
          userInputOnly: userInput,
          userMessage: userInput,
        };
      }

      // === systemContext: 稳定内容,跨轮不变 → cache 命中关键 ===
      // 工具调用规则已由后端 buildBehaviorPrompt 注入,此处仅保留执行铁律(后端语气偏温和,此处做强化)
      const systemContext = [
        '[工作区上下文]',
        projectPath ? `项目根目录: ${projectPath}` : '项目根目录: 未选择',
        currentFilePath ? `当前文件: ${currentFilePath}` : '',
        '',
    orderedFileRefs.length > 0
      ? `历史及本轮引用文件: ${orderedFileRefs.join(', ')}`
      : '',
    '1. **不要重复读取同一个文件。** 下方已引用文件及历史操作摘要中的已读文件直接使用现有上下文,仅当内容缺失或可能已变化时再 ReadFile。',
        '2. **修改完成后一句话总结。** "已将 XXX 改成 YYY" 即可。',
        '',
        fileContext.length > 0
          ? `[已引用文件]\n${fileContext.join('\n\n')}`
          : '',
        promptsSection,
      ]
        .filter(Boolean)
        .join('\n');

      // === userMessage: 纯用户输入(不含 history,不含 system context) ===
      // 历史段由 sendMessage/sendContinuation 调用方决定如何拼接
      // 子代理派遣用 userInputOnly(避免把父级 history 灌给子代理)
      const userMessage = userInput;
      const userInputOnly = userInput;

      return { systemContext, userMessage, userInputOnly, historyMessages: historyChatMessages };
    },
    [getWorkspacePath],
  );

  return {
    buildWorkspaceMessage,
    formatError,
    getWorkspacePath,
  };
}
