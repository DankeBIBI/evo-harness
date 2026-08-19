/**
 * P2-2: 错误码 i18n 翻译表
 *
 * 错误码定义与后端 constants/error_code.go 保持一致
 * 前端在收到 type='error' + code 字段时,优先用本表翻译成用户可读文案
 * 翻译表只含"用户能看懂的话",具体技术细节(URL/状态码等)由 code 决定
 *
 * 维护:
 *   - 后端加新 code 时,同步在本表加条目
 *   - 用户语言切换(settingsStore.language)时,后续可扩展为按 language 分组
 */

export type ErrorCode = number;

/** 错误码常量(与后端 constants/error_code.go 一一对应) */
export const ErrorCode = {
  Unknown: 0,
  Panic: 1,
  ContextCanceled: 2,
  Timeout: 3,
  ModelNotConfigured: 100,
  ModelConfigInvalid: 101,
  ModelNotFound: 102,
  ProviderUnknown: 200,
  ProviderRequestFailed: 201,
  ProviderHTTPStatus: 202,
  ProviderReadError: 203,
  ProviderParseError: 204,
  ProviderNoChoices: 205,
  CacheNotEnabled: 300,
  CachePrefixInvalid: 301,
  AgentNotFound: 400,
  DispatchTooDeep: 401,
  DispatchCircular: 402,
  DispatchUnknownMode: 403,
  ToolExecFailed: 500,
  ToolResultMissing: 501,
  ToolResultParseFailed: 502,
  ContinuationRoundsExceeded: 600,
  ResponseStuckPartial: 601,
} as const;

/**
 * 错误翻译条目
 * - title: 简短标题(用于 toast/弹窗标题)
 * - hint: 操作建议(用户能理解的修复方向)
 */
interface ErrorTranslation {
  hint: string;
  title: string;
}

const TRANSLATIONS: Record<number, ErrorTranslation> = {
  [ErrorCode.Unknown]: {
    title: '未知错误',
    hint: '请稍后重试,或查看日志了解详情。',
  },
  [ErrorCode.Panic]: {
    title: '内部错误',
    hint: '后端处理时发生未捕获异常。请重试,若反复出现请提交 issue。',
  },
  [ErrorCode.ContextCanceled]: {
    title: '已取消',
    hint: '对话已被你主动停止。重新发送消息即可。',
  },
  [ErrorCode.Timeout]: {
    title: '请求超时',
    hint: '模型响应过慢,可在设置中调大 requestTimeout,或换用更快的模型。',
  },
  [ErrorCode.ModelNotConfigured]: {
    title: '未配置模型',
    hint: '请在"模型管理"中添加并启用一个模型。',
  },
  [ErrorCode.ModelConfigInvalid]: {
    title: '模型配置无效',
    hint: '请检查 BaseURL / APIKey 是否填写正确。',
  },
  [ErrorCode.ModelNotFound]: {
    title: '模型未找到',
    hint: '请确认所选模型已启用且未删除。',
  },
  [ErrorCode.ProviderUnknown]: {
    title: '未知 Provider',
    hint: '请检查模型 Provider 字段,或联系管理员。',
  },
  [ErrorCode.ProviderRequestFailed]: {
    title: 'Provider 请求失败',
    hint: '可能是网络问题或 API Key 失效,请稍后重试。',
  },
  [ErrorCode.ProviderHTTPStatus]: {
    title: 'Provider 返回非 200',
    hint: '请查看后端日志的 HTTP 状态码和响应体。',
  },
  [ErrorCode.ProviderReadError]: {
    title: '响应读取失败',
    hint: '可能是网络中断导致流截断,请重试。',
  },
  [ErrorCode.ProviderParseError]: {
    title: '响应解析失败',
    hint: 'Provider 返回了非预期格式,可能是协议不兼容或模型临时异常。',
  },
  [ErrorCode.ProviderNoChoices]: {
    title: '响应无 choices',
    hint: 'Provider 返回了空响应,可能是限流或账号欠费。',
  },
  [ErrorCode.CacheNotEnabled]: {
    title: '缓存未启用',
    hint: '请在"设置"中开启 Cache.Enabled。',
  },
  [ErrorCode.CachePrefixInvalid]: {
    title: '缓存前缀异常',
    hint: '已自动跳过缓存,可继续对话,稍后检查缓存配置。',
  },
  [ErrorCode.AgentNotFound]: {
    title: 'Agent 不存在',
    hint: '所选 Agent 可能被删除,请重新选择。',
  },
  [ErrorCode.DispatchTooDeep]: {
    title: '派遣深度超限',
    hint: 'Agent 嵌套派遣超过最大深度,部分子任务未执行。',
  },
  [ErrorCode.DispatchCircular]: {
    title: '派遣循环调用',
    hint: 'Agent 链中存在循环依赖,已自动阻断。',
  },
  [ErrorCode.DispatchUnknownMode]: {
    title: '未知协作模式',
    hint: 'Agent 的 collaborationMode 字段配置错误,已回退到直接执行。',
  },
  [ErrorCode.ToolExecFailed]: {
    title: '工具执行失败',
    hint: '查看工具错误详情,检查文件路径/权限/参数是否正确。',
  },
  [ErrorCode.ToolResultMissing]: {
    title: '工具结果缺失',
    hint: 'AI 调用了工具但未返回结果,可能需要重新发送。',
  },
  [ErrorCode.ToolResultParseFailed]: {
    title: '工具结果解析失败',
    hint: '工具返回格式异常,已跳过该结果。',
  },
  [ErrorCode.ContinuationRoundsExceeded]: {
    title: '工具调用轮数超限',
    hint: 'AI 工具调用陷入循环,已自动停止。',
  },
  [ErrorCode.ResponseStuckPartial]: {
    title: '响应停留在 partial 工具调用',
    hint: 'AI 输出了未闭合的 tool_call,已自动跳过该段。',
  },
};

/** 兜底翻译(未在表里的 code 走这里) */
const FALLBACK: ErrorTranslation = {
  title: '错误',
  hint: '请查看下方详情。',
};

/**
 * 翻译错误码为用户可读文案
 * @param code 后端传过来的错误码(int,可能为 0/未传)
 * @param rawContent 原始错误字符串(用于兜底展示)
 * @returns {title, hint} 用于前端 UI
 */
export function translateError(
  code: number | undefined,
  rawContent: string,
): ErrorTranslation {
  if (code && code in TRANSLATIONS) {
    return TRANSLATIONS[code];
  }
  return FALLBACK;
}

/**
 * 格式化错误用于 onFeedback / toast
 * 输出: "[title] rawContent\n💡 hint"
 */
export function formatErrorFeedback(
  code: number | undefined,
  rawContent: string,
): string {
  const t = translateError(code, rawContent);
  return `${t.title}: ${rawContent}\n💡 ${t.hint}`;
}
