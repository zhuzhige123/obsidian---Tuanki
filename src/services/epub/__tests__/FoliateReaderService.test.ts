import JSZip from "jszip";
import { Platform, TFile } from "obsidian";
import { FoliateReaderService } from "../FoliateReaderService";

async function createSampleEpubBuffer(): Promise<ArrayBuffer> {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip");
	zip.file(
		"META-INF/container.xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles>
		<rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml" />
	</rootfiles>
</container>`
	);
	zip.file(
		"OPS/content.opf",
		`<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:title>Foliate Sample</dc:title>
		<dc:creator>Author F</dc:creator>
		<dc:publisher>Weave Press</dc:publisher>
		<dc:language>zh-CN</dc:language>
	</metadata>
	<manifest>
		<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
		<item id="chapter-1" href="text/chapter1.xhtml" media-type="application/xhtml+xml" />
	</manifest>
	<spine>
		<itemref idref="chapter-1" />
	</spine>
</package>`
	);
	zip.file(
		"OPS/nav.xhtml",
		`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
	<body>
		<nav epub:type="toc">
			<ol>
				<li>
					<a href="text/chapter1.xhtml">Chapter 1</a>
					<ol>
						<li><a href="text/chapter1.xhtml#sec-1">Section 1</a></li>
					</ol>
				</li>
			</ol>
		</nav>
	</body>
</html>`
	);
	zip.file(
		"OPS/text/chapter1.xhtml",
		`<html xmlns="http://www.w3.org/1999/xhtml">
	<head><title>Chapter 1</title></head>
	<body>
		<h1 id="sec-1">Chapter 1</h1>
		<p id="para-1">Selection text for testing.</p>
	</body>
</html>`
	);
	return zip.generateAsync({ type: "arraybuffer" });
}

function getBinarySize(binary: unknown): number {
	if (binary instanceof ArrayBuffer) {
		return binary.byteLength;
	}
	if (ArrayBuffer.isView(binary)) {
		return binary.byteLength;
	}
	if (Array.isArray(binary)) {
		return binary.length;
	}
	return 0;
}

function createMockApp(binary: unknown) {
	const createVaultFile = (path: string) => {
		const normalizedPath = path.replace(/\\/g, "/");
		const fileName = normalizedPath.split("/").pop() || "sample.epub";
		const folderPath = normalizedPath.includes("/")
			? normalizedPath.slice(0, normalizedPath.lastIndexOf("/"))
			: "";
		return Object.assign(Object.create(TFile.prototype), {
			path: normalizedPath,
			name: fileName,
			basename: fileName.replace(/\.[^.]+$/, ""),
			extension: "epub",
			parent: folderPath ? { path: folderPath } : null,
			stat: {
				size: getBinarySize(binary),
				mtime: Date.now(),
				ctime: Date.now(),
			},
		});
	};

	return {
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => createVaultFile(path)),
			readBinary: vi.fn(async () => binary),
		},
	};
}

class FakeFoliateViewElement extends HTMLElement {
	private contents: Array<{ index: number; doc: Document | null }> = [];
	goToCalls: unknown[] = [];

	renderer = Object.assign(document.createElement("div"), {
		setStyles: vi.fn(),
		render: vi.fn(),
		getContents: () => this.contents,
	});
	book: unknown = null;
	lastLocation: unknown = null;

	async open(book: unknown): Promise<void> {
		this.book = book;
		this.contents = [{ index: 0, doc: document }];
	}

	close(): void {}

	async goTo(target: unknown): Promise<void> {
		this.lastLocation = target;
		this.goToCalls.push(target);
	}

	async goToTextStart(): Promise<void> {
		this.lastLocation = "text-start";
	}
}

if (!customElements.get("foliate-view")) {
	customElements.define("foliate-view", FakeFoliateViewElement);
}

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = "";
	document.body.className = "";
	document.documentElement.className = "";
});

async function withPlatformIsMobile<T>(value: boolean, run: () => Promise<T>): Promise<T> {
	const originalDescriptor = Object.getOwnPropertyDescriptor(Platform, "isMobile");
	Object.defineProperty(Platform, "isMobile", {
		configurable: true,
		value,
	});
	try {
		return await run();
	} finally {
		if (originalDescriptor) {
			Object.defineProperty(Platform, "isMobile", originalDescriptor);
		} else {
			delete (Platform as { isMobile?: boolean }).isMobile;
		}
	}
}

describe("FoliateReaderService", () => {
	it("loads EPUBs and exposes toc/search data through the foliate parser", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			const book = await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			expect(book.metadata.title).toBe("Foliate Sample");
			expect(book.metadata.author).toBe("Author F");
			expect(book.metadata.chapterCount).toBe(1);

			const toc = await service.getTableOfContents();
			expect(toc).toHaveLength(1);
			expect(toc[0]?.label).toBe("Chapter 1");
			expect(toc[0]?.level).toBe(1);
			expect(toc[0]?.pageNumber).toBe(1);
			expect(toc[0]?.subitems?.[0]?.label).toBe("Section 1");
			expect(toc[0]?.subitems?.[0]?.level).toBe(2);
			expect(toc[0]?.subitems?.[0]?.pageNumber).toBe(1);

			const results = await service.searchText("Selection text for testing");
			expect(results).toHaveLength(1);
			expect(["Chapter 1", "Section 1"]).toContain(results[0]?.chapterTitle);
			expect(results[0]?.excerpt).toContain("Selection text for testing");
			expect(results[0]?.cfi.startsWith("epubcfi(")).toBe(true);
		} finally {
			service.destroy();
		}
	});

	it("canonicalizes legacy readium locations into foliate cfi targets", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			const legacyLocation = `readium:${encodeURIComponent(
				JSON.stringify({
					href: "OPS/text/chapter1.xhtml",
					locations: { fragments: ["sec-1"] },
					text: { highlight: "Chapter 1" },
				})
			)}`;

			const canonical = await service.canonicalizeLocation(legacyLocation, "Chapter 1");
			expect(canonical?.startsWith("epubcfi(")).toBe(true);
			expect(await service.getPageNumberFromCfi(canonical as string)).toBe(1);
		} finally {
			service.destroy();
		}
	});

	it("strips volatile runtime cfi assertions before reusing saved epub progress", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			const results = await service.searchText("Selection text for testing");
			const stableCfi = results[0]?.cfi;
			expect(stableCfi?.startsWith("epubcfi(")).toBe(true);

			const volatileCfi = String(stableCfi).replace("/4,", "/4[UGI0-volatile-marker],");
			const normalizedStable = await service.canonicalizeLocation(String(stableCfi));
			const canonical = await service.canonicalizeLocation(volatileCfi);

			expect(canonical).toBe(normalizedStable);
			expect(canonical).not.toContain("UGI0-volatile-marker");
		} finally {
			service.destroy();
		}
	});

	it("degrades malformed CFIs to a stable section target instead of crashing EPUB open flow", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			const malformedCfi = "epubcfi(/6/2!/4/999,/1:0,/1:9)";
			const stableStartCfi = service.getCurrentPosition().cfi;

			await expect(service.canonicalizeLocation(malformedCfi)).resolves.toBe(stableStartCfi);
			await expect(service.getPageNumberFromCfi(malformedCfi)).resolves.toBe(1);
		} finally {
			service.destroy();
		}
	});

	it("falls back to chapter href when foliate rejects a precise cfi target during navigation", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			const container = document.createElement("div");
			document.body.appendChild(container);

			await service.renderTo(container);

			const view = container.querySelector("foliate-view") as FakeFoliateViewElement | null;
			expect(view).toBeTruthy();

			const viewInstance = view as FakeFoliateViewElement;
			const stableCfi = (await service.searchText("Selection text for testing"))[0]?.cfi as string;
			const fallbackHref = service.getSectionHrefForCfi(stableCfi);
			expect(fallbackHref).toBe("OPS/text/chapter1.xhtml");

			const beforeGoToCount = viewInstance.goToCalls.length;
			vi.spyOn(viewInstance, "goTo").mockImplementation(async (target: unknown) => {
				viewInstance.lastLocation = target;
				viewInstance.goToCalls.push(target);
				if (typeof target === "string" && target.startsWith("epubcfi(")) {
					throw new Error("TypeError: Cannot read properties of undefined (reading 'length')");
				}
			});

			await expect(service.navigateTo({ cfi: stableCfi })).resolves.toBeUndefined();

			const navigationCalls = (viewInstance.goToCalls ?? []).slice(beforeGoToCount);
			expect(navigationCalls[0]).toBe(stableCfi);
			expect(navigationCalls).toContain(fallbackHref);
			expect(service.getCurrentPosition().cfi).toBe(stableCfi);
		} finally {
			service.destroy();
		}
	});

	it("renders into a container without crashing when a foliate-view element is available", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			const container = document.createElement("div");
			document.body.appendChild(container);

			await expect(service.renderTo(container)).resolves.toBeUndefined();
			expect(container.querySelector("foliate-view")).toBeTruthy();
		} finally {
			service.destroy();
		}
	});

	it("switches strikethrough excerpt rendering between concealment and visible strike mode", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any) as any;
		try {
			expect(service.shouldRenderAnnotationAsConceal({
				cfiRange: 'readium:hidden',
				presentation: 'highlight',
				style: 'strikethrough',
			})).toBe(true);

			await service.applyReaderAppearance({ strikethroughPresentation: 'strikethrough' });

			expect(service.shouldRenderAnnotationAsConceal({
				cfiRange: 'readium:hidden',
				presentation: 'highlight',
				style: 'strikethrough',
			})).toBe(false);

			expect(service.shouldRenderAnnotationAsConceal({
				cfiRange: 'readium:legacy-conceal',
				presentation: 'conceal',
				style: undefined,
			})).toBe(true);
		} finally {
			service.destroy();
		}
	});

	it("reads visible frames from renderer.getContents in modern foliate runtime", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			const container = document.createElement("div");
			document.body.appendChild(container);

			await service.renderTo(container);

			const frames = service.getVisibleFrames();
			expect(frames).toHaveLength(1);
			expect(frames[0]?.document).toBe(document);
		} finally {
			service.destroy();
		}
	});

	it("navigates toc hrefs with raw href targets while still canonicalizing reader state", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
			const container = document.createElement("div");
			document.body.appendChild(container);

			await service.renderTo(container);

			const view = container.querySelector("foliate-view") as FakeFoliateViewElement | null;
			expect(view).toBeTruthy();

			const renderSpy = view?.renderer.render as ReturnType<typeof vi.fn>;
			const beforeRenderCount = renderSpy.mock.calls.length;
			const beforeGoToCount = view?.goToCalls.length ?? 0;
			const hrefTarget = "OPS/text/chapter1.xhtml#sec-1";

			await service.navigateTo({ href: hrefTarget });

			const navigationCalls = (view?.goToCalls ?? []).slice(beforeGoToCount);

			expect(renderSpy.mock.calls.length).toBeGreaterThanOrEqual(beforeRenderCount + 2);
			expect(navigationCalls).toHaveLength(2);
			expect(navigationCalls).toEqual([hrefTarget, hrefTarget]);
			expect(service.getCurrentPosition().cfi.startsWith("epubcfi(")).toBe(true);
			expect(service.getCurrentChapterHref()).toBe("OPS/text/chapter1.xhtml");
		} finally {
			service.destroy();
		}
	});

	it("maps iframe text rects into viewport coordinates for source locate overlays", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			const iframe = document.createElement("iframe");
			vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(new DOMRect(240, 80, 900, 640));

			const fakeRange = {
				getBoundingClientRect: () => new DOMRect(36, 148, 420, 32),
			} as Range;

			const rect = (service as any).createViewportRect(
				{
					frameElement: iframe,
				},
				fakeRange
			);

			expect(rect).toMatchObject({
				left: 276,
				top: 228,
				right: 696,
				bottom: 260,
				width: 420,
				height: 32,
			});
		} finally {
			service.destroy();
		}
	});

	it("prefers the current canonical cfi when resolving a precise EPUB locate overlay rect", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			const frameDoc = document.implementation.createHTMLDocument("frame");
			const iframe = document.createElement("iframe");
			vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(new DOMRect(240, 80, 900, 640));

			const fakeRange = {
				getBoundingClientRect: () => new DOMRect(36, 148, 420, 32),
			} as Range;

			(service as any).currentPosition = {
				chapterIndex: 0,
				cfi: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				percent: 0,
			};
			(service as any).currentChapterHref = "OPS/text/chapter1.xhtml";

			vi.spyOn((service as any).parser, "resolveRangeInLoadedSection").mockImplementation(
				(...args: unknown[]) => {
					const [target] = args as [string, ...unknown[]];
					return target === "epubcfi(/6/2!/4/2,/1:0,/1:9)" ? fakeRange : null;
				}
			);
			vi.spyOn(service as any, "getVisibleFramesWithIndex").mockReturnValue([
				{
					index: 0,
					href: "OPS/text/chapter1.xhtml",
					document: frameDoc,
					frameElement: iframe,
					frame: {
						document: frameDoc,
						window,
						cfiFromRange: () => null,
					},
				},
			]);

			const rect = service.getNavigationTargetRect({
				cfi: "legacy-missing-cfi",
				text: "Selection text for testing",
				allowFallback: false,
			});

			expect(rect).toMatchObject({
				left: 276,
				top: 228,
				width: 420,
				height: 32,
			});
			expect((service as any).parser.resolveRangeInLoadedSection).toHaveBeenNthCalledWith(
				1,
				"legacy-missing-cfi",
				frameDoc,
				0,
				"Selection text for testing"
			);
			expect((service as any).parser.resolveRangeInLoadedSection).toHaveBeenNthCalledWith(
				2,
				"epubcfi(/6/2!/4/2,/1:0,/1:9)",
				frameDoc,
				0,
				"Selection text for testing"
			);
		} finally {
			service.destroy();
		}
	});

	it("returns null instead of the reader container rect when precise EPUB locate rects are required", async () => {
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			const frameDoc = document.implementation.createHTMLDocument("frame");
			const container = document.createElement("div");
			vi.spyOn(container, "getBoundingClientRect").mockReturnValue(new DOMRect(18, 28, 960, 720));

			(service as any).renderContainer = container;
			vi.spyOn((service as any).parser, "resolveRangeInLoadedSection").mockReturnValue(null);
			vi.spyOn(service as any, "getVisibleFramesWithIndex").mockReturnValue([
				{
					index: 0,
					href: "OPS/text/chapter1.xhtml",
					document: frameDoc,
					frameElement: null,
					frame: {
						document: frameDoc,
						window,
						cfiFromRange: () => null,
					},
				},
			]);

			const preciseRect = service.getNavigationTargetRect({
				cfi: "missing-target",
				allowFallback: false,
			});
			const fallbackRect = service.getNavigationTargetRect({
				cfi: "missing-target",
			});

			expect(preciseRect).toBeNull();
			expect(fallbackRect).toMatchObject({
				left: 18,
				top: 28,
				width: 960,
				height: 720,
			});
		} finally {
			service.destroy();
		}
	});

	it("uses stronger highlight palette and normal blend mode for EPUB body highlights", () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const lightStyles = (service as any).buildReaderStyles();
			expect((service as any).resolveHighlightTint("yellow")).toBe("rgb(250, 204, 21)");
			expect(lightStyles).toContain("--overlayer-highlight-opacity: 0.72");
			expect(lightStyles).toContain("--overlayer-highlight-blend-mode: normal");

			document.body.classList.add("theme-dark");
			const darkStyles = (service as any).buildReaderStyles();
			expect((service as any).resolveHighlightTint("yellow")).toBe("rgb(255, 222, 89)");
			expect(darkStyles).toContain("--overlayer-highlight-opacity: 0.68");
			expect(darkStyles).toContain("--overlayer-highlight-blend-mode: normal");
		} finally {
			service.destroy();
		}
	});

	it("uses Obsidian text font variables for EPUB body typography", () => {
		document.body.style.setProperty("--font-text", '"Source Han Sans SC"');
		document.body.style.setProperty("--font-monospace", '"JetBrains Mono"');
		document.body.style.setProperty("--font-text-size", "19px");

		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const styles = (service as any).buildReaderStyles();

			expect(styles).toContain('--weave-reader-font-family: "Source Han Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif');
			expect(styles).toContain('--weave-reader-monospace-font-family: "JetBrains Mono", ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace');
			expect(styles).toContain("--weave-reader-font-size: 19px");
			expect(styles).toContain("html {");
			expect(styles).toContain("font-size: var(--weave-reader-font-size) !important;");
			expect(styles).toContain("font-family: var(--weave-reader-font-family) !important;");
			expect(styles).toContain("body :is(article, section, main, aside, header, footer, nav, p, div, span, li, dd, dt, blockquote, figcaption, td, th, caption, label, legend) {");
			expect(styles).toContain("font-size: inherit !important;");
		} finally {
			service.destroy();
		}
	});

	it("re-renders conceal annotations when temporary reveal state changes", async () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const highlight = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				presentation: "conceal" as const,
			};
			const key = (service as any).normalizeLocationKey(highlight.cfiRange);
			const view = {
				addAnnotation: vi.fn(async () => undefined),
				deleteAnnotation: vi.fn(async () => undefined),
				removeEventListener: vi.fn(),
				close: vi.fn(),
				remove: vi.fn(),
			};

			(service as any).foliateView = view;
			(service as any).highlightDataMap.set(key, highlight);
			vi.spyOn((service as any).parser, "getSectionIndexForCfi").mockReturnValue(0);
			vi.spyOn(service as any, "getVisibleFramesWithIndex").mockReturnValue([
				{ index: 0 },
			]);

			const concealedRendered = (service as any).createRenderedAnnotation(highlight);
			(service as any).renderedAnnotations.set(key, concealedRendered);
			(service as any).temporarilyRevealedConcealmentTimers.set(key, setTimeout(() => undefined, 1000));

			await (service as any).syncAnnotationsWithView();

			expect(view.deleteAnnotation).toHaveBeenCalledTimes(1);
			expect(view.deleteAnnotation).toHaveBeenCalledWith(concealedRendered.annotation);
			expect(view.addAnnotation).toHaveBeenCalledTimes(1);
			const nextRendered = (service as any).renderedAnnotations.get(key);
			expect(nextRendered?.renderSignature).toContain("concealment:revealed");
		} finally {
			service.destroy();
		}
	});

	it("re-renders highlight annotations when color changes", async () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const initialHighlight = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				presentation: "highlight" as const,
			};
			const key = (service as any).normalizeLocationKey(initialHighlight.cfiRange);
			const view = {
				addAnnotation: vi.fn(async () => undefined),
				deleteAnnotation: vi.fn(async () => undefined),
				removeEventListener: vi.fn(),
				close: vi.fn(),
				remove: vi.fn(),
			};

			(service as any).foliateView = view;
			(service as any).highlightDataMap.set(key, initialHighlight);
			vi.spyOn((service as any).parser, "getSectionIndexForCfi").mockReturnValue(0);
			vi.spyOn(service as any, "getVisibleFramesWithIndex").mockReturnValue([
				{ index: 0 },
			]);

			const initialRendered = (service as any).createRenderedAnnotation(initialHighlight);
			(service as any).renderedAnnotations.set(key, initialRendered);
			(service as any).highlightDataMap.set(key, {
				...initialHighlight,
				color: "purple",
			});

			await (service as any).syncAnnotationsWithView();

			expect(view.deleteAnnotation).toHaveBeenCalledTimes(1);
			expect(view.deleteAnnotation).toHaveBeenCalledWith(initialRendered.annotation);
			expect(view.addAnnotation).toHaveBeenCalledTimes(1);
			const nextRendered = (service as any).renderedAnnotations.get(key);
			expect(nextRendered?.annotation.color).toBe("purple");
			expect(nextRendered?.renderSignature).toContain("color:purple");
		} finally {
			service.destroy();
		}
	});

	it("keeps persistent highlight color after temporary source-focus highlight expires", async () => {
		vi.useFakeTimers();
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const persistentHighlight = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				presentation: "highlight" as const,
			};
			const key = (service as any).normalizeLocationKey(persistentHighlight.cfiRange);
			vi.spyOn((service as any).parser, "canonicalizeLocation").mockResolvedValue(
				persistentHighlight.cfiRange
			);

			await service.applyHighlights([persistentHighlight]);
			service.addTemporaryHighlight(
				{
					cfiRange: persistentHighlight.cfiRange,
					color: "blue",
					text: persistentHighlight.text,
				},
				2200
			);

			await vi.waitFor(() => {
				expect((service as any).temporaryHighlightDataMap.get(key)?.color).toBe("blue");
			});
			expect((service as any).highlightDataMap.get(key)?.color).toBe("yellow");
			expect((service as any).savedHighlights).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(2200);

			expect((service as any).temporaryHighlightDataMap.has(key)).toBe(false);
			expect((service as any).highlightDataMap.get(key)?.color).toBe("yellow");
			expect((service as any).savedHighlights).toHaveLength(1);
			expect((service as any).savedHighlights[0]?.color).toBe("yellow");
		} finally {
			vi.useRealTimers();
			service.destroy();
		}
	});

	it("passes merged source locators through highlight click info", async () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const highlight = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				sourceFile: "weave/memory/deck-files/demo_01.wdeck",
				sourceRef: "card:card-a",
				sourceLocators: [
					{ sourceFile: "Notes/demo.md" },
					{ sourceFile: "weave/memory/deck-files/demo_01.wdeck", sourceRef: "card:card-a" },
				],
				presentation: "highlight" as const,
			};
			const key = (service as any).normalizeLocationKey(highlight.cfiRange);
			const callback = vi.fn();
			const container = document.createElement("div");
			Object.defineProperty(container, "getBoundingClientRect", {
				value: () => ({ width: 600, height: 400 }),
			});
			(service as any).renderContainer = container;
			(service as any).highlightDataMap.set(key, highlight);
			(service as any).highlightClickCallbacks.add(callback);
			vi.spyOn(service as any, "getVisibleFramesWithIndex").mockReturnValue([{ index: 0 }]);

			(service as any).handleShowAnnotationEvent({
				detail: {
					value: highlight.cfiRange,
					index: 0,
				},
			} as CustomEvent);

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback.mock.calls[0][0]).toMatchObject({
				sourceFile: "weave/memory/deck-files/demo_01.wdeck",
				sourceRef: "card:card-a",
				sourceLocators: [
					{ sourceFile: "Notes/demo.md" },
					{ sourceFile: "weave/memory/deck-files/demo_01.wdeck", sourceRef: "card:card-a" },
				],
			});
		} finally {
			service.destroy();
		}
	});

	it("ignores show-annotation highlight clicks while a real text selection is active", async () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const highlight = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				presentation: "highlight" as const,
			};
			const key = (service as any).normalizeLocationKey(highlight.cfiRange);
			const callback = vi.fn();
			const frameDoc = document.implementation.createHTMLDocument("frame");
			Object.defineProperty(frameDoc, "defaultView", {
				value: {
					getSelection: () => ({
						isCollapsed: false,
						rangeCount: 1,
						toString: () => "Selection text for testing",
					}),
				},
			});
			(service as any).highlightDataMap.set(key, highlight);
			(service as any).highlightClickCallbacks.add(callback);
			vi.spyOn(service as any, "getVisibleFramesWithIndex").mockReturnValue([
				{ index: 0, document: frameDoc },
			]);

			(service as any).handleShowAnnotationEvent({
				detail: {
					value: highlight.cfiRange,
					index: 0,
				},
			} as CustomEvent);

			expect(callback).not.toHaveBeenCalled();
		} finally {
			service.destroy();
		}
	});

	it("resolves footnote preview text from the surrounding container when the fragment points to an empty anchor", async () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const frameDoc = document.implementation.createHTMLDocument("frame");
			const anchor = frameDoc.createElement("a");
			anchor.setAttribute("href", "notes.xhtml#fn1");
			anchor.textContent = "1";
			const sup = frameDoc.createElement("sup");
			sup.appendChild(anchor);
			frameDoc.body.appendChild(sup);

			const footnoteDoc = document.implementation.createHTMLDocument("footnotes");
			footnoteDoc.body.innerHTML = `
				<section class="footnotes">
					<ol>
						<li id="entry-1"><p><a id="fn1"></a>Footnote text from external note file.</p></li>
					</ol>
				</section>
			`;

			vi.spyOn((service as any).parser, "getRawDocumentByHref").mockResolvedValue(footnoteDoc);
			vi.spyOn((service as any).parser, "resolveHrefAgainst").mockImplementation(
				(...args: unknown[]) => {
					const [baseHref, rawHref] = args as [string, string];
					return rawHref || baseHref;
				}
			);
			vi.spyOn(service as any, "getVisibleFramesWithIndex").mockReturnValue([
				{
					index: 0,
					href: "OPS/text/chapter1.xhtml",
					document: frameDoc,
					frameElement: null,
					frame: {
						document: frameDoc,
						window,
						cfiFromRange: () => null,
					},
				},
			]);
			vi.spyOn(service as any, "createViewportRectFromElement").mockReturnValue({
				top: 12,
				left: 24,
				bottom: 36,
				right: 48,
				width: 24,
				height: 24,
			});

			const info = await (service as any).buildFootnotePreviewInfo(frameDoc, anchor);

			expect(info).toMatchObject({
				href: "notes.xhtml#fn1",
				label: "1",
				text: "Footnote text from external note file.",
			});
		} finally {
			service.destroy();
		}
	});

	it("strips Foliate desktop iframe allow-scripts from sandbox values while keeping mobile unchanged", async () => {
		await withPlatformIsMobile(false, async () => {
			expect((FoliateReaderService as any).normalizeDesktopFoliateSandboxValue(
				"sandbox",
				"allow-same-origin allow-scripts",
				"at Frame (node_modules/foliate-js/paginator.js:234:1)"
			)).toBe("allow-same-origin");
			expect((FoliateReaderService as any).normalizeDesktopFoliateSandboxValue(
				"sandbox",
				"allow-scripts allow-same-origin",
				"at Frame (node_modules/foliate-js/fixed-layout.js:87:1)"
			)).toBe("allow-same-origin");
			expect((FoliateReaderService as any).normalizeDesktopFoliateSandboxValue(
				"sandbox",
				"allow-same-origin allow-scripts",
				"at Frame (src/components/OtherFrame.ts:10:1)"
			)).toBeNull();
		});

		await withPlatformIsMobile(true, async () => {
			expect((FoliateReaderService as any).normalizeDesktopFoliateSandboxValue(
				"sandbox",
				"allow-same-origin allow-scripts",
				"at Frame (node_modules/foliate-js/paginator.js:234:1)"
			)).toBeNull();
		});
	});

	it("uses the mobile iframe blob fallback so foliate content can still render inside WebView", async () => {
		const originalIframeSrcDescriptor = Object.getOwnPropertyDescriptor(
			HTMLIFrameElement.prototype,
			"src"
		);
		const service = new FoliateReaderService(createMockApp(await createSampleEpubBuffer()) as any);
		try {
			await withPlatformIsMobile(true, async () => {
				const fetchSpy = vi
					.spyOn(globalThis, "fetch")
					.mockResolvedValue({
						ok: true,
						status: 200,
						statusText: "OK",
						text: async () =>
							"<html><body><p>mobile iframe fallback content</p></body></html>",
					} as Response);

				await service.loadEpub("Books/foliate-sample.epub", "foliate-book");
				const container = document.createElement("div");
				document.body.appendChild(container);
				await service.renderTo(container);

				const iframe = document.createElement("iframe");
				iframe.setAttribute("part", "filter");
				iframe.setAttribute("sandbox", "allow-same-origin allow-scripts");
				document.body.appendChild(iframe);
				iframe.src = "blob:weave-mobile-epub";

				await vi.waitFor(() => {
					expect(iframe.srcdoc).toContain("mobile iframe fallback content");
				});
				expect(fetchSpy).toHaveBeenCalledWith("blob:weave-mobile-epub");
			});
		} finally {
			service.destroy();
			if (originalIframeSrcDescriptor) {
				Object.defineProperty(HTMLIFrameElement.prototype, "src", originalIframeSrcDescriptor);
			}
			(FoliateReaderService as any).mobileBlobIframePatchInstalled = false;
			(FoliateReaderService as any).mobileBlobIframeLoadTokens = new WeakMap();
		}
	});
});
