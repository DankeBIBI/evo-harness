import { AppLayout } from "@/components/ui/AppLayout";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useSourceConfigSync } from "@/hooks/useSourceConfigSync";
import { useTheme } from "@/hooks/useTheme";
import AgentsPage from "@/pages/agents";
import ChatPage from "@/pages/chat";
import EditorPage from "@/pages/editor";
import MCPPage from "@/pages/mcp";
import ModelsPage from "@/pages/models";
import ProjectAnalysisPage from "@/pages/project";
import PromptsPage from "@/pages/prompts";
import ProvidersPage from "@/pages/providers";
import SkillsPage from "@/pages/skills";
import VideoPage from "@/pages/video";
import { Navigate, Route, Routes } from "react-router-dom";

function App() {
	useTheme();
	useDesignTokens();
	useSourceConfigSync();

	return (
		<div className="h-screen w-screen overflow-hidden">
			<Routes>
				<Route element={<AppLayout />}>
					<Route element={<Navigate to="/chat" replace />} path="/" />
					<Route element={<ProjectAnalysisPage />} path="/project" />
					<Route element={<AgentsPage />} path="/agents" />
					<Route element={<ChatPage />} path="/chat" />
					<Route element={<SkillsPage />} path="/skills" />
					<Route element={<PromptsPage />} path="/prompts" />
					<Route element={<ModelsPage />} path="/models" />
					<Route element={<MCPPage />} path="/mcp" />
					<Route element={<ProvidersPage />} path="/providers" />
					<Route element={<EditorPage />} path="/editor" />
					<Route element={<VideoPage />} path="/video" />
					<Route
						element={
							<div className="text-muted-foreground flex h-full items-center justify-center">
								页面未找到
							</div>
						}
						path="*"
					/>
				</Route>
			</Routes>
		</div>
	);
}

export default App;
