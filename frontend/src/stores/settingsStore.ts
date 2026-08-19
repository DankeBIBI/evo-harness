import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DialogAnimation =
  | 'default'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'magic';

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  themeStyle: 'default' | 'lowpoly' | 'pastoral' | 'liquid-glass' | 'vscode';
  language: 'zh-CN' | 'en-US';
  /** 界面字体大小 (12-20) */
  fontSize: number;
  /** 图标大小基数 (14-24)，所有图标类名 h-X w-X 使用此基数计算 */
  iconSize: number;
  /** 标题字重 (400-700) */
  fontWeight: number;
  /** AI 请求默认超时时间(秒)，默认 1800(30分钟)，0 表示不超时 */
  requestTimeout: number;
  /** 功能动画：切换对话时的展开填充动画 */
  enableTransitionAnimation: boolean;
  /** Dialog 打开动画方向 */
  dialogAnimation: DialogAnimation;
  /** 沉浸式对话：AI 气泡无边框/背景/阴影，与背景融为一体 */
  immersiveChatMode: boolean;
  /** AI 编辑器模式：启用 Cursor 风格的代码编辑界面 */
  editorMode: boolean;
  /** 自动任务路由：未手动选 Agent 时，按消息内容自动选 orchestrator 入口 */
  autoRoute: boolean;
  /** AI 工具权限档位:plan=只读规划 / edit=按工具默认权限(写操作需确认) / auto=全部自动通过 */
  toolMode: 'auto' | 'edit' | 'plan';
  /**
   * 流式内容最大长度（字符）。超出后强制停流以保护 WebView2 渲染进程不被压垮。
   * 调整后立即生效，下一轮 sendMessage 起作用。
   */
  streamingMaxLength: number;
  /** 工具调用续传最大轮数。超出后强制停止续传（防 AI 工具循环死循环）。 */
  maxContinuationRounds: number;
  /**
   * 工具调用 ID 去重开关。
   * 关闭时：每个 SSE chunk 解析出的 tool_call 都会触发执行（依赖上游保证不重发）。
   * 打开时：按"原始 id"去重，重复出现则跳过。
   */
  enableToolDedup: boolean;
  /**
   * 工具结果累积 compact 总开关（默认关闭）。
   * 关闭时：sendContinuation 续传前不动 accumulatedResults，原样透传给 AI。
   * 开启时：累积结果总字符 > compactAccumulatedChars 时按 category 智能压缩：
   *   - file 类（读文件/grep 等）永远保留完整内容（避免 AI 拿到残缺文件错过关键代码）
   *   - 其余类走"跨结果省略"：预算内完整保留,超预算整条省略 + [结果已省略] 标记
   * 2026-08-19 方案 A：移除单条截断——旧策略截断让 AI 拿半截内容误以为完整,
   *                 判断"信息不足"重查 → 再截断 → 死循环
   * 显式禁用是默认行为，避免误伤。
   *
   * TODO(待后端配合): 加 "补读接口" —— 提供 ReadFileOffset(file, offset, limit) 让 AI
   * 主动补读被压缩或缺失的部分。当前 compact/file 豁免只是保底,真正修复需要让 AI
   * 能精准补读任意文件区间。这是后续独立任务的范畴。
   */
  enableCompactAccumulated: boolean;
  /**
   * 工具结果累积自动 compact 阈值（字符数）。
   * sendContinuation 触发前若 accumulatedResultsRef.current 总字符数超过此值,
   * 预算内每条结果完整保留,超预算整条省略为 [结果已省略] 标记,降低续传 token。
   * 0 = 禁用 compact
   */
  compactAccumulatedChars: number;
  /**
   * 模型推理深度档位（reasoning_effort）
   * - low    : 省 token, 快速回答
   * - medium : 默认档, 平衡
   * - high   : 复杂任务
   * - max    : 最高推理深度, 启用 thinking 预算
   */
  reasoningLevel: 'high' | 'low' | 'max' | 'medium';
}

interface SettingsState extends UserSettings {
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setThemeStyle: (
    style: 'default' | 'lowpoly' | 'pastoral' | 'liquid-glass' | 'vscode',
  ) => void;
  setLanguage: (language: 'zh-CN' | 'en-US') => void;
  setFontSize: (fontSize: number) => void;
  setIconSize: (iconSize: number) => void;
  setFontWeight: (fontWeight: number) => void;
  setRequestTimeout: (timeout: number) => void;
  setEnableTransitionAnimation: (enable: boolean) => void;
  setDialogAnimation: (animation: DialogAnimation) => void;
  setImmersiveChatMode: (enable: boolean) => void;
  setEditorMode: (enable: boolean) => void;
  setAutoRoute: (enable: boolean) => void;
  setToolMode: (mode: 'auto' | 'edit' | 'plan') => void;
  setStreamingMaxLength: (max: number) => void;
  setMaxContinuationRounds: (rounds: number) => void;
  setEnableToolDedup: (enable: boolean) => void;
  setEnableCompactAccumulated: (enable: boolean) => void;
  setCompactAccumulatedChars: (chars: number) => void;
  setReasoningLevel: (level: 'high' | 'low' | 'max' | 'medium') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      themeStyle: 'default',
      language: 'zh-CN',
      fontSize: 14,
      iconSize: 18,
      fontWeight: 500,
      requestTimeout: 1800, // 默认 30 分钟
      enableTransitionAnimation: true,
      dialogAnimation: 'default',
      immersiveChatMode: false,
      editorMode: false,
      autoRoute: true,
      toolMode: 'edit',
      streamingMaxLength: 200_000,
      maxContinuationRounds: 100,
      enableToolDedup: true,
      enableCompactAccumulated: false,
      compactAccumulatedChars: 20_000,
      reasoningLevel: 'medium',

      setTheme: (theme) => set({ theme }),
      setThemeStyle: (themeStyle) => set({ themeStyle }),
      setLanguage: (language) => set({ language }),
      setFontSize: (fontSize) => set({ fontSize }),
      setIconSize: (iconSize) => set({ iconSize }),
      setFontWeight: (fontWeight) => set({ fontWeight }),
      setRequestTimeout: (requestTimeout) => set({ requestTimeout }),
      setEnableTransitionAnimation: (enable) =>
        set({ enableTransitionAnimation: enable }),
      setDialogAnimation: (dialogAnimation) => set({ dialogAnimation }),
      setImmersiveChatMode: (immersiveChatMode) => set({ immersiveChatMode }),
      setAutoRoute: (autoRoute) => set({ autoRoute }),
      setEditorMode: (editorMode) => set({ editorMode }),
      setToolMode: (toolMode) => set({ toolMode }),
      setStreamingMaxLength: (streamingMaxLength) => set({ streamingMaxLength }),
      setMaxContinuationRounds: (maxContinuationRounds) => set({ maxContinuationRounds }),
      setEnableToolDedup: (enableToolDedup) => set({ enableToolDedup }),
      setEnableCompactAccumulated: (enableCompactAccumulated) =>
        set({ enableCompactAccumulated }),
      setCompactAccumulatedChars: (compactAccumulatedChars) =>
        set({ compactAccumulatedChars }),
      setReasoningLevel: (reasoningLevel) => set({ reasoningLevel }),
    }),
    {
      name: 'ai-studio-settings',
      // v7: 移除 compactResultHeadChars（方案 A 不再单条截断）
      version: 7,
      migrate: (state: unknown, fromVersion: number) => {
        if (!state || typeof state !== 'object') return state;
        const s = state as Record<string, unknown>;
        if (fromVersion < 2) {
          // 清理 v1 残留字段(setMacMode 是 actions 不会被持久化,但 macMode 会被)
          delete s.macMode;
        }
        if (fromVersion < 3) {
          // toolMode 字段若不存在/非法,回落到默认 'edit'
          if (s.toolMode !== 'auto' && s.toolMode !== 'edit' && s.toolMode !== 'plan') {
            s.toolMode = 'edit';
          }
        }
        if (fromVersion < 4) {
          // v3 → v4: 流式控制字段兜底
          if (typeof s.streamingMaxLength !== 'number' || s.streamingMaxLength < 1000) {
            s.streamingMaxLength = 200_000;
          }
          if (typeof s.maxContinuationRounds !== 'number' || s.maxContinuationRounds < 1) {
            s.maxContinuationRounds = 100;
          }
          if (typeof s.enableToolDedup !== 'boolean') {
            s.enableToolDedup = true;
          }
          if (typeof s.enableCompactAccumulated !== 'boolean') {
            // 2026-07-04: 默认关闭,避免误伤文件类工具结果
            s.enableCompactAccumulated = false;
          }
        }
        if (fromVersion < 5) {
          // v4 → v5: compact 阈值兜底
          if (
            typeof s.compactAccumulatedChars !== 'number' ||
            s.compactAccumulatedChars < 0
          ) {
            s.compactAccumulatedChars = 20_000;
          }
        }
        if (fromVersion < 6) {
          // v5 → v6: reasoningLevel 兜底(老用户升级默认 medium)
          if (s.reasoningLevel !== 'low' && s.reasoningLevel !== 'medium' &&
              s.reasoningLevel !== 'high' && s.reasoningLevel !== 'max') {
            s.reasoningLevel = 'medium';
          }
          // 2026-07-04 反例修复: 老用户在 v5 期间可能手动开启过 compact 并被持久化为 true
          // 新代码默认 false + file 类豁免;为避免老用户继续被旧策略误伤,升级时强制重置
          s.enableCompactAccumulated = false;
        }
        if (fromVersion < 7) {
          // v6 → v7: 移除已废弃的 compactResultHeadChars(方案 A 不再单条截断)
          delete s.compactResultHeadChars;
        }
        return s;
      },
    },
  ),
);
