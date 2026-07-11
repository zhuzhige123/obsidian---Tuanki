import {
	extractBlockIdFromHref,
	findBlockIdBeforeIndex,
	findDocumentQuizStatsCommentMatches,
} from "../document-quiz-stats-comment-locator";

describe("document-quiz-stats-comment-locator", () => {
	it("finds stats comments after inline block ids", () => {
		const text = `海马体负责将短期体验编码为可检索的情景记忆；小脑主司运动协调，延髓为生命体征中枢，丘脑主要参与感觉信息中继。 ^weave-exam-2e3dkw3j
<!-- weave-test-stats: {"v":1,"attempts":1,"correct":0,"accuracy":0,"lastAt":"2026-07-04T14:08:28.517Z","lastMode":"exam"} -->
`;

		const matches = findDocumentQuizStatsCommentMatches(text);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.blockId).toBe("weave-exam-2e3dkw3j");
		expect(matches[0]?.snapshot.attempts).toBe(1);
	});

	it("resolves block id from encoded href", () => {
		expect(extractBlockIdFromHref("note.md#%5Eweave-exam-abc")).toBe("weave-exam-abc");
		expect(extractBlockIdFromHref("#^we-q-existing")).toBe("we-q-existing");
	});

	it("finds nearest preceding block id", () => {
		const text = `line one ^we-q-a
line two
<!-- weave-test-stats: {"v":1,"attempts":2,"correct":1,"accuracy":0.5} -->`;
		const commentStart = text.indexOf("<!--");
		expect(findBlockIdBeforeIndex(text, commentStart)).toBe("we-q-a");
	});
});
