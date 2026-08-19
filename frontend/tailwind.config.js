import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				/* ---- 莫兰迪主色：灰调玫瑰 ---- */
				primary: {
					DEFAULT: "#B5838D",
					50: "#F5EEF0",
					100: "#EDDFE2",
					200: "#DDC4C9",
					300: "#CDA9B0",
					400: "#BD8E97",
					500: "#B5838D",
					600: "#9B6270",
					700: "#7D4D5A",
					800: "#5F3A44",
					900: "#41272E",
				},
				success: {
					DEFAULT: "#22c55e",
					50: "#f0fdf4",
					500: "#22c55e",
				},
				error: {
					DEFAULT: "#ef4444",
					50: "#fef2f2",
					500: "#ef4444",
				},
				warning: {
					DEFAULT: "#f59e0b",
					50: "#fffbeb",
					500: "#f59e0b",
				},
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				/* ---- 侧边栏 ---- */
				sidebar: {
					DEFAULT: "hsl(var(--sidebar))",
					foreground: "hsl(var(--sidebar-foreground))",
					accent: "hsl(var(--sidebar-accent))",
					"accent-foreground": "hsl(var(--sidebar-accent-foreground))",
					border: "hsl(var(--sidebar-border))",
					ring: "hsl(var(--sidebar-ring))",
				},
				// Lowpoly 主题色
				"craft-dark": "#0F2A3A",
				"craft-surface": "#183A4F",
				"craft-light": "#FFF7EF",
				"craft-text": "#FFF7EF",
				"craft-primary": "#FF4DA6",
				"craft-secondary": "#FFC93D",
				"craft-accent": "#FF6F5C",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
				// Lowpoly 风格使用小圆角
				"lowpoly-sm": "2px",
			},
			fontFamily: {
				sans: [
					"Inter",
					"system-ui",
					"-apple-system",
					"BlinkMacSystemFont",
					"Segoe UI",
					"Roboto",
					"sans-serif",
				],
				game: ['"Press Start 2P"', "monospace"],
			},
			fontSize: {
				title: ["20px", { lineHeight: "1.4", fontWeight: "600" }],
				body: ["14px", { lineHeight: "1.5" }],
				small: ["12px", { lineHeight: "1.5" }],
			},
			spacing: {
				4: "4px",
				8: "8px",
				12: "12px",
				16: "16px",
				24: "24px",
				32: "32px",
			},
			boxShadow: {
				card: "0 2px 8px rgba(0, 0, 0, 0.1)",
				dialog: "0 8px 32px rgba(0, 0, 0, 0.15)",
				// Lowpoly 风格阴影
				lowpoly: "4px 4px 0 #000000",
				"lowpoly-lg": "8px 8px 0 #000000",
				"lowpoly-sm": "2px 2px 0 #000000",
			},
			transitionDuration: {
				150: "150ms",
				200: "200ms",
			},
			transitionTimingFunction: {
				ease: "ease",
				"ease-out": "ease-out",
			},
		},
	},
	safelist: ["btn-lowpoly", "panel-lowpoly", "input-lowpoly"],
	plugins: [typography],
};
