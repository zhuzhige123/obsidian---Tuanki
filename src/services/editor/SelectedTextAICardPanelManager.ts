import type { MarkdownView } from "obsidian";
import type { SelectedTextAISplitPreviewLayer } from "./SelectedTextAISplitPreviewLayer";

/**
 * 选中文本 AI 拆分预览：统一委托给 {@link SelectedTextAISplitPreviewLayer}（workspace 底部单例）。
 */
export class SelectedTextAICardPanelManager {
	constructor(private readonly previewLayer: SelectedTextAISplitPreviewLayer) {}

	openPanel(params: {
		view: MarkdownView;
		selectedText: string;
		actionId: string;
	}): void {
		const { view, selectedText, actionId } = params;
		void this.previewLayer.open({
			selectedText,
			actionId,
			sourceFilePath: view.file?.path || "",
		});
	}

	closePanel(_view: MarkdownView): void {
		this.previewLayer.close();
	}

	dispose(): void {
		this.previewLayer.dispose();
	}
}
