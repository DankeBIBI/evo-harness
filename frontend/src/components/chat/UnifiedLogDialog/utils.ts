import type { DebugLog } from "../panels/DebugLogPanel";

/** 前端 log type → 颜色（与 DebugLogPanel 保持一致） */
export function getFrontendLogColor(type: DebugLog["type"]): string {
	if (type === "request") return "bg-blue-500/20 text-blue-700 dark:text-blue-300";
	if (type === "response") return "bg-green-500/20 text-green-700 dark:text-green-300";
	if (type === "tool") return "bg-purple-500/20 text-purple-700 dark:text-purple-300";
	return "bg-amber-500/20 text-amber-700 dark:text-amber-300";
}

export function getFrontendLogLabel(type: DebugLog["type"]): string {
	if (type === "request") return "REQ";
	if (type === "response") return "RES";
	if (type === "tool") return "TOOL";
	return "LOG";
}

/** 后端 log status → 颜色 */
export function getBackendStatusColor(status: string, responseStatus?: number): string {
	if (status === "error") return "bg-red-500/20 text-red-700 dark:text-red-300";
	if (responseStatus !== undefined && responseStatus >= 400) {
		return "bg-red-500/20 text-red-700 dark:text-red-300";
	}
	if (status === "streaming") return "bg-blue-500/20 text-blue-700 dark:text-blue-300";
	return "bg-green-500/20 text-green-700 dark:text-green-300";
}
