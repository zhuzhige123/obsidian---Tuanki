/**
 * 数据管理服务
 *
 * 统一管理数据检测、修复和迁移功能
 *
 * @module services/data-management/DataManagementService
 * @version 1.0.0
 */

import { normalizePath, type DataAdapter } from "obsidian";
import {
	LEGACY_DOT_TUANKI,
	getMediaManifestPath,
	getPluginPaths,
	getReadableWeaveRoot,
	getV2Paths,
	normalizeWeaveParentFolder,
	resolveIRImportFolder,
} from "../../config/paths";
import type { Card, Deck, DeckStats } from "../../data/types";
import type { WeavePlugin } from "../../main";
import {
	hasProgressiveClozeContent,
	isProgressiveClozeChild,
	isProgressiveClozeParent,
} from "../../types/progressive-cloze-v2";
import { DirectoryUtils } from "../../utils/directory-utils";
import { omitKey } from "../../utils/object-utils";
import { t } from "../../utils/i18n";
import {
	cleanupUnusedLegacyMemoryStorage,
	getUnusedLegacyMemoryStorageCandidates,
} from "../../utils/legacy-memory-storage";
import {
	getCardBodyFingerprint,
	getCardRetentionScore,
	buildBodyFingerprintIndex,
} from "../../utils/card-content-fingerprint";
import {
	collectTutorialDeckResidueCards,
	TUTORIAL_DECK_NAMES,
} from "../../utils/tutorial-deck-catalog";
import { logger } from "../../utils/logger";
import { getAttachmentRegistryAutoFixIssueCount } from "../media/attachment-registry-issues";
import {
	hasMultipleMemoryFormalDecks,
	keepSingleMemoryFormalDeck,
} from "../../utils/memory-deck-membership";
import {
	type PathRewriteRule,
	buildKnownPathReferenceFiles,
	renameVaultPath,
	normalizeRewriteRules,
	rewriteKnownPathReferences,
} from "../../utils/persisted-path-rewriter";
import {
	type SyncIssueType,
	buildUniqueSyncSafeFilename,
	diagnoseFilename,
	ensureSyncSafeFilename,
	isIgnorableVaultSystemOrSyncJunk,
	sanitizeForSync,
} from "../../utils/sync-safe-filename";
import {
	getCardDeckIds,
	getCardDeckIdsFromFormalSource,
	migrateSourceFields,
	needsSourceMigration,
	parseYAMLFromContent,
	setCardProperties,
} from "../../utils/yaml-utils";
import { safeReadJson, safeWriteJson } from "../../utils/safe-json-io";
import { isRecord, parseJsonUnknown, readString } from "../../utils/typed-json";
import { isCallable, readUnknownProperty, readUnknownString } from "../../utils/dynamic-access";
import {
	type DataMigrationPlan,
	type DataMigrationReport,
	UnifiedDataMigrationService,
} from "../data-migration/UnifiedDataMigrationService";
import { migrateLegacyWeaveFolders } from "../data-migration/LegacyWeaveFolderMigration";
import { SchemaV2MigrationService } from "../data-migration/SchemaV2MigrationService";
import { DataConsistencyService } from "../reference-deck/DataConsistencyService";
import {
	getSplitPluginResidueOwnerPluginId,
	getSplitPluginUnavailableMessage,
	isIncrementalReadingPluginInstalled,
	isSplitPluginResidueDelegatedToStandalonePlugin,
} from "../../utils/ir-plugin-integration";
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
	| "we_block_migration" // we_block -> we_source 合并迁移
	| "epub_source_link_migration" // 旧 EPUB 溯源链接格式迁移
	| "epub_markdown_source_id_backfill" // Markdown 中 EPUB sourceId 回填
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
	| "plugin_runtime_sync_scope" // 插件运行态误入 vault / 同步范围提示
	| "progressive_cloze_unconverted" // 符合渐进式挖空格式但未转换
	| "progressive_cloze_orphan" // 孤儿子卡片（父卡片已不存在）
	| "progressive_cloze_missing_children" // 父卡片缺少序号对应的子卡片
	| "progressive_cloze_extra_children" // 子卡片序号在父卡片内容中不存在
	| "qbank_migration" // 考试题组迁移到 .qbank 格式
	| "qbank_legacy_cleanup" // 清理已迁移的旧题库文件
	| "qbank_orphan_refs" // 考试题组悬空引用（记忆卡片已删除）
	| "attachment_registry_consistency" // 附件索引与卡片引用一致性
	| "tutorial_deck_residue"; // 清理已废弃的内置教程牌组残留

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

export const TEMPORARY_CHECK_TYPES: CheckType[] = [
	"we_block_migration",
	"epub_source_link_migration",
	"epub_markdown_source_id_backfill",
	"ir_redundant_frontmatter_cleanup",
	"schema_migration",
	"ir_point_storage_migration",
	"ir_legacy_readable_markdown_migration",
	"ir_local_state_relocation",
	"ir_legacy_bookmark_cleanup",
	"wdeck_migration",
	"qbank_migration",
	"qbank_legacy_cleanup",
	"legacy_memory_files",
	"migration_conflict_files",
	"legacy_cleanup",
	"tutorial_deck_residue",
];

export const SPLIT_PLUGIN_RESIDUE_CHECK_TYPES: CheckType[] = [
	"epub_source_link_migration",
	"epub_markdown_source_id_backfill",
	"ir_redundant_frontmatter_cleanup",
	"ir_point_storage_migration",
	"ir_legacy_readable_markdown_migration",
	"ir_local_state_relocation",
	"ir_legacy_bookmark_cleanup",
	"ir_material_consistency",
];

/** 启动门禁中的「维护建议」项：可检测、可修复，但不阻塞正常使用 */
export const STARTUP_GATE_ADVISORY_CHECK_TYPES: CheckType[] = [
	"attachment_registry_consistency",
	"plugin_runtime_sync_scope",
];

export function isStartupGateAdvisoryCheckType(type: CheckType): boolean {
	return STARTUP_GATE_ADVISORY_CHECK_TYPES.includes(type);
}

export const HIDDEN_RESCUE_CHECK_TYPES: CheckType[] = [
	...SPLIT_PLUGIN_RESIDUE_CHECK_TYPES,
	"legacy_memory_files",
	"wdeck_migration",
];

export const RETIREMENT_CANDIDATE_CHECK_TYPES: CheckType[] = [];

const CHECK_TYPE_DISPLAY_NAMES: Partial<Record<CheckType, string>> = {
	structured_data_format: "management.dataCheckService.checkNames.structuredDataFormat",
	memory_single_membership: "management.dataCheckService.checkNames.memorySingleMembership",
	we_block_migration: "management.dataCheckService.checkNames.weBlockMigration",
	epub_source_link_migration: "management.dataCheckService.checkNames.epubSourceLinkMigration",
	epub_markdown_source_id_backfill:
		"management.dataCheckService.checkNames.epubMarkdownSourceIdBackfill",
	ir_redundant_frontmatter_cleanup:
		"management.dataCheckService.checkNames.irRedundantFrontmatterCleanup",
	card_deck_consistency: "management.dataCheckService.checkNames.cardDeckConsistency",
	ir_material_consistency: "management.dataCheckService.checkNames.irMaterialConsistency",
	ir_point_storage_migration: "management.dataCheckService.checkNames.irPointStorageMigration",
	ir_legacy_readable_markdown_migration:
		"management.dataCheckService.checkNames.irLegacyReadableMarkdownMigration",
	ir_local_state_relocation: "management.dataCheckService.checkNames.irLocalStateRelocation",
	ir_legacy_bookmark_cleanup: "management.dataCheckService.checkNames.irLegacyBookmarkCleanup",
	legacy_memory_files: "management.dataCheckService.checkNames.legacyMemoryFiles",
	wdeck_conflicts: "management.dataCheckService.checkNames.wdeckConflicts",
	wdeck_cache: "management.dataCheckService.checkNames.wdeckCache",
	migration_conflict_files: "management.dataCheckService.checkNames.migrationConflictFiles",
	orphan_cards: "management.dataCheckService.checkNames.orphanCards",
	duplicate_cards: "management.dataCheckService.checkNames.duplicateCards",
	invalid_refs: "management.dataCheckService.checkNames.invalidRefs",
	schema_migration: "management.dataCheckService.checkNames.schemaMigration",
	structure_check: "management.dataCheckService.checkNames.structureCheck",
	legacy_cleanup: "management.dataCheckService.checkNames.legacyCleanup",
	filename_compatibility: "management.dataCheckService.checkNames.filenameCompatibility",
	sync_conflict_files: "management.dataCheckService.checkNames.syncConflictFiles",
	plugin_runtime_sync_scope: "management.dataCheckService.checkNames.pluginRuntimeSyncScope",
	progressive_cloze_unconverted:
		"management.dataCheckService.checkNames.progressiveClozeUnconverted",
	progressive_cloze_orphan: "management.dataCheckService.checkNames.progressiveClozeOrphan",
	progressive_cloze_missing_children:
		"management.dataCheckService.checkNames.progressiveClozeMissingChildren",
	progressive_cloze_extra_children:
		"management.dataCheckService.checkNames.progressiveClozeExtraChildren",
	qbank_migration: "management.dataCheckService.checkNames.qbankMigration",
	qbank_legacy_cleanup: "management.dataCheckService.checkNames.qbankLegacyCleanup",
	qbank_orphan_refs: "management.dataCheckService.checkNames.qbankOrphanRefs",
	attachment_registry_consistency:
		"management.dataCheckService.checkNames.attachmentRegistryConsistency",
	tutorial_deck_residue: "management.dataCheckService.checkNames.tutorialDeckResidue",
};

export type DataCheckLifecycleKind = "temporary" | "long_term";

/** 启动门禁分级：阻断 / 维护建议 / 临时迁移 */
export type DataCheckTier = "blocking" | "advisory" | "temporary";

export function getDataCheckTier(type: CheckType): DataCheckTier {
	if (isTemporaryCheckType(type)) {
		return "temporary";
	}
	if (isStartupGateAdvisoryCheckType(type)) {
		return "advisory";
	}
	return "blocking";
}

export function getDataCheckGateTierKind(type: CheckType): DataCheckLifecycleKind | "advisory" {
	if (getDataCheckTier(type) === "advisory") {
		return "advisory";
	}
	return getDataCheckLifecycleKind(type);
}

export function getDataCheckGateTierLabel(type: CheckType): string {
	if (getDataCheckTier(type) === "advisory") {
		return t("management.dataCheckService.lifecycle.advisory");
	}
	return getDataCheckLifecycleLabel(type);
}

export function isTemporaryCheckType(type: CheckType): boolean {
	return TEMPORARY_CHECK_TYPES.includes(type);
}

export function isSplitPluginResidueCheckType(type: CheckType): boolean {
	return SPLIT_PLUGIN_RESIDUE_CHECK_TYPES.includes(type);
}

export function isHiddenRescueCheckType(type: CheckType): boolean {
	return HIDDEN_RESCUE_CHECK_TYPES.includes(type);
}

export function isRetirementCandidateCheckType(type: CheckType): boolean {
	return RETIREMENT_CANDIDATE_CHECK_TYPES.includes(type);
}

export function getDataCheckLifecycleKind(type: CheckType): DataCheckLifecycleKind {
	return isTemporaryCheckType(type) ? "temporary" : "long_term";
}

export function getDataCheckLifecycleLabel(type: CheckType): string {
	return getDataCheckLifecycleKind(type) === "temporary"
		? t("management.dataCheckService.lifecycle.temporary")
		: t("management.dataCheckService.lifecycle.longTerm");
}

export function getDataCheckDisplayName(type: CheckType): string {
	if (type === "wdeck_migration") {
		return t("management.dataCheckService.checkNames.wdeckMigration");
	}

	const displayName = CHECK_TYPE_DISPLAY_NAMES[type];
	return displayName ? t(displayName) : type;
}

export function getDataCheckLifecycleNote(type: CheckType): string {
	switch (type) {
		case "we_block_migration":
			return t("management.dataCheckService.notes.weBlockMigration");
		case "epub_source_link_migration":
		case "epub_markdown_source_id_backfill":
		case "ir_redundant_frontmatter_cleanup":
		case "ir_point_storage_migration":
		case "ir_legacy_readable_markdown_migration":
		case "ir_local_state_relocation":
		case "ir_legacy_bookmark_cleanup":
		case "ir_material_consistency":
			return t("management.dataCheckService.notes.splitPluginResidue");
		case "schema_migration":
		case "wdeck_migration":
		case "qbank_migration":
		case "qbank_legacy_cleanup":
		case "legacy_memory_files":
		case "migration_conflict_files":
		case "legacy_cleanup":
			return t("management.dataCheckService.notes.migrationCleanup");
		case "duplicate_cards":
			return t("management.dataCheckService.notes.duplicateCards");
		case "card_deck_consistency":
			return t("management.dataCheckService.notes.cardDeckConsistency");
		case "wdeck_conflicts":
			return t("management.dataCheckService.notes.wdeckConflicts");
		case "tutorial_deck_residue":
			return t("management.dataCheckService.notes.tutorialDeckResidue");
		case "attachment_registry_consistency":
			return t("management.dataCheckService.notes.attachmentRegistryConsistency");
		case "plugin_runtime_sync_scope":
			return t("management.dataCheckService.notes.pluginRuntimeSyncScope");
		default:
			return "";
	}
}

export function shouldDisplayDataCheckResult(result: DataCheckResult): boolean {
	if (!isTemporaryCheckType(result.type)) {
		return true;
	}

	return result.count > 0 || result.status === "error";
}

export function filterDisplayableDataCheckResults(results: DataCheckResult[]): DataCheckResult[] {
	return results.filter((result) => shouldDisplayDataCheckResult(result));
}

export interface MigrationConflictFileInfo {
	path: string;
	fileName: string;
	label: string;
	autoRecoverable: boolean;
}

export interface MigrationConflictInspection {
	conflictDir: string;
	total: number;
	autoRecoverableCount: number;
	manualReviewCount: number;
	files: MigrationConflictFileInfo[];
}

export interface SchemaMigrationExecutionOptions {
	confirmed?: boolean;
}

export interface WDeckMigrationExecutionOptions {
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

type DeckStorePayload = { decks?: Deck[] };
type CardFilesIndexEntry = {
	fileName?: string;
	cardCount?: number;
	isDefault?: boolean;
};
type CardFilesIndexPayload = {
	files?: CardFilesIndexEntry[];
	cardLocations?: Record<string, string>;
};

const WDECK_MIGRATION_DIR_NAME = "deck-files";

export const DEFAULT_CHECK_TYPES: CheckType[] = [
	"memory_single_membership",
	"we_block_migration",
	"structured_data_format",
	"duplicate_cards",
	"tutorial_deck_residue",
	"card_deck_consistency",
	"wdeck_conflicts",
	"wdeck_cache",
	"migration_conflict_files",
	"legacy_cleanup",
	"filename_compatibility",
	"sync_conflict_files",
	"plugin_runtime_sync_scope",
	"progressive_cloze_unconverted",
	"progressive_cloze_orphan",
	"progressive_cloze_missing_children",
	"progressive_cloze_extra_children",
	"qbank_orphan_refs",
	"attachment_registry_consistency",
];

export const MIGRATION_CHECK_TYPES: CheckType[] = [
	"schema_migration",
	"qbank_migration",
	"qbank_legacy_cleanup",
	"structure_check",
];

export const DEFAULT_BATCH_FIX_TYPES: CheckType[] = [
	"memory_single_membership",
	"we_block_migration",
	"epub_source_link_migration",
	"structured_data_format",
	"card_deck_consistency",
	"wdeck_conflicts",
	"wdeck_cache",
	"qbank_orphan_refs",
	"attachment_registry_consistency",
];

export const HIGH_RISK_FIX_TYPES: CheckType[] = [
	"duplicate_cards",
	"tutorial_deck_residue",
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
	"attachment_registry_consistency",
];

export const MAIN_PLUGIN_HIGH_RISK_FIX_TYPES: CheckType[] = HIGH_RISK_FIX_TYPES.filter(
	(type) => !HIDDEN_RESCUE_CHECK_TYPES.includes(type)
);

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

		return this.buildBlockedFixResult(type, t("management.dataCheckService.messages.highRiskBlocked"));
	}

	private readCardsFromPayload(value: unknown): Card[] {
		if (!isRecord(value) || !Array.isArray(value.cards)) {
			return [];
		}
		return value.cards.filter(
			(card): card is Card => isRecord(card) && typeof card.uuid === "string"
		);
	}

	private readDecksFromPayload(value: unknown): Deck[] {
		if (!isRecord(value) || !Array.isArray(value.decks)) {
			return [];
		}
		return value.decks.filter(
			(deck): deck is Deck => isRecord(deck) && typeof deck.id === "string"
		);
	}

	private readCardUUIDsFromPayload(value: unknown): string[] {
		if (!isRecord(value) || !Array.isArray(value.cardUUIDs)) {
			return [];
		}
		return value.cardUUIDs.filter((uuid): uuid is string => typeof uuid === "string");
	}

	private toMigrationString(value: unknown): string {
		if (typeof value === "string") {
			return value;
		}
		if (typeof value === "number" && Number.isFinite(value)) {
			return String(value);
		}
		return "";
	}

	private parseCardFilesIndex(value: unknown): CardFilesIndexPayload {
		if (!isRecord(value)) {
			return {};
		}

		const files = Array.isArray(value.files)
			? value.files.filter((entry): entry is CardFilesIndexEntry => isRecord(entry))
			: undefined;

		const cardLocations = isRecord(value.cardLocations)
			? Object.fromEntries(
					Object.entries(value.cardLocations).filter(
						(entry): entry is [string, string] => typeof entry[1] === "string"
					)
				)
			: undefined;

		return { files, cardLocations };
	}

	private getVaultAdapterBasePath(adapter: DataAdapter): string | undefined {
		const getBasePath = readUnknownProperty(adapter, "getBasePath");
		if (isCallable(getBasePath)) {
			const result = Reflect.apply(getBasePath, adapter, []);
			return typeof result === "string" && result.length > 0 ? result : undefined;
		}
		return readUnknownString(adapter, "basePath");
	}

	async recoverMigrationConflictData(): Promise<{
		importedCards: number;
		importedDecks: number;
		deletedCardFiles: number;
		mergedCardFiles: number;
		mergedIRMonitoringFiles: number;
		mergedMemoryConflictFiles: number;
		removedRedundantConflictFiles: number;
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
			mergedMemoryConflictFiles: 0,
			removedRedundantConflictFiles: 0,
			renamedManifests: 0,
			errors: [] as string[],
		};

		try {
			const imported = await this.importMigrationConflicts(v2Paths);
			result.importedCards = imported.importedCards;
			result.importedDecks = imported.importedDecks;
			result.errors.push(...imported.errors);
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.recoverMigrationConflictDataFailed", {
					message: String(error),
				})
			);
		}

		try {
			const cardCleanup = await this.cleanupEmptyCardFiles(v2Paths);
			result.deletedCardFiles = cardCleanup.deleted;
			result.mergedCardFiles = cardCleanup.merged;
			result.errors.push(...cardCleanup.errors);
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.emptyCardCleanupFailed", {
					message: String(error),
				})
			);
		}

		try {
			if (!isIncrementalReadingPluginInstalled(this.plugin.app)) {
				const monitoringRecovery = await this.recoverIRMonitoringConflictFiles(v2Paths);
				result.mergedIRMonitoringFiles = monitoringRecovery.mergedFiles;
				result.errors.push(...monitoringRecovery.errors);
			}
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.recoverIRMonitoringConflictFailed", {
					message: String(error),
				})
			);
		}

		try {
			const memoryRecovery = await this.recoverMemoryMigrationConflictFiles(v2Paths);
			result.mergedMemoryConflictFiles = memoryRecovery.mergedFiles;
			result.errors.push(...memoryRecovery.errors);
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.recoverMemoryMigrationConflictFailed", {
					message: String(error),
				})
			);
		}

		try {
			const structuredRecovery = await this.recoverStructuredJsonConflictFiles(v2Paths);
			result.errors.push(...structuredRecovery.errors);
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.recoverStructuredConflictFailed", {
					message: String(error),
				})
			);
		}

		try {
			const redundantRecovery = await this.recoverRedundantMigrationConflictCopies(v2Paths);
			result.removedRedundantConflictFiles = redundantRecovery.removedFiles;
			result.errors.push(...redundantRecovery.errors);
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.recoverRedundantConflictFailed", {
					message: String(error),
				})
			);
		}

		try {
			result.renamedManifests = await this.migrateLegacyMediaManifestFilenames(v2Paths);
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.renameMediaManifestFailed", {
					message: String(error),
				})
			);
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
		for (let i = 0; i < DEFAULT_CHECK_TYPES.length; i++) {
			const type = DEFAULT_CHECK_TYPES[i];
			onProgress?.(
				i + 1,
				DEFAULT_CHECK_TYPES.length,
				t("management.dataCheckService.progress.checking", { name: this.getCheckName(type) })
			);
			const result = await this.check(type);
			results.push(result);
		}

		return filterDisplayableDataCheckResults(results);
	}

	/**
	 * 检测单项
	 */
	async check(type: CheckType): Promise<DataCheckResult> {
		const splitPluginDelegated = this.buildSplitPluginResidueCheckDelegation(type);
		if (splitPluginDelegated) {
			return splitPluginDelegated;
		}

		switch (type) {
			case "memory_single_membership":
				return this.checkMemorySingleMembership(
					await this.plugin.dataStorage.getCards(),
					await this.plugin.dataStorage.getDecks()
				);
			case "we_block_migration":
				return this.checkWeBlockMigration(await this.plugin.dataStorage.getCards());
			case "structured_data_format":
				return await this.checkStructuredDataFormat();
			case "duplicate_cards":
				return this.checkDuplicateCards(await this.plugin.dataStorage.getCards());
			case "tutorial_deck_residue":
				return this.checkTutorialDeckResidue();
			case "card_deck_consistency":
				return await this.checkCardDeckConsistency();
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
			case "plugin_runtime_sync_scope":
				return await this.checkPluginRuntimeSyncScope();
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
			case "qbank_orphan_refs":
				return await this.checkQBankOrphanRefs();
			case "attachment_registry_consistency":
				return await this.checkAttachmentRegistryConsistency();
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
					message: t("management.dataCheckService.messages.notImplemented"),
				};
		}
	}

	async fix(type: CheckType, options: DataFixOptions = {}): Promise<DataFixResult> {
		const blocked = this.ensureHighRiskFixAllowed(type, options);
		if (blocked) {
			return blocked;
		}

		const splitPluginDelegated = this.buildSplitPluginResidueFixBlock(type);
		if (splitPluginDelegated) {
			return splitPluginDelegated;
		}

		switch (type) {
			case "memory_single_membership":
				return await this.fixMemorySingleMembership(
					await this.plugin.dataStorage.getCards(),
					await this.plugin.dataStorage.getDecks()
				);
			case "we_block_migration":
				return await this.fixWeBlockMigration(await this.plugin.dataStorage.getCards());
			case "structured_data_format":
				return await this.fixStructuredDataFormat();
			case "duplicate_cards":
				return await this.fixDuplicateCards(await this.plugin.dataStorage.getCards());
			case "tutorial_deck_residue":
				return await this.fixTutorialDeckResidue();
			case "card_deck_consistency":
				return await this.fixCardDeckConsistency();
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
			case "progressive_cloze_missing_children":
				return await this.fixProgressiveClozeMissingChildren(await this.plugin.dataStorage.getCards());
			case "qbank_migration":
				return await this.executeQBankMigration({ confirmed: !!options.allowHighRisk });
			case "qbank_legacy_cleanup":
				return await this.executeQBankLegacyCleanup({ confirmed: !!options.allowHighRisk });
			case "qbank_orphan_refs":
				return await this.fixQBankOrphanRefs();
			case "attachment_registry_consistency":
				return await this.fixAttachmentRegistryConsistency(options);
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
			onProgress?.(
				i + 1,
				DEFAULT_BATCH_FIX_TYPES.length,
				t("management.dataCheckService.progress.fixing", { name: this.getCheckName(type) })
			);
			const result = await this.fix(type);
			results.push(result);
			await this.plugin.wdeckService?.rebuildCache();
		}
		return results;
	}

	// ===== 具体检测实现 =====

	private checkMemorySingleMembership(cards: Card[], decks: Deck[]): DataCheckResult {
		const affectedCards: string[] = [];

		for (const card of cards) {
			if (!card.content) {
				continue;
			}

			try {
				const yaml = parseYAMLFromContent(card.content);
				const weDecksRaw = yaml.we_decks;
				const weDecks = Array.isArray(weDecksRaw)
					? weDecksRaw.filter((entry): entry is string => typeof entry === "string")
					: undefined;
				if (hasMultipleMemoryFormalDecks(weDecks, decks)) {
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
					? t("management.dataCheckService.messages.memorySingleMembershipFound", { count: affectedCards.length })
					: t("management.dataCheckService.messages.memorySingleMembershipOk"),
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
					? t("management.dataCheckService.messages.weBlockMigrationFound", { count: needsMigration.length })
					: t("management.dataCheckService.messages.weBlockMigrationOk"),
		};
	}

	/**
	 * 检测卡片-牌组一致性（.wdeck 与 YAML we_decks 对齐）
	 *
	 * - 以卡片 YAML 的 we_decks 为权威归属
	 * - 以 .wdeck 聚合结果中的实际卡片列表为牌组侧现状
	 * - 对比两者差异（多余/缺失 UUID）
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
					? t("management.dataCheckService.messages.cardDeckConsistencyFound", { invalidCount: invalidDeckRefs, deckCount: affectedDecks.length })
					: t("management.dataCheckService.messages.cardDeckConsistencyOk"),
		};
	}

	/**
	 * 修复卡片-牌组一致性
	 *
	 * - 按 YAML we_decks 回写牌组缓存，并在启用 WDeck 时把卡片写回正确的 .wdeck 文件
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
				: [{ uuid: "card_deck_consistency", error: result.error || t("management.dataCheckService.messages.cardDeckConsistencyRepairFailed") }],
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
			const membership = getCardDeckIdsFromFormalSource(card, deckLookups).deckIds;
			if (membership.length === 0) {
				orphans.push(card.uuid);
			}
		}

		return {
			type: "orphan_cards",
			status: orphans.length > 0 ? "warning" : "ok",
			count: orphans.length,
			items: orphans,
			message: orphans.length > 0 ? t("management.dataCheckService.messages.orphanCardsFound", { count: orphans.length }) : t("management.dataCheckService.messages.orphanCardsOk"),
		};
	}

	/**
	 * 检测内容重复卡片（同一正文、不同 UUID 的副本）
	 *
	 * 检测逻辑：
	 * 1. 提取每张卡片的内容指纹（去除YAML frontmatter后的纯内容）
	 * 2. 按指纹分组，找出内容相同但UUID不同的卡片组
	 * 3. 每组中只需保留1张，其余为重复
	 */
	private checkDuplicateCards(cards: Card[]): DataCheckResult {
		const groups = new Map<string, Card[]>();

		for (const card of cards) {
			const fp = getCardBodyFingerprint(card);
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
			groupCards.sort((a, b) => getCardRetentionScore(b) - getCardRetentionScore(a));
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
					? t("management.dataCheckService.messages.duplicateCardsFound", { count: duplicateUUIDs.length, groupCount: duplicateGroups })
					: t("management.dataCheckService.messages.duplicateCardsOk"),
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
			const fp = getCardBodyFingerprint(card);
			if (!fp) continue;
			if (!groups.has(fp)) groups.set(fp, []);
			groups.get(fp)?.push(card);
		}

		// 2. 找出需要删除的重复卡片，建立 UUID 重映射
		const toDelete: string[] = [];

		for (const [, groupCards] of groups) {
			if (groupCards.length <= 1) continue;
			groupCards.sort((a, b) => getCardRetentionScore(b) - getCardRetentionScore(a));
			for (let i = 1; i < groupCards.length; i++) {
				toDelete.push(groupCards[i].uuid);
			}
		}

		if (toDelete.length === 0) {
			logger.info("[DataManagement] 无需修复，没有重复卡片");
			return { type: "duplicate_cards", success: 0, failed: 0, errors: [] };
		}

		logger.info(`[DataManagement] 发现 ${toDelete.length} 张重复卡片待删除`);

		// 3. 删除前先收敛正式归属，避免 .wdeck 物理副本与 YAML 真值脱节导致后续修复回弹
		const consistencyService = new DataConsistencyService(this.plugin);
		const preRepairResult = await consistencyService.repairConsistency();
		if (!preRepairResult.success) {
			errors.push({
				uuid: "duplicate_cards",
				error: preRepairResult.error || t("management.dataCheckService.messages.duplicateRebuildFailed"),
			});
			logger.warn("[DataManagement] 重复卡片修复前一致性收敛失败，中止删除");
			return {
				type: "duplicate_cards",
				success: 0,
				failed: toDelete.length,
				errors,
			};
		}

		// 4. 删除重复卡片
		if (typeof this.plugin.dataStorage.deleteCards === "function") {
			const deleteResult = await this.plugin.dataStorage.deleteCards(toDelete);
			success += deleteResult.deleted.length;
			failed += deleteResult.failed.length;
			errors.push(
				...deleteResult.failed.map((item) => ({
					uuid: item.uuid,
					error: item.error || t("management.dataCheckService.messages.duplicateDeleteFailed"),
				}))
			);
		} else {
			failed += toDelete.length;
			errors.push({
				uuid: "duplicate_cards",
				error: t("management.dataCheckService.messages.duplicateDeleteFailed"),
			});
		}

		// 5. 删除后再次回写牌组缓存，并清理 .wdeck 结构性重复副本
		if (success > 0) {
			const repairResult = await consistencyService.repairConsistency();
			if (!repairResult.success) {
				errors.push({
					uuid: "duplicate_cards",
					error: repairResult.error || t("management.dataCheckService.messages.duplicateRebuildFailed"),
				});
				failed += 1;
			}

			if (this.plugin.wdeckService?.repairStructuralConflicts) {
				try {
					await this.plugin.wdeckService.repairStructuralConflicts();
					await this.plugin.wdeckService.rebuildCache();
				} catch (error) {
					logger.warn("[DataManagement] 重复卡片修复后清理 .wdeck 结构冲突失败:", error);
				}
			}
		}

		logger.info(`[DataManagement] 重复卡片修复完成: 删除 ${success} 张，失败 ${failed}`);

		return { type: "duplicate_cards", success, failed, errors };
	}

	/**
	 * 检测已废弃的内置教程牌组残留。
	 *
	 * 旧版本会自动创建「Weave 指南」及教程正文；后续迁移/渐进式挖空转换可能把这些卡片
	 * 复制到「未归组卡片」等牌组，形成大量重复教程副本。
	 */
	private async checkTutorialDeckResidue(): Promise<DataCheckResult> {
		const cards = await this.plugin.dataStorage.getCards();
		const residue = collectTutorialDeckResidueCards(cards);

		return {
			type: "tutorial_deck_residue",
			status: residue.length > 0 ? "warning" : "ok",
			count: residue.length,
			items: residue.map((card) => card.uuid).slice(0, 200),
			message:
				residue.length > 0
					? t("management.dataCheckService.messages.tutorialDeckResidueFound", {
							count: residue.length,
						})
					: t("management.dataCheckService.messages.tutorialDeckResidueOk"),
		};
	}

	/**
	 * 清理已废弃教程牌组卡片，并尝试移除空的「Weave 指南」牌组文件。
	 */
	private async fixTutorialDeckResidue(): Promise<DataFixResult> {
		const cards = await this.plugin.dataStorage.getCards();
		const residue = collectTutorialDeckResidueCards(cards);
		const toDelete = residue.map((card) => card.uuid).filter(Boolean);

		if (toDelete.length === 0) {
			return { type: "tutorial_deck_residue", success: 0, failed: 0, errors: [] };
		}

		logger.info(`[DataManagement] 开始清理教程牌组残留: ${toDelete.length} 张`);

		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];

		if (typeof this.plugin.dataStorage.deleteCards === "function") {
			const deleteResult = await this.plugin.dataStorage.deleteCards(toDelete);
			success += deleteResult.deleted.length;
			failed += deleteResult.failed.length;
			errors.push(
				...deleteResult.failed.map((item) => ({
					uuid: item.uuid,
					error: item.error || t("management.dataCheckService.messages.tutorialDeckResidueDeleteFailed"),
				}))
			);
		} else {
			failed += toDelete.length;
			errors.push({
				uuid: "tutorial_deck_residue",
				error: t("management.dataCheckService.messages.tutorialDeckResidueDeleteFailed"),
			});
		}

		if (success > 0) {
			const consistencyService = new DataConsistencyService(this.plugin);
			const repairResult = await consistencyService.repairConsistency();
			if (!repairResult.success) {
				errors.push({
					uuid: "tutorial_deck_residue",
					error:
						repairResult.error ||
						t("management.dataCheckService.messages.tutorialDeckResidueRebuildFailed"),
				});
				failed += 1;
			}

			await this.cleanupEmptyTutorialDecks();
		}

		logger.info(`[DataManagement] 教程牌组残留清理完成: 删除 ${success} 张，失败 ${failed}`);

		return { type: "tutorial_deck_residue", success, failed, errors };
	}

	private async cleanupEmptyTutorialDecks(): Promise<void> {
		if (!this.plugin.wdeckService) {
			return;
		}

		const decks = await this.plugin.dataStorage.getDecks();
		for (const deckName of TUTORIAL_DECK_NAMES) {
			const matchedDeck = decks.find((deck) => deck.name === deckName);
			if (!matchedDeck?.id) {
				continue;
			}

			const cardCount = Array.isArray(matchedDeck.cardUUIDs) ? matchedDeck.cardUUIDs.length : 0;
			if (cardCount > 0) {
				continue;
			}

			try {
				if (this.plugin.wdeckService.isWDeckDeckId(matchedDeck.id)) {
					await this.plugin.wdeckService.dissolveDeckByDeckId(matchedDeck.id);
				}
			} catch (error) {
				logger.warn(`[DataManagement] 清理空教程牌组失败: ${deckName}`, error);
			}
		}

		await this.plugin.wdeckService.rebuildCache();
	}

	// ===== 具体修复实现 =====

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
					errors.push({ uuid: card.uuid, error: result.error || t("management.dataCheckService.messages.saveFailed") });
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
						errors.push({ uuid: card.uuid, error: result.error || t("management.dataCheckService.messages.saveFailed") });
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

	// ===== 辅助方法 =====

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
			const adapter = this.plugin.app.vault.adapter;
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			const root = v2Paths.root;

			if (!(await adapter.exists(root))) {
				return {
					type: "filename_compatibility",
					status: "ok",
					count: 0,
					items: [],
					message: t("management.dataCheckService.messages.filenameCompatibilityRootMissing"),
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
						if (!fileName || isIgnorableVaultSystemOrSyncJunk(fileName)) continue;
						const diag = diagnoseFilename(fileName, true, filePath.length);
						const fixableIssues = diag.issues.filter((_i) => _i !== "path_too_long");
						if (fixableIssues.length > 0) {
							const issueLabels = fixableIssues.map((i) => this.getSyncIssueLabel(i)).join(", ");
							issues.push(`${filePath} [${issueLabels}]`);
						}
					}

					for (const folderPath of folders) {
						const folderName = folderPath.split("/").pop() || "";
						if (folderName && !isIgnorableVaultSystemOrSyncJunk(folderName)) {
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
			issues.push(t("management.dataCheckService.messages.checkFailed", { message: error instanceof Error ? error.message : String(error) }));
		}

		return {
			type: "filename_compatibility",
			status: issues.length > 0 ? "warning" : "ok",
			count: issues.length,
			items: issues.slice(0, 50),
			message:
				issues.length > 0
					? t("management.dataCheckService.messages.filenameCompatibilityFound", { count: issues.length })
					: t("management.dataCheckService.messages.filenameCompatibilityOk"),
		};
	}

	private async collectMediaManifestPaths(mediaRoot: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		const manifestPaths: string[] = [];

		if (!(await adapter.exists(mediaRoot))) {
			return manifestPaths;
		}

		try {
			const listing = await adapter.list(mediaRoot);
			for (const folderPath of listing.folders || []) {
				for (const manifestPath of [
					getMediaManifestPath(folderPath),
					getMediaManifestPath(folderPath, true),
				]) {
					if (await adapter.exists(manifestPath)) {
						manifestPaths.push(manifestPath);
					}
				}
			}
		} catch (error) {
			logger.debug(`[DataManagement] 扫描媒体清单失败: ${mediaRoot}`, error);
		}

		return manifestPaths;
	}

	private rewriteTextWithPathRules(value: string, rules: Iterable<PathRewriteRule>): string {
		const normalizedRules = normalizeRewriteRules(rules);
		let rewritten = value;
		for (const rule of normalizedRules) {
			if (!rewritten.includes(rule.from)) {
				continue;
			}
			rewritten = rewritten.split(rule.from).join(rule.to);
		}
		return rewritten;
	}

	private async rewriteCardContentPathReferences(rules: Iterable<PathRewriteRule>): Promise<number> {
		const normalizedRules = normalizeRewriteRules(rules);
		if (normalizedRules.length === 0) {
			return 0;
		}

		const cards = await this.plugin.dataStorage.getCards();
		let rewritten = 0;

		for (const card of cards) {
			const content = String(card.content || "");
			if (!content) {
				continue;
			}

			const nextContent = this.rewriteTextWithPathRules(content, normalizedRules);
			if (nextContent === content) {
				continue;
			}

			await this.plugin.dataStorage.saveCard({
				...card,
				content: nextContent,
			});
			rewritten += 1;
		}

		return rewritten;
	}

	private getFixableSyncFilenameIssues(
		name: string,
		isFile: boolean,
		fullPathLength: number
	): SyncIssueType[] {
		return diagnoseFilename(name, isFile, fullPathLength).issues.filter(
			(issue) => issue !== "path_too_long"
		);
	}

	private async findCanonicalPathForMigrationConflict(
		adapter: DataAdapter,
		conflictPath: string
	): Promise<string | null> {
		const parentPath = conflictPath.split("/").slice(0, -1).join("/");
		const weaveRoot = parentPath.replace(/\/_migration_conflicts$/, "");
		if (!weaveRoot || weaveRoot === parentPath) {
			return null;
		}

		const rawName = conflictPath.split("/").pop() || "";
		const withoutPrefix = rawName.replace(/^weave_/, "");
		const withoutTimestamp = withoutPrefix.replace(/-\d+$/, "");
		const isFile = withoutTimestamp.includes(".");
		const candidates = [
			`${weaveRoot}/${ensureSyncSafeFilename(withoutTimestamp, isFile)}`,
			`${weaveRoot}/${withoutTimestamp}`,
		];
		if (withoutTimestamp === "schema-version.json") {
			candidates.unshift(getV2Paths(normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder)).schemaVersion);
		}

		for (const candidate of candidates) {
			if (await adapter.exists(candidate)) {
				return candidate;
			}
		}

		return null;
	}

	private async resolveFilenameCompatibilityTarget(
		adapter: DataAdapter,
		oldPath: string,
		isFile: boolean
	): Promise<{ action: "skip" } | { action: "rename"; newPath: string } | { action: "deleted" }> {
		const segments = oldPath.split("/");
		const fileName = segments[segments.length - 1] || "";
		if (!fileName) {
			return { action: "skip" };
		}

		const safeName = ensureSyncSafeFilename(fileName, isFile);
		const parentPath = segments.slice(0, -1).join("/");
		const fixableIssues = this.getFixableSyncFilenameIssues(fileName, isFile, oldPath.length);

		if (fixableIssues.length === 0) {
			return { action: "skip" };
		}

		if (oldPath.includes("/_migration_conflicts/")) {
			const canonicalPath = await this.findCanonicalPathForMigrationConflict(adapter, oldPath);
			if (canonicalPath) {
				try {
					const [oldContent, canonicalContent] = await Promise.all([
						adapter.read(oldPath),
						adapter.read(canonicalPath),
					]);
					if (oldContent === canonicalContent) {
						await adapter.remove(oldPath);
						return { action: "deleted" };
					}
				} catch (error) {
					logger.debug(`[DataManagement] 无法比对迁移冲突副本: ${oldPath}`, error);
				}
			}
		}

		for (let attempt = 0; attempt < 20; attempt += 1) {
			const candidateName = buildUniqueSyncSafeFilename(safeName, attempt);
			const candidatePath = parentPath ? `${parentPath}/${candidateName}` : candidateName;

			if (candidatePath === oldPath) {
				if (this.getFixableSyncFilenameIssues(candidateName, isFile, candidatePath.length).length === 0) {
					return { action: "skip" };
				}
				continue;
			}

			if (!(await adapter.exists(candidatePath))) {
				return { action: "rename", newPath: candidatePath };
			}

			try {
				const [oldContent, existingContent] = await Promise.all([
					adapter.read(oldPath),
					adapter.read(candidatePath),
				]);
				if (oldContent === existingContent) {
					await adapter.remove(oldPath);
					return { action: "deleted" };
				}
			} catch (error) {
				logger.debug(`[DataManagement] 无法比对重名文件: ${oldPath}`, error);
			}
		}

		throw new Error(
			t("management.dataCheckService.messages.targetPathAlreadyExists", {
				path: parentPath ? `${parentPath}/${safeName}` : safeName,
			})
		);
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
			const adapter = this.plugin.app.vault.adapter;
			const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
			const v2Paths = getV2Paths(parentFolder);
			const root = v2Paths.root;

			if (!(await adapter.exists(root))) {
				return { type: "filename_compatibility", success: 0, failed: 0, errors: [] };
			}

			// 收集需要重命名的路径（只检测最后一段名称，保持父路径不变）
			const fileRenames: Array<{ oldPath: string }> = [];
			const folderRenames: Array<{ oldPath: string; depth: number }> = [];

			const scanDir = async (dir: string, depth: number): Promise<void> => {
				if (depth > 8) return;
				try {
					const listing = await adapter.list(dir);
					const files: string[] = listing?.files || [];
					const folders: string[] = listing?.folders || [];

					for (const filePath of files) {
						const segments = filePath.split("/");
						const fileName = segments[segments.length - 1];
						if (!fileName || isIgnorableVaultSystemOrSyncJunk(fileName)) continue;
						if (this.getFixableSyncFilenameIssues(fileName, true, filePath.length).length > 0) {
							fileRenames.push({ oldPath: filePath });
						}
					}

					for (const folderPath of folders) {
						// 先递归子目录（深层先处理）
						await scanDir(folderPath, depth + 1);

						const segments = folderPath.split("/");
						const folderName = segments[segments.length - 1];
						if (!folderName || isIgnorableVaultSystemOrSyncJunk(folderName)) continue;
						if (this.getFixableSyncFilenameIssues(folderName, false, folderPath.length).length > 0) {
							folderRenames.push({ oldPath: folderPath, depth });
						}
					}
				} catch (error) {
					logger.debug(`[DataManagement] 扫描目录失败: ${dir}`, error);
				}
			};

			await scanDir(root, 0);

			const performRename = async (oldPath: string, kind: "file" | "folder") => {
				const resolution = await this.resolveFilenameCompatibilityTarget(
					adapter,
					oldPath,
					kind === "file"
				);

				if (resolution.action === "skip") {
					const segments = oldPath.split("/");
					const name = segments[segments.length - 1] || "";
					if (
						name &&
						this.getFixableSyncFilenameIssues(name, kind === "file", oldPath.length).length > 0
					) {
						failed++;
						errors.push({
							uuid: oldPath,
							error: t("management.dataCheckService.messages.filenameCompatibilitySkipUnresolved", {
								path: oldPath,
							}),
						});
					}
					return;
				}

				if (resolution.action === "deleted") {
					success++;
					logger.info(`[DataManagement] 删除重复/冲突副本: ${oldPath}`);
					return;
				}

				if (await adapter.exists(resolution.newPath)) {
					throw new Error(
						t("management.dataCheckService.messages.targetPathAlreadyExists", {
							path: resolution.newPath,
						})
					);
				}

				await renameVaultPath(this.plugin.app, oldPath, resolution.newPath);
				appliedRules.push({ from: oldPath, to: resolution.newPath });
				success++;
				logger.info(
					`[DataManagement] 重命名${kind === "file" ? "文件" : "目录"}: ${oldPath} → ${resolution.newPath}`
				);
			};

			// 1. 先重命名文件（文件重命名不影响其他路径）
			for (const item of fileRenames) {
				try {
					await performRename(item.oldPath, "file");
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
					await performRename(item.oldPath, "folder");
				} catch (error) {
					failed++;
					errors.push({ uuid: item.oldPath, error: String(error) });
					logger.warn(`[DataManagement] 重命名目录失败: ${item.oldPath}`, error);
				}
			}

			if (appliedRules.length > 0) {
				const rewriteTargets = [
					...buildKnownPathReferenceFiles({
						v2Paths,
						pluginPaths: getPluginPaths(this.plugin.app),
					}),
					...(await this.collectMediaManifestPaths(v2Paths.memory.media)),
				];
				await rewriteKnownPathReferences(this.plugin.app, rewriteTargets, appliedRules);
				await this.rewriteCardContentPathReferences(appliedRules);
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
			emoji: t("management.dataCheckService.syncIssueLabels.emoji"),
			fullwidth_punctuation: t("management.dataCheckService.syncIssueLabels.fullwidthPunctuation"),
			square_brackets: t("management.dataCheckService.syncIssueLabels.squareBrackets"),
			path_too_long: t("management.dataCheckService.syncIssueLabels.pathTooLong"),
			no_extension: t("management.dataCheckService.syncIssueLabels.noExtension"),
			unsafe_chars: t("management.dataCheckService.syncIssueLabels.unsafeChars"),
			leading_dot: t("management.dataCheckService.syncIssueLabels.leadingDot"),
		};
		return labels[type] || type;
	}

	/**
	 * 获取检测类型的中文名称
	 */
	private getCheckName(type: CheckType): string {
		return getDataCheckDisplayName(type);
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
				label: t("management.dataCheckService.messages.migrationConflictLabels.memoryCards"),
				autoRecoverable: true,
			};
		}

		if (/weave_memory_decks\.json-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.memoryDecks"),
				autoRecoverable: true,
			};
		}

		if (/weave_memory_deck-cards_.+\.json-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.memoryDeckCards"),
				autoRecoverable: true,
			};
		}

		if (/weave_memory_learning_sessions_.+\.json-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.memoryLearningSessions"),
				autoRecoverable: true,
			};
		}

		if (/weave_incremental-reading_monitoring\.json-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.irMonitoring"),
				autoRecoverable: true,
			};
		}

		if (/weave_incremental-reading_.*\.json-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.irData"),
				autoRecoverable: true,
			};
		}

		if (/weave_question-bank_.*\.json-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.qbank"),
				autoRecoverable: true,
			};
		}

		if (/weave_schema-version\.json-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.weaveGeneric"),
				autoRecoverable: true,
			};
		}

		if (/weave_.*\.md-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.weaveGeneric"),
				autoRecoverable: true,
			};
		}

		if (/weave_.*-\d+$/.test(fileName)) {
			return {
				label: t("management.dataCheckService.messages.migrationConflictLabels.weaveGeneric"),
				autoRecoverable: false,
			};
		}

		return {
			label: t("management.dataCheckService.messages.migrationConflictLabels.unknown"),
			autoRecoverable: false,
		};
	}

	private getMigrationConflictDirectory(): string {
		const parentFolder = normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder);
		const v2Paths = getV2Paths(parentFolder);
		return `${v2Paths.root}/_migration_conflicts`;
	}

	private async listMigrationConflictFiles(): Promise<MigrationConflictFileInfo[]> {
		const conflictDir = this.getMigrationConflictDirectory();
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

	async inspectMigrationConflictFiles(): Promise<MigrationConflictInspection> {
		const files = await this.listMigrationConflictFiles();
		const autoRecoverableCount = files.filter((file) => file.autoRecoverable).length;
		const manualReviewCount = files.length - autoRecoverableCount;

		return {
			conflictDir: this.getMigrationConflictDirectory(),
			total: files.length,
			autoRecoverableCount,
			manualReviewCount,
			files,
		};
	}

	async checkMigrationConflictFiles(): Promise<DataCheckResult> {
		try {
			const inspection = await this.inspectMigrationConflictFiles();

			return {
				type: "migration_conflict_files",
				status:
					inspection.manualReviewCount > 0
						? "error"
						: inspection.total > 0
							? "warning"
							: "ok",
				count: inspection.total,
				items: inspection.files.map((file) =>
					`${file.autoRecoverable ? t("management.dataCheckService.messages.migrationConflictAutoRecoverable") : t("management.dataCheckService.messages.migrationConflictManualReview")} ${file.path}`
				),
				message:
					inspection.total === 0
						? t("management.dataCheckService.messages.migrationConflictNone")
						: t("management.dataCheckService.messages.migrationConflictFound", {
							total: inspection.total,
							autoRecoverableCount: inspection.autoRecoverableCount,
							manualReviewCount: inspection.manualReviewCount,
						}),
			};
		} catch (error) {
			return {
				type: "migration_conflict_files",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.migrationConflictCheckFailed", {
					message: error instanceof Error ? error.message : String(error),
				}),
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
		const errors: Array<{ uuid: string; error: string }> = [];

		for (const file of after) {
			const original = beforeByPath.get(file.path) || file;
			errors.push({
				uuid: file.path,
				error: original.autoRecoverable
					? t("management.dataCheckService.messages.migrationConflictStillPresentAuto")
					: t("management.dataCheckService.messages.migrationConflictStillPresentManual"),
			});
		}

		if (recovery.errors.length > 0) {
			logger.warn("[DataManagement] 迁移冲突恢复过程中出现非致命错误:", recovery.errors);
		}

		return {
			type: "migration_conflict_files",
			success: Math.max(before.length - after.length, 0),
			failed: after.length,
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
				...(needsSchemaV2Migration ? [t("management.dataCheckService.messages.schemaV2LegacyStructureItem")] : []),
				...legacyFolderMigrations.map(
					(item) => `${item.label}: ${item.legacyPath} -> ${item.targetPath}`
				),
			];

			return {
				type: "schema_migration",
				status: items.length > 0 ? "warning" : "ok",
				count: items.length,
				items,
				message: items.length > 0
					? t("management.dataCheckService.messages.schemaMigrationNeeded")
					: t("management.dataCheckService.messages.schemaMigrationUpToDate"),
			};
		} catch (error) {
			logger.error("[DataManagement] 统一数据迁移检测失败:", error);
			return {
				type: "schema_migration",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.checkFailed", { message: error instanceof Error ? error.message : String(error) }),
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
				t("management.dataCheckService.messages.schemaMigrationExecutionConfirm")
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

	private async pathExistsOrHasEntries(path: string): Promise<boolean> {
		const adapter = this.plugin.app.vault.adapter;

		try {
			if (await adapter.exists(path)) {
				return true;
			}
		} catch { /* no-op */ }

		try {
			const listing = await adapter.list(path);
			return Boolean((listing.files?.length || 0) > 0 || (listing.folders?.length || 0) > 0);
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

	private filterCardsNotDuplicatingWDeckBody(
		candidates: Card[],
		existingWDeckCards: Card[]
	): Card[] {
		if (candidates.length === 0 || existingWDeckCards.length === 0) {
			return candidates;
		}

		const fingerprintIndex = buildBodyFingerprintIndex(existingWDeckCards);
		const filtered: Card[] = [];
		let skipped = 0;

		for (const card of candidates) {
			const fingerprint = getCardBodyFingerprint(card);
			if (!fingerprint) {
				filtered.push(card);
				continue;
			}

			const canonicalUuid = fingerprintIndex.get(fingerprint);
			if (canonicalUuid && canonicalUuid !== card.uuid) {
				skipped += 1;
				continue;
			}

			filtered.push(card);
		}

		if (skipped > 0) {
			logger.info(`[DataManagement] WDeck 迁移跳过 ${skipped} 张正文重复卡片`);
		}

		return filtered;
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
					const data = parseJsonUnknown(content);
					results.push({
						path,
						bankId: isRecord(data) ? readString(data, "id") || "" : "",
						bankName: isRecord(data) ? readString(data, "name") || "" : "",
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
			const data = parseJsonUnknown(content);
			if (isRecord(data) && Array.isArray(data.refs)) {
				return data.refs.length;
			}
			return 0;
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
		const banksData = parseJsonUnknown(await adapter.read(oldBanksFile));
		const banks: Deck[] = Array.isArray(banksData)
			? banksData.filter((bank): bank is Deck => isRecord(bank) && typeof bank.id === "string")
			: isRecord(banksData)
				? this.readDecksFromPayload(banksData)
				: [];

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
					reason: t("management.dataCheckService.messages.qbankFileNameConflict", {
						fileName,
						owner: existingOwner,
					}),
				});
				continue;
			}

			// 检测文件是否已存在
			if (await adapter.exists(filePath)) {
				conflicts.push({
					bank,
					filePath,
					reason: t("management.dataCheckService.messages.qbankTargetExists", {
						path: filePath,
					}),
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
		const existingWDeckCards = allCards.filter((card) => this.plugin.wdeckService?.isWDeckCard(card));
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

			const deckCards = this.filterCardsNotDuplicatingWDeckBody(
				this.getCardsForWDeckMigration(deck, normalizedRegularCards, sourceDecks),
				existingWDeckCards
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
					reason: t("management.dataCheckService.messages.wdeckTargetNameConflict"),
				});
				continue;
			}

			seenTargets.set(filePath, deckId);

			if (await adapter.exists(filePath) && logicalDeckName !== WDECK_UNGROUPED_DECK_NAME) {
				conflicts.push({
					deck,
					filePath,
					reason: t("management.dataCheckService.messages.wdeckTargetExists"),
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

		const orphanCards = this.filterCardsNotDuplicatingWDeckBody(
			normalizedRegularCards
				.filter((card) => card?.uuid && !assignedUUIDs.has(card.uuid))
				.map((card) => this.stripWDeckRuntimeMarker(card)),
			existingWDeckCards
		);
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
					? { ...(deck.metadata) }
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
					message: t("management.dataCheckService.messages.wdeckMigrationConflictFound", { count: plan.conflicts.length }),
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
							? t("management.dataCheckService.messages.wdeckMigrationAlreadyMigrated")
							: t("management.dataCheckService.messages.wdeckMigrationNone"),
				};
			}

			return {
				type: "wdeck_migration",
				status: "warning",
				count: plan.candidates.length,
				items: plan.candidates.map(
					(item) => t("management.dataCheckService.messages.wdeckCandidateItem", {
						name: item.logicalDeckName,
						path: item.filePath,
						count: item.cards.length,
					})
				),
				message: t("management.dataCheckService.messages.wdeckMigrationFound", { count: plan.candidates.length, targetFolder: plan.targetFolder }),
			};
		} catch (error) {
			logger.error("[DataManagement] WDeck 迁移检测失败:", error);
			return {
				type: "wdeck_migration",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.checkFailed", { message: error instanceof Error ? error.message : String(error) }),
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
					message: t("management.dataCheckService.messages.qbankMigrationConflictFound", { count: plan.conflicts.length }),
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
							? t("management.dataCheckService.messages.qbankMigrationAlreadyMigrated")
							: t("management.dataCheckService.messages.qbankMigrationNone"),
				};
			}

			return {
				type: "qbank_migration",
				status: "warning",
				count: plan.candidates.length,
				items: plan.candidates.map(
					(item) =>
						t("management.dataCheckService.messages.qbankCandidateItem", {
							name: item.bank.name,
							fileName: item.fileName,
							count: item.questionCount,
						})
				),
				message: t("management.dataCheckService.messages.qbankMigrationFound", { count: plan.candidates.length }),
			};
		} catch (error) {
			logger.error("[DataManagement] QBank 迁移检测失败:", error);
			return {
				type: "qbank_migration",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.checkFailed", { message: error instanceof Error ? error.message : String(error) }),
			};
		}
	}

	async executeWDeckMigration(
		options: WDeckMigrationExecutionOptions = {}
	): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"wdeck_migration",
				t("management.dataCheckService.messages.wdeckMigrationConfirm")
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
				const cardsToMigrate = candidate.cards;
				if (cardsToMigrate.length === 0) {
					continue;
				}

				const payload: WDeckFileData = {
					schemaVersion: 1,
					fileType: "wdeck",
					logicalDeckId: candidate.logicalDeckId,
					logicalDeckName: candidate.logicalDeckName,
					segmentId: `${candidate.logicalDeckName}_01`,
					segmentIndex: 1,
					segmentLabel: "01",
					cards: cardsToMigrate,
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
						for (const card of cardsToMigrate) {
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
				t("management.dataCheckService.messages.qbankMigrationConfirm")
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

			// 确保插件缓存目录存在（vault 内 plugins/weave/cache，而非 manifest.dir）
			const questionBankCache = getPluginPaths(this.plugin.app).cache.questionBank;
			await DirectoryUtils.ensureDirRecursive(
				this.plugin.app.vault.adapter,
				questionBankCache.root
			);
			await DirectoryUtils.ensureDirRecursive(
				this.plugin.app.vault.adapter,
				questionBankCache.inProgress
			);
			await DirectoryUtils.ensureDirRecursive(
				this.plugin.app.vault.adapter,
				questionBankCache.sessionArchives
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
						const inProgressPath = `${questionBankCache.inProgress}/${candidate.bank.name}.json`;
						await adapter.write(inProgressPath, JSON.stringify(inProgress, null, 2));
					}

					// 迁移会话归档到插件目录
					const sessionArchives = sessionArchivesMap.get(candidate.bank.id);
					if (sessionArchives && sessionArchives.length > 0) {
						const archivePath = `${questionBankCache.sessionArchives}/${candidate.bank.name}.json`;
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
					message: t("management.dataCheckService.messages.qbankLegacyCleanupNoQbank"),
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
					message: t("management.dataCheckService.messages.qbankLegacyCleanupDone"),
				};
			}

			return {
				type: "qbank_legacy_cleanup",
				status: "warning",
				count: legacyFiles.length,
				items: legacyFiles,
				message: t("management.dataCheckService.messages.qbankLegacyCleanupFound", { count: legacyFiles.length, files: legacyFiles.join(", ") }),
			};
		} catch (error) {
			logger.error("[DataManagement] QBank 旧文件检测失败:", error);
			return {
				type: "qbank_legacy_cleanup",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.checkFailed", { message: error instanceof Error ? error.message : String(error) }),
			};
		}
	}

	async executeQBankLegacyCleanup(options: { confirmed?: boolean } = {}): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"qbank_legacy_cleanup",
				t("management.dataCheckService.messages.qbankLegacyCleanupConfirm")
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
				t("management.dataCheckService.messages.legacyMemoryCleanupConfirm")
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
					error: t("management.dataCheckService.messages.legacyMemoryNotInWdeck"),
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
		const remainingFiles = await this.getLegacyMemoryFilePaths();
		await this.plugin.wdeckService?.rebuildCache();
		const errors = remainingFiles.map((filePath) => ({
			uuid: filePath,
			error: t("management.dataCheckService.messages.legacyMemoryFileStillExists"),
		}));
		if (emptyLegacyDirCleanupError) {
			errors.push({
				uuid: "legacy_memory_dirs",
				error: t("management.dataCheckService.messages.legacyMemoryDirCleanupFailed", {
					message: emptyLegacyDirCleanupError,
				}),
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
				errors: [{ uuid: "wdeck_conflicts", error: t("management.dataCheckService.messages.wdeckServiceDisabled") }],
			};
		}

		const structuralResult = await this.plugin.wdeckService.repairStructuralConflicts();
		const report = await this.plugin.wdeckService.getConflictReport(true);
		const uuidIssues = report.issues.filter(
			(issue) => issue.type === "uuid_conflict" && typeof issue.cardUUID === "string" && issue.cardUUID.trim()
		);
		const invalidFileIssues = report.issues.filter((issue) => issue.type === "invalid_file");
		const errors: Array<{ uuid: string; error: string }> = structuralResult.errors.map((item) => ({
			uuid: item.path,
			error: item.error,
		}));
		let removedInvalidFiles = 0;
		let structuralRepaired = structuralResult.repaired;

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
							error: t("management.dataCheckService.messages.wdeckInvalidFileNotEmpty"),
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

		if (uuidIssues.length === 0 && removedInvalidFiles === 0 && structuralRepaired === 0) {
			return this.buildBlockedFixResult(
				"wdeck_conflicts",
				report.issues.length > 0
					? t("management.dataCheckService.messages.wdeckConflictAutoFixUnsupported")
					: t("management.dataCheckService.messages.wdeckNoConflict")
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
					error: t("management.dataCheckService.messages.wdeckMissingAuthoritativeCard"),
				});
				continue;
			}

			const membership = getCardDeckIds(card, decks).deckIds;
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
		const remainingStructuralIssues = refreshedReport.issues.filter(
			(issue) => issue.type === "duplicate_segment" || issue.type === "suspected_duplicate_copy"
		).length;
		structuralRepaired = Math.max(0, structuralRepaired - remainingStructuralIssues);

		return {
			type: "wdeck_conflicts",
			success: resolvedCount + removedInvalidFiles + structuralRepaired,
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
					? t("management.dataCheckService.messages.legacyMemoryFilesFound", { count: files.length })
					: t("management.dataCheckService.messages.legacyMemoryFilesOk"),
		};
	}

	async checkWDeckConflicts(): Promise<DataCheckResult> {
		if (!this.plugin.wdeckService) {
			return {
				type: "wdeck_conflicts",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.wdeckServiceUnavailable"),
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
					? t("management.dataCheckService.messages.wdeckConflictsFound", { count: report.issues.length })
					: t("management.dataCheckService.messages.wdeckConflictsOk"),
		};
	}

	async checkWDeckCache(): Promise<DataCheckResult> {
		if (!this.plugin.wdeckService) {
			return {
				type: "wdeck_cache",
				status: "ok",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.wdeckServiceUnavailable"),
			};
		}

		const status = await this.plugin.wdeckService.getCacheStatus();
		const cacheRoot = getPluginPaths(this.plugin.app).cache.root;
		return {
			type: "wdeck_cache",
			status: status.needsRebuild ? "warning" : "ok",
			count: status.needsRebuild ? 1 : 0,
			items: status.needsRebuild
				? [t("management.dataCheckService.messages.wdeckCacheNeedsRebuildItem", { path: cacheRoot })]
				: [],
			message: status.needsRebuild
				? t("management.dataCheckService.messages.wdeckCacheNeedsRebuild")
				: status.issueCount > 0
					? t("management.dataCheckService.messages.wdeckCacheOkWithTrackedConflicts", {
							fileCount: status.fileCount,
							issueCount: status.issueCount,
						})
					: t("management.dataCheckService.messages.wdeckCacheOk", { fileCount: status.fileCount }),
		};
	}

	async fixWDeckCache(): Promise<DataFixResult> {
		if (!this.plugin.wdeckService) {
			return {
				type: "wdeck_cache",
				success: 0,
				failed: 1,
				errors: [{ uuid: "wdeck_cache", error: t("management.dataCheckService.messages.wdeckServiceUnavailable") }],
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
					reason: t("management.dataCheckService.messages.structuredDataReadFailed", {
						message: error instanceof Error ? error.message : String(error),
					}),
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
						? t("management.dataCheckService.messages.structuredDataEmptyRecoverable")
						: t("management.dataCheckService.messages.structuredDataEmptyUnrecoverable"),
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
						? t("management.dataCheckService.messages.structuredDataInvalidJsonRecoverable")
						: t("management.dataCheckService.messages.structuredDataInvalidJsonUnrecoverable"),
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
						? t("management.dataCheckService.messages.structuredDataInvalidRootRecoverable")
						: t("management.dataCheckService.messages.structuredDataInvalidRootUnrecoverable"),
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
				reason: t("management.dataCheckService.messages.structuredDataRewriteable"),
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
					`${issue.repairable ? t("management.dataCheckService.messages.structuredDataRepairable") : t("management.dataCheckService.messages.structuredDataManual")} ${this.getStructuredDataKindLabel(issue.kind)} ${issue.path} - ${issue.reason}`
			),
			message:
				issues.length === 0
					? t("management.dataCheckService.messages.structuredDataFormatNone")
					: t("management.dataCheckService.messages.structuredDataFormatFound", { count: issues.length, repairable: repairable.length, manual: manual.length }),
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
						throw new Error(t("management.dataCheckService.messages.recoverableBackupMissing"));
					}
				} else {
					if (!issue.normalizedContent) {
						throw new Error(t("management.dataCheckService.messages.normalizedContentMissing"));
					}
					await safeWriteJson(adapter, issue.path, issue.normalizedContent, this.plugin.app);
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
					error: t("management.dataCheckService.messages.structuredDataCacheRebuildFailed", { message: error instanceof Error ? error.message : String(error) }),
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
				issues.push(t("management.dataCheckService.messages.structureMissingDir", { path: dir }));
			}
		}

		const irImportFolder = resolveIRImportFolder(
			this.plugin.settings?.incrementalReading?.importFolder,
			this.plugin.settings?.weaveParentFolder
		);
		if (irImportFolder === ".weave" || irImportFolder.startsWith(".weave/")) {
			issues.push(t("management.dataCheckService.messages.structureLegacyImportHidden", { path: irImportFolder }));
		}

		// 检查旧导入/复制兼容目录不应位于内部数据子目录（memory/cards, question-bank 等）
		const internalDirs = [
			v2Paths.memory.cards,
			v2Paths.memory.learning.root,
			v2Paths.questionBank.root,
		];
		for (const intDir of internalDirs) {
			if (irImportFolder === intDir || irImportFolder.startsWith(`${intDir}/`)) {
				issues.push(t("management.dataCheckService.messages.structureLegacyImportInternal", { path: irImportFolder }));
				break;
			}
		}

		return {
			type: "structure_check",
			status: issues.length > 0 ? "warning" : "ok",
			count: issues.length,
			items: issues,
			message: issues.length > 0 ? t("management.dataCheckService.messages.structureCheckFound", { count: issues.length }) : t("management.dataCheckService.messages.structureCheckOk"),
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
			message: items.length > 0 ? t("management.dataCheckService.messages.legacyCleanupFound", { count: items.length }) : t("management.dataCheckService.messages.legacyCleanupOk"),
		};
	}

	/**
	 * 清理旧目录
	 */
	async cleanupLegacyDirectories(options: DataFixOptions = {}): Promise<DataFixResult> {
		if (!options.allowHighRisk) {
			return this.buildBlockedFixResult(
				"legacy_cleanup",
				t("management.dataCheckService.messages.legacyCleanupConfirm")
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

				const listing = await adapter.list(dir);
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
				t("management.dataCheckService.messages.legacyCleanupMissingVerifiedReport")
			);
		}
		if (latestReport.plan.targetRoot !== v2Paths.root) {
			return this.buildBlockedFixResult(
				"legacy_cleanup",
				t("management.dataCheckService.messages.legacyCleanupMismatchedRoot")
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
				recovered.mergedMemoryConflictFiles > 0 ||
				recovered.removedRedundantConflictFiles > 0 ||
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
				const listing = await adapter.list(conflictsDir);
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
					const listing = await adapter.list(oldMediaDir);
					const items = [...(listing.files || []), ...(listing.folders || [])];
					for (const item of items) {
						const name = item.split("/").pop() || "";
						if (!name) continue;
						const dest = `${newMediaDir}/${name}`;
						if (!(await adapter.exists(dest))) {
							try {
								await adapter.rename(item, dest);
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
		const vaultAdapter = this.plugin.app.vault.adapter;
		const conflictDir = `${v2Paths.root}/_migration_conflicts`;

		const result = { importedCards: 0, importedDecks: 0, errors: [] as string[] };

		const basePath = this.getVaultAdapterBasePath(vaultAdapter);
		if (!basePath) {
			result.errors.push(t("management.dataCheckService.messages.migrationConflictImportBasePathMissing"));
			return result;
		}

		if (!(await vaultAdapter.exists(conflictDir))) {
			return result;
		}

		let allFileNames: string[];
		try {
			const listing = await vaultAdapter.list(conflictDir);
			allFileNames = listing.files.map((f) => f.split("/").pop() || "");
		} catch (e) {
			result.errors.push(t("management.dataCheckService.messages.migrationConflictImportListFailed", { message: String(e) }));
			return result;
		}

		const cardFileNames = allFileNames.filter((f) =>
			/^\.?weave_memory_cards_.*\.json-\d+$/.test(f)
		);
		const deckFileNames = allFileNames.filter((f) => /^\.?weave_memory_decks\.json-\d+$/.test(f));
		const successfulDeckImports = new Set<string>();
		const successfulCardImports = new Set<string>();

		const readConflictFile = async (fileName: string): Promise<string | null> => {
			try {
				return await vaultAdapter.read(`${conflictDir}/${fileName}`);
			} catch (e) {
				result.errors.push(t("management.dataCheckService.messages.migrationConflictImportReadFailed", { fileName, message: String(e) }));
				return null;
			}
		};

		const importedCardsByUuid = new Map<string, Card>();
		const deckNameById = new Map<string, string>();
		const importedDecksById = new Map<string, Deck>();

		let currentDeckStore: DeckStorePayload = { decks: [] };
		try {
			if (await vaultAdapter.exists(v2Paths.memory.decks)) {
				const raw = await vaultAdapter.read(v2Paths.memory.decks);
				const parsedStore = parseJsonUnknown(raw);
				currentDeckStore = isRecord(parsedStore) ? parsedStore : { decks: [] };
			}
		} catch { /* no-op */ }
		const currentDecks = this.readDecksFromPayload(currentDeckStore);
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
				const parsed = parseJsonUnknown(raw);
				const decks = this.readDecksFromPayload(parsed);
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
				successfulDeckImports.add(deckFileName);
			} catch (e) {
				result.errors.push(t("management.dataCheckService.messages.migrationConflictImportParseDeckFailed", { fileName: deckFileName, message: String(e) }));
			}
		}

		for (const cardFileName of cardFileNames) {
			try {
				const raw = await readConflictFile(cardFileName);
				if (!raw) continue;
				const parsed = parseJsonUnknown(raw);
				const cards = this.readCardsFromPayload(parsed);
				for (const c of cards) {
					if (!c.uuid) continue;

					const originalDeckId = c.deckId;
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
							const existingDecks = Array.isArray(yaml.we_decks) ? yaml.we_decks : [];
							if (existingDecks.length === 0) {
								nextContent = setCardProperties(nextContent, { we_decks: [deckName] });
							}
						} catch { /* no-op */ }
					}

					importedCardsByUuid.set(c.uuid, { ...c, deckId, content: nextContent });
				}
				successfulCardImports.add(cardFileName);
			} catch (e) {
				result.errors.push(t("management.dataCheckService.messages.migrationConflictImportParseCardFailed", { fileName: cardFileName, message: String(e) }));
			}
		}

		const importedCards = Array.from(importedCardsByUuid.values());
		let cardSaveSucceeded = importedCards.length === 0;
		if (importedCards.length > 0) {
			try {
				if (
					this.plugin.dataStorage &&
					typeof this.plugin.dataStorage.saveCardsBatch === "function"
				) {
					await this.plugin.dataStorage.saveCardsBatch(importedCards);
				} else {
					const fallbackPath = `${v2Paths.memory.cards}/default.json`;
					let existingCards: Card[] = [];
					try {
						if (await vaultAdapter.exists(fallbackPath)) {
							const raw = await vaultAdapter.read(fallbackPath);
							existingCards = this.readCardsFromPayload(parseJsonUnknown(raw));
						}
					} catch { /* no-op */ }

					const map = new Map<string, Card>();
					for (const c of existingCards) {
						if (c.uuid) map.set(c.uuid, c);
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
				cardSaveSucceeded = true;
			} catch (e) {
				result.errors.push(t("management.dataCheckService.messages.migrationConflictImportCardsFailed", { message: String(e) }));
			}
		}

		let deckSaveSucceeded = importedDecksById.size === 0;
		try {
			const decksPath = v2Paths.memory.decks;
			const deckById = new Map<string, Deck>(Array.from(currentDeckById.entries()));

			const uuidsByDeckId = new Map<string, Set<string>>();
			for (const c of importedCards) {
				const deckId = c.deckId;
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

			const defaultDeckSettings = this.plugin.dataStorage.getCurrentDefaultDeckSettings();

			for (const [deckId, set] of uuidsByDeckId.entries()) {
				if (!deckById.has(deckId)) {
					const name = deckNameById.get(deckId) || deckId;
					const emptyStats: DeckStats = {
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
					};
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
						settings: defaultDeckSettings,
						stats: emptyStats,
						tags: [],
						metadata: {},
						cardUUIDs: [],
					});
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
			const strippedDecks = mergedDecks.map((deck) => omitKey(deck, "cardUUIDs"));
			await this.plugin.app.vault.adapter.write(
				decksPath,
				JSON.stringify({ decks: strippedDecks })
			);
			result.importedDecks = importedDecksById.size;
			deckSaveSucceeded = true;

			if (this.plugin.deckMembershipIndexService) {
				await this.plugin.deckMembershipIndexService.markFullRebuildRequired();
			}
			if (this.plugin.bodyFingerprintIndexService) {
				await this.plugin.bodyFingerprintIndexService.markFullRebuildRequired();
			}
			if (this.plugin.studyDueIndexService) {
				await this.plugin.studyDueIndexService.markFullRebuildRequired();
			}
		} catch (e) {
			result.errors.push(t("management.dataCheckService.messages.migrationConflictImportDecksFailed", { message: String(e) }));
		}

		if (result.importedCards > 0 || result.importedDecks > 0) {
			logger.info(
				`[DataManagement] 冲突文件导入完成: 卡片=${result.importedCards}, 牌组=${result.importedDecks}`
			);
		}

		const adapter = this.plugin.app.vault.adapter;
		const removeConflictFile = async (fileName: string): Promise<void> => {
			try {
				const conflictPath = `${conflictDir}/${fileName}`;
				if (await adapter.exists(conflictPath)) {
					await adapter.remove(conflictPath);
				}
			} catch (e) {
				result.errors.push(
					t("management.dataCheckService.messages.migrationConflictImportDeleteFailed", {
						fileName,
						message: String(e),
					})
				);
			}
		};

		if (deckSaveSucceeded) {
			for (const fileName of successfulDeckImports) {
				await removeConflictFile(fileName);
			}
		}

		if (cardSaveSucceeded) {
			for (const fileName of successfulCardImports) {
				await removeConflictFile(fileName);
			}
		}

		return result;
	}

	private stripMigrationConflictTimestamp(fileName: string): string {
		return fileName.replace(/-\d+$/, "");
	}

	private extractMigrationConflictOriginalBaseName(fileName: string): string {
		return this.stripMigrationConflictTimestamp(fileName.replace(/^weave_/, ""));
	}

	private isMigrationMarkerBasename(baseName: string): boolean {
		return baseName === "schema-version.json" || baseName === "migration-completed" || baseName === "editor-host.md";
	}

	private shouldSkipRedundantMigrationConflictRecovery(fileName: string): boolean {
		return (
			/^\.?weave_memory_cards_.*\.json-\d+$/.test(fileName) ||
			/^\.?weave_memory_decks\.json-\d+$/.test(fileName) ||
			/^\.?weave_incremental-reading_monitoring\.json-\d+$/.test(fileName) ||
			this.isMemoryMigrationConflictFile(fileName) ||
			this.isStructuredJsonMigrationConflictFile(fileName)
		);
	}

	private async findWeaveRootFileWithSameContent(
		v2Paths: ReturnType<typeof getV2Paths>,
		content: string,
		conflictPath: string
	): Promise<string | null> {
		const adapter = this.plugin.app.vault.adapter;
		if (!(await adapter.exists(v2Paths.root))) {
			return null;
		}

		try {
			const listing = await adapter.list(v2Paths.root);
			for (const filePath of listing.files || []) {
				if (filePath === conflictPath) {
					continue;
				}
				try {
					const candidateContent = await adapter.read(filePath);
					if (candidateContent === content) {
						return filePath;
					}
				} catch {
					continue;
				}
			}
		} catch (error) {
			logger.debug(`[DataManagement] 扫描 Weave 根目录副本失败: ${v2Paths.root}`, error);
		}

		return null;
	}

	private async recoverRedundantMigrationConflictCopies(
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<{ removedFiles: number; errors: string[] }> {
		const adapter = this.plugin.app.vault.adapter;
		const conflictDir = `${v2Paths.root}/_migration_conflicts`;
		const result = {
			removedFiles: 0,
			errors: [] as string[],
		};

		if (!(await adapter.exists(conflictDir))) {
			return result;
		}

		let conflictPaths: string[] = [];
		try {
			const listing = await adapter.list(conflictDir);
			conflictPaths = listing.files || [];
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.structuredConflictDirReadFailed", {
					message: String(error),
				})
			);
			return result;
		}

		for (const conflictPath of conflictPaths) {
			const fileName = conflictPath.split("/").pop() || conflictPath;
			if (!fileName || this.shouldSkipRedundantMigrationConflictRecovery(fileName)) {
				continue;
			}

			try {
				const removed = await this.tryRemoveRedundantMigrationConflictCopy(
					conflictPath,
					v2Paths
				);
				if (removed) {
					result.removedFiles += 1;
				}
			} catch (error) {
				result.errors.push(
					t("management.dataCheckService.messages.structuredConflictDeleteFailed", {
						path: conflictPath,
						message: String(error),
					})
				);
			}
		}

		return result;
	}

	private async tryRemoveRedundantMigrationConflictCopy(
		conflictPath: string,
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<boolean> {
		const adapter = this.plugin.app.vault.adapter;
		const fileName = conflictPath.split("/").pop() || "";
		const originalBaseName = this.extractMigrationConflictOriginalBaseName(fileName);

		let conflictContent: string;
		try {
			conflictContent = await adapter.read(conflictPath);
		} catch (error) {
			throw new Error(
				t("management.dataCheckService.messages.migrationConflictImportReadFailed", {
					fileName,
					message: String(error),
				})
			);
		}

		const canonicalPath = await this.findCanonicalPathForMigrationConflict(adapter, conflictPath);
		if (canonicalPath && (await adapter.exists(canonicalPath))) {
			const canonicalContent = await adapter.read(canonicalPath);
			if (canonicalContent === conflictContent || this.isMigrationMarkerBasename(originalBaseName)) {
				await adapter.remove(conflictPath);
				logger.info(`[DataManagement] 删除冗余迁移冲突副本: ${conflictPath}`);
				return true;
			}
		} else if (
			this.isMigrationMarkerBasename(originalBaseName) &&
			(await adapter.exists(v2Paths.schemaVersion))
		) {
			await adapter.remove(conflictPath);
			logger.info(`[DataManagement] 删除冗余迁移标记冲突副本: ${conflictPath}`);
			return true;
		}

		const contentMatchPath = await this.findWeaveRootFileWithSameContent(
			v2Paths,
			conflictContent,
			conflictPath
		);
		if (contentMatchPath) {
			await adapter.remove(conflictPath);
			logger.info(
				`[DataManagement] 删除与正式文件内容相同的迁移冲突副本: ${conflictPath} -> ${contentMatchPath}`
			);
			return true;
		}

		return false;
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
		let lastTestDate = this.toMigrationString(
			attempts[attempts.length - 1]?.timestamp ?? record.lastTestDate ?? ""
		);
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
				lastIncorrectDate = this.toMigrationString(attempt.timestamp || lastIncorrectDate || "");
			}
		}

		consecutiveCorrect = currentStreak;
		const totalAttempts = attempts.length;
		const normalizedAttempts: TestAttempt[] = attempts.map((attempt) => ({
			sessionId: readString(attempt, "sessionId")?.trim() || "legacy-migration",
			isCorrect: attempt.isCorrect === true,
			mode: "exam" as const,
			timestamp: this.toMigrationString(attempt.timestamp),
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
			masteryMetrics: accuracyCalculator.calculateMastery(normalizedAttempts),
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

	private isMemoryMigrationConflictFile(fileName: string): boolean {
		return (
			/^weave_memory_deck-cards_.+\.json-\d+$/.test(fileName) ||
			/^weave_memory_learning_sessions_.+\.json-\d+$/.test(fileName)
		);
	}

	private isMemoryDeckCardsMigrationConflictFile(fileName: string): boolean {
		return /^weave_memory_deck-cards_.+\.json-\d+$/.test(fileName);
	}

	private resolveMemoryMigrationConflictTargetPath(
		fileName: string,
		v2Paths: ReturnType<typeof getV2Paths>
	): string | null {
		const stripped = this.stripMigrationConflictTimestamp(fileName);

		const deckCardsMatch = stripped.match(/^weave_memory_deck-cards_(.+)$/);
		if (deckCardsMatch?.[1]) {
			return `${v2Paths.memory.deckCards}/${deckCardsMatch[1]}`;
		}

		const sessionsMatch = stripped.match(/^weave_memory_learning_sessions_(.+)$/);
		if (sessionsMatch?.[1]) {
			return `${v2Paths.memory.learning.sessions}/${sessionsMatch[1]}`;
		}

		return null;
	}

	private async removeLegacyDeckCardsFileIfWDeckCoversMembership(
		v2Paths: ReturnType<typeof getV2Paths>,
		deckRelativeFileName: string,
		mergedUUIDs: string[]
	): Promise<void> {
		const wdeckService = this.plugin.wdeckService;
		if (!wdeckService || mergedUUIDs.length === 0) {
			return;
		}

		const deckId = deckRelativeFileName.replace(/\.json$/i, "").trim();
		if (!deckId) {
			return;
		}

		const aggregate = await wdeckService.getDeckAggregateByAnyDeckId(deckId);
		if (!aggregate) {
			return;
		}

		const wdeckUUIDs = new Set(
			aggregate.cards.map((card) => String(card?.uuid || "").trim()).filter(Boolean)
		);
		if (!mergedUUIDs.every((uuid) => wdeckUUIDs.has(uuid))) {
			return;
		}

		const adapter = this.plugin.app.vault.adapter;
		const deckCardsPath = `${v2Paths.memory.deckCards}/${deckRelativeFileName}`;
		if (await adapter.exists(deckCardsPath)) {
			await adapter.remove(deckCardsPath);
			logger.info(`[DataManagement] WDeck 已覆盖牌组归属，移除遗留 deck-cards: ${deckCardsPath}`);
		}
	}

	private async ensureParentDirectory(adapter: DataAdapter, filePath: string): Promise<void> {
		const slash = filePath.lastIndexOf("/");
		if (slash <= 0) {
			return;
		}
		await DirectoryUtils.ensureDirRecursive(adapter, filePath.slice(0, slash));
	}

	private async mergeMemoryDeckCardsMigrationConflict(
		v2Paths: ReturnType<typeof getV2Paths>,
		conflictPath: string,
		targetPath: string,
		conflictJson: unknown
	): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const deckRelativeFileName = targetPath.split("/").pop() || "";
		const conflictUUIDs = this.readCardUUIDsFromPayload(conflictJson);

		await this.ensureParentDirectory(adapter, targetPath);

		if (!(await adapter.exists(targetPath))) {
			await safeWriteJson(
				adapter,
				targetPath,
				JSON.stringify({ cardUUIDs: conflictUUIDs }, null, 2),
				this.plugin.app
			);
			await this.removeLegacyDeckCardsFileIfWDeckCoversMembership(
				v2Paths,
				deckRelativeFileName,
				conflictUUIDs
			);
			return;
		}

		const currentJson = await safeReadJson(adapter, targetPath, this.plugin.app);
		const mergedUUIDs = Array.from(
			new Set([...this.readCardUUIDsFromPayload(currentJson), ...conflictUUIDs].filter(Boolean))
		);
		await safeWriteJson(
			adapter,
			targetPath,
			JSON.stringify({ cardUUIDs: mergedUUIDs }, null, 2),
			this.plugin.app
		);
		await this.removeLegacyDeckCardsFileIfWDeckCoversMembership(
			v2Paths,
			deckRelativeFileName,
			mergedUUIDs
		);

		const deckId = deckRelativeFileName.replace(/\.json$/i, "").trim();
		if (deckId && this.plugin.deckMembershipIndexService) {
			await this.plugin.deckMembershipIndexService.markDecksDirty([deckId]);
		}
	}

	private async recoverMemoryMigrationConflictFiles(
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
				this.isMemoryMigrationConflictFile(filePath.split("/").pop() || "")
			);
		} catch (error) {
			result.errors.push(
				t("management.dataCheckService.messages.structuredConflictDirReadFailed", {
					message: String(error),
				})
			);
			return result;
		}

		for (const conflictPath of conflictPaths) {
			const fileName = conflictPath.split("/").pop() || conflictPath;
			const targetPath = this.resolveMemoryMigrationConflictTargetPath(fileName, v2Paths);
			if (!targetPath) {
				result.errors.push(
					t("management.dataCheckService.messages.structuredConflictTargetMissing", { fileName })
				);
				continue;
			}

			let conflictJson: unknown;
			try {
				const raw = await adapter.read(conflictPath);
				if (!raw.trim()) {
					result.errors.push(
						t("management.dataCheckService.messages.structuredConflictEmpty", { fileName })
					);
					continue;
				}
				conflictJson = JSON.parse(raw);
			} catch (error) {
				result.errors.push(
					t("management.dataCheckService.messages.structuredConflictParseFailed", {
						fileName,
						message: String(error),
					})
				);
				continue;
			}

			try {
				await this.ensureParentDirectory(adapter, targetPath);

				if (this.isMemoryDeckCardsMigrationConflictFile(fileName)) {
					await this.mergeMemoryDeckCardsMigrationConflict(
						v2Paths,
						conflictPath,
						targetPath,
						conflictJson
					);
				} else {
					const currentJson = (await adapter.exists(targetPath))
						? await safeReadJson(adapter, targetPath, this.plugin.app)
						: {
								_schemaVersion: "1.0.0",
								yearMonth:
									targetPath
										.split("/")
										.pop()
										?.replace(/\.json$/i, "") || "",
								sessions: [],
							};
					const merged = this.mergeMigrationConflictJson(currentJson, conflictJson);
					if (merged === undefined || merged === null) {
						result.errors.push(
							t("management.dataCheckService.messages.structuredConflictMergeFailed", {
								fileName,
							})
						);
						continue;
					}
					await safeWriteJson(
						adapter,
						targetPath,
						JSON.stringify(merged, null, 2),
						this.plugin.app
					);
				}
			} catch (error) {
				result.errors.push(
					t("management.dataCheckService.messages.structuredConflictWriteFailed", {
						path: targetPath,
						message: String(error),
					})
				);
				continue;
			}

			try {
				if (await adapter.exists(conflictPath)) {
					await adapter.remove(conflictPath);
					result.mergedFiles += 1;
				}
			} catch (error) {
				result.errors.push(
					t("management.dataCheckService.messages.structuredConflictDeleteFailed", {
						path: conflictPath,
						message: String(error),
					})
				);
			}
		}

		return result;
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
			result.errors.push(t("management.dataCheckService.messages.structuredConflictDirReadFailed", { message: String(error) }));
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
				result.errors.push(t("management.dataCheckService.messages.structuredConflictTargetMissing", { fileName }));
				continue;
			}

			let conflictJson: unknown;
			try {
				const raw = await adapter.read(conflictPath);
				if (!raw.trim()) {
					result.errors.push(t("management.dataCheckService.messages.structuredConflictEmpty", { fileName }));
					continue;
				}
				conflictJson = JSON.parse(raw);
			} catch (error) {
				result.errors.push(t("management.dataCheckService.messages.structuredConflictParseFailed", { fileName, message: String(error) }));
				continue;
			}

			const currentJson = await safeReadJson(adapter, targetPath, this.plugin.app);
			const merged = this.mergeMigrationConflictJson(currentJson, conflictJson);
			if (merged === undefined || merged === null) {
				result.errors.push(t("management.dataCheckService.messages.structuredConflictMergeFailed", { fileName }));
				continue;
			}

			try {
				await safeWriteJson(adapter, targetPath, JSON.stringify(merged, null, 2), this.plugin.app);
			} catch (error) {
				result.errors.push(t("management.dataCheckService.messages.structuredConflictWriteFailed", { path: targetPath, message: String(error) }));
				continue;
			}

			try {
				if (await adapter.exists(conflictPath)) {
					await adapter.remove(conflictPath);
					result.mergedFiles += 1;
				}
			} catch (error) {
				result.errors.push(t("management.dataCheckService.messages.structuredConflictDeleteFailed", { path: conflictPath, message: String(error) }));
			}
		}

		return result;
	}

	private buildIRMonitoringConflictSignature(entry: unknown, fields: string[]): string {
		if (!entry || typeof entry !== "object") {
			return JSON.stringify(entry);
		}

		const record = entry as Record<string, unknown>;
		return fields.map((field) => this.toMigrationString(record[field])).join("::");
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
			result.errors.push(t("management.dataCheckService.messages.irMonitoringConflictDirReadFailed", { message: String(error) }));
			return result;
		}

		if (conflictPaths.length === 0) {
			return result;
		}

		type MonitoringLike = {
			version?: string;
			dailyStats?: unknown[];
			priorityChanges?: unknown[];
			groupParamChanges?: unknown[];
			decisionEvents?: unknown[];
			decisionOutcomes?: unknown[];
			lastUpdated?: string;
		};

		const readMonitoringFile = async (filePath: string): Promise<MonitoringLike | null> => {
			try {
				const raw = await adapter.read(filePath);
				if (!raw.trim()) {
					return null;
				}
				const parsed = parseJsonUnknown(raw);
				if (!isRecord(parsed)) {
					return null;
				}
				return parsed;
			} catch (error) {
				result.errors.push(t("management.dataCheckService.messages.irMonitoringConflictParseFailed", { path: filePath, message: String(error) }));
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
			result.errors.push(t("management.dataCheckService.messages.irMonitoringCurrentReadFailed", { message: String(error) }));
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
			).sort((a, b) => {
				const aDate = isRecord(a) ? readString(a, "date") ?? "" : "";
				const bDate = isRecord(b) ? readString(b, "date") ?? "" : "";
				return aDate.localeCompare(bDate);
			}),
			priorityChanges: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.priorityChanges) ? item.priorityChanges : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["blockId", "timestamp"])
			).sort((a, b) => {
				const aTime = isRecord(a) ? readString(a, "timestamp") ?? "" : "";
				const bTime = isRecord(b) ? readString(b, "timestamp") ?? "" : "";
				return aTime.localeCompare(bTime);
			}),
			groupParamChanges: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.groupParamChanges) ? item.groupParamChanges : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["groupId", "timestamp"])
			).sort((a, b) => {
				const aTime = isRecord(a) ? readString(a, "timestamp") ?? "" : "";
				const bTime = isRecord(b) ? readString(b, "timestamp") ?? "" : "";
				return aTime.localeCompare(bTime);
			}),
			decisionEvents: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.decisionEvents) ? item.decisionEvents : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["itemId", "action", "timestamp"])
			).sort((a, b) => {
				const aTime = isRecord(a) ? readString(a, "timestamp") ?? "" : "";
				const bTime = isRecord(b) ? readString(b, "timestamp") ?? "" : "";
				return aTime.localeCompare(bTime);
			}),
			decisionOutcomes: this.mergeUniqueIRMonitoringEntries(
				newestFirst.map((item) => (Array.isArray(item.decisionOutcomes) ? item.decisionOutcomes : [])),
				(entry) => this.buildIRMonitoringConflictSignature(entry, ["itemId", "outcomeType", "timestamp"])
			).sort((a, b) => {
				const aTime = isRecord(a) ? readString(a, "timestamp") ?? "" : "";
				const bTime = isRecord(b) ? readString(b, "timestamp") ?? "" : "";
				return aTime.localeCompare(bTime);
			}),
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
			result.errors.push(t("management.dataCheckService.messages.irMonitoringWriteFailed", { message: String(error) }));
			return result;
		}

		for (const conflictPath of conflictPaths) {
			try {
				if (await adapter.exists(conflictPath)) {
					await adapter.remove(conflictPath);
					result.mergedFiles += 1;
				}
			} catch (error) {
				result.errors.push(t("management.dataCheckService.messages.irMonitoringDeleteFailed", { path: conflictPath, message: String(error) }));
			}
		}

		return result;
	}

	private async cleanupEmptyCardFiles(
		v2Paths: ReturnType<typeof getV2Paths>
	): Promise<{ deleted: number; merged: number; errors: string[] }> {
		const result = { deleted: 0, merged: 0, errors: [] as string[] };

		try {
			const vaultAdapter = this.plugin.app.vault.adapter;
			if (!this.getVaultAdapterBasePath(vaultAdapter)) return result;

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
					cards = this.readCardsFromPayload(parseJsonUnknown(raw));
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
				let existingCards: Card[] = [];
				try {
					if (await vaultAdapter.exists(defaultPath)) {
						const raw = await vaultAdapter.read(defaultPath);
						existingCards = this.readCardsFromPayload(parseJsonUnknown(raw));
					}
				} catch { /* no-op */ }

				const map = new Map<string, Card>();
				for (const c of existingCards) {
					if (c.uuid) map.set(c.uuid, c);
				}
				for (const c of toMergeIntoDefault) {
					map.set(c.uuid, c);
				}
				await vaultAdapter.write(
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
					result.errors.push(t("management.dataCheckService.messages.emptyCardFileDeleteFailed", {
						fileName: f,
						message: String(e),
					}));
				}
			}

			// 总是尝试清理索引（包括删除的文件条目和 cardCount=0 的僵尸条目）
			try {
				const indexPath = `${cardsDir}/${indexFileName}`;
				if (await vaultAdapter.exists(indexPath)) {
					const raw = await vaultAdapter.read(indexPath);
					const index = this.parseCardFilesIndex(parseJsonUnknown(raw));
					let indexChanged = false;
					const files = index.files ? [...index.files] : [];

					if (files.length > 0) {
						const deletedSet = new Set(toDelete.map((f) => f.replace(/\.json$/, "")));
						const beforeLen = files.length;

						index.files = files.filter((entry) => {
							if (!entry.fileName || deletedSet.has(entry.fileName)) return false;
							if (entry.cardCount === 0 && entry.fileName !== "default" && !entry.isDefault) {
								return false;
							}
							return true;
						});

						if (index.files.length !== beforeLen) indexChanged = true;

						const defaultEntry = index.files.find((entry) => entry.fileName === "default");
						if (defaultEntry && result.merged > 0) {
							defaultEntry.cardCount = (defaultEntry.cardCount || 0) + result.merged;
							indexChanged = true;
						}
					}

					if (index.cardLocations) {
						const deletedSet = new Set(toDelete.map((f) => f.replace(/\.json$/, "")));
						for (const [uuid, loc] of Object.entries(index.cardLocations)) {
							if (deletedSet.has(loc)) {
								index.cardLocations[uuid] = "default";
								indexChanged = true;
							}
						}
					}

					if (indexChanged) {
						await vaultAdapter.write(indexPath, JSON.stringify(index));
					}
				}
			} catch (e) {
				result.errors.push(t("management.dataCheckService.messages.cardFilesIndexUpdateFailed", {
					message: String(e),
				}));
			}

			logger.info(`[DataManagement] 空卡片文件清理: 删除=${result.deleted}, 合并=${result.merged}`);
		} catch (e) {
			result.errors.push(t("management.dataCheckService.messages.emptyCardCleanupFailed", {
				message: String(e),
			}));
		}

		return result;
	}

	private async migrateLegacyMediaManifestFilenames(v2Paths: ReturnType<typeof getV2Paths>): Promise<number> {
		let migrated = 0;
		try {
			const vaultAdapter = this.plugin.app.vault.adapter;
			const mediaDir = `${v2Paths.memory.root}/media`;

			if (!(await vaultAdapter.exists(mediaDir))) return 0;

			const listing = await vaultAdapter.list(mediaDir);
			for (const subFolder of listing.folders) {
				const canonicalManifest = getMediaManifestPath(subFolder);
				const legacyManifest = getMediaManifestPath(subFolder, true);
				if (!(await vaultAdapter.exists(legacyManifest))) {
					continue;
				}

				if (!(await vaultAdapter.exists(canonicalManifest))) {
					const content = await vaultAdapter.read(legacyManifest);
					await vaultAdapter.write(canonicalManifest, content);
				}

				await vaultAdapter.remove(legacyManifest);
				migrated++;
			}
		} catch { /* no-op */ }
		return migrated;
	}
	// ===== 云同步冲突副本检测 =====

	/** 常见云同步冲突副本命名模式（覆盖 JSON 与 Weave 结构化真源扩展名） */
	private static readonly SYNC_STRUCTURED_EXTENSIONS = "(?:json|wdeck|irdeck|qbank)";
	private static readonly CONFLICT_PATTERNS: RegExp[] = [
		new RegExp(` \\d+\\.${DataManagementService.SYNC_STRUCTURED_EXTENSIONS}$`),
		new RegExp(` \\(\\d+\\)\\.${DataManagementService.SYNC_STRUCTURED_EXTENSIONS}$`),
		new RegExp(`-[A-Z0-9]{7,}\\.${DataManagementService.SYNC_STRUCTURED_EXTENSIONS}$`),
		new RegExp(
			`\\.sync-conflict-\\d{8}-\\d{6}-[A-Z0-9]+\\.${DataManagementService.SYNC_STRUCTURED_EXTENSIONS}$`
		),
		new RegExp(` \\(SyncConflict\\)\\.${DataManagementService.SYNC_STRUCTURED_EXTENSIONS}$`, "i"),
		new RegExp(
			` \\(conflicted copy .+\\)\\.${DataManagementService.SYNC_STRUCTURED_EXTENSIONS}$`,
			"i"
		),
		new RegExp(`-conflict-\\d+\\.${DataManagementService.SYNC_STRUCTURED_EXTENSIONS}$`),
	];

	private static readonly PLUGIN_RUNTIME_LEAK_FILE_NAMES = new Set([
		"wdeck-index.json",
		"wdeck-conflicts.json",
		"point-files-index.json",
		"sync-state.json",
		"study-due-index.json",
		"quality-inbox.json",
		"import-mappings.json",
		"local-storage.json",
	]);

	/**
	 * 检测是否为冲突副本文件名
	 */
	private isSyncConflictFile(fileName: string): boolean {
		return DataManagementService.CONFLICT_PATTERNS.some((p) => p.test(fileName));
	}

	/**
	 * 递归扫描目录下的结构化真源文件（JSON / .wdeck / .irdeck / .qbank）
	 */
	private async listStructuredDataFilesRecursive(dir: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		const result: string[] = [];
		const extensionPattern = /\.(json|wdeck|irdeck|qbank)$/i;
		try {
			const listing = await adapter.list(dir);
			for (const filePath of listing.files) {
				if (extensionPattern.test(filePath)) {
					result.push(filePath);
				}
			}
			for (const sub of listing.folders) {
				const subFiles = await this.listStructuredDataFilesRecursive(sub);
				result.push(...subFiles);
			}
		} catch {
			/* no-op */
		}
		return result;
	}

	/**
	 * 递归扫描目录下的所有 JSON 文件
	 */
	private async listJsonFilesRecursive(dir: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		const result: string[] = [];
		try {
			const listing = await adapter.list(dir);
			for (const f of listing.files) {
				if (f.endsWith(".json")) result.push(f);
			}
			for (const sub of listing.folders) {
				const subFiles = await this.listJsonFilesRecursive(sub);
				result.push(...subFiles);
			}
		} catch { /* no-op */ }
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
			const allFiles = await this.listStructuredDataFilesRecursive(v2Paths.root);

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
					message: t("management.dataCheckService.messages.syncConflictNone"),
				};
			}

			return {
				type: "sync_conflict_files",
				status: "warning",
				count: conflicts.length,
				items: conflicts,
				message: t("management.dataCheckService.messages.syncConflictFound", { count: conflicts.length }),
			};
		} catch (error) {
			logger.error("[DataManagement] checkSyncConflictFiles failed:", error);
			return {
				type: "sync_conflict_files",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.syncConflictCheckFailed"),
			};
		}
	}

	/**
	 * 检测插件运行态文件是否误入 vault 真源目录，并提示同步排除范围。
	 */
	private async checkPluginRuntimeSyncScope(): Promise<DataCheckResult> {
		try {
			const v2Paths = getV2Paths(
				normalizeWeaveParentFolder(this.plugin.settings?.weaveParentFolder)
			);
			const allFiles = await this.listStructuredDataFilesRecursive(v2Paths.root);
			const leaked = allFiles.filter((filePath) => {
				const fileName = filePath.split("/").pop() || "";
				return DataManagementService.PLUGIN_RUNTIME_LEAK_FILE_NAMES.has(fileName);
			});

			if (leaked.length === 0) {
				return {
					type: "plugin_runtime_sync_scope",
					status: "ok",
					count: 0,
					items: [],
					message: t("management.dataCheckService.messages.pluginRuntimeSyncScopeOk"),
				};
			}

			return {
				type: "plugin_runtime_sync_scope",
				status: "warning",
				count: leaked.length,
				items: leaked,
				message: t("management.dataCheckService.messages.pluginRuntimeSyncScopeFound", {
					count: leaked.length,
				}),
			};
		} catch (error) {
			logger.error("[DataManagement] checkPluginRuntimeSyncScope failed:", error);
			return {
				type: "plugin_runtime_sync_scope",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.pluginRuntimeSyncScopeCheckFailed"),
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
			const adapter = this.plugin.app.vault.adapter;
			const allFiles = await this.listStructuredDataFilesRecursive(v2Paths.root);
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
							originalName = `${fileName.substring(0, match.index)}.json`;
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
							const originalRaw = await adapter.read(originalPath);
							const conflictData = parseJsonUnknown(conflictRaw);
							const originalData = parseJsonUnknown(originalRaw);
							const conflictCards = this.readCardsFromPayload(conflictData);
							const originalCards = this.readCardsFromPayload(originalData);

							if (
								isRecord(conflictData) &&
								Array.isArray(conflictData.cards) &&
								isRecord(originalData) &&
								Array.isArray(originalData.cards)
							) {
								const mergedMap = new Map<string, Card>();
								for (const card of originalCards) {
									mergedMap.set(card.uuid, card);
								}
								for (const card of conflictCards) {
									const existing = mergedMap.get(card.uuid);
									if (
										!existing ||
										(card.modified &&
											existing.modified &&
											card.modified > existing.modified)
									) {
										mergedMap.set(card.uuid, card);
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
							const originalRaw = await adapter.read(originalPath);
							const conflictData = parseJsonUnknown(conflictRaw);
							const originalData = parseJsonUnknown(originalRaw);
							const conflictUUIDs = this.readCardUUIDsFromPayload(conflictData);
							const originalUUIDs = this.readCardUUIDsFromPayload(originalData);

							if (
								isRecord(conflictData) &&
								Array.isArray(conflictData.cardUUIDs) &&
								isRecord(originalData) &&
								Array.isArray(originalData.cardUUIDs)
							) {
								const mergedUUIDs = new Set([...originalUUIDs, ...conflictUUIDs]);
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
						error: t("management.dataCheckService.messages.syncConflictArchiveRequired", {
							path: archivePath,
						}),
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
					? t("management.dataCheckService.messages.progressiveClozeUnconvertedFound", { count: unconverted.length })
					: t("management.dataCheckService.messages.progressiveClozeUnconvertedOk"),
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
							throw new Error(saveResult.error || t("management.dataCheckService.messages.saveFailed"));
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
	private async fixProgressiveClozeMissingChildren(cards: Card[]): Promise<DataFixResult> {
		const check = this.checkProgressiveClozeMissingChildren(cards);
		if (check.count === 0) {
			return {
				type: "progressive_cloze_missing_children",
				success: 0,
				failed: 0,
				errors: [],
			};
		}

		const { getProgressiveClozeGateway } = await import(
			"../progressive-cloze/ProgressiveClozeGateway"
		);
		const gateway = getProgressiveClozeGateway();
		const parentMap = new Map(
			cards
				.filter((card) => isProgressiveClozeParent(card))
				.map((card) => [card.uuid, card] as const)
		);

		let success = 0;
		let failed = 0;
		const errors: Array<{ uuid: string; error: string }> = [];
		const dataStorage = {
			deleteCard: async (uuid: string) => {
				await this.plugin.dataStorage.deleteCard(uuid);
			},
			saveCard: async (card: Card) => {
				const saveResult = await this.plugin.dataStorage.saveCard(card);
				if (!saveResult.success) {
					throw new Error(saveResult.error || t("management.dataCheckService.messages.saveFailed"));
				}
			},
			getCardsByUUIDs: async (uuids: string[]) => this.plugin.dataStorage.getCardsByUUIDs(uuids),
			getDeckCards: async (deckId: string) => this.plugin.dataStorage.getDeckCards(deckId),
		};

		for (const parentUuid of check.items) {
			const parent = parentMap.get(parentUuid);
			if (!parent) {
				failed++;
				errors.push({
					uuid: parentUuid,
					error: t("management.dataCheckService.messages.progressiveClozeParentNotFound"),
				});
				continue;
			}

			try {
				const result = await gateway.repairMissingChildren(parent, dataStorage);
				if (result.created.length > 0) {
					success += result.created.length;
					logger.info(
						`[DataManagement] 已补齐渐进式挖空子卡: ${parentUuid} -> +${result.created.length}`
					);
				}
			} catch (error) {
				failed++;
				errors.push({
					uuid: parentUuid,
					error: error instanceof Error ? error.message : String(error),
				});
				logger.error(`[DataManagement] 补齐渐进式挖空子卡失败: ${parentUuid}`, error);
			}
		}

		return {
			type: "progressive_cloze_missing_children",
			success,
			failed,
			errors,
		};
	}

	private async checkQBankOrphanRefs(): Promise<DataCheckResult> {
		if (!this.plugin.questionBankService) {
			return {
				type: "qbank_orphan_refs",
				status: "ok",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.qbankOrphanRefsOk"),
			};
		}

		try {
			const scan = await this.plugin.questionBankService.scanOrphanQuestionRefs();
			return {
				type: "qbank_orphan_refs",
				status: scan.refCount > 0 ? "warning" : "ok",
				count: scan.refCount,
				items: scan.items,
				message:
					scan.refCount > 0
						? t("management.dataCheckService.messages.qbankOrphanRefsFound", {
								refCount: scan.refCount,
								cardCount: scan.cardUuids.length,
							})
						: t("management.dataCheckService.messages.qbankOrphanRefsOk"),
			};
		} catch (error) {
			logger.error("[DataManagement] 考试题组悬空引用检测失败:", error);
			return {
				type: "qbank_orphan_refs",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.qbankOrphanRefsCheckFailed", {
					message: error instanceof Error ? error.message : String(error),
				}),
			};
		}
	}

	private async fixQBankOrphanRefs(): Promise<DataFixResult> {
		if (!this.plugin.questionBankService) {
			return {
				type: "qbank_orphan_refs",
				success: 0,
				failed: 0,
				errors: [],
			};
		}

		try {
			const scan = await this.plugin.questionBankService.scanOrphanQuestionRefs();
			if (scan.cardUuids.length === 0) {
				return {
					type: "qbank_orphan_refs",
					success: 0,
					failed: 0,
					errors: [],
				};
			}

			await this.plugin.questionBankService.cleanupDeletedMemoryCards(scan.cardUuids);
			this.plugin.app.workspace.trigger("Weave:data-changed");

			return {
				type: "qbank_orphan_refs",
				success: scan.refCount,
				failed: 0,
				errors: [],
			};
		} catch (error) {
			logger.error("[DataManagement] 考试题组悬空引用修复失败:", error);
			return {
				type: "qbank_orphan_refs",
				success: 0,
				failed: 1,
				errors: [
					{
						uuid: "qbank_orphan_refs",
						error: error instanceof Error ? error.message : String(error),
					},
				],
			};
		}
	}

	private async checkAttachmentRegistryConsistency(): Promise<DataCheckResult> {
		const registryService = this.plugin.attachmentRegistryService;
		if (!registryService) {
			return {
				type: "attachment_registry_consistency",
				status: "ok",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.attachmentRegistryOk"),
			};
		}

		try {
			const scan = await registryService.scan();
			const autoFixCount = getAttachmentRegistryAutoFixIssueCount(scan);
			const items = [
				...scan.brokenPaths,
				...scan.rewritablePaths.map((entry) => entry.rawPath),
				...(scan.isRegistryStale ? ["__registry_stale__"] : []),
				...scan.orphanWeaveMediaPaths,
			];

			const hasAdvisories =
				scan.brokenPaths.length > 0 || scan.orphanWeaveMediaPaths.length > 0;

			let message: string;
			let status: CheckStatus;
			if (autoFixCount > 0) {
				status = "warning";
				message = t("management.dataCheckService.messages.attachmentRegistryFound", {
					brokenCount: scan.brokenPaths.length,
					rewritableCount: scan.rewritablePaths.length,
					stale: scan.isRegistryStale ? 1 : 0,
					orphanCount: scan.orphanWeaveMediaPaths.length,
				});
			} else if (hasAdvisories) {
				status = "ok";
				message = t("management.dataCheckService.messages.attachmentRegistryOkWithAdvisories", {
					brokenCount: scan.brokenPaths.length,
					orphanCount: scan.orphanWeaveMediaPaths.length,
				});
			} else {
				status = "ok";
				message = t("management.dataCheckService.messages.attachmentRegistryOk");
			}

			return {
				type: "attachment_registry_consistency",
				status,
				count: autoFixCount,
				items,
				message,
			};
		} catch (error) {
			logger.error("[DataManagement] 附件索引一致性检测失败:", error);
			return {
				type: "attachment_registry_consistency",
				status: "error",
				count: 0,
				items: [],
				message: t("management.dataCheckService.messages.attachmentRegistryCheckFailed", {
					message: error instanceof Error ? error.message : String(error),
				}),
			};
		}
	}

	private async fixAttachmentRegistryConsistency(options?: DataFixOptions): Promise<DataFixResult> {
		const registryService = this.plugin.attachmentRegistryService;
		if (!registryService) {
			return {
				type: "attachment_registry_consistency",
				success: 0,
				failed: 0,
				errors: [],
			};
		}

		try {
			const before = await registryService.scan();
			const unresolvedStrategy = options?.allowHighRisk ? "placeholder" : "leave";
			const repair = await registryService.repairReferences({
				reason: "data_management_fix",
				unresolvedStrategy,
			});
			const after = await registryService.scan();

			const fixedStale = before.isRegistryStale && !after.isRegistryStale ? 1 : 0;
			const success =
				repair.pathsNormalized +
				repair.pathsPlaceholdered +
				repair.pathsRemoved +
				repair.manifestPathsNormalized +
				fixedStale;
			const remainingAutoFix = getAttachmentRegistryAutoFixIssueCount(after);

			return {
				type: "attachment_registry_consistency",
				success,
				failed: remainingAutoFix,
				errors: after.brokenPaths.map((path) => ({
					uuid: path,
					error: t("management.dataCheckService.messages.attachmentRegistryBrokenRefPending", {
						path,
					}),
				})),
			};
		} catch (error) {
			logger.error("[DataManagement] 附件索引重建失败:", error);
			return {
				type: "attachment_registry_consistency",
				success: 0,
				failed: 1,
				errors: [
					{
						uuid: "attachment_registry_consistency",
						error: error instanceof Error ? error.message : String(error),
					},
				],
			};
		}
	}

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
					? t("management.dataCheckService.messages.progressiveClozeOrphanFound", { count: orphans.length })
					: t("management.dataCheckService.messages.progressiveClozeOrphanOk"),
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
			childrenByParent.get(card.parentCardId)?.add(card.clozeOrd);
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
					? t("management.dataCheckService.messages.progressiveClozeMissingChildrenFound", { count: problems.length })
					: t("management.dataCheckService.messages.progressiveClozeMissingChildrenOk"),
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

			if (!contentOrds.has(card.clozeOrd)) {
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
					? t("management.dataCheckService.messages.progressiveClozeExtraChildrenFound", { count: extras.length })
					: t("management.dataCheckService.messages.progressiveClozeExtraChildrenOk"),
		};
	}

	private buildSplitPluginResidueCheckDelegation(type: CheckType): DataCheckResult | null {
		if (!isSplitPluginResidueCheckType(type)) {
			return null;
		}

		const pluginId = getSplitPluginResidueOwnerPluginId(type);
		if (!pluginId) {
			return null;
		}

		const installed = isSplitPluginResidueDelegatedToStandalonePlugin(this.plugin.app, type);

		return {
			type,
			status: "ok",
			count: 0,
			items: [],
			message: installed
				? t("management.dataCheckService.messages.splitPluginDelegatedCheck", { pluginId })
				: getSplitPluginUnavailableMessage(this.plugin.app, pluginId),
		};
	}

	private buildSplitPluginResidueFixBlock(type: CheckType): DataFixResult | null {
		if (!isSplitPluginResidueCheckType(type)) {
			return null;
		}

		const pluginId = getSplitPluginResidueOwnerPluginId(type);
		if (!pluginId) {
			return null;
		}

		const installed = isSplitPluginResidueDelegatedToStandalonePlugin(this.plugin.app, type);
		return this.buildBlockedFixResult(
			type,
			installed
				? t("management.dataCheckService.messages.splitPluginDelegatedFix", { pluginId })
				: getSplitPluginUnavailableMessage(this.plugin.app, pluginId)
		);
	}

	/**
	 * 数据管理：一键将旧卡片/记忆 JSON 格式迁移到 content YAML + .wdeck。
	 * 不含 Schema V2 目录搬迁与增量阅读高风险迁移。
	 */
	async executeConsolidatedFormatMigration(options: { confirmed?: boolean } = {}): Promise<DataFixResult> {
		if (!options.confirmed) {
			return this.buildBlockedFixResult(
				"wdeck_migration",
				t("management.dataCheckService.messages.consolidatedFormatMigrationConfirm")
			);
		}

		try {
			const { LegacyFormatAutoMigrationService } = await import(
				"../data-migration/LegacyFormatAutoMigrationService"
			);
			const summary = await new LegacyFormatAutoMigrationService(this.plugin).run({
				mode: "manual",
				allowHighRisk: true,
				notify: false,
			});

			const success = summary.steps.reduce((total, step) => total + step.success, 0);
			const failed = summary.steps.reduce((total, step) => total + step.failed, 0);
			const errors = summary.steps
				.filter((step) => step.failed > 0 && step.message)
				.map((step) => ({ uuid: step.step, error: step.message || step.step }));

			return {
				type: "wdeck_migration",
				success,
				failed,
				errors,
			};
		} catch (error) {
			logger.error("[DataManagement] 统一旧格式迁移失败:", error);
			return {
				type: "wdeck_migration",
				success: 0,
				failed: 1,
				errors: [{ uuid: "", error: error instanceof Error ? error.message : String(error) }],
			};
		}
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
