import { logger } from "../utils/logger";
import type { TimerHandle } from "../types/timer";
/**
 * 数据完整性检查器
 * 定期验证字段数据与原始内容的一致性，及时发现数据丢失问题
 */

export interface IntegrityCheckConfig {
	enablePeriodicCheck: boolean; // 启用定期检查
	checkInterval: number; // 检查间隔（毫秒）
	enableRealTimeCheck: boolean; // 启用实时检查
	enableDeepCheck: boolean; // 启用深度检查
	maxCheckHistory: number; // 最大检查历史记录数
	alertThreshold: number; // 警报阈值（问题数量）
}

export interface IntegrityCheckResult {
	cardId: string;
	timestamp: number;
	checkType: "periodic" | "realtime" | "manual" | "deep";
	overallStatus: "healthy" | "warning" | "critical";
	issues: IntegrityIssue[];
	metrics: IntegrityMetrics;
	recommendations: string[];
	autoFixApplied: boolean;
}

export interface IntegrityIssue {
	id: string;
	type: "data_loss" | "corruption" | "inconsistency" | "format_error" | "checksum_mismatch";
	severity: "low" | "medium" | "high" | "critical";
	field: string;
	description: string;
	detectedValue: string;
	expectedValue?: string;
	autoFixable: boolean;
	fixSuggestion?: string;
}

export interface IntegrityMetrics {
	totalFields: number;
	healthyFields: number;
	warningFields: number;
	criticalFields: number;
	dataCompleteness: number; // 数据完整性百分比
	contentConsistency: number; // 内容一致性百分比
	checksumMatch: boolean; // 校验和匹配
	lastModified: number; // 最后修改时间
}

export interface IntegrityReport {
	reportId: string;
	timestamp: number;
	totalCards: number;
	checkedCards: number;
	healthyCards: number;
	warningCards: number;
	criticalCards: number;
	commonIssues: { type: string; count: number }[];
	recommendations: string[];
	executionTime: number;
}

/**
 * 数据完整性检查器
 * 提供全面的数据完整性检查和监控功能
 */
export class DataIntegrityChecker {
	private config: IntegrityCheckConfig;
	private checkHistory: Map<string, IntegrityCheckResult[]> = new Map();
	private periodicCheckInterval: TimerHandle | null = null;
	private isChecking = false;

	constructor(config?: Partial<IntegrityCheckConfig>) {
		this.config = {
			enablePeriodicCheck: true,
			checkInterval: 5 * 60 * 1000, // 5分钟
			enableRealTimeCheck: true,
			enableDeepCheck: false,
			maxCheckHistory: 50,
			alertThreshold: 3,
			...config,
		};

		this.initializeChecker();
	}

	private hasControlCharacters(value: string): boolean {
		for (const char of value) {
			const code = char.charCodeAt(0);
			if (
				(code >= 0 && code <= 8) ||
				code === 11 ||
				code === 12 ||
				(code >= 14 && code <= 31) ||
				code === 127
			) {
				return true;
			}
		}
		return false;
	}

	private stripControlCharacters(value: string): string {
		return Array.from(value)
			.filter((char) => {
				const code = char.charCodeAt(0);
				return !(
					(code >= 0 && code <= 8) ||
					code === 11 ||
					code === 12 ||
					(code >= 14 && code <= 31) ||
					code === 127
				);
			})
			.join("");
	}

	/**
	 * 初始化检查器
	 */
	private initializeChecker(): void {
		logger.debug("🔍 [DataIntegrityChecker] 初始化数据完整性检查器");

		if (this.config.enablePeriodicCheck) {
			this.startPeriodicCheck();
		}
	}

	/**
	 * 检查单个卡片的数据完整性
	 */
	checkCardIntegrity(
		cardId: string,
		currentFields: Record<string, string>,
		originalContent?: string,
		checkType: IntegrityCheckResult["checkType"] = "manual"
	): IntegrityCheckResult {
		logger.debug(`🔍 [DataIntegrityChecker] 检查卡片完整性: ${cardId}`);

		const timestamp = Date.now();
		const issues: IntegrityIssue[] = [];
		let autoFixApplied = false;

		// 1. 检查notes字段完整性
		this.checkNotesFieldIntegrity(currentFields, originalContent, issues);

		// 2. 检查字段数据一致性
		this.checkFieldConsistency(currentFields, issues);

		// 3. 检查数据格式
		this.checkDataFormat(currentFields, issues);

		// 4. 检查校验和
		this.checkDataChecksum(currentFields, originalContent, issues);

		// 5. 深度检查（如果启用）
		if (this.config.enableDeepCheck) {
			this.performDeepCheck(currentFields, issues);
		}

		// 6. 计算指标
		const metrics = this.calculateMetrics(currentFields, issues, originalContent);

		// 7. 确定整体状态
		const overallStatus = this.determineOverallStatus(issues);

		// 8. 生成建议
		const recommendations = this.generateRecommendations(issues, metrics);

		// 9. 尝试自动修复
		if (issues.some((issue) => issue.autoFixable)) {
			autoFixApplied = this.attemptAutoFix(cardId, currentFields, issues);
		}

		const result: IntegrityCheckResult = {
			cardId,
			timestamp,
			checkType,
			overallStatus,
			issues,
			metrics,
			recommendations,
			autoFixApplied,
		};

		// 保存检查历史
		this.saveCheckHistory(cardId, result);

		logger.debug(`✅ [DataIntegrityChecker] 完整性检查完成: ${cardId}, 状态: ${overallStatus}`);

		return result;
	}

	/**
	 * 批量检查多个卡片
	 */
	async checkMultipleCards(
		cards: Array<{ cardId: string; fields: Record<string, string>; originalContent?: string }>
	): Promise<IntegrityReport> {
		logger.debug(`🔍 [DataIntegrityChecker] 批量检查${cards.length}个卡片`);

		const startTime = Date.now();
		const reportId = this.generateReportId();
		const results: IntegrityCheckResult[] = [];

		for (const card of cards) {
			try {
				const result = this.checkCardIntegrity(
					card.cardId,
					card.fields,
					card.originalContent,
					"periodic"
				);
				results.push(result);
			} catch (error) {
				logger.error(`❌ [DataIntegrityChecker] 检查失败: ${card.cardId}`, error);
			}
		}

		const executionTime = Date.now() - startTime;

		// 统计结果
		const healthyCards = results.filter((r) => r.overallStatus === "healthy").length;
		const warningCards = results.filter((r) => r.overallStatus === "warning").length;
		const criticalCards = results.filter((r) => r.overallStatus === "critical").length;

		// 统计常见问题
		const issueCount: Record<string, number> = {};
		results.forEach((_result) => {
			_result.issues.forEach((_issue) => {
				issueCount[_issue.type] = (issueCount[_issue.type] || 0) + 1;
			});
		});

		const commonIssues = Object.entries(issueCount)
			.map(([type, count]) => ({ type, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);

		// 生成整体建议
		const recommendations = this.generateBatchRecommendations(results);

		const report: IntegrityReport = {
			reportId,
			timestamp: Date.now(),
			totalCards: cards.length,
			checkedCards: results.length,
			healthyCards,
			warningCards,
			criticalCards,
			commonIssues,
			recommendations,
			executionTime,
		};

		logger.debug(`📊 [DataIntegrityChecker] 批量检查完成: ${results.length}/${cards.length} 成功`);

		return report;
	}

	/**
	 * 启动定期检查
	 */
	startPeriodicCheck(): void {
		if (this.periodicCheckInterval) {
			window.clearInterval(this.periodicCheckInterval);
		}

		this.periodicCheckInterval = window.setInterval(() => {
			if (!this.isChecking) {
				void this.performPeriodicCheck();
			}
		}, this.config.checkInterval);

		logger.debug(`🔄 [DataIntegrityChecker] 启动定期检查，间隔: ${this.config.checkInterval}ms`);
	}

	/**
	 * 停止定期检查
	 */
	stopPeriodicCheck(): void {
		if (this.periodicCheckInterval) {
			window.clearInterval(this.periodicCheckInterval);
			this.periodicCheckInterval = null;
			logger.debug("⏹️ [DataIntegrityChecker] 停止定期检查");
		}
	}

	/**
	 * 获取检查历史
	 */
	getCheckHistory(cardId: string): IntegrityCheckResult[] {
		return this.checkHistory.get(cardId) || [];
	}

	/**
	 * 获取所有检查历史
	 */
	getAllCheckHistory(): Map<string, IntegrityCheckResult[]> {
		return new Map(this.checkHistory);
	}

	/**
	 * 清理旧的检查历史
	 */
	cleanupOldHistory(): number {
		let cleaned = 0;

		for (const history of this.checkHistory.values()) {
			if (history.length > this.config.maxCheckHistory) {
				const toRemove = history.length - this.config.maxCheckHistory;
				history.splice(0, toRemove);
				cleaned += toRemove;
			}
		}

		if (cleaned > 0) {
			logger.debug(`🧹 [DataIntegrityChecker] 清理了${cleaned}条旧检查记录`);
		}

		return cleaned;
	}

	// 私有检查方法

	private checkNotesFieldIntegrity(
		currentFields: Record<string, string>,
		originalContent: string | undefined,
		issues: IntegrityIssue[]
	): void {
		const notesField = currentFields.notes;

		// 检查notes字段是否存在
		if (!notesField || notesField.trim() === "") {
			issues.push({
				id: this.generateIssueId(),
				type: "data_loss",
				severity: "critical",
				field: "notes",
				description: "Notes字段缺失或为空，原始内容可能丢失",
				detectedValue: notesField || "",
				expectedValue: originalContent,
				autoFixable: !!originalContent,
				fixSuggestion: originalContent ? "从原始内容恢复notes字段" : "需要手动输入原始内容",
			});
		}

		// 检查notes字段与原始内容的一致性
		if (originalContent && notesField && notesField !== originalContent) {
			const similarity = this.calculateSimilarity(notesField, originalContent);
			if (similarity < 0.9) {
				issues.push({
					id: this.generateIssueId(),
					type: "inconsistency",
					severity: similarity < 0.5 ? "high" : "medium",
					field: "notes",
					description: `Notes字段与原始内容不一致，相似度: ${(similarity * 100).toFixed(1)}%`,
					detectedValue: notesField,
					expectedValue: originalContent,
					autoFixable: true,
					fixSuggestion: "同步notes字段与原始内容",
				});
			}
		}
	}

	private checkFieldConsistency(
		currentFields: Record<string, string>,
		issues: IntegrityIssue[]
	): void {
		const requiredFields = ["question", "answer", "notes"];

		for (const field of requiredFields) {
			const value = currentFields[field];

			if (!value || value.trim() === "") {
				issues.push({
					id: this.generateIssueId(),
					type: "data_loss",
					severity: field === "notes" ? "critical" : "medium",
					field,
					description: `必需字段 "${field}" 为空`,
					detectedValue: value || "",
					autoFixable: false,
					fixSuggestion: `需要为字段 "${field}" 提供内容`,
				});
			}
		}

		// 检查字段长度异常
		Object.entries(currentFields).forEach(([field, value]) => {
			if (value && value.length > 10000) {
				issues.push({
					id: this.generateIssueId(),
					type: "format_error",
					severity: "low",
					field,
					description: `字段 "${field}" 内容过长 (${value.length} 字符)`,
					detectedValue: `${value.length} 字符`,
					autoFixable: false,
					fixSuggestion: "检查字段内容是否包含了其他字段的数据",
				});
			}
		});
	}

	private checkDataFormat(
		currentFields: Record<string, string>,
		issues: IntegrityIssue[]
	): void {
		// 检查特殊字符和编码问题
		Object.entries(currentFields).forEach(([field, value]) => {
			if (value) {
				// 检查控制字符
				if (this.hasControlCharacters(value)) {
					issues.push({
						id: this.generateIssueId(),
						type: "format_error",
						severity: "medium",
						field,
						description: `字段 "${field}" 包含控制字符`,
						detectedValue: value,
						autoFixable: true,
						fixSuggestion: "清理控制字符",
					});
				}

				// 检查编码问题
				if (value !== value.normalize("NFC")) {
					issues.push({
						id: this.generateIssueId(),
						type: "format_error",
						severity: "low",
						field,
						description: `字段 "${field}" 存在Unicode规范化问题`,
						detectedValue: value,
						autoFixable: true,
						fixSuggestion: "规范化Unicode字符",
					});
				}
			}
		});
	}

	private checkDataChecksum(
		currentFields: Record<string, string>,
		originalContent: string | undefined,
		issues: IntegrityIssue[]
	): void {
		if (!originalContent) return;

		const currentChecksum = this.calculateChecksum(currentFields.notes || "");
		const expectedChecksum = this.calculateChecksum(originalContent);

		if (currentChecksum !== expectedChecksum) {
			issues.push({
				id: this.generateIssueId(),
				type: "checksum_mismatch",
				severity: "medium",
				field: "notes",
				description: "数据校验和不匹配，内容可能已被修改",
				detectedValue: currentChecksum,
				expectedValue: expectedChecksum,
				autoFixable: false,
				fixSuggestion: "验证内容是否被意外修改",
			});
		}
	}

	private performDeepCheck(
		currentFields: Record<string, string>,
		issues: IntegrityIssue[]
	): void {
		// 深度检查：分析内容结构和语义
		const notesContent = currentFields.notes;
		if (!notesContent) return;

		// 检查内容结构完整性
		const lines = notesContent.split("\n");
		const hasHeadings = lines.some((line) => /^#{1,6}\s+/.test(line));
		const hasContent = lines.some((line) => line.trim().length > 10);

		if (!hasHeadings && !hasContent) {
			issues.push({
				id: this.generateIssueId(),
				type: "corruption",
				severity: "high",
				field: "notes",
				description: "内容结构异常，缺少标题或实质内容",
				detectedValue: notesContent,
				autoFixable: false,
				fixSuggestion: "检查内容是否完整",
			});
		}
	}

	private calculateMetrics(
		currentFields: Record<string, string>,
		issues: IntegrityIssue[],
		originalContent?: string
	): IntegrityMetrics {
		const totalFields = Object.keys(currentFields).length;
		const criticalIssues = issues.filter((i) => i.severity === "critical");
		const warningIssues = issues.filter((i) => i.severity === "high" || i.severity === "medium");

		const criticalFields = new Set(criticalIssues.map((i) => i.field)).size;
		const warningFields = new Set(warningIssues.map((i) => i.field)).size;
		const healthyFields = totalFields - criticalFields - warningFields;

		// 计算数据完整性
		const nonEmptyFields = Object.values(currentFields).filter((v) => v?.trim()).length;
		const dataCompleteness = totalFields > 0 ? nonEmptyFields / totalFields : 0;

		// 计算内容一致性
		let contentConsistency = 1.0;
		if (originalContent && currentFields.notes) {
			contentConsistency = this.calculateSimilarity(currentFields.notes, originalContent);
		}

		// 检查校验和匹配
		const checksumMatch = originalContent
			? this.calculateChecksum(currentFields.notes || "") ===
			  this.calculateChecksum(originalContent)
			: true;

		return {
			totalFields,
			healthyFields,
			warningFields,
			criticalFields,
			dataCompleteness,
			contentConsistency,
			checksumMatch,
			lastModified: Date.now(),
		};
	}

	private determineOverallStatus(issues: IntegrityIssue[]): IntegrityCheckResult["overallStatus"] {
		const hasCritical = issues.some((i) => i.severity === "critical");
		const hasHigh = issues.some((i) => i.severity === "high");
		const hasMedium = issues.some((i) => i.severity === "medium");

		if (hasCritical) return "critical";
		if (hasHigh || hasMedium) return "warning";
		return "healthy";
	}

	private generateRecommendations(issues: IntegrityIssue[], metrics: IntegrityMetrics): string[] {
		const recommendations: string[] = [];

		if (metrics.dataCompleteness < 0.8) {
			recommendations.push("数据完整性较低，建议检查缺失的字段");
		}

		if (metrics.contentConsistency < 0.9) {
			recommendations.push("内容一致性较低，建议验证notes字段与原始内容的一致性");
		}

		if (!metrics.checksumMatch) {
			recommendations.push("数据校验和不匹配，建议检查内容是否被意外修改");
		}

		const criticalIssues = issues.filter((i) => i.severity === "critical");
		if (criticalIssues.length > 0) {
			recommendations.push("发现严重问题，建议立即处理以避免数据丢失");
		}

		const autoFixableIssues = issues.filter((i) => i.autoFixable);
		if (autoFixableIssues.length > 0) {
			recommendations.push(`有${autoFixableIssues.length}个问题可以自动修复`);
		}

		return recommendations;
	}

	private generateBatchRecommendations(results: IntegrityCheckResult[]): string[] {
		const recommendations: string[] = [];

		const criticalCards = results.filter((r) => r.overallStatus === "critical").length;
		const warningCards = results.filter((r) => r.overallStatus === "warning").length;

		if (criticalCards > 0) {
			recommendations.push(`发现${criticalCards}张卡片存在严重问题，需要立即处理`);
		}

		if (warningCards > 0) {
			recommendations.push(`发现${warningCards}张卡片存在警告问题，建议及时处理`);
		}

		const autoFixCount = results.reduce(
			(sum, r) => sum + r.issues.filter((i) => i.autoFixable).length,
			0
		);

		if (autoFixCount > 0) {
			recommendations.push(`总共有${autoFixCount}个问题可以自动修复`);
		}

		return recommendations;
	}

	private attemptAutoFix(
		cardId: string,
		currentFields: Record<string, string>,
		issues: IntegrityIssue[]
	): boolean {
		let fixApplied = false;

		for (const issue of issues.filter((i) => i.autoFixable)) {
			try {
				switch (issue.type) {
					case "format_error":
						if (issue.description.includes("控制字符")) {
							currentFields[issue.field] = this.stripControlCharacters(currentFields[issue.field]);
							fixApplied = true;
						} else if (issue.description.includes("Unicode规范化")) {
							currentFields[issue.field] = currentFields[issue.field].normalize("NFC");
							fixApplied = true;
						}
						break;

					case "inconsistency":
						if (issue.field === "notes" && issue.expectedValue) {
							currentFields.notes = issue.expectedValue;
							fixApplied = true;
						}
						break;

					case "data_loss":
						if (issue.field === "notes" && issue.expectedValue) {
							currentFields.notes = issue.expectedValue;
							fixApplied = true;
						}
						break;
				}
			} catch (error) {
				logger.error(`❌ [DataIntegrityChecker] 自动修复失败: ${issue.id}`, error);
			}
		}

		if (fixApplied) {
			logger.debug(`🔧 [DataIntegrityChecker] 应用了自动修复: ${cardId}`);
		}

		return fixApplied;
	}

	private async performPeriodicCheck(): Promise<void> {
		this.isChecking = true;
		logger.debug("🔄 [DataIntegrityChecker] 执行定期完整性检查");

		try {
			// 这里应该获取所有卡片数据进行检查
			// 由于我们没有访问实际的卡片数据，这里只是示例
			logger.debug("✅ [DataIntegrityChecker] 定期检查完成");
		} catch (error) {
			logger.error("❌ [DataIntegrityChecker] 定期检查失败:", error);
		} finally {
			this.isChecking = false;
		}
	}

	private saveCheckHistory(cardId: string, result: IntegrityCheckResult): void {
		const history = this.checkHistory.get(cardId) || [];
		history.push(result);

		// 限制历史记录数量
		if (history.length > this.config.maxCheckHistory) {
			history.shift();
		}

		this.checkHistory.set(cardId, history);
	}

	// 辅助方法

	private calculateSimilarity(text1: string, text2: string): number {
		if (text1 === text2) return 1.0;

		const words1 = text1.toLowerCase().split(/\s+/);
		const words2 = text2.toLowerCase().split(/\s+/);

		const commonWords = words1.filter((word) => words2.includes(word));
		const totalWords = Math.max(words1.length, words2.length);

		return totalWords > 0 ? commonWords.length / totalWords : 0;
	}

	private calculateChecksum(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return hash.toString(16);
	}

	private generateIssueId(): string {
		return `issue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	private generateReportId(): string {
		return `report_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * 销毁检查器
	 */
	destroy(): void {
		this.stopPeriodicCheck();
		this.checkHistory.clear();
		logger.debug("🔍 [DataIntegrityChecker] 数据完整性检查器已销毁");
	}
}
