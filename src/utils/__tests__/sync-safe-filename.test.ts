import { describe, expect, it } from "vitest";
import {
	buildApkgDeckMediaFolderSegment,
	diagnoseFilename,
	sanitizeForSync,
	sanitizeMediaFilename,
	suggestSyncSafeName,
} from "../sync-safe-filename";

describe("sync-safe-filename APKG media paths", () => {
	it("builds APKG folder segments without square brackets or emoji", () => {
		const segment = buildApkgDeckMediaFolderSegment(
			"🧬Onenote：护理知识体系_OneNote：基础护理学_A12第十二节：给药的基本知识"
		);

		expect(segment.startsWith("APKG_")).toBe(true);
		expect(segment).not.toContain("[");
		expect(segment).not.toContain("]");
		expect(segment).not.toContain("🧬");
		expect(diagnoseFilename(segment, false).hasIssue).toBe(false);
	});

	it("sanitizes media filenames with full-width punctuation", () => {
		const safeName = sanitizeMediaFilename("巨噬细胞（血液细胞）_百度百科.mp4");
		expect(safeName).toBe("巨噬细胞(血液细胞)_百度百科.mp4");
		expect(diagnoseFilename(safeName, true).hasIssue).toBe(false);
	});

	it("migrates legacy bracketed APKG folder names to APKG_ prefix", () => {
		const legacy = "[APKG] MarginNote_考研英语_2000-2009_2001";
		const suggested = suggestSyncSafeName(legacy);
		expect(suggested.startsWith("APKG_")).toBe(true);
		expect(suggested).not.toContain("[");
		expect(suggested).not.toContain("]");
		expect(diagnoseFilename(suggested, false).hasIssue).toBe(false);
	});

	it("migrates real-world legacy APKG media folders from data management reports", () => {
		const cases = [
			"[APKG] 工作、消费主义和新穷人",
			"[APKG] 🎨Onenote: 护理知识体系_OneNote: 基础护理学_A12第十二节: 给药的基本知识",
		];

		for (const legacy of cases) {
			const suggested = suggestSyncSafeName(legacy);
			expect(suggested.startsWith("APKG_")).toBe(true);
			expect(diagnoseFilename(suggested, false).hasIssue).toBe(false);
		}
	});
});
