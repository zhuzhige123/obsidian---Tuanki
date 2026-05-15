import JSZip from "jszip";
import { TFile } from "obsidian";
import { FoliateVaultPublicationParser } from "../FoliateVaultPublicationParser";

const { makeBookMock } = vi.hoisted(() => ({
  makeBookMock: vi.fn(),
}));

vi.mock("foliate-js/view.js", () => ({
  makeBook: makeBookMock,
}));

async function createLegacyHtmXhtmlEpubBuffer(): Promise<ArrayBuffer> {
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
    <dc:title>Legacy HTM XHTML</dc:title>
    <dc:creator>Author H</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="chapter-1" href="Text/00001.htm" media-type="application/xhtml+xml" />
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
  <docTitle><text>Legacy HTM XHTML</text></docTitle>
  <navMap>
    <navPoint id="np-1" playOrder="1">
      <navLabel><text>Chapter 1</text></navLabel>
      <content src="Text/00001.htm"/>
    </navPoint>
  </navMap>
</ncx>`
  );
  zip.file(
    "OEBPS/Text/00001.htm",
    `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-cn">
<head>
  <meta content="text/html; charset=utf-8" http-equiv="Content-Type"/>
  <title/>
</head>
<body>
  <h1 id="chapter">Chapter 1</h1>
  <p id="para">Selection text for HTM XHTML testing.</p>
</body>
</html>`
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

async function createSampleCbzBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("001.jpg", "cover");
  zip.file("002.jpg", "page");
  return zip.generateAsync({ type: "arraybuffer" });
}

function createMockApp(binary: ArrayBuffer, filePath = "Books/legacy-htm.epub") {
  const name = filePath.split("/").pop() || "book";
  const extension = name.includes(".") ? name.split(".").pop() || "" : "";
  const basename = extension ? name.slice(0, -(extension.length + 1)) : name;
  const parentPath = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
  const file = Object.assign(Object.create(TFile.prototype), {
    path: filePath,
    name,
    basename,
    extension,
    parent: { path: parentPath },
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

describe("FoliateVaultPublicationParser", () => {
  afterEach(() => {
    makeBookMock.mockReset();
    vi.restoreAllMocks();
  });

  it("keeps .htm XHTML spine documents valid when OPF declares application/xhtml+xml", async () => {
    let parser: FoliateVaultPublicationParser | null = null;
    try {
      const binary = await createLegacyHtmXhtmlEpubBuffer();
      parser = new FoliateVaultPublicationParser(createMockApp(binary) as any);
      await parser.load("Books/legacy-htm.epub");
      const doc = await parser.getBook().sections[0]?.createDocument?.();

      expect(doc).toBeTruthy();
      expect(doc?.querySelector("parsererror")).toBeNull();
      expect(doc?.documentElement.localName).toBe("html");
      expect(doc?.querySelector("#para")?.textContent).toContain(
        "Selection text for HTM XHTML testing."
      );
    } finally {
      parser?.dispose();
    }
  });

  it("routes cbz files through foliate generic makeBook with the comic book MIME type", async () => {
    const binary = await createSampleCbzBuffer();
    const parser = new FoliateVaultPublicationParser(
      createMockApp(binary, "Books/sample.cbz") as any
    );
    const parserAny = parser as any;
    const fakeBook = {
      metadata: {
        title: "Sample CBZ",
        author: "",
      },
      toc: [],
      sections: [],
    };

    makeBookMock.mockResolvedValue(fakeBook);
    vi.spyOn(parserAny, "attachHtmlTransformPipeline").mockImplementation(() => {});
    vi.spyOn(parserAny, "buildMetadata").mockImplementation(() => {
      parserAny.metadata = {
        title: "Sample CBZ",
        author: "",
        chapterCount: 0,
        isFixedLayout: true,
      };
    });
    vi.spyOn(parserAny, "buildTocItems").mockImplementation(() => {
      parserAny.tocItems = [];
    });
    vi.spyOn(parserAny, "buildSectionDescriptors").mockResolvedValue(undefined);
    vi.spyOn(parserAny, "hydrateTocPageNumbers").mockResolvedValue(undefined);
    vi.spyOn(parserAny, "extractCoverDataUrl").mockResolvedValue(null);

    try {
      const loaded = await parser.load("Books/sample.cbz");

      expect(makeBookMock).toHaveBeenCalledTimes(1);
      const [fileArg] = makeBookMock.mock.calls[0] ?? [];
      expect(fileArg).toBeInstanceOf(File);
      expect(fileArg.name).toBe("sample.cbz");
      expect(fileArg.type).toBe("application/vnd.comicbook+zip");
      expect(loaded.fileName).toBe("sample.cbz");
      expect(loaded.metadata.title).toBe("Sample CBZ");
      expect(loaded.book).toBe(fakeBook);
    } finally {
      parser.dispose();
    }
  });
});
