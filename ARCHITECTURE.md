# evo-harness 架构图

> Wails 桌面 Evo Harness · Cache-First 缓存架构 · 默认 MiniMax M3
> 最后更新：2026-06-13

---

## 一、项目总览

```
┌─────────────────────────────────────────────────────────────────┐
│                      evo-harness (Wails 桌面)                │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React + TS + Vite)   │   Backend (Go + Wails)        │
│  ├─ pages/                      │   ├─ app.go (服务编排入口)    │
│  ├─ components/chat/            │   ├─ services/                │
│  ├─ hooks/                      │   ├─ models/                  │
│  ├─ stores/                     │   ├─ constants/               │
│  └─ chat/protocol/              │   ├─ utils/                   │
│                                 │   └─ backend/ (子模块)        │
├─────────────────────────────────┴───────────────────────────────┤
│            AI Providers (多品牌) + Cache (Cache-First)          │
│  MiniMax M3 (默认) · M2.x · Claude · OpenAI · Ollama            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、目录结构

```
evo-harness/
├── app.go                                # 应用入口，组装所有 service
├── main.go                               # Wails main()
├── wails.json                            # Wails 配置
├── go.mod / go.sum                       # Go 依赖
├── package.json / pnpm-lock.yaml         # 前端依赖
│
├── models/                               # 数据模型
│   ├── cache.go                          # CacheConfig + CacheMode 枚举
│   ├── settings.go                       # UserSettings + AIProvider 枚举
│   ├── model.go                          # Model 结构（DB）
│   ├── conversation.go                   # Message + Conversation + StreamChatRequest
│   ├── agent.go / skill.go / analyzer.go / mcp.go / proxy.go
│
├── constants/
│   └── agent.go                          # MaxAgentDispatchDepth 等常量
│
├── services/                             # 业务服务层
│   ├── chat_service.go                   # ChatService (主服务，含 6 个缓存管理方法)
│   ├── ai_provider.go                    # 旧版 provider（保留兼容）
│   ├── agent_service.go / analyzer_service.go / file_service.go
│   ├── model_service.go / mcp_service.go / proxy_service.go
│   ├── skill_service.go / settings_service.go
│   │
│   ├── cache/                            # ── Cache-First 缓存子系统 ──
│   │   ├── prefix_shape.go               # 前缀哈希快照
│   │   ├── tracker.go                    # 缓存命中追踪（atomic.Int64）
│   │   ├── compact.go                    # 上下文压缩算法
│   │   ├── compose.go                    # Turn Tail Injection 拼装
│   │   ├── cost.go                       # 模型价格表 + 消费估算
│   │   └── manager.go                    # 缓存能力聚合入口
│   │
│   └── provider/                         # ── 多品牌 Provider 抽象 ──
│       ├── provider.go                   # Provider 接口 + Registry
│       ├── provider_minimax.go           # M3 默认（OpenAI 兼容 + 自动缓存）
│       ├── provider_anthropic.go         # M2.x（Anthropic + cache_control）
│       ├── provider_openai.go            # 通用 OpenAI 兼容
│       ├── provider_ollama.go            # Ollama 本地
│       └── provider_common.go            # 共用 HTTP 工具
│
├── utils/                                # 工具方法
│   ├── db.go                             # SQLite 连接
│   └── crypto.go                         # 加密工具
│
├── backend/                              # 独立的子模块（独立 go.mod）
│
├── frontend/                             # 前端 (React 18 + Vite + TS)
│   ├── src/
│   │   ├── App.tsx / main.tsx / index.css
│   │   ├── pages/                        # 路由页
│   │   │   ├── chat.tsx / settings.tsx / models.tsx / agents.tsx
│   │   │   ├── editor.tsx / index.tsx / mcp.tsx / prompts.tsx
│   │   │   ├── providers.tsx / project.tsx / skills.tsx
│   │   ├── components/
│   │   │   ├── chat/                     # ── 聊天组件 ──
│   │   │   │   ├── ChatInput.tsx         # 输入框（含 TokenBar）
│   │   │   │   ├── ChatWindow.tsx        # 聊天窗口（透传 cache stats）
│   │   │   │   ├── ChatMessages.tsx      # 消息渲染
│   │   │   │   ├── ChatHeader.tsx / ChatList.tsx / ChatEmptyHero.tsx
│   │   │   │   ├── StreamingMessage.tsx  # 流式消息
│   │   │   │   ├── ToolCallRenderer.tsx / ToolConfirmDialog.tsx
│   │   │   │   ├── AgentExecutionList.tsx / AgentSelectDialog.tsx
│   │   │   │   ├── TokenStats.tsx        # ★ 缓存命中弹层
│   │   │   │   ├── TokenBar.tsx          # ★ input 下方实时 token 条
│   │   │   │   └── hooks/
│   │   │   │       ├── useChatStreaming.ts  # ★ 接收 cache_usage 事件
│   │   │   │       ├── useChatSession.tsx
│   │   │   │       ├── useChatCodeApply.ts / useChatDebug.ts
│   │   │   │       ├── useChatOrchestration.ts / useChatProject.ts
│   │   │   │       ├── useChatWorkspace.ts / useToolCall.ts
│   │   │   │       ├── cache-optimizer.ts
│   │   │   │       └── useCostTracking.ts
│   │   │   ├── agent/ / editor/ / file/ / ui/    # 其他组件
│   │   ├── hooks/                        # 全局 hooks
│   │   ├── stores/                       # Zustand stores
│   │   │   ├── chatStore.ts              # ★ tokenStats 类型扩展（cache 字段）
│   │   │   ├── agentStore.ts / modelStore.ts / settingsStore.ts
│   │   │   ├── modeStore.ts / planStore.ts / promptStore.ts
│   │   │   ├── providerStore.ts / skillStore.ts / todoStore.ts
│   │   ├── services/                     # 前端 API 客户端
│   │   ├── lib/                          # 工具 (utils, etc.)
│   │   ├── types/ / styles/
│   │   ├── wailsjs/                      # Wails 自动生成的 JS 绑定
│   │   └── chat/protocol/                # 协议定义
│   └── public/ / vite.config.ts / tailwind.config.mjs / tsconfig.json
│
└── REASONIX.md                           # 项目说明
```

---

## 三、Cache-First 缓存架构（核心）

```
┌────────────────────────────────────────────────────────────────────┐
│                    cache (Cache-First 核心子系统)                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐  │
│   │  prefix_shape   │   │    tracker      │   │    compact      │  │
│   │  ─────────────  │   │  ─────────────  │   │  ─────────────  │  │
│   │  PrefixShape    │   │  CacheTracker   │   │  CompactPlan    │  │
│   │  CaptureShape() │   │  Record(Usage)  │   │  PlanCompaction │  │
│   │  CompareShape() │   │  Session()      │   │  BuildSummary   │  │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘  │
│                                                                     │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐  │
│   │    compose      │   │     cost        │   │    manager      │  │
│   │  ─────────────  │   │  ─────────────  │   │  ─────────────  │  │
│   │  ComposeInput   │   │  modelPrice     │   │  Manager        │  │
│   │  Compose()      │   │  EstimateCost   │   │  (聚合入口)     │  │
│   │  Snapshot()     │   │  (CNY/1M tok)   │   │                 │  │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### 数据流

```
[用户输入] ─→ ChatService.StreamChat
                    │
                    ├─ cacheMgr.CaptureShape()  采集前缀快照 (sha256)
                    ├─ Turn Tail Injection     注入 plan mode / memory
                    ├─ prov.Stream()            走 MiniMax / Anthropic 协议
                    │     │
                    │     └─ onChunk callback
                    │           ├─ Tracker.Record()    累计 token / cache
                    │           └─ EventsEmit("cache_usage", { cacheRead, cacheCreation, hitRate, costCny })
                    │                              │
                    └──────────────────────────────┴─→ 前端 useChatStreaming
                                                          │
                                                          ├─ setTokenStats(累计)
                                                          └─ updateConversationTokenStats()
                                                                     │
                                                                     └─ TokenBar / TokenStats 实时刷新
```

---

## 四、Provider 多品牌架构

```
                      provider.DefaultRegistry.Get(providerName)
                                          │
        ┌─────────────────┬───────────────┼───────────────┬─────────────────┐
        │                 │               │               │                 │
        ▼                 ▼               ▼               ▼                 ▼
   ┌─────────┐      ┌─────────┐     ┌──────────┐    ┌──────────┐       ┌──────────┐
   │ MiniMax │      │Anthropic│     │  OpenAI  │    │  Ollama  │       │  Claude  │
   │ (默认)  │      │         │     │          │    │          │       │          │
   ├─────────┤      ├─────────┤     ├──────────┤    ├──────────┤       ├──────────┤
   │ M3 推荐 │      │ M2.x +  │     │ 兼容协议 │    │ /api/chat│       │ 委托     │
   │ OpenAI  │      │Messages │     │ 委托     │    │ 本地     │       │ Anthropic│
   │ 兼容 +  │      │  +      │     │ MiniMax  │    │          │       │          │
   │ 自动缓存│      │cache_   │     │          │    │          │       │          │
   │         │      │control  │     │          │    │          │       │          │
   └─────────┘      └─────────┘     └──────────┘    └──────────┘       └──────────┘
        │                │               │               │                 │
        └────────────────┴───────────────┴───────────────┴─────────────────┘
                                          │
                                          ▼
                              provider.Provider 接口
                          (Chat / Stream / SupportsCache)
```

### 默认配置

```go
// services/settings_service.go → defaultSettings()
AI: AIModelConfig{
    Provider:    "minimax",                        // 默认 MiniMax
    ModelName:   "MiniMax-M3",                     // 1M 上下文 + 多模态
    BaseURL:     "https://api.minimaxi.com/v1",   // OpenAI 兼容协议
    ...
},
Cache: &CacheConfig{
    Enabled:            true,                       // 默认开启
    Mode:               "auto",                     // 被动缓存
    CompactEnabled:     true,                       // 默认开启压缩
    CompactRatio:       0.8,
    CompactTargetRatio: 0.5,
    MinCompactTokens:   2048,
    TrackMetrics:       true,
},
```

---

## 五、前端聊天架构

```
                ┌──────────────────────────────────────┐
                │           ChatWindow                 │
                │  (orchestrator / orchestrator router)│
                └──────────────┬───────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  ChatHeader           ChatMessages            ChatInput
                                                ┌──────────┐
                                                │ TokenBar │  ← 新增
                                                │  ★       │
                                                └──────────┘
        ┌──────────────────────┴──────────────────────┐
        │             useChatStreaming                │
        │  ─────────────────────────────────────────  │
        │  EventsOn(eventName)                         │
        │    ├─ data.content         → 流式文本       │
        │    ├─ data.done            → 完成          │
        │    ├─ data.type='cache_usage' → 缓存统计   │
        │    └─ data.type='child_result' → 子代理    │
        │  → updateConversationTokenStats()           │
        └─────────────────────────────────────────────┘
                               │
                ┌──────────────┴────────────────┐
                │        Zustand stores         │
                │  ───────────────────────────  │
                │  chatStore.tokenStats:        │
                │   - inputTokens               │
                │   - outputTokens              │
                │   - cacheReadTokens    ★新增 │
                │   - cacheCreationTokens ★新增 │
                │   - hitRate             ★新增 │
                │   - totalCostCny        ★新增 │
                └───────────────────────────────┘
```

### TokenBar 布局（input 框下方）

```
┌──────────────────────────────────────────────────────────────────┐
│ [Database] ████████████ 12.5k/1.0M │ [Zap] 8.2k [68%] │ [Wallet] ¥0.05 │
└──────────────────────────────────────────────────────────────────┘
   ↑ 上下文进度条                ↑ 缓存命中 + 命中率徽章       ↑ 累计消费
   (主色雾蓝，≥70%琥珀)        (绿色信号色，按 70%/30% 切色阶)   (中性灰)
```

---

## 六、ChatService 公开 API

| 方法 | 用途 |
| --- | --- |
| `StreamChat(req)` | 流式对话主入口（注入缓存能力） |
| `Chat(agentId, message)` | 非流式对话 |
| `EnablePlanMode(agentID, convID, enabled)` | 启用 Plan Mode（写入 turn tail） |
| `InjectMemory(agentID, convID, content)` | 注入 memory 更新（不破坏前缀） |
| `SetBgJobsCompleted(agentID, convID, content)` | 注入后台任务完成 |
| `PlanConversationCompaction(...)` | 规划压缩 |
| `PerformConversationCompaction(...)` | 执行压缩 |
| `GetCacheHitRate(agentID, convID)` | 获取命中率 |
| `GetCacheStats(agentID, convID)` | 获取聚合统计 |

---

## 七、关键设计原则

| 原则 | 实现 |
| --- | --- |
| **Cache-First** | 系统提示词 + skills + history 字节稳定，最大化服务端 KV cache 命中 |
| **Turn Tail Injection** | 动态信息（plan mode / memory）注入 user message 头部，不破坏前缀 |
| **Append-Only Prompt** | 会话消息只追加不修改；压缩走单独 compaction 流程 |
| **Append-Only Counter** | 缓存命中率在 compaction 后不重置，保留累计收益 |
| **Provider Registry** | 多品牌通过 `provider.DefaultRegistry.Register()` 注册 |
| **复合缓存键** | `agentID + "|" + conversationID`，多会话同 agent 缓存隔离 |
| **拆文件原则** | 按品牌/子系统拆分；不为拆而拆（聚合子代理逻辑保持集中） |

---

## 八、文件规模统计

> 注：以下 `services/` 为历史 Go 后端结构，当前仓库已不包含该目录；缓存子系统已迁移为前端实现（`frontend/src/lib/cache/`）。

```
services/cache/                            789 行
  prefix_shape.go                          156 行
  tracker.go                               118 行
  compact.go                               222 行
  compose.go                               141 行
  cost.go                                   64 行
  manager.go                                88 行

services/provider/                         831 行
  provider.go                              122 行
  provider_minimax.go                      221 行
  provider_anthropic.go                    252 行
  provider_openai.go                        35 行
  provider_ollama.go                       138 行
  provider_common.go                        63 行

services/chat_service.go                   948 行  (含子代理派遣逻辑)
```

---

## 九、完整数据流（端到端）

```
┌─────────────────────────────────────────────────────────────────────┐
│  [前端] User 输入                                                    │
│    ↓                                                                 │
│  ChatInput.estimateTokens(input)                                     │
│    ↓ 显示 TokenBar 草稿                                              │
│    ↓ onSend()                                                        │
│  useChatStreaming.sendMessage()                                      │
│    ↓ streamChatAPI(req)                                              │
│  ─── Wails IPC ────────────────────────────────────────────────────  │
│  [后端] ChatService.StreamChat(req)                                  │
│    ├─ cacheMgr.CaptureShape()     采集前缀快照                      │
│    ├─ cacheMgr.CompareShape()     检测前缀变化                       │
│    ├─ cacheMgr.ComposeState()     读取 turn tail 状态                │
│    ├─ cache.Compose()             拼装 user message 头部             │
│    ├─ provider.DefaultRegistry.Get().Stream()                       │
│    │     ├─ MiniMax:  OpenAI /chat/completions + 自动缓存           │
│    │     └─ Anthropic: Messages + cache_control                       │
│    └─ onChunk callback                                                │
│          ├─ cacheMgr.Tracker.Record()    累计 token                   │
│          ├─ EventsEmit("cache_usage")   上报前端                      │
│          └─ EventsEmit("content")        流式文本                      │
│  ─── Wails Event (StreamChunk) ────────────────────────────────────  │
│  [前端] useChatStreaming.eventHandler                                 │
│    ├─ setTokenStats(累计 cache + cost)                                │
│    ├─ updateConversationTokenStats(chatStore)                        │
│    └─ updateMessage(content 累积)                                     │
│         ↓                                                              │
│  ChatMessages 实时渲染                                                │
│  TokenBar / TokenStats 实时刷新                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 十、未来扩展点

| 方向 | 文件位置 |
| --- | --- |
| 新增 Provider | `services/provider/provider_<brand>.go` + `provider.Registry.Register()` |
| 新增缓存策略 | `frontend/src/lib/cache/` 下新增子模块 |
| 调整默认价格表 | `frontend/src/lib/cache/cost.ts` 的模型价格表 |
| 调整缓存参数 | `frontend/src/lib/cache/manager.ts` 的 `DEFAULT_CACHE_CONFIG` |
| 新增压缩算法 | `frontend/src/lib/cache/compact.ts` 的 `planCompaction` |
| 前端 TokenBar 样式 | `frontend/src/components/chat/TokenBar.tsx` |
| 前端缓存命中弹层 | `frontend/src/components/chat/TokenStats.tsx` |

---

## 十一、相关文档

- [`REASONIX.md`](./REASONIX.md) - 项目说明
- [`docs/codingStandards.md`](./docs/codingStandards.md) - 编码规范
- [`docs/COMPONENT_PublicDict_DESIGN.md`](./docs/COMPONENT_PublicDict_DESIGN.md) - 组件设计
- [`docs/DESIGN.zh-CN.md`](./docs/DESIGN.zh-CN.md) - 系统设计

---

## 十二、变更日志

| 日期 | 变更 |
| --- | --- |
| 2026-06-13 | 初始架构图；完成 Cache-First 缓存子系统；多品牌 Provider 抽象；前端 TokenBar/TokenStats 集成 |
