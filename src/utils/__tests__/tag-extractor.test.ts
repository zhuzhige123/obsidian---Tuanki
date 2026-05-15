import { TagExtractor } from "../tag-extractor";

describe("TagExtractor", () => {
	it("忽略 frontmatter 和 HTML 属性中的 #，只提取正文可见标签", () => {
		const content = `---
alias: "#不是标签"
---
<mark style="background: #FFF3A3A6;">#可见标签</mark>
正文里的 #123
<span data-tag="#隐藏属性标签">普通文本</span>`;

		expect(TagExtractor.extractTagsExcludingCode(content)).toEqual(["可见标签"]);
	});
});
