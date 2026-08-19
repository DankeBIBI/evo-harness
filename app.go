package main

import (
	"context"

	"evo-harness/tray"
	"evo-harness/updater"
)

// 职责: 生命周期钩子 + 系统级能力兜底(托盘 / 升级检查)。
type App struct {
	ctx     context.Context
	tray    *tray.Tray
	updater *updater.Updater
}

// NewApp 创建壳实例(系统级能力组件)
func NewApp() *App {
	return &App{
		tray:    tray.New(),
		updater: updater.New(),
	}
}

// Startup 启动: 初始化托盘与升级器
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.tray.Start(ctx)
	a.updater.Start(ctx)
}

// Shutdown 清理: 释放托盘资源
func (a *App) Shutdown(ctx context.Context) {
	a.tray.Stop()
}
