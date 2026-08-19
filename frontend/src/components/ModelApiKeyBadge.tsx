import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, XCircle } from "lucide-react";

/** 模型 APIKey 配置状态徽标 */
export interface ModelApiKeyBadgeProps {
	/** 真实 APIKey 字符串；空串 / undefined 视为未配置 */
	apiKey?: string;
}

export function ModelApiKeyBadge({ apiKey }: ModelApiKeyBadgeProps) {
	if (apiKey) {
		return (
			<Badge className="text-xs" variant="success">
				<CheckCircle2 className="h-[12px] w-[12px]" />
				API Key 已配置
			</Badge>
		);
	}

	return (
		<Badge className="text-xs" variant="destructive">
			<XCircle className="h-[12px] w-[12px]" />
			API Key 未配置
		</Badge>
	);
}
