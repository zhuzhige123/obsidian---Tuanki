import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceLocateOverlayService } from "./SourceLocateOverlayService";

type CreateOptions = {
	cls?: string;
	text?: string;
};

vi.mock("obsidian", () => ({
	setIcon: vi.fn((element: HTMLElement, iconName: string) => {
		element.setAttribute("data-icon", iconName);
	}),
}));

describe("SourceLocateOverlayService", () => {
	beforeEach(() => {
		document.body.innerHTML = "";

		if (!(HTMLElement.prototype as any).createDiv) {
			(HTMLElement.prototype as any).createDiv = function (options?: CreateOptions) {
				const el = document.createElement("div");
				if (options?.cls) el.className = options.cls;
				if (typeof options?.text === "string") el.textContent = options.text;
				this.appendChild(el);
				return el;
			};
		}

		if (!(HTMLElement.prototype as any).createSpan) {
			(HTMLElement.prototype as any).createSpan = function (options?: CreateOptions) {
				const el = document.createElement("span");
				if (options?.cls) el.className = options.cls;
				if (typeof options?.text === "string") el.textContent = options.text;
				this.appendChild(el);
				return el;
			};
		}

		if (!(HTMLElement.prototype as any).setCssProps) {
			(HTMLElement.prototype as any).setCssProps = function (props: Record<string, string>) {
				for (const [key, value] of Object.entries(props || {})) {
					this.style.setProperty(key, value);
				}
			};
		}

		if (!(Range.prototype as any).getBoundingClientRect) {
			Object.defineProperty(Range.prototype, "getBoundingClientRect", {
				configurable: true,
				value: () => new DOMRect(0, 0, 0, 0),
			});
		}

		vi.restoreAllMocks();
	});

	it("uses the matched text range rect instead of the whole markdown block rect", () => {
		const service = new SourceLocateOverlayService();
		const container = document.createElement("div");
		container.innerHTML = `
			<div class="markdown-preview-view">
				<p id="target">前文说明。每个台阶能发出不同的音符。后文说明。</p>
			</div>
		`;
		document.body.appendChild(container);

		const paragraph = container.querySelector("#target") as HTMLElement;
		vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 80, 900, 140));
		vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function (this: Range) {
			return this.toString().includes("每个台阶能发出不同的音符")
				? new DOMRect(320, 188, 220, 28)
				: new DOMRect(0, 0, 0, 0);
		});

		const result = service.findMarkdownLocateTarget(container, ["每个台阶能发出不同的音符"]);

		expect(result?.scrollTarget).toBe(paragraph);
		expect(result?.overlayRect).toMatchObject({
			left: 320,
			top: 188,
			width: 220,
			height: 28,
		});
	});

	it("shows the locate overlay at the matched text rect when markdown text is available", () => {
		const service = new SourceLocateOverlayService();
		const container = document.createElement("div");
		container.innerHTML = `
			<div class="markdown-preview-view">
				<blockquote id="target">
					<p>但这一幕在一个小城里彻底改变了，每个台阶能发出不同的音符。</p>
				</blockquote>
			</div>
		`;
		document.body.appendChild(container);

		const block = container.querySelector("#target") as HTMLElement;
		vi.spyOn(block, "getBoundingClientRect").mockReturnValue(new DOMRect(24, 60, 960, 220));
		vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function (this: Range) {
			return this.toString().includes("每个台阶能发出不同的音符")
				? new DOMRect(402, 236, 196, 26)
				: new DOMRect(0, 0, 0, 0);
		});

		const showSpy = vi.spyOn(service, "showAtRect").mockImplementation(() => true);

		const shown = service.showForMarkdownTarget(container, ["每个台阶能发出不同的音符"], {
			label: "定位到溯源位置",
		});

		expect(shown).toBe(true);
		expect(showSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				left: 402,
				top: 236,
				width: 196,
				height: 26,
			}),
			expect.objectContaining({
				label: "定位到溯源位置",
			})
		);
	});

	it("locates EPUB callouts in source editor mode and anchors to the matched quote line", () => {
		const service = new SourceLocateOverlayService();
		const container = document.createElement("div");
		container.innerHTML = `
			<div class="cm-editor">
				<div class="cm-line" id="header">&gt; [!EPUB|yellow] [[Books/demo.epub#weave-cfi=readium%3Aalpha&sid=epubsrc-1|Demo]] 2026-03-28 12:00</div>
				<div class="cm-line" id="quote">&gt; The located quote text appears here.</div>
				<div class="cm-line" id="tail">Plain tail</div>
			</div>
		`;
		document.body.appendChild(container);

		const quoteLine = container.querySelector("#quote") as HTMLElement;
		vi.spyOn(quoteLine, "getBoundingClientRect").mockReturnValue(new DOMRect(48, 180, 920, 30));
		vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function (this: Range) {
			return this.toString().includes("The located quote text appears here.")
				? new DOMRect(314, 184, 248, 24)
				: new DOMRect(0, 0, 0, 0);
		});

		const result = service.findMarkdownLocateTarget(container, [
			"__weave_epub_link__=Books/demo.epub#weave-cfi=readium%3Aalpha",
			"__weave_epub_cfi__=readium:alpha",
			`__weave_epub_time__=${new Date("2026-03-28T12:00").getTime()}`,
			"The located quote text appears here.",
		]);

		expect(result?.scrollTarget).toBe(quoteLine);
		expect(result?.overlayRect).toMatchObject({
			left: 314,
			top: 184,
			width: 248,
			height: 24,
		});
	});

	it("locates EPUB callouts in source editor mode by excerpt id when the header only contains weave-loc markup", () => {
		const service = new SourceLocateOverlayService();
		const container = document.createElement("div");
		container.innerHTML = `
			<div class="cm-editor">
				<div class="cm-line" id="header">&gt; [!EPUB|purple] [[../../../附件/demo.epub#weave-loc=compact-locator&eid=excerpt-fixed|demo]] [章节标题] 2026-04-27 14:44</div>
				<div class="cm-line" id="quote">&gt; 紧挨车门旁有个空座，我将书包轻轻地放在座上。</div>
				<div class="cm-line" id="tail">Plain tail</div>
			</div>
		`;
		document.body.appendChild(container);

		const quoteLine = container.querySelector("#quote") as HTMLElement;
		vi.spyOn(quoteLine, "getBoundingClientRect").mockReturnValue(new DOMRect(72, 220, 880, 28));
		vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function (this: Range) {
			return this.toString().includes("紧挨车门旁有个空座")
				? new DOMRect(296, 224, 264, 24)
				: new DOMRect(0, 0, 0, 0);
		});

		const result = service.findMarkdownLocateTarget(container, [
			"__weave_epub_excerpt__=excerpt-fixed",
			`__weave_epub_time__=${new Date("2026-04-27T14:44:00").getTime()}`,
			"紧挨车门旁有个空座，我将书包轻轻地放在座上。",
		]);

		expect(result?.scrollTarget).toBe(quoteLine);
		expect(result?.overlayRect).toMatchObject({
			left: 296,
			top: 224,
			width: 264,
			height: 24,
		});
	});

	it("locates EPUB callouts in live preview mode when locator data only exists on internal link attributes", () => {
		const service = new SourceLocateOverlayService();
		const container = document.createElement("div");
		container.innerHTML = `
			<div class="markdown-source-view mod-cm6 is-live-preview">
				<div class="cm-editor">
					<div class="cm-line" id="header">
						<span>&gt; [!EPUB|purple] </span>
						<a
							class="internal-link"
							href="../../../附件/demo.epub#weave-loc=compact-locator&eid=excerpt-live-preview"
							data-href="../../../附件/demo.epub#weave-loc=compact-locator&eid=excerpt-live-preview"
						>demo</a>
						<span> [章节标题] 2026-04-27 14:45</span>
					</div>
					<div class="cm-line" id="quote">&gt; Live Preview 下这条摘录也应该被精确定位。</div>
				</div>
			</div>
		`;
		document.body.appendChild(container);

		const quoteLine = container.querySelector("#quote") as HTMLElement;
		vi.spyOn(quoteLine, "getBoundingClientRect").mockReturnValue(new DOMRect(84, 248, 860, 28));
		vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function (this: Range) {
			return this.toString().includes("Live Preview 下这条摘录也应该被精确定位")
				? new DOMRect(318, 252, 252, 24)
				: new DOMRect(0, 0, 0, 0);
		});

		const result = service.findMarkdownLocateTarget(container, [
			"__weave_epub_excerpt__=excerpt-live-preview",
			`__weave_epub_time__=${new Date("2026-04-27T14:45:00").getTime()}`,
			"Live Preview 下这条摘录也应该被精确定位。",
		]);

		expect(result?.scrollTarget).toBe(quoteLine);
		expect(result?.overlayRect).toMatchObject({
			left: 318,
			top: 252,
			width: 252,
			height: 24,
		});
	});

	it("uses viewport positioning even when the input rect only provides x and y", () => {
		const service = new SourceLocateOverlayService();

		service.showAtRect({ x: 320, y: 188, width: 196, height: 26 } as any, {
			label: "定位到溯源位置",
		});

		const overlay = document.body.querySelector(".weave-source-locate-overlay") as HTMLElement | null;
		expect(overlay).not.toBeNull();
		expect(overlay?.classList.contains("weave-source-locate-overlay")).toBe(true);
		expect(overlay?.style.left).toMatch(/px$/);
		expect(overlay?.style.top).toMatch(/px$/);
		expect(overlay?.style.left).not.toContain("NaN");
		expect(overlay?.style.top).not.toContain("NaN");
		expect(Number.parseFloat(overlay?.style.left || "0")).toBeGreaterThan(320);
		expect(Number.parseFloat(overlay?.style.top || "0")).toBeGreaterThan(188);
	});

	it("does not render the locate overlay when rect coordinates are invalid", () => {
		const service = new SourceLocateOverlayService();

		service.showAtRect({ width: 160, height: 24 } as any, {
			label: "定位到溯源位置",
		});

		expect(document.body.querySelector(".weave-source-locate-overlay")).toBeNull();
	});
});
