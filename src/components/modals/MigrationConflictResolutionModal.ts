import { App, Modal, Notice, Setting } from "obsidian";
import type WeavePlugin from "../../main";
import {
	DataManagementService,
	type MigrationConflictInspection,
} from "../../services/data-management/DataManagementService";
import { logger } from "../../utils/logger";
import { DataManagementModalObsidian } from "./DataManagementModalObsidian";

export class MigrationConflictResolutionModal extends Modal {
	private readonly plugin: WeavePlugin;
	private readonly initialInspection: MigrationConflictInspection;

	constructor(app: App, plugin: WeavePlugin, inspection: MigrationConflictInspection) {
		super(app);
		this.plugin = plugin;
		this.initialInspection = inspection;
	}

	onOpen() {
		this.setTitle("检测到迁移冲突文件");
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		const descEl = contentEl.createDiv({ cls: "setting-item-description" });
		descEl.createEl("p", {
			text:
				"Weave 检测到旧迁移过程中遗留的冲突副本。可自动处理的部分建议立即归并；无法自动判断的部分，请在数据管理里人工复核。",
		});

		const statsEl = contentEl.createDiv();
		new Setting(statsEl).setName("冲突文件总数").setDesc(`${this.initialInspection.total} 个`);
		new Setting(statsEl)
			.setName("可自动处理")
			.setDesc(`${this.initialInspection.autoRecoverableCount} 个`);
		new Setting(statsEl)
			.setName("需人工复核")
			.setDesc(`${this.initialInspection.manualReviewCount} 个`);

		if (this.initialInspection.files.length > 0) {
			const listTitle = contentEl.createEl("h4", { text: "冲突概览" });
			listTitle.addClass("setting-item-name");
			const listEl = contentEl.createEl("ul");
			for (const file of this.initialInspection.files.slice(0, 6)) {
				listEl.createEl("li", {
					text: `${file.autoRecoverable ? "可自动处理" : "需人工复核"} · ${file.label} · ${file.fileName}`,
				});
			}
			if (this.initialInspection.files.length > 6) {
				listEl.createEl("li", {
					text: `还有 ${this.initialInspection.files.length - 6} 个冲突文件，请在数据管理中查看完整列表。`,
				});
			}
		}

		const actions = contentEl.createDiv({ cls: "obsidian-confirm-buttons" });

		const laterButton = actions.createEl("button", { text: "稍后处理" });
		laterButton.onclick = () => this.close();

		const openManagementButton = actions.createEl("button", { text: "打开数据管理" });
		openManagementButton.onclick = () => {
			this.openDataManagementModal();
			this.close();
		};

		if (this.initialInspection.autoRecoverableCount > 0) {
			const autoRecoverButton = actions.createEl("button", {
				text: "自动处理可恢复项",
				cls: "mod-cta",
			});
			autoRecoverButton.onclick = async () => {
				await this.handleAutoRecover(autoRecoverButton, openManagementButton, laterButton);
			};
		}
	}

	private async handleAutoRecover(
		autoRecoverButton: HTMLButtonElement,
		openManagementButton: HTMLButtonElement,
		laterButton: HTMLButtonElement
	): Promise<void> {
		autoRecoverButton.disabled = true;
		openManagementButton.disabled = true;
		laterButton.disabled = true;
		autoRecoverButton.textContent = "处理中...";

		try {
			const dataManagementService = new DataManagementService(this.plugin);
			const result = await dataManagementService.fix("migration_conflict_files", {
				allowHighRisk: true,
			});
			const remaining = await dataManagementService.inspectMigrationConflictFiles();

			if (result.failed > 0) {
				logger.warn("[Migration] 自动处理迁移冲突后仍有残留:", result.errors);
			}

			if (remaining.total > 0) {
				new Notice(
					`Weave: 已自动处理部分迁移冲突，仍有 ${remaining.total} 个条目需要继续复核`,
					8000
				);
				this.openDataManagementModal();
			} else {
				new Notice("Weave: 迁移冲突文件已处理完成", 5000);
			}

			this.close();
		} catch (error) {
			logger.error("[Migration] 自动处理迁移冲突失败:", error);
			new Notice("Weave: 自动处理迁移冲突失败，请打开数据管理继续处理", 8000);
			autoRecoverButton.disabled = false;
			openManagementButton.disabled = false;
			laterButton.disabled = false;
			autoRecoverButton.textContent = "自动处理可恢复项";
		}
	}

	private openDataManagementModal(): void {
		new DataManagementModalObsidian(this.app, {
			plugin: this.plugin,
		}).open();
	}
}
