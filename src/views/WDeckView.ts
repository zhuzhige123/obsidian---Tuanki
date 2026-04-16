import { ItemView, Notice, Platform, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../main";
import { logger } from "../utils/logger";

export const VIEW_TYPE_WDECK = "weave-wdeck-file";

export class WDeckView extends ItemView {
	private plugin: WeavePlugin;
	private filePath = "";
	private isOpen = false;
	private redirecting = false;
	private redirectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
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

		const incomingPath = String(state?.filePath || state?.file || "").trim();
		if (incomingPath) {
			this.filePath = incomingPath;
		}

		if (this.isOpen && this.filePath) {
			this.scheduleRedirectToStudy();
		}
	}

	async onOpen(): Promise<void> {
		this.isOpen = true;
		this.contentEl.empty();
		this.contentEl.addClass("weave-wdeck-view");
		this.contentEl.createDiv({
			cls: "weave-wdeck-loading",
			text: "正在加载牌组学习界面...",
		});

		if (this.filePath) {
			this.scheduleRedirectToStudy();
		}
	}

	async onClose(): Promise<void> {
		this.isOpen = false;
		this.clearRedirectTimer();
	}

	private scheduleRedirectToStudy(): void {
		if (!this.filePath || this.redirecting || this.redirectTimer) {
			return;
		}

		// Delay the redirect until the current view lifecycle finishes, or the same leaf can stall.
		this.redirectTimer = setTimeout(() => {
			this.redirectTimer = null;
			if (!this.isOpen) {
				return;
			}

			void this.redirectToStudy();
		}, 0);
	}

	private clearRedirectTimer(): void {
		if (!this.redirectTimer) {
			return;
		}

		clearTimeout(this.redirectTimer);
		this.redirectTimer = null;
	}

	private async redirectToStudy(): Promise<void> {
		if (!this.filePath || this.redirecting) {
			return;
		}

		this.redirecting = true;
		try {
			await this.plugin.openWDeckStudy(this.filePath, this.leaf);
		} catch (error) {
			logger.error("[WDeckView] 打开 WDeck 学习失败:", error);
			this.contentEl.empty();
			this.contentEl.createDiv({
				cls: "weave-wdeck-error",
				text: "WDeck 文件打开失败",
			});
			new Notice("WDeck 文件打开失败");
		} finally {
			this.redirecting = false;
		}
	}
}
