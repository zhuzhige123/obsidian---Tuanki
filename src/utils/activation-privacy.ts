/** 邮箱绑定冲突时对用户展示的文案（不得包含具体邮箱） */
export const ACTIVATION_EMAIL_BOUND_USER_MESSAGE = "该激活码已被绑定，请输入正确的邮箱";

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * 防止旧版云端或其它路径在错误信息中回显已绑定邮箱。
 */
export function sanitizeCloudLicenseUserMessage(message: string): string {
	const text = String(message || "").trim();
	if (!text) {
		return ACTIVATION_EMAIL_BOUND_USER_MESSAGE;
	}
	if (EMAIL_IN_TEXT.test(text) && /绑定|邮箱|bound/i.test(text)) {
		return ACTIVATION_EMAIL_BOUND_USER_MESSAGE;
	}
	if (
		text.includes("已绑定邮箱") ||
		text.includes("绑定邮箱为") ||
		text.includes("bound_email")
	) {
		return ACTIVATION_EMAIL_BOUND_USER_MESSAGE;
	}
	return text;
}
