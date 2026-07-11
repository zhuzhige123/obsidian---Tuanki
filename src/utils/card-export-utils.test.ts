import { formatCardBodyForMarkdownExport } from "./card-export-utils";

describe("formatCardBodyForMarkdownExport", () => {
	it("keeps ---div--- and removes Q: prefix for choice cards", () => {
		const input = `Q: 下列哪项是冠心病的主要病因？（A）

A. 冠状动脉粥样硬化

B. 心脏瓣膜病变

C. 心肌炎症

D. 先天性心脏畸形

---div---
冠心病全称冠状动脉粥样硬化性心脏病，核心病因是冠状动脉因粥样硬化导致管腔狭窄，心肌供血不足；B、C、D均为其他心脏疾病的病因。`;

		expect(formatCardBodyForMarkdownExport(input)).toBe(`下列哪项是冠心病的主要病因？（A）

A. 冠状动脉粥样硬化

B. 心脏瓣膜病变

C. 心肌炎症

D. 先天性心脏畸形

---div---
冠心病全称冠状动脉粥样硬化性心脏病，核心病因是冠状动脉因粥样硬化导致管腔狭窄，心肌供血不足；B、C、D均为其他心脏疾病的病因。`);
	});

	it("normalizes legacy --- separator back to ---div---", () => {
		const input = `Q: 什么是间隔重复？

---

在即将遗忘时复习。`;

		expect(formatCardBodyForMarkdownExport(input)).toBe(`什么是间隔重复？

---div---
在即将遗忘时复习。`);
	});

	it("strips optional A: prefix on the back side", () => {
		const input = `问题内容

---div---
A: 答案内容`;

		expect(formatCardBodyForMarkdownExport(input)).toBe(`问题内容

---div---
答案内容`);
	});

	it("ignores YAML frontmatter before formatting body", () => {
		const input = `---
we_source: "循环系统Weave卡片（20张）.md"
---

Q: 题干（B）

A. 选项一
B. 选项二

---div---
解析内容`;

		expect(formatCardBodyForMarkdownExport(input)).toBe(`题干（B）

A. 选项一
B. 选项二

---div---
解析内容`);
	});
});
