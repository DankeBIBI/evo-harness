package constants

// MaxAgentDispatchDepth 子代理嵌套派遣的最大深度
// 0 = 顶层主代理，1 = 一级子代理，2 = 二级子代理，3 = 三级子代理
// 超过该深度的派遣将被拒绝，防止无限递归
const MaxAgentDispatchDepth = 3
