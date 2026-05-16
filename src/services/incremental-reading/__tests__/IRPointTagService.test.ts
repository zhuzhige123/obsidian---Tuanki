import { normalizeReadingPointTags } from "../IRPointTagService";
import {
	matchTagGroupByTags,
	normalizeTagGroupCandidateTags,
} from "../IRTagGroupService";
import type { IRTagGroup } from "../../../types/ir-types";

describe("normalizeReadingPointTags", () => {
	it("trims tags, preserves first display casing, and deduplicates case-insensitively", () => {
		expect(normalizeReadingPointTags(["  Research  ", "research", "Deep Work", "", "  "])).toEqual([
			"Research",
			"Deep Work",
		]);
	});

	it("keeps hashtag display values while still deduplicating by lowercase", () => {
		expect(normalizeReadingPointTags(["#Paper", "#paper", "Paper"])).toEqual(["#Paper", "Paper"]);
	});
});

describe("normalizeTagGroupCandidateTags", () => {
	it("normalizes whitespace, strips leading hashtag, lowercases, and deduplicates", () => {
		expect(normalizeTagGroupCandidateTags(["  #Paper  ", "paper", "Topic/A", "topic/a"])).toEqual([
			"paper",
			"topic/a",
		]);
	});
});

describe("matchTagGroupByTags", () => {
		const groups: Pick<IRTagGroup, "id" | "matchAnyTags" | "matchPriority">[] = [
			{ id: "default", matchAnyTags: [], matchPriority: 999 },
			{ id: "novel", matchAnyTags: ["??", "fiction"], matchPriority: 20 },
			{ id: "paper", matchAnyTags: ["#Paper", "??"], matchPriority: 10 },
		];

	it("matches by reading-point tags instead of document tags and honors priority", () => {
		expect(matchTagGroupByTags(groups, [" fiction ", "Paper"])).toBe("paper");
	});

	it("falls back to default when no reading-point tag matches", () => {
		expect(matchTagGroupByTags(groups, ["weekly", "backlog"])).toBe("default");
	});

	it("supports empty tag sets without false positives", () => {
		expect(matchTagGroupByTags(groups, [])).toBe("default");
	});
});
