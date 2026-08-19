/**
 * 内容处理器类型定义(lib/content/types)
 */

/** 内容上下文:告诉处理器谁在提交、给哪个 agent、当前模式 */
export interface ContentContext {
  agentId: string;
  convId: string;
  mode: 'auto' | 'edit' | 'plan';
  /** 注入到开头的标记物(仅元数据,不可见) */
  markers?: { planMode?: boolean; memory?: string; bgJobs?: string };
}

/** 解析出的文件引用 */
export interface FileChip {
  path: string;
  range?: [number, number];
}

/** 内容处理结果 */
export interface ContentResult {
  /** 真正发给 AI 的 user 文本(已含 markers 拼接) */
  composed: string;
  /** 解析出的 chips,用于 UI 渲染引用块 */
  chips: { agents: string[]; skills: string[]; files: FileChip[] };
  /** 原始副本,供"用户编辑撤销"使用 */
  original: string;
}
