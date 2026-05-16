import { extractPdfOutlineFromDocument, getPdfOutlineForFile } from "../pdf-outline";

function createPdfFile(path = "Books/demo.pdf", size = 1024): any {
	return {
		path,
		name: path.split("/").pop() || path,
		basename: path.replace(/^.*\//, "").replace(/\.[^/.]+$/, ""),
		extension: path.includes(".") ? path.split(".").pop() || "" : "",
		stat: {
			ctime: Date.now(),
			mtime: Date.now(),
			size,
		},
	};
}

describe("pdf-outline", () => {
	afterEach(() => {
		delete (window as any).pdfjsLib;
		vi.restoreAllMocks();
	});

	it("优先复用已打开的 PDF 视图，即使文件超过旧阈值也能返回完整目录", async () => {
		const pdfDocument = {
			getOutline: vi.fn().mockResolvedValue([
				{
					title: "Chapter 1",
					dest: "chapter-1",
					items: [{ title: "Section 1.1", dest: "section-1-1", items: [] }],
				},
				{ title: "Chapter 2", dest: [{ ref: "chapter-2" }], items: [] },
			]),
			getDestination: vi.fn(async (dest: string) => {
				if (dest === "chapter-1") {
					return [{ ref: "chapter-1" }];
				}
				if (dest === "section-1-1") {
					return [{ ref: "section-1-1" }];
				}
				return null;
			}),
			getPageIndex: vi.fn(async (ref: { ref: string }) => {
				if (ref.ref === "chapter-1") return 0;
				if (ref.ref === "section-1-1") return 4;
				if (ref.ref === "chapter-2") return 9;
				return 0;
			}),
		};

		const app: any = {
			workspace: {
				getLeavesOfType: vi.fn().mockReturnValue([
					{
						view: {
							file: { path: "Books/demo.pdf" },
							viewer: { pdfViewer: { pdfDocument } },
						},
					},
				]),
				getMostRecentLeaf: vi.fn().mockReturnValue(null),
			},
			vault: {
				readBinary: vi.fn(),
			},
		};

		const items = await getPdfOutlineForFile(app, createPdfFile("Books/demo.pdf", 64 * 1024 * 1024), {
			maxDirectLoadFileSizeBytes: 32 * 1024 * 1024,
		});

		expect(items).toEqual([
			{ title: "Chapter 1", pageNumber: 1, path: ["Chapter 1"] },
			{ title: "Section 1.1", pageNumber: 5, path: ["Chapter 1", "Section 1.1"] },
			{ title: "Chapter 2", pageNumber: 10, path: ["Chapter 2"] },
		]);
		expect(app.vault.readBinary).not.toHaveBeenCalled();
	});

	it("没有打开视图时会回退到 pdfjs 二进制解析", async () => {
		const pdfDocumentDestroy = vi.fn();
		const loadingTaskDestroy = vi.fn();
		const pdfDocument = {
			getOutline: vi.fn().mockResolvedValue([{ title: "Preface", dest: "preface", items: [] }]),
			getDestination: vi.fn(async () => [{ ref: "preface" }]),
			getPageIndex: vi.fn(async () => 2),
			destroy: pdfDocumentDestroy,
		};

		(window as any).pdfjsLib = {
			getDocument: vi.fn(() => ({
				promise: Promise.resolve(pdfDocument),
				destroy: loadingTaskDestroy,
			})),
		};

		const app: any = {
			workspace: {
				getLeavesOfType: vi.fn().mockReturnValue([]),
				getMostRecentLeaf: vi.fn().mockReturnValue(null),
			},
			vault: {
				readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
			},
		};

		const items = await getPdfOutlineForFile(app, createPdfFile(), {
			includeEntriesWithoutPage: true,
		});

		expect(items).toEqual([{ title: "Preface", pageNumber: 3, path: ["Preface"] }]);
		expect(app.vault.readBinary).toHaveBeenCalledTimes(1);
		expect((window as any).pdfjsLib.getDocument).toHaveBeenCalledTimes(1);
		expect(pdfDocumentDestroy).toHaveBeenCalledTimes(1);
		expect(loadingTaskDestroy).toHaveBeenCalledTimes(1);
	});

	it("可以按需过滤掉无法解析页码的目录项", async () => {
		const pdfDocument = {
			getOutline: vi.fn().mockResolvedValue([
				{ title: "有效目录", dest: "valid", items: [] },
				{ title: "无目标目录", items: [] },
			]),
			getDestination: vi.fn(async () => [{ ref: "valid" }]),
			getPageIndex: vi.fn(async () => 6),
		};

		const items = await extractPdfOutlineFromDocument(pdfDocument as any, {
			includeEntriesWithoutPage: false,
		});

		expect(items).toEqual([{ title: "有效目录", pageNumber: 7, path: ["有效目录"] }]);
	});
});
