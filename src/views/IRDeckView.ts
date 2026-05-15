import { ItemView, Notice, Platform, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../main";
import { IR_RUNTIME } from "../services/incremental-reading/ir-runtime";
import { i18n } from "../utils/i18n";
import { logger } from "../utils/logger";
import { DeferredLeafRedirectController } from "./DeferredLeafRedirectController";

export const VIEW_TYPE_IRDECK = IR_RUNTIME.viewTypes.deck;

export class IRDeckView extends ItemView {
	private plugin: WeavePlugin;
	private filePath = "";
	private isOpen = false;
	private redirecting = false;
	private readonly redirectController: DeferredLeafRedirectController;

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.redirectController = new DeferredLeafRedirectController({
			workspace: plugin.app.workspace as any,
			leaf,
			shouldRedirect: () => this.isOpen && !!this.filePath && !this.redirecting,
			onRedirect: () => {
				void this.redirectToCalendar();
			},
		});
	}

	getViewType(): string {
		return VIEW_TYPE_IRDECK;
	}

	getDisplayText(): string {
		if (Platform.isMobile) {
			return "";
		}

		if (!this.filePath) {
			return "IRDeck";
		}

		return this.filePath.split(/[\\/]/).pop() || "IRDeck";
	}

	getIcon(): string {
		return "calendar";
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

		const incomingPath = String(state?.filePath || state?.file || "").trim();
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
		this.contentEl.addClass("weave-irdeck-view");
		this.contentEl.createDiv({
			cls: "weave-irdeck-loading",
			text: i18n.t("views.irdeck.loading"),
		});

		this.redirectController.start();
	}

	async onClose(): Promise<void> {
		this.isOpen = false;
		this.redirectController.stop();
	}

	private async redirectToCalendar(): Promise<void> {
		if (!this.filePath || this.redirecting) {
			return;
		}

		this.redirecting = true;
		try {
			await this.plugin.openIRDeckCalendar(this.filePath, this.leaf);
		} catch (error) {
			logger.error("[IRDeckView] 打开 IRDeck 月历失败:", error);
			this.contentEl.empty();
			this.contentEl.createDiv({
				cls: "weave-irdeck-error",
				text: i18n.t("views.irdeck.openFailed"),
			});
			new Notice(i18n.t("views.irdeck.openFailed"));
		} finally {
			this.redirecting = false;
		}
	}
}
