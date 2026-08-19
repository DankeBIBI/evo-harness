package constants

// 源路径模板(相对路径片段,用于 SourceLoader 拼绝对路径)
// 业务项目根: 运行时由前端传入或通过 WAILS_PROJECT_ROOT 环境变量注入
// 用户主目录: $HOME / %USERPROFILE%
const (
	// ProjectAgentsRel 工作项目下 Agent 目录
	ProjectAgentsRel = "agents/agents"
	// ProjectSkillsRel 工作项目下 Skill 目录
	ProjectSkillsRel = "agents/skills"
	// UserAgentsRel 用户目录下 Agent 目录(用户原约定: ~/.agents/agents)
	UserAgentsRel = ".agents/agents"
	// UserSkillsRel 用户目录下 Skill 目录
	UserSkillsRel = ".agents/skills"
)

// Claude 源路径约定:
//   - 用户主目录下 .claude 是 Claude Code 实际安装位置
//   - 部分项目用 .claude,部分用 claude
// SourceLoader.appendClaudeCandidates 同时尝试两个候选,带点版本优先
const (
	// ClaudeDirWithDot 带点约定(Claude Code 实际安装位置)
	ClaudeDirWithDot = ".claude"
	// ClaudeDirNoDot 不带点约定(部分项目用)
	ClaudeDirNoDot = "claude"
)
