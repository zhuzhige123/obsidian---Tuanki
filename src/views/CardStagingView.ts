import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import type { unmount } from "svelte";
import type { WeavePlugin } from "../main";
import { i18n } from "../utils/i18n";
import { logger } from "../utils/logger";
import { revealLeaf } from "../utils/workspace-navigation";

export const VIEW_TYPE_CARD_STAGING = "weave-card-staging-view";

type CardStagingViewState = {
	sessionId?: string;
};

type ItemViewSetStateResult = Parameters<ItemView["setState"]>[1];
type MountedCardStagingComponent = Parameters<typeof unmount>[0];

export class CardStagingView extends ItemView {
	private component: MountedCardStagingComponent | null = null;
	private plugin: WeavePlugin;
	private sessionId: string | undefined;

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CARD_STAGING;
	}

	getDisplayText(): string {
		return "";
	}

	getIcon(): string {
		return "sparkles";
	}

	allowNoFile(): boolean {
		return true;
	}

	getNavigationType(): string {
		return "tab";
	}

	getState(): CardStagingViewState {
		return {};
	}

	async setState(state: CardStagingViewState, result: ItemViewSetStateResult): Promise<void> {
		await super.setState(state, result);

		if (!state?.sessionId) {
			window.setTimeout(() => {
				void this.leaf.detach();
			}, 100);
			return;
		}

		this.sessionId = state.sessionId;

		if (!this.component) {
			await this.createComponent();
		}
	}

	async onOpen(): Promise<void> {
		if (this.sessionId) {
			await this.createComponent();
		}
	}

	async onClose(): Promise<void> {
		if (this.component) {
			const { unmount: svelteUnmount } = await import("svelte");
			void svelteUnmount(this.component);
			this.component = null;
		}
	}

	private async createComponent(): Promise<void> {
		if (!this.sessionId) {
			this.showError(i18n.t("aiAssistant.staging.sessionMissing"));
			return;
		}

		this.contentEl.empty();
		this.contentEl.addClass("weave-card-staging-view-root");

		try {
			const [{ mount }, { default: CardStagingStudyShell }] = await Promise.all([
				import("svelte"),
				import("../components/ai-assistant/CardStagingStudyShell.svelte"),
			]);

			this.component = mount(CardStagingStudyShell, {
				target: this.contentEl,
				props: {
					plugin: this.plugin,
					dataStorage: this.plugin.dataStorage,
					fsrs: this.plugin.fsrs,
					sessionId: this.sessionId,
					viewInstance: this,
					onClose: () => {
						void this.leaf.detach();
					},
				},
			});
		} catch (error) {
			logger.error("[CardStagingView] 创建组件失败:", error);
			this.showError(i18n.t("aiAssistant.staging.openFailed"));
		}
	}

	private showError(message: string): void {
		this.contentEl.empty();
		this.contentEl.createDiv({
			cls: "weave-study-view-error",
			text: message,
		});
	}
}

export async function openCardStagingView(
	plugin: WeavePlugin,
	sessionId: string
): Promise<void> {
	const workspace = plugin.app.workspace;
	const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_CARD_STAGING);
	const existingLeaf = existingLeaves[0];

	if (existingLeaf) {
		revealLeaf(plugin.app, existingLeaf);
		await existingLeaf.setViewState({
			type: VIEW_TYPE_CARD_STAGING,
			state: { sessionId },
		});
		return;
	}

	const leaf = workspace.getLeaf("tab");
	await leaf.setViewState({
		type: VIEW_TYPE_CARD_STAGING,
		state: { sessionId },
	});
	revealLeaf(plugin.app, leaf);

	if (Platform.isMobile) {
		try {
			const ws = workspace as unknown as {
				setActiveLeaf?: (leaf: WorkspaceLeaf, focus?: boolean | { focus?: boolean }) => void;
			};
			ws.setActiveLeaf?.(leaf, { focus: true });
		} catch {
			// noop
		}
	}
}
