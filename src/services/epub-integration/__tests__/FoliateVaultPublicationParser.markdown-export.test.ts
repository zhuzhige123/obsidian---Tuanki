import JSZip from "jszip";
import { TFile } from "obsidian";
import { FoliateVaultPublicationParser } from "../FoliateVaultPublicationParser";

const SAMPLE_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn0K2sAAAAASUVORK5CYII=";

afterEach(() => {
	vi.unstubAllGlobals();
});

async function createMarkdownExportEpubBuffer(): Promise<ArrayBuffer> {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip");
	zip.file(
		"META-INF/container.xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles>
		<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
	</rootfiles>
</container>`
	);
	zip.file(
		"OEBPS/content.opf",
		`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="2.0">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:title>Markdown Export Book</dc:title>
		<dc:creator>Author M</dc:creator>
		<dc:language>zh-CN</dc:language>
	</metadata>
	<manifest>
		<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
		<item id="chapter-1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
		<item id="img-1" href="Images/figure.png" media-type="image/png" />
	</manifest>
	<spine toc="ncx">
		<itemref idref="chapter-1" />
	</spine>
</package>`
	);
	zip.file(
		"OEBPS/toc.ncx",
		`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
	<head></head>
	<docTitle><text>Markdown Export Book</text></docTitle>
	<navMap>
		<navPoint id="np-1" playOrder="1">
			<navLabel><text>Chapter 1</text></navLabel>
			<content src="Text/chapter1.xhtml"/>
		</navPoint>
	</navMap>
</ncx>`
	);
	zip.file(
		"OEBPS/Text/chapter1.xhtml",
		`<html xmlns="http://www.w3.org/1999/xhtml">
<body>
	<h1>Chapter 1</h1>
	<p>Intro paragraph.</p>
	<h2>Section Heading</h2>
	<blockquote><p>Quoted insight.</p></blockquote>
	<ul>
		<li>First point</li>
		<li>Second point</li>
	</ul>
	<figure>
		<img src="../Images/figure.png" alt="Sample figure" />
		<figcaption>Figure caption</figcaption>
	</figure>
</body>
</html>`
	);
	zip.file("OEBPS/Images/figure.png", Buffer.from(SAMPLE_PNG_BASE64, "base64"));
	return zip.generateAsync({ type: "arraybuffer" });
}

function createMockApp(binary: ArrayBuffer) {
	const file = Object.assign(Object.create(TFile.prototype), {
		path: "Books/markdown-export.epub",
		name: "markdown-export.epub",
		basename: "markdown-export",
		extension: "epub",
		parent: { path: "Books" },
		stat: {
			size: binary.byteLength,
			mtime: Date.now(),
			ctime: Date.now(),
		},
	});

	return {
		vault: {
			getAbstractFileByPath: () => file,
			readBinary: async () => binary,
		},
	};
}

describe("FoliateVaultPublicationParser markdown export", () => {
	it("exports structured markdown and extracts chapter images as assets", async () => {
		const binary = await createMarkdownExportEpubBuffer();
		const parser = new FoliateVaultPublicationParser(createMockApp(binary) as any);

		try {
			await parser.load("Books/markdown-export.epub");
			const draft = await parser.getSectionReadingPointDraft("Text/chapter1.xhtml", "Chapter 1");

			expect(draft).toBeTruthy();
			expect(draft?.markdown).toContain("Intro paragraph.");
			expect(draft?.markdown).toContain("## Section Heading");
			expect(draft?.markdown).toContain("> Quoted insight.");
			expect(draft?.markdown).toContain("- First point");
			expect(draft?.markdown).toContain("- Second point");
			expect(draft?.markdown).toContain("{{WEAVE_EPUB_ASSET_0}}");
			expect(draft?.markdown).toContain("*Figure caption*");
			expect(draft?.markdown?.startsWith("# Chapter 1")).toBe(false);
			expect(draft?.assets).toHaveLength(1);
			expect(draft?.assets?.[0]?.suggestedName).toBe("figure.png");
			expect(draft?.assets?.[0]?.mimeType).toBe("image/png");
			expect(draft?.assets?.[0]?.data.length).toBeGreaterThan(0);
		} finally {
			parser.dispose();
		}
	});

	it("assetizes runtime blob image URLs during markdown export for generic loader content", async () => {
		const parser = new FoliateVaultPublicationParser({} as any);
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const href = String(input);
			if (href === "blob:chapter-image") {
				return new Response(new Blob([Buffer.from(SAMPLE_PNG_BASE64, "base64")], { type: "image/png" }), {
					status: 200,
					headers: {
						"content-type": "image/png",
					},
				});
			}
			throw new Error(`Unexpected fetch for ${href}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const doc = new DOMParser().parseFromString(
			`<html><body><p>Lead text</p><figure><img src="blob:chapter-image" alt="Blob figure" /><figcaption>Blob caption</figcaption></figure></body></html>`,
			"text/html"
		);

		const result = await (parser as any).buildSectionMarkdownExport(doc.body, "chapter.xhtml", "Blob Chapter");

		expect(result.markdown).toContain("Lead text");
		expect(result.markdown).toContain("{{WEAVE_EPUB_ASSET_0}}");
		expect(result.markdown).toContain("*Blob caption*");
		expect(result.markdown).not.toContain("blob:chapter-image");
		expect(result.assets).toHaveLength(1);
		expect(result.assets[0]?.mimeType).toBe("image/png");
		expect(result.assets[0]?.suggestedName).toMatch(/\.png$/);
		expect(result.assets[0]?.data.length).toBeGreaterThan(0);
	});
});
