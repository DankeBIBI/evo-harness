import { ChatList } from "@/components/chat/panels/ChatList";
import { TransitionOverlay } from "@/components/chat/panels/TransitionOverlay";
import { EntryCards } from "@/components/common/EntryCards";
import { useSettingsStore } from "@/stores/settingsStore";
import { Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function HomePage() {
	const navigate = useNavigate();
	const enableTransitionAnimation = useSettingsStore(
		(s) => s.enableTransitionAnimation,
	);
	const [animState, setAnimState] = useState<{
		active: boolean;
		pos: { x: number; y: number };
	}>({ active: false, pos: { x: 0, y: 0 } });

	const handleSelect = useCallback(
		(convId: string, startPos?: { x: number; y: number }) => {
			if (!enableTransitionAnimation || !startPos) {
				navigate("/chat");
				return;
			}
			setAnimState({ active: true, pos: startPos });
		},
		[navigate, enableTransitionAnimation],
	);

	const handleAnimComplete = useCallback(() => {
		setAnimState((prev) => ({ ...prev, active: false }));
		navigate("/chat");
	}, [navigate]);

	return (
		<div className="flex min-h-full flex-1 flex-col items-center overflow-y-auto p-6">
			<div className="my-auto w-full max-w-3xl pt-12 pb-12">
				{/* 欢迎区域 */}
				<div className="  text-center">
					<div className="bg-primary/10 mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl">
						<Sparkles className="text-primary h-6 w-6" />
					</div>
					<h1 className="text-3xl font-bold tracking-tight text-foreground">
						欢迎使用 Evo Harness
					</h1>
					<p className="text-muted-foreground mx-auto  max-w-md text-base">
						选择一个工作区开始，或从导航栏探索不同功能模块
					</p>
				</div>

				{/* 工作区入口卡片 */}
				<div className="mt-10">
					<EntryCards />
				</div>

				{/* 对话列表 */}
				<div className="mb-8">
					<ChatList onSelect={handleSelect} />
				</div>
			</div>

			{/* 过渡动画 */}
			<TransitionOverlay
				active={animState.active}
				pos={animState.pos}
				onComplete={handleAnimComplete}
			/>
		</div>
	);
}
