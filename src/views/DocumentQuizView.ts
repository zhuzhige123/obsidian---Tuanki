import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import type { unmount } from "svelte";
import type { WeavePlugin } from "../main";
import { i18n } from "../utils/i18n";
import { logger } from "../utils/logger";
import { revealLeaf } from "../utils/workspace-navigation";

export const VIEW_TYPE_DOCUMENT_QUIZ = "weave-document-quiz-view";

type DocumentQuizViewState = {
	sessionId?: string;
};

type ItemViewSetStateResult = Parameters<ItemView["setState"]>[1];
type MountedComponent = Parameters<typeof unmount>[0];

export class DocumentQuizView extends ItemView {
	private component: MountedComponent | null = null;
	private plugin: WeavePlugin;
	private sessionId: string | undefined;

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_DOCUMENT_QUIZ;
	}

	getDisplayText(): string {
		return "";
	}

	getIcon(): string {
		return "clipboard-check";
	}

	allowNoFile(): boolean {
		return true;
	}

	getNavigationType(): string {
		return "tab";
	}

	getState(): DocumentQuizViewState {
		return {};
	}

	async setState(state: DocumentQuizViewState, result: ItemViewSetStateResult): Promise<void> {
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
		this.contentEl.empty();
		this.contentEl.addClass("weave-document-quiz-view-root");
		this.contentEl.addClass("weave-main-editor-mode");

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

	getActiveSessionId(): string | undefined {
		return this.sessionId;
	}

	private async createComponent(): Promise<void> {
		if (!this.sessionId) {
			this.showError(i18n.t("documentQuiz.sessionMissing"));
			return;
		}

		this.contentEl.empty();

		try {
			const [{ mount }, { default: DocumentQuizStudyShell }] = await Promise.all([
				import("svelte"),
				import("../components/document-quiz/DocumentQuizStudyShell.svelte"),
			]);

			this.component = mount(DocumentQuizStudyShell, {
				target: this.contentEl,
				props: {
					plugin: this.plugin,
					sessionId: this.sessionId,
					viewInstance: this,
					onClose: () => {
						void this.leaf.detach();
					},
				},
			});
		} catch (error) {
			logger.error("[DocumentQuizView] 创建组件失败:", error);
			this.showError(i18n.t("documentQuiz.openFailed"));
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

export async function openDocumentQuizView(
	plugin: WeavePlugin,
	sessionId: string
): Promise<void> {
	const workspace = plugin.app.workspace;
	const leaves = workspace.getLeavesOfType(VIEW_TYPE_DOCUMENT_QUIZ);
	const existing = leaves.find((leaf) => {
		const view = leaf.view;
		return view instanceof DocumentQuizView && view.getActiveSessionId() === sessionId;
	});

	if (existing) {
		revealLeaf(plugin.app, existing);
		await existing.setViewState({
			type: VIEW_TYPE_DOCUMENT_QUIZ,
			state: { sessionId },
		});
		return;
	}

	const leaf = workspace.getLeaf("tab");
	await leaf.setViewState({
		type: VIEW_TYPE_DOCUMENT_QUIZ,
		state: { sessionId },
	});
	revealLeaf(plugin.app, leaf);

	if (Platform.isMobile) {
		try {
			workspace.trigger("layout-change");
		} catch {
			/* no-op */
		}
	}
}
