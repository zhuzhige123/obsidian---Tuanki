import { describe, expect, it } from "vitest";
import {
	buildEpubMarkdownLocateCandidates,
	buildSourceLocateSourceRefCandidates,
} from "./source-locate-candidates";

describe("source-locate-candidates", () => {
	it("builds EPUB markdown locate candidates from the shared protocol", () => {
		const candidates = buildEpubMarkdownLocateCandidates({
			epubFilePath: "Books/demo.epub",
			encodedCfi: "readium%3Aalpha",
			rawCfi: "readium:alpha",
			excerptText: "第一行摘录\n第二行摘录",
			createdTime: new Date("2026-04-27T15:58:00").getTime(),
			sourceRef: "note-block-id",
			excerptId: "excerpt-fixed",
		});

		expect(candidates).toEqual(
			expect.arrayContaining([
				"__weave_epub_link__=Books/demo.epub#weave-cfi=readium%3Aalpha",
				"__weave_epub_cfi__=readium%3Aalpha",
				"__weave_epub_cfi__=readium:alpha",
				"__weave_epub_excerpt__=excerpt-fixed",
				`__weave_epub_time__=${new Date("2026-04-27T15:58:00").getTime()}`,
				"note-block-id",
				"^note-block-id",
				"#^note-block-id",
				"第一行摘录\n第二行摘录",
				"第一行摘录",
			])
		);
	});

	it("does not generate markdown sourceRef candidates for canvas navigation refs", () => {
		expect(buildSourceLocateSourceRefCandidates("canvas-file-node:node-1")).toEqual([]);
		expect(buildSourceLocateSourceRefCandidates("canvas-node:node-2")).toEqual([]);
		expect(buildSourceLocateSourceRefCandidates("card:card-1")).toEqual([]);
	});
});
