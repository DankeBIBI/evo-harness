package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	err := wails.Run(&options.App{
		Title:  "Evo Harness",
		Width:  1280,
		Height: 800,
		// P1-3: 启用 Frameless 模式,使用前端自定义标题栏(CustomTitleBar)
		// 2026-07-06: 原生标题栏三按钮体验不可控,改为前端 React 自绘
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 0},
		OnStartup:        app.Startup,
		OnShutdown:       app.Shutdown,
		Windows: &windows.Options{
			// 必开 Translucent:BackdropType 才生效(Wails 官方要求)
			WindowIsTranslucent: true,
			// Win11 build 22621+ 用 Mica;Win10 自动降级为 BlurBehind(代码 review 要求兼容)
			BackdropType: windows.Auto,
			// 配合 Translucent:webview 背景 alpha=0,让系统背景透出
			WebviewIsTransparent: true,
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatalf("Error: %v", err)
	}
}
