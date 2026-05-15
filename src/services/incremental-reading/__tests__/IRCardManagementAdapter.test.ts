import { describe, expect, it } from "vitest";
import {
	buildIRTableFields,
	getIRPriorityValue,
	getIRSourceDocumentLabel,
	getIRSourceSubunitLabel,
	getIRTagGroupLabel,
} from "../IRCardManagementAdapter";

describe("IRCardManagementAdapter", () => {
	it("优先级按 priorityUi -> priorityEff -> 默认值回退", () => {
		expect(getIRPriorityValue(undefined, 7, 5)).toBe(7);
		expect(getIRPriorityValue(undefined, undefined, 4)).toBe(4);
		expect(getIRPriorityValue(undefined, undefined, undefined)).toBe(5);
	});

	it("来源文档标签取 basename", () => {
		expect(getIRSourceDocumentLabel("Books/demo.epub")).toBe("demo.epub");
		expect(getIRSourceDocumentLabel("")).toBe("未命名来源");
	});

	it("pdf/epub 无子单元时回退到未定位文案", () => {
		expect(getIRSourceSubunitLabel(undefined, "pdf")).toBe("未定位到目录书签");
		expect(getIRSourceSubunitLabel(undefined, "markdown")).toBe("");
	});

	it("表格字段构建会保留 IR 派生字段", () => {
		const result = buildIRTableFields({
			title: "测试标题",
			sourceFile: "Notes/demo.md",
			priorityValue: 9,
			associatedNotePaths: ["Notes/关联笔记.md"],
			tagGroupName: "",
		});

		expect(result).toMatchObject({
			ir_title: "测试标题",
			ir_source_file: "Notes/demo.md",
			ir_priority: 9,
			ir_priority_value: 9,
			ir_associated_note_primary_path: "Notes/关联笔记.md",
			ir_associated_note_paths: ["Notes/关联笔记.md"],
			ir_tag_group: "默认",
		});
	});

	it("标签组显示文案回退到默认", () => {
		expect(getIRTagGroupLabel("")).toBe("默认");
		expect(getIRTagGroupLabel("专题组")).toBe("专题组");
	});
});
