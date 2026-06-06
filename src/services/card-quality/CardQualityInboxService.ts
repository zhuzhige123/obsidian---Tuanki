/**
 * 卡片质量收件箱服务
 *
 * 功能：
 * - 扫描卡片质量问题（重复、空内容、格式问题等）
 * - 管理质量问题收件箱
 * - 提供批量处理功能
 *
 * @module services/card-quality/CardQualityInboxService
 * @version 2.0.0
 */

import { getPluginPaths } from "../../config/paths";
import type { Card } from "../../data/types";
import { CardType } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type {
	BatchActionResult,
	InboxState,
	IssueSeverity,
	QualityIssue,
	QualityIssueType,
	ScanConfig,
	ScanProgressCallback,
	ScanResult,
} from "../../types/card-quality-types";
import { DEFAULT_SCAN_CONFIG } from "../../types/card-quality-types";
import { DirectoryUtils } from "../../utils/directory-utils";
import { generateId } from "../../utils/helpers";
import { t } from "../../utils/i18n";
import { logger } from "../../utils/logger";
import { extractSourcePath } from "../../utils/source-path-matcher";
import {
	extractBodyContent,
	parseObsidianLink,
	parseSourceInfo,
	parseYAMLFromContent,
} from "../../utils/yaml-utils";
import { EpubLinkService } from "../epub-integration/EpubLinkService";

/**
 * 卡片质量收件箱服务
 */
// 持久化数据结构
interface PersistedInboxData {
	issues: QualityIssue[];
	lastScanResult?: ScanResult;
	savedAt: string;
}

function isPersistedInboxData(value: unknown): value is PersistedInboxData {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Record<string, unknown>;
	return Array.isArray(record.issues);
}

export class CardQualityInboxService {
	private plugin: WeavePlugin;
	private issues: QualityIssue[] = [];
	private lastScanResult?: ScanResult;
	private initialized = false;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 初始化服务，加载持久化数据
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;
		await this.loadFromDisk();
		this.initialized = true;
	}

	/**
	 * 获取收件箱状态
	 */
	getInboxState(): InboxState {
		return {
			issues: this.issues,
			unresolvedCount: this.issues.filter((i) => !i.resolved).length,
			lastScanAt: this.lastScanResult?.scannedAt,
			lastScanResult: this.lastScanResult,
		};
	}

	/**
	 * 获取未解决的问题列表
	 */
	getUnresolvedIssues(): QualityIssue[] {
		return this.issues.filter((i) => !i.resolved);
	}

	/**
	 * 扫描卡片质量问题
	 */
	async scanCards(
		cards: Card[],
		config: Partial<ScanConfig> = {},
		onProgress?: ScanProgressCallback
	): Promise<ScanResult> {
		const startTime = Date.now();
		const fullConfig: ScanConfig = { ...DEFAULT_SCAN_CONFIG, ...config };
		const scanId = generateId();

		logger.info(`[CardQualityInbox] 开始扫描 ${cards.length} 张卡片...`);

		// 准备阶段
		onProgress?.({
			current: 0,
			total: cards.length,
			phase: "preparing",
			message: t("management.cardQuality.progress.preparing"),
		});

		const issues: QualityIssue[] = [];
		const issuesByType: Record<QualityIssueType, number> = {
			duplicate_exact: 0,
			duplicate_similar: 0,
			empty_content: 0,
			too_short: 0,
			too_long: 0,
			missing_answer: 0,
			missing_question: 0,
			low_retention: 0,
			high_difficulty: 0,
			orphan_card: 0,
			invalid_format: 0,
			source_missing: 0,
		};
		const issuesBySeverity: Record<IssueSeverity, number> = {
			error: 0,
			warning: 0,
			info: 0,
		};

		// 构建内容哈希映射（用于重复检测）
		const contentHashMap = new Map<string, Card[]>();

		// 扫描阶段
		for (let i = 0; i < cards.length; i++) {
			const card = cards[i];

			onProgress?.({
				current: i + 1,
				total: cards.length,
				phase: "scanning",
				message: t("management.cardQuality.progress.scanningCard", { current: i + 1, total: cards.length }),
			});

			// 获取卡片内容
			const content = this.getCardContent(card);
			const questionContent = this.getQuestionContent(card);
			const answerContent = this.getAnswerContent(card);

			// 1. 检测空内容 - 只有当整个卡片内容都为空时才报告
			const hasQuestion = questionContent && questionContent.trim().length > 0;
			const hasAnswer = answerContent && answerContent.trim().length > 0;

			if (fullConfig.detectEmpty) {
				// 只有问题和答案都为空时才认为是空内容
				if (!hasQuestion && !hasAnswer) {
					const issue = this.createIssue(card, "empty_content", "error", t("management.cardQuality.descriptions.emptyContent"));
					issues.push(issue);
					issuesByType.empty_content++;
					issuesBySeverity.error++;
				}
			}

			// 2. 检测问题/答案缺失 - 只有在卡片不是完全为空时才检测
			if (hasQuestion || hasAnswer) {
				if (!hasQuestion) {
					const issue = this.createIssue(card, "missing_question", "error", t("management.cardQuality.descriptions.missingQuestion"));
					issues.push(issue);
					issuesByType.missing_question++;
					issuesBySeverity.error++;
				}

				if (!hasAnswer) {
					const issue = this.createIssue(card, "missing_answer", "warning", t("management.cardQuality.descriptions.missingAnswer"));
					issues.push(issue);
					issuesByType.missing_answer++;
					issuesBySeverity.warning++;
				}
			}

			// 3. 检测过短内容
			if (fullConfig.detectShort && content) {
				if (content.length < fullConfig.minContentLength) {
					const issue = this.createIssue(
						card,
						"too_short",
						"warning",
						t("management.cardQuality.descriptions.tooShort", { length: content.length, min: fullConfig.minContentLength })
					);
					issues.push(issue);
					issuesByType.too_short++;
					issuesBySeverity.warning++;
				}
			}

			// 4. 检测过长内容
			if (fullConfig.detectLong && content) {
				if (content.length > fullConfig.maxContentLength) {
					const issue = this.createIssue(
						card,
						"too_long",
						"warning",
						t("management.cardQuality.descriptions.tooLong", { length: content.length, max: fullConfig.maxContentLength }),
						{ suggestedAction: t("management.cardQuality.suggestedActions.splitCards") }
					);
					issues.push(issue);
					issuesByType.too_long++;
					issuesBySeverity.warning++;
				}
			}

			// 5. 检测源文档缺失（补全 we_source YAML字段检查）
			if (fullConfig.detectMissingSource) {
				const yaml = parseYAMLFromContent(card.content || "");
				const sourceInfo = parseSourceInfo(card.content || "");
				const hasSource =
					extractSourcePath(card) ||
					sourceInfo.sourceBlock ||
					card.sourceBlock ||
					card.customFields?.blockId ||
					yaml.we_source;
				if (!hasSource) {
					// 检查是否手动创建的卡片（无源文档是正常的）
					const isManuallyCreated = card.fields?.creation_method === "manual";
					if (!isManuallyCreated) {
						const issue = this.createIssue(card, "source_missing", "info", t("management.cardQuality.descriptions.sourceMissing"));
						issues.push(issue);
						issuesByType.source_missing++;
						issuesBySeverity.info++;
					}
				} else if (fullConfig.detectMissingSource) {
					// 新功能：验证源文档是否实际存在于Vault中
					const sourceValues = Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source];
					const sourceFiles = [
						card.sourceFile,
						...sourceValues.map((value) =>
							typeof value === "string" ? this.parseSourcePath(value) : null
						),
					].filter(
						(value, index, self): value is string =>
							typeof value === "string" && value.length > 0 && self.indexOf(value) === index
					);
					if (sourceFiles.length > 0) {
						let hasExistingSource = false;
						for (const sourceFile of sourceFiles) {
							if (await this.checkSourceFileExists(sourceFile)) {
								hasExistingSource = true;
								break;
							}
						}
						if (!hasExistingSource) {
							const missingLabel =
								sourceFiles.length === 1
									? sourceFiles[0]
									: `${sourceFiles[0]} 等 ${sourceFiles.length} 个来源`;
							const issue = this.createIssue(
								card,
								"source_missing",
								"warning",
								t("management.cardQuality.descriptions.sourceMissingFile", { label: missingLabel }),
								{ suggestedAction: t("management.cardQuality.suggestedActions.sourceMoved") }
							);
							issues.push(issue);
							issuesByType.source_missing++;
							issuesBySeverity.warning++;
						}
					}
				}
			}

			// 6. 检测FSRS学习问题
			if (fullConfig.detectFSRSIssues && card.fsrs) {
				// 低保留率 - FSRS中使用retrievability表示保留率 (0-1)
				const retention = card.fsrs.retrievability;
				if (retention !== undefined && retention < fullConfig.lowRetentionThreshold) {
					const issue = this.createIssue(
						card,
						"low_retention",
						"warning",
						t("management.cardQuality.descriptions.lowRetention", { percent: (retention * 100).toFixed(1) }),
						{ suggestedAction: t("management.cardQuality.suggestedActions.simplify") }
					);
					issues.push(issue);
					issuesByType.low_retention++;
					issuesBySeverity.warning++;
				}

				// 高难度 - FSRS difficulty 范围是 1-10，阈值也使用 1-10 标尺
				const difficulty = card.fsrs.difficulty;
				if (difficulty !== undefined && difficulty > fullConfig.highDifficultyThreshold) {
					const issue = this.createIssue(
						card,
						"high_difficulty",
						"info",
						t("management.cardQuality.descriptions.highDifficulty", { score: difficulty.toFixed(1) }),
						{ suggestedAction: t("management.cardQuality.suggestedActions.addContext") }
					);
					issues.push(issue);
					issuesByType.high_difficulty++;
					issuesBySeverity.info++;
				}
			}

			// 7. 检测格式无效
			if (card.content) {
				const formatIssue = this.detectInvalidFormat(card);
				if (formatIssue) {
					issues.push(formatIssue);
					issuesByType.invalid_format++;
					issuesBySeverity[formatIssue.severity]++;
				}
			}

			// 8. 构建内容哈希（用于后续重复检测）
			if (fullConfig.detectDuplicates && content) {
				const normalizedContent = this.normalizeContent(content);
				const hash = this.reliableHash(normalizedContent);

				if (!contentHashMap.has(hash)) {
					contentHashMap.set(hash, []);
				}
				contentHashMap.get(hash)?.push(card);
			}
		}

		// 8.5 检测孤儿卡片
		if (fullConfig.detectOrphans && this.plugin.cardMetadataCache) {
			onProgress?.({
				current: cards.length,
				total: cards.length,
				phase: "analyzing",
				message: t("management.cardQuality.progress.analyzingOrphans"),
			});

			for (const card of cards) {
				if (this.plugin.cardMetadataCache.isOrphanCard(card)) {
					const issue = this.createIssue(card, "orphan_card", "warning", t("management.cardQuality.descriptions.orphanCard"), {
						suggestedAction: t("management.cardQuality.suggestedActions.addToDeckOrDelete"),
					});
					issues.push(issue);
					issuesByType.orphan_card++;
					issuesBySeverity.warning++;
				}
			}
		}

		// 分析阶段：检测重复
		onProgress?.({
			current: cards.length,
			total: cards.length,
			phase: "analyzing",
			message: t("management.cardQuality.progress.analyzingDuplicates"),
		});

		if (fullConfig.detectDuplicates) {
			// 精确重复检测（基于哈希 + 内容确认）
			for (const [_hash, duplicateCards] of contentHashMap) {
				if (duplicateCards.length > 1) {
					// 哈希碰撞时额外确认内容是否真的相同
					const confirmedGroups = this.groupByExactContent(duplicateCards);
					for (const group of confirmedGroups) {
						if (group.length > 1) {
							for (let i = 1; i < group.length; i++) {
								const issue = this.createIssue(
									group[i],
									"duplicate_exact",
									"error",
									t("management.cardQuality.descriptions.duplicateExact"),
									{
										similarCards: group.filter((_, idx) => idx !== i).map((c) => c.uuid),
										similarityScore: 1.0,
									}
								);
								issues.push(issue);
								issuesByType.duplicate_exact++;
								issuesBySeverity.error++;
							}
						}
					}
				}
			}

			// 相似内容检测（使用N-gram支持中文）
			const cardContents = cards.map((c) => ({
				card: c,
				content: this.normalizeContent(this.getCardContent(c) || ""),
				ngrams: this.extractNgrams(this.getCardContent(c) || ""),
			}));

			const totalPairs = (cardContents.length * (cardContents.length - 1)) / 2;
			let pairCount = 0;
			const BATCH_SIZE = 500;

			for (let i = 0; i < cardContents.length; i++) {
				for (let j = i + 1; j < cardContents.length; j++) {
					pairCount++;

					// 分批更新进度
					if (pairCount % BATCH_SIZE === 0) {
						onProgress?.({
							current: pairCount,
							total: totalPairs,
							phase: "analyzing",
							message: t("management.cardQuality.progress.analyzingSimilar", { current: pairCount, total: totalPairs }),
						});
						// 让出事件循环防止UI阻塞
						await new Promise((resolve) => window.setTimeout(resolve, 0));
					}

					const similarity = this.calculateSimilarity(
						cardContents[i].ngrams,
						cardContents[j].ngrams
					);

					if (similarity >= fullConfig.similarityThreshold && similarity < 1.0) {
						// 检查是否已经标记为精确重复
						const alreadyMarked = issues.some(
							(issue) =>
								issue.cardUuid === cardContents[j].card.uuid && issue.type === "duplicate_exact"
						);

						if (!alreadyMarked) {
							const issue = this.createIssue(
								cardContents[j].card,
								"duplicate_similar",
								"warning",
								t("management.cardQuality.descriptions.duplicateSimilar", { percent: (similarity * 100).toFixed(1) }),
								{
									similarCards: [cardContents[i].card.uuid],
									similarityScore: similarity,
								}
							);
							issues.push(issue);
							issuesByType.duplicate_similar++;
							issuesBySeverity.warning++;
						}
					}
				}
			}
		}

		// 完成
		const duration = Date.now() - startTime;

		onProgress?.({
			current: cards.length,
			total: cards.length,
			phase: "complete",
			message: t("management.cardQuality.progress.complete", { count: issues.length }),
		});

		const result: ScanResult = {
			scanId,
			scannedAt: new Date().toISOString(),
			totalCards: cards.length,
			issues,
			issuesByType,
			issuesBySeverity,
			duration,
			config: fullConfig,
		};

		// 更新最后扫描结果（但不自动添加到收件箱）
		this.lastScanResult = result;

		// 注意：不再自动将问题添加到收件箱
		// 用户需要通过 addIssuesToInbox 手动添加选中的问题

		logger.info(`[CardQualityInbox] 扫描完成: ${issues.length} 个问题 (耗时 ${duration}ms)`);

		return result;
	}

	/**
	 * 将选中的问题添加到收件箱
	 */
	async addIssuesToInbox(issuesToAdd: QualityIssue[]): Promise<BatchActionResult> {
		let addedCount = 0;
		let skippedCount = 0;

		for (const issue of issuesToAdd) {
			// 检查是否已存在（根据ID或卡片UUID+问题类型去重）
			const exists = this.issues.some(
				(existing) =>
					existing.id === issue.id ||
					(existing.cardUuid === issue.cardUuid &&
						existing.type === issue.type &&
						!existing.resolved)
			);

			if (!exists) {
				this.issues.push(issue);
				addedCount++;
			} else {
				skippedCount++;
			}
		}

		if (addedCount > 0) {
			await this.saveToDisk();
		}

		logger.info(`[CardQualityInbox] 添加到收件箱: ${addedCount} 个, 跳过: ${skippedCount} 个`);

		return {
			success: true,
			processedCount: addedCount,
			failedCount: skippedCount,
		};
	}

	/**
	 * 标记问题为已解决
	 */
	async resolveIssue(
		issueId: string,
		resolution: "fixed" | "ignored" | "merged" | "deleted"
	): Promise<boolean> {
		const issue = this.issues.find((i) => i.id === issueId);
		if (issue) {
			issue.resolved = true;
			issue.resolvedAt = new Date().toISOString();
			issue.resolution = resolution;
			await this.saveToDisk();
			return true;
		}
		return false;
	}

	/**
	 * 批量标记问题为已忽略
	 */
	async batchIgnore(issueIds: string[]): Promise<BatchActionResult> {
		let processedCount = 0;
		let failedCount = 0;

		for (const id of issueIds) {
			const issue = this.issues.find((i) => i.id === id);
			if (issue) {
				issue.resolved = true;
				issue.resolvedAt = new Date().toISOString();
				issue.resolution = "ignored";
				processedCount++;
			} else {
				failedCount++;
			}
		}

		// 批量操作后一次性保存
		await this.saveToDisk();

		return {
			success: failedCount === 0,
			processedCount,
			failedCount,
		};
	}

	/**
	 * 清空收件箱
	 */
	async clearInbox(): Promise<void> {
		this.issues = [];
		this.lastScanResult = undefined;
		await this.saveToDisk();
	}

	// ============ 持久化方法 ============

	/**
	 * 保存到磁盘
	 */
	private async saveToDisk(): Promise<void> {
		try {
			const data: PersistedInboxData = {
				issues: this.issues,
				lastScanResult: this.lastScanResult,
				savedAt: new Date().toISOString(),
			};

			const filePath = this.getDataFilePath();
			await DirectoryUtils.ensureDirForFile(this.plugin.app.vault.adapter, filePath);
			await this.plugin.app.vault.adapter.write(filePath, JSON.stringify(data));
			logger.debug("[CardQualityInbox] 数据已保存");
		} catch (error) {
			logger.error("[CardQualityInbox] 保存失败:", error);
		}
	}

	/**
	 * 从磁盘加载
	 */
	private async loadFromDisk(): Promise<void> {
		try {
			const filePath = this.getDataFilePath();

			if (await this.plugin.app.vault.adapter.exists(filePath)) {
				const content = await this.plugin.app.vault.adapter.read(filePath);
				const parsed: unknown = JSON.parse(content);
				if (!isPersistedInboxData(parsed)) {
					return;
				}

				this.issues = parsed.issues || [];
				this.lastScanResult = parsed.lastScanResult;

				logger.info(`[CardQualityInbox] 已加载 ${this.issues.length} 个问题`);
			}
		} catch (error) {
			logger.error("[CardQualityInbox] 加载失败:", error);
			this.issues = [];
			this.lastScanResult = undefined;
		}
	}

	/**
	 * 获取数据文件路径
	 */
	private getDataFilePath(): string {
		return getPluginPaths(this.plugin.app).state.qualityInbox;
	}

	// ============ 私有辅助方法 ============

	private createIssue(
		card: Card,
		type: QualityIssueType,
		severity: IssueSeverity,
		description: string,
		details?: QualityIssue["details"]
	): QualityIssue {
		return {
			id: generateId(),
			type,
			severity,
			cardUuid: card.uuid,
			description,
			details,
			detectedAt: new Date().toISOString(),
			resolved: false,
		};
	}

	private getCardContent(card: Card): string {
		// 从 content 获取（content-only 架构），剥离YAML frontmatter
		if (!card.content) return "";
		return extractBodyContent(card.content);
	}

	private getQuestionContent(card: Card): string {
		// 从 content 解析问题部分（---div--- 之前的内容），剥离YAML
		const content = this.getCardContent(card);
		if (!content) return "";

		const dividerMatch = content.match(/^([\s\S]*?)(?:---div---|$)/);
		if (dividerMatch?.[1]) {
			return dividerMatch[1].trim();
		}
		return content.trim();
	}

	private getAnswerContent(card: Card): string {
		// 从 content 解析答案部分（---div--- 之后的内容），剥离YAML
		const content = this.getCardContent(card);
		if (!content) return "";

		const parts = content.split(/---div---/);
		if (parts.length > 1) {
			return parts.slice(1).join("---div---").trim();
		}
		// 没有分隔符，认为没有答案
		return "";
	}

	private normalizeContent(content: string): string {
		return content
			.toLowerCase()
			.replace(/\s+/g, " ")
			.replace(/[^\w\u4e00-\u9fa5]/g, "")
			.trim();
	}

	/**
	 * 可靠哈希：使用 FNV-1a 64位模拟（两个32位组合），大幅降低碰撞率
	 */
	private reliableHash(str: string): string {
		let h1 = 0x811c9dc5;
		let h2 = 0x01000193;
		for (let i = 0; i < str.length; i++) {
			const c = str.charCodeAt(i);
			h1 = Math.imul(h1 ^ c, 0x01000193);
			h2 = Math.imul(h2 ^ c, 0x811c9dc5);
		}
		return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
	}

	/**
	 * 哈希碰撞时二次确认：按规范化内容分组
	 */
	private groupByExactContent(cards: Card[]): Card[][] {
		const groups = new Map<string, Card[]>();
		for (const card of cards) {
			const normalized = this.normalizeContent(this.getCardContent(card) || "");
			if (!groups.has(normalized)) {
				groups.set(normalized, []);
			}
			groups.get(normalized)?.push(card);
		}
		return Array.from(groups.values());
	}

	/**
	 * N-gram提取：同时支持中文和英文
	 * 中文使用2-gram字符级切分，英文使用空格分词
	 */
	private extractNgrams(content: string, n = 2): Set<string> {
		const normalized = this.normalizeContent(content);
		if (!normalized) return new Set();

		const ngrams = new Set<string>();

		// 英文停用词
		const stopWords = new Set([
			"the",
			"is",
			"a",
			"an",
			"to",
			"of",
			"in",
			"on",
			"at",
			"for",
			"and",
			"or",
		]);

		// 分离中文和英文部分
		const chineseChars = normalized.match(/[\u4e00-\u9fa5]+/g) || [];
		const englishWords = normalized.match(/[a-z0-9]+/g) || [];

		// 中文：字符级N-gram
		for (const segment of chineseChars) {
			for (let i = 0; i <= segment.length - n; i++) {
				ngrams.add(segment.substring(i, i + n));
			}
		}

		// 英文：过滤停用词后的单词作为token
		for (const word of englishWords) {
			if (word.length >= 2 && !stopWords.has(word)) {
				ngrams.add(word);
			}
		}

		return ngrams;
	}

	private calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
		if (set1.size === 0 || set2.size === 0) return 0;

		let intersectionSize = 0;
		const smaller = set1.size <= set2.size ? set1 : set2;
		const larger = set1.size <= set2.size ? set2 : set1;

		for (const item of smaller) {
			if (larger.has(item)) {
				intersectionSize++;
			}
		}

		const unionSize = set1.size + set2.size - intersectionSize;
		return unionSize > 0 ? intersectionSize / unionSize : 0; // Jaccard similarity
	}

	/**
	 * 检测格式无效
	 */
	private detectInvalidFormat(card: Card): QualityIssue | null {
		const content = card.content || "";

		// 检测YAML frontmatter格式错误
		if (content.startsWith("---")) {
			const closingIndex = content.indexOf("---", 3);
			if (closingIndex === -1) {
				return this.createIssue(
					card,
					"invalid_format",
					"error",
					t("management.cardQuality.descriptions.invalidYamlFrontmatter")
				);
			}
		}

		// 检测损坏的挖空标记
		if (card.type === CardType.Cloze || card.type === CardType.ProgressiveParent) {
			const clozePattern = /\{\{c\d+::/g;
			const openCount = (content.match(clozePattern) || []).length;
			const closeCount = (content.match(/\}\}/g) || []).length;
			if (openCount > 0 && openCount !== closeCount) {
				return this.createIssue(
					card,
					"invalid_format",
					"warning",
					t("management.cardQuality.descriptions.invalidClozeMarkers", { openCount, closeCount })
				);
			}
		}

		return null;
	}

	/**
	 * 从 we_source 链接中解析源文件路径
	 */
	private parseSourcePath(source: string): string | null {
		const epubPath = EpubLinkService.extractFilePathFromEpubLinkMarkup(source);
		if (epubPath) {
			return epubPath;
		}

		return parseObsidianLink(source) || null;
	}

	/**
	 * 检查源文件是否存在于Vault中
	 */
	private async checkSourceFileExists(sourcePath: string): Promise<boolean> {
		try {
			const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
			return file !== null;
		} catch {
			return false;
		}
	}

	/**
	 * 获取可用于显示的卡片内容（剥离YAML frontmatter）
	 */
	static getDisplayContent(card: Card, maxLen = 60): string {
		if (!card.content) return "(无内容)";
		const body = extractBodyContent(card.content);
		const cleaned = body.replace(/\n/g, " ").trim();
		return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}...` : cleaned;
	}
}

/**
 * 单例实例
 */
let serviceInstance: CardQualityInboxService | null = null;

/**
 * 获取服务单例（自动初始化）
 */
export function getCardQualityInboxService(plugin: WeavePlugin): CardQualityInboxService {
	if (!serviceInstance) {
		serviceInstance = new CardQualityInboxService(plugin);
		// 自动初始化（加载持久化数据）
		serviceInstance.initialize().catch((_err) => {
			logger.error("[CardQualityInbox] 自动初始化失败:", _err);
		});
	}
	return serviceInstance;
}

/**
 * 清理单例（插件卸载时调用）
 */
export function destroyCardQualityInboxService(): void {
	serviceInstance = null;
}
