import { ItemView, Platform, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../main";
import { IR_RUNTIME } from "../services/incremental-reading/ir-runtime";
import { i18n } from "../utils/i18n";
import { logger } from "../utils/logger";
import { DeferredLeafRedirectController } from "./DeferredLeafRedirectController";

/**
 * 保留旧视图类型字符串，仅用于兼容旧 workspace 布局恢复。
 * 现役增量阅读已不再使用这个独立主阅读视图。
 */
export const VIEW_TYPE_IR_FOCUS = IR_RUNTIME.viewTypes.focus;

/**
 * 旧增量阅读主阅读界面的兼容壳。
 * 这个视图不再承载阅读逻辑，只负责提示并重定向到左侧侧边栏工作流。
 */
export class IRFocusView extends ItemView {
	private readonly plugin: WeavePlugin;
	private deckPath = "";
	private deckName = "";
	private isOpen = false;
	private redirectStarted = false;
	private readonly redirectController: DeferredLeafRedirectController;

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.redirectController = new DeferredLeafRedirectController({
			workspace: plugin.app.workspace as any,
			leaf,
			shouldRedirect: () => this.isOpen && !this.redirectStarted,
			onRedirect: () => {
				void this.redirectLegacyViewToSidebar();
			},
		});
	}

	private isChinese(): boolean {
		return i18n.getCurrentLanguage() === "zh-CN";
	}

	getViewType(): string {
		return VIEW_TYPE_IR_FOCUS;
	}

	getDisplayText(): string {
		if (Platform.isMobile) {
			return "";
		}
		return this.deckName
			? `${this.deckName} · ${this.isChinese() ? "旧入口兼容" : "Legacy Entry"}`
			: this.isChinese()
			? "增量阅读（旧入口兼容）"
			: "Incremental Reading (Legacy Entry)";
	}

	getIcon(): string {
		return "book-open";
	}

	allowNoFile(): boolean {
		return true;
	}

	getState(): Record<string, unknown> {
		return {
			deckPath: this.deckPath,
			deckName: this.deckName,
		};
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);

		this.deckPath = typeof state?.deckPath === "string" ? state.deckPath : "";
		this.deckName =
			typeof state?.deckName === "string" && state.deckName.trim()
				? state.deckName
				: this.deckPath.split("/").pop() || (this.isChinese() ? "增量阅读" : "Incremental Reading");
	}

	async onOpen(): Promise<void> {
		this.isOpen = true;
		this.renderLegacyRemovedMessage();
		this.redirectController.start();
	}

	async onClose(): Promise<void> {
		this.isOpen = false;
		this.redirectController.stop();
		this.contentEl.empty();
	}

	private renderLegacyRemovedMessage(): void {
		this.contentEl.empty();

		const container = this.contentEl.createDiv({ cls: "weave-legacy-ir-focus-redirect" });
		container.createEl("h3", {
			text: this.isChinese()
				? "旧增量阅读主阅读界面已移除"
				: "The legacy incremental reading view has been removed",
		});
		container.createEl("p", {
			text: this.deckName
				? this.isChinese()
					? `正在切换到左侧月历阅读侧边栏，请在那里继续处理“${this.deckName}”。`
					: `Switching to the left calendar reading sidebar. Continue working on "${this.deckName}" there.`
				: this.isChinese()
				? "正在切换到左侧月历阅读侧边栏，请在那里继续调度和打开阅读材料。"
				: "Switching to the left calendar reading sidebar. Continue scheduling and opening reading materials there.",
		});
	}

	private async redirectLegacyViewToSidebar(): Promise<void> {
		if (this.redirectStarted) {
			return;
		}
		this.redirectStarted = true;

		logger.info(
			"[IRFocusView] Legacy IR focus compatibility view opened, redirecting to sidebar workflow",
			{
				deckPath: this.deckPath,
				deckName: this.deckName,
			}
		);

		await this.plugin.redirectIncrementalReadingToSidebar({
			deckPath: this.deckPath,
			deckName: this.deckName,
			closeLegacyFocusLeaves: true,
		});
	}
}
