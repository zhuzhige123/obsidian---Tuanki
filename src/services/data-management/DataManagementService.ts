/**
 * 数据管理服务
 *
 * 统一管理数据检测、修复和迁移功能
 *
 * @module services/data-management/DataManagementService
 * @version 1.0.0
 */

import { normalizePath, TFile } from "obsidian";
import {
	LEGACY_DOT_TUANKI,
	getLegacyIRImportFolder,
	getPluginPaths,
	getReadableWeaveRoot,
	getV2Paths,
	normalizeWeaveParentFolder,
	resolveIRImportFolder,
} from "../../config/paths";
import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import {
	hasProgressiveClozeContent,
	isProgressiveClozeChild,
	isProgressiveClozeParent,
} from "../../types/progressive-cloze-v2";
import { DirectoryUtils } from "../../utils/directory-utils";
import {
	cleanupUnusedLegacyMemoryStorage,
	getUnusedLegacyMemoryStorageCandidates,
} from "../../utils/legacy-memory-storage";
import { logger } from "../../utils/logger";
import {
	hasMultipleMemoryFormalDecks,
	keepSingleMemoryFormalDeck,
} from "../../utils/memory-deck-membership";
import {
	type PathRewriteRule,
	buildKnownPathReferenceFiles,
	rewriteKnownPathReferences,
	rewriteJsonWithRules,
} from "../../utils/persisted-path-rewriter";
import {
	type SyncIssueType,
	diagnoseFilename,
	sanitizeForSync,
} from "../../utils/sync-safe-filename";
import {
	type CardYAMLMetadata,
	getCardDeckIds,
	migrateSourceFields,
	needsSourceMigration,
	parseYAMLFromContent,
	setCardProperties,
} from "../../utils/yaml-utils";
import { safeReadJson, safeWriteJson } from "../../utils/safe-json-io";
import { getDeckNameById } from "../DeckNameMapper";
import {
	type DataMigrationPlan,
	type DataMigrationReport,
	UnifiedDataMigrationService,
} from "../data-migration/UnifiedDataMigrationService";
import { migrateLegacyWeaveFolders } from "../data-migration/LegacyWeaveFolderMigration";
import { SchemaV2MigrationService } from "../data-migration/SchemaV2MigrationService";
import { EpubStorageService } from "../epub-integration/EpubStorageService";
import { EpubLinkService } from "../epub-integration/EpubLinkService";
import { DataConsistencyService } from "../reference-deck/DataConsistencyService";
import {
	generateUniqueVaultFilePath,
	resolveObsidianDefaultNewNoteFolder,
} from "../incremental-reading/IRReadableMarkdownPathResolver";
import { IRPointDataReadService } from "../incremental-reading/IRPointDataReadService";
import { IRPointStorageService } from "../incremental-reading/IRPointStorageService";
import { accuracyCalculator } from "../question-bank/AccuracyCalculator";
import type {
	QBankFileData,
	QuestionInBank,
	QBankStats,
	QuestionTestStats,
	TestAttempt,
} from "../question-bank/QBankFileTypes";
import { QuestionBankStorage } from "../question-bank/QuestionBankStorage";
import {
	WDECK_FILE_EXTENSION,
	WDECK_UNGROUPED_DECK_NAME,
	normalizeWDeckLogicalDeckId,
	WDeckService,
	type WDeckFileData,
} from "../wdeck/WDeckService";

// ===== 类型定义 =====

/** 检测类型枚举 */
export type CheckType =
	| "wdeck_migration"
	| "wdeck_conflicts"
	| "wdeck_cache"
	| "structured_data_format"
	| "ir_redundant_frontmatter_cleanup"
	| "ir_point_storage_migration"
	| "ir_legacy_readable_markdown_migration"
	| "ir_local_state_relocation"
	| "ir_legacy_bookmark_cleanup"
	| "migration_conflict_files"
	| "legacy_memory_files"
	| "memory_single_membership"
	| "yaml_migration" // YAML 元数据迁移
	| "we_decks_fix" // we_decks 牌组ID修复
	| "we_block_migration" // we_block -> we_source 合并迁移
	| "epub_source_link_migration" // 旧 EPUB 溯源链接格式迁移
	| "epub_markdown_source_id_backfill" // Markdown 中 EPUB sourceId 回填
	| "deprecated_fields" // 弃用字段检测
	| "card_deck_consistency" // 卡片-牌组一致性
	| "ir_material_consistency" // 导入材料一致性（增量阅读）
	| "orphan_cards" // 孤立卡片
	| "duplicate_cards" // 重复卡片
	| "invalid_refs" // 无效引用
	| "schema_migration" // Schema V2 数据迁移
	| "structure_check" // 目录结构核对
	| "legacy_cleanup" // 旧目录清理
	| "filename_compatibility" // 文件名云同步兼容性
	| "sync_conflict_files" // 云同步冲突副本检测
	| "progressive_cloze_unconverted" // 符合渐进式挖空格式但未转换
	| "progressive_cloze_orphan" // 孤儿子卡片（父卡片已不存在）
	| "progressive_cloze_missing_children" // 父卡片缺少序号对应的子卡片
	| "progressive_cloze_extra_children" // 子卡片序号在父卡片内容中不存在
	| "qbank_migration" // 考试题组迁移到 .qbank 格式
	| "qbank_legacy_cleanup"; // 清理已迁移的旧题库文件

/** 检测状态 */
export type CheckStatus = "ok" | "warning" | "error";

/** 数据检测结果 */
export interface DataCheckResult {
	type: CheckType;
	status: CheckStatus;
	count: number;
	items: string[]; // 问题卡片UUID列表
	message: string;
}

/** 数据修复结果 */
export interface DataFixResult {
	type: CheckType;
	success: number;
	failed: number;
	errors: Array<{ uuid: string; error: string }>;
}

/** 检测进度回调 */
export type ProgressCallback = (current: number, total: number, message: string) => void;

export interface DataFixOptions {
	allowHighRisk?: boolean;
}

export interface SchemaMigrationExecutionOptions {
	confirmed?: boolean;
}

export interface WDeckMigrationExecutionOptions {
	confirmed?: boolean;
}

export interface IRPointStorageMigrationExecutionOptions {
	confirmed?: boolean;
}

type ExistingWDeckFileInfo = {
	path: string;
	logicalDeckId?: string;
	logicalDeckName?: string;
};

type WDeckMigrationCandidate = {
	deck: Deck;
	cards: Card[];
	filePath: string;
	logicalDeckId: string;
	logicalDeckName: string;
};

type WDeckMigrationPlan = {
	targetFolder: string;
	candidates: WDeckMigrationCandidate[];
	alreadyMigrated: ExistingWDeckFileInfo[];
	conflicts: Array<{ deck: Deck; filePath: string; reason: string }>;
};

type LegacyMemorySnapshot = {
	decks: Deck[];
	cards: Card[];
	deckCardUUIDs: Map<string, string[]>;
};

type QBankMigrationCandidate = {
	bank: Deck;
	fileName: string;
	filePath: string;
	questionCount: number;
};

type QBankMigrationPlan = {
	targetFolder: string;
	candidates: QBankMigrationCandidate[];
	alreadyMigrated: ExistingQBankFileInfo[];
	conflicts: Array<{ bank: Deck; filePath: string; reason: string }>;
};

type ExistingQBankFileInfo = {
	path: string;
	bankId: string;
	bankName: string;
};

type LegacyQuestionRef = {
	cardUuid: string;
	addedAt?: string;
};

type LegacyQuestionCard = Pick<Card, "uuid" | "created">;

type LegacyQuestionTestHistoryEntry = TestAttempt & {
	cardUuid: string;
};

type LegacyQuestionRefsFile =
	| LegacyQuestionRef[]
	| {
			refs?: LegacyQuestionRef[];
			questions?: LegacyQuestionCard[];
	  };

type StructuredDataFileKind = "wdeck" | "irdeck" | "qbank";

type StructuredDataFormatIssue = {
	kind: StructuredDataFileKind;
	path: string;
	repairable: boolean;
	reason: string;
	normalizedContent?: string;
	repairStrategy?: "rewrite" | "restore_backup";
};

const WDECK_MIGRATION_DIR_NAME = "deck-files";

// ===== 弃用字段定义 =====

/**
 * 需要直接删除的弃用字段
 * 注意：deckId、referencedByDecks 是当前运行时关系层仍会注入的字段，
 * 不能继续当作持久化残留来检测，否则会在数据管理里产生大量假阳性。
 */
const DEPRECATED_FIELDS_TO_DELETE = [
	"template",
	"templateId",
	"fields", // Content-Only 架构下从 content 实时解析
] as const;

const LEGACY_IR_FRONTMATTER_FIELDS = [
	"weave-reading-category",
	"weave-reading-priority",
	"weave-reading-topic-id",
	"weave-reading-ir-deck-id",
] as const;

export const DEFAULT_BATCH_FIX_TYPES: CheckType[] = [
	"yaml_migration",
	"we_decks_fix",
	"memory_single_membership",
	"we_block_migration",
	"epub_source_link_migration",
	"deprecated_fields",
	"structured_data_format",
	"card_deck_consistency",
];

export const HIGH_RISK_FIX_TYPES: CheckType[] = [
	"duplicate_cards",
	"ir_material_consistency",
	"ir_redundant_frontmatter_cleanup",
	"epub_markdown_source_id_backfill",
	"ir_point_storage_migration",
	"ir_legacy_readable_markdown_migration",
	"ir_legacy_bookmark_cleanup",
	"migration_conflict_files",
	"legacy_memory_files",
	"legacy_cleanup",
	"wdeck_migration",
	"qbank_migration",
	"qbank_legacy_cleanup",
	"filename_compatibility",
	"sync_conflict_files",
	"progressive_cloze_unconverted",
];

export function isHighRiskFixType(type: CheckType): boolean {
	return HIGH_RISK_FIX_TYPES.includes(type);
}

// ===== 服务实现 =====

export class DataManagementService {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	private getMigrationService(): UnifiedDataMigrationService {
		return new UnifiedDataMigrationService(this.plugin.app, this.plugin.settings);
	}

	private buildBlockedFixResult(type: CheckType, message: string): DataFixResult {
		return {
			type,
			success: 0,
			failed: 1,
			errors: [{ uuid: type, error: message }],
		};
	}

	private ensureHighRiskFixAllowed(
		type: CheckType,
		options?: DataFixOptions
	): DataFixResult | null {
		if (!isHighRiskFixType(type) || options?.allowHighRisk) {
			return null;
		}

		return this.buildBlockedFixResult(type, "该修复会改动真实用户数据，必须在明确确认后单独执行。");
	}

	async recoverMigrationConflictData(): Promise<{
		importedCards: number;
		importedDecks: number;
		deletedCardFiles: number;
		mergedCardFiles: number;
		mergedIRMonitoringFiles: number;
		renamedManifests: number;
		errors: string[];
	}> {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const result = {
			importedCards: 0,
			importedDecks: 0,
			deletedCardFiles: 0,
			mergedCardFiles: 0,
			mergedIRMonitoringFiles: 0,
			renamedManifests: 0,
			errors: [] as string[],
		};

		try {
			const imported = await this.importMigrationConflicts(v2Paths);
			result.importedCards = imported.importedCards;
			result.importedDecks = imported.importedDecks;
			result.errors.push(...imported.errors);
		} catch (error) {
			result.errors.push(`恢复迁移冲突数据失败: ${String(error)}`);
		}

		try {
			const cardCleanup = await this.cleanupEmptyCardFiles(v2Paths);
			result.deletedCardFiles = cardCleanup.deleted;
			result.mergedCardFiles = cardCleanup.merged;
			result.errors.push(...cardCleanup.errors);
		} catch (error) {
			result.errors.push(`清理空卡片文件失败: ${String(error)}`);
		}

		try {
			const monitoringRecovery = await this.recoverIRMonitoringConflictFiles(v2Paths);
			result.mergedIRMonitoringFiles = monitoringRecovery.mergedFiles;
			result.errors.push(...monitoringRecovery.errors);
		} catch (error) {
			result.errors.push(`恢复增量阅读监控冲突文件失败: ${String(error)}`);
		}

		try {
			const structuredRecovery = await this.recoverStructuredJsonConflictFiles(v2Paths);
			result.errors.push(...structuredRecovery.errors);
		} catch (error) {
			result.errors.push(`恢复结构化迁移冲突文件失败: ${String(error)}`);
		}

		try {
			result.renamedManifests = await this.renameDotManifestFiles(v2Paths);
		} catch (error) {
			result.errors.push(`修正媒体清单文件失败: ${String(error)}`);
		}

		return result;
	}

	// ===== 检测方法 =====

	/**
	 * 检测所有问题
	 */
	async checkAll(onProgress?: ProgressCallback): Promise<DataCheckResult[]> {
		const results: DataCheckResult[] = [];
		// 注意：orphan_cards（孤立卡片）在引用式牌组架构下是允许存在的，不作为问题检测
		// 注意：redundant_fields 已移除，因为 Content-Only 架构下 type/tags 是从 content YAML 派生的运行时字段
		const checks: CheckType[] = [
			"yaml_migration",
			"we_decks_fix",
			"memory_single_membership",
			"we_block_migration",
			"epub_source_link_migration",
			"epub_markdown_source_id_backfill",
			"deprecated_fields",
			"structured_data_format",
			"ir_redundant_frontmatter_cleanup",
			"duplicate_cards",
			"card_deck_consistency",
			"ir_point_storage_migration",
			"ir_legacy_readable_markdown_migration",
			"ir_local_state_relocation",
			"ir_legacy_bookmark_cleanup",
			"wdeck_migration",
			"legacy_memory_files",
			"wdeck_conflicts",
			"wdeck_cache",
			"migration_conflict_files",
			"ir_material_consistency",
			"legacy_cleanup",
			"filename_compatibility",
			"sync_conflict_files",
			"progressive_cloze_unconverted",
			"progressive_cloze_orphan",
			"progressive_cloze_missing_children",
			"progressive_cloze_extra_children",
		];

		for (let i = 0; i < checks.length; i++) {
			onProgress?.(i + 1, checks.length, `检测 ${this.getCheckName(checks[i])}...`);
			const result = await this.check(checks[i]);
			results.push(result);
		}

		return results;
	}

	/**
	 * 检测单项
	 */
	async check(type: CheckType): Promise<DataCheckResult> {
		switch (type) {
			case "yaml_migration":
				return this.checkYAMLMigration(await this.plugin.dataStorage.getCards());
			case "we_decks_fix":
				return this.checkWeDecksId(await this.plugin.dataStorage.getCards());
			case "memory_single_membership":
				return this.checkMemorySingleMembership(
					await this.plugin.dataStorage.getCards(),
					await this.plugin.dataStorage.getDecks()
				);
			case "we_block_migration":
				return this.checkWeBlockMigration(await this.plugin.dataStorage.getCards());
			case "epub_source_link_migration":
				return await this.checkEpubSourceLinkMigration(await this.plugin.dataStorage.getCards());
			case "epub_markdown_source_id_backfill":
				return await this.checkEpubMarkdownSourceIdBackfill();
			case "deprecated_fields":
				return this.checkDeprecatedFields(await this.plugin.dataStorage.getCards());
			case "structured_data_format":
				return await this.checkStructuredDataFormat();
			case "ir_redundant_frontmatter_cleanup":
				return await this.checkIRRedundantFrontmatterCleanup();
			case "duplicate_cards":
				return this.checkDuplicateCards(await this.plugin.dataStorage.getCards());
			case "card_deck_consistency":
				return await this.checkCardDeckConsistency();
			case "ir_material_consistency":
				return await this.checkIRMaterialConsistency();
			case "ir_point_storage_migration":
				return await this.checkIRPointStorageMigration();
			case "ir_legacy_readable_markdown_migration":
				return await this.checkIRLegacyReadableMarkdownMigration();
			case "ir_local_state_relocation":
				return await this.checkIRLocalStateRelocation();
			case "ir_legacy_bookmark_cleanup":
				return await this.checkIRLegacyBookmarkCleanup();
			case "schema_migration":
				return await this.checkSchemaMigration();
			case "structure_check":
				return await this.checkStructure();
			case "wdeck_migration":
				return await this.checkWDeckMigration();
			case "legacy_memory_files":
				return await this.checkLegacyMemoryFiles();
			case "wdeck_conflicts":
				return await this.checkWDeckConflicts();
			case "wdeck_cache":
				return await this.checkWDeckCache();
			case "migration_conflict_files":
				return await this.checkMigrationConflictFiles();
			case "legacy_cleanup":
				return await this.checkLegacyDirectories();
			case "filename_compatibility":
				return await this.checkFilenameCompatibility();
			case "sync_conflict_files":
				return await this.checkSyncConflictFiles();
			case "progressive_cloze_unconverted":
				return this.checkProgressiveClozeUnconverted(await this.plugin.dataStorage.getCards());
			case "progressive_cloze_orphan":
				return this.checkProgressiveClozeOrphan(await this.plugin.dataStorage.getCards());
			case "progressive_cloze_missing_children":
				return this.checkProgressiveClozeMissingChildren(await this.plugin.dataStorage.getCards());
			case "progressive_cloze_extra_children":
				return this.checkProgressiveClozeExtraChildren(await this.plugin.dataStorage.getCards());
			case "qbank_migration":
				return await this.checkQBankMigration();
			case "qbank_legacy_cleanup":
				return await this.checkQBankLegacyCleanup();
			case "orphan_cards":
				return this.checkOrphanCards(
					await this.plugin.dataStorage.getCards(),
					await this.plugin.dataStorage.getDecks()
				);
			default:
				return {
					type,
					status: "ok",
					count: 0,
					items: [],
					message: "未实现的检查项",
				};
		}
	}

	async fix(type: CheckType, options: DataFixOptions = {}): Promise<DataFixResult> {
		const blocked = this.ensureHighRiskFixAllowed(type, options);
		if (blocked) {
			return blocked;
		}

		switch (type) {
			case "yaml_migration":
				return await this.fixYAMLMigration(await this.plugin.dataStorage.getCards());
			case "we_decks_fix":
				return await this.fixWeDecksId(
					await this.plugin.dataStorage.getCards(),
					await this.plugin.dataStorage.getDecks()
				);
			case "memory_single_membership":
				return await this.fixMemorySingleMembership(
					await this.plugin.dataStorage.getCards(),
					await this.plugin.dataStorage.getDecks()
				);
			case "we_block_migration":
				return await this.fixWeBlockMigration(await this.plugin.dataStorage.getCards());
			case "epub_source_link_migration":
				return await this.fixEpubSourceLinkMigration(await this.plugin.dataStorage.getCards());
			case "epub_markdown_source_id_backfill":
				return await this.fixEpubMarkdownSourceIdBackfill();
			case "deprecated_fields":
				return await this.fixDeprecatedFields(await this.plugin.dataStorage.getCards());
			case "structured_data_format":
				return await this.fixStructuredDataFormat();
			case "ir_redundant_frontmatter_cleanup":
				return await this.fixIRRedundantFrontmatterCleanup();
			case "duplicate_cards":
				return await this.fixDuplicateCards(await this.plugin.dataStorage.getCards());
			case "card_deck_consistency":
				return await this.fixCardDeckConsistency();
			case "ir_material_consistency":
				return await this.fixIRMaterialConsistency();
			case "ir_point_storage_migration":
				return await this.executeIRPointStorageMigration({ confirmed: !!options.allowHighRisk });
			case "ir_legacy_readable_markdown_migration":
				return await this.migrateLegacyIRReadableMarkdown(options);
			case "ir_local_state_relocation":
				return await this.fixIRLocalStateRelocation();
			case "ir_legacy_bookmark_cleanup":
				return await this.cleanupIRLegacyBookmarkFiles(options);
			case "schema_migration":
				return await this.executeSchemaMigration({ confirmed: !!options.allowHighRisk });
			case "structure_check":
				return await this.fixStructure();
			case "wdeck_migration":
				return await this.executeWDeckMigration({ confirmed: !!options.allowHighRisk });
			case "legacy_memory_files":
				return await this.fixLegacyMemoryFiles(options);
			case "wdeck_conflicts":
				return await this.fixWDeckConflicts();
			case "wdeck_cache":
				return await this.fixWDeckCache();
			case "migration_conflict_files":
				return await this.fixMigrationConflictFiles();
			case "legacy_cleanup":
				return await this.cleanupLegacyDirectories(options);
			case "filename_compatibility":
				return await this.fixFilenameCompatibility();
			case "sync_conflict_files":
				return await this.fixSyncConflictFiles();
			case "progressive_cloze_unconverted":
				return await this.fixProgressiveClozeUnconverted(await this.plugin.dataStorage.getCards());
			case "qbank_migration":
				return await this.executeQBankMigration({ confirmed: !!options.allowHighRisk });
			case "qbank_legacy_cleanup":
				return await this.executeQBankLegacyCleanup({ confirmed: !!options.allowHighRisk });
			default:
				return {
					type,
					success: 0,
					failed: 0,
					errors: [],
				};
		}
	}

	async fixAll(onProgress?: ProgressCallback): Promise<DataFixResult[]> {
		const results: DataFixResult[] = [];
		for (let i = 0; i < DEFAULT_BATCH_FIX_TYPES.length; i++) {
			const type = DEFAULT_BATCH_FIX_TYPES[i];
			onProgress?.(i + 1, DEFAULT_BATCH_FIX_TYPES.length, `修复 ${this.getCheckName(type)}...`);
			const result = await this.fix(type);
			results.push(result);
			this.plugin.cardFileService?.clearCache?.();
		}
		return results;
	}

	// ===== 具体检测实现 =====

	/**
	 * 检测需要 YAML 迁移的卡片
	 */
	private checkYAMLMigration(cards: Card[]): DataCheckResult {
		const needsMigration: string[] = [];

		for (const card of cards) {
			if (this.cardNeedsYAMLMigration(card)) {
				needsMigration.push(card.uuid);
			}
		}

		return {
			type: "yaml_migration",
			status: needsMigration.length > 0 ? "warning" : "ok",
			count: needsMigration.length,
			items: needsMigration,
			message:
				needsMigration.length > 0
					? `发现 ${needsMigration.length} 张卡片需要 YAML 迁移`
					: "所有卡片已迁移",
		};
	}

	/**
	 * 检测 we_decks 中写入牌组ID的卡片
	 */
	private checkWeDecksId(cards: Card[]): DataCheckResult {
		const needsFix: string[] = [];

		for (const card of cards) {
			if (this.cardHasWeDecksId(card)) {
				needsFix.push(card.uuid);
			}
		}

		return {
			type: "we_decks_fix",
			status: needsFix.length > 0 ? "warning" : "ok",
			count: needsFix.length,
			items: needsFix,
			message:
				needsFix.length > 0
					? `发现 ${needsFix.length} 张卡片 we_decks 写入了牌组ID`
					: "we_decks 数据正常",
		};
	}

	private checkMemorySingleMembership(cards: Card[], decks: Deck[]): DataCheckResult {
		const affectedCards: string[] = [];

		for (const card of cards) {
			if (!card.content) {
				continue;
			}

			try {
				const yaml = parseYAMLFromContent(card.content);
				if (hasMultipleMemoryFormalDecks(yaml.we_decks, decks)) {
					affectedCards.push(card.uuid);
				}
			} catch {
				continue;
			}
		}

		return {
			type: "memory_single_membership",
			status: affectedCards.length > 0 ? "warning" : "ok",
			count: affectedCards.length,
			items: affectedCards,
			message:
				affectedCards.length > 0
					? `发现 ${affectedCards.length} 张记忆卡同时归属于多个正式牌组`
					: "记忆正式牌组归属已收口为单归属",
		};
	}

	/**
	 * 检测卡片中的弃用字段
	 */
	private checkDeprecatedFields(cards: Card[]): DataCheckResult {
		const hasDeprecated: string[] = [];

		for (const card of cards) {
			if (this.cardHasDeprecatedFields(card)) {
				hasDeprecated.push(card.uuid);
			}
		}

		return {
			type: "deprecated_fields",
			status: hasDeprecated.length > 0 ? "warning" : "ok",
			count: hasDeprecated.length,
			items: hasDeprecated,
			message:
				hasDeprecated.length > 0 ? `发现 ${hasDeprecated.length} 张卡片存在弃用字段` : "无弃用字段",
		};
	}

	/**
	 * 检测需要 we_block -> we_source 合并迁移的卡片
	 */
	private checkWeBlockMigration(cards: Card[]): DataCheckResult {
		const needsMigration: string[] = [];

		for (const card of cards) {
			if (card.content && needsSourceMigration(card.content)) {
				needsMigration.push(card.uuid);
			}
		}

		return {
			type: "we_block_migration",
			status: needsMigration.length > 0 ? "warning" : "ok",
			count: needsMigration.length,
			items: needsMigration,
			message:
				needsMigration.length > 0
					? `发现 ${needsMigration.length} 张卡片需要合并 we_block 到 we_source`
					: "we_source 格式正常",
		};
	}

	/**
	 * 检测需要迁移旧 EPUB 溯源链接格式的卡片
	 */
	private async checkEpubSourceLinkMigration(cards: Card[]): Promise<DataCheckResult> {
		const needsMigration: string[] = [];
		const epubLinkService = new EpubLinkService(this.plugin.app);

		for (const card of cards) {
			if (!card.content) continue;
			const migrationResult = await epubLinkService.enrichEpubLinksWithSourceIdsInContent(card.content);
			if (migrationResult.changed) {
				needsMigration.push(card.uuid);
			}
		}

		return {
			type: "epub_source_link_migration",
			status: needsMigration.length > 0 ? "warning" : "ok",
			count: needsMigration.length,
			items: needsMigration,
			message:
				needsMigration.length > 0
					? `发现 ${needsMigration.length} 张卡片包含旧 EPUB 溯源链接格式`
					: "EPUB 溯源链接格式正常",
		};
	}

	private findEpubMarkdownLinksNeedingSourceId(content: string): string[] {
		if (!content) {
			return [];
		}

		const matches = new Set<string>();
		for (const markup of EpubLinkService.collectEpubLinkMarkups(content)) {
			const parsed = EpubLinkService.parseLinkMarkup(markup);
			if (!parsed?.filePath || parsed.sourceId) {
				continue;
			}
			matches.add(markup);
		}

		return Array.from(matches);
	}

	private async checkEpubMarkdownSourceIdBackfill(): Promise<DataCheckResult> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const items: string[] = [];

			for (const filePath of await this.listVaultMarkdownPaths()) {
				const content = await adapter.read(filePath);
				if (this.findEpubMarkdownLinksNeedingSourceId(content).length > 0) {
					items.push(filePath);
				}
			}

			return {
				type: "epub_markdown_source_id_backfill",
				status: items.length > 0 ? "warning" : "ok",
				count: items.length,
				items,
				message:
					items.length > 0
						? `发现 ${items.length} 个 Markdown 文件包含缺少 sourceId 的 EPUB 链接`
						: "Markdown 中的 EPUB 链接 sourceId 状态正常",
			};
		} catch (error) {
			logger.error("[DataManagement] EPUB Markdown sourceId 回填检测失败:", error);
			return {
				type: "epub_markdown_source_id_backfill",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * 检测卡片-牌组一致性（引用式牌组数据一致性）
	 *
	 * 简化为只检查牌组侧的无效引用
	 * - 以 deck.cardUUIDs 为唯一权威数据源
	 * - 只检查牌组中是否存在指向不存在卡片的UUID
	 * - 不再检查已废弃的 card.referencedByDecks 字段
	 */
	private async checkCardDeckConsistency(): Promise<DataCheckResult> {
		const consistencyService = new DataConsistencyService(this.plugin);
		const result = await consistencyService.checkConsistency();
		const affectedDecks = result.invalidReferences.map((item) => item.deckId);
		const invalidDeckRefs = result.invalidReferences.reduce(
			(total, item) => total + item.invalidCardUUIDs.length,
			0
		);

		return {
			type: "card_deck_consistency",
			status: invalidDeckRefs > 0 ? "warning" : "ok",
			count: invalidDeckRefs,
			items: affectedDecks,
			message:
				invalidDeckRefs > 0
					? `发现 ${invalidDeckRefs} 个牌组缓存不一致项（${affectedDecks.length} 个牌组受影响）`
					: "牌组缓存一致",
		};
	}

	/**
	 * 修复卡片-牌组一致性
	 *
	 * 简化为只清理牌组侧的无效引用
	 * - 以 deck.cardUUIDs 为唯一权威数据源
	 * - 只清理牌组中指向不存在卡片的UUID
	 * - 不再尝试修改已废弃的 card.referencedByDecks 字段（该字段是派生字段，保存时会被剥离）
	 */
	private async fixCardDeckConsistency(): Promise<DataFixResult> {
		const consistencyService = new DataConsistencyService(this.plugin);
		const result = await consistencyService.repairConsistency();

		return {
			type: "card_deck_consistency",
			success: result.success ? result.cleanedInvalidRefs : 0,
			failed: result.success ? 0 : 1,
			errors: result.success
				? []
				: [{ uuid: "card_deck_consistency", error: result.error || "牌组缓存一致性修复失败" }],
		};
	}

	/**
	 * 检测孤立卡片（不属于任何牌组）
	 */
	private checkOrphanCards(cards: Card[], decks: Deck[]): DataCheckResult {
		const deckLookups = decks.map((deck) => ({
			id: deck.id,
			name: deck.name,
			purpose: deck.purpose,
		}));
		const orphans: string[] = [];

		for (const card of cards) {
			const membership = getCardDeckIds(card, deckLookups, { fallbackToReferences: false }).deckIds;
			if (membership.length === 0) {
				orphans.push(card.uuid);
			}
		}

		return {
			type: "orphan_cards",
			status: orphans.length > 0 ? "warning" : "ok",
			count: orphans.length,
			items: orphans,
			message: orphans.length > 0 ? `发现 ${orphans.length} 张孤立卡片` : "无孤立卡片",
		};
	}

	/**
	 * 检测内容重复卡片（AnkiConnect同步Bug导致的重复）
	 *
	 * 检测逻辑：
	 * 1. 提取每张卡片的内容指纹（去除YAML frontmatter后的纯内容）
	 * 2. 按指纹分组，找出内容相同但UUID不同的卡片组
	 * 3. 每组中只需保留1张，其余为重复
	 */
	private checkDuplicateCards(cards: Card[]): DataCheckResult {
		const groups = new Map<string, Card[]>();

		for (const card of cards) {
			const fp = this.getContentFingerprint(card);
			if (!fp) continue;

			if (!groups.has(fp)) {
				groups.set(fp, []);
			}
			groups.get(fp)?.push(card);
		}

		const duplicateUUIDs: string[] = [];
		let duplicateGroups = 0;

		for (const [, groupCards] of groups) {
			if (groupCards.length <= 1) continue;
			duplicateGroups++;
			// 排序：有学习记录的优先，其次最早创建的
			groupCards.sort((a, b) => this.getCardRetentionScore(b) - this.getCardRetentionScore(a));
			// 第一张保留，其余标记为重复
			for (let i = 1; i < groupCards.length; i++) {
				duplicateUUIDs.push(groupCards[i].uuid);
			}
		}

		return {
			type: "duplicate_cards",
			status: duplicateUUIDs.length > 0 ? "warning" : "ok",
			count: duplicateUUIDs.length,
			items: duplicateUUIDs.slice(0, 200),
			message:
				duplicateUUIDs.length > 0
					? `发现 ${duplicateUUIDs.length} 张内容重复卡片（${duplicateGroups} 组），通常由 AnkiConnect 同步异常导致`
					: "无内容重复卡片",
		};
	}

	/**
	 * 修复内容重复卡片
	 *
	 * 修复逻辑：
	 * 1. 按内容指纹分组，每组保留"最佳"卡片（有FSRS学习记录 > 有复习记录 > 最早创建）
	 * 2. 删除重复卡片
	 * 3. 更新牌组 cardUUIDs：将重复UUID替换为保留的UUID
	 */
	private async fixDuplicateCards(cards: Card[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		logger.info("[DataManagement] 开始修复内容重复卡片...");

		// 1. 按内容指纹分组
		const groups = new Map<string, Card[]>();
		for (const card of cards) {
			const fp = this.getContentFingerprint(card);
			if (!fp) continue;
			if (!groups.has(fp)) groups.set(fp, []);
			groups.get(fp)?.push(card);
		}

		// 2. 找出需要删除的重复卡片，建立 UUID 重映射
		const toDelete: string[] = [];

		for (const [, groupCards] of groups) {
			if (groupCards.length <= 1) continue;
			groupCards.sort((a, b) => this.getCardRetentionScore(b) - this.getCardRetentionScore(a));
			for (let i = 1; i < groupCards.length; i++) {
				toDelete.push(groupCards[i].uuid);
			}
		}

		if (toDelete.length === 0) {
			logger.info("[DataManagement] 无需修复，没有重复卡片");
			return { type: "duplicate_cards", success: 0, failed: 0, errors: [] };
		}

		logger.info(`[DataManagement] 发现 ${toDelete.length} 张重复卡片待删除`);

		// 3. 删除重复卡片
		if (typeof this.plugin.dataStorage.deleteCards === "function") {
			const deleteResult = await this.plugin.dataStorage.deleteCards(toDelete);
			success += deleteResult.deleted.length;
			failed += deleteResult.failed.length;
			errors.push(
				...deleteResult.failed.map((item) => ({
					uuid: item.uuid,
					error: item.error || "删除失败",
				}))
			);
		} else {
			for (const uuid of toDelete) {
				try {
					if (this.plugin.cardFileService?.deleteCard) {
						const deleted = await this.plugin.cardFileService.deleteCard(uuid);
						if (deleted) {
							success++;
						} else {
							failed++;
							errors.push({ uuid, error: "删除失败" });
						}
					}
				} catch (e) {
					failed++;
					errors.push({ uuid, error: String(e) });
				}
			}
		}

		// 4. 更新牌组 cardUUIDs：替换已删除UUID为保留的UUID
		if (success > 0) {
			const consistencyService = new DataConsistencyService(this.plugin);
			const repairResult = await consistencyService.repairConsistency();
			if (!repairResult.success) {
				errors.push({
					uuid: "duplicate_cards",
					error: repairResult.error || "删除重复卡片后重建牌组缓存失败",
				});
				failed += 1;
			}
		}

		logger.info(`[DataManagement] 重复卡片修复完成: 删除 ${success} 张，失败 ${failed}`);

		return { type: "duplicate_cards", success, failed, errors };
	}

	/**
	 * 提取卡片内容指纹（去除YAML frontmatter后标准化）
	 * 使用完整内容的哈希值，避免截断导致不同卡片误判为重复
	 */
	private getContentFingerprint(card: Card): string {
		const content = card.content || "";
		if (!content.trim()) return "";
		// 去除 YAML frontmatter
		const stripped = content.replace(/^---[\s\S]*?---\s*/, "").trim();
		// 标准化空白
		const normalized = stripped.replace(/\s+/g, " ");
		if (!normalized) return "";
		// 使用简单哈希生成固定长度指纹
		return this.simpleHash(normalized);
	}

	/**
	 * 简单字符串哈希（djb2 算法），用于内容指纹
	 */
	private simpleHash(str: string): string {
		let hash1 = 5381;
		let hash2 = 52711;
		for (let i = 0; i < str.length; i++) {
			const ch = str.charCodeAt(i);
			hash1 = ((hash1 << 5) + hash1 + ch) >>> 0;
			hash2 = ((hash2 << 5) + hash2 + ch) >>> 0;
		}
		return `${(hash1 >>> 0).toString(36)}_${(hash2 >>> 0).toString(36)}_${str.length}`;
	}

	/**
	 * 评估卡片保留优先分数（分数越高越应保留）
	 */
	private getCardRetentionScore(card: Card): number {
		let score = 0;
		const cardAny = card as any;

		// 有FSRS状态且非new的卡片最有价值
		if (cardAny.fsrs && cardAny.fsrs.state !== undefined && cardAny.fsrs.state > 0) {
			score += 10000;
		}

		// 有复习记录
		if (Array.isArray(cardAny.reviewLog) && cardAny.reviewLog.length > 0) {
			score += 5000 + cardAny.reviewLog.length;
		}

		// 有学习状态（从YAML解析）
		const content = card.content || "";
		const weStatus = content.match(/we_status:\s*"?(\w+)"?/);
		if (weStatus && weStatus[1] !== "new") {
			score += 3000;
		}

		// 有YAML frontmatter（更完整的数据）
		if (content.startsWith("---")) {
			score += 100;
		}

		// 更早创建的优先
		let created = 0;
		if (card.created) {
			if (typeof card.created === "number") {
				created = card.created;
			} else if (typeof card.created === "string") {
				created = new Date(card.created).getTime();
			}
		}
		if (created > 0) {
			score += Math.max(0, 1900000000 - created / 1000);
		}

		return score;
	}

	// ===== 具体修复实现 =====

	/**
	 * 修复 YAML 迁移
	 */
	private async fixYAMLMigration(cards: Card[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		for (const card of cards) {
			if (!this.cardNeedsYAMLMigration(card)) continue;

			try {
				const migratedCard = this.migrateCardToYAML(card);
				const result = await this.plugin.dataStorage.saveCard(migratedCard);
				if (result.success) {
					success++;
				} else {
					failed++;
					errors.push({ uuid: card.uuid, error: result.error || "保存失败" });
				}
			} catch (e) {
				failed++;
				errors.push({ uuid: card.uuid, error: String(e) });
			}
		}

		logger.info(`[DataManagement] YAML迁移完成: 成功 ${success}, 失败 ${failed}`);

		return {
			type: "yaml_migration",
			success,
			failed,
			errors,
		};
	}

	/**
	 * 修复 we_decks 中的牌组ID
	 */
	private async fixWeDecksId(cards: Card[], decks: Deck[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		logger.info(
			`[DataManagement] 开始修复 we_decks，共 ${cards.length} 张卡片，${decks.length} 个牌组`
		);

		for (const card of cards) {
			if (!this.cardHasWeDecksId(card)) continue;

			try {
				const fixedCard = this.fixCardWeDecksId(card, decks);
				if (fixedCard) {
					// 验证修复结果
					const oldYAML = parseYAMLFromContent(card.content || "");
					const newYAML = parseYAMLFromContent(fixedCard.content || "");
					logger.debug(`[DataManagement] 修复卡片 ${card.uuid}:`, {
						old_we_decks: oldYAML.we_decks,
						new_we_decks: newYAML.we_decks,
					});

					const result = await this.plugin.dataStorage.saveCard(fixedCard);
					if (result.success) {
						// 验证保存结果
						if (result.data) {
							const savedYAML = parseYAMLFromContent(result.data.content || "");
							logger.debug(`[DataManagement] 保存后验证 ${card.uuid}:`, {
								saved_we_decks: savedYAML.we_decks,
							});
						}
						success++;
					} else {
						failed++;
						errors.push({ uuid: card.uuid, error: result.error || "保存失败" });
						logger.error(`[DataManagement] 保存失败: ${card.uuid}`, result.error);
					}
				}
			} catch (e) {
				failed++;
				errors.push({ uuid: card.uuid, error: String(e) });
				logger.error(`[DataManagement] 修复异常: ${card.uuid}`, e);
			}
		}

		logger.info(`[DataManagement] we_decks修复完成: 成功 ${success}, 失败 ${failed}`);

		return {
			type: "we_decks_fix",
			success,
			failed,
			errors,
		};
	}

	private async fixMemorySingleMembership(cards: Card[], decks: Deck[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		for (const card of cards) {
			const normalizedCard = this.normalizeCardToSingleMemoryMembership(card, decks);
			if (!normalizedCard) {
				continue;
			}

			try {
				const result = await this.plugin.dataStorage.saveCard(normalizedCard);
				if (result.success) {
					success++;
				} else {
					failed++;
					errors.push({ uuid: card.uuid, error: result.error || "保存失败" });
				}
			} catch (error) {
				failed++;
				errors.push({ uuid: card.uuid, error: String(error) });
			}
		}

		return {
			type: "memory_single_membership",
			success,
			failed,
			errors,
		};
	}

	/**
	 * 清理弃用字段
	 */
	private async fixDeprecatedFields(cards: Card[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		for (const card of cards) {
			if (!this.cardHasDeprecatedFields(card)) continue;

			try {
				const cleanedCard = this.cleanDeprecatedFields(card);
				const result = await this.plugin.dataStorage.saveCard(cleanedCard);
				if (result.success) {
					success++;
				} else {
					failed++;
					errors.push({ uuid: card.uuid, error: result.error || "保存失败" });
				}
			} catch (e) {
				failed++;
				errors.push({ uuid: card.uuid, error: String(e) });
			}
		}

		logger.info(`[DataManagement] 弃用字段清理完成: 成功 ${success}, 失败 ${failed}`);

		return {
			type: "deprecated_fields",
			success,
			failed,
			errors,
		};
	}

	/**
	 * 修复 we_block -> we_source 合并迁移
	 */
	private async fixWeBlockMigration(cards: Card[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		logger.info("[DataManagement] 开始合并 we_block 到 we_source...");

		for (const card of cards) {
			if (!card.content || !needsSourceMigration(card.content)) continue;

			try {
				const migrationResult = migrateSourceFields(card.content);

				if (migrationResult.migrated) {
					const updatedCard = {
						...card,
						content: migrationResult.content,
						modified: new Date().toISOString(),
					};

					const result = await this.plugin.dataStorage.saveCard(updatedCard);
					if (result.success) {
						success++;
						logger.debug(`[DataManagement] we_block 合并成功: ${card.uuid}`);
					} else {
						failed++;
						errors.push({ uuid: card.uuid, error: result.error || "保存失败" });
					}
				}
			} catch (e) {
				failed++;
				errors.push({ uuid: card.uuid, error: String(e) });
			}
		}

		logger.info(`[DataManagement] we_block 合并完成: 成功 ${success}, 失败 ${failed}`);

		return {
			type: "we_block_migration",
			success,
			failed,
			errors,
		};
	}

	/**
	 * 修复旧 EPUB 溯源链接格式
	 */
	private async fixEpubSourceLinkMigration(cards: Card[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];
		const epubLinkService = new EpubLinkService(this.plugin.app);

		logger.info("[DataManagement] 开始迁移旧 EPUB 溯源链接格式...");

		for (const card of cards) {
			if (!card.content) continue;

			const migrationResult = await epubLinkService.enrichEpubLinksWithSourceIdsInContent(card.content);
			if (!migrationResult.changed) {
				continue;
			}

			try {
				const updatedCard = {
					...card,
					content: migrationResult.content,
					modified: new Date().toISOString(),
				};

				const result = await this.plugin.dataStorage.saveCard(updatedCard);
				if (result.success) {
					success++;
					logger.debug(
						`[DataManagement] EPUB 溯源链接迁移成功: ${card.uuid}, updatedLinks=${migrationResult.updatedLinks}`
					);
				} else {
					failed++;
					errors.push({ uuid: card.uuid, error: result.error || "保存失败" });
				}
			} catch (e) {
				failed++;
				errors.push({ uuid: card.uuid, error: String(e) });
			}
		}

		logger.info(`[DataManagement] EPUB 溯源链接迁移完成: 成功 ${success}, 失败 ${failed}`);

		return {
			type: "epub_source_link_migration",
			success,
			failed,
			errors,
		};
	}

	private async fixEpubMarkdownSourceIdBackfill(): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];
		const adapter = this.plugin.app.vault.adapter;
		const epubLinkService = new EpubLinkService(this.plugin.app);

		for (const filePath of await this.listVaultMarkdownPaths()) {
			try {
				const content = await adapter.read(filePath);
				if (this.findEpubMarkdownLinksNeedingSourceId(content).length === 0) {
					continue;
				}

				const migration = await epubLinkService.enrichEpubLinksWithSourceIdsInContent(
					content,
					filePath
				);
				if (!migration.changed || migration.content === content) {
					failed++;
					errors.push({
						uuid: filePath,
						error: "检测到旧 EPUB 链接，但未能完成 sourceId 回填",
					});
					continue;
				}

				const abstractFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
				if (abstractFile instanceof TFile) {
					await this.plugin.app.vault.process(abstractFile, (current) =>
						current === content ? migration.content : current
					);
				} else {
					await adapter.write(filePath, migration.content);
				}

				success++;
			} catch (error) {
				failed++;
				errors.push({
					uuid: filePath,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			type: "epub_markdown_source_id_backfill",
			success,
			failed,
			errors,
		};
	}

	// ===== 辅助方法 =====

	/**
	 * 检测卡片是否需要 YAML 迁移
	 */
	private cardNeedsYAMLMigration(card: Card): boolean {
		// 有旧字段但没有对应的 YAML 字段
		if (!card.content) return false;

		try {
			const yaml = parseYAMLFromContent(card.content);

			// 检查是否有旧字段但没有迁移到 YAML
			const hasOldSource = card.sourceFile || card.sourceBlock;
			const hasYAMLSource = yaml.we_source;

			const hasOldType = card.type;
			const hasYAMLType = yaml.we_type;

			return (hasOldSource && !hasYAMLSource) || (!!hasOldType && !hasYAMLType);
		} catch {
			return false;
		}
	}

	/**
	 * 检测卡片 we_decks 是否包含牌组ID
	 */
	private cardHasWeDecksId(card: Card): boolean {
		if (!card.content) return false;

		try {
			const yaml = parseYAMLFromContent(card.content);
			if (!yaml.we_decks || yaml.we_decks.length === 0) return false;

			// 检查是否有 deck_ 开头的值（牌组ID格式）
			return yaml.we_decks.some((value: string) => value.startsWith("deck_"));
		} catch {
			return false;
		}
	}

	private normalizeCardToSingleMemoryMembership(card: Card, decks: Deck[]): Card | null {
		if (!card.content) {
			return null;
		}

		try {
			const yaml = parseYAMLFromContent(card.content);
			if (!Array.isArray(yaml.we_decks) || yaml.we_decks.length === 0) {
				return null;
			}
			const normalizedEntries = keepSingleMemoryFormalDeck(yaml.we_decks, decks);
			const normalizedDeckNames = normalizedEntries.map((entry) => entry.deckName);
			const normalizedDeckIds = normalizedEntries.map((entry) => entry.deckId);
			const currentDeckId = typeof card.deckId === "string" ? card.deckId : undefined;
			const nextContent = setCardProperties(card.content || "", {
				we_decks: normalizedDeckNames.length > 0 ? normalizedDeckNames : undefined,
			});
			const contentChanged = nextContent !== (card.content || "");
			const deckIdChanged = (currentDeckId || undefined) !== (normalizedDeckIds[0] || undefined);

			if (!contentChanged && !deckIdChanged) {
				return null;
			}

			return {
				...card,
				content: nextContent,
				deckId: normalizedDeckIds[0],
				modified: new Date().toISOString(),
			};
		} catch {
			return null;
		}
	}

	/**
	 * 检测卡片是否有弃用字段
	 * 注意：只检测真正需要删除的字段，不检测派生字段
	 */
	private cardHasDeprecatedFields(card: Card): boolean {
		const cardAny = card as any;

		// 只检查需要删除的字段
		for (const field of DEPRECATED_FIELDS_TO_DELETE) {
			if (cardAny[field] !== undefined) return true;
		}

		return false;
	}

	/**
	 * 迁移卡片到 YAML 格式
	 */
	private migrateCardToYAML(card: Card): Card {
		const metadata: CardYAMLMetadata = {};

		// 迁移 sourceFile + sourceBlock -> we_source
		if (card.sourceFile) {
			const fileName = card.sourceFile.replace(/\.md$/, "");
			const blockId = card.sourceBlock?.replace(/^\^/, "");

			if (blockId) {
				metadata.we_source = `![[${fileName}#^${blockId}]]`;
			} else {
				metadata.we_source = `[[${fileName}]]`;
			}
		}

		// 迁移 type -> we_type
		if (card.type) {
			metadata.we_type = card.type as any;
		}

		// 迁移 priority -> we_priority
		if (card.priority !== undefined) {
			metadata.we_priority = card.priority;
		}

		// 迁移 tags
		if (card.tags && card.tags.length > 0) {
			metadata.tags = card.tags;
		}

		const newContent = setCardProperties(card.content, metadata);

		return {
			...card,
			content: newContent,
			modified: new Date().toISOString(),
		};
	}

	/**
	 * 修复卡片 we_decks 中的牌组ID
	 */
	private fixCardWeDecksId(card: Card, decks: Deck[]): Card | null {
		if (!card.content) return null;

		try {
			const yaml = parseYAMLFromContent(card.content);
			if (!yaml.we_decks || yaml.we_decks.length === 0) return null;

			const fixedDeckNames: string[] = [];
			let needsFix = false;

			for (const value of yaml.we_decks) {
				if (value.startsWith("deck_")) {
					needsFix = true;
					const matchedDeck = decks.find((d) => d.id === value);
					if (matchedDeck) {
						fixedDeckNames.push(matchedDeck.name);
					} else {
						logger.warn(`[DataManagement] 牌组ID "${value}" 找不到对应牌组，已移除`);
					}
				} else {
					fixedDeckNames.push(value);
				}
			}

			if (!needsFix) return null;

			// 无论 fixedDeckNames 是否为空，都需要更新 we_decks
			// 如果为空，表示所有牌组ID都找不到对应牌组，清空 we_decks
			// 使用 undefined 可以在 setCardProperties 中删除该字段
			const newContent = setCardProperties(card.content, {
				we_decks: fixedDeckNames.length > 0 ? fixedDeckNames : undefined,
			});

			return {
				...card,
				content: newContent,
				modified: new Date().toISOString(),
			};
		} catch (e) {
			logger.error(`[DataManagement] 修复 we_decks 失败: ${e}`);
			return null;
		}
	}

	/**
	 * 清理卡片中的弃用字段
	 */
	private cleanDeprecatedFields(card: Card): Card {
		const cleanedCard = { ...card } as any;

		// 删除需要删除的字段
		for (const field of DEPRECATED_FIELDS_TO_DELETE) {
			delete cleanedCard[field];
		}

		// 标记为已修改
		cleanedCard.modified = new Date().toISOString();

		return cleanedCard as Card;
	}

	// ===== 导入材料一致性检测 =====

	/**
	 * 检测导入材料一致性
	 *
	 * 检测项目:
	 * 1. materials.json 中记录的文件是否实际存在
	 * 2. legacy block 兼容内容块的源文件是否存在
	 * 3. IR牌组中的 blockIds 是否都有效
	 */
	private async checkIRMaterialConsistency(): Promise<DataCheckResult> {
		const issues: string[] = [];
		let materialIssues = 0;
		let orphanedBlocks = 0;
		const _orphanedDeckRefs = 0;

		try {
			// 1. 检测 IR Point 新材料层的一致性
			const pointStorageService = await this.getIRPointStorageService();
			if (pointStorageService?.inspectMaterialStorageConsistency) {
				const inspection = await pointStorageService.inspectMaterialStorageConsistency();
				materialIssues = inspection.issueCount;
				issues.push(...inspection.items);
			}

			// 2. 检测 IR 存储服务中的孤立 legacy block 内容块（只检测不清理）
			const irStorageService = await this.getIRStorageService();
			if (irStorageService) {
				// 检测孤立内容块（源文件已删除的内容块）
				const orphanedBlockIds = await irStorageService.findOrphanedBlocks();
				orphanedBlocks = orphanedBlockIds.length;
				if (orphanedBlocks > 0) {
					issues.push(`孤立内容块: ${orphanedBlocks} 个`);
				}
				// 注意: 检测模式不调用 validateAndCleanOrphanedReferences，避免自动清理
			}
		} catch (error) {
			logger.error("[DataManagement] 检测导入材料一致性失败:", error);
			issues.push(`检测失败: ${error instanceof Error ? error.message : String(error)}`);
		}

		const totalIssues = materialIssues + orphanedBlocks;

		return {
			type: "ir_material_consistency",
			status: totalIssues > 0 ? "warning" : "ok",
			count: totalIssues,
			items: issues,
			message:
				totalIssues > 0
					? `发现 ${totalIssues} 个一致性问题（点内溯源与旧残留: ${materialIssues}, legacy block 内容块: ${orphanedBlocks}）`
					: "增量阅读点溯源与导入材料数据一致",
		};
	}

	/**
	 * 修复导入材料一致性问题
	 *
	 * 修复操作:
	 * 1. 清理 materials.json 中的残留记录
	 * 2. 清理 legacy block 兼容视图中的孤立内容块
	 * 3. 清理 IR牌组中的无效引用
	 */
	private async fixIRMaterialConsistency(): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		try {
			// 1. 清理 IR Point 新材料层残留
			const pointStorageService = await this.getIRPointStorageService();
			if (pointStorageService?.cleanupMaterialStorageResidue) {
				const cleanup = await pointStorageService.cleanupMaterialStorageResidue();
				success +=
					cleanup.backfilledPointSourceCount +
					(cleanup.removedMissingTargetPointCount || 0) +
					cleanup.removedLegacyMaterialRecordCount +
					cleanup.removedLegacyMaterialsIndexCount +
					cleanup.removedLegacyMaterialsFileCount +
					cleanup.removedEmptyLegacyMaterialDirCount;
				failed += cleanup.failures.length;
				errors.push(
					...cleanup.failures.map((item: { id: string; message: string }) => ({
						uuid: item.id,
						error: item.message,
					}))
				);
			}

			// 2. 清理孤立内容块和牌组无效引用
			const irStorageService = await this.getIRStorageService();
			if (irStorageService) {
				// 清理孤立内容块（级联删除会自动清理牌组引用）
				const cleanedBlocks = await irStorageService.cleanOrphanedBlocks();
				success += cleanedBlocks;

				// 校验并清理牌组中的悬空引用
				const validationResult = await irStorageService.validateAndCleanOrphanedReferences();
				success += validationResult.orphanedBlockIds + validationResult.orphanedSourceFiles;
			}

			logger.info(`[DataManagement] 导入材料一致性修复完成: 成功 ${success}, 失败 ${failed}`);
		} catch (error) {
			logger.error("[DataManagement] 修复导入材料一致性失败:", error);
			failed++;
			errors.push({ uuid: "ir_material_consistency", error: String(error) });
		}

		return {
			type: "ir_material_consistency",
			success,
			failed,
			errors,
		};
	}

	// ===== 文件名云同步兼容性检测/修复 =====

	/**
	 * 检测文件名云同步兼容性问题
	 *
	 * 扫描 weave/ 数据目录下所有文件和子目录名称，检测：
	 * - Emoji 字符
	 * - 全角标点
	 * - 方括号 []
	 * - 超长路径
	 * - 无扩展名的标记文件
	 * - 其它不安全字符
	 */
	private async checkFilenameCompatibility(): Promise<DataCheckResult> {
		const issues: string[] = [];

		try {
			const adapter = this.plugin.app.vault.adapter as any;
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			const root = v2Paths.root;

			if (!(await adapter.exists(root))) {
				return {
					type: "filename_compatibility",
					status: "ok",
					count: 0,
					items: [],
					message: "数据目录不存在，无需检测",
				};
			}

			// 递归扫描目录（只检测每个路径的最后一段，避免重复计数）
			const scanDir = async (dir: string, depth: number): Promise<void> => {
				if (depth > 8) return;
				try {
					const listing = await adapter.list(dir);
					const files: string[] = listing?.files || [];
					const folders: string[] = listing?.folders || [];

					for (const filePath of files) {
						const fileName = filePath.split("/").pop() || "";
						if (!fileName) continue;
						const diag = diagnoseFilename(fileName, true, filePath.length);
						const fixableIssues = diag.issues.filter((_i) => _i !== "path_too_long");
						if (fixableIssues.length > 0) {
							const issueLabels = fixableIssues.map((i) => this.getSyncIssueLabel(i)).join(", ");
							issues.push(`${filePath} [${issueLabels}]`);
						}
					}

					for (const folderPath of folders) {
						const folderName = folderPath.split("/").pop() || "";
						if (folderName) {
							const diag = diagnoseFilename(folderName, false, folderPath.length);
							const fixableIssues = diag.issues.filter((_i) => _i !== "path_too_long");
							if (fixableIssues.length > 0) {
								const issueLabels = fixableIssues.map((i) => this.getSyncIssueLabel(i)).join(", ");
								issues.push(`${folderPath}/ [${issueLabels}]`);
							}
						}
						await scanDir(folderPath, depth + 1);
					}
				} catch (error) {
					logger.debug(`[DataManagement] 扫描目录失败: ${dir}`, error);
				}
			};

			await scanDir(root, 0);
		} catch (error) {
			logger.error("[DataManagement] 文件名兼容性检测失败:", error);
			issues.push(`检测失败: ${error instanceof Error ? error.message : String(error)}`);
		}

		return {
			type: "filename_compatibility",
			status: issues.length > 0 ? "warning" : "ok",
			count: issues.length,
			items: issues.slice(0, 50),
			message:
				issues.length > 0
					? `发现 ${issues.length} 个文件/目录名不兼容云同步`
					: "文件名均兼容云同步",
		};
	}

	/**
	 * 修复文件名云同步兼容性问题
	 *
	 * 对不兼容的文件/目录执行安全重命名
	 */
	private async fixFilenameCompatibility(): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];
		const appliedRules: PathRewriteRule[] = [];

		try {
			const adapter = this.plugin.app.vault.adapter as any;
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			const root = v2Paths.root;

			if (!(await adapter.exists(root))) {
				return { type: "filename_compatibility", success: 0, failed: 0, errors: [] };
			}

			// 收集需要重命名的路径（只检测最后一段名称，保持父路径不变）
			const fileRenames: Array<{ oldPath: string; newPath: string }> = [];
			const folderRenames: Array<{ oldPath: string; newPath: string; depth: number }> = [];

			const scanDir = async (dir: string, depth: number): Promise<void> => {
				if (depth > 8) return;
				try {
					const listing = await adapter.list(dir);
					const files: string[] = listing?.files || [];
					const folders: string[] = listing?.folders || [];

					for (const filePath of files) {
						const segments = filePath.split("/");
						const fileName = segments[segments.length - 1];
						if (!fileName) continue;
						const diag = diagnoseFilename(fileName, true, filePath.length);
						const fixableIssues = diag.issues.filter((_i) => _i !== "path_too_long");
						if (fixableIssues.length > 0) {
							// 只替换最后一段，保持父路径不变
							const parentPath = segments.slice(0, -1).join("/");
							const newPath = parentPath ? `${parentPath}/${diag.suggested}` : diag.suggested;
							fileRenames.push({ oldPath: filePath, newPath });
						}
					}

					for (const folderPath of folders) {
						// 先递归子目录（深层先处理）
						await scanDir(folderPath, depth + 1);

						const segments = folderPath.split("/");
						const folderName = segments[segments.length - 1];
						if (!folderName) continue;
						const diag = diagnoseFilename(folderName, false, folderPath.length);
						const fixableIssues = diag.issues.filter((_i) => _i !== "path_too_long");
						if (fixableIssues.length > 0) {
							const parentPath = segments.slice(0, -1).join("/");
							const newPath = parentPath ? `${parentPath}/${diag.suggested}` : diag.suggested;
							folderRenames.push({ oldPath: folderPath, newPath, depth });
						}
					}
				} catch (error) {
					logger.debug(`[DataManagement] 扫描目录失败: ${dir}`, error);
				}
			};

			await scanDir(root, 0);

			// 1. 先重命名文件（文件重命名不影响其他路径）
			for (const item of fileRenames) {
				try {
					if (await adapter.exists(item.newPath)) {
						logger.warn(`[DataManagement] 目标路径已存在，跳过: ${item.newPath}`);
						errors.push({ uuid: item.oldPath, error: `目标路径已存在: ${item.newPath}` });
						failed++;
						continue;
					}
					await adapter.rename(item.oldPath, item.newPath);
					appliedRules.push({ from: item.oldPath, to: item.newPath });
					success++;
					logger.info(`[DataManagement] 重命名文件: ${item.oldPath} → ${item.newPath}`);
				} catch (error) {
					failed++;
					errors.push({ uuid: item.oldPath, error: String(error) });
					logger.warn(`[DataManagement] 重命名文件失败: ${item.oldPath}`, error);
				}
			}

			// 2. 再重命名目录（按深度从深到浅，避免父目录先改名导致子路径失效）
			folderRenames.sort((a, b) => b.depth - a.depth);
			for (const item of folderRenames) {
				try {
					if (await adapter.exists(item.newPath)) {
						logger.warn(`[DataManagement] 目标路径已存在，跳过: ${item.newPath}`);
						errors.push({ uuid: item.oldPath, error: `目标路径已存在: ${item.newPath}` });
						failed++;
						continue;
					}
					await adapter.rename(item.oldPath, item.newPath);
					appliedRules.push({ from: item.oldPath, to: item.newPath });
					success++;
					logger.info(`[DataManagement] 重命名目录: ${item.oldPath} → ${item.newPath}`);
				} catch (error) {
					failed++;
					errors.push({ uuid: item.oldPath, error: String(error) });
					logger.warn(`[DataManagement] 重命名目录失败: ${item.oldPath}`, error);
				}
			}

			if (appliedRules.length > 0) {
				await rewriteKnownPathReferences(
					this.plugin.app,
					buildKnownPathReferenceFiles({
						v2Paths,
						pluginPaths: getPluginPaths(this.plugin.app),
					}),
					appliedRules
				);
			}

			if (success > 0) {
				logger.info(`[DataManagement] 文件名兼容性修复完成: 成功 ${success}, 失败 ${failed}`);
			}
		} catch (error) {
			logger.error("[DataManagement] 文件名兼容性修复失败:", error);
			failed++;
			errors.push({ uuid: "filename_compatibility", error: String(error) });
		}

		return {
			type: "filename_compatibility",
			success,
			failed,
			errors,
		};
	}

	/**
	 * 获取同步问题类型的中文标签
	 */
	private getSyncIssueLabel(type: SyncIssueType): string {
		const labels: Record<SyncIssueType, string> = {
			emoji: "Emoji",
			fullwidth_punctuation: "全角标点",
			square_brackets: "方括号",
			path_too_long: "路径过长",
			no_extension: "无扩展名",
			unsafe_chars: "不安全字符",
			leading_dot: "点开头",
		};
		return labels[type] || type;
	}

	/**
	 * 获取IR存储服务实例
	 */
	private async getIRStorageService(): Promise<any> {
		try {
			// 直接导入并创建IR存储服务实例
			const { IRStorageService } = await import("../incremental-reading/IRStorageService");
			const storageService = new IRStorageService(this.plugin.app);
			await storageService.initialize();
			return storageService;
		} catch (error) {
			logger.debug("[DataManagement] 无法获取IR存储服务:", error);
			return null;
		}
	}

	private async getIRPointStorageService(): Promise<any> {
		try {
			const { IRPointStorageService } = await import(
				"../incremental-reading/IRPointStorageService"
			);
			const service = new IRPointStorageService(this.plugin.app);
			await service.initialize();
			return service;
		} catch (error) {
			logger.debug("[DataManagement] 无法获取 IR Point 存储服务:", error);
			return null;
		}
	}

	private async getIRPointDataReadService(): Promise<IRPointDataReadService | null> {
		try {
			const service = new IRPointDataReadService(this.plugin.app);
			await service.initialize();
			return service;
		} catch (error) {
			logger.debug("[DataManagement] 无法获取 IR Point 数据读取服务:", error);
			return null;
		}
	}

	private async getIRTagGroupService(): Promise<any> {
		try {
			const { IRTagGroupService } = await import("../incremental-reading/IRTagGroupService");
			const service = new IRTagGroupService(this.plugin.app);
			await service.initialize();
			return service;
		} catch (error) {
			logger.debug("[DataManagement] 无法获取 IR 标签组服务:", error);
			return null;
		}
	}

	private getEpubStorageService(): EpubStorageService {
		return new EpubStorageService(this.plugin.app);
	}

	private getIRLocalStateRelocationPaths() {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const pluginPaths = getPluginPaths(this.plugin.app);
		return [
			{
				label: "文件同步状态缓存",
				legacyPath: `${v2Paths.ir.root}/sync-state.json`,
				targetPath: pluginPaths.cache.incrementalReading.syncState,
				rebuildable: true,
			},
			{
				label: "文档标签组映射缓存",
				legacyPath: v2Paths.ir.documentGroupMap,
				targetPath: pluginPaths.cache.incrementalReading.documentGroupMap,
				rebuildable: true,
			},
			{
				label: "增量阅读监控分析",
				legacyPath: `${v2Paths.ir.root}/monitoring.json`,
				targetPath: pluginPaths.state.incrementalReading.monitoring,
				rebuildable: false,
			},
			{
				label: "增量阅读历史",
				legacyPath: v2Paths.ir.history,
				targetPath: pluginPaths.state.incrementalReading.history,
				rebuildable: false,
			},
			{
				label: "增量阅读学习会话",
				legacyPath: v2Paths.ir.studySessions,
				targetPath: pluginPaths.state.incrementalReading.studySessions,
				rebuildable: false,
			},
			{
				label: "增量阅读月历进度",
				legacyPath: v2Paths.ir.calendarProgress,
				targetPath: pluginPaths.state.incrementalReading.calendarProgress,
				rebuildable: false,
			},
		] as const;
	}

	private async inspectIRStructuredLocalStateRelocation(): Promise<{
		legacyFiles: Array<{ label: string; legacyPath: string; targetPath: string; rebuildable: boolean }>;
	}> {
		const adapter = this.plugin.app.vault.adapter;
		const legacyFiles: Array<{
			label: string;
			legacyPath: string;
			targetPath: string;
			rebuildable: boolean;
		}> = [];

		for (const entry of this.getIRLocalStateRelocationPaths()) {
			if (await adapter.exists(entry.legacyPath)) {
				legacyFiles.push({ ...entry });
			}
		}

		return { legacyFiles };
	}

	private async relocateIRStructuredLocalStateFile(options: {
		label: string;
		legacyPath: string;
		targetPath: string;
		rebuildable: boolean;
		cleanupLegacyFile?: boolean;
	}): Promise<{
		migratedFileCount: number;
		removedLegacyFileCount: number;
		remainingLegacyFiles: string[];
		failures: Array<{ path: string; message: string }>;
	}> {
		const adapter = this.plugin.app.vault.adapter;
		const cleanupLegacyFile = options.cleanupLegacyFile === true;
		const failures: Array<{ path: string; message: string }> = [];
		let migratedFileCount = 0;
		let removedLegacyFileCount = 0;

		if (!(await adapter.exists(options.legacyPath))) {
			return {
				migratedFileCount,
				removedLegacyFileCount,
				remainingLegacyFiles: [],
				failures,
			};
		}

		let targetReady = await adapter.exists(options.targetPath);
		if (!targetReady) {
			const parsed = await safeReadJson<unknown>(
				adapter as any,
				options.legacyPath,
				this.plugin.app as any
			);
			if (parsed !== null) {
				try {
					await DirectoryUtils.ensureDirForFile(adapter as any, options.targetPath);
					await safeWriteJson(
						adapter as any,
						options.targetPath,
						JSON.stringify(parsed, null, 2),
						this.plugin.app as any
					);
					targetReady = true;
					migratedFileCount += 1;
				} catch (error) {
					failures.push({
						path: options.legacyPath,
						message: `${options.label} 写入插件本地目录失败: ${
							error instanceof Error ? error.message : String(error)
						}`,
					});
				}
			} else if (!options.rebuildable) {
				failures.push({
					path: options.legacyPath,
					message: `${options.label} 内容无效，无法安全迁移到插件目录`,
				});
			}
		}

		if (cleanupLegacyFile && (targetReady || options.rebuildable)) {
			try {
				if (await adapter.exists(options.legacyPath)) {
					await adapter.remove(options.legacyPath);
					removedLegacyFileCount += 1;
				}
			} catch (error) {
				failures.push({
					path: options.legacyPath,
					message: `${options.label} 清理旧文件失败: ${
						error instanceof Error ? error.message : String(error)
					}`,
				});
			}
		}

		return {
			migratedFileCount,
			removedLegacyFileCount,
			remainingLegacyFiles: (await adapter.exists(options.legacyPath)) ? [options.legacyPath] : [],
			failures,
		};
	}

	/**
	 * 获取检测类型的中文名称
	 */
	private getCheckName(type: CheckType): string {
		if (type === "wdeck_migration") {
			return ".wdeck 牌组文件迁移";
		}

		const names: Partial<Record<CheckType, string>> = {
			yaml_migration: "YAML 元数据迁移",
			we_decks_fix: "we_decks 牌组ID",
			structured_data_format: "结构化数据文件格式修复",
			memory_single_membership: "记忆牌组单归属",
			we_block_migration: "we_block 合并迁移",
			epub_source_link_migration: "EPUB 溯源链接迁移",
			epub_markdown_source_id_backfill: "EPUB Markdown sourceId 回填",
			deprecated_fields: "弃用字段",
			ir_redundant_frontmatter_cleanup: "增量阅读历史 frontmatter 清理（临时）",
			card_deck_consistency: "牌组缓存一致性",
			ir_material_consistency: "导入材料一致性",
			ir_point_storage_migration: "增量阅读新存储迁移",
			ir_legacy_readable_markdown_migration: "旧 IR 正文迁移",
			ir_local_state_relocation: "增量阅读本地状态迁移",
			ir_legacy_bookmark_cleanup: "增量阅读旧书签文件清理",
			orphan_cards: "孤立卡片",
			duplicate_cards: "重复卡片",
			invalid_refs: "无效引用",
			schema_migration: "Schema V2 数据迁移",
			structure_check: "目录结构核对",
			qbank_migration: ".qbank 考试题组迁移",
			qbank_legacy_cleanup: "旧题库文件清理",
			migration_conflict_files: "迁移冲突文件",
			legacy_cleanup: "旧目录清理",
			filename_compatibility: "文件名云同步兼容性",
			sync_conflict_files: "云同步冲突副本",
			progressive_cloze_unconverted: "未转换的渐进式挖空",
			progressive_cloze_orphan: "孤儿子卡片",
			progressive_cloze_missing_children: "缺失的子卡片",
			progressive_cloze_extra_children: "多余的子卡片",
		};
		return names[type] || type;
	}

	// ===== 统一数据迁移相关 =====

	async getLatestMigrationPlan(): Promise<DataMigrationPlan | null> {
		return this.getMigrationService().getLatestPlan();
	}

	async getLatestMigrationReport(): Promise<DataMigrationReport | null> {
		return this.getMigrationService().getLatestReport();
	}

	private getMigrationConflictKind(fileName: string): {
		label: string;
		autoRecoverable: boolean;
	} {
		if (/weave_memory_cards_.*\.json-\d+$/.test(fileName)) {
			return {
				label: "记忆卡片迁移冲突副本",
				autoRecoverable: true,
			};
		}

		if (/weave_memory_decks\.json-\d+$/.test(fileName)) {
			return {
				label: "记忆牌组迁移冲突副本",
				autoRecoverable: true,
			};
		}

		if (/weave_incremental-reading_monitoring\.json-\d+$/.test(fileName)) {
			return {
				label: "增量阅读监控迁移冲突副本",
				autoRecoverable: true,
			};
		}

		if (/weave_incremental-reading_.*\.json-\d+$/.test(fileName)) {
			return {
				label: "增量阅读迁移冲突副本",
				autoRecoverable: true,
			};
		}

		if (/weave_question-bank_.*\.json-\d+$/.test(fileName)) {
			return {
				label: "题库迁移冲突副本",
				autoRecoverable: true,
			};
		}

		if (/weave_.*-\d+$/.test(fileName)) {
			return {
				label: "Weave 数据迁移冲突副本",
				autoRecoverable: false,
			};
		}

		return {
			label: "未知类型迁移冲突副本",
			autoRecoverable: false,
		};
	}

	private async listMigrationConflictFiles(): Promise<
		Array<{
			path: string;
			fileName: string;
			label: string;
			autoRecoverable: boolean;
		}>
	> {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const conflictDir = `${v2Paths.root}/_migration_conflicts`;
		const adapter = this.plugin.app.vault.adapter;

		if (!(await adapter.exists(conflictDir))) {
			return [];
		}

		const listing = await adapter.list(conflictDir);
		return (listing.files || []).sort().map((filePath) => {
			const fileName = filePath.split("/").pop() || filePath;
			const kind = this.getMigrationConflictKind(fileName);
			return {
				path: filePath,
				fileName,
				label: kind.label,
				autoRecoverable: kind.autoRecoverable,
			};
		});
	}

	async checkMigrationConflictFiles(): Promise<DataCheckResult> {
		try {
			const files = await this.listMigrationConflictFiles();
			const autoRecoverable = files.filter((file) => file.autoRecoverable);
			const manualReview = files.filter((file) => !file.autoRecoverable);

			return {
				type: "migration_conflict_files",
				status: manualReview.length > 0 ? "error" : files.length > 0 ? "warning" : "ok",
				count: files.length,
				items: files.map((file) =>
					`${file.autoRecoverable ? "[可自动处理]" : "[需人工处理]"} ${file.path}`
				),
				message:
					files.length === 0
						? "未发现迁移冲突文件"
						: `检测到 ${files.length} 个迁移冲突文件（可自动处理 ${autoRecoverable.length}，需人工处理 ${manualReview.length}）`,
			};
		} catch (error) {
			return {
				type: "migration_conflict_files",
				status: "error",
				count: 0,
				items: [],
				message: `迁移冲突检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private async fixMigrationConflictFiles(): Promise<DataFixResult> {
		const before = await this.listMigrationConflictFiles();
		if (before.length === 0) {
			return {
				type: "migration_conflict_files",
				success: 0,
				failed: 0,
				errors: [],
			};
		}

		const recovery = await this.recoverMigrationConflictData();
		const after = await this.listMigrationConflictFiles();
		const beforeByPath = new Map(before.map((file) => [file.path, file]));
		const errors: Array<{ uuid: string; error: string }> = recovery.errors.map((error) => ({
			uuid: "",
			error,
		}));

		for (const file of after) {
			const original = beforeByPath.get(file.path) || file;
			errors.push({
				uuid: file.path,
				error: original.autoRecoverable
					? "自动归并后仍残留，请检查该文件是否损坏。"
					: "该迁移冲突文件暂不支持自动处理，请人工复核。",
			});
		}

		return {
			type: "migration_conflict_files",
			success: Math.max(before.length - after.length, 0),
			failed: errors.length,
			errors,
		};
	}

	async planUnifiedMigration(
		requestedParentFolder?: string,
		reason: "startup-auto" | "manual-review" | "change-parent-folder" = "manual-review"
	): Promise<DataMigrationPlan> {
		return this.getMigrationService().planDataMigration({
			requestedParentFolder,
			reason,
		});
	}

	/**
	 * 检测是否需要统一数据迁移
	 */
	async checkSchemaMigration(): Promise<DataCheckResult> {
		try {
			const plan = await this.planUnifiedMigration(undefined, "manual-review");
			const schemaV2Service = new SchemaV2MigrationService(this.plugin.app);
			const needsSchemaV2Migration = await schemaV2Service.needsMigration({
				allowWhenSchemaUpToDate: true,
			});
			const legacyFolderMigrations = await this.inspectLegacyWeaveFolderMigration();
			const items = [
				...plan.activeSourceRoots.map((root) => `${root.kind}: ${root.path}`),
				...(needsSchemaV2Migration ? ["schema-v2: 检测到旧版本数据结构"] : []),
				...legacyFolderMigrations.map(
					(item) => `${item.label}: ${item.legacyPath} -> ${item.targetPath}`
				),
			];

			return {
				type: "schema_migration",
				status: items.length > 0 ? "warning" : "ok",
				count: items.length,
				items,
				message: items.length > 0 ? "发现需要执行的真源数据迁移/归位任务" : "数据目录结构已是最新版本",
			};
		} catch (error) {
			logger.error("[DataManagement] 统一数据迁移检测失败:", error);
			return {
				type: "schema_migration",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * 执行统一数据迁移
	 */
	async executeSchemaMigration(
		options: SchemaMigrationExecutionOptions = {}
	): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"schema_migration",
				"数据迁移会移动真实用户数据，必须在明确确认后执行。"
			);
		}

		try {
			const migrationService = this.getMigrationService();
			const plan = await migrationService.planDataMigration({ reason: "manual-review" });
			const schemaV2Service = new SchemaV2MigrationService(this.plugin.app);
			const legacyFolderMigrations = await this.inspectLegacyWeaveFolderMigration();
			const errors: Array<{ uuid: string; error: string }> = [];
			let success = 0;
			let failed = 0;

			if (plan.requiresMigration) {
				const result = await migrationService.executeDataMigration(plan);
				success += result.movedFiles + result.rewrittenReferences;
				failed += result.errors.length;
				errors.push(...result.errors.map((error) => ({ uuid: "", error })));
			}

			const needsSchemaV2Migration = await schemaV2Service.needsMigration({
				allowWhenSchemaUpToDate: true,
			});
			if (needsSchemaV2Migration) {
				const schemaV2Result = await schemaV2Service.migrate();
				success += schemaV2Result.migratedCount;
				failed += schemaV2Result.failedCount;
				errors.push(
					...schemaV2Result.errors.map((error) => ({
						uuid: "",
						error,
					}))
				);
			}

			if (legacyFolderMigrations.length > 0) {
				await migrateLegacyWeaveFolders(this.plugin.app, this.plugin.settings?.weaveParentFolder);
				success += legacyFolderMigrations.length;
			}

			await this.plugin.saveSettings();

			return {
				type: "schema_migration",
				success,
				failed,
				errors,
			};
		} catch (error) {
			logger.error("[DataManagement] 统一数据迁移执行失败:", error);
			return {
				type: "schema_migration",
				success: 0,
				failed: 1,
				errors: [{ uuid: "", error: error instanceof Error ? error.message : String(error) }],
			};
		}
	}

	async getLatestIRPointStorageMigrationReport(): Promise<{
		status: "completed" | "failed";
		summary: {
			structureVersion: number;
			targetRoot: string;
			migratedMaterials: number;
			migratedPoints: number;
			migratedReaderStateFiles: number;
			removedLegacyReaderStateFiles: number;
			removedLegacyBookmarkTaskFiles: number;
			removedLegacyChunkStorageFiles: number;
			removedLegacyMaterialRecordFiles: number;
			removedLegacyMaterialsIndexCount: number;
			removedLegacyMaterialsFileCount: number;
			removedEmptyLegacyMaterialDirs: number;
			removedLegacyRegistryFiles: number;
			failures: Array<{ id: string; type: string; message: string }>;
			completedAt: string;
		};
	} | null> {
		const service = await this.getIRPointDataReadService();
		if (!service) {
			return null;
		}
		return service.getLatestMigrationReport();
	}

	private async pathExistsOrHasEntries(path: string): Promise<boolean> {
		const adapter: any = this.plugin.app.vault.adapter as any;

		try {
			if (await adapter.exists?.(path)) {
				return true;
			}
		} catch {}

		if (typeof adapter.list !== "function") {
			return false;
		}

		try {
			const listing = await adapter.list(path);
			return Boolean((listing?.files?.length || 0) > 0 || (listing?.folders?.length || 0) > 0);
		} catch {
			return false;
		}
	}

	private async inspectLegacyWeaveFolderMigration(): Promise<
		Array<{ label: string; legacyPath: string; targetPath: string }>
	> {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const readableRoot = getReadableWeaveRoot(parentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const candidates = [
			{
				label: "deck-graphs",
				legacyPath: normalizePath(`${readableRoot}/deck-graphs`),
				targetPath: normalizePath(v2Paths.memory.knowledgeGraphs),
			},
			{
				label: "epub-reading",
				legacyPath: normalizePath(`${readableRoot}/epub-reading`),
				targetPath: normalizePath(v2Paths.ir.epub),
			},
		];

		const pending: Array<{ label: string; legacyPath: string; targetPath: string }> = [];
		for (const candidate of candidates) {
			if (
				candidate.legacyPath &&
				candidate.legacyPath !== candidate.targetPath &&
				(await this.pathExistsOrHasEntries(candidate.legacyPath))
			) {
				pending.push(candidate);
			}
		}

		return pending;
	}

	private getLegacyIRReadableMarkdownRoot(): string {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		return getLegacyIRImportFolder(parentFolder);
	}

	private async collectMarkdownFilesRecursively(rootPath: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		if (rootPath && !(await adapter.exists(rootPath))) {
			return [];
		}

		const files: string[] = [];
		const walk = async (dir: string): Promise<void> => {
			const listing = await adapter.list(dir);
			for (const folder of listing.folders || []) {
				await walk(folder);
			}
			for (const file of listing.files || []) {
				if (file.toLowerCase().endsWith(".md")) {
					files.push(file);
				}
			}
		};

		await walk(rootPath);
		return files.sort((left, right) => left.localeCompare(right, "zh-CN"));
	}

	private async listVaultMarkdownPaths(): Promise<string[]> {
		const rawConfigDir = String(this.plugin.app.vault?.configDir || "").trim();
		const configDirPrefix = rawConfigDir ? `${normalizePath(rawConfigDir)}/` : "";
		if (typeof this.plugin.app.vault?.getMarkdownFiles === "function") {
			return this.plugin.app.vault
				.getMarkdownFiles()
				.map((file: { path?: string }) => normalizePath(String(file?.path || "").trim()))
				.filter((path: string) => path.length > 0 && (!configDirPrefix || !path.startsWith(configDirPrefix)))
				.sort((left: string, right: string) => left.localeCompare(right, "zh-CN"));
		}

		return (await this.collectMarkdownFilesRecursively(""))
			.map((path) => normalizePath(path))
			.filter((path) => path.length > 0 && (!configDirPrefix || !path.startsWith(configDirPrefix)));
	}

	private getLegacyIRFrontmatterFields(content: string): string[] {
		try {
			const yaml = parseYAMLFromContent(content) as Record<string, unknown>;
			return LEGACY_IR_FRONTMATTER_FIELDS.filter((field) => yaml[field] !== undefined);
		} catch {
			return [];
		}
	}

	private async checkIRRedundantFrontmatterCleanup(): Promise<DataCheckResult> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const items: string[] = [];
			for (const filePath of await this.listVaultMarkdownPaths()) {
				const content = await adapter.read(filePath);
				const fields = this.getLegacyIRFrontmatterFields(content);
				if (fields.length === 0) {
					continue;
				}
				items.push(`${filePath} -> ${fields.join(", ")}`);
			}

			return {
				type: "ir_redundant_frontmatter_cleanup",
				status: items.length > 0 ? "warning" : "ok",
				count: items.length,
				items,
				message:
					items.length > 0
						? `发现 ${items.length} 个 Markdown 文件仍含历史遗留的增量阅读 frontmatter 字段。这是临时批量处理项，因插件已不再写入这些多余字段，后续会移除。`
						: "未发现需要清理的增量阅读历史 frontmatter 遗留字段",
			};
		} catch (error) {
			return {
				type: "ir_redundant_frontmatter_cleanup",
				status: "error",
				count: 0,
				items: [],
				message: `增量阅读历史 frontmatter 检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private async fixIRRedundantFrontmatterCleanup(): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		for (const filePath of await this.listVaultMarkdownPaths()) {
			try {
				const adapter = this.plugin.app.vault.adapter;
				const content = await adapter.read(filePath);
				const fields = this.getLegacyIRFrontmatterFields(content);
				if (fields.length === 0) {
					continue;
				}

				const abstractFile = this.plugin.app.vault.getAbstractFileByPath(filePath) as TFile | null;
				if (
					!abstractFile ||
					typeof this.plugin.app.fileManager?.processFrontMatter !== "function"
				) {
					throw new Error("无法安全访问 Obsidian frontmatter 处理接口");
				}

				await this.plugin.app.fileManager.processFrontMatter(
					abstractFile,
					(frontmatter: Record<string, unknown>) => {
						for (const field of fields) {
							delete frontmatter[field];
						}
					}
				);
				success += 1;
			} catch (error) {
				failed += 1;
				errors.push({
					uuid: filePath,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			type: "ir_redundant_frontmatter_cleanup",
			success,
			failed,
			errors,
		};
	}

	private isLegacyIRDeletedReadableMarkdown(content: string): boolean {
		try {
			const yaml = parseYAMLFromContent(content) as Record<string, unknown> | null;
			const normalizedTags = new Set(
				(
					Array.isArray(yaml?.tags)
						? yaml.tags
						: typeof yaml?.tags === "string"
							? String(yaml.tags)
									.split(",")
									.map((tag) => tag.trim())
							: []
				)
					.map((tag) => String(tag || "").trim().replace(/^#/, "").toLowerCase())
					.filter(Boolean)
			);

			if (normalizedTags.has("we_已删除") || normalizedTags.has("we_deleted")) {
				return true;
			}
		} catch {}

		return (
			/(^|\s)#we_已删除(?=\s|$)/m.test(content) || /(^|\s)#we_deleted(?=\s|$)/im.test(content)
		);
	}

	private isLegacyIRSystemMarkdownFile(filePath: string, content: string): boolean {
		const normalizedPath = normalizePath(filePath);
		const fileName = normalizedPath.split("/").pop()?.toLowerCase() || "";
		if (!fileName.endsWith(".md")) {
			return true;
		}

		if (fileName.startsWith("_")) {
			return true;
		}

		if (
			normalizedPath.includes("/raw/") ||
			normalizedPath.includes("/sources/") ||
			normalizedPath.includes("/chunks/")
		) {
			return true;
		}

		if (this.isLegacyIRDeletedReadableMarkdown(content)) {
			return true;
		}

		try {
			const yaml = parseYAMLFromContent(content) as Record<string, unknown> | null;
			const weaveType = typeof yaml?.weave_type === "string" ? String(yaml.weave_type).trim() : "";
			if (weaveType.startsWith("ir-")) {
				return true;
			}
		} catch {}

		return false;
	}

	private inspectLegacyIRReadableMarkdownTargetRoot(): {
		targetRoot: string;
		blockedReason?: string;
	} {
		const legacyRoot = this.getLegacyIRReadableMarkdownRoot();
		const targetRoot =
			resolveObsidianDefaultNewNoteFolder(this.plugin.app, {
				allowActiveFileFallback: false,
			}) || "/";
		const normalizedTargetRoot = targetRoot === "/" ? "/" : normalizePath(targetRoot);
		const normalizedLegacyRoot = normalizePath(legacyRoot);

		if (
			normalizedTargetRoot === normalizedLegacyRoot ||
			normalizedTargetRoot.startsWith(`${normalizedLegacyRoot}/`)
		) {
			return {
				targetRoot,
				blockedReason:
					"当前 Obsidian 默认新建笔记位置仍指向旧 IR 目录，请先调整 Obsidian 的新建笔记默认位置后再执行迁移。",
			};
		}

		return { targetRoot };
	}

	private async inspectLegacyIRReadableMarkdownMigration(): Promise<{
		legacyRoot: string;
		targetRoot: string;
		files: string[];
		blockedReason?: string;
	}> {
		const adapter = this.plugin.app.vault.adapter;
		const legacyRoot = this.getLegacyIRReadableMarkdownRoot();
		const { targetRoot, blockedReason } = this.inspectLegacyIRReadableMarkdownTargetRoot();
		if (!(await adapter.exists(legacyRoot))) {
			return { legacyRoot, targetRoot, files: [], blockedReason };
		}

		const readableMarkdownFiles: string[] = [];
		for (const filePath of await this.collectMarkdownFilesRecursively(legacyRoot)) {
			try {
				const content = await adapter.read(filePath);
				if (!this.isLegacyIRSystemMarkdownFile(filePath, content)) {
					readableMarkdownFiles.push(normalizePath(filePath));
				}
			} catch (error) {
				logger.warn(`[DataManagement] 读取旧 IR 正文失败: ${filePath}`, error);
			}
		}

		return {
			legacyRoot,
			targetRoot,
			files: readableMarkdownFiles,
			blockedReason,
		};
	}

	private getLegacyIRReadableMarkdownTargetFolder(
		legacyRoot: string,
		targetRoot: string,
		sourcePath: string
	): string {
		const normalizedLegacyRoot = normalizePath(legacyRoot);
		const normalizedSourcePath = normalizePath(sourcePath);
		const relativePath = normalizedSourcePath.startsWith(`${normalizedLegacyRoot}/`)
			? normalizedSourcePath.slice(normalizedLegacyRoot.length + 1)
			: normalizedSourcePath;
		const relativeDir = relativePath.includes("/")
			? relativePath.slice(0, relativePath.lastIndexOf("/"))
			: "";

		if (!relativeDir) {
			return targetRoot;
		}

		return targetRoot === "/" ? relativeDir : normalizePath(`${targetRoot}/${relativeDir}`);
	}

	private async renameVaultMarkdownFileWithLinkSupport(
		sourcePath: string,
		targetPath: string
	): Promise<void> {
		const adapter = this.plugin.app.vault.adapter as any;
		await DirectoryUtils.ensureDirForFile(adapter, targetPath);

		const abstractFile = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
		const fileManager = this.plugin.app.fileManager as
			| { renameFile?: (file: unknown, newPath: string) => Promise<void> }
			| undefined;
		if (abstractFile && typeof fileManager?.renameFile === "function") {
			await fileManager.renameFile(abstractFile, targetPath);
			return;
		}

		const vault = this.plugin.app.vault as { rename?: (file: unknown, newPath: string) => Promise<void> };
		if (abstractFile && typeof vault.rename === "function") {
			await vault.rename(abstractFile, targetPath);
			return;
		}

		const content = await adapter.read(sourcePath);
		await adapter.write(targetPath, content);
		await adapter.remove(sourcePath);
	}

	private async rewriteIRPointStoragePathReferences(rules: PathRewriteRule[]): Promise<number> {
		const normalizedRules = rules.filter((rule) => rule.from && rule.to && rule.from !== rule.to);
		if (normalizedRules.length === 0) {
			return 0;
		}

		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const adapter = this.plugin.app.vault.adapter as any;
		if (!(await adapter.exists(v2Paths.ir.pointFilesIndex))) {
			return 0;
		}

		let rewrittenCount = 0;
		try {
			const rawIndex = await adapter.read(v2Paths.ir.pointFilesIndex);
			const parsedIndex = JSON.parse(rawIndex) as { files?: Array<{ file?: string }> };
			for (const entry of parsedIndex.files || []) {
				const relativePath = String(entry?.file || "").trim();
				if (!relativePath) {
					continue;
				}

				const absolutePath = normalizePath(`${v2Paths.ir.root}/${relativePath}`);
				if (!(await adapter.exists(absolutePath))) {
					continue;
				}

				const raw = await adapter.read(absolutePath);
				const parsed = JSON.parse(raw);
				const result = rewriteJsonWithRules(parsed, normalizedRules);
				if (!result.changed) {
					continue;
				}

				await adapter.write(absolutePath, JSON.stringify(result.value, null, 2));
				rewrittenCount += result.count;
			}
		} catch (error) {
			logger.warn("[DataManagement] 回写 IR point 文件路径引用失败:", error);
		}

		return rewrittenCount;
	}

	async checkIRLegacyReadableMarkdownMigration(): Promise<DataCheckResult> {
		try {
			const inspection = await this.inspectLegacyIRReadableMarkdownMigration();
			if (inspection.files.length === 0) {
				return {
					type: "ir_legacy_readable_markdown_migration",
					status: "ok",
					count: 0,
					items: [],
					message: "旧 IR 正文目录中没有待迁移的 Markdown 文件",
				};
			}

			const items = [
				`旧正文目录: ${inspection.legacyRoot}`,
				`迁移目标: ${inspection.targetRoot}`,
				...inspection.files,
			];
			return {
				type: "ir_legacy_readable_markdown_migration",
				status: inspection.blockedReason ? "error" : "warning",
				count: inspection.files.length,
				items,
				message: inspection.blockedReason
					? `检测到 ${inspection.files.length} 个旧 IR 正文文件，但当前迁移目标无效：${inspection.blockedReason}`
					: `检测到 ${inspection.files.length} 个旧 IR 正文文件，可通过数据管理显式迁移到当前 Obsidian 默认新建笔记目录`,
			};
		} catch (error) {
			logger.error("[DataManagement] 旧 IR 正文迁移检测失败:", error);
			return {
				type: "ir_legacy_readable_markdown_migration",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async migrateLegacyIRReadableMarkdown(options: DataFixOptions = {}): Promise<DataFixResult> {
		const blocked = this.ensureHighRiskFixAllowed(
			"ir_legacy_readable_markdown_migration",
			options
		);
		if (blocked) {
			return blocked;
		}

		try {
			const inspection = await this.inspectLegacyIRReadableMarkdownMigration();
			if (inspection.blockedReason) {
				return this.buildBlockedFixResult(
					"ir_legacy_readable_markdown_migration",
					inspection.blockedReason
				);
			}

			if (inspection.files.length === 0) {
				return {
					type: "ir_legacy_readable_markdown_migration",
					success: 0,
					failed: 0,
					errors: [],
				};
			}

			const rewriteRules: PathRewriteRule[] = [];
			const errors: Array<{ uuid: string; error: string }> = [];
			let movedCount = 0;

			for (const sourcePath of inspection.files) {
				try {
					const fileName = sourcePath.split("/").pop() || "untitled.md";
					const targetFolder = this.getLegacyIRReadableMarkdownTargetFolder(
						inspection.legacyRoot,
						inspection.targetRoot,
						sourcePath
					);
					const targetPath = await generateUniqueVaultFilePath(
						this.plugin.app,
						targetFolder,
						fileName
					);
					await this.renameVaultMarkdownFileWithLinkSupport(sourcePath, targetPath);
					rewriteRules.push({ from: sourcePath, to: targetPath });
					movedCount++;
				} catch (error) {
					errors.push({
						uuid: sourcePath,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			let rewrittenCount = 0;
			if (rewriteRules.length > 0) {
				const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
				const v2Paths = getV2Paths(parentFolder);
				const pluginPaths = getPluginPaths(this.plugin.app);
				rewrittenCount += await rewriteKnownPathReferences(
					this.plugin.app,
					buildKnownPathReferenceFiles({ v2Paths, pluginPaths }),
					rewriteRules
				);
				rewrittenCount += await this.rewriteIRPointStoragePathReferences(rewriteRules);
			}

			const removedEmptyDirs = await DirectoryUtils.pruneEmptyDirsUnder(
				this.plugin.app.vault.adapter as any,
				inspection.legacyRoot,
				{
					preserveRoot: true,
				}
			);

			return {
				type: "ir_legacy_readable_markdown_migration",
				success: movedCount + rewrittenCount + removedEmptyDirs,
				failed: errors.length,
				errors,
			};
		} catch (error) {
			logger.error("[DataManagement] 旧 IR 正文迁移执行失败:", error);
			return {
				type: "ir_legacy_readable_markdown_migration",
				success: 0,
				failed: 1,
				errors: [
					{
						uuid: "ir_legacy_readable_markdown_migration",
						error: error instanceof Error ? error.message : String(error),
					},
				],
			};
		}
	}

	async checkIRPointStorageMigration(): Promise<DataCheckResult> {
		const service = await this.getIRPointStorageService();
		if (!service) {
			return {
				type: "ir_point_storage_migration",
				status: "error",
				count: 0,
				items: [],
				message: "IR Point 存储服务不可用",
			};
		}

		try {
			const inspection = await service.inspectMigrationStatus();
			const tagGroupService = await this.getIRTagGroupService();
			const legacyTagGroupInspection =
				tagGroupService?.inspectLegacyCatalogResidue
					? await tagGroupService.inspectLegacyCatalogResidue()
					: {
							legacyFileCount: 0,
							filePaths: [] as string[],
							groupCount: 0,
							profileCount: 0,
							pointFileCount: 0,
							failures: [] as Array<{ id: string; type: string; message: string }>,
					  };
			const irStorageService = await this.getIRStorageService();
			const deletedReadableMarkdownInspection =
				irStorageService?.inspectDeletedReadableMarkdownResidue
					? await irStorageService.inspectDeletedReadableMarkdownResidue()
					: { count: 0, files: [] as string[] };
			const residualLegacyChunkStorageFileCount = Number(
				inspection.legacyChunkStorageFileCount || 0
			);
			const deletedReadableMarkdownCount = Number(
				deletedReadableMarkdownInspection.count || 0
			);
			const legacyTagGroupFileCount = Number(legacyTagGroupInspection.legacyFileCount || 0);
			const hasPendingObjects =
				inspection.pendingCount > 0 ||
				deletedReadableMarkdownCount > 0 ||
				legacyTagGroupFileCount > 0;
			const hasResidualLegacyChunkStorage = residualLegacyChunkStorageFileCount > 0;
			const items = [...inspection.pendingItems];
			if (hasResidualLegacyChunkStorage) {
				items.push(
					inspection.pendingChunkPointCount > 0
						? `旧 chunks/sources 文件 ${residualLegacyChunkStorageFileCount} 个仍承载待迁阅读点`
						: `旧 chunks/sources 文件 ${residualLegacyChunkStorageFileCount} 个已退出真源但仍残留在同步目录`
				);
			}
			if (deletedReadableMarkdownCount > 0) {
				items.push(`旧 IR 已标记删除的 Markdown 残留 ${deletedReadableMarkdownCount} 个可安全清理`);
				items.push(...deletedReadableMarkdownInspection.files);
			}
			if (legacyTagGroupFileCount > 0) {
				items.push(
					legacyTagGroupInspection.groupCount > 0 || legacyTagGroupInspection.profileCount > 0
						? `旧标签组定义文件 ${legacyTagGroupFileCount} 个仍残留在仓库目录，可迁入 .irdeck 后清理`
						: `旧标签组兼容文件 ${legacyTagGroupFileCount} 个已退出真源但仍残留在仓库目录`
				);
				items.push(...legacyTagGroupInspection.filePaths);
			}
			if (legacyTagGroupInspection.failures.length > 0) {
				items.push(
					...legacyTagGroupInspection.failures.map(
						(item: { id: string; type: string; message: string }) =>
							`${item.type}: ${item.id} -> ${item.message}`
					)
				);
			}

			const count =
				inspection.pendingCount +
				residualLegacyChunkStorageFileCount +
				deletedReadableMarkdownCount +
				legacyTagGroupFileCount;
			const messageParts: string[] = [];
			if (inspection.pendingCount > 0) {
				messageParts.push(`检测到 ${inspection.pendingCount} 个增量阅读迁移/收尾项待处理`);
			}
			if (residualLegacyChunkStorageFileCount > 0) {
				messageParts.push(`有 ${residualLegacyChunkStorageFileCount} 个旧 chunks/sources 文件待清理`);
			}
			if (deletedReadableMarkdownCount > 0) {
				messageParts.push(`有 ${deletedReadableMarkdownCount} 个已标记删除的旧 IR Markdown 文件待清理`);
			}
			if (legacyTagGroupFileCount > 0) {
				messageParts.push(`有 ${legacyTagGroupFileCount} 个旧标签组文件待迁移/清理`);
			}
			return {
				type: "ir_point_storage_migration",
				status: hasPendingObjects || hasResidualLegacyChunkStorage ? "warning" : "ok",
				count,
				items,
				message:
					messageParts.length > 0
						? messageParts.join("，")
						: "增量阅读新存储结构已就绪，当前没有待迁移对象",
			};
		} catch (error) {
			logger.error("[DataManagement] IR Point 存储迁移检测失败:", error);
			return {
				type: "ir_point_storage_migration",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async checkIRLocalStateRelocation(): Promise<DataCheckResult> {
		try {
			const service = this.getEpubStorageService();
			const inspection = await service.inspectLocalDataMigrationStatus();
			const structuredInspection = await this.inspectIRStructuredLocalStateRelocation();
			const structuredLegacyCount = structuredInspection.legacyFiles.length;
			const count = inspection.legacyFileCount + structuredLegacyCount;
			const items = [
				...inspection.legacyFiles,
				...structuredInspection.legacyFiles.map(
					(item) => `${item.label}: ${item.legacyPath} -> ${item.targetPath}`
				),
			];
			return {
				type: "ir_local_state_relocation",
				status: count > 0 ? "warning" : "ok",
				count,
				items,
				message:
					count > 0
						? inspection.legacyFileCount > 0 && structuredLegacyCount > 0
							? `检测到 ${inspection.legacyFileCount} 个旧 EPUB 本地数据文件，以及 ${structuredLegacyCount} 个旧增量阅读本地状态/缓存文件，可迁入插件目录后清理`
							: inspection.legacyFileCount > 0
								? inspection.hasUnifiedDataFile
									? `检测到 ${inspection.legacyFileCount} 个旧 EPUB 本地数据文件残留，可迁入统一单文件后清理`
									: `检测到 ${inspection.legacyFileCount} 个旧 EPUB 本地数据文件，尚未迁入插件目录单文件`
								: `检测到 ${structuredLegacyCount} 个旧增量阅读本地状态/缓存文件仍留在仓库目录，可迁入插件目录后清理`
						: "增量阅读本地状态、缓存与分析文件已收口到插件目录",
			};
		} catch (error) {
			logger.error("[DataManagement] 增量阅读本地状态迁移检测失败:", error);
			return {
				type: "ir_local_state_relocation",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private getIRLegacyBookmarkTaskPaths() {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		return {
			pdf: v2Paths.ir.pdfBookmarkTasks,
			epub: v2Paths.ir.epubBookmarkTasks,
		};
	}

	async checkIRLegacyBookmarkCleanup(): Promise<DataCheckResult> {
		const service = await this.getIRPointStorageService();
		if (!service) {
			return {
				type: "ir_legacy_bookmark_cleanup",
				status: "error",
				count: 0,
				items: [],
				message: "IR Point 存储服务不可用",
			};
		}

		try {
			const inspection = await service.inspectMigrationStatus();
			const adapter = this.plugin.app.vault.adapter;
			const legacyPaths = this.getIRLegacyBookmarkTaskPaths();
			const existingFiles: string[] = [];
			if (await adapter.exists(legacyPaths.pdf)) {
				existingFiles.push(legacyPaths.pdf);
			}
			if (await adapter.exists(legacyPaths.epub)) {
				existingFiles.push(legacyPaths.epub);
			}

			const pendingLegacyTaskCount =
				inspection.pendingPdfTaskCount + inspection.pendingEpubTaskCount;
			const items =
				pendingLegacyTaskCount > 0
					? [
							`仍有 ${pendingLegacyTaskCount} 条旧书签任务待迁移，暂不能删除旧书签文件`,
							...existingFiles,
					  ]
					: existingFiles;

			return {
				type: "ir_legacy_bookmark_cleanup",
				status: existingFiles.length > 0 ? "warning" : "ok",
				count: existingFiles.length,
				items,
				message:
					existingFiles.length === 0
						? "旧 PDF/EPUB 书签文件已清理，运行时已完全使用新 points 存储"
						: pendingLegacyTaskCount > 0
							? `检测到 ${existingFiles.length} 个旧书签文件，但仍有 ${pendingLegacyTaskCount} 条旧任务未迁移`
							: `检测到 ${existingFiles.length} 个旧书签文件残留，可安全清理`,
			};
		} catch (error) {
			logger.error("[DataManagement] IR 旧书签文件清理检查失败", error);
			return {
				type: "ir_legacy_bookmark_cleanup",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async executeIRPointStorageMigration(
		options: IRPointStorageMigrationExecutionOptions = {}
	): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"ir_point_storage_migration",
				"增量阅读新存储迁移会写入新的 .irdeck 阅读点文件，并把旧索引、标签组与材料元数据迁入新结构或插件目录，必须在明确确认后执行。"
			);
		}

		const service = await this.getIRPointStorageService();
		if (!service) {
			return this.buildBlockedFixResult(
				"ir_point_storage_migration",
				"IR Point 存储服务不可用。"
			);
		}

		try {
			const report = await service.executeMigration({
				cleanupLegacyReaderStateFiles: false,
				cleanupLegacyBookmarkTaskFiles: true,
				cleanupLegacyChunkStorageFiles: true,
				cleanupLegacyMaterialFiles: true,
				cleanupLegacyRegistryFiles: true,
				cleanupLegacyTopicStoreFiles: true,
			});
			const tagGroupService = await this.getIRTagGroupService();
			const legacyTagGroupMigration =
				tagGroupService?.migrateLegacyCatalogToPointFiles
					? await tagGroupService.migrateLegacyCatalogToPointFiles({
							cleanupLegacyFiles: true,
					  })
					: {
							embeddedTopicCount: 0,
							removedLegacyFileCount: 0,
							remainingLegacyFiles: [] as string[],
							failures: [] as Array<{ id: string; type: string; message: string }>,
					  };
			const irStorageService = await this.getIRStorageService();
			const deletedReadableMarkdownCleanup =
				irStorageService?.cleanupDeletedReadableMarkdownResidue
					? await irStorageService.cleanupDeletedReadableMarkdownResidue()
					: {
							removed: 0,
							files: [],
							failures: [] as Array<{ path: string; message: string }>,
					  };
			return {
				type: "ir_point_storage_migration",
				success:
					report.summary.migratedMaterials +
					report.summary.migratedPoints +
					report.summary.migratedReaderStateFiles +
					report.summary.removedLegacyReaderStateFiles +
					report.summary.removedLegacyBookmarkTaskFiles +
					report.summary.removedLegacyChunkStorageFiles +
					(report.summary.removedLegacyMaterialRecordFiles || 0) +
					(report.summary.removedLegacyMaterialsIndexCount || 0) +
					(report.summary.removedLegacyMaterialsFileCount || 0) +
					(report.summary.removedEmptyLegacyMaterialDirs || 0) +
					(report.summary.removedLegacyRegistryFiles || 0) +
					(report.summary.removedLegacyTopicStoreFiles || 0) +
					legacyTagGroupMigration.embeddedTopicCount +
					legacyTagGroupMigration.removedLegacyFileCount +
					deletedReadableMarkdownCleanup.removed,
				failed:
					report.summary.failures.length +
					legacyTagGroupMigration.failures.length +
					legacyTagGroupMigration.remainingLegacyFiles.length +
					deletedReadableMarkdownCleanup.failures.length,
				errors: [
					...report.summary.failures.map(
						(item: { id: string; type: string; message: string }) => ({
							uuid: item.id,
							error: `${item.type}: ${item.message}`,
						})
					),
					...legacyTagGroupMigration.failures.map(
						(item: { id: string; type: string; message: string }) => ({
							uuid: item.id,
							error: `${item.type}: ${item.message}`,
						})
					),
					...legacyTagGroupMigration.remainingLegacyFiles.map((path: string) => ({
						uuid: path,
						error: "legacy-tag-group-cleanup: 迁移后旧标签组文件仍然存在",
					})),
					...deletedReadableMarkdownCleanup.failures.map(
						(item: { path: string; message: string }) => ({
							uuid: item.path,
							error: `legacy-readable-markdown-cleanup: ${item.message}`,
						})
					),
				],
			};
		} catch (error) {
			logger.error("[DataManagement] IR Point 存储迁移执行失败:", error);
			return {
				type: "ir_point_storage_migration",
				success: 0,
				failed: 1,
				errors: [{ uuid: "ir_point_storage_migration", error: String(error) }],
			};
		}
	}

	async fixIRLocalStateRelocation(): Promise<DataFixResult> {
		try {
			const service = this.getEpubStorageService();
			const report = await service.migrateLegacyLocalData({
				cleanupLegacyFiles: true,
			});
			const structuredResults = [];
			for (const entry of this.getIRLocalStateRelocationPaths()) {
				structuredResults.push(
					await this.relocateIRStructuredLocalStateFile({
						...entry,
						cleanupLegacyFile: true,
					})
				);
			}
			const structuredSuccess = structuredResults.reduce(
				(sum, item) => sum + item.migratedFileCount + item.removedLegacyFileCount,
				0
			);
			const structuredFailures = structuredResults.flatMap((item) => item.failures);
			const remainingStructuredLegacyFiles = structuredResults.flatMap(
				(item) => item.remainingLegacyFiles
			);
			return {
				type: "ir_local_state_relocation",
				success:
					report.migratedSectionCount + report.removedLegacyFileCount + structuredSuccess,
				failed:
					report.failures.length +
					report.remainingLegacyFiles.length +
					structuredFailures.length +
					remainingStructuredLegacyFiles.length,
				errors: [
					...report.failures.map((item) => ({
						uuid: item.path,
						error: item.message,
					})),
					...report.remainingLegacyFiles.map((path) => ({
						uuid: path,
						error: "迁移后仍有旧 EPUB 本地数据文件残留。",
					})),
					...structuredFailures.map((item) => ({
						uuid: item.path,
						error: item.message,
					})),
					...remainingStructuredLegacyFiles.map((path) => ({
						uuid: path,
						error: "迁移后仍有旧增量阅读本地状态/缓存文件残留。",
					})),
				],
			};
		} catch (error) {
			logger.error("[DataManagement] 增量阅读本地状态迁移失败:", error);
			return {
				type: "ir_local_state_relocation",
				success: 0,
				failed: 1,
				errors: [{ uuid: "ir_local_state_relocation", error: String(error) }],
			};
		}
	}

	/**
	 * 检测目录结构是否符合 V2 规范
	 */
	async cleanupIRLegacyBookmarkFiles(options: DataFixOptions = {}): Promise<DataFixResult> {
		if (!options.allowHighRisk) {
			return this.buildBlockedFixResult(
				"ir_legacy_bookmark_cleanup",
				"旧书签文件清理会删除已停用的历史文件，必须在明确确认后单独执行。"
			);
		}

		const service = await this.getIRPointStorageService();
		if (!service) {
			return this.buildBlockedFixResult(
				"ir_legacy_bookmark_cleanup",
				"IR Point 存储服务不可用。"
			);
		}

		try {
			const inspection = await service.inspectMigrationStatus();
			const pendingLegacyTaskCount =
				inspection.pendingPdfTaskCount + inspection.pendingEpubTaskCount;
			if (pendingLegacyTaskCount > 0) {
				return this.buildBlockedFixResult(
					"ir_legacy_bookmark_cleanup",
					`仍有 ${pendingLegacyTaskCount} 条旧书签任务未迁移，已阻止删除旧书签文件。`
				);
			}

			const adapter = this.plugin.app.vault.adapter;
			const legacyPaths = this.getIRLegacyBookmarkTaskPaths();
			let success = 0;
			const errors: Array<{ uuid: string; error: string }> = [];

			for (const path of [legacyPaths.pdf, legacyPaths.epub]) {
				try {
					if (await adapter.exists(path)) {
						await adapter.remove(path);
						success += 1;
					}
				} catch (error) {
					errors.push({ uuid: path, error: String(error) });
				}
			}

			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			await DirectoryUtils.pruneEmptyDirsUnder(adapter as any, v2Paths.ir.root, {
				preserveRoot: true,
			});

			return {
				type: "ir_legacy_bookmark_cleanup",
				success,
				failed: errors.length,
				errors,
			};
		} catch (error) {
			logger.error("[DataManagement] IR 旧书签文件清理失败", error);
			return {
				type: "ir_legacy_bookmark_cleanup",
				success: 0,
				failed: 1,
				errors: [{ uuid: "ir_legacy_bookmark_cleanup", error: String(error) }],
			};
		}
	}

	private getWDeckMigrationFolderPath(): string {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		return `${v2Paths.memory.root}/${WDECK_MIGRATION_DIR_NAME}`;
	}

	private stripWDeckRuntimeMarker(card: Card): Card {
		const customFields =
			card.customFields && typeof card.customFields === "object"
				? { ...(card.customFields as Record<string, unknown>) }
				: undefined;

		if (customFields && "wdeck" in customFields) {
			delete customFields.wdeck;
		}

		return {
			...card,
			customFields: customFields && Object.keys(customFields).length > 0 ? customFields : undefined,
		};
	}

	private async readLegacyMemorySnapshot(): Promise<LegacyMemorySnapshot> {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const adapter = this.plugin.app.vault.adapter;
		const cards = new Map<string, Card>();
		const deckCardUUIDs = new Map<string, string[]>();
		const [deckData, cardFiles, deckCardFiles] = await Promise.all([
			safeReadJson<{ decks?: Deck[] }>(adapter, v2Paths.memory.decks),
			this.listLegacyFiles(v2Paths.memory.cards),
			this.listLegacyFiles(v2Paths.memory.deckCards),
		]);

		for (const filePath of cardFiles) {
			if (filePath.toLowerCase().endsWith("/card-files-index.json")) {
				continue;
			}

			try {
				const parsed = JSON.parse(await adapter.read(filePath)) as { cards?: Card[] };
				for (const card of parsed.cards || []) {
					if (card?.uuid) {
						cards.set(card.uuid, this.stripWDeckRuntimeMarker(card));
					}
				}
			} catch (error) {
				logger.warn(`[DataManagement] 读取旧卡片文件失败: ${filePath}`, error);
			}
		}

		for (const filePath of deckCardFiles) {
			try {
				const parsed = JSON.parse(await adapter.read(filePath)) as { cardUUIDs?: string[] };
				const fileName = filePath.split("/").pop() || "";
				const deckId = fileName.replace(/\.json$/i, "").trim();
				if (!deckId) {
					continue;
				}
				const uuids = Array.isArray(parsed.cardUUIDs)
					? parsed.cardUUIDs.filter((uuid): uuid is string => typeof uuid === "string" && uuid.length > 0)
					: [];
				deckCardUUIDs.set(deckId, Array.from(new Set(uuids)));
			} catch (error) {
				logger.warn(`[DataManagement] 读取旧牌组卡片索引失败: ${filePath}`, error);
			}
		}

		return {
			decks: Array.isArray(deckData?.decks) ? deckData.decks : [],
			cards: Array.from(cards.values()),
			deckCardUUIDs,
		};
	}

	private getCardsForWDeckMigration(
		deck: Deck,
		allCards: Card[],
		allDecks: Deck[]
	): Card[] {
		const deckLookups = allDecks.map((item) => ({
			id: item.id,
			name: item.name,
			purpose: item.purpose,
		}));
		return allCards
			.filter((card) => getCardDeckIds(card, deckLookups).primaryDeckId === deck.id)
			.map((card) => this.stripWDeckRuntimeMarker(card));
	}

	private async collectWDeckFilesViaAdapter(dir = ""): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		const listing = await adapter.list(dir);
		const files = listing.files.filter((path) =>
			path.toLowerCase().endsWith(`.${WDECK_FILE_EXTENSION}`)
		);

		for (const folder of listing.folders) {
			files.push(...(await this.collectWDeckFilesViaAdapter(folder)));
		}

		return files;
	}

	private async getExistingWDeckFiles(): Promise<ExistingWDeckFileInfo[]> {
		const vault = this.plugin.app.vault as typeof this.plugin.app.vault & {
			getFiles?: () => Array<{ path: string; extension?: string }>;
		};

		const filePaths =
			typeof vault.getFiles === "function"
				? vault
						.getFiles()
						.filter(
							(file) =>
								String(file.extension || "").toLowerCase() === WDECK_FILE_EXTENSION ||
								file.path.toLowerCase().endsWith(`.${WDECK_FILE_EXTENSION}`)
						)
						.map((file) => file.path)
				: await this.collectWDeckFilesViaAdapter();

		const adapter = this.plugin.app.vault.adapter;
		const results: ExistingWDeckFileInfo[] = [];

		for (const path of filePaths) {
			try {
				const raw = await adapter.read(path);
				const parsed = JSON.parse(raw) as WDeckFileData;
				const logicalDeckIdRaw = String(parsed.logicalDeckId || "").trim();
				const logicalDeckNameRaw = String(parsed.logicalDeckName || "").trim();
				results.push({
					path,
					logicalDeckId:
						logicalDeckIdRaw || logicalDeckNameRaw
							? normalizeWDeckLogicalDeckId(logicalDeckIdRaw, logicalDeckNameRaw)
							: undefined,
					logicalDeckName: logicalDeckNameRaw || undefined,
				});
			} catch (error) {
				logger.warn(`[DataManagement] 读取 WDeck 文件失败: ${path}`, error);
				results.push({ path });
			}
		}

		return results;
	}

	private async getExistingQBankFiles(basePath: string): Promise<ExistingQBankFileInfo[]> {
		const adapter = this.plugin.app.vault.adapter;
		const results: ExistingQBankFileInfo[] = [];

		try {
			const files = await adapter.list(basePath);
			const qbankFiles = files.files.filter((path) => path.endsWith(".qbank"));

			for (const path of qbankFiles) {
				try {
					const content = await adapter.read(path);
					const data = JSON.parse(content);
					results.push({
						path,
						bankId: data.id || "",
						bankName: data.name || "",
					});
				} catch (error) {
					logger.warn(`[DataManagement] 读取 QBank 文件失败: ${path}`, error);
				}
			}
		} catch (error) {
			logger.warn(`[DataManagement] 列出 QBank 文件失败`, error);
		}

		return results;
	}

	private async getQuestionCount(bankId: string): Promise<number> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			const basePath = v2Paths.questionBank.root;
			const questionsFile = `${basePath}/banks/${bankId}/questions.json`;

			if (!(await adapter.exists(questionsFile))) {
				return 0;
			}

			const content = await adapter.read(questionsFile);
			const data = JSON.parse(content);
			return Array.isArray(data.refs) ? data.refs.length : 0;
		} catch (error) {
			logger.warn(`[DataManagement] 读取题目数量失败: ${bankId}`, error);
			return 0;
		}
	}

	private async planQBankMigration(): Promise<QBankMigrationPlan> {
		const adapter = this.plugin.app.vault.adapter;
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const basePath = v2Paths.questionBank.root;

		// 1. 检测旧结构文件
		const oldBanksFile = `${basePath}/banks.json`;
		const oldBanksExists = await adapter.exists(oldBanksFile);

		if (!oldBanksExists) {
			return { targetFolder: basePath, candidates: [], alreadyMigrated: [], conflicts: [] };
		}

		// 2. 读取旧数据
		const banksData = JSON.parse(await adapter.read(oldBanksFile));
		const banks: Deck[] = Array.isArray(banksData) ? banksData : (banksData.decks || []);

		// 3. 检测已迁移的 .qbank 文件
		const existingQBankFiles = await this.getExistingQBankFiles(basePath);
		const existingByBankId = new Map(existingQBankFiles.map((f) => [f.bankId, f]));

		const candidates: QBankMigrationCandidate[] = [];
		const alreadyMigrated: ExistingQBankFileInfo[] = [];
		const conflicts: Array<{ bank: Deck; filePath: string; reason: string }> = [];
		const seenFileNames = new Map<string, string>();

		// 4. 遍历每个题库
		for (const bank of banks) {
			// 跳过已迁移的
			const existing = existingByBankId.get(bank.id);
			if (existing) {
				alreadyMigrated.push(existing);
				continue;
			}

			// 生成文件名
			const fileName = sanitizeForSync(bank.name);
			const filePath = `${basePath}/${fileName}.qbank`;

			// 检测文件名冲突
			const existingOwner = seenFileNames.get(fileName);
			if (existingOwner && existingOwner !== bank.id) {
				conflicts.push({
					bank,
					filePath,
					reason: `文件名冲突：${fileName}.qbank 已被题库 ${existingOwner} 使用`,
				});
				continue;
			}

			// 检测文件是否已存在
			if (await adapter.exists(filePath)) {
				conflicts.push({
					bank,
					filePath,
					reason: `目标文件已存在：${filePath}`,
				});
				continue;
			}

			// 读取题目数量
			const questionCount = await this.getQuestionCount(bank.id);

			seenFileNames.set(fileName, bank.id);
			candidates.push({
				bank,
				fileName,
				filePath,
				questionCount,
			});
		}

		return { targetFolder: basePath, candidates, alreadyMigrated, conflicts };
	}

	private async planWDeckMigration(): Promise<WDeckMigrationPlan> {
		const targetFolder = this.getWDeckMigrationFolderPath();
		const [legacySnapshot, allDecks, allCards, existingWDeckFiles] = await Promise.all([
			this.readLegacyMemorySnapshot(),
			this.plugin.dataStorage.getDecks(),
			this.plugin.dataStorage.getCards(),
			this.getExistingWDeckFiles(),
		]);
		const runtimeCards = allCards.filter((card) => !this.plugin.wdeckService?.isWDeckCard(card));
		const regularCardMap = new Map<string, Card>();
		const regularCardsWithoutUUID: Card[] = [];
		const mergeRegularCards = (cards: Card[]) => {
			for (const card of cards) {
				const normalizedCard = this.stripWDeckRuntimeMarker(card);
				const uuid = String(normalizedCard?.uuid || "").trim();
				if (uuid) {
					regularCardMap.set(uuid, normalizedCard);
					continue;
				}
				regularCardsWithoutUUID.push(normalizedCard);
			}
		};
		mergeRegularCards(runtimeCards);
		mergeRegularCards(legacySnapshot.cards);
		const regularCards = [...regularCardMap.values(), ...regularCardsWithoutUUID];

		const deckById = new Map<string, Deck>();
		const mergeDecks = (decks: Deck[]) => {
			for (const deck of decks) {
				const deckId = String(deck?.id || "").trim();
				if (!deckId) {
					continue;
				}
				const existing = deckById.get(deckId);
				deckById.set(deckId, existing ? { ...existing, ...deck } : deck);
			}
		};
		mergeDecks(legacySnapshot.decks);
		mergeDecks(allDecks);
		const sourceDecks = Array.from(deckById.values());
		const normalizedRegularCards = regularCards.map((card) =>
			this.stripWDeckRuntimeMarker(this.normalizeCardToSingleMemoryMembership(card, sourceDecks) || card)
		);
		const existingByLogicalDeckId = new Map<string, ExistingWDeckFileInfo>();
		const existingByLogicalDeckName = new Map<string, ExistingWDeckFileInfo>();
		for (const entry of existingWDeckFiles) {
			if (entry.logicalDeckId) {
				existingByLogicalDeckId.set(entry.logicalDeckId, entry);
			}
			if (entry.logicalDeckName) {
				existingByLogicalDeckName.set(entry.logicalDeckName, entry);
			}
		}

		const adapter = this.plugin.app.vault.adapter;
		const seenTargets = new Map<string, string>();
		const candidates: WDeckMigrationCandidate[] = [];
		const alreadyMigrated: ExistingWDeckFileInfo[] = [];
		const conflicts: Array<{ deck: Deck; filePath: string; reason: string }> = [];
		const assignedUUIDs = new Set<string>();

		for (const deck of sourceDecks) {
			if (deck.purpose === "test") {
				continue;
			}

			const deckId = String(deck.id || "").trim();
			if (!deckId) {
				continue;
			}

			const deckCards = this.getCardsForWDeckMigration(
				deck,
				normalizedRegularCards,
				sourceDecks
			);
			if (deckCards.length === 0) {
				continue;
			}

			const logicalDeckName = String(deck.name || deckId || "unnamed").trim() || deckId;
			const logicalDeckId = normalizeWDeckLogicalDeckId(deckId, logicalDeckName);
			const existing =
				existingByLogicalDeckId.get(logicalDeckId) || existingByLogicalDeckName.get(logicalDeckName);
			if (existing) {
				alreadyMigrated.push(existing);
				continue;
			}

			const safeDeckName = sanitizeForSync(logicalDeckName);
			const filePath = `${targetFolder}/${safeDeckName}_01.${WDECK_FILE_EXTENSION}`;
			const existingTargetOwner = seenTargets.get(filePath);
			if (existingTargetOwner && existingTargetOwner !== deckId) {
				conflicts.push({
					deck,
					filePath,
					reason: "目标文件名冲突，需要调整牌组命名或手动处理。",
				});
				continue;
			}

			seenTargets.set(filePath, deckId);

			if (await adapter.exists(filePath) && logicalDeckName !== WDECK_UNGROUPED_DECK_NAME) {
				conflicts.push({
					deck,
					filePath,
					reason: "目标 .wdeck 文件已存在，为避免覆盖，本次不会自动写入。",
				});
				continue;
			}

			candidates.push({
				deck,
				cards: deckCards,
				filePath,
				logicalDeckId,
				logicalDeckName,
			});
			for (const card of deckCards) {
				if (card?.uuid) {
					assignedUUIDs.add(card.uuid);
				}
			}
		}

		const orphanCards = normalizedRegularCards
			.filter((card) => card?.uuid && !assignedUUIDs.has(card.uuid))
			.map((card) => this.stripWDeckRuntimeMarker(card));
		if (orphanCards.length > 0) {
			const now = new Date().toISOString();
			candidates.push({
				deck: {
					id: WDECK_UNGROUPED_DECK_NAME,
					name: WDECK_UNGROUPED_DECK_NAME,
					description: "",
					category: "memory",
					path: WDECK_UNGROUPED_DECK_NAME,
					level: 0,
					order: 0,
					inheritSettings: false,
					settings: {
						newCardsPerDay: 20,
						maxReviewsPerDay: 100,
						enableAutoAdvance: true,
						showAnswerTime: 0,
						fsrsParams: {
							w: [],
							requestRetention: 0.9,
							maximumInterval: 36500,
							enableFuzz: true,
						},
						learningSteps: [1, 10],
						relearningSteps: [10],
						graduatingInterval: 1,
						easyInterval: 4,
					},
					includeSubdecks: false,
					stats: {
						totalCards: orphanCards.length,
						newCards: 0,
						learningCards: 0,
						reviewCards: 0,
						todayNew: 0,
						todayReview: 0,
						todayTime: 0,
						totalReviews: 0,
						totalTime: 0,
						memoryRate: 0,
						averageEase: 0,
						forecastDays: {},
					},
					created: now,
					modified: now,
					tags: [],
					metadata: {},
					purpose: "memory",
				},
				cards: orphanCards,
				filePath: `${targetFolder}/${sanitizeForSync(WDECK_UNGROUPED_DECK_NAME)}_01.${WDECK_FILE_EXTENSION}`,
				logicalDeckId: WDECK_UNGROUPED_DECK_NAME,
				logicalDeckName: WDECK_UNGROUPED_DECK_NAME,
			});
		}

		return {
			targetFolder,
			candidates,
			alreadyMigrated,
			conflicts,
		};
	}

	private async markDecksAsWDeckMigrated(
		entries: Array<{ deckId: string; logicalDeckId: string; filePath: string }>
	): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const adapter = this.plugin.app.vault.adapter;
		const data = await safeReadJson<{ decks: Deck[] }>(adapter, v2Paths.memory.decks);
		if (!data?.decks) {
			return;
		}

		const now = new Date().toISOString();
		const byDeckId = new Map(entries.map((entry) => [entry.deckId, entry] as const));
		let changed = false;

		for (const deck of data.decks) {
			const entry = byDeckId.get(String(deck.id || "").trim());
			if (!entry) {
				continue;
			}

			const metadata =
				deck.metadata && typeof deck.metadata === "object"
					? { ...(deck.metadata as Record<string, unknown>) }
					: {};
			metadata.wdeckMigration = {
				status: "migrated",
				logicalDeckId: entry.logicalDeckId,
				filePath: entry.filePath,
				exportedAt: now,
			};
			deck.metadata = metadata;
			changed = true;
		}

		if (changed) {
			await safeWriteJson(adapter, v2Paths.memory.decks, JSON.stringify(data, null, 2));
		}
	}

	async checkWDeckMigration(): Promise<DataCheckResult> {
		try {
			const plan = await this.planWDeckMigration();

			if (plan.conflicts.length > 0) {
				return {
					type: "wdeck_migration",
					status: "error",
					count: plan.conflicts.length,
					items: plan.conflicts.map(
						(item) => `${item.deck.name} -> ${item.filePath} (${item.reason})`
					),
					message: `发现 ${plan.conflicts.length} 个 .wdeck 迁移冲突，请先处理冲突后再执行迁移`,
				};
			}

			if (plan.candidates.length === 0) {
				return {
					type: "wdeck_migration",
					status: "ok",
					count: 0,
					items: [],
					message:
						plan.alreadyMigrated.length > 0
							? "当前记忆牌组已有对应的 .wdeck 文件，暂时不需要再次迁移"
							: "当前没有需要迁移到 .wdeck 的记忆牌组",
				};
			}

			return {
				type: "wdeck_migration",
				status: "warning",
				count: plan.candidates.length,
				items: plan.candidates.map(
					(item) => `${item.logicalDeckName} -> ${item.filePath} (${item.cards.length} 张卡片)`
				),
				message: `发现 ${plan.candidates.length} 个记忆牌组可迁移到 ${plan.targetFolder}`,
			};
		} catch (error) {
			logger.error("[DataManagement] WDeck 迁移检测失败:", error);
			return {
				type: "wdeck_migration",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async checkQBankMigration(): Promise<DataCheckResult> {
		try {
			const plan = await this.planQBankMigration();

			if (plan.conflicts.length > 0) {
				return {
					type: "qbank_migration",
					status: "error",
					count: plan.conflicts.length,
					items: plan.conflicts.map((item) => `${item.bank.name}: ${item.reason}`),
					message: `发现 ${plan.conflicts.length} 个冲突，需要手动处理`,
				};
			}

			if (plan.candidates.length === 0) {
				return {
					type: "qbank_migration",
					status: "ok",
					count: 0,
					items: [],
					message:
						plan.alreadyMigrated.length > 0
							? "所有题库已迁移到 .qbank 格式"
							: "当前没有需要迁移的题库",
				};
			}

			return {
				type: "qbank_migration",
				status: "warning",
				count: plan.candidates.length,
				items: plan.candidates.map(
					(item) =>
						`${item.bank.name} -> weave/question-bank/${item.fileName}.qbank (${item.questionCount} 道题)`
				),
				message: `发现 ${plan.candidates.length} 个题库可迁移到 .qbank 格式`,
			};
		} catch (error) {
			logger.error("[DataManagement] QBank 迁移检测失败:", error);
			return {
				type: "qbank_migration",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async executeWDeckMigration(
		options: WDeckMigrationExecutionOptions = {}
	): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"wdeck_migration",
				".wdeck 迁移会在 vault 中写入新的牌组文件，必须在明确确认后执行。"
			);
		}

		try {
			const plan = await this.planWDeckMigration();
			if (plan.conflicts.length > 0) {
				return {
					type: "wdeck_migration",
					success: 0,
					failed: plan.conflicts.length,
					errors: plan.conflicts.map((item) => ({
						uuid: item.deck.id,
						error: `${item.filePath}: ${item.reason}`,
					})),
				};
			}

			if (plan.candidates.length === 0) {
				return {
					type: "wdeck_migration",
					success: 0,
					failed: 0,
					errors: [],
				};
			}

			await DirectoryUtils.ensureDirRecursive(this.plugin.app.vault.adapter, plan.targetFolder);

			let success = 0;
			let failed = 0;
			const errors: Array<{ uuid: string; error: string }> = [];
			const migratedDecks: Array<{ deckId: string; logicalDeckId: string; filePath: string }> = [];

			for (const candidate of plan.candidates) {
				const payload: WDeckFileData = {
					schemaVersion: 1,
					fileType: "wdeck",
					logicalDeckId: candidate.logicalDeckId,
					logicalDeckName: candidate.logicalDeckName,
					segmentId: `${candidate.logicalDeckName}_01`,
					segmentIndex: 1,
					segmentLabel: "01",
					cards: candidate.cards,
				};

				try {
					if (
						candidate.logicalDeckName === WDECK_UNGROUPED_DECK_NAME &&
						(await this.plugin.app.vault.adapter.exists(candidate.filePath))
					) {
						const raw = await this.plugin.app.vault.adapter.read(candidate.filePath);
						const existing = JSON.parse(raw) as WDeckFileData;
						const merged = new Map<string, Card>();
						for (const card of existing.cards || []) {
							if (card?.uuid) {
								merged.set(card.uuid, card);
							}
						}
						for (const card of candidate.cards) {
							if (card?.uuid) {
								merged.set(card.uuid, card);
							}
						}
						payload.cards = Array.from(merged.values());
					}

					await this.plugin.app.vault.adapter.write(
						candidate.filePath,
						JSON.stringify(payload, null, 2)
					);
					success++;
					migratedDecks.push({
						deckId: candidate.deck.id,
						logicalDeckId: candidate.logicalDeckId,
						filePath: candidate.filePath,
					});
				} catch (error) {
					failed++;
					errors.push({
						uuid: candidate.deck.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			await this.markDecksAsWDeckMigrated(migratedDecks);
			await this.cleanupMigratedLegacyMemoryFiles();
			await this.plugin.wdeckService?.rebuildCache();

			return {
				type: "wdeck_migration",
				success,
				failed,
				errors,
			};
		} catch (error) {
			logger.error("[DataManagement] WDeck 迁移执行失败:", error);
			return {
				type: "wdeck_migration",
				success: 0,
				failed: 1,
				errors: [{ uuid: "", error: error instanceof Error ? error.message : String(error) }],
			};
		}
	}

	async executeQBankMigration(
		options: { confirmed?: boolean } = {}
	): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"qbank_migration",
				".qbank 迁移会在 vault 中写入新的题库文件，必须在明确确认后执行。"
			);
		}

		try {
			const plan = await this.planQBankMigration();
			if (plan.conflicts.length > 0) {
				return {
					type: "qbank_migration",
					success: 0,
					failed: plan.conflicts.length,
					errors: plan.conflicts.map((item) => ({
						uuid: item.bank.id,
						error: `${item.filePath}: ${item.reason}`,
					})),
				};
			}

			if (plan.candidates.length === 0) {
				return {
					type: "qbank_migration",
					success: 0,
					failed: 0,
					errors: [],
				};
			}

			// 确保目标文件夹存在
			await DirectoryUtils.ensureDirRecursive(this.plugin.app.vault.adapter, plan.targetFolder);

			// 确保插件缓存目录存在
			const pluginCacheDir = `${this.plugin.manifest.dir}/cache/question-bank`;
			await DirectoryUtils.ensureDirRecursive(this.plugin.app.vault.adapter, pluginCacheDir);
			await DirectoryUtils.ensureDirRecursive(
				this.plugin.app.vault.adapter,
				`${pluginCacheDir}/in-progress`
			);
			await DirectoryUtils.ensureDirRecursive(
				this.plugin.app.vault.adapter,
				`${pluginCacheDir}/session-archives`
			);

			let success = 0;
			let failed = 0;
			const errors: Array<{ uuid: string; error: string }> = [];

			// 读取全局数据文件
			const adapter = this.plugin.app.vault.adapter;
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const qbankDir = `${parentFolder}/question-bank`;

			let testHistoryMap = new Map<string, LegacyQuestionTestHistoryEntry[]>();
			let inProgressMap = new Map<string, unknown>();
			let sessionArchivesMap = new Map<string, unknown[]>();

			// 读取 test-history.json
			try {
				const testHistoryPath = `${qbankDir}/test-history.json`;
				if (await adapter.exists(testHistoryPath)) {
					const raw = await adapter.read(testHistoryPath);
					const data = JSON.parse(raw) as Record<string, LegacyQuestionTestHistoryEntry[]>;
					testHistoryMap = new Map(
						Object.entries(data).map(([bankId, attempts]) => [
							bankId,
							Array.isArray(attempts) ? attempts : [],
						])
					);
				}
			} catch (error) {
				logger.warn("[DataManagement] 读取 test-history.json 失败:", error);
			}

			// 读取 in-progress.json
			try {
				const inProgressPath = `${qbankDir}/in-progress.json`;
				if (await adapter.exists(inProgressPath)) {
					const raw = await adapter.read(inProgressPath);
					const data = JSON.parse(raw) as Record<string, unknown>;
					inProgressMap = new Map(Object.entries(data));
				}
			} catch (error) {
				logger.warn("[DataManagement] 读取 in-progress.json 失败:", error);
			}

			// 读取 session-archives.json
			try {
				const sessionArchivesPath = `${qbankDir}/session-archives.json`;
				if (await adapter.exists(sessionArchivesPath)) {
					const raw = await adapter.read(sessionArchivesPath);
					const data = JSON.parse(raw) as Record<string, unknown[]>;
					sessionArchivesMap = new Map(
						Object.entries(data).map(([bankId, archives]) => [
							bankId,
							Array.isArray(archives) ? archives : [],
						])
					);
				}
			} catch (error) {
				logger.warn("[DataManagement] 读取 session-archives.json 失败:", error);
			}

			// 迁移每个题库
			for (const candidate of plan.candidates) {
				try {
					// 读取题目列表
					const questionsPath = `${qbankDir}/banks/${candidate.bank.id}/questions.json`;
					let questionRefs: Array<{ cardUuid: string; addedAt?: string }> = [];
					if (await adapter.exists(questionsPath)) {
						const raw = await adapter.read(questionsPath);
						const questionsData = JSON.parse(raw) as LegacyQuestionRefsFile;

						// 支持三种格式：
						// 1. 直接数组
						// 2. v2.0.0 格式：{ _schemaVersion: "2.0.0", bankId: "...", refs: [...] }
						// 3. v1.0.0 格式：{ _schemaVersion: "1.0.0", bankId: "...", questions: [Card对象数组] }
						if (Array.isArray(questionsData)) {
							questionRefs = questionsData;
						} else if (questionsData.refs) {
							questionRefs = questionsData.refs;
						} else if (questionsData.questions) {
							// v1.0.0 格式：从 Card 对象中提取 uuid
							questionRefs = questionsData.questions.map((card) => ({
								cardUuid: card.uuid,
								addedAt: card.created || new Date().toISOString()
							}));
						}
					}

					// 构建题目数据（包含测试历史）
					const questionsInBank = questionRefs.map((q) => {
						const testHistory = testHistoryMap.get(candidate.bank.id) || [];
						const questionHistory = testHistory.filter((history) => history.cardUuid === q.cardUuid);

						return {
							cardUuid: q.cardUuid,
							addedAt: q.addedAt || new Date().toISOString(),
							testHistory: questionHistory,
							stats: this.calculateQuestionStats(questionHistory),
						};
					});

					// 构建 .qbank 文件数据
					const qbankData: QBankFileData = {
						id: candidate.bank.id,
						name: candidate.bank.name,
						description: candidate.bank.description || "",
						deckType: "question-bank",
						metadata: {
							pairedMemoryDeckId:
								typeof candidate.bank.metadata?.pairedMemoryDeckId === "string"
									? candidate.bank.metadata.pairedMemoryDeckId
									: undefined,
							tags: candidate.bank.tags || [],
							createdAt: candidate.bank.created,
							updatedAt: new Date().toISOString(),
						},
						config: {
							defaultMode: "exam",
							defaultQuestionCount: undefined,
							defaultTimeLimit: undefined,
							enableErrorBook: true,
							showExplanation: false,
						},
						questions: questionsInBank,
						stats: this.calculateBankStats(questionsInBank),
					};

					// 写入 .qbank 文件
					await adapter.write(candidate.filePath, JSON.stringify(qbankData, null, 2));

					// 迁移进行中会话到插件目录
					const inProgress = inProgressMap.get(candidate.bank.id);
					if (inProgress) {
						const inProgressPath = `${pluginCacheDir}/in-progress/${candidate.bank.name}.json`;
						await adapter.write(inProgressPath, JSON.stringify(inProgress, null, 2));
					}

					// 迁移会话归档到插件目录
					const sessionArchives = sessionArchivesMap.get(candidate.bank.id);
					if (sessionArchives && sessionArchives.length > 0) {
						const archivePath = `${pluginCacheDir}/session-archives/${candidate.bank.name}.json`;
						await adapter.write(archivePath, JSON.stringify(sessionArchives, null, 2));
					}

					success++;
				} catch (error) {
					failed++;
					errors.push({
						uuid: candidate.bank.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			// 清理旧文件
			if (success > 0) {
				await this.cleanupLegacyQBankFiles();
			}

			return {
				type: "qbank_migration",
				success,
				failed,
				errors,
			};
		} catch (error) {
			logger.error("[DataManagement] QBank 迁移执行失败:", error);
			return {
				type: "qbank_migration",
				success: 0,
				failed: 1,
				errors: [{ uuid: "", error: error instanceof Error ? error.message : String(error) }],
			};
		}
	}

	async checkQBankLegacyCleanup(): Promise<DataCheckResult> {
		try {
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			const basePath = v2Paths.questionBank.root;

			// 检查是否存在 .qbank 文件
			const qbankFiles = await this.getExistingQBankFiles(basePath);
			if (qbankFiles.length === 0) {
				return {
					type: "qbank_legacy_cleanup",
					status: "ok",
					count: 0,
					items: [],
					message: "没有找到 .qbank 文件，无需清理旧文件",
				};
			}

			// 检查是否存在旧的 JSON 文件
			const legacyFiles: string[] = [];
			const filesToCheck = [
				"banks.json",
				"question-stats.json",
				"test-history.json",
				"in-progress.json",
				"session-archives.json",
				"error-book.json",
			];

			for (const file of filesToCheck) {
				const filePath = `${basePath}/${file}`;
				if (await this.plugin.app.vault.adapter.exists(filePath)) {
					legacyFiles.push(file);
				}
			}

			// 检查 banks/ 文件夹
			const banksFolderPath = `${basePath}/banks`;
			if (await this.plugin.app.vault.adapter.exists(banksFolderPath)) {
				legacyFiles.push("banks/");
			}

			if (legacyFiles.length === 0) {
				return {
					type: "qbank_legacy_cleanup",
					status: "ok",
					count: 0,
					items: [],
					message: "旧题库文件已清理",
				};
			}

			return {
				type: "qbank_legacy_cleanup",
				status: "warning",
				count: legacyFiles.length,
				items: legacyFiles,
				message: `发现 ${legacyFiles.length} 个旧题库文件需要清理：${legacyFiles.join(", ")}`,
			};
		} catch (error) {
			logger.error("[DataManagement] QBank 旧文件检测失败:", error);
			return {
				type: "qbank_legacy_cleanup",
				status: "error",
				count: 0,
				items: [],
				message: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async executeQBankLegacyCleanup(options: { confirmed?: boolean } = {}): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"qbank_legacy_cleanup",
				"需要用户确认后才能清理旧题库文件（此操作不可逆）"
			);
		}

		try {
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			const basePath = v2Paths.questionBank.root;

			const filesToDelete = [
				"banks.json",
				"question-stats.json",
				"test-history.json",
				"in-progress.json",
				"session-archives.json",
				"error-book.json",
			];

			let successCount = 0;
			let failedCount = 0;
			const errors: Array<{ uuid: string; error: string }> = [];

			// 删除文件
			for (const file of filesToDelete) {
				const filePath = `${basePath}/${file}`;
				try {
					if (await this.plugin.app.vault.adapter.exists(filePath)) {
						await this.plugin.app.vault.adapter.remove(filePath);
						successCount++;
						logger.info(`[DataManagement] 已删除旧文件: ${file}`);
					}
				} catch (error) {
					failedCount++;
					errors.push({
						uuid: file,
						error: error instanceof Error ? error.message : String(error),
					});
					logger.error(`[DataManagement] 删除文件失败: ${file}`, error);
				}
			}

			// 删除 banks/ 文件夹
			const banksFolderPath = `${basePath}/banks`;
			try {
				if (await this.plugin.app.vault.adapter.exists(banksFolderPath)) {
					await this.plugin.app.vault.adapter.rmdir(banksFolderPath, true);
					successCount++;
					logger.info("[DataManagement] 已删除 banks/ 文件夹");
				}
			} catch (error) {
				failedCount++;
				errors.push({
					uuid: "banks/",
					error: error instanceof Error ? error.message : String(error),
				});
				logger.error("[DataManagement] 删除 banks/ 文件夹失败", error);
			}

			return {
				type: "qbank_legacy_cleanup",
				success: successCount,
				failed: failedCount,
				errors,
			};
		} catch (error) {
			logger.error("[DataManagement] QBank 旧文件清理失败:", error);
			return {
				type: "qbank_legacy_cleanup",
				success: 0,
				failed: 1,
				errors: [{ uuid: "", error: error instanceof Error ? error.message : String(error) }],
			};
		}
	}

	private calculateQuestionStats(testHistory: TestAttempt[]): QuestionTestStats {
		const totalAttempts = testHistory.length;
		const correctAttempts = testHistory.filter((history) => history.isCorrect).length;
		const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

		const scores = testHistory.map((history) => history.score || 0);
		const highestScore = scores.length > 0 ? Math.max(...scores) : undefined;
		const lowestScore = scores.length > 0 ? Math.min(...scores) : undefined;

		const times = testHistory.map((history) => history.timeSpent || 0).filter((time) => time > 0);
		const averageTimeSpent = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : undefined;

		const lastTestedAt = testHistory.length > 0 ? testHistory[testHistory.length - 1].timestamp : undefined;

		// 计算连续错误次数来判断是否在错题本
		let consecutiveIncorrect = 0;
		for (let i = testHistory.length - 1; i >= 0; i--) {
			if (!testHistory[i].isCorrect) {
				consecutiveIncorrect++;
			} else {
				break;
			}
		}

		const isInErrorBook = consecutiveIncorrect >= 3 || (totalAttempts > 0 && accuracy < 0.5);

		return {
			totalAttempts,
			correctAttempts,
			accuracy,
			isInErrorBook,
			lastTestedAt,
			averageTimeSpent,
			highestScore,
			lowestScore,
		};
	}

	private calculateBankStats(questions: QuestionInBank[]): QBankStats {
		const totalQuestions = questions.length;

		const allScores = questions
			.flatMap((q) => q.testHistory)
			.map((t) => t.score)
			.filter((s) => s !== undefined);

		const averageScore =
			allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : undefined;
		const highestScore = allScores.length > 0 ? Math.max(...allScores) : undefined;
		const lowestScore = allScores.length > 0 ? Math.min(...allScores) : undefined;

		const errorBookCount = questions.filter((q) => q.stats.isInErrorBook).length;

		const allTests = questions.flatMap((q) => q.testHistory);
		const totalTests = allTests.length;

		const lastTestedAt =
			allTests.length > 0
				? allTests.reduce((latest, test) =>
						test.timestamp > latest ? test.timestamp : latest
				  , allTests[0].timestamp)
				: undefined;

		return {
			totalQuestions,
			totalTests,
			averageScore,
			highestScore,
			lowestScore,
			errorBookCount,
			lastTestedAt,
		};
	}

	private async cleanupLegacyQBankFiles(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const qbankDir = `${parentFolder}/question-bank`;

		const filesToDelete = [
			`${qbankDir}/banks.json`,
			`${qbankDir}/question-stats.json`,
			`${qbankDir}/test-history.json`,
			`${qbankDir}/in-progress.json`,
			`${qbankDir}/session-archives.json`,
			`${qbankDir}/error-book.json`,
		];

		for (const filePath of filesToDelete) {
			try {
				if (await adapter.exists(filePath)) {
					await adapter.remove(filePath);
					logger.info(`[DataManagement] 已删除旧文件: ${filePath}`);
				}
			} catch (error) {
				logger.warn(`[DataManagement] 删除旧文件失败: ${filePath}`, error);
			}
		}

		// 删除 banks/ 文件夹
		try {
			const banksDir = `${qbankDir}/banks`;
			if (await adapter.exists(banksDir)) {
				const listing = await adapter.list(banksDir);
				// 删除所有子文件夹中的文件
				for (const folder of listing.folders || []) {
					const folderListing = await adapter.list(folder);
					for (const file of folderListing.files || []) {
						await adapter.remove(file);
					}
					// 删除文件夹
					await adapter.rmdir(folder, false);
				}
				// 删除 banks 文件夹本身
				await adapter.rmdir(banksDir, false);
				logger.info(`[DataManagement] 已删除旧文件夹: ${banksDir}`);
			}
		} catch (error) {
			logger.warn(`[DataManagement] 删除 banks 文件夹失败:`, error);
		}
	}

	private async listLegacyFiles(dir: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		try {
			if (!(await adapter.exists(dir))) {
				return [];
			}
			const listing = await adapter.list(dir);
			return (listing.files || []).filter((file) => file.toLowerCase().endsWith(".json")).sort();
		} catch (error) {
			logger.warn(`[DataManagement] 读取目录失败: ${dir}`, error);
			return [];
		}
	}

	private async getLegacyMemoryFilePaths(): Promise<string[]> {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const cardsFiles = await this.listLegacyFiles(v2Paths.memory.cards);
		const deckCardFiles = await this.listLegacyFiles(v2Paths.memory.deckCards);
		const legacyFiles = [
			...cardsFiles,
			...deckCardFiles,
			`${v2Paths.memory.cards}/card-files-index.json`,
		];
		const adapter = this.plugin.app.vault.adapter;
		const existing: string[] = [];
		for (const filePath of legacyFiles) {
			if (await adapter.exists(filePath)) {
				existing.push(filePath);
			}
		}
		return Array.from(new Set(existing)).sort();
	}

	private async cleanupMigratedLegacyMemoryFiles(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const filePaths = await this.getLegacyMemoryFilePaths();
		for (const filePath of filePaths) {
			try {
				if (await adapter.exists(filePath)) {
					await adapter.remove(filePath);
				}
			} catch (error) {
				logger.warn(`[DataManagement] 清理旧记忆文件失败: ${filePath}`, error);
			}
		}
	}

	private async getWDeckCardUUIDOwners(): Promise<Map<string, Set<string>>> {
		const adapter = this.plugin.app.vault.adapter;
		const owners = new Map<string, Set<string>>();
		const files = await this.getExistingWDeckFiles();

		for (const entry of files) {
			try {
				const parsed = JSON.parse(await adapter.read(entry.path)) as WDeckFileData;
				for (const card of parsed.cards || []) {
					if (!card?.uuid) continue;
					const bucket = owners.get(card.uuid) || new Set<string>();
					bucket.add(entry.path);
					owners.set(card.uuid, bucket);
				}
			} catch (error) {
				logger.warn(`[DataManagement] 读取 WDeck 覆盖信息失败: ${entry.path}`, error);
			}
		}

		return owners;
	}

	private async verifyLegacyCardsCoveredByWDeck(): Promise<{
		legacyCount: number;
		missingCardUUIDs: string[];
	}> {
		const legacySnapshot = await this.readLegacyMemorySnapshot();
		const owners = await this.getWDeckCardUUIDOwners();
		const missingCardUUIDs = legacySnapshot.cards
			.map((card) => card.uuid)
			.filter((uuid): uuid is string => typeof uuid === "string" && uuid.length > 0)
			.filter((uuid) => !owners.has(uuid));

		return {
			legacyCount: legacySnapshot.cards.length,
			missingCardUUIDs,
		};
	}

	private async fixLegacyMemoryFiles(options: DataFixOptions = {}): Promise<DataFixResult> {
		if (!options.allowHighRisk) {
			return this.buildBlockedFixResult(
				"legacy_memory_files",
				"旧记忆 JSON 清理会删除历史卡片文件，必须在明确确认后执行。"
			);
		}

		const beforeFiles = await this.getLegacyMemoryFilePaths();
		if (beforeFiles.length === 0) {
			return {
				type: "legacy_memory_files",
				success: 0,
				failed: 0,
				errors: [],
			};
		}

		const plan = await this.planWDeckMigration();
		if (plan.candidates.length > 0) {
			const migrationResult = await this.executeWDeckMigration({ confirmed: true });
			if (migrationResult.failed > 0) {
				return {
					type: "legacy_memory_files",
					success: migrationResult.success,
					failed: migrationResult.failed,
					errors: migrationResult.errors,
				};
			}
		}

		const coverage = await this.verifyLegacyCardsCoveredByWDeck();
		if (coverage.missingCardUUIDs.length > 0) {
			return {
				type: "legacy_memory_files",
				success: 0,
				failed: coverage.missingCardUUIDs.length,
				errors: coverage.missingCardUUIDs.slice(0, 20).map((uuid) => ({
					uuid,
					error: "该卡片尚未进入任何 .wdeck，已阻止自动清理旧 JSON。",
				})),
			};
		}

		await this.cleanupMigratedLegacyMemoryFiles();
		let emptyLegacyDirCleanupError: string | null = null;
		try {
			await cleanupUnusedLegacyMemoryStorage(
				this.plugin.app,
				this.plugin.settings?.weaveParentFolder
			);
		} catch (error) {
			emptyLegacyDirCleanupError = error instanceof Error ? error.message : String(error);
			logger.warn("[DataManagement] 清理空的旧记忆目录失败", error);
		}
		this.plugin.cardFileService?.clearCache?.();
		const remainingFiles = await this.getLegacyMemoryFilePaths();
		if (remainingFiles.length === 0) {
			(this.plugin as Partial<WeavePlugin>).cardFileService = undefined;
		}
		await this.plugin.wdeckService?.rebuildCache();
		const errors = remainingFiles.map((filePath) => ({
			uuid: filePath,
			error: "文件仍然存在，清理未完成。",
		}));
		if (emptyLegacyDirCleanupError) {
			errors.push({
				uuid: "legacy_memory_dirs",
				error: `空的旧记忆目录清理失败: ${emptyLegacyDirCleanupError}`,
			});
		}
		return {
			type: "legacy_memory_files",
			success: beforeFiles.length - remainingFiles.length,
			failed: remainingFiles.length + (emptyLegacyDirCleanupError ? 1 : 0),
			errors,
		};
	}

	private async fixWDeckConflicts(): Promise<DataFixResult> {
		if (!this.plugin.wdeckService) {
			return {
				type: "wdeck_conflicts",
				success: 0,
				failed: 1,
				errors: [{ uuid: "wdeck_conflicts", error: "WDeckService 未启用" }],
			};
		}

		const report = await this.plugin.wdeckService.getConflictReport(true);
		const uuidIssues = report.issues.filter(
			(issue) => issue.type === "uuid_conflict" && typeof issue.cardUUID === "string" && issue.cardUUID.trim()
		);
		const invalidFileIssues = report.issues.filter((issue) => issue.type === "invalid_file");
		const errors: Array<{ uuid: string; error: string }> = [];
		let removedInvalidFiles = 0;

		for (const issue of invalidFileIssues) {
			for (const filePath of issue.filePaths) {
				try {
					if (!(await this.plugin.app.vault.adapter.exists(filePath))) {
						continue;
					}

					const raw = await this.plugin.app.vault.adapter.read(filePath);
					if (raw.trim().length > 0) {
						errors.push({
							uuid: filePath,
							error: "该 .wdeck 文件不是空文件，暂不自动修复，请人工检查文件内容。",
						});
						continue;
					}

					await this.plugin.app.vault.adapter.remove(filePath);
					removedInvalidFiles += 1;
				} catch (error) {
					errors.push({
						uuid: filePath,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		if (uuidIssues.length === 0 && removedInvalidFiles === 0) {
			return this.buildBlockedFixResult(
				"wdeck_conflicts",
				report.issues.length > 0
					? "当前剩余的是重复分卷、疑似复制副本，或不是空文件的无效 .wdeck，暂不支持自动修复。"
					: "当前没有 .wdeck 冲突。"
			);
		}

		const [cards, decks] = await Promise.all([
			this.plugin.dataStorage.getCards(),
			this.plugin.dataStorage.getDecks(),
		]);
		const cardsByUUID = new Map(cards.map((card) => [String(card.uuid || "").trim(), card] as const));
		const deckById = new Map(decks.map((deck) => [String(deck.id || "").trim(), deck] as const));
		const groupedTargets = new Map<string, { deck: { id: string; name: string }; cards: Card[] }>();

		for (const issue of uuidIssues) {
			const uuid = String(issue.cardUUID || "").trim();
			if (!uuid) {
				continue;
			}

			const card = cardsByUUID.get(uuid);
			if (!card) {
				errors.push({
					uuid,
					error: "无法读取该卡片的权威内容，无法自动判断应保留到哪个 .wdeck。",
				});
				continue;
			}

			const membership = getCardDeckIds(card, decks, { fallbackToReferences: false }).deckIds;
			const formalDeckId = membership.find((deckId) => deckById.get(deckId)?.purpose !== "test");
			const formalDeck = formalDeckId ? deckById.get(formalDeckId) : undefined;
			const targetDeck =
				formalDeck && formalDeck.purpose !== "test"
					? { id: formalDeck.id, name: formalDeck.name }
					: { id: WDECK_UNGROUPED_DECK_NAME, name: WDECK_UNGROUPED_DECK_NAME };
			const groupKey = `${targetDeck.id}::${targetDeck.name}`;
			const bucket = groupedTargets.get(groupKey) || { deck: targetDeck, cards: [] };
			bucket.cards.push(card);
			groupedTargets.set(groupKey, bucket);
		}

		for (const { deck, cards: bucketCards } of groupedTargets.values()) {
			try {
				await this.plugin.wdeckService.saveCardsToDeck(deck, bucketCards);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				for (const card of bucketCards) {
					errors.push({
						uuid: card.uuid,
						error: message,
					});
				}
			}
		}

		const refreshedReport = await this.plugin.wdeckService.getConflictReport(true);
		const remainingIssues = refreshedReport.issues.filter(
			(issue) => issue.type === "uuid_conflict" || issue.type === "duplicate_segment" || issue.type === "suspected_duplicate_copy"
		);
		const remainingUUIDIssues = refreshedReport.issues.filter((issue) => issue.type === "uuid_conflict");
		const unresolvedErrors = remainingIssues.map((issue) => ({
			uuid: issue.cardUUID || issue.filePaths.join(", "),
			error: issue.message,
		}));
		const resolvedCount = Math.max(0, uuidIssues.length - remainingUUIDIssues.length);

		return {
			type: "wdeck_conflicts",
			success: resolvedCount + removedInvalidFiles,
			failed: errors.length + unresolvedErrors.length,
			errors: [...errors, ...unresolvedErrors],
		};
	}

	async checkLegacyMemoryFiles(): Promise<DataCheckResult> {
		const files = await this.getLegacyMemoryFilePaths();
		return {
			type: "legacy_memory_files",
			status: files.length > 0 ? "warning" : "ok",
			count: files.length,
			items: files,
			message:
				files.length > 0
					? `检测到 ${files.length} 个旧记忆 JSON 残留文件，说明还没有完全收敛到 .wdeck。`
					: "未检测到旧记忆 JSON 残留文件",
		};
	}

	async checkWDeckConflicts(): Promise<DataCheckResult> {
		if (!this.plugin.wdeckService) {
			return {
				type: "wdeck_conflicts",
				status: "ok",
				count: 0,
				items: [],
				message: "WDeckService 未启用",
			};
		}

		const report = await this.plugin.wdeckService.getConflictReport();
		return {
			type: "wdeck_conflicts",
			status: report.issues.length > 0 ? "error" : "ok",
			count: report.issues.length,
			items: report.issues.map((issue) => issue.message),
			message:
				report.issues.length > 0
					? `检测到 ${report.issues.length} 个 .wdeck 冲突或重复问题`
					: "未检测到 .wdeck 冲突",
		};
	}

	async checkWDeckCache(): Promise<DataCheckResult> {
		if (!this.plugin.wdeckService) {
			return {
				type: "wdeck_cache",
				status: "ok",
				count: 0,
				items: [],
				message: "WDeckService 未启用",
			};
		}

		const status = await this.plugin.wdeckService.getCacheStatus();
		const cacheRoot = getPluginPaths(this.plugin.app).cache.root;
		return {
			type: "wdeck_cache",
			status: status.needsRebuild ? "warning" : "ok",
			count: status.needsRebuild ? 1 : 0,
			items: status.needsRebuild ? [`\`${cacheRoot}\` 中的 .wdeck 缓存需要重建`] : [],
			message: status.needsRebuild
				? "`.wdeck` 私有缓存缺失或已失效，建议重建"
				: `".wdeck" 私有缓存正常（${status.fileCount} 个文件，${status.issueCount} 个冲突项）`,
		};
	}

	async fixWDeckCache(): Promise<DataFixResult> {
		if (!this.plugin.wdeckService) {
			return {
				type: "wdeck_cache",
				success: 0,
				failed: 1,
				errors: [{ uuid: "wdeck_cache", error: "WDeckService 未启用" }],
			};
		}

		try {
			await this.plugin.wdeckService.rebuildCache();
			return {
				type: "wdeck_cache",
				success: 1,
				failed: 0,
				errors: [],
			};
		} catch (error) {
			return {
				type: "wdeck_cache",
				success: 0,
				failed: 1,
				errors: [{ uuid: "wdeck_cache", error: error instanceof Error ? error.message : String(error) }],
			};
		}
	}

	private getStructuredDataKindLabel(kind: StructuredDataFileKind): string {
		switch (kind) {
			case "wdeck":
				return ".wdeck";
			case "irdeck":
				return ".irdeck";
			case "qbank":
				return ".qbank";
			default:
				return kind;
		}
	}

	private async listStructuredDataFiles(): Promise<Array<{ kind: StructuredDataFileKind; path: string }>> {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const roots: Array<{ kind: StructuredDataFileKind; root: string; extension: string }> = [
			{ kind: "wdeck", root: v2Paths.memory.root, extension: ".wdeck" },
			{ kind: "irdeck", root: v2Paths.ir.root, extension: ".irdeck" },
			{ kind: "qbank", root: v2Paths.questionBank.root, extension: ".qbank" },
		];
		const vaultAny = this.plugin.app.vault as {
			getFiles?: () => Array<{ path: string; extension?: string }>;
		};

		if (typeof vaultAny.getFiles === "function") {
			return roots.flatMap(({ kind, root, extension }) =>
				vaultAny
					.getFiles?.()
					.filter(
						(file) =>
							typeof file.path === "string" &&
							file.path.startsWith(root) &&
							file.path.toLowerCase().endsWith(extension)
					)
					.map((file) => ({ kind, path: file.path })) || []
			);
		}

		const adapter = this.plugin.app.vault.adapter;
		const results: Array<{ kind: StructuredDataFileKind; path: string }> = [];
		for (const { kind, root, extension } of roots) {
			if (!(await adapter.exists(root))) {
				continue;
			}
			const stack = [root];
			while (stack.length > 0) {
				const current = stack.pop();
				if (!current) {
					continue;
				}
				let listing: { files?: string[]; folders?: string[] };
				try {
					listing = await adapter.list(current);
				} catch {
					continue;
				}
				for (const folder of listing.folders || []) {
					stack.push(folder);
				}
				for (const filePath of listing.files || []) {
					if (typeof filePath === "string" && filePath.toLowerCase().endsWith(extension)) {
						results.push({ kind, path: filePath });
					}
				}
			}
		}

		return results;
	}

	private async inspectStructuredDataFormatIssues(): Promise<StructuredDataFormatIssue[]> {
		const adapter = this.plugin.app.vault.adapter;
		const wdeckService = this.plugin.wdeckService ?? new WDeckService(this.plugin);
		const pointStorageService = new IRPointStorageService(this.plugin.app);
		const questionBankStorage = this.plugin.questionBankStorage ?? new QuestionBankStorage(this.plugin.app);
		const files = await this.listStructuredDataFiles();
		const issues: StructuredDataFormatIssue[] = [];

		for (const file of files) {
			let raw = "";
			try {
				raw = await adapter.read(file.path);
			} catch (error) {
				issues.push({
					kind: file.kind,
					path: file.path,
					repairable: false,
					reason: `读取失败：${error instanceof Error ? error.message : String(error)}`,
				});
				continue;
			}

			if (!raw.trim()) {
				const canRestoreBackup =
					file.kind === "wdeck"
						? await wdeckService.hasRecoverableBackup(file.path)
						: false;
				issues.push({
					kind: file.kind,
					path: file.path,
					repairable: canRestoreBackup,
					reason: canRestoreBackup
						? "文件为空，但存在可恢复的有效备份"
						: "文件为空，无法安全自动修复",
					repairStrategy: canRestoreBackup ? "restore_backup" : undefined,
				});
				continue;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				const canRestoreBackup =
					file.kind === "wdeck"
						? await wdeckService.hasRecoverableBackup(file.path)
						: false;
				issues.push({
					kind: file.kind,
					path: file.path,
					repairable: canRestoreBackup,
					reason: canRestoreBackup
						? "内容不是合法 JSON，但存在可恢复的有效备份"
						: "内容不是合法 JSON，无法安全自动修复",
					repairStrategy: canRestoreBackup ? "restore_backup" : undefined,
				});
				continue;
			}

			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				const canRestoreBackup =
					file.kind === "wdeck"
						? await wdeckService.hasRecoverableBackup(file.path)
						: false;
				issues.push({
					kind: file.kind,
					path: file.path,
					repairable: canRestoreBackup,
					reason: canRestoreBackup
						? "JSON 根结构不是对象，但存在可恢复的有效备份"
						: "JSON 根结构不是对象，无法安全自动修复",
					repairStrategy: canRestoreBackup ? "restore_backup" : undefined,
				});
				continue;
			}

			let normalized: Record<string, unknown>;
			switch (file.kind) {
				case "wdeck":
					normalized = wdeckService.normalizeDeckFileDataForPersistence(
						parsed as Partial<WDeckFileData> & Record<string, unknown>,
						file.path
					);
					break;
				case "irdeck":
					normalized = pointStorageService.normalizePointFileDataForPersistence(
						parsed as Record<string, unknown>,
						file.path
					) as unknown as Record<string, unknown>;
					break;
				case "qbank":
					normalized = questionBankStorage.normalizeQBankFileDataForPersistence(
						parsed as Partial<QBankFileData> & Record<string, unknown>,
						file.path
					);
					break;
			}

			if (JSON.stringify(parsed) === JSON.stringify(normalized)) {
				continue;
			}

			issues.push({
				kind: file.kind,
				path: file.path,
				repairable: true,
				reason: "可按当前插件规范重写为稳定结构",
				normalizedContent: `${JSON.stringify(normalized, null, 2)}\n`,
				repairStrategy: "rewrite",
			});
		}

		return issues;
	}

	async checkStructuredDataFormat(): Promise<DataCheckResult> {
		const issues = await this.inspectStructuredDataFormatIssues();
		const repairable = issues.filter((issue) => issue.repairable);
		const manual = issues.filter((issue) => !issue.repairable);

		return {
			type: "structured_data_format",
			status: manual.length > 0 ? "error" : issues.length > 0 ? "warning" : "ok",
			count: issues.length,
			items: issues.map(
				(issue) =>
					`${issue.repairable ? "[可自动修复]" : "[需人工处理]"} ${this.getStructuredDataKindLabel(issue.kind)} ${issue.path} - ${issue.reason}`
			),
			message:
				issues.length === 0
					? "未发现 .wdeck / .irdeck / .qbank 结构化数据文件格式问题"
					: `发现 ${issues.length} 个结构化数据文件格式问题（可自动修复 ${repairable.length}，需人工处理 ${manual.length}）`,
		};
	}

	async fixStructuredDataFormat(): Promise<DataFixResult> {
		const issues = await this.inspectStructuredDataFormatIssues();
		const adapter = this.plugin.app.vault.adapter;
		const wdeckService = this.plugin.wdeckService ?? new WDeckService(this.plugin);
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		for (const issue of issues) {
			if (!issue.repairable) {
				failed += 1;
				errors.push({ uuid: issue.path, error: issue.reason });
				continue;
			}

			try {
				if (issue.kind === "wdeck" && issue.repairStrategy === "restore_backup") {
					const restored = await wdeckService.restoreDeckFileFromBackup(issue.path);
					if (!restored) {
						throw new Error("未找到可恢复的有效备份");
					}
				} else {
					if (!issue.normalizedContent) {
						throw new Error("缺少可写回的规范化内容");
					}
					await safeWriteJson(adapter as any, issue.path, issue.normalizedContent, this.plugin.app as any);
				}
				success += 1;
			} catch (error) {
				failed += 1;
				errors.push({
					uuid: issue.path,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		if (success > 0 && this.plugin.wdeckService) {
			try {
				await this.plugin.wdeckService.rebuildCache();
			} catch (error) {
				failed += 1;
				errors.push({
					uuid: "wdeck_cache",
					error: `结构化文件修复后重建 .wdeck 缓存失败: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		return {
			type: "structured_data_format",
			success,
			failed,
			errors,
		};
	}

	async checkStructure(): Promise<DataCheckResult> {
		const adapter = this.plugin.app.vault.adapter;
		const issues: string[] = [];

		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);

		// 预期的 V2 目录结构
		const expectedDirs = [
			v2Paths.memory.root,
			v2Paths.memory.learning.root,
			v2Paths.ir.root,
			v2Paths.questionBank.root,
		];

		for (const dir of expectedDirs) {
			if (!(await adapter.exists(dir))) {
				issues.push(`缺少目录: ${dir}`);
			}
		}

		const irImportFolder = resolveIRImportFolder(
			this.plugin.settings?.incrementalReading?.importFolder,
			this.plugin.settings?.weaveParentFolder
		);
		if (irImportFolder === ".weave" || irImportFolder.startsWith(".weave/")) {
			issues.push(`旧导入/复制兼容目录不应位于隐藏目录: ${irImportFolder}`);
		}

		// 检查旧导入/复制兼容目录不应位于内部数据子目录（memory/cards, question-bank 等）
		const internalDirs = [
			v2Paths.memory.cards,
			v2Paths.memory.learning.root,
			v2Paths.questionBank.root,
		];
		for (const intDir of internalDirs) {
			if (irImportFolder === intDir || irImportFolder.startsWith(`${intDir}/`)) {
				issues.push(`旧导入/复制兼容目录不应位于内部数据目录: ${irImportFolder}`);
				break;
			}
		}

		return {
			type: "structure_check",
			status: issues.length > 0 ? "warning" : "ok",
			count: issues.length,
			items: issues,
			message: issues.length > 0 ? `目录结构不完整，缺少 ${issues.length} 个目录` : "目录结构完整",
		};
	}

	/**
	 * 修复目录结构：创建缺失的目录
	 */
	async fixStructure(): Promise<DataFixResult> {
		const adapter = this.plugin.app.vault.adapter;
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);

		const expectedDirs = [
			v2Paths.memory.root,
			v2Paths.memory.learning.root,
			v2Paths.ir.root,
			v2Paths.questionBank.root,
		];

		for (const dir of expectedDirs) {
			if (!(await adapter.exists(dir))) {
				try {
					const { DirectoryUtils } = await import("../../utils/directory-utils");
					await DirectoryUtils.ensureDirRecursive(adapter, dir);
					success++;
					logger.info(`[DataManagement] 创建缺失目录: ${dir}`);
				} catch (error) {
					failed++;
					errors.push({ uuid: dir, error: String(error) });
				}
			}
		}

		return { type: "structure_check", success, failed, errors };
	}

	/**
	 * 检测旧目录
	 */
	async checkLegacyDirectories(): Promise<DataCheckResult> {
		const adapter = this.plugin.app.vault.adapter;
		const legacyDirs = new Set<string>();

		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);

		const v2Paths = getV2Paths(parentFolder);

		// 旧版本可能存在的目录（不包含当前活跃目录）
		const possibleLegacyDirs = [
			LEGACY_DOT_TUANKI,
			// v1.x 旧路径
			"weave/flashcards",
			"weave/decks",
			"weave/cards",
			"weave/_shared",
			"weave/indices",
			"weave/learning",
			"weave/reading-materials",
			"weave/temp",
			"weave/sessions",
			"weave/weave_media",
			`${v2Paths.root}/_migration_conflicts`,
			// v2.x _data/ 中间层旧路径
			`${v2Paths.root}/_data`,
			`${v2Paths.root}/_data/memory`,
			`${v2Paths.root}/_data/incremental-reading`,
			`${v2Paths.root}/_data/question-bank`,
			`${v2Paths.root}/_data/profile`,
			`${v2Paths.root}/_data/decks`,
			// v2.x 旧 IR 位置（现在应在 incremental-reading/IR 下）
			`${v2Paths.root}/IR`,
			// 隐藏文件/标记
			`${v2Paths.root}/.temp`,
		];

		if (parentFolder) {
			possibleLegacyDirs.push(`${parentFolder}/${LEGACY_DOT_TUANKI}`);
		}

		for (const dir of possibleLegacyDirs) {
			if (await adapter.exists(dir)) {
				legacyDirs.add(dir);
			}
		}

		try {
			const cleanupCandidates = await getUnusedLegacyMemoryStorageCandidates(
				this.plugin.app,
				this.plugin.settings?.weaveParentFolder
			);
			for (const candidate of cleanupCandidates) {
				legacyDirs.add(candidate.dir);
			}
		} catch (error) {
			logger.warn("[DataManagement] 检查旧记忆目录候选失败:", error);
		}

		const items = Array.from(legacyDirs);

		return {
			type: "legacy_cleanup",
			status: items.length > 0 ? "warning" : "ok",
			count: items.length,
			items,
			message: items.length > 0 ? `发现 ${items.length} 个旧目录可清理` : "无旧目录",
		};
	}

	/**
	 * 清理旧目录
	 */
	async cleanupLegacyDirectories(options: DataFixOptions = {}): Promise<DataFixResult> {
		if (!options.allowHighRisk) {
			return this.buildBlockedFixResult(
				"legacy_cleanup",
				"旧目录清理会删除历史数据目录，必须在明确确认后单独执行。"
			);
		}

		const adapter = this.plugin.app.vault.adapter;
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		const tryRemoveRecursive = async (dir: string, depth: number): Promise<boolean> => {
			if (depth <= 0) return false;
			try {
				if (!(await adapter.exists(dir))) return true;

				const listing = await (adapter as any).list(dir);
				const files: string[] = listing?.files || [];
				const folders: string[] = listing?.folders || [];

				// 先递归删除子目录
				for (const folder of folders) {
					await tryRemoveRecursive(folder, depth - 1);
				}

				// 删除文件
				for (const file of files) {
					try {
						await adapter.remove(file);
					} catch {
						logger.debug(`[DataManagement] 删除旧文件失败: ${file}`);
					}
				}

				// 最后删除目录本身
				try {
					await adapter.rmdir(dir, false);
					return true;
				} catch {
					// 再尝试强制删除
					try {
						await adapter.rmdir(dir, true);
						return true;
					} catch {
						return false;
					}
				}
			} catch {
				return false;
			}
		};

		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		const conflictsDir = `${v2Paths.root}/_migration_conflicts`;
		const latestReport = await this.getLatestMigrationReport();
		if (!latestReport || latestReport.status !== "completed" || !latestReport.verification?.ok) {
			return this.buildBlockedFixResult(
				"legacy_cleanup",
				"未找到已完成且校验通过的迁移报告，旧目录清理已阻止。"
			);
		}
		if (latestReport.plan.targetRoot !== v2Paths.root) {
			return this.buildBlockedFixResult(
				"legacy_cleanup",
				"迁移报告对应的数据根目录与当前配置不一致，旧目录清理已阻止。"
			);
		}

		try {
			const recovered = await this.recoverMigrationConflictData();
			if (
				recovered.importedCards > 0 ||
				recovered.importedDecks > 0 ||
				recovered.deletedCardFiles > 0 ||
				recovered.mergedCardFiles > 0 ||
				recovered.mergedIRMonitoringFiles > 0 ||
				recovered.renamedManifests > 0
			) {
				success += 1;
			}
			for (const error of recovered.errors) {
				errors.push({ uuid: conflictsDir, error });
			}
			if (recovered.errors.length > 0) {
				return {
					type: "legacy_cleanup",
					success,
					failed: recovered.errors.length,
					errors,
				};
			}
		} catch (error) {
			failed += 1;
			errors.push({ uuid: conflictsDir, error: String(error) });
			return {
				type: "legacy_cleanup",
				success,
				failed,
				errors,
			};
		}

		try {
			const legacyMemoryCleanup = await cleanupUnusedLegacyMemoryStorage(
				this.plugin.app,
				this.plugin.settings?.weaveParentFolder
			);
			success += legacyMemoryCleanup.removedDirs.length;
			for (const filePath of legacyMemoryCleanup.removedFiles) {
				logger.info(`[DataManagement] 删除空旧记忆文件: ${filePath}`);
			}
			for (const dirPath of legacyMemoryCleanup.removedDirs) {
				logger.info(`[DataManagement] 删除空旧记忆目录: ${dirPath}`);
			}
		} catch (error) {
			errors.push({ uuid: "legacy-memory-storage", error: String(error) });
		}

		let keepConflictsDir = false;
		if (await adapter.exists(conflictsDir)) {
			try {
				const listing = await (adapter as any).list(conflictsDir);
				keepConflictsDir = (listing?.files || []).length > 0 || (listing?.folders || []).length > 0;
			} catch {
				keepConflictsDir = true;
			}
		}

		// 迁移 weave/media/ → weave/memory/media/（v3.0 媒体归属 memory 模块）
		try {
			const oldMediaDir = `${v2Paths.root}/media`;
			const newMediaDir = v2Paths.memory.media;
			if (await adapter.exists(oldMediaDir)) {
				const stat = await adapter.stat(oldMediaDir);
				if (stat && stat.type === "folder") {
					if (!(await adapter.exists(newMediaDir))) {
						const { DirectoryUtils } = await import("../../utils/directory-utils");
						await DirectoryUtils.ensureDirRecursive(adapter, newMediaDir);
					}
					const listing = await (adapter as any).list(oldMediaDir);
					const items = [...(listing.files || []), ...(listing.folders || [])];
					for (const item of items) {
						const name = item.split("/").pop() || "";
						if (!name) continue;
						const dest = `${newMediaDir}/${name}`;
						if (!(await adapter.exists(dest))) {
							try {
								await (adapter as any).rename(item, dest);
								success++;
								logger.info(`[DataManagement] 迁移媒体: ${item} → ${dest}`);
							} catch (e) {
								errors.push({ uuid: item, error: String(e) });
							}
						}
					}
				}
			}
		} catch (error) {
			errors.push({ uuid: "media_migration", error: String(error) });
		}

		// 按深度从深到浅删除（不包含当前活跃目录）
		const legacyDirs = [
			// 旧隐藏数据目录
			LEGACY_DOT_TUANKI,
			...(parentFolder ? [`${parentFolder}/${LEGACY_DOT_TUANKI}`] : []),
			// v1.x 旧路径
			"weave/flashcards/decks",
			"weave/flashcards/cards",
			"weave/flashcards/learning/sessions",
			"weave/flashcards/learning",
			"weave/flashcards",
			"weave/decks",
			"weave/cards",
			"weave/_shared/profile",
			"weave/_shared",
			"weave/indices",
			"weave/learning/sessions",
			"weave/learning",
			"weave/temp",
			"weave/reading-materials",
			"weave/sessions",
			"weave/weave_media",
			// v2.x _data/ 中间层旧路径（从深到浅）
			`${v2Paths.root}/_data/memory/cards`,
			`${v2Paths.root}/_data/memory/learning/sessions`,
			`${v2Paths.root}/_data/memory/learning`,
			`${v2Paths.root}/_data/memory/media`,
			`${v2Paths.root}/_data/memory`,
			`${v2Paths.root}/_data/incremental-reading/materials`,
			`${v2Paths.root}/_data/incremental-reading`,
			`${v2Paths.root}/_data/question-bank/test-history`,
			`${v2Paths.root}/_data/question-bank/in-progress`,
			`${v2Paths.root}/_data/question-bank/error-book`,
			`${v2Paths.root}/_data/question-bank`,
			`${v2Paths.root}/_data/profile`,
			`${v2Paths.root}/_data/decks`,
			`${v2Paths.root}/_data`,
			// v2.x 旧 IR 位置（现在应在 incremental-reading/IR 下）
			`${v2Paths.root}/IR`,
			// 隐藏目录/文件
			`${v2Paths.root}/.temp`,
			// v3.0 合并后的旧 QB 子目录
			`${v2Paths.root}/question-bank/test-history`,
			`${v2Paths.root}/question-bank/in-progress`,
			`${v2Paths.root}/question-bank/error-book`,
			`${v2Paths.root}/question-bank/session-archives`,
			`${v2Paths.root}/question-bank/test-sessions`,
			// 迁移残留
			`${v2Paths.root}/profile`,
			`${v2Paths.root}/_migration_conflicts`,
			// v3.0 媒体迁移后的旧根级目录
			`${v2Paths.root}/media`,
		];

		for (const dir of legacyDirs) {
			try {
				if (await adapter.exists(dir)) {
					if (dir === conflictsDir && keepConflictsDir) {
						logger.info(`[DataManagement] 保留迁移冲突目录，等待人工复核: ${dir}`);
						continue;
					}
					const removed = await tryRemoveRecursive(dir, 8);
					if (removed) {
						success++;
						logger.info(`[DataManagement] 删除旧目录: ${dir}`);
					}
				}
			} catch (error) {
				failed++;
				errors.push({ uuid: dir, error: String(error) });
			}
		}

		const orphanFiles = [`${v2Paths.root}/editor-host.md`, `${v2Paths.root}/migration-completed`];
		for (const file of orphanFiles) {
			try {
				if (await adapter.exists(file)) {
					await adapter.remove(file);
					success++;
					logger.info(`[DataManagement] 删除残留文件: ${file}`);
				}
			} catch (error) {
				errors.push({ uuid: file, error: String(error) });
			}
		}

		return {
			type: "legacy_cleanup",
			success,
			failed,
			errors,
		};
	}

	private async importMigrationConflicts(
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<{ importedCards: number; importedDecks: number; errors: string[] }> {
		const adapter = this.plugin.app.vault.adapter as any;
		const conflictDir = `${v2Paths.root}/_migration_conflicts`;

		const result = { importedCards: 0, importedDecks: 0, errors: [] as string[] };

		const basePath: string | undefined = adapter?.basePath;
		if (!basePath) {
			result.errors.push("无法获取 Vault 基础路径，跳过冲突文件导入");
			return result;
		}

		const vaultAdapter = this.plugin.app.vault.adapter;

		if (!(await vaultAdapter.exists(conflictDir))) {
			return result;
		}

		let allFileNames: string[];
		try {
			const listing = await vaultAdapter.list(conflictDir);
			allFileNames = listing.files.map((f) => f.split("/").pop() || "");
		} catch (e) {
			result.errors.push(`读取 _migration_conflicts 目录失败: ${String(e)}`);
			return result;
		}

		const cardFileNames = allFileNames.filter((f) =>
			/^\.?weave_memory_cards_.*\.json-\d+$/.test(f)
		);
		const deckFileNames = allFileNames.filter((f) => /^\.?weave_memory_decks\.json-\d+$/.test(f));
		const handledConflictFileNames = [...deckFileNames, ...cardFileNames];

		const readConflictFile = async (fileName: string): Promise<string | null> => {
			try {
				return await vaultAdapter.read(`${conflictDir}/${fileName}`);
			} catch (e) {
				result.errors.push(`读取冲突文件失败: ${fileName} (${String(e)})`);
				return null;
			}
		};

		const importedCardsByUuid = new Map<string, Card>();
		const deckNameById = new Map<string, string>();
		const importedDecksById = new Map<string, Deck>();

		let currentDeckStore: any = { decks: [] as Deck[] };
		try {
			if (await this.plugin.app.vault.adapter.exists(v2Paths.memory.decks)) {
				const raw = await this.plugin.app.vault.adapter.read(v2Paths.memory.decks);
				currentDeckStore = JSON.parse(raw);
			}
		} catch {}
		const currentDecks: Deck[] = Array.isArray(currentDeckStore?.decks)
			? currentDeckStore.decks
			: [];
		const currentDeckById = new Map<string, Deck>();
		const currentDeckIdByName = new Map<string, string>();
		for (const d of currentDecks) {
			if (d?.id) {
				currentDeckById.set(d.id, d);
			}
			if (typeof d?.name === "string" && d.name.trim()) {
				currentDeckIdByName.set(d.name.trim().toLowerCase(), d.id);
			}
		}

		const deckIdRemap = new Map<string, string>();

		for (const deckFileName of deckFileNames) {
			try {
				const raw = await readConflictFile(deckFileName);
				if (!raw) continue;
				const parsed = JSON.parse(raw);
				const decks = Array.isArray(parsed?.decks) ? (parsed.decks as Deck[]) : [];
				for (const d of decks) {
					if (!d?.id) continue;
					importedDecksById.set(d.id, d);
					if (typeof d.name === "string" && d.name.trim()) {
						const name = d.name.trim();
						deckNameById.set(d.id, name);
						const existingId = currentDeckIdByName.get(name.toLowerCase());
						if (existingId) {
							deckIdRemap.set(d.id, existingId);
						}
					}
				}
			} catch (e) {
				result.errors.push(`解析牌组冲突文件失败: ${deckFileName} (${String(e)})`);
			}
		}

		for (const cardFileName of cardFileNames) {
			try {
				const raw = await readConflictFile(cardFileName);
				if (!raw) continue;
				const parsed = JSON.parse(raw);
				const cards = Array.isArray(parsed?.cards) ? (parsed.cards as Card[]) : [];
				for (const c of cards) {
					if (!c?.uuid || typeof c.uuid !== "string") continue;

					const originalDeckId = (c as any).deckId as string | undefined;
					const deckId = originalDeckId
						? deckIdRemap.get(originalDeckId) || originalDeckId
						: undefined;
					const deckName = deckId
						? currentDeckById.get(deckId)?.name ||
						  (originalDeckId ? deckNameById.get(originalDeckId) : undefined)
						: undefined;
					let nextContent = c.content || "";
					if (deckName) {
						try {
							const yaml = parseYAMLFromContent(nextContent);
							const existing = Array.isArray((yaml as any)?.we_decks) ? (yaml as any).we_decks : [];
							if (!existing || existing.length === 0) {
								nextContent = setCardProperties(nextContent, { we_decks: [deckName] });
							}
						} catch {}
					}

					importedCardsByUuid.set(c.uuid, { ...(c as any), deckId, content: nextContent } as any);
				}
			} catch (e) {
				result.errors.push(`解析卡片冲突文件失败: ${cardFileName} (${String(e)})`);
			}
		}

		const importedCards = Array.from(importedCardsByUuid.values());
		if (importedCards.length > 0) {
			try {
				if (
					this.plugin.dataStorage &&
					typeof this.plugin.dataStorage.saveCardsBatch === "function"
				) {
					await this.plugin.dataStorage.saveCardsBatch(importedCards);
				} else if (this.plugin.cardFileService) {
					await this.plugin.cardFileService.saveCardsBatch(importedCards);
				} else {
					const fallbackPath = `${v2Paths.memory.cards}/default.json`;
					let existing: any = { cards: [] as Card[] };
					try {
						if (await this.plugin.app.vault.adapter.exists(fallbackPath)) {
							const raw = await this.plugin.app.vault.adapter.read(fallbackPath);
							existing = JSON.parse(raw);
						}
					} catch {}

					const map = new Map<string, Card>();
					for (const c of existing?.cards || []) {
						if (c?.uuid) map.set(c.uuid, c);
					}
					for (const c of importedCards) {
						map.set(c.uuid, c);
					}
					await this.plugin.app.vault.adapter.write(
						fallbackPath,
						JSON.stringify({ cards: Array.from(map.values()) })
					);
				}

				result.importedCards = importedCards.length;
			} catch (e) {
				result.errors.push(`导入卡片到新结构失败: ${String(e)}`);
			}
		}

		try {
			const decksPath = v2Paths.memory.decks;
			const deckById = new Map<string, Deck>(Array.from(currentDeckById.entries()));

			const uuidsByDeckId = new Map<string, Set<string>>();
			for (const c of importedCards) {
				const deckId = (c as any).deckId as string | undefined;
				if (!deckId) continue;
				const set = uuidsByDeckId.get(deckId) || new Set<string>();
				set.add(c.uuid);
				uuidsByDeckId.set(deckId, set);
			}

			for (const d of importedDecksById.values()) {
				if (!d?.id) continue;
				const targetId = deckIdRemap.get(d.id) || d.id;
				if (targetId !== d.id) {
					const existing = deckById.get(targetId);
					if (existing) {
						const a = new Set<string>(Array.isArray(existing.cardUUIDs) ? existing.cardUUIDs : []);
						const b = new Set<string>(Array.isArray(d.cardUUIDs) ? d.cardUUIDs : []);
						for (const u of b) a.add(u);
						existing.cardUUIDs = Array.from(a);
						deckById.set(existing.id, existing);
					}
					continue;
				}

				if (!deckById.has(d.id)) {
					deckById.set(d.id, d);
				} else {
					const existing = deckById.get(d.id)!;
					const a = new Set<string>(Array.isArray(existing.cardUUIDs) ? existing.cardUUIDs : []);
					const b = new Set<string>(Array.isArray(d.cardUUIDs) ? d.cardUUIDs : []);
					for (const u of b) a.add(u);
					existing.cardUUIDs = Array.from(a);
					deckById.set(existing.id, existing);
				}
			}

			for (const [deckId, set] of uuidsByDeckId.entries()) {
				if (!deckById.has(deckId)) {
					const name = deckNameById.get(deckId) || deckId;
					deckById.set(deckId, {
						id: deckId,
						name,
						description: "",
						category: "",
						path: name,
						level: 0,
						order: 0,
						inheritSettings: false,
						created: new Date().toISOString(),
						modified: new Date().toISOString(),
						includeSubdecks: false,
						stats: {
							totalCards: 0,
							newCards: 0,
							learningCards: 0,
							reviewCards: 0,
							todayNew: 0,
							todayReview: 0,
							todayTime: 0,
							totalReviews: 0,
							totalTime: 0,
							memoryRate: 0,
							averageEase: 0,
							forecastDays: {},
						} as any,
						tags: [],
						metadata: {},
						cardUUIDs: [],
					} as any);
				}

				const deck = deckById.get(deckId)!;
				const existing = new Set<string>(Array.isArray(deck.cardUUIDs) ? deck.cardUUIDs : []);
				for (const u of set) existing.add(u);
				deck.cardUUIDs = Array.from(existing);
			}

			const mergedDecks = Array.from(deckById.values());
			// cardUUIDs 分离写入独立文件
			const deckCardsDir = `${v2Paths.memory.deckCards}`;
			await DirectoryUtils.ensureDirRecursive(this.plugin.app.vault.adapter, deckCardsDir);
			for (const deck of mergedDecks) {
				if (deck.cardUUIDs && deck.cardUUIDs.length > 0) {
					const uuidFilePath = `${deckCardsDir}/${deck.id}.json`;
					await this.plugin.app.vault.adapter.write(
						uuidFilePath,
						JSON.stringify({ cardUUIDs: deck.cardUUIDs })
					);
				}
			}
			// decks.json 中剥离 cardUUIDs
			const strippedDecks = mergedDecks.map((_d) => {
				const { cardUUIDs, ...rest } = _d;
				return rest;
			});
			await this.plugin.app.vault.adapter.write(
				decksPath,
				JSON.stringify({ decks: strippedDecks })
			);
			result.importedDecks = importedDecksById.size;

			if (this.plugin.deckMembershipIndexService) {
				await this.plugin.deckMembershipIndexService.markFullRebuildRequired();
			}
		} catch (e) {
			result.errors.push(`导入牌组到新结构失败: ${String(e)}`);
		}

		if (result.importedCards > 0 || result.importedDecks > 0) {
			logger.info(
				`[DataManagement] 冲突文件导入完成: 卡片=${result.importedCards}, 牌组=${result.importedDecks}`
			);
		}

		if (handledConflictFileNames.length > 0 && result.errors.length === 0) {
			const adapter = this.plugin.app.vault.adapter;
			for (const f of handledConflictFileNames) {
				try {
					const conflictPath = `${conflictDir}/${f}`;
					if (await adapter.exists(conflictPath)) {
						await adapter.remove(conflictPath);
					}
				} catch {}
			}
		}

		return result;
	}

	private stripMigrationConflictTimestamp(fileName: string): string {
		return fileName.replace(/-\d+$/, "");
	}

	private toMigrationConflictComparableName(path: string): string {
		return path.replace(/[\\/:]/g, "_").replace(/^\.+/, "");
	}

	private isStructuredJsonMigrationConflictFile(fileName: string): boolean {
		if (/weave_incremental-reading_monitoring\.json-\d+$/.test(fileName)) {
			return false;
		}

		return (
			/weave_incremental-reading_.*\.json-\d+$/.test(fileName) ||
			/weave_question-bank_.*\.json-\d+$/.test(fileName)
		);
	}

	private isPlainRecord(value: unknown): value is Record<string, unknown> {
		return !!value && typeof value === "object" && !Array.isArray(value);
	}

	private async collectJsonFilesRecursively(rootPath: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		if (!(await adapter.exists(rootPath))) {
			return [];
		}

		const files: string[] = [];
		const walk = async (dir: string): Promise<void> => {
			const listing = await adapter.list(dir);
			for (const folder of listing.folders || []) {
				await walk(folder);
			}
			for (const file of listing.files || []) {
				if (file.toLowerCase().endsWith(".json")) {
					files.push(file);
				}
			}
		};

		await walk(rootPath);
		return files;
	}

	private async getRecoverableMigrationConflictTargetCandidates(
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<Array<{ path: string; comparableName: string }>> {
		const paths = [
			...(await this.collectJsonFilesRecursively(v2Paths.ir.root)),
			...(await this.collectJsonFilesRecursively(v2Paths.questionBank.root)),
		];

		return Array.from(new Set(paths))
			.map((path) => ({
				path,
				comparableName: this.toMigrationConflictComparableName(path),
			}))
			.sort((a, b) => b.comparableName.length - a.comparableName.length);
	}

	private resolveStructuredMigrationConflictTargetPath(
		fileName: string,
		candidates: Array<{ path: string; comparableName: string }>
	): string | null {
		const comparableName = this.toMigrationConflictComparableName(
			this.stripMigrationConflictTimestamp(fileName)
		);
		const matched = candidates.find(
			(candidate) =>
				comparableName === candidate.comparableName ||
				comparableName.endsWith(candidate.comparableName)
		);
		return matched?.path || null;
	}

	private parseMigrationTimeValue(value: unknown): number {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}

		if (typeof value === "string" && value.trim()) {
			const parsed = Date.parse(value);
			return Number.isFinite(parsed) ? parsed : 0;
		}

		return 0;
	}

	private getMigrationEntryTimestamp(entry: unknown): number {
		if (!this.isPlainRecord(entry)) {
			return this.parseMigrationTimeValue(entry);
		}

		for (const key of [
			"lastUpdated",
			"modified",
			"updatedAt",
			"endTime",
			"submittedAt",
			"startTime",
			"addedAt",
			"timestamp",
			"created",
			"lastTestDate",
			"lastAccessed",
			"lastErrorDate",
			"lastCorrectDate",
			"ts",
		]) {
			const parsed = this.parseMigrationTimeValue(entry[key]);
			if (parsed > 0) {
				return parsed;
			}
		}

		return 0;
	}

	private buildMigrationArrayEntryKey(entry: unknown): string {
		if (!this.isPlainRecord(entry)) {
			return JSON.stringify(entry);
		}

		const keyGroups = [
			["uuid"],
			["id"],
			["sessionId"],
			["questionId", "bankId"],
			["cardUuid", "bankId"],
			["cardId", "bankId"],
			["materialId", "uuid"],
			["materialId", "startTime"],
			["questionId"],
			["cardUuid"],
			["cardId"],
			["date"],
			["filePath"],
			["path"],
			["itemId", "action", "timestamp"],
			["itemId", "outcomeType", "timestamp"],
			["blockId", "timestamp"],
			["groupId", "timestamp"],
			["bankId", "timestamp"],
			["bankId", "id"],
			["topicId", "id"],
			["deckId", "id"],
			["startTime", "endTime"],
			["name", "id"],
		];

		for (const keys of keyGroups) {
			const values = keys.map((key) => entry[key]);
			if (
				values.every(
					(value) =>
						value !== undefined &&
						value !== null &&
						(typeof value !== "string" || value.trim().length > 0)
				)
			) {
				return `${keys.join("+")}:${values.map((value) => String(value)).join("::")}`;
			}
		}

		return `json:${JSON.stringify(entry)}`;
	}

	private pickEarlierMigrationTimeValue(current: unknown, incoming: unknown): unknown {
		const currentTime = this.parseMigrationTimeValue(current);
		const incomingTime = this.parseMigrationTimeValue(incoming);
		if (currentTime > 0 && incomingTime > 0) {
			return currentTime <= incomingTime ? current : incoming;
		}
		return current ?? incoming;
	}

	private pickLaterMigrationTimeValue(current: unknown, incoming: unknown): unknown {
		const currentTime = this.parseMigrationTimeValue(current);
		const incomingTime = this.parseMigrationTimeValue(incoming);
		if (currentTime > 0 && incomingTime > 0) {
			return incomingTime >= currentTime ? incoming : current;
		}
		if (current === undefined || current === null || current === "") {
			return incoming;
		}
		return current;
	}

	private maybeRebuildQuestionStatsRecord(record: Record<string, unknown>): Record<string, unknown> {
		if (
			!("totalAttempts" in record) ||
			!("correctAttempts" in record) ||
			!("incorrectAttempts" in record) ||
			!Array.isArray(record.attempts)
		) {
			return record;
		}

		const attempts = record.attempts
			.filter((attempt): attempt is Record<string, unknown> => this.isPlainRecord(attempt))
			.filter((attempt) => typeof attempt.timestamp === "string" && attempt.timestamp.trim().length > 0)
			.sort(
				(a, b) =>
					this.parseMigrationTimeValue(a.timestamp) - this.parseMigrationTimeValue(b.timestamp)
			);

		if (attempts.length === 0) {
			return record;
		}

		let correctAttempts = 0;
		let incorrectAttempts = 0;
		let bestScore = 0;
		let totalScore = 0;
		let lastScore = 0;
		let totalTime = 0;
		let fastestTime = 0;
		let lastTestDate = String(attempts[attempts.length - 1]?.timestamp || record.lastTestDate || "");
		let lastIncorrectDate =
			typeof record.lastIncorrectDate === "string" ? record.lastIncorrectDate : undefined;
		let consecutiveCorrect = 0;
		let currentStreak = 0;
		let isInErrorBook = false;

		for (const attempt of attempts) {
			const isCorrect = attempt.isCorrect === true;
			const score =
				typeof attempt.score === "number" ? attempt.score : isCorrect ? 100 : 0;
			const timeSpent = typeof attempt.timeSpent === "number" ? attempt.timeSpent : 0;
			totalScore += score;
			lastScore = score;
			bestScore = Math.max(bestScore, score);

			if (timeSpent > 0) {
				totalTime += timeSpent;
				if (fastestTime === 0 || timeSpent < fastestTime) {
					fastestTime = timeSpent;
				}
			}

			if (isCorrect) {
				correctAttempts += 1;
				currentStreak += 1;
				if (isInErrorBook && currentStreak >= 3) {
					isInErrorBook = false;
				}
			} else {
				incorrectAttempts += 1;
				currentStreak = 0;
				isInErrorBook = true;
				lastIncorrectDate = String(attempt.timestamp || lastIncorrectDate || "");
			}
		}

		consecutiveCorrect = currentStreak;
		const totalAttempts = attempts.length;
		const normalizedAttempts = attempts.map((attempt) => ({
			isCorrect: attempt.isCorrect === true,
			mode: "exam" as const,
			timestamp: String(attempt.timestamp),
			score:
				typeof attempt.score === "number"
					? attempt.score
					: attempt.isCorrect === true
					? 100
					: 0,
			timeSpent: typeof attempt.timeSpent === "number" ? attempt.timeSpent : 0,
		}));

		return {
			...record,
			totalAttempts,
			correctAttempts,
			incorrectAttempts,
			accuracy: totalAttempts > 0 ? correctAttempts / totalAttempts : 0,
			masteryMetrics: accuracyCalculator.calculateMastery(normalizedAttempts as any),
			bestScore,
			averageScore: totalAttempts > 0 ? totalScore / totalAttempts : 0,
			lastScore,
			averageResponseTime: totalAttempts > 0 ? totalTime / totalAttempts : 0,
			fastestTime,
			lastTestDate,
			isInErrorBook,
			consecutiveCorrect,
			lastIncorrectDate,
		};
	}

	private mergeMigrationConflictArrays(current: unknown[], incoming: unknown[]): unknown[] {
		const merged = new Map<string, unknown>();

		for (const entry of [...current, ...incoming]) {
			const key = this.buildMigrationArrayEntryKey(entry);
			if (!merged.has(key)) {
				merged.set(key, entry);
				continue;
			}

			const existing = merged.get(key);
			if (this.isPlainRecord(existing) && this.isPlainRecord(entry)) {
				merged.set(key, this.mergeMigrationConflictObjects(existing, entry));
				continue;
			}

			if (this.getMigrationEntryTimestamp(entry) > this.getMigrationEntryTimestamp(existing)) {
				merged.set(key, entry);
			}
		}

		return Array.from(merged.values());
	}

	private mergeMigrationConflictObjects(
		current: Record<string, unknown>,
		incoming: Record<string, unknown>
	): Record<string, unknown> {
		const merged: Record<string, unknown> = { ...current };
		const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);

		for (const key of keys) {
			const currentValue = current[key];
			const incomingValue = incoming[key];

			if (incomingValue === undefined) {
				continue;
			}

			if (currentValue === undefined) {
				merged[key] = incomingValue;
				continue;
			}

			if (Array.isArray(currentValue) && Array.isArray(incomingValue)) {
				merged[key] = this.mergeMigrationConflictArrays(currentValue, incomingValue);
				continue;
			}

			if (this.isPlainRecord(currentValue) && this.isPlainRecord(incomingValue)) {
				merged[key] = this.mergeMigrationConflictObjects(currentValue, incomingValue);
				continue;
			}

			if (currentValue === null || currentValue === "") {
				merged[key] = incomingValue;
				continue;
			}

			if (incomingValue === null || incomingValue === "") {
				merged[key] = currentValue;
				continue;
			}

			if (key === "created" || key === "startTime" || key === "addedAt") {
				merged[key] = this.pickEarlierMigrationTimeValue(currentValue, incomingValue);
				continue;
			}

			if (
				[
					"modified",
					"lastUpdated",
					"updatedAt",
					"endTime",
					"submittedAt",
					"timestamp",
					"lastTestDate",
					"lastAccessed",
					"lastErrorDate",
					"lastCorrectDate",
				].includes(key)
			) {
				merged[key] = this.pickLaterMigrationTimeValue(currentValue, incomingValue);
				continue;
			}

			if (
				[
					"version",
					"_schemaVersion",
					"bankId",
					"materialId",
					"deckId",
					"id",
					"uuid",
				].includes(key)
			) {
				merged[key] = currentValue;
				continue;
			}

			merged[key] =
				this.getMigrationEntryTimestamp(incomingValue) >
				this.getMigrationEntryTimestamp(currentValue)
					? incomingValue
					: currentValue;
		}

		return this.maybeRebuildQuestionStatsRecord(merged);
	}

	private mergeMigrationConflictJson(current: unknown, incoming: unknown): unknown {
		if (current === undefined || current === null) {
			return incoming;
		}

		if (incoming === undefined || incoming === null) {
			return current;
		}

		if (Array.isArray(current) && Array.isArray(incoming)) {
			return this.mergeMigrationConflictArrays(current, incoming);
		}

		if (this.isPlainRecord(current) && this.isPlainRecord(incoming)) {
			return this.mergeMigrationConflictObjects(current, incoming);
		}

		return this.getMigrationEntryTimestamp(incoming) > this.getMigrationEntryTimestamp(current)
			? incoming
			: current;
	}

	private async recoverStructuredJsonConflictFiles(
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<{ mergedFiles: number; errors: string[] }> {
		const adapter = this.plugin.app.vault.adapter;
		const conflictDir = `${v2Paths.root}/_migration_conflicts`;
		const result = {
			mergedFiles: 0,
			errors: [] as string[],
		};

		if (!(await adapter.exists(conflictDir))) {
			return result;
		}

		let conflictPaths: string[] = [];
		try {
			const listing = await adapter.list(conflictDir);
			conflictPaths = (listing.files || []).filter((filePath) =>
				this.isStructuredJsonMigrationConflictFile(filePath.split("/").pop() || "")
			);
		} catch (error) {
			result.errors.push(`读取结构化迁移冲突目录失败: ${String(error)}`);
			return result;
		}

		if (conflictPaths.length === 0) {
			return result;
		}

		const targetCandidates = await this.getRecoverableMigrationConflictTargetCandidates(v2Paths);
		for (const conflictPath of conflictPaths) {
			const fileName = conflictPath.split("/").pop() || conflictPath;
			const targetPath = this.resolveStructuredMigrationConflictTargetPath(
				fileName,
				targetCandidates
			);
			if (!targetPath) {
				result.errors.push(`无法定位迁移冲突文件对应的正式 JSON: ${fileName}`);
				continue;
			}

			let conflictJson: unknown;
			try {
				const raw = await adapter.read(conflictPath);
				if (!raw.trim()) {
					result.errors.push(`迁移冲突文件为空，无法恢复: ${fileName}`);
					continue;
				}
				conflictJson = JSON.parse(raw);
			} catch (error) {
				result.errors.push(`解析结构化迁移冲突文件失败: ${fileName} (${String(error)})`);
				continue;
			}

			const currentJson = await safeReadJson(adapter, targetPath, this.plugin.app);
			const merged = this.mergeMigrationConflictJson(currentJson, conflictJson);
			if (merged === undefined || merged === null) {
				result.errors.push(`结构化迁移冲突文件无法自动合并: ${fileName}`);
				continue;
			}

			try {
				await safeWriteJson(adapter, targetPath, JSON.stringify(merged, null, 2), this.plugin.app);
			} catch (error) {
				result.errors.push(`写回结构化迁移冲突文件失败: ${targetPath} (${String(error)})`);
				continue;
			}

			try {
				if (await adapter.exists(conflictPath)) {
					await adapter.remove(conflictPath);
					result.mergedFiles += 1;
				}
			} catch (error) {
				result.errors.push(`删除结构化迁移冲突文件失败: ${conflictPath} (${String(error)})`);
			}
		}

		return result;
	}

	private buildIRMonitoringConflictSignature(entry: unknown, fields: string[]): string {
		if (!entry || typeof entry !== "object") {
			return JSON.stringify(entry);
		}

		const record = entry as Record<string, unknown>;
		return fields.map((field) => String(record[field] ?? "")).join("::");
	}

	private mergeUniqueIRMonitoringEntries<T>(
		datasets: T[][],
		buildKey: (entry: T) => string
	): T[] {
		const merged = new Map<string, T>();
		for (const entries of datasets) {
			for (const entry of entries) {
				const key = buildKey(entry);
				if (!key || merged.has(key)) {
					continue;
				}
				merged.set(key, entry);
			}
		}
		return Array.from(merged.values());
	}

	private async recoverIRMonitoringConflictFiles(
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<{ mergedFiles: number; errors: string[] }> {
		const adapter = this.plugin.app.vault.adapter;
		const conflictDir = `${v2Paths.root}/_migration_conflicts`;
		const monitoringPath = getPluginPaths(this.plugin.app).state.incrementalReading.monitoring;
		const result = {
			mergedFiles: 0,
			errors: [] as string[],
		};

		if (!(await adapter.exists(conflictDir))) {
			return result;
		}

		let conflictPaths: string[] = [];
		try {
			const listing = await adapter.list(conflictDir);
			conflictPaths = (listing.files || []).filter((filePath) =>
				/^\.?weave_incremental-reading_monitoring\.json-\d+$/.test(filePath.split("/").pop() || "")
			);
		} catch (error) {
			result.errors.push(`读取增量阅读监控冲突目录失败: ${String(error)}`);
			return result;
		}

		if (conflictPaths.length === 0) {
			return result;
		}

		type MonitoringLike = {
			version?: string;
			dailyStats?: any[];
			priorityChanges?: any[];
			groupParamChanges?: any[];
			decisionEvents?: any[];
			decisionOutcomes?: any[];
			lastUpdated?: string;
		};

		const readMonitoringFile = async (filePath: string): Promise<MonitoringLike | null> => {
			try {
				const raw = await adapter.read(filePath);
				if (!raw.trim()) {
					return null;
				}
				const parsed = JSON.parse(raw);
				if (!parsed || typeof parsed !== "object") {
					return null;
				}
				return parsed as MonitoringLike;
			} catch (error) {
				result.errors.push(`解析增量阅读监控冲突文件失败: ${filePath} (${String(error)})`);
				return null;
			}
		};

		const datasets: MonitoringLike[] = [];
		try {
			if (await adapter.exists(monitoringPath)) {
				const current = await readMonitoringFile(monitoringPath);
				if (current) {
					datasets.push(current);
				}
			}
		} catch (error) {
			result.errors.push(`读取当前增量阅读监控文件失败: ${String(error)}`);
		}

		for (const conflictPath of conflictPaths) {
			const parsed = await readMonitoringFile(conflictPath);
			if (parsed) {
				datasets.push(parsed);
			}
		}

		if (datasets.length === 0) {
			return result;
		}

		const newestFirst = [...datasets].sort((a, b) => {
			const aTime = Date.parse(String(a.lastUpdated || "")) || 0;
			const bTime = Date.parse(String(b.lastUpdated || "")) || 0;
			return bTime - aTime;
		});

		const merged: MonitoringLike = {
			version: newestFirst.find((item) => typeof item.version === "string")?.version || "3.0.0",
			dailyStats: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.dailyStats) ? item.dailyStats : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["date"])
			).sort((a: any, b: any) => String(a?.date || "").localeCompare(String(b?.date || ""))),
			priorityChanges: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.priorityChanges) ? item.priorityChanges : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["blockId", "timestamp"])
			).sort((a: any, b: any) => String(a?.timestamp || "").localeCompare(String(b?.timestamp || ""))),
			groupParamChanges: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.groupParamChanges) ? item.groupParamChanges : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["groupId", "timestamp"])
			).sort((a: any, b: any) => String(a?.timestamp || "").localeCompare(String(b?.timestamp || ""))),
			decisionEvents: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.decisionEvents) ? item.decisionEvents : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["itemId", "action", "timestamp"])
			).sort((a: any, b: any) => String(a?.timestamp || "").localeCompare(String(b?.timestamp || ""))),
			decisionOutcomes: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.decisionOutcomes) ? item.decisionOutcomes : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["itemId", "outcomeType", "timestamp"])
			).sort((a: any, b: any) => String(a?.timestamp || "").localeCompare(String(b?.timestamp || ""))),
			lastUpdated:
				newestFirst
					.map((item) => String(item.lastUpdated || "").trim())
					.filter(Boolean)
					.sort()
					.pop() || new Date().toISOString(),
		};

		try {
			await safeWriteJson(adapter, monitoringPath, JSON.stringify(merged, null, 2));
		} catch (error) {
			result.errors.push(`写回增量阅读监控文件失败: ${String(error)}`);
			return result;
		}

		for (const conflictPath of conflictPaths) {
			try {
				if (await adapter.exists(conflictPath)) {
					await adapter.remove(conflictPath);
					result.mergedFiles += 1;
				}
			} catch (error) {
				result.errors.push(`删除增量阅读监控冲突文件失败: ${conflictPath} (${String(error)})`);
			}
		}

		return result;
	}

	private async cleanupEmptyCardFiles(
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<{ deleted: number; merged: number; errors: string[] }> {
		const result = { deleted: 0, merged: 0, errors: [] as string[] };

		try {
			const adapter = this.plugin.app.vault.adapter as any;
			const basePath: string | undefined = adapter?.basePath;
			if (!basePath) return result;

			const vaultAdapter = this.plugin.app.vault.adapter;
			const cardsDir = v2Paths.memory.cards;

			if (!(await vaultAdapter.exists(cardsDir))) return result;

			const listing = await vaultAdapter.list(cardsDir);
			const files = listing.files
				.map((f) => f.split("/").pop() || "")
				.filter((f) => f.endsWith(".json"));
			const defaultFileName = "cards-0.json";
			const legacyDefaultFileName = "default.json";
			const indexFileName = "card-files-index.json";

			const toDelete: string[] = [];
			const toMergeIntoDefault: Card[] = [];

			for (const f of files) {
				if (f === defaultFileName || f === legacyDefaultFileName || f === indexFileName) continue;

				let cards: Card[] = [];
				try {
					const raw = await vaultAdapter.read(`${cardsDir}/${f}`);
					const parsed = JSON.parse(raw);
					cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
				} catch {
					continue;
				}

				const baseName = f.replace(/\.json$/, "");
				const isLegacy = baseName.startsWith("legacy-") || f === legacyDefaultFileName;

				if (cards.length === 0) {
					// 空文件直接删除
					toDelete.push(f);
				} else if (isLegacy) {
					// legacy 文件中有卡片则合并到 default 后删除
					toMergeIntoDefault.push(...cards.filter((c) => c?.uuid));
					toDelete.push(f);
				}
			}

			if (toMergeIntoDefault.length > 0) {
				const defaultPath = `${cardsDir}/${defaultFileName}`;
				let existing: any = { cards: [] };
				try {
					if (await this.plugin.app.vault.adapter.exists(defaultPath)) {
						const raw = await this.plugin.app.vault.adapter.read(defaultPath);
						existing = JSON.parse(raw);
					}
				} catch {}

				const map = new Map<string, Card>();
				for (const c of existing?.cards || []) {
					if (c?.uuid) map.set(c.uuid, c);
				}
				for (const c of toMergeIntoDefault) {
					map.set(c.uuid, c);
				}
				await this.plugin.app.vault.adapter.write(
					defaultPath,
					JSON.stringify({ cards: Array.from(map.values()) })
				);
				result.merged = toMergeIntoDefault.length;
			}

			for (const f of toDelete) {
				try {
					await vaultAdapter.remove(`${cardsDir}/${f}`);
					result.deleted++;
				} catch (e) {
					result.errors.push(`删除空卡片文件失败: ${f} (${String(e)})`);
				}
			}

			// 总是尝试清理索引（包括删除的文件条目和 cardCount=0 的僵尸条目）
			try {
				const indexPath = `${cardsDir}/${indexFileName}`;
				if (await this.plugin.app.vault.adapter.exists(indexPath)) {
					const raw = await this.plugin.app.vault.adapter.read(indexPath);
					const index = JSON.parse(raw);
					let indexChanged = false;

					if (Array.isArray(index?.files)) {
						const deletedSet = new Set(toDelete.map((f) => f.replace(/\.json$/, "")));
						const beforeLen = index.files.length;

						// 移除已删除文件的条目 + cardCount=0 的僵尸条目（非 default）
						index.files = index.files.filter((entry: any) => {
							if (deletedSet.has(entry?.fileName)) return false;
							if (entry?.cardCount === 0 && entry?.fileName !== "default" && !entry?.isDefault)
								return false;
							return true;
						});

						if (index.files.length !== beforeLen) indexChanged = true;

						const defaultEntry = index.files.find((entry: any) => entry?.fileName === "default");
						if (defaultEntry && result.merged > 0) {
							defaultEntry.cardCount = (defaultEntry.cardCount || 0) + result.merged;
							indexChanged = true;
						}
					}

					if (index?.cardLocations) {
						const deletedSet = new Set(toDelete.map((f) => f.replace(/\.json$/, "")));
						for (const [uuid, loc] of Object.entries(index.cardLocations)) {
							if (deletedSet.has(loc as string)) {
								index.cardLocations[uuid] = "default";
								indexChanged = true;
							}
						}
					}

					if (indexChanged) {
						await this.plugin.app.vault.adapter.write(indexPath, JSON.stringify(index));
					}
				}
			} catch (e) {
				result.errors.push(`更新 card-files-index.json 失败: ${String(e)}`);
			}

			logger.info(`[DataManagement] 空卡片文件清理: 删除=${result.deleted}, 合并=${result.merged}`);
		} catch (e) {
			result.errors.push(`清理空卡片文件失败: ${String(e)}`);
		}

		return result;
	}

	private async renameDotManifestFiles(v2Paths: ReturnType<typeof getV2Paths>): Promise<number> {
		let renamed = 0;
		try {
			const adapter = this.plugin.app.vault.adapter as any;
			const basePath: string | undefined = adapter?.basePath;
			if (!basePath) return 0;

			const vaultAdapter = this.plugin.app.vault.adapter;
			const mediaDir = `${v2Paths.memory.root}/media`;

			if (!(await vaultAdapter.exists(mediaDir))) return 0;

			const listing = await vaultAdapter.list(mediaDir);
			for (const subFolder of listing.folders) {
				const dotManifest = `${subFolder}/.manifest.json`;
				const newManifest = `${subFolder}/manifest.json`;
				if (await vaultAdapter.exists(dotManifest)) {
					if (!(await vaultAdapter.exists(newManifest))) {
						const content = await vaultAdapter.read(dotManifest);
						await vaultAdapter.write(newManifest, content);
					}
					await vaultAdapter.remove(dotManifest);
					renamed++;
				}
			}
		} catch {}
		return renamed;
	}
	// ===== 云同步冲突副本检测 =====

	/** 常见云同步冲突副本命名模式 */
	private static readonly CONFLICT_PATTERNS: RegExp[] = [
		/ \d+\.json$/, // iCloud: "file 2.json"
		/ \(\d+\)\.json$/, // OneDrive: "file (1).json"
		/-[A-Z0-9]{7,}\.json$/, // Syncthing: short device ID suffix
		/\.sync-conflict-\d{8}-\d{6}-[A-Z0-9]+\.json$/, // Syncthing full
		/ \(SyncConflict\)\.json$/i, // 坚果云
		/ \(conflicted copy .+\)\.json$/i, // Dropbox
		/-conflict-\d+\.json$/, // generic
	];

	/**
	 * 检测是否为冲突副本文件名
	 */
	private isSyncConflictFile(fileName: string): boolean {
		return DataManagementService.CONFLICT_PATTERNS.some((p) => p.test(fileName));
	}

	/**
	 * 递归扫描目录下的所有 JSON 文件
	 */
	private async listJsonFilesRecursive(dir: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter as any;
		const result: string[] = [];
		try {
			const listing = adapter.list ? await adapter.list(dir) : { files: [], folders: [] };
			for (const f of listing.files || []) {
				if (f.endsWith(".json")) result.push(f);
			}
			for (const sub of listing.folders || []) {
				const subFiles = await this.listJsonFilesRecursive(sub);
				result.push(...subFiles);
			}
		} catch {}
		return result;
	}

	/**
	 * 检测云同步冲突副本文件
	 */
	private async checkSyncConflictFiles(): Promise<DataCheckResult> {
		try {
			const v2Paths = getV2Paths(
				normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder)
			);
			const allFiles = await this.listJsonFilesRecursive(v2Paths.root);

			const conflicts = allFiles.filter((_f) => {
				const name = _f.split("/").pop() || "";
				return this.isSyncConflictFile(name);
			});

			if (conflicts.length === 0) {
				return {
					type: "sync_conflict_files",
					status: "ok",
					count: 0,
					items: [],
					message: "未检测到云同步冲突副本",
				};
			}

			return {
				type: "sync_conflict_files",
				status: "warning",
				count: conflicts.length,
				items: conflicts,
				message: `检测到 ${conflicts.length} 个云同步冲突副本文件，可能包含未合并的数据`,
			};
		} catch (error) {
			logger.error("[DataManagement] checkSyncConflictFiles failed:", error);
			return {
				type: "sync_conflict_files",
				status: "ok",
				count: 0,
				items: [],
				message: "检测失败",
			};
		}
	}

	/**
	 * 修复云同步冲突副本：合并数据后删除冲突文件
	 */
	private async fixSyncConflictFiles(): Promise<DataFixResult> {
		const result: DataFixResult = {
			type: "sync_conflict_files",
			success: 0,
			failed: 0,
			errors: [],
		};

		try {
			const v2Paths = getV2Paths(
				normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder)
			);
			const adapter = this.plugin.app.vault.adapter as any;
			const allFiles = await this.listJsonFilesRecursive(v2Paths.root);
			const pluginPaths = getPluginPaths(this.plugin.app);
			const archiveRoot = `${pluginPaths.backups}/sync-conflicts/${new Date()
				.toISOString()
				.replace(/[:.]/g, "-")}`;

			const archiveConflictCopy = async (conflictPath: string): Promise<string> => {
				await DirectoryUtils.ensureDirRecursive(adapter, archiveRoot);
				const archivePath = `${archiveRoot}/${conflictPath.replace(/[\\/:]/g, "__")}`;
				const content = await adapter.read(conflictPath);
				await adapter.write(archivePath, content);
				await adapter.remove(conflictPath);
				return archivePath;
			};

			const restoreConflictAsCanonical = async (
				conflictPath: string,
				originalPath: string
			): Promise<void> => {
				const slash = originalPath.lastIndexOf("/");
				if (slash > 0) {
					await DirectoryUtils.ensureDirRecursive(adapter, originalPath.slice(0, slash));
				}
				const content = await adapter.read(conflictPath);
				await adapter.write(originalPath, content);
				await adapter.remove(conflictPath);
			};

			const conflicts = allFiles.filter((_f) => {
				const name = _f.split("/").pop() || "";
				return this.isSyncConflictFile(name);
			});

			for (const conflictPath of conflicts) {
				try {
					const dir = conflictPath.substring(0, conflictPath.lastIndexOf("/"));
					const fileName = conflictPath.split("/").pop() || "";

					// 推断原始文件名：移除冲突后缀
					let originalName = fileName;
					for (const pattern of DataManagementService.CONFLICT_PATTERNS) {
						const match = fileName.match(pattern);
						if (match) {
							originalName = `${fileName.substring(0, match.index!)}.json`;
							break;
						}
					}
					const originalPath = `${dir}/${originalName}`;
					if (!(await adapter.exists(originalPath))) {
						await restoreConflictAsCanonical(conflictPath, originalPath);
						result.success++;
						logger.info(`[DataManagement] 恢复冲突副本为主文件: ${originalPath}`);
						continue;
					}

					let merged = false;

					// 尝试合并卡片数据（如果是卡片分片文件）
					if (dir.includes("/cards")) {
						try {
							const conflictRaw = await adapter.read(conflictPath);
							const conflictData = JSON.parse(conflictRaw);
							const originalRaw = await adapter.read(originalPath);
							const originalData = JSON.parse(originalRaw);

							if (Array.isArray(conflictData?.cards) && Array.isArray(originalData?.cards)) {
								const mergedMap = new Map<string, any>();
								for (const card of originalData.cards) {
									if (card?.uuid) mergedMap.set(card.uuid, card);
								}
								let _newCards = 0;
								for (const card of conflictData.cards) {
									if (!card?.uuid) continue;
									const existing = mergedMap.get(card.uuid);
									if (
										!existing ||
										(card.modified && existing.modified && card.modified > existing.modified)
									) {
										mergedMap.set(card.uuid, card);
										if (!existing) _newCards++;
									}
								}
								await adapter.write(
									originalPath,
									JSON.stringify({ cards: Array.from(mergedMap.values()) })
								);
								await adapter.remove(conflictPath);
								result.success++;
								merged = true;
								logger.info(`[DataManagement] 合并卡片冲突副本: ${fileName}`);
							}
						} catch (mergeError) {
							logger.warn(`[DataManagement] 合并冲突副本内容失败: ${conflictPath}`, mergeError);
						}
					}

					// 尝试合并 deck-cards 数据（cardUUIDs 取并集）
					if (!merged && dir.includes("/deck-cards")) {
						try {
							const conflictRaw = await adapter.read(conflictPath);
							const conflictData = JSON.parse(conflictRaw);
							const originalRaw = await adapter.read(originalPath);
							const originalData = JSON.parse(originalRaw);

							if (
								Array.isArray(conflictData?.cardUUIDs) &&
								Array.isArray(originalData?.cardUUIDs)
							) {
								const mergedUUIDs = new Set([...originalData.cardUUIDs, ...conflictData.cardUUIDs]);
								await adapter.write(
									originalPath,
									JSON.stringify({ cardUUIDs: Array.from(mergedUUIDs) })
								);
								await adapter.remove(conflictPath);
								result.success++;
								merged = true;
								logger.info(`[DataManagement] 合并 deck-cards 冲突副本: ${fileName}`);
							}
						} catch (mergeError) {
							logger.warn(`[DataManagement] 合并 deck-cards 冲突失败: ${conflictPath}`, mergeError);
						}
					}

					if (merged) {
						continue;
					}

					const archivePath = await archiveConflictCopy(conflictPath);
					result.failed++;
					result.errors.push({
						uuid: conflictPath,
						error: `无法安全合并，已转存冲突副本供人工复核: ${archivePath}`,
					});
				} catch (e) {
					result.failed++;
					result.errors.push({ uuid: conflictPath, error: String(e) });
				}
			}
		} catch (error) {
			logger.error("[DataManagement] fixSyncConflictFiles failed:", error);
		}

		return result;
	}

	// ===== 渐进式挖空检测 =====

	/**
	 * 检测符合渐进式挖空格式但未转换的卡片
	 *
	 * 条件：
	 * 1. 卡片不是 ProgressiveParent 或 ProgressiveChild 类型
	 * 2. 卡片 content 包含 2+ 不同序号的 {{cN::}} 挖空
	 */
	private checkProgressiveClozeUnconverted(cards: Card[]): DataCheckResult {
		const unconverted: string[] = [];

		for (const card of cards) {
			// 跳过已经是渐进式挖空的卡片
			if (isProgressiveClozeParent(card) || isProgressiveClozeChild(card)) {
				continue;
			}

			// 检测 content 是否符合渐进式挖空格式
			if (card.content && hasProgressiveClozeContent(card.content)) {
				unconverted.push(card.uuid);
			}
		}

		return {
			type: "progressive_cloze_unconverted",
			status: unconverted.length > 0 ? "warning" : "ok",
			count: unconverted.length,
			items: unconverted,
			message:
				unconverted.length > 0
					? `发现 ${unconverted.length} 张卡片包含渐进式挖空格式但未转换为子卡片`
					: "无未转换的渐进式挖空卡片",
		};
	}

	/**
	 * 修复未转换的渐进式挖空卡片
	 * 将符合格式的卡片转换为父卡片+子卡片
	 */
	private async fixProgressiveClozeUnconverted(cards: Card[]): Promise<DataFixResult> {
		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		const { getProgressiveClozeGateway } = await import(
			"../../services/progressive-cloze/ProgressiveClozeGateway"
		);
		const gateway = getProgressiveClozeGateway();

		for (const card of cards) {
			if (isProgressiveClozeParent(card) || isProgressiveClozeChild(card)) continue;
			if (!card.content || !hasProgressiveClozeContent(card.content)) continue;

			try {
				const result = await gateway.processNewCard({ ...card });
				if (result.converted && result.cards.length > 0) {
					// 先删除原卡片（避免UUID冲突，因为父卡片UUID与原卡片相同）
					// processNewCard 返回的父卡片UUID就是原卡片UUID，直接覆盖保存即可
					for (const c of result.cards) {
						const saveResult = await this.plugin.dataStorage.saveCard(c);
						if (!saveResult.success) {
							throw new Error(saveResult.error || "保存失败");
						}
					}
					logger.info(
						`[DataManagement] 转换渐进式挖空: ${card.uuid} -> 1父+${result.cards.length - 1}子`
					);
					success++;
				}
			} catch (error) {
				failed++;
				errors.push({
					uuid: card.uuid,
					error: error instanceof Error ? error.message : String(error),
				});
				logger.error(`[DataManagement] 转换渐进式挖空失败: ${card.uuid}`, error);
			}
		}

		return {
			type: "progressive_cloze_unconverted",
			success,
			failed,
			errors,
		};
	}

	/**
	 * 检测孤儿子卡片（父卡片已不存在）
	 *
	 * 条件：
	 * 1. 卡片类型为 ProgressiveChild
	 * 2. 其 parentCardId 指向的父卡片在所有卡片中不存在
	 */
	private checkProgressiveClozeOrphan(cards: Card[]): DataCheckResult {
		const parentUUIDs = new Set(
			cards.filter((c) => isProgressiveClozeParent(c)).map((c) => c.uuid)
		);

		const orphans: string[] = [];

		for (const card of cards) {
			if (!isProgressiveClozeChild(card)) continue;

			const parentId = card.parentCardId;
			if (!parentId || !parentUUIDs.has(parentId)) {
				orphans.push(card.uuid);
			}
		}

		return {
			type: "progressive_cloze_orphan",
			status: orphans.length > 0 ? "warning" : "ok",
			count: orphans.length,
			items: orphans,
			message:
				orphans.length > 0
					? `发现 ${orphans.length} 张渐进式挖空子卡片的父卡片已不存在`
					: "无孤儿子卡片",
		};
	}

	/**
	 * 检测父卡片缺少序号对应子卡片
	 *
	 * 条件：父卡片内容中存在的 cloze 序号，在子卡片中找不到对应的 clozeOrd
	 */
	private checkProgressiveClozeMissingChildren(cards: Card[]): DataCheckResult {
		const problems: string[] = [];

		const childrenByParent = new Map<string, Set<number>>();
		for (const card of cards) {
			if (!isProgressiveClozeChild(card) || !card.parentCardId) continue;
			if (!childrenByParent.has(card.parentCardId)) {
				childrenByParent.set(card.parentCardId, new Set());
			}
			childrenByParent.get(card.parentCardId)?.add((card as any).clozeOrd);
		}

		const clozeRegex = /\{\{c(\d+)::/g;
		for (const card of cards) {
			if (!isProgressiveClozeParent(card) || !card.content) continue;

			const contentOrds = new Set<number>();
			let match: RegExpExecArray | null;
			while ((match = clozeRegex.exec(card.content)) !== null) {
				contentOrds.add(parseInt(match[1], 10) - 1);
			}
			clozeRegex.lastIndex = 0;

			const existingOrds = childrenByParent.get(card.uuid) || new Set();
			for (const ord of contentOrds) {
				if (!existingOrds.has(ord)) {
					problems.push(card.uuid);
					break;
				}
			}
		}

		return {
			type: "progressive_cloze_missing_children",
			status: problems.length > 0 ? "warning" : "ok",
			count: problems.length,
			items: problems,
			message:
				problems.length > 0
					? `发现 ${problems.length} 张父卡片缺少对应序号的子卡片`
					: "所有父卡片的子卡片完整",
		};
	}

	/**
	 * 检测多余子卡片（序号在父卡片内容中不存在）
	 *
	 * 条件：子卡片的 clozeOrd 在父卡片当前内容的挖空序号中找不到
	 */
	private checkProgressiveClozeExtraChildren(cards: Card[]): DataCheckResult {
		const extras: string[] = [];

		const parentMap = new Map<string, Card>();
		for (const card of cards) {
			if (isProgressiveClozeParent(card)) {
				parentMap.set(card.uuid, card);
			}
		}

		const clozeRegex = /\{\{c(\d+)::/g;
		for (const card of cards) {
			if (!isProgressiveClozeChild(card) || !card.parentCardId) continue;

			const parent = parentMap.get(card.parentCardId);
			if (!parent || !parent.content) continue;

			const contentOrds = new Set<number>();
			let match: RegExpExecArray | null;
			while ((match = clozeRegex.exec(parent.content)) !== null) {
				contentOrds.add(parseInt(match[1], 10) - 1);
			}
			clozeRegex.lastIndex = 0;

			if (!contentOrds.has((card as any).clozeOrd)) {
				extras.push(card.uuid);
			}
		}

		return {
			type: "progressive_cloze_extra_children",
			status: extras.length > 0 ? "warning" : "ok",
			count: extras.length,
			items: extras,
			message:
				extras.length > 0
					? `发现 ${extras.length} 张子卡片的序号在父卡片内容中不存在`
					: "无多余子卡片",
		};
	}
}

// ===== 导出工厂函数 =====

let instance: DataManagementService | null = null;

export function getDataManagementService(plugin: WeavePlugin): DataManagementService {
	if (!instance) {
		instance = new DataManagementService(plugin);
	}
	return instance;
}

export function resetDataManagementService(): void {
	instance = null;
}
