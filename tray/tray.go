package tray

import "context"

// Tray 托盘控制器(REFACTOR-FRONTEND-MIGRATION Phase 5)
// 职责: 系统级能力兜底占位;托盘图标/菜单在 Wails v2 由前端 CustomTitleBar 承担,
// 此处保留生命周期接口供后续接入系统托盘库(如 systray)时使用。
type Tray struct {
	ctx context.Context
}

// New 创建托盘控制器
func New() *Tray {
	return &Tray{}
}

// Start 注册托盘(占位)
func (t *Tray) Start(ctx context.Context) {
	t.ctx = ctx
}

// Stop 清理托盘资源
func (t *Tray) Stop() {
	t.ctx = nil
}

// Show 聚焦主窗口
func (t *Tray) Show() {
	_ = t.ctx
}
