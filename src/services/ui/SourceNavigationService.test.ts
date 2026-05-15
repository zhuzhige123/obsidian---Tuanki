import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceNavigationService } from "./SourceNavigationService";

const overlayStub = {
	findMarkdownLocateTarget: vi.fn(() => null),
	showAtRect: vi.fn(() => true),
};

vi.mock("obsidian", () => ({
	MarkdownView: class MarkdownView {},
	Notice: class Notice {
		message: string;
		constructor(message: string) {
			this.message = message;
		}
	},
}));

vi.mock("./SourceLocateOverlayService", () => ({
	getSourceLocateOverlayService: () => overlayStub,
}));

describe("SourceNavigationService", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		overlayStub.findMarkdownLocateTarget.mockReturnValue(null);
		overlayStub.showAtRect.mockReturnValue(true);
	});

	it("locates EPUB callouts from full editor content even when DOM lookup is unavailable", () => {
		const fillerLines = Array.from({ length: 120 }, (_, index) => `Filler line ${index + 1}`);
		const lines = [
			...fillerLines,
			"> [!EPUB|purple] [[Books/demo.epub#weave-loc=compact-locator&eid=excerpt-editor-target|Demo]] 2026-04-27 15:30",
			"> 编辑器全文定位应该命中这一条摘录，而不是只扫描可见行。",
			"> 第二行补充内容。",
			"Tail line",
		];
		const content = lines.join("\n");
		const editor = {
			getValue: vi.fn(() => content),
			getLine: vi.fn((line: number) => lines[line] || ""),
			setCursor: vi.fn(),
			setSelection: vi.fn(),
			scrollIntoView: vi.fn(),
		};
		const service = new SourceNavigationService({} as any);

		const located = (service as any).locateInMarkdownEditor(editor, [
			"__weave_epub_excerpt__=excerpt-editor-target",
			`__weave_epub_time__=${new Date("2026-04-27T15:30:00").getTime()}`,
			"编辑器全文定位应该命中这一条摘录，而不是只扫描可见行。",
		]);

		expect(located).toBe(true);
		expect(editor.setCursor).toHaveBeenCalledWith({ line: 121, ch: 2 });
		expect(editor.setSelection).toHaveBeenCalledWith(
			{ line: 121, ch: 2 },
			{ line: 121, ch: "编辑器全文定位应该命中这一条摘录，而不是只扫描可见行。".length + 2 }
		);
		expect(editor.scrollIntoView).toHaveBeenCalled();
	});

	it("prefers the canvas node whose content carries the matching excerpt id when text is similar", () => {
		const service = new SourceNavigationService({} as any);
		const nodes = [
			{
				id: "node-a",
				text: "> [!EPUB|green] [[Books/demo.epub#weave-loc=compact-a&eid=excerpt-a|Demo]]\n> Shared quote text",
			},
			{
				id: "node-b",
				text: "> [!EPUB|purple] [[Books/demo.epub#weave-loc=compact-b&eid=excerpt-b|Demo]]\n> Shared quote text",
			},
		];

		const matched = (service as any).findCanvasNodeByLocateCandidates(nodes, [
			"__weave_epub_excerpt__=excerpt-b",
			"Shared quote text",
		]);

		expect(matched).toBe(nodes[1]);
	});
});
