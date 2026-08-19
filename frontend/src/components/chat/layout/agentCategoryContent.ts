import type { AgentCategory } from '@/stores/layoutStore';

/**
 * 智能体管理弹窗 - 各类别的内容数据
 *
 * 设计:
 *   - title: 类别标题
 *   - description: 描述段落（包含 1 个可点击链接）
 *   - linkLabel: 链接文案
 *   - groups: 分组列表（用户 / 工作区 / 系统）
 *
 * 注: 描述文本与设计图严格对应；具体列表项可后续从后端 API 拉取
 */

export interface CategoryItem {
  name: string;
  description: string;
}

export interface CategoryGroup {
  label: string;
  items: CategoryItem[];
}

export interface CategoryContent {
  title: string;
  description: string;
  linkLabel: string;
  groups: CategoryGroup[];
}

export const categoryContent: Record<AgentCategory, CategoryContent> = {
  cli: {
    title: '命令行',
    description: '在终端中直接调用本地命令行能力执行任务。',
    linkLabel: '详细了解',
    groups: [{ label: '已安装', items: [] }],
  },
  agents: {
    title: '智能体',
    description: '智能体是可复用的角色定义，每个智能体包含专属的指令、工具与上下文。',
    linkLabel: '详细了解智能体',
    groups: [
      {
        label: '用户',
        items: [
          {
            name: 'ai_agent-creator',
            description: 'Agent 编排工具，引导用户创建多个相互协作的 Agent，支持工作流编排与任务分配。',
          },
          {
            name: 'ai_agent-self-healer',
            description: 'Agent 自检机制，当用户反馈不满足/有问题时，此 Agent 可发现并优化子时刻，自动更新当前 Agent 自身。',
          },
        ],
      },
    ],
  },
  skills: {
    title: '技能',
    description:
      '技能会加载包含命令、脚本和资源的文件，用于执行专用任务。',
    linkLabel: '详细了解技能技能',
    groups: [
      {
        label: '用户',
        items: [
          {
            name: 'ai_agent-creator',
            description: 'Agent 编排工具，引导用户创建多个相互协作的 Agent，支持工作流编排与任务分配。',
          },
          {
            name: 'ai_agent-self-healer',
            description: 'Agent 自检机制，当用户反馈不满足/有问题时，此 Agent 可发现并优化子时刻，自动更新当前 Agent 自身。',
          },
          {
            name: 'api_test',
            description:
              '数智云 API 登录认证与接口测试工具，支持 RSA 加密登录、Token 管理、接口测试与结果汇总。',
          },
          {
            name: 'apps_activated-refresh-developer',
            description: 'keep-alive 页面激活时刷新表格和下拉数据模式…',
          },
          {
            name: 'apps_analysis-report',
            description: '创建业务分析报表页面，包含查询表单、VueTable表格、导出Excel、打印功能。',
          },
          {
            name: 'apps_analysis-report-data-hook',
            description: '分析报表数据 Hook 开发技能，提供页面数据获取、转换、聚合逻辑封装为可复用 Hook。',
          },
          {
            name: 'apps_api-data-strict-developer',
            description:
              'API 数据严格使用技能，确保 Agent 百分之百按照接口定义的字段进行处理，不衍生、不猜测、不新增未定义的字段。',
          },
          {
            name: 'apps_api-type-reuse-developer',
            description:
              'API 类型复用开发技能，自动检测并修复表单类型与 API 类型不匹配、重复定义等问题。',
          },
          {
            name: 'apps_common-page-component',
            description: '可复用页面组件 Skill',
          },
          {
            name: 'apps_create-api-developer',
            description: '创建接口 API 文档技能，提供完整的 API 层开发流程，包括接口查询、类型定义、API 函数创建等。',
          },
        ],
      },
    ],
  },
  prompts: {
    title: '指令',
    description: '指令是可复用的提示词模板，每个指令定义了一类任务的输入输出规范。',
    linkLabel: '详细了解指令',
    groups: [
      {
        label: '系统',
        items: [
          {
            name: '代码审查',
            description: '按照团队规范对代码变更进行审查，输出结构化反馈。',
          },
        ],
      },
    ],
  },
  hooks: {
    title: '挂钩',
    description: '挂钩允许在 Agent 工作流的关键节点注入自定义脚本。',
    linkLabel: '详细了解挂钩',
    groups: [{ label: '已配置', items: [] }],
  },
  mcp: {
    title: 'MCP服务器',
    description: 'MCP(Model Context Protocol) 服务器提供标准化的工具与资源。',
    linkLabel: '详细了解 MCP',
    groups: [
      {
        label: '已连接',
        items: [
          {
            name: 'filesystem',
            description: '本地文件系统访问，支持读取/写入/搜索文件。',
          },
        ],
      },
    ],
  },
  plugins: {
    title: '插件',
    description: '通过插件机制扩展 IDE 能力。',
    linkLabel: '详细了解插件',
    groups: [{ label: '已安装', items: [] }],
  },
};
