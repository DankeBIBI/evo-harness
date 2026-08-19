import { Card, CardContent } from "@/components/ui/Card";
import { Bot, Film, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface EntryCard {
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  path: string;
  tags: string[];
  title: string;
}

const ENTRIES: EntryCard[] = [
  {
    description: "进入对话、配置 Agent、扩展自定义智能体",
    icon: <Bot className="h-7 w-7" />,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    path: "/agents",
    tags: ["对话", "Skills", "Prompts"],
    title: "Agent 工作台",
  },
  {
    description: "无限画布上编排脚本 → 分镜 → 生成 → 合成",
    icon: <Film className="h-7 w-7" />,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500",
    path: "/video",
    tags: ["无限画布", "节点工作流", "AI 生视频"],
    title: "AI 视频站",
  },
];

export function EntryCards() {
  const navigate = useNavigate();

  const handleEnter = (path: string) => {
    navigate(path);
  };

  return (
    <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {ENTRIES.map((entry) => (
        <Card
          key={entry.path}
          className="group cursor-pointer border border-transparent p-0 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md"
          onClick={() => handleEnter(entry.path)}
        >
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${entry.iconBg} ${entry.iconColor}`}
              >
                {entry.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold leading-tight text-foreground">
                  {entry.title}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {entry.description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
              <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                <Sparkles className="h-3 w-3" />
                进入
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
