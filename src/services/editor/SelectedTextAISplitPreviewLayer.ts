import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { mount, unmount } from "svelte";
import SelectedTextAICardPanel from "../../components/ai-assistant/SelectedTextAICardPanel.svelte";
import type { WeavePlugin } from "../../main";

export type SelectedTextAISplitPreviewOpenArgs = {
	selectedText: string;
	actionId: string;
	sourceFilePath: string;
	sourceLink?: string;
};

/**
 * Workspace 级单例：将「选中文本 AI 拆分预览」挂在 `workspace.containerEl` 底部，
 * 供 Markdown、EPUB 阅读器等任意入口共用同一套 UI 与生命周期。
 */
export class SelectedTextAISplitPreviewLayer {
	private rootEl: HTMLElement | null = null;
	private mountTarget: HTMLElement | null = null;
	private svelteInstance: unknown = null;
	private sessionSourcePath = "";

	constructor(
		private readonly plugin: WeavePlugin,
		private readonly app: App
	) {}

	private ensureDom(): void {
		if (this.rootEl?.isConnected && this.mountTarget?.isConnected) {
			return;
		}

		const workspace = this.app.workspace?.containerEl;
		if (!workspace) {
			return;
		}

		const root = document.createElement("div");
		root.className = "weave-global-ai-split-preview-layer";
		root.setAttribute("data-weave-ai-split-preview-layer", "true");
		root.setAttribute("aria-live", "polite");

		const inner = document.createElement("div");
		inner.className = "weave-ai-card-panel-container weave-global-ai-split-preview-inner";

		root.appendChild(inner);
		workspace.appendChild(root);

		this.rootEl = root;
		this.mountTarget = inner;
	}

	async open(args: SelectedTextAISplitPreviewOpenArgs): Promise<void> {
		this.close();
		const normalizedSource = normalizePath(String(args.sourceFilePath || "").trim());
		this.sessionSourcePath = normalizedSource || "";
		this.ensureDom();
		if (!this.mountTarget) {
			return;
		}

		this.svelteInstance = mount(SelectedTextAICardPanel, {
			target: this.mountTarget,
			props: {
				host: this.plugin,
				selectedText: args.selectedText,
				actionId: args.actionId,
				sourceFilePath: args.sourceFilePath,
				sourceLink: args.sourceLink?.trim() || "",
				onClose: () => this.close(),
			},
		});
	}

	close(): void {
		if (this.svelteInstance) {
			try {
				void unmount(this.svelteInstance);
			} catch {
				/* ignore */
			}
			this.svelteInstance = null;
		}
		try {
			this.mountTarget?.replaceChildren();
		} catch {
			/* ignore */
		}
		this.sessionSourcePath = "";
	}

	/** 仅当当前预览会话对应 `filePath` 时关闭（供 EPUB 视图卸载等场景，避免误关 Markdown 会话）。 */
	closeIfSessionSourceMatches(filePath: string): void {
		const want = normalizePath(String(filePath || "").trim());
		if (!want || !this.sessionSourcePath || this.sessionSourcePath !== want) {
			return;
		}
		this.close();
	}

	dispose(): void {
		this.close();
		try {
			this.rootEl?.remove();
		} catch {
			/* ignore */
		}
		this.rootEl = null;
		this.mountTarget = null;
	}
}
