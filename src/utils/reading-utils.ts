/**
 * 增量阅读工具函数
 *
 * 提取自 ReadingMaterialManager 和 AnchorManager 的共享逻辑
 *
 * @module utils/reading-utils
 * @version 1.0.0
 */

/**
 * 计算内容的字数
 * 支持中英文混合计数
 *
 * @param content 文本内容
 * @returns 字数（中文按字符计算，英文按单词计算）
 */
export function countWords(content: string): number {
	// 移除YAML frontmatter
	const withoutYAML = content.replace(/^---[\s\S]*?---\n?/, "");
	// 移除锚点标记
	const withoutAnchors = withoutYAML.replace(/\^weave-bookmark-\d+/g, "");
	// 移除Markdown标记
	const plainText = withoutAnchors
		.replace(/[#*_`~[\]()]/g, "")
		.replace(/\n+/g, " ")
		.trim();

	// 中文字符计数
	const chineseChars = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length;
	// 英文单词计数
	const englishWords = plainText
		.replace(/[\u4e00-\u9fa5]/g, " ")
		.split(/\s+/)
		.filter((word) => word.length > 0).length;

	return chineseChars + englishWords;
}

/**
 * 计算到指定位置的字数
 *
 * @param content 完整内容
 * @param position 字符位置
 * @returns 该位置之前的字数
 */
export function countWordsUpToPosition(content: string, position: number): number {
	const contentUpToPosition = content.substring(0, position);
	return countWords(contentUpToPosition);
}

/**
 * 估算阅读时间（分钟）
 * 假设平均阅读速度：中文 300字/分钟，英文 200词/分钟，混合 250
 *
 * @param wordCount 字数
 * @param avgSpeed 平均阅读速度（默认250）
 * @returns 预计阅读时间（分钟）
 */
export function estimateReadingTime(wordCount: number, avgSpeed = 250): number {
	return Math.ceil(wordCount / avgSpeed);
}

/**
 * 生成阅读材料UUID
 * 格式: tk-ir-{timestamp}
 *
 * @returns UUID字符串
 */
export function generateReadingUUID(): string {
	return `tk-ir-${Date.now()}`;
}

/**
 * 生成通用UUID
 * 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 *
 * @returns UUID字符串
 */
export function generateUUID(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * 判断两个日期是否是同一天
 *
 * @param d1 日期1
 * @param d2 日期2
 * @returns 是否同一天
 */
export function isSameDay(d1: Date, d2: Date): boolean {
	return (
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate()
	);
}

/**
 * 格式化日期为 YYYY-MM-DD
 *
 * @param date 日期
 * @returns 格式化字符串
 */
export function formatDateYMD(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * 格式化时长（秒转为可读格式）
 *
 * @param seconds 秒数
 * @returns 格式化字符串
 */
export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}秒`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}分钟`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
}
