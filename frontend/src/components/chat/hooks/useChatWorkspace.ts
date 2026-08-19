import type { Prompt } from '@/stores/promptStore';

import { useCallback } from 'react';

import { buildHistoryMessages } from '../lib/chatHistory';
import type { HistoryMessageInput } from '../lib/chatHistory';
import type { ChatMessage } from '@/lib/chat/protocol';
import {
  getRegisteredTools,
  toolNameAliases,
} from '@/lib/tools/registry';

export interface FileMentionReference {
  path: string;
  token: string;
}

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

  /** 构建工具列表文本 */
  const buildToolAliasesText = useCallback(() => {
    const registered = getRegisteredTools();
    const lines: string[] = [];

    // 已注册工具
    lines.push('--- 已注册工具 ---');
    for (const tool of registered) {
      lines.push(`  ${tool.name} - ${tool.description}`);
    }

    // 别名（短名）映射
    const aliasEntries = Object.entries(toolNameAliases);
    if (aliasEntries.length > 0) {
      lines.push('');
      lines.push('--- 短名别名（兼容） ---');
      for (const [alias, real] of aliasEntries) {
        lines.push(`  ${alias} -> ${real}`);
      }
    }

    return lines.join('\n');
  }, []);

  const buildWorkspaceMessage = useCallback(
    async (
      userInput: string,
      projectPath: string,
      currentFilePath: string,
      fileMentions: FileMentionReference[] = [],
      matchedPrompts?: Prompt[],
      conversationHistory?: HistoryMessageInput[],
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
      const orderedFileRefs = fileRefs.slice(0, 5);
      const fileContext: string[] = [];

      if (orderedFileRefs.length > 0) {
        const { ReadFile } = await import('@/lib/hostServices/FileService');
        for (const filePath of orderedFileRefs) {
          try {
            const content = await ReadFile(filePath);
            fileContext.push(
              `### ${filePath}\n\`\`\`\n${content.slice(0, 12_000)}${content.length > 12_000 ? '\n...[truncated]' : ''}\n\`\`\``,
            );
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
      const { messages: historyChatMessages } = buildHistoryMessages(
        conversationHistory,
      );

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
        '1. **不要重复读取同一个文件。** 对话历史中已读过的文件直接在上下文中,不要再 ReadFile。',
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
    [getWorkspacePath, buildToolAliasesText],
  );

  return {
    buildWorkspaceMessage,
    formatError,
    getWorkspacePath,
    buildToolAliasesText,
  };
}
