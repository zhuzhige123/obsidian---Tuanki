import { classifyEpubError, EpubError } from "../epub-error";

describe("epub-error classification", () => {
	it("keeps typed parser errors stable for users and logs", () => {
		const error = new EpubError("missing_container", "EPUB 缺少 META-INF/container.xml", {
			filePath: "Books/demo.epub",
		});

		const classified = classifyEpubError(error, "open");

		expect(classified.code).toBe("missing_container");
		expect(classified.userMessage).toContain("容器索引");
		expect(classified.logMessage).toContain("EPUB:open:missing_container");
		expect(classified.context).toEqual({ filePath: "Books/demo.epub" });
	});

	it("classifies malformed cfi crashes into a stable EPUB navigation category", () => {
		const classified = classifyEpubError(
			new Error("Cannot read properties of null (reading 'childNodes')"),
			"open"
		);

		expect(classified.code).toBe("invalid_cfi_target");
		expect(classified.userMessage).toContain("内部导航结构异常");
	});

	it("classifies corrupted zip archive failures as invalid_archive", () => {
		const classified = classifyEpubError(
			new Error("End of data reached (data length = 7942498, asked index = 7942736). Corrupted zip ?"),
			"open"
		);

		expect(classified.code).toBe("invalid_archive");
		expect(classified.userMessage).toContain("压缩包已损坏");
	});
});
