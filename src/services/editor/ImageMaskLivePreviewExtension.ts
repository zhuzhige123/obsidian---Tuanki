import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { editorLivePreviewField, type App } from "obsidian";
import { ImageMaskIntegration } from "../image-mask/ImageMaskIntegration";

class ImageMaskLivePreviewViewPlugin {
	private readonly integration: ImageMaskIntegration;
	private observer: MutationObserver | null = null;
	private scheduled = false;
	private lastSignature = "";

	constructor(private readonly view: EditorView, app: App) {
		this.integration = new ImageMaskIntegration(app);
		this.startObserver();
		this.scheduleApply();
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.viewportChanged || update.selectionSet) {
			this.scheduleApply();
		}
	}

	destroy(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.scheduled = false;
	}

	private startObserver(): void {
		this.observer = new MutationObserver(() => this.scheduleApply());
		this.observer.observe(this.view.dom, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["src", "class"],
		});
	}

	private scheduleApply(): void {
		if (this.scheduled) return;
		this.scheduled = true;

		requestAnimationFrame(() => {
			this.scheduled = false;
			this.applyMasksIfNeeded();
		});
	}

	private applyMasksIfNeeded(): void {
		if (!this.view.state.field(editorLivePreviewField, false)) {
			return;
		}

		const container = this.view.dom as HTMLElement;
		const images = container.querySelectorAll("img");
		if (images.length === 0) {
			return;
		}

		const content = this.view.state.doc.toString();
		// 快速短路：没有图片语法或遮罩注释时不做工作
		if (!content.includes("<!-- weave-mask:") || (!content.includes("![") && !content.includes("![["))
		) {
			return;
		}

		const head = content.slice(0, 120);
		const tail = content.slice(-120);
		const signature = `${images.length}:${content.length}:${head}:${tail}`;
		if (signature === this.lastSignature) {
			return;
		}
		this.lastSignature = signature;

		// Live Preview 中 sourcePath 难以稳定从 CM6 层获取；这里基于文档内容做匹配。
		this.integration.applyMasksInContainer(container, content, true, "");
	}
}

export function createImageMaskLivePreviewExtension(app: App): Extension {
	return ViewPlugin.fromClass(
		class extends ImageMaskLivePreviewViewPlugin {
			constructor(view: EditorView) {
				super(view, app);
			}
		}
	);
}

