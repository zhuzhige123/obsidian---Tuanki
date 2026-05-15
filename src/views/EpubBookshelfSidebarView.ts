import { type EventRef, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { EPUB_RUNTIME } from "../services/epub";
import { resolveRecentEpubPath } from "../utils/epub-leaf-utils";
import { logger } from "../utils/logger";
import { getViewSurfaceTokens } from "../utils/view-location-utils";
import { revealLeaf } from "../utils/workspace-navigation";
import type { EpubViewHost } from "./epub-view-host";
import { VIEW_TYPE_EPUB_SIDEBAR } from "./EpubSidebarView";

export const VIEW_TYPE_EPUB_BOOKSHELF_SIDEBAR = EPUB_RUNTIME.viewTypes.bookshelfSidebar;

export class EpubBookshelfSidebarView extends ItemView {
	private component: object | null = null;
	private plugin: EpubViewHost;
	private layoutChangeRef: EventRef | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: EpubViewHost) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB_BOOKSHELF_SIDEBAR;
	}

	getDisplayText(): string {
		return "EPUB 书架";
	}

	getIcon(): string {
		return "library";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("weave-epub-sidebar-view");
		this.applySurfaceContext();
		this.layoutChangeRef = this.app.workspace.on("layout-change", () => {
			this.applySurfaceContext();
		});

		try {
			const { mount } = await import("svelte");
			const { default: BookshelfView } = await import("../components/epub/BookshelfView.svelte");

			this.component = mount(BookshelfView, {
				target: this.contentEl,
				props: {
					app: this.app,
					onClose: () => {
						void this.returnToRecentBookDirectory();
					},
					onSwitchBook: async (filePath: string) => {
						if (typeof this.plugin.openEpubReader === "function") {
							await this.plugin.openEpubReader(filePath);
						}
					},
				},
			});

			logger.debug("[EpubBookshelfSidebarView] Bookshelf component mounted");
		} catch (error) {
			logger.error("[EpubBookshelfSidebarView] Failed to mount bookshelf:", error);
			this.contentEl.empty();
			this.contentEl.createDiv({
				cls: "epub-error",
				text: "书架加载失败",
			});
		}
	}

	private async returnToRecentBookDirectory(): Promise<void> {
		try {
			const recentPath = await resolveRecentEpubPath(this.app);
			if (recentPath && typeof this.plugin.openEpubReader === "function") {
				await this.plugin.openEpubReader(recentPath);
			}

			await this.leaf.setViewState({
				type: VIEW_TYPE_EPUB_SIDEBAR,
				active: true,
			});
			revealLeaf(this.app, this.leaf);
		} catch (error) {
			logger.error("[EpubBookshelfSidebarView] Failed to return to EPUB sidebar:", error);
			new Notice("返回 EPUB 目录失败");
		}
	}

	private applySurfaceContext(): void {
		const surfaceTokens = getViewSurfaceTokens(this.leaf);
		const targets = [this.contentEl, this.contentEl.parentElement].filter(Boolean) as HTMLElement[];

		for (const target of targets) {
			target.dataset.weaveSurfaceContext = surfaceTokens.context;
			target.style.setProperty("--weave-surface-background", surfaceTokens.surfaceBackground);
			target.style.setProperty("--weave-elevated-background", surfaceTokens.elevatedBackground);
		}
	}

	async onClose(): Promise<void> {
		if (this.layoutChangeRef) {
			this.app.workspace.offref(this.layoutChangeRef);
			this.layoutChangeRef = null;
		}

		if (this.component) {
			const { unmount } = await import("svelte");
			try {
				void unmount(this.component);
			} catch (_error) {
				// ignore
			}
			this.component = null;
		}
	}
}
