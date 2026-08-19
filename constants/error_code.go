package constants

// ErrorCode 错误码体系
// P2-2: 统一错误分类,前端按 code 查 i18n 表翻译成用户可读文案
// 命名规范: Err<子系统><场景>
// 数值: 0-999 保留给系统错误(同 HTTP status), 1000+ 业务错误
type ErrorCode int

const (
	// 通用错误 (0-99)
	ErrUnknown ErrorCode = 0
	ErrPanic   ErrorCode = 1
	// ErrContextCanceled 用户主动取消(handleStop 触发 ctx.Done())
	ErrContextCanceled ErrorCode = 2
	// ErrTimeout 请求超时(requestTimeout 超时)
	ErrTimeout ErrorCode = 3

	// 模型相关 (100-199)
	ErrModelNotConfigured ErrorCode = 100
	// ErrModelConfigInvalid 模型配置无效(BaseURL/APIKey 为空等)
	ErrModelConfigInvalid ErrorCode = 101
	// ErrModelNotFound 模型未在 modelService 中找到
	ErrModelNotFound ErrorCode = 102

	// Provider 相关 (200-299)
	ErrProviderUnknown ErrorCode = 200
	// ErrProviderRequestFailed HTTP 请求失败(网络/超时/5xx)
	ErrProviderRequestFailed ErrorCode = 201
	// ErrProviderHTTPStatus 非 200 状态码
	ErrProviderHTTPStatus ErrorCode = 202
	// ErrProviderReadError 流读取错误
	ErrProviderReadError ErrorCode = 203
	// ErrProviderParseError 响应 JSON 解析失败
	ErrProviderParseError ErrorCode = 204
	// ErrProviderNoChoices 响应里没有 choices 数组
	ErrProviderNoChoices ErrorCode = 205

	// 缓存相关 (300-399)
	ErrCacheNotEnabled ErrorCode = 300
	// ErrCachePrefixInvalid 缓存前缀快照不合法
	ErrCachePrefixInvalid ErrorCode = 301

	// 派遣/编排 (400-499)
	ErrAgentNotFound ErrorCode = 400
	// ErrDispatchTooDeep 派遣深度超过 MaxAgentDispatchDepth
	ErrDispatchTooDeep ErrorCode = 401
	// ErrDispatchCircular 派遣循环调用
	ErrDispatchCircular ErrorCode = 402
	// ErrDispatchUnknownMode 未知协作模式
	ErrDispatchUnknownMode ErrorCode = 403

	// 工具调用 (500-599)
	ErrToolExecFailed ErrorCode = 500
	// ErrToolResultMissing tool_call 缺少 result
	ErrToolResultMissing ErrorCode = 501
	// ErrToolResultParseFailed tool_result XML 解析失败
	ErrToolResultParseFailed ErrorCode = 502

	// 续传/分块 (600-699)
	ErrContinuationRoundsExceeded ErrorCode = 600
	// ErrResponseStuckPartial response 长时间停留在 partial tool_call
	ErrResponseStuckPartial ErrorCode = 601
)

// String 错误码的可读名称
func (c ErrorCode) String() string {
	switch c {
	case ErrUnknown:
		return "unknown"
	case ErrPanic:
		return "panic"
	case ErrContextCanceled:
		return "context_canceled"
	case ErrTimeout:
		return "timeout"
	case ErrModelNotConfigured:
		return "model_not_configured"
	case ErrModelConfigInvalid:
		return "model_config_invalid"
	case ErrModelNotFound:
		return "model_not_found"
	case ErrProviderUnknown:
		return "provider_unknown"
	case ErrProviderRequestFailed:
		return "provider_request_failed"
	case ErrProviderHTTPStatus:
		return "provider_http_status"
	case ErrProviderReadError:
		return "provider_read_error"
	case ErrProviderParseError:
		return "provider_parse_error"
	case ErrProviderNoChoices:
		return "provider_no_choices"
	case ErrCacheNotEnabled:
		return "cache_not_enabled"
	case ErrCachePrefixInvalid:
		return "cache_prefix_invalid"
	case ErrAgentNotFound:
		return "agent_not_found"
	case ErrDispatchTooDeep:
		return "dispatch_too_deep"
	case ErrDispatchCircular:
		return "dispatch_circular"
	case ErrDispatchUnknownMode:
		return "dispatch_unknown_mode"
	case ErrToolExecFailed:
		return "tool_exec_failed"
	case ErrToolResultMissing:
		return "tool_result_missing"
	case ErrToolResultParseFailed:
		return "tool_result_parse_failed"
	case ErrContinuationRoundsExceeded:
		return "continuation_rounds_exceeded"
	case ErrResponseStuckPartial:
		return "response_stuck_partial"
	default:
		return "unknown"
	}
}
