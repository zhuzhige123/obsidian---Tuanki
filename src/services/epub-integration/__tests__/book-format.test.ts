import {
	getBookExtensionFromPath,
	isSupportedBookPath,
	stripSupportedBookExtension,
} from "../book-format";

describe("book-format", () => {
	it("recognizes cbz as a supported book path", () => {
		expect(getBookExtensionFromPath("Books/demo.cbz")).toBe("cbz");
		expect(isSupportedBookPath("Books/demo.cbz")).toBe(true);
		expect(stripSupportedBookExtension("demo.cbz")).toBe("demo");
	});
});
