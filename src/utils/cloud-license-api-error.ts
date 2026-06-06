import type { RequestUrlResponse } from "obsidian";
import {
	ACTIVATION_EMAIL_BOUND_USER_MESSAGE,
	sanitizeCloudLicenseUserMessage,
} from "./activation-privacy";

/**
 * 将业务 API 或阿里云 FC 网关错误（如 HTTP 412 CAExited）转成用户可读文案。
 */
export function formatCloudLicenseApiError(
	response: RequestUrlResponse,
	data: Record<string, unknown> | null,
	fallbackVerb: "激活" | "验证" = "激活"
): string {
	if (data) {
		if (data.error_code === "EMAIL_ALREADY_BOUND") {
			return ACTIVATION_EMAIL_BOUND_USER_MESSAGE;
		}

		if (data.error_code === "DEVICE_EVICTION_COOLDOWN") {
			return "近期设备变动过多，暂时无法在本机注册新设备，请稍后再试或联系支持。";
		}

		if (data.error_code === "VAULT_EVICTION_RATE_LIMIT") {
			return "近期库授权变动过于频繁，请 24 小时后再试。";
		}

		if (data.error_code === "VAULT_NOT_REGISTERED") {
			return "此库未在授权列表中，可能已被同机其他库顶替，请在本库重新激活。";
		}

		if (typeof data.error === "string" && data.error.trim()) {
			const sanitized = sanitizeCloudLicenseUserMessage(data.error);
			if (sanitized.includes("Signature mismatch") || sanitized.includes("OTSAuthFailed")) {
				return "表格存储鉴权失败：请在函数计算环境变量中检查 ALICLOUD_ACCESS_KEY_ID / ALICLOUD_ACCESS_KEY_SECRET 是否与 RAM 子账号匹配，并确认该账号有 weave-activation 的 OTS 读写权限。";
			}
			return sanitized;
		}

		const message = typeof data.Message === "string" ? data.Message : "";
		const code = typeof data.Code === "string" ? data.Code : "";

		if (code === "CAExited" || response.status === 412) {
			if (message.includes("Cannot find module") && message.includes("index.mjs")) {
				return "云端授权服务未正确部署：服务器找不到入口文件。请用 node scripts\\pack-fc-zip.mjs lite 重新打包并上传，启动命令改为 node index.mjs；部署后访问 /health 应返回 {\"ok\":true}。";
			}
			const firstLine = message.split(/\r?\n/)[0]?.trim();
			if (firstLine) {
				return `云端授权服务异常（${code || `HTTP ${response.status}`}）：${firstLine}`;
			}
		}

		if (message.includes("Signature mismatch") || message.includes("OTSAuthFailed")) {
			return "表格存储鉴权失败：请在函数计算环境变量中检查 ALICLOUD_ACCESS_KEY_ID / ALICLOUD_ACCESS_KEY_SECRET 是否与 RAM 子账号匹配，并确认该账号有 weave-activation 的 OTS 读写权限。";
		}

		if (message.trim()) {
			return sanitizeCloudLicenseUserMessage(message.split(/\r?\n/)[0].trim());
		}
	}

	if (response.status === 412) {
		return "云端授权服务未启动（HTTP 412）。请在函数计算控制台重新上传代码包，并确认 /health 可正常访问。";
	}

	return `${fallbackVerb}失败（HTTP ${response.status}）`;
}
