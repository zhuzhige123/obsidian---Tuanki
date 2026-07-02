import {
	getFolderDeckMappingCardCount,
	normalizeFolderDeckMapping,
	normalizeFolderDeckMappings,
	type FolderDeckMapping,
} from "../../../types/newCardParsingTypes";

const baseMapping = (): FolderDeckMapping => ({
	id: "mapping-1",
	type: "folder",
	path: "",
	targetDeckId: "deck-1",
	targetDeckName: "Demo",
	includeSubfolders: true,
	enabled: true,
	fileMode: "single-card",
});

describe("folder deck mapping normalization", () => {
	it("migrates legacy fileCount to cardCount", () => {
		const result = normalizeFolderDeckMapping({
			...baseMapping(),
			fileCount: 12,
		});

		expect(result.changed).toBe(true);
		expect(result.mapping.cardCount).toBe(12);
		expect(result.mapping.fileCount).toBeUndefined();
		expect(getFolderDeckMappingCardCount(result.mapping)).toBe(12);
	});

	it("fills path from folderPath", () => {
		const result = normalizeFolderDeckMapping({
			...baseMapping(),
			path: "",
			folderPath: "Notes/Cards",
		});

		expect(result.changed).toBe(true);
		expect(result.mapping.path).toBe("Notes/Cards");
	});

	it("normalizes mapping lists in batch", () => {
		const result = normalizeFolderDeckMappings([
			{ ...baseMapping(), fileCount: 3 },
			{ ...baseMapping(), id: "mapping-2", cardCount: 5 },
		]);

		expect(result.changed).toBe(true);
		expect(result.mappings[0]?.cardCount).toBe(3);
		expect(result.mappings[0]?.fileCount).toBeUndefined();
		expect(result.mappings[1]?.cardCount).toBe(5);
	});
});
