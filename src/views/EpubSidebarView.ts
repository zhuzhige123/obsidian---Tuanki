import { type EventRef, ItemView, WorkspaceLeaf } from "obsidian";
import { EPUB_RUNTIME } from "../services/epub";
import { logger } from "../utils/logger";
import { getViewSurfaceTokens } from "../utils/view-location-utils";
import type { EpubViewHost } from "./epub-view-host";

export const VIEW_TYPE_EPUB_SIDEBAR = EPUB_RUNTIME.viewTypes.sidebar;

export class EpubSidebarView extends ItemView {
	private component: object | null = null;
	private plugin: EpubViewHost;
	private layoutChangeRef: EventRef | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: EpubViewHost) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB_SIDEBAR;
	}

	getDisplayText(): string {
		return "电子书侧边栏";
	}

	getIcon(): string {
		return "book-open";
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
			const { default: EpubGlobalSidebar } = await import(
				"../components/epub/EpubGlobalSidebar.svelte"
			);

			this.component = mount(EpubGlobalSidebar, {
				target: this.contentEl,
				props: {
					app: this.app,
				},
			});

			logger.debug("[EpubSidebarView] Sidebar component mounted");
		} catch (error) {
			logger.error("[EpubSidebarView] Failed to mount sidebar:", error);
			this.contentEl.empty();
			this.contentEl.createDiv({
				cls: "epub-error",
				text: "侧边栏加载失败",
			});
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
			} catch (_e) {
				// ignore
			}
			this.component = null;
		}
	}
}
