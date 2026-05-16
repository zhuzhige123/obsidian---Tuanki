import { t } from "../../../utils/i18n";
import { logger } from "../../../utils/logger";
import { writeSystemClipboardText } from "../../../utils/system-clipboard";
/**
 * 设置界面相关的工具函数
 * 提取公共逻辑，消除代码重复
 */

import type {
	ActivationValidation,
	ErrorResult,
	LicenseInfo,
	LicenseStatus,
	NotificationOptions,
	WindowWithNotice,
} from "../types/settings-types";

import { NOTIFICATION_DURATION, VALIDATION_RULES } from "../constants/settings-constants";

/**
 * 统一的通知显示函数
 */
export function showNotification(options: NotificationOptions): void {
	const { message, type = "info", duration } = options;

	const Notice = (window as WindowWithNotice).Notice;
	if (!Notice) {
		logger.warn("Notice constructor not available");
		return;
	}

	const finalDuration =
		duration ?? (type === "error" ? NOTIFICATION_DURATION.ERROR : NOTIFICATION_DURATION.SUCCESS);
	new Notice(message, finalDuration);
}

/**
 * 统一的错误处理函数
 */
export function handleError(
	error: unknown,
	context: string,
	fallbackMessage?: string
): ErrorResult {
	const message =
		error instanceof Error ? error.message : fallbackMessage || t("settingsUtils.operationFailed");
	const fullMessage = `${context}: ${message}`;

	showNotification({
		message: fullMessage,
		type: "error",
	});

	return {
		success: false,
		error: fullMessage,
	};
}

/**
 * 获取许可证状态信息
 */
export function getLicenseStatusInfo(license?: LicenseInfo): LicenseStatus {
	if (!license?.isActivated) {
		return {
			status: "inactive",
			text: t("settingsUtils.licenseStatus.inactive"),
			color: "orange",
			icon: "[!]",
		};
	}

	const now = new Date();

	if (license.expiresAt) {
		const expiryDate = new Date(license.expiresAt);
		if (now > expiryDate) {
			return {
				status: "expired",
				text: t("settingsUtils.licenseStatus.expired"),
				color: "red",
				icon: "[X]",
			};
		}

		const daysUntilExpiry = Math.ceil(
			(expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
		);
		if (daysUntilExpiry <= 30) {
			return {
				status: "trial",
				text: t("settingsUtils.licenseStatus.expiringIn", { days: daysUntilExpiry }),
				color: "yellow",
				icon: "[~]",
			};
		}
	}

	return {
		status: "active",
		text: t("settingsUtils.licenseStatus.active"),
		color: "green",
		icon: "[OK]",
	};
}

/**
 * 获取错误类型对应的图标
 */
export function getErrorIcon(error: string): string {
	if (
		error.includes("format") ||
		error.includes("格式") ||
		error.includes("validation") ||
		error.includes("验证失败")
	)
		return "[FMT]";
	if (error.includes("expir") || error.includes("过期")) return "[EXP]";
	if (
		error.includes("device") ||
		error.includes("设备") ||
		error.includes("bind") ||
		error.includes("绑定")
	)
		return "[DEV]";
	if (
		error.includes("network") ||
		error.includes("网络") ||
		error.includes("connect") ||
		error.includes("连接")
	)
		return "[NET]";
	if (error.includes("permission") || error.includes("权限")) return "[PERM]";
	return "[ERR]";
}

/**
 * 格式化激活码显示
 */
export function formatActivationCode(code: string, showFull = false): string {
	if (!code) return "";

	if (showFull) {
		// 每64个字符换行，便于阅读
		return code.match(/.{1,64}/g)?.join("\n") || code;
	} else {
		// 显示前20个字符，后面用省略号
		return code.length > 20 ? `${code.substring(0, 20)}...` : code;
	}
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		return await writeSystemClipboardText(text);
	} catch (error) {
		logger.error("Failed to copy to clipboard:", error);
		return false;
	}
}

/**
 * 验证激活码格式
 */
export function validateActivationCode(code: string): ActivationValidation {
	const result: ActivationValidation = {
		isValid: false,
		isComplete: false,
		warnings: [],
		errors: [],
	};

	if (!code.trim()) {
		result.errors.push(t("settingsUtils.validation.codeEmpty"));
		return result;
	}

	const { MIN_LENGTH, PATTERN } = VALIDATION_RULES.ACTIVATION_CODE;

	if (code.length < MIN_LENGTH) {
		result.warnings.push(t("settingsUtils.validation.codeTooShort", { min: MIN_LENGTH }));
	}

	if (!PATTERN.test(code)) {
		result.errors.push(t("settingsUtils.validation.codeInvalidChars"));
		return result;
	}

	result.isValid = true;

	if (code.length >= 32) {
		result.isComplete = true;
	} else {
		result.warnings.push(t("settingsUtils.validation.codeIncomplete"));
	}

	return result;
}

/**
 * 获取详细的错误信息和解决方案
 */
export function getDetailedErrorMessage(error: string): string {
	const errorKeyMap: Record<string, { messageKey: string; solutionKey?: string }> = {
		激活码格式无效: {
			messageKey: "settingsUtils.errors.invalidFormat",
			solutionKey: "settingsUtils.errors.invalidFormatSolution",
		},
		"Invalid activation code": {
			messageKey: "settingsUtils.errors.invalidFormat",
			solutionKey: "settingsUtils.errors.invalidFormatSolution",
		},
		激活码已过期: {
			messageKey: "settingsUtils.errors.codeExpired",
			solutionKey: "settingsUtils.errors.codeExpiredSolution",
		},
		"Activation code expired": {
			messageKey: "settingsUtils.errors.codeExpired",
			solutionKey: "settingsUtils.errors.codeExpiredSolution",
		},
		设备绑定超限: {
			messageKey: "settingsUtils.errors.deviceLimit",
			solutionKey: "settingsUtils.errors.deviceLimitSolution",
		},
		"Device limit exceeded": {
			messageKey: "settingsUtils.errors.deviceLimit",
			solutionKey: "settingsUtils.errors.deviceLimitSolution",
		},
		网络连接失败: {
			messageKey: "settingsUtils.errors.networkFailed",
			solutionKey: "settingsUtils.errors.networkFailedSolution",
		},
		"Network connection failed": {
			messageKey: "settingsUtils.errors.networkFailed",
			solutionKey: "settingsUtils.errors.networkFailedSolution",
		},
		服务器错误: {
			messageKey: "settingsUtils.errors.serverError",
			solutionKey: "settingsUtils.errors.serverErrorSolution",
		},
		"Server error": {
			messageKey: "settingsUtils.errors.serverError",
			solutionKey: "settingsUtils.errors.serverErrorSolution",
		},
	};

	const errorInfo = errorKeyMap[error];
	if (errorInfo) {
		const msg = t(errorInfo.messageKey);
		if (errorInfo.solutionKey) {
			const solution = t(errorInfo.solutionKey);
			return `${msg}. ${solution}`;
		}
		return msg;
	}

	return error;
}

/**
 * 安全的设置更新函数
 */
export function updateSettings<T extends Record<string, any>>(
	settings: T,
	path: string,
	value: any
): T {
	const keys = path.split(".");
	const result = { ...settings };
	let current: any = result;

	// 创建嵌套对象路径
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!(key in current) || typeof current[key] !== "object") {
			current[key] = {};
		} else {
			current[key] = { ...current[key] };
		}
		current = current[key];
	}

	// 设置最终值
	current[keys[keys.length - 1]] = value;
	return result;
}

/**
 * 获取嵌套设置值
 */
export function getSettingsValue<T>(settings: any, path: string, defaultValue?: T): T {
	const keys = path.split(".");
	let current = settings;

	for (const key of keys) {
		if (current && typeof current === "object" && key in current) {
			current = current[key];
		} else {
			return defaultValue as T;
		}
	}

	return current as T;
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout;

	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), wait);
	};
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle: boolean;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => {
				inThrottle = false;
			}, limit);
		}
	};
}
