/**
 * 云同步安全文件名工具
 *
 * 提供文件/目录名的云同步兼容性检测和修复功能。
 * 针对 WebDAV、坚果云、OneDrive 等常见同步方案的兼容性约束。
 */

// ===== Emoji 正则（覆盖常见 Emoji 范围） =====
const EMOJI_REGEX =
	/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

// ===== 全角标点映射 =====
const FULLWIDTH_MAP: Record<string, string> = {
	"\uFF1A": "-", // ：
	"\uFF08": "(", // （
	"\uFF09": ")", // ）
	"\u3010": "(", // 【
	"\u3011": ")", // 】
	"\u300A": "(", // 《
	"\u300B": ")", // 》
	"\u3001": ",", // 、
	"\uFF0C": ",", // ，
	"\uFF1B": ";", // ；
	"\uFF01": "!", // ！
	"\uFF1F": "_", // ？
	"\u2018": "'", // '
	"\u2019": "'", // '
	"\u201C": "'", // "
	"\u201D": "'", // "
};

const FULLWIDTH_CHARS_REGEX = new RegExp(`[${Object.keys(FULLWIDTH_MAP).join("")}]`, "g");

/** 诊断结果 */
export interface SyncDiagnostic {
	/** 是否存在不兼容字符 */
	hasIssue: boolean;
	/** 问题类型列表 */
	issues: SyncIssueType[];
	/** 原始名称 */
	original: string;
	/** 建议修复后的名称 */
	suggested: string;
}

export type SyncIssueType =
	| "emoji"
	| "fullwidth_punctuation"
	| "square_brackets"
	| "path_too_long"
	| "no_extension"
	| "unsafe_chars"
	| "leading_dot";

/**
 * 检测文件/目录名是否包含云同步不兼容字符
 */
export function hasUnsyncableChars(name: string): boolean {
	if (EMOJI_REGEX.test(name)) return true;
	// 重置 lastIndex（全局正则）
	EMOJI_REGEX.lastIndex = 0;

	if (FULLWIDTH_CHARS_REGEX.test(name)) return true;
	FULLWIDTH_CHARS_REGEX.lastIndex = 0;

	if (/[\[\]]/.test(name)) return true;

	return false;
}

/**
 * 诊断文件名的云同步兼容性问题
 *
 * @param name 文件/目录名（不含路径分隔符）
 * @param isFile 是否是文件（用于检测无扩展名问题）
 * @param fullPathLength 完整路径长度（用于检测超长路径）
 */
export function diagnoseFilename(name: string, isFile = false, fullPathLength = 0): SyncDiagnostic {
	const issues: SyncIssueType[] = [];

	EMOJI_REGEX.lastIndex = 0;
	if (EMOJI_REGEX.test(name)) {
		issues.push("emoji");
	}

	FULLWIDTH_CHARS_REGEX.lastIndex = 0;
	if (FULLWIDTH_CHARS_REGEX.test(name)) {
		issues.push("fullwidth_punctuation");
	}

	if (/[\[\]]/.test(name)) {
		issues.push("square_brackets");
	}

	if (fullPathLength > 150) {
		issues.push("path_too_long");
	}

	if (isFile && !name.includes(".")) {
		issues.push("no_extension");
	}

	if (name.startsWith(".")) {
		issues.push("leading_dot");
	}

	// Windows/WebDAV 不安全字符，以及误混入名称段的路径分隔符
	if (/[<>:"|?*\\/]/.test(name)) {
		issues.push("unsafe_chars");
	}

	const suggested = issues.length > 0 ? sanitizeForSync(name) : name;

	return {
		hasIssue: issues.length > 0,
		issues,
		original: name,
		suggested,
	};
}

/**
 * 将文件/目录名转换为云同步安全格式
 *
 * 规则：
 * - Emoji → 移除
 * - 全角标点 → 半角等价或 _
 * - 方括号 [] → ()
 * - Windows 不安全字符、路径分隔符 → _
 * - 开头的 . → 移除
 * - 连续 _ 合并
 * - 截断超长名称（保留扩展名）
 * - 保留中文、日文、韩文字符
 */
export function sanitizeForSync(name: string, maxLength = 100): string {
	if (!name) return "unnamed";

	let result = name;

	// 1. 移除 Emoji
	EMOJI_REGEX.lastIndex = 0;
	result = result.replace(EMOJI_REGEX, "");

	// 2. 全角标点 → 半角
	result = result.replace(FULLWIDTH_CHARS_REGEX, (ch) => FULLWIDTH_MAP[ch] || "_");

	// 3. 方括号 → 圆括号
	result = result.replace(/\[/g, "(").replace(/\]/g, ")");

	// 4. Windows/WebDAV 不安全字符，以及误混入名称段的路径分隔符
	result = result.replace(/[<>:"|?*\\/]/g, "_");

	// 5. 移除开头的 .
	result = result.replace(/^\.+/, "");

	// 6. 合并连续下划线和空格
	result = result.replace(/[_\s]{2,}/g, "_");

	// 7. 移除首尾空白和下划线
	result = result.replace(/^[_\s]+|[_\s]+$/g, "");

	// 8. 截断超长名称（保留扩展名）
	if (result.length > maxLength) {
		const lastDot = result.lastIndexOf(".");
		if (lastDot > 0 && result.length - lastDot <= 10) {
			const ext = result.slice(lastDot);
			const base = result.slice(0, maxLength - ext.length);
			result = base + ext;
		} else {
			result = result.slice(0, maxLength);
		}
	}

	return result || "unnamed";
}

/**
 * 对完整的 vault 相对路径进行诊断
 * 检查路径中每一段的兼容性
 *
 * @param relativePath vault 内的相对路径
 * @returns 所有有问题的路径段诊断结果
 */
export function diagnosePath(relativePath: string): {
	hasIssue: boolean;
	segments: Array<{ index: number; segment: string; diagnostic: SyncDiagnostic }>;
	fullPathTooLong: boolean;
} {
	const segments = relativePath.split("/");
	const results: Array<{ index: number; segment: string; diagnostic: SyncDiagnostic }> = [];
	let hasIssue = false;
	const fullPathTooLong = relativePath.length > 150;

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (!seg) continue;

		const isFile = i === segments.length - 1 && seg.includes(".");
		const diagnostic = diagnoseFilename(seg, isFile, relativePath.length);

		if (diagnostic.hasIssue) {
			hasIssue = true;
			results.push({ index: i, segment: seg, diagnostic });
		}
	}

	if (fullPathTooLong) {
		hasIssue = true;
	}

	return { hasIssue, segments: results, fullPathTooLong };
}

/**
 * 生成安全的重命名路径
 * 只替换有问题的路径段
 */
export function generateSafePath(relativePath: string): string {
	const segments = relativePath.split("/");
	const result = segments.map((seg, i) => {
		if (!seg) return seg;
		const isFile = i === segments.length - 1 && seg.includes(".");
		const diagnostic = diagnoseFilename(seg, isFile, relativePath.length);
		return diagnostic.hasIssue ? diagnostic.suggested : seg;
	});
	return result.join("/");
}
