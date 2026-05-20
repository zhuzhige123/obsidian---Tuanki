import type { SupportedLanguage, TranslationKey } from "../types";

export const licenseUiTranslationOverrides: Record<SupportedLanguage, TranslationKey> = {
	"zh-CN": {
		about: {
			license: {
				activation: {
					activating: "激活中...",
					codePlaceholder: "请粘贴完整的激活码（通常约 500-800 字符）",
					confirmEmailPlaceholder: "请再次输入邮箱",
					helpFormatBody:
						"激活码是一段较长的字符串，通常约 500-800 个字符，由两部分组成，并用点号分隔。",
					helpInputTips:
						"请完整复制激活码，包括所有字符\n激活码区分大小写，请确保准确输入\n如果激活码很长，建议使用粘贴功能\n激活码只能在授权设备上使用",
					helpTroubleshootingTips:
						"如果提示格式错误，请检查是否完整复制了激活码\n如果提示已过期，请联系支持获取新的激活码\n如果提示设备不匹配，可能需要进行设备迁移\n如果多次尝试失败，请等待 15 分钟后再试",
				},
				statusCard: {
					currentProductLicense: "当前产品授权",
					currentProductLicenseCount: "当前产品授权数",
					epubReader: "EPUB 阅读器",
					licenseSource: "授权来源",
					relatedProduct: "关联产品",
					sharedLicense: "共享授权",
					sharedLicenseCount: "共享授权数",
					sharedLicenseFrom: "共享授权（来自 {product}）",
				},
				notices: {
					resetConfirm: "确定要重置许可证吗？这将清除当前的激活状态。",
					resetConfirmTitle: "确认重置",
					resetSuccess: "许可证已重置",
					verifyAction: "许可证验证",
					verifyFailed: "许可证验证失败",
					verifyFailedWithReason: "许可证验证失败：{reason}",
					verifySuccess: "许可证验证成功",
				},
			},
		},
	},
	"en-US": {
		about: {
			license: {
				activation: {
					activating: "Activating...",
					codePlaceholder: "Paste the full activation code (usually around 500-800 characters)",
					confirmEmailPlaceholder: "Re-enter your email",
					helpFormatBody:
						"An activation code is a long string, typically 500-800 characters, made of two parts separated by a period.",
					helpInputTips:
						"Copy the full activation code, including all characters\nActivation codes are case-sensitive\nIf the code is very long, pasting is recommended\nThe activation code can only be used on authorized devices",
					helpTroubleshootingTips:
						"If you see a format error, make sure the full activation code was copied\nIf the code has expired, contact support for a new one\nIf the device does not match, you may need a device migration\nIf repeated attempts fail, wait 15 minutes before trying again",
				},
				statusCard: {
					currentProductLicense: "Current product license",
					currentProductLicenseCount: "Current product licenses",
					epubReader: "EPUB Reader",
					licenseSource: "License source",
					relatedProduct: "Related product",
					sharedLicense: "Shared license",
					sharedLicenseCount: "Shared licenses",
					sharedLicenseFrom: "Shared license (from {product})",
				},
				notices: {
					resetConfirm: "Reset the license? This will clear the current activation state.",
					resetConfirmTitle: "Confirm reset",
					resetSuccess: "License reset",
					verifyAction: "License verification",
					verifyFailed: "License verification failed",
					verifyFailedWithReason: "License verification failed: {reason}",
					verifySuccess: "License verification succeeded",
				},
			},
		},
	},
};
