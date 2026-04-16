import JSZip from "jszip";
import { TFile } from "obsidian";
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
			expect(toc[0]?.subitems?.[0]?.label).toBe("Section 1");

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

	it("forces a renderer refresh after navigating to a toc href", async () => {
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

			await service.navigateTo({ href: "OPS/text/chapter1.xhtml#sec-1" });

			expect(renderSpy.mock.calls.length).toBeGreaterThanOrEqual(beforeRenderCount + 2);
			expect((view?.goToCalls.length ?? 0)).toBeGreaterThanOrEqual(beforeGoToCount + 2);
		} finally {
			service.destroy();
		}
	});
});
