import { Sparkles } from "lucide-react";

/** 首页式聊天占位：无消息时显示欢迎语 + 建议提示词 */
export interface ChatWelcomeProps {
  /** 点击建议提示词时回调，父组件把文字填到输入框 */
  onSuggestionClick?: (text: string) => void;
}

const SUGGESTIONS = [
  "帮我审查最近一次提交的代码风险",
  "帮我接入一个 MCP 服务器",
  "帮我梳理这个项目的目录结构",
];

export function ChatWelcome({ onSuggestionClick }: ChatWelcomeProps) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="text-center">
          <div className="bg-primary/10 mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl">
            <Sparkles className="text-primary h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Evo Harness
          </h1>
          <p className="text-muted-foreground mx-auto max-w-md text-base">
            在底部输入框描述你想构建的内容，或从左侧选择历史对话
          </p>
        </div>

        <div className="mt-8 space-y-1">
          {SUGGESTIONS.map((text) => (
            <button
              className="hover:bg-muted/60 hover:text-foreground flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 transition-colors"
              key={text}
              onClick={() => onSuggestionClick?.(text)}
              type="button"
            >
              <Sparkles className="text-muted-foreground h-[16px] w-[16px] shrink-0" />
              <span className="truncate">{text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
