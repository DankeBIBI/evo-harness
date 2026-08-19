/**
 * 工具调用基础类型定义
 */

// 工具调用协议类型
export type ToolProtocol =
  | 'anthropic'
  | 'azure'
  | 'claude-code'
  | 'google'
  | 'openai';

// 工具调用结果
export interface ToolResult {
  /** 工具分类(由 processToolCalls 按 call.name → toolRegistry 查 category 填入)
   *  - 'file' 类(读文件/grep 文件等)绝不参与 compact(避免对话不准)
   *  - 'meta' / 'plan' 类按阈值压缩
   */
  category?: ToolCategory;
  error?: string;
  id: string;
  output: string;
}

// 工具调用请求（统一格式）
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// JSON Schema 简化版(仅 type/required/properties/description,够 LLM 拼参数用)
export interface ParamSchema {
  type: 'array' | 'boolean' | 'number' | 'object' | 'string';
  description?: string;
  enum?: string[];
  items?: ParamSchema;
  properties?: Record<string, ParamSchema>;
  required?: string[];
}

/** 工具分类(供 list_tools 过滤)
 *  - 'file': 文件读写
 *  - 'meta': 元工具(discover / get_def)
 *  - 'plan': 计划审批 + todo
 *  - 'interactive': 与用户交互(AskUser 等需 UI 呈现的工具)
 */
export type ToolCategory = 'file' | 'interactive' | 'meta' | 'plan';

// 工具定义接口
export interface Tool {
  /** 工具分类(list_tools 过滤用) */
  category: ToolCategory;
  description: string;
  /**
   * 执行入口
   * - 第一个参数：工具入参(原 JSON Schema 解析后的对象)
   * - 第二个参数(可选,2026-07-24 加)：当前 tool_call 全文(含 call.id,供交互型工具
   *   按 tcId 关联独立 UI/状态用)。不需的旧实现可以忽略(签名兼容)。
   */
  execute: (
    params: Record<string, unknown>,
    call?: ToolCall,
  ) => Promise<string>;
  name: string;
  /**
   * 工具参数的 JSON Schema(简化版)
   * - 与 description 末尾的 "Params: ..." 文本描述不同,这是结构化定义
   * - 用于 get_tool_def 返回给 LLM 做精确参数拼装
   */
  params: ParamSchema;
}

// AI 模型配置（用于工具过滤）
export interface ModelConfig {
  provider: string;
  supportsStreaming?: boolean;
  supportsToolCall?: boolean;
  supportsVision?: boolean;
}
