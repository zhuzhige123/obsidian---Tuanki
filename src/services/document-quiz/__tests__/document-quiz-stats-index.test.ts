import { indexDocumentQuizStatsComments } from "../document-quiz-stats-index";

describe("indexDocumentQuizStatsComments", () => {
	it("indexes stats comments that follow block id lines", () => {
		const body = `## 题一

A. 一
B. 二

---div---

答案 B
^we-q-one

<!-- weave-test-stats: {"v":1,"attempts":2,"correct":1,"accuracy":0.5,"lastAt":"2026-07-04T12:00:00.000Z","lastMode":"exam"} -->

## 题二

问题？
^we-q-two
`;

		const indexed = indexDocumentQuizStatsComments(body);
		expect(indexed.size).toBe(1);
		expect(indexed.get("we-q-one")).toMatchObject({
			blockId: "we-q-one",
			attempts: 2,
			correct: 1,
			accuracy: 0.5,
			lastMode: "exam",
		});
	});

	it("indexes inline block ids with trailing stats comment", () => {
		const body = `答案内容 ^we-q-inline
<!-- weave-test-stats: {"v":1,"attempts":1,"correct":0,"accuracy":0,"lastAt":"2026-07-04T14:08:28.517Z","lastMode":"exam"} -->
`;

		const indexed = indexDocumentQuizStatsComments(body);
		expect(indexed.get("we-q-inline")).toMatchObject({
			attempts: 1,
			correct: 0,
			accuracy: 0,
		});
	});

	it("ignores block ids without stats comments", () => {
		const body = `^we-q-no-stats
普通段落
`;
		expect(indexDocumentQuizStatsComments(body).size).toBe(0);
	});
});
