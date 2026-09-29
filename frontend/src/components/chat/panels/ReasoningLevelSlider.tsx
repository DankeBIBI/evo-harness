/**
 * 模型推理深度滑块 (ReasoningLevelSlider) — v7.4
 *
 * 4 档分段控件: LOW / MED / HIGH / MAX
 *  - 四档标签常显(10px 加宽字距),未选中档不再是无语义圆点
 *  - 共享 thumb 绝对定位,320ms cubic-bezier 平滑滑动;选中档白字压在 thumb 上
 *  - MAX 分阶段入场:切换后先等 300ms 让 thumb 滑到位,
 *    然后 machOn=true 才渐渐启用专属动画 ——
 *      1. 深邃方格底层 450ms 淡入(紫黑 + 6px 方格纹理)
 *      2. thumb 渐变到紫 + 微光晕(box-shadow 450ms 过渡)
 *      3. 底内 32×4 小方格随机相位呼吸明灭(v7.5 由行进波改为随机散布)
 *    切离 MAX 立即复位浅色底(machOn=false)
 *    (v7.4 移除马赫粒子拖尾,波浪背景即全部动效)
 *  - prefers-reduced-motion: reduce 时禁用方格呼吸与滑动动画
 *
 * 持久化: useSettingsStore.reasoningLevel (localStorage)
 * 后端 binding: chat_service.go 把 reasoningLevel 透传 chatReq.Extra["reasoning_effort"]
 */

import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";

const LEVELS = [
	{ key: "low", label: "LOW", tooltip: "省 token · 快速回答" },
	{ key: "medium", label: "MED", tooltip: "默认档 · 平衡" },
	{ key: "high", label: "HIGH", tooltip: "复杂任务 · 深度推理" },
	{
		key: "max",
		label: "MAX",
		tooltip: "最高推理深度 · 启用 thinking 预算",
	},
] as const;

type Level = (typeof LEVELS)[number]["key"];

/** 深邃底方格阵列:32 列 × 4 行,方块随机散布明灭 */
const MACH_COLS = 32;
const MACH_ROWS = 4;

export function ReasoningLevelSlider() {
	const level = useSettingsStore((s) => s.reasoningLevel);
	const setLevel = useSettingsStore((s) => s.setReasoningLevel);

	const isMax = level === "max";
	const activeIndex = LEVELS.findIndex((l) => l.key === level);

	// 分阶段入场:切到 MAX 先等 300ms(让 thumb 滑到位),再渐渐启用 MAX 专属动画
	const [machOn, setMachOn] = useState(false);
	useEffect(() => {
		if (!isMax) {
			setMachOn(false);

			return;
		}
		const timer = setTimeout(() => setMachOn(true), 300);

		return () => clearTimeout(timer);
	}, [isMax]);

	return (
		<div className="relative inline-flex items-center self-center">
			<div
				aria-label="模型推理深度"
				className={`relative inline-flex h-7 items-center rounded-full border p-0.5 transition-colors duration-300 ${
					machOn ? "border-violet-800/60" : "border-border/60 bg-muted"
				}`}
				role="radiogroup">
				{/* MAX 深邃方格底层 — 延迟 300ms 后淡入;内部小方格按列错峰呼吸,自右向左波浪起伏 */}
				{machOn && (
					<span
						aria-hidden
						className="mach-bg absolute inset-0 z-0 overflow-hidden rounded-full duration-500">
						{Array.from({ length: MACH_COLS * MACH_ROWS }).map((_, i) => {
							const col = i % MACH_COLS;
							const row = Math.floor(i / MACH_COLS);
							// 随机相位:亮起的方块在区域内随机散布明灭,不成行进波;
							// 时长逐格微差使相位永久错开,不会重新对齐
							const phase =
								(col * 137 + row * 61 + ((col * row) % 23) * 17) % 1900;
							const dur = 1700 + ((col * 11 + row * 19) % 5) * 110;
							const peak = 0.34 + (((col * 7 + row * 23) % 6) * 0.04);

							return (
								<span
									className="mach-cell"
									key={i}
									style={
										{
											animationDelay: `${phase}ms`,
											animationDuration: `${dur}ms`,
											height: `${100 / MACH_ROWS}%`,
											left: `${(col * 100) / MACH_COLS}%`,
											top: `${(row * 100) / MACH_ROWS}%`,
											width: `${100 / MACH_COLS}%`,
											"--pk": `${peak}`,
										} as React.CSSProperties
									}
								/>
							);
						})}
					</span>
				)}

				{/* 共享 thumb — 跟随 level 平滑滑动;MAX 专属渐变+微光延迟到 machOn 后生效 */}
				<span
					aria-hidden
					className={
						machOn
							? "pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 z-0 rounded-full shadow-[0_0_10px_rgba(124,58,237,0.35)]"
							: "bg-primary pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 z-0 rounded-full shadow-sm"
					}
					style={{
						width: `calc((100% - 4px) / ${LEVELS.length})`,
						transform: `translateX(${activeIndex * 100}%)`,
						transition:
							"transform 320ms cubic-bezier(0.4, 0, 0.2, 1), background-color 320ms ease-out, box-shadow 450ms ease-out",
						...(machOn
							? {
									background:
										"linear-gradient(90deg, hsl(var(--primary)) 0%, #7c3aed 100%)",
								}
							: {}),
					}}
				/>

				{LEVELS.map((lvl) => {
					const isActive = level === lvl.key;

					return (
						<Button
							aria-checked={isActive}
							aria-label={lvl.tooltip}
							className={[
								"relative z-10 flex h-6 min-w-[46px] flex-1 items-center justify-center rounded-full bg-transparent px-2.5",
								"text-[10px] font-bold tracking-widest uppercase transition-colors duration-300",
								isActive
									? "text-primary-foreground z-30"
									: machOn
										? " hover:text-primary hover:bg-transparent"
										: "text-muted-foreground/70 hover:text-foreground hover:bg-transparent",
							].join(" ")}
							key={lvl.key}
							onClick={() => setLevel(lvl.key as Level)}
							role="radio"
							title={lvl.tooltip}
							type="button">
							{lvl.label}
						</Button>
					);
				})}
			</div>

			<style>{`
        /* MAX 深邃底:紫黑 + 6px 静态细网格垫底;挂载时 450ms 淡入 */
        .mach-bg {
          background-color: #16132121;
          background-image:
            linear-gradient(rgba(167, 139, 250, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(167, 139, 250, 0.07) 1px, transparent 1px);
          background-size: 6px 6px;
          border: none;
          animation: machBgFadeIn 450ms ease-out both;
        }
        @keyframes machBgFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* 背景方格:随机相位呼吸明灭,时长逐格微差保持永久错开 */
        .mach-cell {
          position: absolute;
          aspect-ratio: 1 / 1;
          background: rgba(167, 139, 250);
          opacity: 0.22;
          animation: cellWave 1000ms ease-in-out infinite;
        }
        @keyframes cellWave {
          0%, 100% { opacity: 0; }
          40%      { opacity: var(--pk, 0.5); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mach-cell { animation: none; }
          .relative.z-0 { transition: none !important; }
        }
      `}</style>
		</div>
	);
}
