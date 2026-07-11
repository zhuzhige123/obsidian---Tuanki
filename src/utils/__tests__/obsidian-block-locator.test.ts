import {
	extractBlockIdFromCandidates,
	findObsidianBlockById,
	isObsidianBlankLine,
} from "../obsidian-block-locator";

describe("obsidian-block-locator", () => {
	it("treats content between blank lines as one block and strips trailing block id", () => {
		const content = [
			"上一段内容",
			"",
			"为什么说写作是唯一重要的事情？  （这个问题的回答能够表明是否真正理解了本章节） ",
			"---div---",
			"写作的目的在于将脑海中的想法转换为可重现让人理解的论据。无法以文字形式表述的想法将毫无意义。",
			"无论在公开讨论，文章发表，研究评审以及真理阐述都需要以文字来呈现。这些都在论证着写作的重要性。^we-omh1qh",
			"",
			"",
			"如何正确的看待写作这种行为或技能？",
		].join("\n");

		const result = findObsidianBlockById(content, "we-omh1qh");
		expect(result).not.toBeNull();
		expect(result?.blockStartLine).toBe(2);
		expect(result?.targetLine).toBe(5);
		expect(result?.blockContent).toContain("为什么说写作是唯一重要的事情？");
		expect(result?.blockContent).toContain("---div---");
		expect(result?.blockContent).toContain("无论在公开讨论，文章发表");
		expect(result?.blockContent).not.toContain("^we-omh1qh");
	});

	it("uses file start when there is no blank line before the block", () => {
		const content = "第一行内容^block-a\n\n下一块";
		const result = findObsidianBlockById(content, "block-a");
		expect(result?.blockStartLine).toBe(0);
		expect(result?.blockContent).toBe("第一行内容");
	});

	it("extracts block id from locate candidates", () => {
		expect(extractBlockIdFromCandidates(["note#^we-omh1qh", "note"])).toBe("we-omh1qh");
		expect(extractBlockIdFromCandidates(["^we-omh1qh"])).toBe("we-omh1qh");
	});

	it("detects blank lines", () => {
		expect(isObsidianBlankLine("   ")).toBe(true);
		expect(isObsidianBlankLine("text")).toBe(false);
	});
});
