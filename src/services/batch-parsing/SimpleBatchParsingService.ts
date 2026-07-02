import { logger } from "../../utils/logger";
/**
 * 简化批量解析服务
 * 主流程协调器：整合文件选择、牌组映射、UUID管理和卡片解析
 *
 * 职责：
 * 1. 协调各子服务的工作
 * 2. 执行批量解析主流程
 * 3. 处理解析结果
 * 4. 提供统计和报告
 *
 *  架构说明：三种解析模式
 *
 *  模式1：场景2 - 单文件单卡片模式（新）
 *    - 使用 SingleCardParser + SingleCardSyncEngine
 *    - 基于文件修改时间 (mtime) 的同步策略
 *    - UUID 存储在 frontmatter 中
 *    - 支持 front-back 分离
 *
 *  模式2：场景1 - 单文件多卡片正则模式（新）
 *    - 使用 RegexCardParser
 *    - 支持自定义正则表达式解析
 *    - 支持分隔符模式和完整模式
 *    - 支持标签判断和完全同步两种同步方式
 *
 *  模式3：兼容模式 - 旧解析器（向后兼容）
 *    - 使用 SimplifiedCardParser
 *    - 适用于未配置新模式的旧映射
 *    - 保持向后兼容性
 */

import { type App, Notice, TFile, TFolder, Vault } from "obsidian";
import {
	BatchParseConfig,
	ParsedCard,
	SimplifiedParsingSettings,
} from "../../types/newCardParsingTypes";
import type { IObsidianApp } from "../../types/plugin-interfaces";
import { logDebugWithTag } from "../../utils/logger";
import { SimplifiedCardParser } from "../../utils/simplifiedParser/SimplifiedCardParser";
import type { DeckMappingConfig } from "./DeckMappingService";
import { DeckMappingService } from "./DeckMappingService";
import { type FileSelectorConfig, SimpleFileSelectorService } from "./SimpleFileSelectorService";
import { ThreeWayMergeEngine } from "./ThreeWayMergeEngine";
import { type UUIDConfig, UUIDManager } from "./UUIDManager";
import { processUUIDsWithPosition } from "./processUUIDs-new";

import type { WeaveDataStorage } from "../../data/storage";
import type WeavePlugin from "../../main";
// 场景 2：单文件单卡片解析器
import { SingleCardParser } from "./SingleCardParser";
import { SingleCardSyncEngine } from "./SingleCardSyncEngine";

import type {
	FolderDeckMapping,
	MultiCardsConfig,
	RegexParsingConfig,
	SingleCardConfig,
} from "../../types/newCardParsingTypes";
export type { FolderDeckMapping } from "../../types/newCardParsingTypes";
// 场景 1：单文件多卡片正则解析器
import { RegexCardParser } from "./RegexCardParser";

//  清理服务（用于保护新创建的UUID）
import type { BlockLinkCleanupService } from "../cleanup/BlockLinkCleanupService";

/**
 * 批量解析配置（ 重构后）
 */
export interface SimpleBatchParsingConfig {
	//  新增：统一的文件夹牌组映射列表
	/** 文件夹与牌组的映射关系 */
	folderDeckMappings: FolderDeckMapping[];

	/** UUID配置 */
	uuid: UUIDConfig;

	/** 解析设置 */
	parsingSettings: SimplifiedParsingSettings;

	/** 批处理限制 */
	maxFilesPerBatch: number;

	/** 是否显示进度通知 */
	showProgressNotice: boolean;

	/** 是否在解析后自动保存文件 */
	autoSaveAfterParsing: boolean;

	/** 牌组名称前缀 */
	deckNamePrefix?: string;

	/** 路径分隔符（用于层级牌组） */
	hierarchySeparator: string;

	//  以下字段已废弃，保留用于向后兼容（将在未来版本移除）
	/** Compatibility note: 使用 folderDeckMappings 替代 */
	fileSelector?: FileSelectorConfig;

	/** Compatibility note: 使用 folderDeckMappings 替代 */
	deckMapping?: DeckMappingConfig;
}

/**
 * 解析进度信息
 */
export interface ParseProgress {
	totalFiles: number;
	processedFiles: number;
	currentFile: string;
	successCount: number;
	errorCount: number;
	percentage: number;
}

/**
 * 批量解析结果（支持三方合并）
 */
export interface BatchParseResult {
	success: boolean;
	totalCards: number;
	successfulCards: number;
	failedCards: Array<{ file: string; card: unknown; error: string }>; // 修改为数组类型以匹配实际使用
	newDecks: string[];
	duplicateUUIDs: string[];

	// 解析的卡片（用于上层保存）
	parsedCards?: ParsedCard[];

	// 三方合并统计
	newCards?: number; // 新创建的卡片数
	updatedCards?: number; // 更新的卡片数
	skippedCards?: number; // 跳过的卡片数（内容未变）
	conflictCards?: number; // 冲突的卡片数

	// 冲突详情
	conflicts?: Array<{
		file: string;
		cardIndex: number;
		uuid: string;
		conflict: unknown; // ConflictInfo from ThreeWayMergeEngine
	}>;

	errors: Array<{
		file: string;
		message: string;
		error?: unknown;
	}>;
	stats: {
		filesProcessed: number;
		filesWithCards: number;
		filesSkipped: number;
		processingTime: number;
	};
}

//  已删除：ICardSaver接口（保存功能已统一由插件的addCardsToDB处理）

/**
 * 简化批量解析服务（重构后）
 * 职责：只负责解析文件并返回 ParsedCard[]，不再负责保存
 */
export class SimpleBatchParsingService {
	private config: SimpleBatchParsingConfig;
	private fileSelector: SimpleFileSelectorService;
	private deckMapping: DeckMappingService;
	private uuidManager: UUIDManager;
	private parser: SimplifiedCardParser;
	private mergeEngine?: ThreeWayMergeEngine;
	private isRunning = false;
	private abortController?: AbortController;
	private app: IObsidianApp;

	// 场景 2：单文件单卡片解析器
	private singleCardParser?: SingleCardParser;
	private singleCardSyncEngine?: SingleCardSyncEngine;

	// 场景 1：单文件多卡片正则解析器
	private regexCardParser?: RegexCardParser;

	//  清理服务：用于保护新创建的UUID
	private cleanupService?: BlockLinkCleanupService;

	private normalizeTag(tag: string): string {
		return tag.startsWith("#") ? tag.substring(1).trim().toLowerCase() : tag.trim().toLowerCase();
	}

	private hasAnyTagMatch(cardTags: string[], candidateTags: string[]): boolean {
		if (!cardTags?.length || !candidateTags?.length) {
			return false;
		}

		const normalizedCardTags = new Set(
			cardTags
				.filter((tag): tag is string => typeof tag === "string")
				.map((tag) => this.normalizeTag(tag))
				.filter(Boolean)
		);

		return candidateTags.some((tag) => normalizedCardTags.has(this.normalizeTag(tag)));
	}

	constructor(
		config: SimpleBatchParsingConfig,
		fileSelector: SimpleFileSelectorService,
		deckMapping: DeckMappingService,
		uuidManager: UUIDManager,
		parser: SimplifiedCardParser,
		app: IObsidianApp,
		dataStorage?: WeaveDataStorage, // 添加 dataStorage 参数（用于 ThreeWayMergeEngine 和 SingleCardSyncEngine）
		cleanupService?: BlockLinkCleanupService, //  添加清理服务参数
		plugin?: WeavePlugin // 添加 plugin 参数（用于 ThreeWayMergeEngine 访问 directFileReader）
	) {
		this.config = config;
		this.fileSelector = fileSelector;
		this.deckMapping = deckMapping;
		this.uuidManager = uuidManager;
		this.parser = parser;
		this.app = app;
		this.cleanupService = cleanupService; //  保存清理服务引用

		// 初始化三方合并引擎（如果有 dataStorage）
		if (dataStorage) {
			this.mergeEngine = new ThreeWayMergeEngine(dataStorage, plugin); //  传递plugin参数

			// 初始化单文件单卡片解析器和同步引擎
			this.singleCardParser = new SingleCardParser(app as App);
			this.singleCardSyncEngine = new SingleCardSyncEngine(dataStorage, plugin); //  传递plugin参数

			// 初始化单文件多卡片正则解析器
			this.regexCardParser = new RegexCardParser(app as App, plugin); //  传递plugin参数

			logDebugWithTag("SimpleBatchParsingService", "✅ 单文件单卡片解析器和正则解析器已初始化");
		} else {
			logger.error(
				"❌ [SimpleBatchParsingService] dataStorage未提供，单文件单卡片模式和三方合并功能将不可用！"
			);
			logger.warn("[SimpleBatchParsingService] 所有文件将回退到兼容模式（旧解析器）");
		}
	}

	/**
	 *  预检查：在解析前验证配置和映射
	 * 核心功能：
	 * 1. 验证映射配置是否存在
	 * 2. 验证映射路径是否有效
	 * 3. 检查文件映射覆盖率
	 * 4. 提供清晰的错误和警告信息
	 */
	async preflightCheck(): Promise<{
		valid: boolean;
		errors: string[];
		warnings: string[];
	}> {
		const errors: string[] = [];
		const warnings: string[] = [];

		logDebugWithTag("SimpleBatchParsingService", "开始预检查...");

		// 检查1：是否配置了映射
		if (!this.config.folderDeckMappings || this.config.folderDeckMappings.length === 0) {
			errors.push("❌ 未配置任何文件夹/文件到牌组的映射关系");
			errors.push("💡 请在插件设置 → 分隔符配置 → 文件夹牌组映射 中添加映射");
			return { valid: false, errors, warnings };
		}

		// 检查2：是否有启用的映射
		const enabledMappings = this.config.folderDeckMappings.filter((m) => m.enabled);
		if (enabledMappings.length === 0) {
			errors.push("❌ 所有映射都已禁用");
			errors.push("💡 请至少启用一个映射关系");
			return { valid: false, errors, warnings };
		}

		logDebugWithTag("SimpleBatchParsingService", `找到 ${enabledMappings.length} 个启用的映射`);

		// 检查3：验证映射路径是否存在
		for (const mapping of enabledMappings) {
			const path = mapping.path || mapping.folderPath || "";
			const type = mapping.type || "folder";

			if (!path) {
				errors.push(`❌ 映射 "${mapping.targetDeckName}" 的路径为空`);
				continue;
			}

			const abstractFile = this.app.vault.getAbstractFileByPath(path);
			if (!abstractFile) {
				errors.push(`❌ 路径不存在: ${path} (映射到: ${mapping.targetDeckName})`);
				continue;
			}

			logDebugWithTag(
				"SimpleBatchParsingService",
				`映射路径有效: ${path} (${type}) → ${mapping.targetDeckName}`
			);
		}

		// 如果路径验证失败，立即返回
		if (errors.length > 0) {
			return { valid: false, errors, warnings };
		}

		// 检查4：扫描文件并检查映射覆盖率
		try {
			const files = await this.scanMappedFolders();
			if (files.length === 0) {
				warnings.push("⚠️ 未找到任何 Markdown 文件，请检查映射路径是否正确");
			} else {
				logDebugWithTag("SimpleBatchParsingService", `找到 ${files.length} 个文件`);

				// 检查5：统计未映射的文件（仅当有文件时）
				const unmappedFiles = await this.findUnmappedFiles(files);
				if (unmappedFiles.length > 0) {
					warnings.push(`⚠️ 发现 ${unmappedFiles.length} 个文件未配置映射，这些文件将被跳过：`);
					unmappedFiles.slice(0, 5).forEach((f) => warnings.push(`  - ${f.path}`));
					if (unmappedFiles.length > 5) {
						warnings.push(`  ... 还有 ${unmappedFiles.length - 5} 个文件`);
					}
				}
			}
		} catch (error) {
			warnings.push(`⚠️ 扫描文件时出错: ${error instanceof Error ? error.message : "未知错误"}`);
		}

		const result = {
			valid: errors.length === 0,
			errors,
			warnings,
		};

		logDebugWithTag("SimpleBatchParsingService", "预检查完成", {
			valid: result.valid,
			errorCount: errors.length,
			warningCount: warnings.length,
		});

		return result;
	}

	/**
	 *  查找未映射的文件
	 */
	private async findUnmappedFiles(files: TFile[]): Promise<TFile[]> {
		const unmapped: TFile[] = [];

		for (const file of files) {
			const mapping = this.findMatchingMapping(file.path);
			if (!mapping) {
				unmapped.push(file);
			}
		}

		return unmapped;
	}

	/**
	 *  验证映射配置的完整性
	 */
	private validateMappingConfiguration(): boolean {
		return (
			this.config.folderDeckMappings &&
			this.config.folderDeckMappings.length > 0 &&
			this.config.folderDeckMappings.some((m) => m.enabled)
		);
	}

	/**
	 * 执行批量解析
	 *  重构后：只负责解析，返回 ParsedCard[]，保存由上层处理
	 */
	async executeBatchParsing(onProgress?: (progress: ParseProgress) => void): Promise<{
		parsedCards: ParsedCard[];
		result: BatchParseResult;
	}> {
		if (this.isRunning) {
			throw new Error("批量解析正在运行中");
		}

		this.isRunning = true;
		this.abortController = new AbortController();

		const startTime = Date.now();
		const parsedCards: ParsedCard[] = []; //  收集所有解析的卡片
		const result: BatchParseResult = {
			success: false,
			totalCards: 0,
			successfulCards: 0,
			failedCards: [],
			newDecks: [],
			duplicateUUIDs: [],
			// 三方合并统计
			newCards: 0,
			updatedCards: 0,
			skippedCards: 0,
			conflictCards: 0,
			conflicts: [],
			errors: [],
			stats: {
				filesProcessed: 0,
				filesWithCards: 0,
				filesSkipped: 0,
				processingTime: 0,
			},
		};

		try {
			//  步骤0：预检查（在解析前验证配置）
			logDebugWithTag("SimpleBatchParsingService", "执行预检查...");
			const precheck = await this.preflightCheck();

			// 显示警告
			if (precheck.warnings.length > 0) {
				logger.warn("[SimpleBatchParsingService] 预检查警告:");
				precheck.warnings.forEach((w) => logger.warn(w));
			}

			// 如果有错误，停止执行
			if (!precheck.valid) {
				logger.error("[SimpleBatchParsingService] 预检查失败:");
				precheck.errors.forEach((e) => logger.error(e));

				// 显示错误通知
				const errorMessage = [
					"❌ 批量解析预检查失败",
					"",
					...precheck.errors,
					"",
					...(precheck.warnings.length > 0 ? ["警告:", ...precheck.warnings] : []),
				].join("\n");

				new Notice(errorMessage, 10000);

				// 返回失败结果
				result.success = false;
				result.errors = precheck.errors.map((_e) => ({
					file: "system",
					message: _e,
				}));
				this.isRunning = false;
				this.abortController = undefined;

				return {
					parsedCards: [],
					result,
				};
			}

			logDebugWithTag("SimpleBatchParsingService", "预检查通过，开始解析");

			// 如果有警告，显示提示
			if (precheck.warnings.length > 0) {
				const warningMessage = ["预检查警告:", ...precheck.warnings.slice(0, 3)].join("\n");
				new Notice(warningMessage, 5000);
			}

			// 1. 获取符合条件的文件列表
			const files = await this.scanMappedFolders();

			if (files.length === 0) {
				new Notice("没有找到符合条件的文件，请检查文件夹映射配置");
				result.success = true;
				return {
					parsedCards: [],
					result,
				};
			}

			// 限制批处理文件数
			const filesToProcess = files.slice(0, this.config.maxFilesPerBatch);

			if (files.length > this.config.maxFilesPerBatch) {
				new Notice(`文件数量超过限制，将只处理前 ${this.config.maxFilesPerBatch} 个文件`, 5000);
			}

			if (this.config.showProgressNotice) {
				new Notice(`开始批量解析：${filesToProcess.length} 个文件`);
			}

			// 2. 处理每个文件
			for (let i = 0; i < filesToProcess.length; i++) {
				if (this.abortController.signal.aborted) {
					new Notice("批量解析已取消");
					break;
				}

				const file = filesToProcess[i];

				// 更新进度
				const progress: ParseProgress = {
					totalFiles: filesToProcess.length,
					processedFiles: i,
					currentFile: file.name,
					successCount: result.successfulCards,
					errorCount: result.failedCards.length,
					percentage: Math.round((i / filesToProcess.length) * 100),
				};

				if (onProgress) {
					onProgress(progress);
				}

				// 处理单个文件
				try {
					const fileResult = await this.processFile(file);

					//  收集解析的卡片
					if (fileResult.parsedCards.length > 0) {
						parsedCards.push(...fileResult.parsedCards);
					}

					result.totalCards += fileResult.totalCards;
					result.successfulCards += fileResult.successfulCards;
					result.failedCards.push(...fileResult.failedCards);
					result.newDecks.push(...fileResult.newDecks);
					result.duplicateUUIDs.push(...fileResult.duplicateUUIDs);

					// 累加三方合并统计
					result.newCards! += fileResult.newCards || 0;
					result.updatedCards! += fileResult.updatedCards || 0;
					result.skippedCards! += fileResult.skippedCards || 0;
					result.conflictCards! += fileResult.conflictCards || 0;

					if (fileResult.conflicts && fileResult.conflicts.length > 0) {
						result.conflicts?.push(...fileResult.conflicts);
					}

					result.stats.filesProcessed++;
					if (fileResult.totalCards > 0) {
						result.stats.filesWithCards++;
					}
				} catch (error) {
					result.errors.push({
						file: file.path,
						message: error instanceof Error ? error.message : "未知错误",
						error,
					});
					logger.error(`[SimpleBatchParsingService] 处理文件失败: ${file.path}`, error);
				}
			}

			// 3. 完成处理
			result.stats.processingTime = Date.now() - startTime;
			result.success = result.errors.length === 0;

			// 显示完成通知
			if (this.config.showProgressNotice) {
				this.showCompletionNotice(result);
			}
		} catch (error) {
			logger.error("[SimpleBatchParsingService] 批量解析失败:", error);
			result.errors.push({
				file: "system",
				message: error instanceof Error ? error.message : "系统错误",
				error,
			});
		} finally {
			this.isRunning = false;
			this.abortController = undefined;
		}

		//  返回解析的卡片和统计结果
		return {
			parsedCards,
			result,
		};
	}

	/**
	 * 解析单个文件（带映射验证）
	 * 用于"批量解析当前文件"命令
	 */
	async parseSingleFileWithMapping(file: TFile): Promise<{
		parsedCards: ParsedCard[];
		success: boolean;
		message?: string;
	}> {
		const mapping = this.findMatchingMapping(file.path);

		if (!mapping) {
			return {
				parsedCards: [],
				success: false,
				message: `文件未配置牌组映射: ${file.name}\n\n请在插件设置中为该文件或其文件夹配置映射关系`,
			};
		}

		try {
			const fileResult = await this.processFile(file);

			if (fileResult.parsedCards.length > 0) {
				return {
					parsedCards: fileResult.parsedCards,
					success: true,
					message: `成功解析 ${fileResult.parsedCards.length} 张卡片`,
				};
			} else {
				return {
					parsedCards: [],
					success: false,
					message: "未找到可解析的卡片",
				};
			}
		} catch (error) {
			return {
				parsedCards: [],
				success: false,
				message: `解析失败: ${error instanceof Error ? error.message : "未知错误"}`,
			};
		}
	}

	/**
	 * 处理单个文件
	 * 重构后：返回解析的卡片，不再保存
	 */
	private async processFile(file: TFile): Promise<{
		parsedCards: ParsedCard[]; //  新增：返回解析的卡片
		totalCards: number;
		successfulCards: number;
		failedCards: Array<{ file: string; card: unknown; error: string }>; // 修改为数组类型
		newDecks: string[];
		duplicateUUIDs: string[];
		// 三方合并统计
		newCards?: number;
		updatedCards?: number;
		skippedCards?: number;
		conflictCards?: number;
		conflicts?: Array<{
			file: string;
			cardIndex: number;
			uuid: string;
			conflict: unknown;
		}>;
	}> {
		const result = {
			parsedCards: [] as ParsedCard[],
			totalCards: 0,
			successfulCards: 0,
			failedCards: [] as Array<{ file: string; card: unknown; error: string }>,
			newDecks: [] as string[],
			duplicateUUIDs: [] as string[],
			// 三方合并统计
			newCards: 0,
			updatedCards: 0,
			skippedCards: 0,
			conflictCards: 0,
			conflicts: [] as Array<{
				file: string;
				cardIndex: number;
				uuid: string;
				conflict: unknown;
			}>,
		};

		// 提前检查映射和文件模式
		const mapping = this.findMatchingMapping(file.path);

		if (!mapping) {
			return result;
		}

		// 场景路由：根据 fileMode 选择不同的解析器
		// 默认值为 'single-card'，与类型定义一致
		const fileMode = mapping.fileMode || "single-card"; // 默认单卡片模式

		//  调试日志：追踪路由决策
		logDebugWithTag(
			"SimpleBatchParsingService",
			`🔍 路由决策 - fileMode: ${fileMode}, singleCardParser: ${!!this
				.singleCardParser}, singleCardSyncEngine: ${!!this.singleCardSyncEngine}`
		);

		// 检查单卡片模式的解析器是否可用
		if (fileMode === "single-card") {
			if (!this.singleCardParser || !this.singleCardSyncEngine) {
				//  严重错误：用户选择了单卡片模式，但解析器未初始化
				const errorMsg = "❌ 单文件单卡片模式不可用：解析器未初始化。请检查插件是否正确加载。";
				logger.error(`[SimpleBatchParsingService] ${errorMsg}`);
				result.failedCards.push({
					file: file.path,
					card: null,
					error: errorMsg,
				});
				return result;
			}

			//  解析器可用，执行单卡片解析
			logDebugWithTag("SimpleBatchParsingService", `✅ 场景2（单卡片模式）：${file.path}`);
			return await this.parseSingleFileAsSingleCard(file, mapping, result);
		}

		// 场景 1：单文件多卡片模式
		if (fileMode === "multi-cards") {
			const multiCardsConfig = mapping.multiCardsConfig;

			// 如果配置了正则解析，使用新的 RegexCardParser
			if (multiCardsConfig?.parsingConfig && this.regexCardParser) {
				logDebugWithTag(
					"SimpleBatchParsingService",
					`✅ 场景1（正则模式）：多卡片解析 ${file.path}`
				);
				return await this.parseSingleFileAsMultiCards(file, mapping, result);
			}
		}

		//  旧方案（向后兼容）：使用 SimplifiedCardParser
		//  警告：如果执行到这里，说明路由决策失败
		logDebugWithTag(
			"SimpleBatchParsingService",
			`⚠️ 兼容模式（旧解析器）：${file.path} - fileMode=${fileMode}, singleCardParser=${!!this
				.singleCardParser}, singleCardSyncEngine=${!!this.singleCardSyncEngine}`
		);

		// 1. 读取文件内容
		const content = await file.vault.read(file);

		const deckId = mapping.targetDeckId;
		const deckName = mapping.targetDeckName;

		// 执行卡片解析
		let currentContent = content;

		const parseConfig: BatchParseConfig = {
			settings: this.config.parsingSettings,
			scenario: "batch",
			sourceFile: file.path,
			sourceFileName: file.name,
			sourceContent: content,
			onContentUpdated: async (updatedContent) => {
				currentContent = updatedContent;
				if (this.config.autoSaveAfterParsing) {
					await file.vault.modify(file, updatedContent);
				}
			},
		};

		const { cards: parseResult, positions: cardsPosition } = await this.parser.parseBatchCards(
			content,
			parseConfig
		);

		if (parseResult.length === 0) {
			return result;
		}

		result.totalCards = parseResult.length;

		// 防重复检测
		if (this.config.uuid.enabled && this.config.uuid.duplicateStrategy === "skip") {
			const { EnhancedDelimiterDetector } = await import(
				"../../utils/simplifiedParser/EnhancedDelimiterDetector"
			);
			const delimiter = this.config.parsingSettings.symbols.cardDelimiter;
			const detector = new EnhancedDelimiterDetector(delimiter);
			const allBlocks = detector.splitCardsRaw(currentContent);

			let skippedCount = 0;
			for (let i = parseResult.length - 1; i >= 0; i--) {
				const blockIndex = i + 1;

				if (blockIndex < allBlocks.length - 1) {
					const block = allBlocks[blockIndex];
					const existingUUID = this.detectUUIDInBlock(block);

					if (existingUUID) {
						const exists = await this.checkCardExists(existingUUID);
						if (exists) {
							parseResult.splice(i, 1);
							skippedCount++;
						}
					}
				}
			}

			if (skippedCount > 0) {
				result.totalCards = parseResult.length;
			}
		}

		// 处理UUID
		if (this.config.uuid.enabled) {
			if (cardsPosition && cardsPosition.length === parseResult.length) {
				const uuidResult = await processUUIDsWithPosition(
					parseResult,
					cardsPosition,
					currentContent,
					this.uuidManager,
					(content) => this.detectUUIDInBlock(content)
				);

				result.duplicateUUIDs.push(...uuidResult.duplicates);

				if (uuidResult.contentUpdated && this.config.autoSaveAfterParsing) {
					await file.vault.modify(file, uuidResult.updatedContent);
				}

				//  保护新创建的UUID，防止立即被清理机制误删
				if (this.cleanupService && uuidResult.contentUpdated) {
					for (const card of parseResult) {
						if (card.metadata?.uuid) {
							this.cleanupService.markUUIDRecentlyCreated(card.metadata.uuid);
						}
						if (card.metadata?.blockId) {
							this.cleanupService.markRecentlyCreated(card.metadata.blockId);
						}
					}
					logDebugWithTag(
						"SimpleBatchParsingService",
						`已保护 ${parseResult.length} 个UUID/块链接（60秒）`
					);
				}

				// 将 metadata.blockId 转换为 sourceBlock 和 sourceFile
				for (const card of parseResult) {
					if (card.metadata) {
						// 转换blockId到sourceBlock
						if (card.metadata.blockId) {
							card.metadata.sourceBlock = card.metadata.blockId;
						}
						// 确保sourceFile存在
						if (!card.metadata.sourceFile) {
							card.metadata.sourceFile = file.path;
						}
					}
				}
				logDebugWithTag(
					"SimpleBatchParsingService",
					`✅ 已设置 ${parseResult.length} 张卡片的溯源信息（sourceFile + sourceBlock）`
				);
			}
		}

		// 添加卡片元数据
		for (let i = 0; i < parseResult.length; i++) {
			const card = parseResult[i];

			if (!card.metadata) {
				card.metadata = {};
			}
			card.metadata.targetDeckId = deckId;
			card.metadata.targetDeckName = deckName;
			card.metadata.isBatchScanned = true;
			card.metadata.lastScannedAt = new Date().toISOString();

			const cardContent = card.content || "";
			card.metadata.lastScannedContent = cardContent;
		}

		//  使用三方合并引擎进行智能同步决策
		result.totalCards = parseResult.length;
		result.successfulCards = 0;
		result.parsedCards = parseResult;
		result.newCards = 0;
		result.updatedCards = 0;
		result.skippedCards = 0;
		result.conflictCards = 0;

		// 获取配置的标签
		const excludeTags = [
			"we_已删除",
			"we_deleted",
			...(this.config.parsingSettings.batchParsing?.excludeTags || []),
		];
		const forceSyncTags = this.config.parsingSettings.batchParsing?.forceSyncTags || [];

		logDebugWithTag("BatchParsing", `开始同步决策: 总计${parseResult.length}张卡片`);

		for (const card of parseResult) {
			try {
				const uuid = card.metadata?.uuid || "";
				const tags = card.tags || [];

				// 优先级1: 检查排除标签
				const hasExcludeTag = this.hasAnyTagMatch(tags, excludeTags);
				if (hasExcludeTag) {
					result.skippedCards++;
					logDebugWithTag("BatchParsing", `跳过（包含排除标签）: ${uuid.substring(0, 8)}...`);
					continue;
				}

				// 优先级2: 检查强制同步标签
				const hasForceSyncTag = this.hasAnyTagMatch(tags, forceSyncTags);
				if (hasForceSyncTag) {
					// 强制同步：无论如何都标记为更新
					if (uuid) {
						result.updatedCards++;
						logDebugWithTag(
							"BatchParsing",
							`强制同步（包含#自动同步标签）: ${uuid.substring(0, 8)}...`
						);
					} else {
						result.newCards++;
						logDebugWithTag("BatchParsing", "新卡片（包含#自动同步标签）");
					}
					result.successfulCards++;
					continue;
				}

				// 优先级3: 使用三方合并引擎智能判断
				if (!this.mergeEngine) {
					result.skippedCards++;
					continue;
				}
				const cardContent = card.metadata?.lastScannedContent || card.content || "";
				const syncResult = await this.mergeEngine.smartSync(cardContent, uuid, deckId);

				switch (syncResult.action) {
					case "created":
						result.newCards++;
						result.successfulCards++;
						logDebugWithTag("BatchParsing", `新增卡片: ${uuid.substring(0, 8)}...`);
						break;

					case "updated":
						result.updatedCards++;
						result.successfulCards++;
						logDebugWithTag(
							"BatchParsing",
							`更新卡片: ${uuid.substring(0, 8)}... (${syncResult.reason})`
						);
						break;

					case "skipped":
					case "kept":
						result.skippedCards++;
						result.successfulCards++;
						logDebugWithTag(
							"BatchParsing",
							`跳过卡片: ${uuid.substring(0, 8)}... (${syncResult.reason})`
						);
						break;

					case "conflict":
						result.conflictCards++;
						if (syncResult.conflict) {
							result.conflicts?.push({
								file: file.path,
								cardIndex: parseResult.indexOf(card),
								uuid: uuid,
								conflict: syncResult.conflict,
							});
						}
						logDebugWithTag("BatchParsing", `检测到冲突: ${uuid.substring(0, 8)}...`);
						break;
				}
			} catch (error) {
				logger.error("[BatchParsing] 同步决策失败:", error);
				result.failedCards.push({
					file: file.path,
					card: card,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		logDebugWithTag(
			"BatchParsing",
			`同步决策完成: 新增${result.newCards}, 更新${result.updatedCards}, 跳过${result.skippedCards}, 冲突${result.conflictCards}`
		);

		return result;
	}

	/**
	 * 检测卡片块中是否已有 UUID
	 * @returns UUID字符串，如果没有则返回null
	 */
	private detectUUIDInBlock(block: string): string | null {
		// 匹配新格式: <!-- tk-{12位} -->
		const newUuidPattern = /<!--\s*(tk-[23456789abcdefghjkmnpqrstuvwxyz]{12})\s*-->/i;
		const newMatch = block.match(newUuidPattern);

		if (newMatch) {
			return newMatch[1];
		}

		// 兼容旧格式: <!-- {uuid-v4} -->
		const oldUuidPattern =
			/<!--\s*([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*-->/i;
		const oldMatch = block.match(oldUuidPattern);

		if (oldMatch) {
			return oldMatch[1];
		}

		return null;
	}

	/**
	 * 显示完成通知
	 */
	private showCompletionNotice(result: BatchParseResult): void {
		const duration = (result.stats.processingTime / 1000).toFixed(1);

		if (result.success) {
			new Notice(
				`✅ 批量解析完成：${result.successfulCards}/${result.totalCards} 张卡片 (${duration}s)`,
				5000
			);
		} else {
			new Notice(
				`⚠️ 批量解析完成（有错误）：${result.successfulCards}/${result.totalCards} 张卡片，${result.errors.length} 个文件失败`,
				7000
			);
		}
	}

	/**
	 * 取消批量解析
	 */
	abort(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
	}

	/**
	 * 检查是否正在运行
	 */
	isProcessing(): boolean {
		return this.isRunning;
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<SimpleBatchParsingConfig>): void {
		this.config = { ...this.config, ...config };
	}

	// ===== 使用 folderDeckMappings 的方法 =====

	/**
	 * 扫描映射的文件夹或文件
	 */
	private async scanMappedFolders(): Promise<TFile[]> {
		const enabledMappings = (this.config.folderDeckMappings || []).filter((m) => m.enabled);

		if (enabledMappings.length === 0) {
			return [];
		}

		const allFiles: TFile[] = [];

		for (const mapping of enabledMappings) {
			const files = await this.scanMapping(mapping); // 使用统一的扫描方法
			allFiles.push(...files);
		}

		// 去重
		return this.deduplicateFiles(allFiles);
	}

	/**
	 * 扫描映射（支持文件夹和文件级别）
	 */
	private async scanMapping(mapping: FolderDeckMapping): Promise<TFile[]> {
		//  向后兼容：如果没有 type 字段，根据 path 或 folderPath 判断
		const mappingType = mapping.type || "folder";
		const targetPath = mapping.path || mapping.folderPath || "";

		if (!targetPath) {
			logger.warn("[SimpleBatchParsingService] 映射路径为空");
			return [];
		}

		if (mappingType === "file") {
			// 文件级别映射
			return this.scanSingleFile(targetPath);
		} else {
			// 文件夹级别映射
			return this.scanFolder(targetPath, mapping.includeSubfolders);
		}
	}

	/**
	 * 扫描单个文件
	 */
	private async scanSingleFile(filePath: string): Promise<TFile[]> {
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!file || !(file instanceof TFile)) {
			logger.warn(`[SimpleBatchParsingService] 文件不存在: ${filePath}`);
			return [];
		}

		if (file.extension !== "md") {
			logger.warn(`[SimpleBatchParsingService] 非 Markdown 文件: ${filePath}`);
			return [];
		}

		return [file];
	}

	/**
	 * 扫描文件夹（新方法）
	 */
	private async scanFolder(folderPath: string, includeSubfolders: boolean): Promise<TFile[]> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);

		if (!folder || !(folder instanceof TFolder)) {
			logger.warn(`[SimpleBatchParsingService] 文件夹不存在: ${folderPath}`);
			return [];
		}

		const files: TFile[] = [];

		if (includeSubfolders) {
			// 递归获取所有文件
			Vault.recurseChildren(folder, (file) => {
				if (file instanceof TFile && file.extension === "md") {
					files.push(file);
				}
			});
		} else {
			// 仅当前文件夹
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === "md") {
					files.push(child);
				}
			}
		}

		return files;
	}

	/**
	 * 去重文件列表
	 */
	private deduplicateFiles(files: TFile[]): TFile[] {
		const seen = new Set<string>();
		const unique: TFile[] = [];

		for (const file of files) {
			if (!seen.has(file.path)) {
				seen.add(file.path);
				unique.push(file);
			}
		}

		return unique;
	}

	/**
	 * 扫描单个映射的文件夹或文件并解析卡片
	 * 返回解析的卡片，由上层负责保存
	 * 支持文件级别映射
	 * @param mapping 要扫描的映射配置
	 * @param onProgress 进度回调
	 * @returns 扫描结果（包含解析的卡片）
	 */
	async scanSingleMapping(
		mapping: FolderDeckMapping,
		onProgress?: (current: number, total: number, file: string) => void
	): Promise<BatchParseResult> {
		const startTime = Date.now();

		const mappingType = mapping.type || "folder";
		const targetPath = mapping.path || mapping.folderPath || "";

		// 确保 fileMode 有默认值，兼容旧数据
		if (!mapping.fileMode) {
			mapping.fileMode = "single-card";
			logDebugWithTag(
				"SimpleBatchParsingService",
				"⚠️ 检测到映射缺少fileMode，自动设置为single-card"
			);
		}

		logDebugWithTag("SimpleBatchParsingService", "开始扫描单个映射", {
			type: mappingType,
			path: targetPath,
			targetDeckId: mapping.targetDeckId,
			fileMode: mapping.fileMode,
			includeSubfolders: mapping.includeSubfolders,
		});

		// 1. 扫描映射获取文件列表（支持文件夹和文件）
		const files = await this.scanMapping(mapping);

		if (files.length === 0) {
			logger.warn("[SimpleBatchParsingService] 未找到任何文件");
			return {
				success: true,
				totalCards: 0,
				successfulCards: 0,
				failedCards: [],
				newDecks: [],
				duplicateUUIDs: [],
				parsedCards: [],
				newCards: 0,
				updatedCards: 0,
				skippedCards: 0,
				conflictCards: 0,
				conflicts: [],
				errors: [],
				stats: {
					filesProcessed: 0,
					filesWithCards: 0,
					filesSkipped: 0,
					processingTime: Date.now() - startTime,
				},
			};
		}

		logDebugWithTag("SimpleBatchParsingService", `找到 ${files.length} 个文件`);

		// 2. 临时修改配置，设置当前扫描的牌组映射
		const originalConfig = { ...this.config };
		this.config.folderDeckMappings = [mapping];

		const result: BatchParseResult = {
			success: true,
			totalCards: 0,
			successfulCards: 0,
			failedCards: [],
			newDecks: [],
			duplicateUUIDs: [],
			parsedCards: [],
			newCards: 0,
			updatedCards: 0,
			skippedCards: 0,
			conflictCards: 0,
			conflicts: [],
			errors: [],
			stats: {
				filesProcessed: 0,
				filesWithCards: 0,
				filesSkipped: 0,
				processingTime: 0,
			},
		};

		// 3. 逐个处理文件
		for (let i = 0; i < files.length; i++) {
			const file = files[i];

			if (onProgress) {
				onProgress(i + 1, files.length, file.path);
			}

			try {
				const fileResult = await this.processFile(file);

				// 累加统计
				result.totalCards += fileResult.totalCards;
				result.successfulCards += fileResult.successfulCards;
				result.failedCards.push(...fileResult.failedCards);
				result.newDecks.push(...fileResult.newDecks);
				result.duplicateUUIDs.push(...fileResult.duplicateUUIDs);

				// 累加三方合并统计
				result.newCards! += fileResult.newCards || 0;
				result.updatedCards! += fileResult.updatedCards || 0;
				result.skippedCards! += fileResult.skippedCards || 0;
				result.conflictCards! += fileResult.conflictCards || 0;

				// 收集冲突详情
				if (fileResult.conflicts && fileResult.conflicts.length > 0) {
					result.conflicts?.push(...fileResult.conflicts);
				}

				//  收集解析的卡片
				if (fileResult.parsedCards && fileResult.parsedCards.length > 0) {
					result.parsedCards?.push(...fileResult.parsedCards);
					result.stats.filesWithCards++;
				}

				result.stats.filesProcessed++;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "未知错误";
				logger.error(`[SimpleBatchParsingService] 处理文件失败: ${file.path}`, error);
				result.errors.push({
					file: file.path,
					message: errorMessage,
					error,
				});
				result.stats.filesSkipped++;
			}
		}

		// 4. 恢复原配置
		this.config = originalConfig;

		// 5. 计算处理时间
		result.stats.processingTime = Date.now() - startTime;
		result.stats.filesSkipped = files.length - result.stats.filesProcessed;

		logDebugWithTag("SimpleBatchParsingService", "扫描完成", {
			totalCards: result.totalCards,
			parsedCardsCount: result.parsedCards?.length,
			successfulCards: result.successfulCards,
			failedCards: result.failedCards,
			filesProcessed: result.stats.filesProcessed,
		});

		return result;
	}

	/**
	 * 统计单个映射中的卡片数量
	 * 支持文件级别映射
	 * @param mapping 映射配置
	 * @returns 卡片数量
	 */
	async countCardsInMapping(mapping: FolderDeckMapping): Promise<number> {
		const targetPath = mapping.path || mapping.folderPath || "";
		logDebugWithTag("SimpleBatchParsingService", `统计映射卡片数: ${targetPath}`);

		// 扫描映射获取文件列表（支持文件夹和文件）
		const files = await this.scanMapping(mapping);

		if (files.length === 0) {
			return 0;
		}

		let totalCards = 0;

		// 遍历文件统计卡片数
		for (const file of files) {
			try {
				const content = await file.vault.read(file);

				//  新设计：直接扫描整个文件，不再检查范围标记

				// 解析文件获取卡片数
				const parseConfig: BatchParseConfig = {
					settings: this.config.parsingSettings,
					scenario: "batch",
					sourceFile: file.path,
					sourceFileName: file.name,
					sourceContent: content,
				};
				const { cards } = await this.parser.parseBatchCards(content, parseConfig);
				totalCards += cards.length;
			} catch (error) {
				logger.error(`[SimpleBatchParsingService] 统计文件卡片失败: ${file.path}`, error);
			}
		}

		logDebugWithTag("SimpleBatchParsingService", `统计完成: ${totalCards} 张卡片`);
		return totalCards;
	}

	/**
	 * 检查UUID对应的卡片是否已存在于数据库
	 */
	private async checkCardExists(uuid: string): Promise<boolean> {
		try {
			return await this.uuidManager.hasUUID(uuid);
		} catch (error) {
			logger.error("检查UUID存在性失败:", error);
			return false;
		}
	}

	/**
	 * 查找匹配的映射规则
	 */
	private findMatchingMapping(filePath: string): FolderDeckMapping | null {
		const mappings = this.config.folderDeckMappings || [];
		const enabledMappings = mappings.filter((m) => m.enabled);

		if (enabledMappings.length === 0) {
			return null;
		}

		// 按映射路径长度降序排序（最具体的匹配优先）
		const sorted = [...enabledMappings].sort((a, b) => {
			const pathA = a.path || a.folderPath || "";
			const pathB = b.path || b.folderPath || "";
			return pathB.length - pathA.length;
		});

		for (const mapping of sorted) {
			const mappingType = mapping.type || "folder";
			const mappingPath = mapping.path || mapping.folderPath || "";

			if (mappingType === "file") {
				if (filePath === mappingPath) {
					return mapping;
				}
			} else {
				if (mapping.includeSubfolders) {
					if (filePath.startsWith(`${mappingPath}/`) || filePath.startsWith(mappingPath)) {
						return mapping;
					}
				} else {
					const fileFolder = filePath.substring(0, filePath.lastIndexOf("/"));
					if (fileFolder === mappingPath) {
						return mapping;
					}
				}
			}
		}

		return null;
	}

	/**
	 * 场景 2：解析单文件为单张卡片
	 * @param file Obsidian 文件对象
	 * @param mapping 文件夹牌组映射
	 * @param result 解析结果对象（累积）
	 * @returns 解析结果
	 */
	private async parseSingleFileAsSingleCard(
		file: TFile,
		mapping: FolderDeckMapping,
		result: {
			parsedCards: ParsedCard[];
			totalCards: number;
			successfulCards: number;
			failedCards: Array<{ file: string; card: unknown; error: string }>;
			newDecks: string[];
			duplicateUUIDs: string[];
			newCards?: number;
			updatedCards?: number;
			skippedCards?: number;
			conflictCards?: number;
			conflicts?: Array<{
				file: string;
				cardIndex: number;
				uuid: string;
				conflict: unknown;
			}>;
		}
	): Promise<{
		parsedCards: ParsedCard[];
		totalCards: number;
		successfulCards: number;
		failedCards: Array<{ file: string; card: unknown; error: string }>;
		newDecks: string[];
		duplicateUUIDs: string[];
		newCards?: number;
		updatedCards?: number;
		skippedCards?: number;
		conflictCards?: number;
		conflicts?: Array<{
			file: string;
			cardIndex: number;
			uuid: string;
			conflict: unknown;
		}>;
	}> {
		try {
			logDebugWithTag("SimpleBatchParsingService", `场景2：单文件单卡片模式解析 ${file.path}`);

			// 1. 获取单文件单卡片配置
			const singleCardConfig = mapping.singleCardConfig;
			if (!singleCardConfig) {
				logger.warn("[SimpleBatchParsingService] 映射缺少 singleCardConfig，跳过");
				return result;
			}

			// 2. 解析文件
			const parseResult = await this.singleCardParser?.parseFile(
				file,
				singleCardConfig,
				mapping.targetDeckId
			);

			if (!parseResult) {
				result.failedCards.push({ file: file.path, card: null, error: "解析器未初始化" });
				return result;
			}

			if (!parseResult.success || parseResult.shouldSkip) {
				if (parseResult.shouldSkip) {
					logDebugWithTag("SimpleBatchParsingService", `跳过文件: ${parseResult.skipReason}`);
					result.skippedCards = (result.skippedCards || 0) + 1;
				} else {
					logger.error(`[SimpleBatchParsingService] 解析失败: ${parseResult.error}`);
					result.failedCards.push({
						file: file.path,
						card: null,
						error: parseResult.error || "未知错误",
					});
				}
				return result;
			}

			const parsedCard = parseResult.card;

			if (!parsedCard) {
				result.failedCards.push({ file: file.path, card: null, error: "解析后的卡片为空" });
				return result;
			}

			// 3. 同步决策
			const syncDecision = await this.singleCardSyncEngine?.decideSyncAction(parsedCard);

			if (!syncDecision) {
				result.failedCards.push({ file: file.path, card: parsedCard, error: "同步决策器未初始化" });
				return result;
			}

			logDebugWithTag(
				"SimpleBatchParsingService",
				`同步决策: ${syncDecision.action} - ${syncDecision.reason}`
			);

			// 4. 根据同步决策更新统计
			result.totalCards++;

			// 确保parsedCards数组已初始化
			if (!result.parsedCards) result.parsedCards = [];

			switch (syncDecision.action) {
				case "create":
					result.newCards = (result.newCards || 0) + 1;
					if (parsedCard) {
						result.parsedCards.push(parsedCard);
					}
					result.successfulCards++;
					break;

				case "update":
					result.updatedCards = (result.updatedCards || 0) + 1;
					if (!result.parsedCards) result.parsedCards = [];
					if (parsedCard) {
						result.parsedCards.push(parsedCard);
					}
					result.successfulCards++;
					break;

				case "skip":
					result.skippedCards = (result.skippedCards || 0) + 1;
					break;
			}

			// 5. 确保 UUID 已写入 frontmatter（无论是新卡片还是更新卡片）
			// 如果解析时生成了新的 UUID，需要写入文件
			if (parsedCard?.metadata?.uuid && parsedCard.metadata?.isNewCard) {
				try {
					// 验证文件中的 UUID 是否已存在
					const existingUUID = await this.singleCardParser?.getFileUUID(file);
					if (existingUUID !== parsedCard.metadata.uuid) {
						await this.singleCardParser?.setFileUUID(file, parsedCard.metadata.uuid);
					}
				} catch (error) {
					logger.error("[SimpleBatchParsingService] 写入 UUID 失败:", error);
				}
			} else if (parsedCard?.metadata?.uuid) {
				// 即使不是新卡片，也验证 UUID 是否存在
				const existingUUID = await this.singleCardParser?.getFileUUID(file);
				if (!existingUUID) {
					// 如果文件中没有 UUID，但卡片有 UUID，写入它
					try {
						await this.singleCardParser?.setFileUUID(file, parsedCard.metadata.uuid);
					} catch (error) {
						logger.error("[SimpleBatchParsingService] 补充写入 UUID 失败:", error);
					}
				}
			}

			return result;
		} catch (error) {
			logger.error("[SimpleBatchParsingService] 场景2解析异常:", error);
			result.failedCards.push({
				file: file.path,
				card: null,
				error: error instanceof Error ? error.message : String(error),
			});
			return result;
		}
	}

	/**
	 * 场景 1：解析单文件为多张卡片（使用正则解析器）
	 * @param file Obsidian 文件对象
	 * @param mapping 文件夹牌组映射
	 * @param result 解析结果对象（累积）
	 * @returns 解析结果
	 */
	private async parseSingleFileAsMultiCards(
		file: TFile,
		mapping: FolderDeckMapping,
		result: {
			parsedCards: ParsedCard[];
			totalCards: number;
			successfulCards: number;
			failedCards: Array<{ file: string; card: unknown; error: string }>;
			newDecks: string[];
			duplicateUUIDs: string[];
			newCards?: number;
			updatedCards?: number;
			skippedCards?: number;
			conflictCards?: number;
			conflicts?: Array<{
				file: string;
				cardIndex: number;
				uuid: string;
				conflict: unknown;
			}>;
		}
	): Promise<{
		parsedCards: ParsedCard[];
		totalCards: number;
		successfulCards: number;
		failedCards: Array<{ file: string; card: unknown; error: string }>;
		newDecks: string[];
		duplicateUUIDs: string[];
		newCards?: number;
		updatedCards?: number;
		skippedCards?: number;
		conflictCards?: number;
		conflicts?: Array<{
			file: string;
			cardIndex: number;
			uuid: string;
			conflict: unknown;
		}>;
	}> {
		try {
			logDebugWithTag("SimpleBatchParsingService", `场景1：多卡片正则模式解析 ${file.path}`);

			// 1. 获取正则解析配置
			const multiCardsConfig = mapping.multiCardsConfig;
			if (!multiCardsConfig?.parsingConfig) {
				logger.warn("[SimpleBatchParsingService] 映射缺少 multiCardsConfig.parsingConfig，跳过");
				return result;
			}

			const regexConfig: RegexParsingConfig = multiCardsConfig.parsingConfig;

			// 2. 使用 RegexCardParser 解析文件
			// 注意：RegexCardParser 会自动合并全局配置的 excludeTags
			const parseResult = await this.regexCardParser?.parseFile(
				file,
				regexConfig,
				mapping.targetDeckId
			);

			if (!parseResult) {
				result.failedCards.push({ file: file.path, card: null, error: "解析器返回空结果" });
				return result;
			}

			if (!parseResult.success || parseResult.cards.length === 0) {
				if (parseResult.errors.length > 0) {
					logger.error("[SimpleBatchParsingService] 正则解析失败:", parseResult.errors);
					result.failedCards.push({
						file: file.path,
						card: null,
						error: parseResult.errors.join("; "),
					});
				}

				if (parseResult.skippedCount > 0) {
					result.skippedCards = (result.skippedCards || 0) + parseResult.skippedCount;
				}

				return result;
			}

			// 3. 更新统计
			result.totalCards += parseResult.cards.length;
			result.skippedCards = (result.skippedCards || 0) + parseResult.skippedCount;

			logDebugWithTag(
				"SimpleBatchParsingService",
				`正则解析成功：${parseResult.cards.length} 张卡片，跳过 ${parseResult.skippedCount}`
			);

			// 3.5. 处理 UUID 和块链接插入（参考兼容模式的实现）
			if (this.config.uuid.enabled && parseResult.positions && parseResult.originalContent) {
				if (parseResult.positions.length === parseResult.cards.length) {
					logDebugWithTag("SimpleBatchParsingService", "开始插入UUID和块链接...");
					const uuidResult = await processUUIDsWithPosition(
						parseResult.cards,
						parseResult.positions,
						parseResult.originalContent,
						this.uuidManager,
						(content) => this.detectUUIDInBlock(content)
					);

					result.duplicateUUIDs.push(...uuidResult.duplicates);

					if (uuidResult.contentUpdated && this.config.autoSaveAfterParsing) {
						await file.vault.modify(file, uuidResult.updatedContent);
						logDebugWithTag("SimpleBatchParsingService", "UUID和块链接已插入并保存到文件");
					} else if (uuidResult.contentUpdated) {
						logDebugWithTag(
							"SimpleBatchParsingService",
							"UUID已插入但未自动保存（autoSaveAfterParsing=false）"
						);
					}

					//  保护新创建的UUID，防止立即被清理机制误删
					if (this.cleanupService && uuidResult.contentUpdated) {
						for (const card of parseResult.cards) {
							if (card.metadata?.uuid) {
								this.cleanupService.markUUIDRecentlyCreated(card.metadata.uuid);
							}
							if (card.metadata?.blockId) {
								this.cleanupService.markRecentlyCreated(card.metadata.blockId);
							}
						}
						logDebugWithTag(
							"SimpleBatchParsingService",
							`已保护 ${parseResult.cards.length} 个UUID/块链接（60秒）`
						);
					}

					// 将 metadata.blockId 转换为 sourceBlock 和 sourceFile
					for (const card of parseResult.cards) {
						if (card.metadata) {
							// 转换blockId到sourceBlock
							if (card.metadata.blockId) {
								card.metadata.sourceBlock = card.metadata.blockId;
							}
							// 确保sourceFile存在
							if (!card.metadata.sourceFile) {
								card.metadata.sourceFile = file.path;
							}
						}
					}
					logDebugWithTag(
						"SimpleBatchParsingService",
						`✅ 已设置 ${parseResult.cards.length} 张卡片的溯源信息（sourceFile + sourceBlock）`
					);
				} else {
					logger.warn(
						`[SimpleBatchParsingService] ⚠️ 位置信息数量不匹配: cards=${parseResult.cards.length}, positions=${parseResult.positions.length}`
					);
				}
			} else if (this.config.uuid.enabled) {
				logger.warn("[SimpleBatchParsingService] ⚠️ UUID未插入: 缺少位置信息或原始内容");
			}

			// 4. 根据同步方法决策
			const syncMethod = regexConfig.syncMethod || "tag-based";

			if (syncMethod === "tag-based") {
				// 标签判断模式：使用 ThreeWayMergeEngine 进行智能决策
				if (!result.parsedCards) result.parsedCards = [];
				if (!result.conflicts) result.conflicts = [];

				for (const parsedCard of parseResult.cards) {
					try {
						const uuid = parsedCard.metadata?.uuid || "";
						if (!uuid) {
							// 无UUID，直接创建新卡片
							result.newCards = (result.newCards || 0) + 1;
							result.parsedCards.push(parsedCard);
							result.successfulCards++;
							continue;
						}

						// 使用三方合并引擎决策
						if (!this.mergeEngine) {
							result.skippedCards = (result.skippedCards || 0) + 1;
							continue;
						}
						const sourceContent = parsedCard.content || "";
						const syncResult = await this.mergeEngine.smartSync(
							sourceContent,
							uuid,
							mapping.targetDeckId
						);

						// 根据决策更新统计
						switch (syncResult.action) {
							case "created":
								result.newCards = (result.newCards || 0) + 1;
								result.parsedCards.push(parsedCard);
								result.successfulCards++;
								break;

							case "updated":
								result.updatedCards = (result.updatedCards || 0) + 1;
								result.parsedCards.push(parsedCard);
								result.successfulCards++;
								break;

							case "kept":
							case "skipped":
								result.skippedCards = (result.skippedCards || 0) + 1;
								break;

							case "conflict":
								result.conflictCards = (result.conflictCards || 0) + 1;
								result.conflicts.push({
									file: file.path,
									cardIndex: result.parsedCards.length,
									uuid: uuid,
									conflict: syncResult,
								});
								break;
						}
					} catch (error) {
						logger.error("[SimpleBatchParsingService] 同步决策失败:", error);
						result.failedCards.push({
							file: file.path,
							card: parsedCard,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}
			} else {
				// 完全同步模式：所有卡片都添加/更新
				if (!result.parsedCards) result.parsedCards = [];

				for (const parsedCard of parseResult.cards) {
					const uuid = parsedCard.metadata?.uuid;
					if (!uuid) {
						result.newCards = (result.newCards || 0) + 1;
					} else if (this.mergeEngine) {
						// 检查是否存在
						const existingCard = await this.mergeEngine.findCardByUUID(uuid);
						if (existingCard) {
							result.updatedCards = (result.updatedCards || 0) + 1;
						} else {
							result.newCards = (result.newCards || 0) + 1;
						}
					}

					result.parsedCards.push(parsedCard);
					result.successfulCards++;
				}
			}

			return result;
		} catch (error) {
			logger.error("[SimpleBatchParsingService] 场景1多卡片解析异常:", error);
			result.failedCards.push({
				file: file.path,
				card: null,
				error: error instanceof Error ? error.message : String(error),
			});
			return result;
		}
	}
}
