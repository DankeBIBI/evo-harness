/**
 * 模型推理深度滑块 (ReasoningLevelSlider) — v6
 *
 * 4 档胶囊滑块: low / medium / high / max
 *  - 共享 thumb (绝对定位圆角块) 在 4 档间平滑滑动 (transform translateX + 320ms ease-out)
 *  - 未选中档: 显示圆点 (•), 低饱和琥珀色 (40% 透明度)
 *  - 选中档: 显示完整字母 + 白色 (thumb 覆盖在底层按钮上)
 *  - MAX 档激活时, 胶囊底座内出现 10 粒方块粒子
 *    从 MAX 按钮范围内 (72-99% 随机) 水平向左飘出
 *  - prefers-reduced-motion: reduce 时禁用粒子 + thumb 动画
 *
 * 持久化: useSettingsStore.reasoningLevel (localStorage v6)
 * 后端 binding: chat_service.go 把 reasoningLevel 透传 chatReq.Extra["reasoning_effort"]
 */

import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/Button";

const LEVELS = [
	{ key: "low", bgClass: "", label: "Low", tooltip: "省 token · 快速回答" },
	{
		key: "medium",
		bgClass: "",
		label: "Medium",
		tooltip: "默认档 · 平衡",
	},
	{
		key: "high",
		bgClass: "",
		label: "High",
		tooltip: "复杂任务 · 深度推理",
	},
	{
		key: "max",
		bgClass: "bg-purple-700",
		label: "MAX",
		tooltip: "最高推理深度 · 启用 thinking 预算",
	},
] as const;

type Level = (typeof LEVELS)[number]["key"];

export function ReasoningLevelSlider() {
	const level = useSettingsStore((s) => s.reasoningLevel);
	const setLevel = useSettingsStore((s) => s.setReasoningLevel);

	const isMax = level === "max";
	const activeIndex = LEVELS.findIndex((l) => l.key === level);

	return (
		<div className="relative inline-flex items-center self-center">
			{/* 胶囊主体: 4 等宽 button 提供布局 + a11y + 点击; thumb 绝对定位覆盖在上面 */}
			<div
				aria-label="模型推理深度"
				className="relative inline-flex h-7 items-center rounded-full border border-border/60 bg-muted/40 p-0.5"
				role="radiogroup">
				{/* 共享 thumb — 跟随 level 平滑滑动 */}
				<span
					aria-hidden
					className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 z-0 rounded-full bg-amber-500 shadow-sm"
					style={{
						width: `calc((100% - 4px) / ${LEVELS.length})`,
						transform: `translateX(${activeIndex * 100}%)`,
						transition:
							"transform 320ms cubic-bezier(0.4, 0, 0.2, 1), width 320ms cubic-bezier(0.4, 0, 0.2, 1)",
					}}
				/>

				{LEVELS.map((lvl) => {
					const isActive = level === lvl.key;
					return (
						<Button
							aria-checked={isActive}
							aria-label={lvl.tooltip}
							className={[
								"relative z-10 flex h-6 flex-1 items-center justify-center rounded-full bg-transparent",
								"min-w-[50px] px-3 text-xs font-semibold",
								"transition-colors duration-300",
								isActive
									? "text-white z-30"
									: "text-amber-500/40 hover:text-amber-500/70  hover:bg-transparent",
								isActive && lvl.bgClass,
							].join(" ")}
							key={lvl.key}
							onClick={() => setLevel(lvl.key as Level)}
							role="radio"
							title={lvl.tooltip}
							type="button">
							{isActive ? lvl.label : <DotIcon />}
						</Button>
					);
				})}

				{/* MAX 档粒子层 — 10 粒方块从 MAX 按钮 (72-99% 随机) 出生, 水平向左飘出 */}
				{isMax && (
					<div
						aria-hidden
						className="reasoning-particles pointer-events-none absolute inset-y-0 left-0 right-0 z-20 overflow-hidden rounded-full">
						{Array.from({ length: 25 }).map((_, i) => {
							const seed = (i * 137) % 100;
							const startLeft = 60 + (seed % 28);
							const delay = (i * 0.18) % 1.8;
							const duration = 1.6 + ((seed * 7) % 10) * 0.1;
							const size = 4 + ((seed * 3) % 3);
							const peakOpacity = 0.5 + ((seed * 11) % 30) / 100;
							return (
								<span
									className="particle bg-purple-600"
									key={i}
									style={{
										animationDelay: `${delay}s`,
										animationDuration: `${duration}s`,
										bottom: `${7 + ((seed * 5) % 8)}px`,
										height: `${size}px`,
										left: `${startLeft}%`,
										opacity: peakOpacity,
										width: `${size}px`,
									}}
								/>
							);
						})}
					</div>
				)}
			</div>

			<style>{`
        @keyframes reasoningParticleDrift {
          0%   { transform: translateX(0)        scale(0.9); opacity: 0; }
          12%  { opacity: 0.85; }
          90%  { opacity: 0.6; }
          100% { transform: translateX(-130px)   scale(0.4); opacity: 0; }
        }
        .reasoning-particles .particle {
          position: absolute;
          border-radius: 1.5px;
          background: linear-gradient(135deg, #f4e9c8 0%, #b8923a 100%);
          box-shadow: 0 0 2px rgba(184, 146, 58, 0.55);
          animation: reasoningParticleDrift 2.0s linear infinite;
          animation-fill-mode: both;
        }
        @media (prefers-reduced-motion: reduce) {
          .reasoning-particles { display: none; }
          .relative.z-10, .relative.z-0 { transition: none !important; }
        }
      `}</style>
		</div>
	);
}

/** 未选中档位显示的小圆点 — 低饱和琥珀, 透明度 40% */
function DotIcon() {
	return (
		<span
			aria-hidden
			className="block h-[4px] w-[4px] rounded-full bg-current"
		/>
	);
}
