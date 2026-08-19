import { useModelStore } from '@/stores/modelStore';
import { StreamChat as streamChatAPI } from '@/lib/hostServices/ChatService';
import { EventsOff, EventsOn } from '@/lib/hostServices/eventBus';
import { useCallback, useEffect, useRef, useState } from 'react';

/** useVideoAI 暴露的接口 */
export interface IVideoAI {
  /** 当前是否在生成(用于 UI 禁用 + loading) */
  isGenerating: boolean;
  /** 最近一次错误(供 toast/提示) */
  lastError: null | string;
  /**
   * 为节点生成 AI 内容
   * - kind=plot/storyboard: 根据上游节点 body + 主题生成情节/分镜
   * - kind=script: 生成视频脚本
   * - 流式响应会增量回调 onProgress,最终通过 onComplete 提交
   */
  generateForNode: (params: IGenerateParams) => void;
  /** 取消当前生成(尽力而为,后端流不会立刻停) */
  cancel: () => void;
}

/** generateForNode 参数 */
export interface IGenerateParams {
  /** 生成指令(由调用方根据节点类型 + 上游 body 拼好) */
  instruction: string;
  /** 当前正在生成的节点 id(仅用于显示) */
  nodeId: string;
  /** 流式增量回调 */
  onProgress?: (delta: string) => void;
  /** 流式结束后完整内容回调 */
  onComplete?: (fullText: string) => void;
  /** 错误回调 */
  onError?: (msg: string) => void;
  /** System role(可选,默认根据节点类型自动生成) */
  systemRole?: string;
}

/** generateForNode 返回 streamId(目前仅用于日志追踪) */
type StreamId = string;

let nextStreamSeq = 1;

/**
 * AI 视频 AI 调用 hook
 * - 封装 StreamChat API + EventsOn 流式响应
 * - 单一 hook 复用模型选择、流式事件监听、错误处理
 *
 * 调用方式:
 *   const { isGenerating, generateForNode } = useVideoAI();
 *   generateForNode({ nodeId, instruction: '...', onProgress, onComplete });
 */
export function useVideoAI(): IVideoAI {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<null | string>(null);

  // 当前活动流的 eventName(用于取消/EventsOff)
  const activeEventName = useRef<null | string>(null);
  // 当前活动流的累计内容(用于 onComplete)
  const activeBuffer = useRef<string>('');
  // 当前活动流的回调(避免 React 重渲染闭包引用过期)
  const activeCallbacks = useRef<{
    onComplete?: (text: string) => void;
    onError?: (msg: string) => void;
    onProgress?: (delta: string) => void;
  }>({});
  // 标记取消(用户主动 cancel,即便流还在也丢弃结果)
  const cancelFlag = useRef(false);

  // 组件卸载时清理事件监听
  useEffect(
    () => () => {
      if (activeEventName.current) {
        EventsOff(activeEventName.current);
        EventsOff(`${activeEventName.current}:done`);
        EventsOff(`${activeEventName.current}:error`);
        activeEventName.current = null;
      }
    },
    [],
  );

  /**
   * 解析事件数据。事件回调签名因实现而异:
   * - 旧版: cb(data) 直接传数据
   * - 新版: cb({content, done, ...}) 对象格式
   * 这里宽松兼容两者。
   */
  const handleEvent = useCallback((...args: unknown[]) => {
    if (cancelFlag.current) return;
    const data = args[0] as
      | { content?: unknown; done?: boolean; error?: boolean }
      | boolean
      | string
      | undefined;
    // 完成事件(done:true 落在主事件名上,无旁路 :done 事件)
    if (data === true || (typeof data === 'object' && data !== null && data.done === true)) {
      handleComplete(data);
      return;
    }
    // 错误事件(error:true 落在主事件名上)
    if (typeof data === 'object' && data !== null && data.error === true) {
      handleError(data);
      return;
    }
    const text =
      typeof data === 'string'
        ? data
        : typeof (data as { content?: unknown })?.content === 'string'
          ? (data as { content: string }).content
          : '';
    if (!text) return;
    activeBuffer.current += text;
    activeCallbacks.current.onProgress?.(text);
  }, []);

  const handleComplete = useCallback((...args: unknown[]) => {
    if (cancelFlag.current) return;
    const data = args[0] as { done?: boolean | string } | boolean | string | undefined;
    const isDone =
      data === true ||
      data === 'done' ||
      data === 'end' ||
      (typeof data === 'object' && data !== null && (data.done === true || data.done === 'done'));
    if (!isDone) return;
    const full = activeBuffer.current;
    const cb = activeCallbacks.current.onComplete;
    if (activeEventName.current) {
      EventsOff(activeEventName.current);
      EventsOff(`${activeEventName.current}:done`);
      EventsOff(`${activeEventName.current}:error`);
      activeEventName.current = null;
    }
    setIsGenerating(false);
    cb?.(full);
    activeBuffer.current = '';
    activeCallbacks.current = {};
  }, []);

  // 错误监听(部分后端实现通过独立事件上报)
  const handleError = useCallback((...args: unknown[]) => {
    if (cancelFlag.current) return;
    const msg = args.map(String).join(' ');
    setLastError(msg);
    setIsGenerating(false);
    activeCallbacks.current.onError?.(msg);
    if (activeEventName.current) {
      EventsOff(activeEventName.current);
      EventsOff(`${activeEventName.current}:done`);
      EventsOff(`${activeEventName.current}:error`);
      activeEventName.current = null;
    }
    activeBuffer.current = '';
    activeCallbacks.current = {};
  }, []);

  const cancel = useCallback(() => {
    cancelFlag.current = true;
    if (activeEventName.current) {
      EventsOff(activeEventName.current);
      EventsOff(`${activeEventName.current}:done`);
      EventsOff(`${activeEventName.current}:error`);
      activeEventName.current = null;
    }
    setIsGenerating(false);
    activeBuffer.current = '';
    activeCallbacks.current = {};
  }, []);

  const generateForNode = useCallback(
    (params: IGenerateParams) => {
      // 取当前选中模型
      const { selectedModelId, models } = useModelStore.getState();
      if (!selectedModelId) {
        const msg = '请先在「模型」页选择一个模型';
        setLastError(msg);
        params.onError?.(msg);
        return;
      }

      const model = models.find((m) => m.id === selectedModelId);
      if (!model?.apiKey) {
        const msg = `模型 "${model?.name ?? selectedModelId}" 未配置 API Key`;
        setLastError(msg);
        params.onError?.(msg);
        return;
      }

      // 串行:取消上一个
      if (activeEventName.current) {
        EventsOff(activeEventName.current);
        EventsOff(`${activeEventName.current}:done`);
        EventsOff(`${activeEventName.current}:error`);
      }
      cancelFlag.current = false;
      activeBuffer.current = '';
      activeCallbacks.current = {
        onComplete: params.onComplete,
        onError: params.onError,
        onProgress: params.onProgress,
      };

      const streamId: StreamId = `video-${nextStreamSeq++}`;
      const eventName = `video-ai-${streamId}`;

      // 系统角色(根据调用方传入或默认)
      const systemRole =
        params.systemRole ??
        '你是视频脚本创作助手,根据用户给的主题/上游情节,生成符合剧本结构的输出(脚本/分镜/情节),纯文本输出,不要 JSON,不要代码块。';

      // 构造请求(视频站不涉及 agent / tools,只取模型能力)
      const chatRequest = {
        agentId: 'video-workflow',
        agentName: 'AI 视频工作流',
        childAgents: [],
        collaborationMode: 'direct',
        dispatchType: 'direct',
        eventName,
        message: params.instruction,
        modelConfig: { temperature: model.temperature || 0.7 },
        modelId: selectedModelId,
        parentAgentId: '',
        role: systemRole,
        skills: [],
        timeout: model.timeout || 60,
        toolMode: 'none',
        tools: [],
      };

      activeEventName.current = eventName;
      // 统一只监听主事件名;done/error 字段在主事件 payload 中解析
      EventsOn(eventName, handleEvent);

      setIsGenerating(true);
      setLastError(null);

      streamChatAPI(chatRequest as Parameters<typeof streamChatAPI>[0]).catch(
        (error: unknown) => {
          if (cancelFlag.current) return;
          const msg = error instanceof Error ? error.message : String(error);
          setLastError(msg);
          setIsGenerating(false);
          params.onError?.(msg);
          if (activeEventName.current) {
            EventsOff(activeEventName.current);
            EventsOff(`${activeEventName.current}:done`);
            EventsOff(`${activeEventName.current}:error`);
            activeEventName.current = null;
          }
          activeBuffer.current = '';
          activeCallbacks.current = {};
        },
      );
    },
    [handleEvent, handleComplete, handleError],
  );

  return { cancel, generateForNode, isGenerating, lastError };
}
