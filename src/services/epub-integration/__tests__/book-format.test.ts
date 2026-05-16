import {
	getBookExtensionFromPath,
	isSupportedBookPath,
	stripSupportedBookExtension,
	usesFoliateGenericBookLoader,
} from "../book-format";

describe("book-format", () => {
	it("recognizes cbz as a supported foliate generic book format", () => {
		expect(getBookExtensionFromPath("Books/demo.cbz")).toBe("cbz");
		expect(isSupportedBookPath("Books/demo.cbz")).toBe(true);
		expect(usesFoliateGenericBookLoader("Books/demo.cbz")).toBe(true);
		expect(stripSupportedBookExtension("demo.cbz")).toBe("demo");
	});
});
