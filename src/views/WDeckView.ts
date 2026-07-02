import { ItemView, Notice, Platform, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../main";
import { i18n } from "../utils/i18n";
import {
	isWDeckFileLoadError,
	type WDeckFileLoadError,
} from "../services/wdeck/WDeckService";
import { showObsidianChoice } from "../utils/obsidian-confirm";
import { logger } from "../utils/logger";
import { DeferredLeafRedirectController } from "./DeferredLeafRedirectController";

export const VIEW_TYPE_WDECK = "weave-wdeck-file";

export class WDeckView extends ItemView {
	private plugin: WeavePlugin;
	private filePath = "";
	private isOpen = false;
	private redirecting = false;
	private readonly redirectController: DeferredLeafRedirectController;

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.redirectController = new DeferredLeafRedirectController({
			workspace: plugin.app.workspace,
			leaf,
			shouldRedirect: () => this.isOpen && !!this.filePath && !this.redirecting,
			onRedirect: () => {
				void this.redirectToStudy();
			},
		});
	}

	getViewType(): string {
		return VIEW_TYPE_WDECK;
	}

	getDisplayText(): string {
		if (Platform.isMobile) {
			return "";
		}

		if (!this.filePath) {
			return "WDeck";
		}

		return this.filePath.split(/[\\/]/).pop() || "WDeck";
	}

	getIcon(): string {
		return "graduation-cap";
	}

	allowNoFile(): boolean {
		return true;
	}

	getState(): Record<string, unknown> {
		return {
			filePath: this.filePath,
			file: this.filePath,
		};
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);

		const pathCandidate = state.filePath ?? state.file;
		const incomingPath = typeof pathCandidate === "string" ? pathCandidate.trim() : "";
		if (incomingPath) {
			this.filePath = incomingPath;
		}

		if (this.isOpen && this.filePath) {
			this.redirectController.request();
		}
	}

	async onOpen(): Promise<void> {
		this.isOpen = true;
		this.contentEl.empty();
		this.contentEl.addClass("weave-wdeck-view");
		this.contentEl.createDiv({
			cls: "weave-wdeck-loading",
			text: i18n.t("views.wdeck.loading"),
		});

		this.redirectController.start();
	}

	async onClose(): Promise<void> {
		this.isOpen = false;
		this.redirectController.stop();
	}

	private getDisplayFileName(): string {
		return this.filePath.split(/[\\/]/).pop() || i18n.t("views.wdeck.fallbackFileName");
	}

	private renderState(title: string, description: string): void {
		this.contentEl.empty();
		this.contentEl.addClass("weave-wdeck-view");
		const stateEl = this.contentEl.createDiv({ cls: "weave-wdeck-error" });
		stateEl.createEl("h3", { text: title });
		stateEl.createEl("p", { text: description });
	}

	private async handleRecoverableFileError(error: WDeckFileLoadError): Promise<void> {
		const fileName = this.getDisplayFileName();
		const hasBackup = this.plugin.wdeckService
			? await this.plugin.wdeckService.hasRecoverableBackup(this.filePath)
			: false;
		const backupHint = hasBackup ? i18n.t("views.wdeck.recovery.backupDetected") : "";
		const copy =
			error.code === "empty_file"
				? {
						title: i18n.t("views.wdeck.recovery.empty.title"),
						description: i18n.t("views.wdeck.recovery.empty.description"),
						message: i18n.t("views.wdeck.recovery.empty.message", { fileName, backupHint }),
						deleteNotice: i18n.t("views.wdeck.recovery.empty.deleteNotice"),
						repairNotice: i18n.t("views.wdeck.recovery.empty.repairNotice"),
						restoreNotice: i18n.t("views.wdeck.recovery.empty.restoreNotice"),
					}
				: {
						title: i18n.t("views.wdeck.recovery.invalid.title"),
						description: i18n.t("views.wdeck.recovery.invalid.description"),
						message: i18n.t("views.wdeck.recovery.invalid.message", { fileName, backupHint }),
						deleteNotice: i18n.t("views.wdeck.recovery.invalid.deleteNotice"),
						repairNotice: i18n.t("views.wdeck.recovery.invalid.repairNotice"),
						restoreNotice: i18n.t("views.wdeck.recovery.invalid.restoreNotice"),
					};

		const choices = [
			{
				value: "keep",
				text: i18n.t("views.wdeck.recovery.choiceKeep"),
				description: i18n.t("views.wdeck.recovery.choiceKeepDescription"),
			},
			{
				value: "repair",
				text: i18n.t("views.wdeck.recovery.choiceRepair"),
				description: i18n.t("views.wdeck.recovery.choiceRepairDescription"),
				className: "mod-cta",
			},
		] as Array<{
			value: "keep" | "repair" | "restore" | "delete";
			text: string;
			description: string;
			className?: string;
		}>;

		if (hasBackup) {
			choices.push({
				value: "restore",
				text: i18n.t("views.wdeck.recovery.choiceRestore"),
				description: i18n.t("views.wdeck.recovery.choiceRestoreDescription"),
				className: "mod-cta",
			});
		}

		choices.push({
			value: "delete",
			text: i18n.t("views.wdeck.recovery.choiceDelete"),
			description: i18n.t("views.wdeck.recovery.choiceDeleteDescription"),
			className: "mod-warning",
		});

		const action = await showObsidianChoice(this.plugin.app, copy.message, {
			title: copy.title,
			cancelText: i18n.t("views.wdeck.recovery.close"),
			choices,
		});

		if (action === "repair") {
			try {
				if (!this.plugin.wdeckService) {
					throw new Error(i18n.t("views.wdeck.serviceUnavailable"));
				}

				const result = await this.plugin.wdeckService.repairDeckFileByPath(this.filePath);
				if (!result.repaired) {
					new Notice(hasBackup ? i18n.t("views.wdeck.repairFailedWithBackup") : i18n.t("views.wdeck.repairFailedNoBackup"));
					this.renderState(copy.title, copy.description);
					return;
				}

				new Notice(result.usedBackup ? copy.restoreNotice : copy.repairNotice);
				await this.redirectToStudy();
				return;
			} catch (repairError) {
				logger.error("[WDeckView] 修复无效 WDeck 文件失败:", repairError);
				new Notice(i18n.t("views.wdeck.recovery.repairError", {
					error: repairError instanceof Error ? repairError.message : i18n.t("common.unknown"),
				}));
				this.renderState(copy.title, copy.description);
				return;
			}
		}

		if (action === "restore") {
			try {
				if (!this.plugin.wdeckService) {
					throw new Error(i18n.t("views.wdeck.serviceUnavailable"));
				}

				const restored = await this.plugin.wdeckService.restoreDeckFileFromBackup(this.filePath);
				if (!restored) {
					new Notice(i18n.t("views.wdeck.restoreNotFound"));
					this.renderState(copy.title, copy.description);
					return;
				}

				new Notice(copy.restoreNotice);
				await this.redirectToStudy();
				return;
			} catch (restoreError) {
				logger.error("[WDeckView] 恢复 WDeck 备份失败:", restoreError);
				new Notice(i18n.t("views.wdeck.recovery.restoreError", {
					error: restoreError instanceof Error ? restoreError.message : i18n.t("common.unknown"),
				}));
				this.renderState(copy.title, copy.description);
				return;
			}
		}

		if (action === "delete") {
			try {
				if (!this.plugin.wdeckService) {
					throw new Error(i18n.t("views.wdeck.serviceUnavailable"));
				}

				await this.plugin.wdeckService.deleteDeckFileByPath(this.filePath);
				new Notice(copy.deleteNotice);
				this.leaf.detach();
				return;
			} catch (deleteError) {
				logger.error("[WDeckView] 删除无效 WDeck 文件失败:", deleteError);
				new Notice(i18n.t("views.wdeck.recovery.deleteError", {
					error: deleteError instanceof Error ? deleteError.message : i18n.t("common.unknown"),
				}));
			}
		}

		this.renderState(copy.title, copy.description);
	}

	private async redirectToStudy(): Promise<void> {
		if (!this.filePath || this.redirecting) {
			return;
		}

		this.redirecting = true;
		try {
			await this.plugin.openWDeckStudy(this.filePath, this.leaf);
		} catch (error) {
			if (
				isWDeckFileLoadError(error) &&
				(error.code === "empty_file"
					|| error.code === "invalid_json"
					|| error.code === "invalid_file")
			) {
				logger.warn("[WDeckView] 检测到无法打开的 WDeck 文件:", error);
				await this.handleRecoverableFileError(error);
				return;
			}

			logger.error("[WDeckView] 打开 WDeck 学习失败:", error);
			this.renderState(i18n.t("views.wdeck.openFailedTitle"), i18n.t("views.wdeck.openFailedDescription"));
			new Notice(i18n.t("views.wdeck.openFailedNotice"));
		} finally {
			this.redirecting = false;
		}
	}
}
