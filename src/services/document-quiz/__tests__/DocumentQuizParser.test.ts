import { describe, expect, it } from "vitest";
import { parseDocumentQuizContent } from "../DocumentQuizParser";
import {
	buildStatsCommentLine,
	ensureBlockIdInQuestionSlice,
	upsertStatsCommentAfterBlockId,
} from "../DocumentQuizBlockIdWriter";

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

describe("DocumentQuizParser", () => {
	it("parses heading-separated questions", () => {
		const result = parseDocumentQuizContent("notes/quiz.md", SAMPLE);
		expect(result.items.length).toBe(2);
		expect(result.items[0]?.cardTypeLabel).toBe("choice");
		expect(result.items[1]?.blockId).toBe("we-q-existing");
	});

	it("parses Weave <-> card-delimiter batch format", () => {
		const batch = `Weave Exam 插件测试题库

用途：批量解析示例。

<->

下列哪个脑区与情景记忆关系最为密切？（A）
A. 海马体
B. 小脑
C. 延髓
D. 丘脑
---div---
海马体负责将短期体验编码为可检索的情景记忆。 ^weave-exam-2e3dkw3j

<->

经典条件反射中，无条件刺激（UCS） 指的是什么？（C）
A. 先前中性、后经配对获得条件意义的刺激
B. 实验结束后撤除的刺激
C. 无需学习即可自然引发无条件反应的刺激
D. 仅在消退阶段出现的刺激
---div---
UCS 如食物、电击等。 ^weave-exam-fnzm4k6x

<->

艾宾浩斯通过==无意义音节==控制材料熟悉度，发现遗忘在学习后==先快后慢==。
---div---
无意义音节（如 DAX）减少既有语义联想干扰。 ^weave-exam-a1zokpa3

<->`;
		const result = parseDocumentQuizContent("exam/quiz.md", batch);
		expect(result.items.length).toBe(3);
		expect(result.items[0]?.cardTypeLabel).toBe("choice");
		expect(result.items[0]?.blockId).toBe("weave-exam-2e3dkw3j");
		expect(result.items[1]?.blockId).toBe("weave-exam-fnzm4k6x");
		expect(result.items[2]?.cardTypeLabel).toBe("cloze");
	});

	it("returns zero items for empty content", () => {
		const result = parseDocumentQuizContent("x.md", "no questions here");
		expect(result.items.length).toBe(0);
	});

	it("ignores preamble with inline <-> and a lone trailing delimiter", () => {
		const preambleOnly = `用途：批量解析、选择题渲染、判分与解析展示的回归测试。
分隔符：<-> 卡片范围；---div--- 题干/选项与解析之间。
选择题答案标注在题干末尾括号内，如 （A） 或 （AC）。

<->`;
		const result = parseDocumentQuizContent("exam/quiz.md", preambleOnly);
		expect(result.items.length).toBe(0);
	});

	it("parses selection-only text", () => {
		const selection = `## 1. Q\n\nA. a\nB. b\n\n---div---\n\nB`;
		const result = parseDocumentQuizContent("x.md", SAMPLE, { selectionText: selection });
		expect(result.items.length).toBe(1);
	});
});

describe("DocumentQuizBlockIdWriter", () => {
	it("appends block id to last content line", () => {
		const slice = "## Q\n\nA. a\nB. b\n\n---div---\n\nAnswer";
		const { blockId, updatedSlice } = ensureBlockIdInQuestionSlice(slice);
		expect(blockId.startsWith("we-q-")).toBe(true);
		expect(updatedSlice).toContain(`^${blockId}`);
	});

	it("reuses existing block id", () => {
		const slice = "Question\n^abc123";
		const result = ensureBlockIdInQuestionSlice(slice, "abc123");
		expect(result.blockId).toBe("abc123");
		expect(result.updatedSlice).toContain("^abc123");
	});

	it("upserts stats comment after block id line", () => {
		const body = "Question\n^abc123\n";
		const comment = buildStatsCommentLine({ v: 1, attempts: 2 });
		const patched = upsertStatsCommentAfterBlockId(body, "abc123", comment);
		expect(patched).toContain("weave-test-stats");
		expect(patched.indexOf("^abc123")).toBeLessThan(patched.indexOf("weave-test-stats"));
	});
});
