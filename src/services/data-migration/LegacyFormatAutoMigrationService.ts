import { Notice } from "obsidian";
import type { WeavePlugin } from "../../main";
import { logger } from "../../utils/logger";
import { DataManagementService } from "../data-management/DataManagementService";
import { CardYAMLMigrationService } from "./CardYAMLMigrationService";

export type LegacyFormatMigrationStepId =
	| "reference_deck"
	| "wdeck"
	| "yaml_metadata"
	| "we_block"
	| "legacy_memory_cleanup";

export interface LegacyFormatMigrationStepResult {
	step: LegacyFormatMigrationStepId;
	skipped: boolean;
	success: number;
	failed: number;
	message?: string;
}

export interface LegacyFormatMigrationSummary {
	success: boolean;
	steps: LegacyFormatMigrationStepResult[];
}

export interface LegacyFormatAutoMigrationOptions {
	/** 启动时静默迁移；手动模式可配合数据管理确认弹窗 */
	mode: "startup" | "manual";
	/** 手动模式执行高风险步骤（WDeck / 旧 JSON 清理） */
	allowHighRisk?: boolean;
	/** 是否在启动时弹出汇总 Notice */
	notify?: boolean;
}

/**
 * 统一旧格式 → 新格式迁移编排。
 * 目标：content YAML + .wdeck 为唯一真源，不再依赖 memory JSON / 顶层废弃字段。
 */
export class LegacyFormatAutoMigrationService {
	constructor(private readonly plugin: WeavePlugin) {}

	async run(options: LegacyFormatAutoMigrationOptions): Promise<LegacyFormatMigrationSummary> {
		const steps: LegacyFormatMigrationStepResult[] = [];
		const dataManagement = new DataManagementService(this.plugin);
		const allowHighRisk = options.allowHighRisk === true || options.mode === "startup";

		steps.push(await this.migrateReferenceDecks());
		steps.push(await this.migrateWDeck(dataManagement, allowHighRisk));
		steps.push(await this.migrateYamlMetadata());
		steps.push(await this.migrateWeBlock(dataManagement));
		steps.push(await this.cleanupLegacyMemory(dataManagement, allowHighRisk));

		const success = steps.every((step) => step.skipped || step.failed === 0);
		const summary: LegacyFormatMigrationSummary = { success, steps };

		if (options.notify !== false && options.mode === "startup") {
			this.notifyStartupSummary(summary);
		}

		logger.info("[LegacyFormatMigration] 完成", summary);
		return summary;
	}

	private async migrateReferenceDecks(): Promise<LegacyFormatMigrationStepResult> {
		const step: LegacyFormatMigrationStepResult = {
			step: "reference_deck",
			skipped: true,
			success: 0,
			failed: 0,
		};

		try {
			const service = this.plugin.referenceMigrationService;
			if (!service) {
				step.message = "ReferenceMigrationService 未初始化";
				return step;
			}

			if (!(await service.needsMigration())) {
				step.message = "无需引用式牌组迁移";
				return step;
			}

			step.skipped = false;
			const result = await service.migrate({
				createBackup: true,
				validate: true,
				dryRun: false,
			});

			if (result.success) {
				step.success = result.migratedCards;
				step.message = `已迁移 ${result.migratedDecks} 个牌组 / ${result.migratedCards} 张卡片`;
			} else {
				step.failed = 1;
				step.message = result.error || "引用式牌组迁移失败";
			}
		} catch (error) {
			step.skipped = false;
			step.failed = 1;
			step.message = error instanceof Error ? error.message : String(error);
			logger.error("[LegacyFormatMigration] 引用式牌组迁移失败:", error);
		}

		return step;
	}

	private async migrateWDeck(
		dataManagement: DataManagementService,
		allowHighRisk: boolean
	): Promise<LegacyFormatMigrationStepResult> {
		const step: LegacyFormatMigrationStepResult = {
			step: "wdeck",
			skipped: true,
			success: 0,
			failed: 0,
		};

		try {
			const check = await dataManagement.check("wdeck_migration");
			if (check.count <= 0) {
				step.message = "无需 WDeck 迁移";
				return step;
			}

			if (!allowHighRisk) {
				step.message = "检测到旧记忆 JSON，请在数据管理中确认迁移";
				return step;
			}

			step.skipped = false;
			const result = await dataManagement.fix("wdeck_migration", { allowHighRisk: true });
			step.success = result.success;
			step.failed = result.failed;
			if (result.failed > 0) {
				step.message = result.errors[0]?.error;
			}
		} catch (error) {
			step.skipped = false;
			step.failed = 1;
			step.message = error instanceof Error ? error.message : String(error);
			logger.error("[LegacyFormatMigration] WDeck 迁移失败:", error);
		}

		return step;
	}

	private async migrateYamlMetadata(): Promise<LegacyFormatMigrationStepResult> {
		const step: LegacyFormatMigrationStepResult = {
			step: "yaml_metadata",
			skipped: true,
			success: 0,
			failed: 0,
		};

		try {
			if (!this.plugin.dataStorage) {
				step.message = "dataStorage 未就绪";
				return step;
			}

			const migrationService = new CardYAMLMigrationService(this.plugin, {
				autoSave: true,
				removeOldFields: true,
			});
			const result = await migrationService.runFullMigration();

			if (result.migratedCount === 0 && result.failedCount === 0) {
				step.message = "YAML 元数据已是最新格式";
				return step;
			}

			step.skipped = false;
			step.success = result.migratedCount;
			step.failed = result.failedCount;
			if (result.failedCount > 0) {
				step.message = `部分卡片 YAML 迁移失败 (${result.failedCount})`;
			}
		} catch (error) {
			step.skipped = false;
			step.failed = 1;
			step.message = error instanceof Error ? error.message : String(error);
			logger.error("[LegacyFormatMigration] YAML 元数据迁移失败:", error);
		}

		return step;
	}

	private async migrateWeBlock(
		dataManagement: DataManagementService
	): Promise<LegacyFormatMigrationStepResult> {
		const step: LegacyFormatMigrationStepResult = {
			step: "we_block",
			skipped: true,
			success: 0,
			failed: 0,
		};

		try {
			const check = await dataManagement.check("we_block_migration");
			if (check.count <= 0) {
				step.message = "无需 we_block 合并";
				return step;
			}

			step.skipped = false;
			const result = await dataManagement.fix("we_block_migration");
			step.success = result.success;
			step.failed = result.failed;
		} catch (error) {
			step.skipped = false;
			step.failed = 1;
			step.message = error instanceof Error ? error.message : String(error);
			logger.error("[LegacyFormatMigration] we_block 合并失败:", error);
		}

		return step;
	}

	private async cleanupLegacyMemory(
		dataManagement: DataManagementService,
		allowHighRisk: boolean
	): Promise<LegacyFormatMigrationStepResult> {
		const step: LegacyFormatMigrationStepResult = {
			step: "legacy_memory_cleanup",
			skipped: true,
			success: 0,
			failed: 0,
		};

		try {
			const check = await dataManagement.check("legacy_memory_files");
			if (check.count <= 0) {
				step.message = "无旧记忆 JSON 残留";
				return step;
			}

			if (!allowHighRisk) {
				step.message = "检测到旧记忆 JSON 残留，请在数据管理中清理";
				return step;
			}

			step.skipped = false;
			const result = await dataManagement.fix("legacy_memory_files", { allowHighRisk: true });
			step.success = result.success;
			step.failed = result.failed;
		} catch (error) {
			step.skipped = false;
			step.failed = 1;
			step.message = error instanceof Error ? error.message : String(error);
			logger.error("[LegacyFormatMigration] 旧记忆 JSON 清理失败:", error);
		}

		return step;
	}

	private notifyStartupSummary(summary: LegacyFormatMigrationSummary): void {
		const changed = summary.steps.filter((step) => !step.skipped && (step.success > 0 || step.failed > 0));
		if (changed.length === 0) {
			return;
		}

		const migrated = changed.reduce((total, step) => total + step.success, 0);
		const failed = changed.reduce((total, step) => total + step.failed, 0);
		if (failed > 0) {
			new Notice(`Weave 旧格式迁移部分完成：成功 ${migrated}，失败 ${failed}。可在数据管理中查看详情。`, 8000);
			return;
		}

		if (migrated > 0) {
			new Notice(`Weave 已将旧格式数据迁移到新格式（${migrated} 项）`, 5000);
		}
	}
}
