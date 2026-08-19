import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/Card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useSettingsStore, type DialogAnimation } from '@/stores/settingsStore';
import {
    Braces,
    Clock,
    Code,
    Database,
    Languages,
    Leaf,
    Monitor,
    Moon,
    Palette,
    Sparkles,
    Sun,
    Zap,
} from 'lucide-react';

export default function GeneralSettingsView() {
  const {
    theme,
    themeStyle,
    language,
    fontSize,
    iconSize,
    fontWeight,
    requestTimeout,
    enableTransitionAnimation,
    dialogAnimation,
    immersiveChatMode,
    editorMode,
    streamingMaxLength,
    maxContinuationRounds,
    enableToolDedup,
    setTheme,
    setThemeStyle,
    setLanguage,
    setFontSize,
    setIconSize,
    setFontWeight,
    setRequestTimeout,
    setEnableTransitionAnimation,
    setDialogAnimation,
    setImmersiveChatMode,
    setEditorMode,
    setStreamingMaxLength,
    setMaxContinuationRounds,
    setEnableToolDedup,
  } = useSettingsStore();

  return (
    <div className="max-w-2xl space-y-6 pb-8 h-full ">
      {/* 外观设置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sun className="text-primary " />
            <CardTitle className="text-base">外观设置</CardTitle>
          </div>
          <CardDescription>自定义应用的主题和显示效果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">主题模式</p>
              <p className="text-muted-foreground text-sm">
                选择亮色、暗色或跟随系统
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={(v) =>
                setTheme(v as 'light' | 'dark' | 'system')
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <Sun className="" />
                    亮色
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon className="" />
                    暗色
                  </div>
                </SelectItem>
                <SelectItem value="system">
                  <div className="flex items-center gap-2">
                    <Monitor className="" />
                    跟随系统
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">主题风格</p>
              <p className="text-muted-foreground text-sm">
                选择配色风格主题
              </p>
            </div>
            <Select
              value={themeStyle}
              onValueChange={(v) => setThemeStyle(v as 'default' | 'lowpoly' | 'pastoral' | 'liquid-glass' | 'vscode')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <div className="flex items-center gap-2">
                    <Palette className="" />
                    默认风格
                  </div>
                </SelectItem>
                <SelectItem value="lowpoly">
                  <div className="flex items-center gap-2">
                    <Sparkles className="" />
                    Lowpoly 风格
                  </div>
                </SelectItem>
                <SelectItem value="pastoral">
                  <div className="flex items-center gap-2">
                    <Leaf className="" />
                    田园风格
                  </div>
                </SelectItem>
                <SelectItem value="liquid-glass">
                  <div className="flex items-center gap-2">
                    <Sparkles className="" />
                    Liquid Glass
                  </div>
                </SelectItem>
                <SelectItem value="vscode">
                  <div className="flex items-center gap-2">
                    <Braces className="" />
                    VSCode 风格
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">界面语言</p>
              <p className="text-muted-foreground text-sm">
                选择应用显示语言
              </p>
            </div>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as 'zh-CN' | 'en-US')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">
                  <div className="flex items-center gap-2">
                    <Languages className="" />
                    简体中文
                  </div>
                </SelectItem>
                <SelectItem value="en-US">
                  <div className="flex items-center gap-2">
                    <Languages className="" />
                    English
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">字体大小</p>
              <p className="text-muted-foreground text-sm">
                调整界面字体大小
              </p>
            </div>
            <Slider
              value={fontSize}
              onChange={setFontSize}
              min={12}
              max={20}
              step={1}
              unit="px"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">图标大小</p>
              <p className="text-muted-foreground text-sm">
                调整所有图标尺寸
              </p>
            </div>
            <Slider
              value={iconSize}
              onChange={setIconSize}
              min={14}
              max={24}
              step={1}
              unit="px"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">字体粗细</p>
              <p className="text-muted-foreground text-sm">
                调整标题和正文字重
              </p>
            </div>
            <Slider
              value={fontWeight}
              onChange={setFontWeight}
              min={300}
              max={700}
              step={100}
              unit=""
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="text-primary " />
              <div>
                <p className="font-medium">AI 编辑器模式</p>
                <p className="text-muted-foreground text-sm">
                  启用 Cursor 风格的 AI 编程助手界面，支持代码审查和差异对比
                </p>
              </div>
            </div>
            <Button
              onClick={() => setEditorMode(!editorMode)}
              size="sm"
              variant={editorMode ? 'default' : 'outline'}>
              {editorMode ? '已开启' : '已关闭'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 动画设置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="text-primary " />
            <CardTitle className="text-base">动画设置</CardTitle>
          </div>
          <CardDescription>控制界面动画效果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">功能动画</p>
              <p className="text-muted-foreground text-sm">
                切换对话时的展开填充过渡动画
              </p>
            </div>
            <Button
              onClick={() => setEnableTransitionAnimation(!enableTransitionAnimation)}
              size="sm"
              variant={enableTransitionAnimation ? 'default' : 'outline'}>
              {enableTransitionAnimation ? '已开启' : '已关闭'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">弹窗动画</p>
              <p className="text-muted-foreground text-sm">
                选择 Dialog 打开/关闭的动画方向
              </p>
            </div>
            <Select
              value={dialogAnimation}
              onValueChange={(v) => setDialogAnimation(v as DialogAnimation)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">默认缩放</SelectItem>
                <SelectItem value="top">↑ 从上平移</SelectItem>
                <SelectItem value="bottom">↓ 从下平移</SelectItem>
                <SelectItem value="left">← 从左平移</SelectItem>
                <SelectItem value="right">→ 从右平移</SelectItem>
                <SelectItem value="magic">✨ 点击处 macOS 神奇形变</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">沉浸式对话</p>
              <p className="text-muted-foreground text-sm">
                AI 气泡去除背景/边框/阴影，与页面融为一体（己方气泡不变）
              </p>
            </div>
            <Button
              onClick={() => setImmersiveChatMode(!immersiveChatMode)}
              size="sm"
              variant={immersiveChatMode ? 'default' : 'outline'}>
              {immersiveChatMode ? '已开启' : '已关闭'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 数据管理 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="text-primary " />
            <CardTitle className="text-base">数据管理</CardTitle>
          </div>
          <CardDescription>导出和导入应用数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">导出数据</p>
              <p className="text-muted-foreground text-sm">
                将所有数据导出为 JSON 文件
              </p>
            </div>
            <Button variant="outline">导出</Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">导入数据</p>
              <p className="text-muted-foreground text-sm">
                从 JSON 文件恢复数据
              </p>
            </div>
            <Button variant="outline">导入</Button>
          </div>
        </CardContent>
      </Card>

      {/* AI 设置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="text-primary " />
            <CardTitle className="text-base">AI 设置</CardTitle>
          </div>
          <CardDescription>配置 AI 请求相关参数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">请求超时时间</p>
              <p className="text-muted-foreground text-sm">
                AI 请求最大等待时间，0 表示不超时
              </p>
            </div>
            <Select
              value={String(requestTimeout)}
              onValueChange={(v) => setRequestTimeout(Number(v))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">不超时</SelectItem>
                <SelectItem value="300">5 分钟</SelectItem>
                <SelectItem value="600">10 分钟</SelectItem>
                <SelectItem value="900">15 分钟</SelectItem>
                <SelectItem value="1800">30 分钟</SelectItem>
                <SelectItem value="3600">1 小时</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">流式内容最大长度</p>
              <p className="text-muted-foreground text-sm">
                单次响应超过此字符数自动停止（保护 WebView2 渲染进程）
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-[160px]"
                min={10000}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 10000) {
                    setStreamingMaxLength(v);
                  }
                }}
                type="number"
                value={streamingMaxLength}
              />
              <span className="text-muted-foreground text-sm">字符</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">续传最大轮数</p>
              <p className="text-muted-foreground text-sm">
                工具调用结果触发 AI 续传的最大轮数（防死循环）
              </p>
            </div>
            <div className="w-[180px]">
              <Slider
                max={200}
                min={1}
                onChange={setMaxContinuationRounds}
                step={1}
                unit=" 轮"
                value={maxContinuationRounds}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">工具调用去重</p>
              <p className="text-muted-foreground text-sm">
                按原始 ID 跳过重复执行（依赖上游不重发；遇到重复执行问题时关闭）
              </p>
            </div>
            <Button
              onClick={() => setEnableToolDedup(!enableToolDedup)}
              size="sm"
              variant={enableToolDedup ? 'default' : 'outline'}
            >
              {enableToolDedup ? '已开启' : '已关闭'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
