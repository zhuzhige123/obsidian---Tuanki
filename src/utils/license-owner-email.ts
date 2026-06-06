import { ACTIVATION_EMAIL_BOUND_USER_MESSAGE } from "./activation-privacy";

/**
 * 激活邮箱绑定（云端权威）：
 * - 无记录：首次激活，绑定用户提交的邮箱
 * - 有记录：必须与已绑定邮箱完全一致（错误信息不得回显邮箱）
 */

export function normalizeLicenseEmail(email: string): string {
	return String(email || "").trim().toLowerCase();
}

export function assertSubmittedEmailMatchesActivationOwner(
	_submittedEmail: string,
	_data?: unknown
): { ok: true } | { ok: false; error: string } {
	return { ok: true };
}

export function resolveBindEmailForActivation(
	submittedEmail: string,
	_data?: unknown,
	existingRecord?: { email?: string } | null
): { ok: true; bindEmail: string } | { ok: false; error: string } {
	const submitted = normalizeLicenseEmail(submittedEmail);

	if (existingRecord) {
		const rawEmail = existingRecord.email;
		const recordEmail =
			typeof rawEmail === "string" && rawEmail.trim()
				? normalizeLicenseEmail(rawEmail)
				: null;

		if (!recordEmail) {
			return {
				ok: false,
				error: "该激活码已在云端登记，但绑定邮箱数据异常，请联系支持修复后再试",
			};
		}

		if (submitted !== recordEmail) {
			return {
				ok: false,
				error: ACTIVATION_EMAIL_BOUND_USER_MESSAGE,
			};
		}

		return { ok: true, bindEmail: recordEmail };
	}

	return { ok: true, bindEmail: submitted };
}
