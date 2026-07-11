import { describe, expect, it } from "vitest";
import { parseDocumentQuizContent } from "../DocumentQuizParser";
import {
	ensureBlockIdInQuestionSlice,
	findQuestionSliceRangeInBody,
	shiftDocumentQuizItemOffsets,
} from "../DocumentQuizBlockIdWriter";
import { DocumentQuizContentWriter } from "../DocumentQuizContentWriter";

const SAMPLE = `---
weave-doc-quiz: true
---

# 小测

## 1. 第一题

A. 一
B. 二

---div---

答案 B

## 2. 第二题

问题？

---div---

答案
^we-q-existing

<!-- weave-test-stats: {"v":1,"attempts":1,"correct":1,"accuracy":1} -->
`;

describe("DocumentQuizContentWriter", () => {
	it("finds question slice by block id", () => {
		const parsed = parseDocumentQuizContent("notes/quiz.md", SAMPLE);
		const body = parsed.bodyContent;
		const item = parsed.items[1];
		expect(item).toBeDefined();

		const range = findQuestionSliceRangeInBody(body, { blockId: item!.blockId });
		expect(range).not.toBeNull();
		const slice = body.slice(range!.start, range!.end);
		expect(slice).toContain("第二题");
		expect(slice).toContain("^we-q-existing");
	});

	it("writes edited content back to the matching slice", async () => {
		const parsed = parseDocumentQuizContent("notes/quiz.md", SAMPLE);
		const item = parsed.items[0];
		expect(item).toBeDefined();

		const edited = `## 1. 第一题（已改）

A. 一
B. 二

---div---

答案 B`;

		let stored = SAMPLE;
		const app = {
			vault: {
				read: async () => stored,
				modify: async (_file: unknown, content: string) => {
					stored = content;
				},
			},
		};

		const writer = new DocumentQuizContentWriter(app as never);
		const result = await writer.writeBackFromEditedCard(
			{ path: "notes/quiz.md" } as never,
			item!,
			edited,
			parsed.items
		);

		expect(result.success).toBe(true);
		expect(stored).toContain("第一题（已改）");
		expect(stored).toContain(`^${result.blockId}`);
		expect(stored).toContain("第二题");
		expect(stored).toContain("^we-q-existing");
		expect(stored).toContain("weave-test-stats");
	});

	it("preserves stats comment after content write-back", async () => {
		const parsed = parseDocumentQuizContent("notes/quiz.md", SAMPLE);
		const item = parsed.items[1];
		expect(item).toBeDefined();

		const edited = `## 2. 第二题（修订）

问题改？

---div---

新答案`;

		let stored = SAMPLE;
		const app = {
			vault: {
				read: async () => stored,
				modify: async (_file: unknown, content: string) => {
					stored = content;
				},
			},
		};

		const writer = new DocumentQuizContentWriter(app as never);
		const result = await writer.writeBackFromEditedCard(
			{ path: "notes/quiz.md" } as never,
			item!,
			edited,
			parsed.items
		);

		expect(result.success).toBe(true);
		expect(stored).toContain("第二题（修订）");
		expect(stored.indexOf("^we-q-existing")).toBeLessThan(stored.indexOf("weave-test-stats"));
	});

	it("shifts later item offsets after patch", () => {
		const parsed = parseDocumentQuizContent("notes/quiz.md", SAMPLE);
		const first = parsed.items[0]!;
		const second = parsed.items[1]!;
		const originalSecondStart = second.bodyOffsetStart;
		const oldLength = first.bodyOffsetEnd - first.bodyOffsetStart;

		const newSlice = `${ensureBlockIdInQuestionSlice("longer content").updatedSlice.trimEnd()}\n`;
		shiftDocumentQuizItemOffsets(
			parsed.items,
			first.index,
			first.bodyOffsetStart,
			oldLength,
			newSlice.length
		);

		expect(second.bodyOffsetStart).toBe(originalSecondStart + (newSlice.length - oldLength));
	});
});
