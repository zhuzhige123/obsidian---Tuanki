/**
 * 格式化工具函数
 * 提供数字、文件大小、时间等格式化功能
 */

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";

	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * 格式化数字（添加千分位分隔符）
 */
export function formatNumber(num: number): string {
	return num.toLocaleString();
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(date: string | Date): string {
	const targetDate = typeof date === "string" ? new Date(date) : date;
	const now = new Date();
	const diffMs = now.getTime() - targetDate.getTime();

	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) return "刚刚";
	if (diffMinutes < 60) return `${diffMinutes}分钟前`;
	if (diffHours < 24) return `${diffHours}小时前`;
	if (diffDays < 30) return `${diffDays}天前`;

	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12) return `${diffMonths}个月前`;

	const diffYears = Math.floor(diffMonths / 12);
	return `${diffYears}年前`;
}

/**
 * 格式化时间戳为可读格式
 */
export function formatDateTime(date: string | Date): string {
	const targetDate = typeof date === "string" ? new Date(date) : date;

	return targetDate.toLocaleString("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * 格式化倒计时（毫秒 -> MM:SS 或 H:MM:SS，等宽数字友好）
 */
export function formatCountdownMs(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * 格式化持续时间（毫秒转为可读格式）
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;

	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes < 60) {
		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * 格式化百分比
 */
export function formatPercentage(value: number, total: number, decimals = 1): string {
	if (total === 0) return "0%";
	const percentage = (value / total) * 100;
	return `${percentage.toFixed(decimals)}%`;
}

/**
 * 截断文本并添加省略号
 * @param text 要截断的文本（自动转换为字符串）
 * @param maxLength 最大长度
 */
export function truncateText(text: unknown, maxLength: number): string {
	//  类型安全：确保text是字符串
	if (text === null || text === undefined) return "";
	const textStr =
		typeof text === "string"
			? text
			: typeof text === "number" || typeof text === "boolean"
				? String(text)
				: "";
	if (textStr.length <= maxLength) return textStr;
	return `${textStr.substring(0, maxLength - 3)}...`;
}

/**
 * 格式化路径（显示相对路径）
 */
export function formatPath(fullPath: string, basePath?: string): string {
	if (!basePath) return fullPath;

	if (fullPath.startsWith(basePath)) {
		const relativePath = fullPath.substring(basePath.length);
		return relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;
	}

	return fullPath;
}

/**
 * 格式化操作类型为中文
 */
export function formatOperationType(type: string): string {
	const typeMap: Record<string, string> = {
		export: "导出",
		import: "导入",
		backup: "备份",
		restore: "恢复",
		reset: "重置",
		refresh: "刷新",
		open_folder: "打开文件夹",
		delete_backup: "删除备份",
	};

	return typeMap[type] || type;
}

/**
 * 格式化备份类型为中文
 */
export function formatBackupType(type: string): string {
	const typeMap: Record<string, string> = {
		auto: "自动备份",
		manual: "手动备份",
		pre_operation: "操作前备份",
		scheduled: "定时备份",
	};

	return typeMap[type] || type;
}

/**
 * 格式化数据类型为中文
 */
export function formatDataType(type: string): string {
	const typeMap: Record<string, string> = {
		decks: "牌组",
		cards: "卡片",
		sessions: "学习记录",
		profile: "用户配置",
		templates: "模板",
		settings: "设置",
	};

	return typeMap[type] || type;
}

/**
 * 格式化错误严重程度
 */
export function formatSeverity(severity: string): string {
	const severityMap: Record<string, string> = {
		low: "轻微",
		medium: "中等",
		high: "严重",
		critical: "致命",
		warning: "警告",
		error: "错误",
	};

	return severityMap[severity] || severity;
}

/**
 * 格式化文件扩展名
 */
export function getFileExtension(filename: string): string {
	const lastDotIndex = filename.lastIndexOf(".");
	return lastDotIndex !== -1 ? filename.substring(lastDotIndex + 1).toLowerCase() : "";
}

/**
 * 格式化文件名（移除扩展名）
 */
export function getFileNameWithoutExtension(filename: string): string {
	const lastDotIndex = filename.lastIndexOf(".");
	return lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
}

/**
 * 格式化版本号
 */
export function formatVersion(version: string): string {
	// 简单的版本号格式化，可以根据需要扩展
	return version.startsWith("v") ? version : `v${version}`;
}

/**
 * 格式化内存使用量
 */
export function formatMemoryUsage(bytes: number): string {
	return formatFileSize(bytes);
}

/**
 * 格式化速度（字节/秒）
 */
export function formatSpeed(bytesPerSecond: number): string {
	return `${formatFileSize(bytesPerSecond)}/s`;
}

/**
 * 格式化进度百分比
 */
export function formatProgress(current: number, total: number): string {
	if (total === 0) return "0%";
	const percentage = Math.min(100, Math.max(0, (current / total) * 100));
	return `${Math.round(percentage)}%`;
}

/**
 * 格式化剩余时间估算
 */
export function formatEstimatedTime(ms: number): string {
	if (ms <= 0) return "未知";

	const seconds = Math.ceil(ms / 1000);

	if (seconds < 60) return `约 ${seconds} 秒`;

	const minutes = Math.ceil(seconds / 60);
	if (minutes < 60) return `约 ${minutes} 分钟`;

	const hours = Math.ceil(minutes / 60);
	return `约 ${hours} 小时`;
}

/**
 * 格式化计数（支持大数字简化）
 */
export function formatCount(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
	if (count < 1000000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${(count / 1000000000).toFixed(1)}B`;
}

/**
 * 格式化状态为中文
 */
export function formatStatus(status: string): string {
	const statusMap: Record<string, string> = {
		pending: "等待中",
		running: "运行中",
		completed: "已完成",
		failed: "失败",
		cancelled: "已取消",
		paused: "已暂停",
	};

	return statusMap[status] || status;
}
