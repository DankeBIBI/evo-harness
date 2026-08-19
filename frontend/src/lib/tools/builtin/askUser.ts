/**
 * AskUser tool — 暂停执行,向用户提 1-4 个结构化问题(单选/多选/文本),等用户提交后把答案返回给 AI。
 *
 * 设计动机:
 *   - Anthropic 等模型支持 "AskUserQuestion" 类工具,让 AI 在不确定时主动澄清需求
 *   - 一次最多 4 个问题,避免用户认知负荷过重
 *   - 支持单选 / 多选 / 文本三类问题,一次调用可混搭
 *
 * 行为契约:
 *   - 无 active conversation → 直接返回错误文案(避免静默通过)
 *   - questions 数组长度超限 / 字段缺失 / options 为空 → 返回错误,AI 自纠
 *   - 用户点提交 → 返回 { cancelled: false, answers: { [id]: value | value[] } }
 *   - 用户点取消 / 5 分钟超时 → 返回 { cancelled: true, answers: {} }
 *
 * 数据流:
 *   tool.execute → askUserStore.submit(questions)
 *              → askUserStore.waitForAnswer()  (Promise,UI 渲染 AskUserCard)
 *              → 用户操作 → store.resolve/cancel
 *              → tool.execute 把结果 JSON.stringify 返回给 LLM
 */

import type { Tool } from '../base';
import { useChatStore } from '@/stores/chatStore';
import {
  useAskUserStore,
  type AskUserAnswers,
  type AskUserOption,
  type AskUserQuestion,
} from '@/stores/askUserStore';

/** 取得当前会话 id,无会话返回 null(不抛 — 工具层走"错误文案"路径) */
function getActiveConvIdOrNull(): string | null {
  return useChatStore.getState().currentConversationId ?? null;
}

/** 校验 + 规范化 questions 参数,失败时返回 error 文案 */
function validateQuestions(raw: unknown): { error?: string; questions?: AskUserQuestion[] } {
  if (!Array.isArray(raw)) {
    return { error: 'AskUser failed: questions must be an array.' };
  }
  if (raw.length === 0) {
    return { error: 'AskUser failed: questions array cannot be empty.' };
  }
  if (raw.length > 4) {
    return { error: `AskUser failed: at most 4 questions per call, got ${raw.length}.` };
  }
  const seen = new Set<string>();
  const out: AskUserQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown> | null;
    if (!q || typeof q !== 'object') {
      return { error: `AskUser failed: questions[${i}] must be an object.` };
    }
    const id = (q.id as string | undefined)?.trim();
    if (!id) {
      return { error: `AskUser failed: questions[${i}].id is required.` };
    }
    if (seen.has(id)) {
      return { error: `AskUser failed: duplicate question id "${id}".` };
    }
    seen.add(id);
    const question = (q.question as string | undefined)?.trim();
    if (!question) {
      return { error: `AskUser failed: questions[${i}].question is required.` };
    }
    const type = q.type as string | undefined;
    if (type !== 'single' && type !== 'multi' && type !== 'text') {
      return {
        error: `AskUser failed: questions[${i}].type must be single|multi|text, got "${type}".`,
      };
    }
    const normalized: AskUserQuestion = {
      id,
      question,
      required: q.required === false ? false : true,
      type,
    };
    if (type !== 'text') {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        return {
          error: `AskUser failed: questions[${i}].options is required for type=${type} and must be non-empty.`,
        };
      }
      const opts: AskUserOption[] = [];
      const seenValues = new Set<string>();
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j] as Record<string, unknown> | null;
        if (!opt || typeof opt !== 'object') {
          return { error: `AskUser failed: questions[${i}].options[${j}] must be an object.` };
        }
        const label = (opt.label as string | undefined)?.trim();
        const value = (opt.value as string | undefined)?.trim();
        if (!label) {
          return { error: `AskUser failed: questions[${i}].options[${j}].label is required.` };
        }
        if (!value) {
          return { error: `AskUser failed: questions[${i}].options[${j}].value is required.` };
        }
        if (seenValues.has(value)) {
          return { error: `AskUser failed: questions[${i}].options[${j}] duplicate value "${value}".` };
        }
        seenValues.add(value);
        const o: AskUserOption = { label, value };
        if (typeof opt.description === 'string' && opt.description.trim()) {
          o.description = opt.description.trim();
        }
        opts.push(o);
      }
      normalized.options = opts;
    }
    if (type === 'text') {
      if (typeof q.placeholder === 'string' && q.placeholder.trim()) {
        normalized.placeholder = q.placeholder.trim();
      }
      if (typeof q.maxLength === 'number' && q.maxLength > 0) {
        normalized.maxLength = Math.floor(q.maxLength);
      }
    }
    out.push(normalized);
  }
  return { questions: out };
}

export const askUserTool: Tool = {
  category: 'interactive',
  description:
    'Pause execution and ask the user 1-4 structured questions. ' +
    'Each question can be single-choice, multi-choice, or free text. ' +
    'Use this when you need clarification, a decision, or extra context before continuing. ' +
    'Returns JSON: { cancelled: boolean, answers: { [questionId]: value | value[] } }. ' +
    'If the user cancels or times out (5 min), cancelled=true and answers={}. ' +
    'IMPORTANT: Do not call AskUser again with the same questions while a previous call is still waiting — the UI will be ignored. ' +
    'Wait for the tool result before issuing another AskUser.',
  execute: async (params, call) => {
    const convId = getActiveConvIdOrNull();
    if (!convId) return 'AskUser failed: no active conversation.';
    // 2026-07-24 关键修复:必须用 call.id 作为 tcId,AskUserCard 才能按 tcId
    //   独立订阅,避免"每个气泡都显示最新一张卡"
    if (!call) return 'AskUser failed: missing tool call id (should never happen).';

    const validated = validateQuestions(params.questions);
    if (validated.error || !validated.questions) {
      return validated.error ?? 'AskUser failed: invalid questions.';
    }

    const store = useAskUserStore.getState();
    const tcId = call.id;
    // 已在 pending → 等同 tcId 的结果(LLM 重发同一 tcId 不会冲突)
    // 已 settled → 立即返回 snapshot 结果
    if (store.getSnapshot(tcId) || store.getPending(tcId)) {
      const result = await store.waitByTcId(tcId);
      return JSON.stringify({
        answers: result.answers,
        cancelled: result.cancelled,
      });
    }
    // 首次 → submit + wait
    store.submitByTcId(tcId, validated.questions);
    const result = await store.waitByTcId(tcId);

    const payload: { cancelled: boolean; answers: AskUserAnswers } = {
      cancelled: result.cancelled,
      answers: result.answers,
    };
    return JSON.stringify(payload);
  },
  name: 'AskUser',
  params: {
    type: 'object',
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        description: 'Questions to ask (1-4 items). Each must have id, question, type.',
        items: {
          type: 'object',
          required: ['id', 'question', 'type'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique answer key. Use snake_case or camelCase, e.g. "deploy_env".',
            },
            question: {
              type: 'string',
              description: 'Question text shown to the user.',
            },
            type: {
              type: 'string',
              enum: ['single', 'multi', 'text'],
              description: 'Question type: single-choice, multi-choice, or free text.',
            },
            options: {
              type: 'array',
              description: 'Choices for single/multi. Each: { label, value, description? }.',
              items: {
                type: 'object',
                required: ['label', 'value'],
                properties: {
                  label: { type: 'string', description: 'Display text.' },
                  value: { type: 'string', description: 'Value returned in answers.' },
                  description: { type: 'string', description: 'Optional helper text.' },
                },
              },
            },
            placeholder: {
              type: 'string',
              description: 'Placeholder for text input.',
            },
            maxLength: {
              type: 'number',
              description: 'Max chars for text input (optional).',
            },
            required: {
              type: 'boolean',
              description: 'Whether answer is required (default true).',
            },
          },
        },
      },
    },
  },
};
