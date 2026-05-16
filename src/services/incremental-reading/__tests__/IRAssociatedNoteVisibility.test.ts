
vi.mock("obsidian", () => ({
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
}));

import {
	getPointAssociatedNotePath,
	getVisibleAssociatedNotePath,
	hasPointAssociatedNote,
	hasVisibleAssociatedNote,
} from "../IRAssociatedNoteVisibility";

describe("IRAssociatedNoteVisibility", () => {
	it("在 point 关联下同时支持显示与打开", () => {
		const material = {
			associatedNotePath: "Folder\\Linked Note.md",
			associatedNoteScope: "point" as const,
		};

		expect(getVisibleAssociatedNotePath(material)).toBe("Folder/Linked Note.md");
		expect(getPointAssociatedNotePath(material)).toBe("Folder/Linked Note.md");
		expect(hasVisibleAssociatedNote(material)).toBe(true);
		expect(hasPointAssociatedNote(material)).toBe(true);
	});

	it("在缺少 scope 的兼容数据下仍然显示并允许打开", () => {
		const material = {
			associatedNotePath: "Folder\\Legacy.md",
		};

		expect(getVisibleAssociatedNotePath(material)).toBe("Folder/Legacy.md");
		expect(getPointAssociatedNotePath(material)).toBe("Folder/Legacy.md");
		expect(hasVisibleAssociatedNote(material)).toBe(true);
		expect(hasPointAssociatedNote(material)).toBe(true);
	});

	it("material 级关联应保留显示能力，但不伪装成 point 级关联", () => {
		const material = {
			associatedNotePath: "Folder\\Material.md",
			associatedNoteScope: "material" as const,
		};

		expect(getVisibleAssociatedNotePath(material)).toBe("Folder/Material.md");
		expect(getPointAssociatedNotePath(material)).toBe("");
		expect(hasVisibleAssociatedNote(material)).toBe(true);
		expect(hasPointAssociatedNote(material)).toBe(false);
	});

	it("没有路径时不显示关联笔记入口", () => {
		expect(getVisibleAssociatedNotePath({ associatedNoteScope: "point" })).toBe("");
		expect(getPointAssociatedNotePath({ associatedNoteScope: "point" })).toBe("");
		expect(hasVisibleAssociatedNote({ associatedNoteScope: "point" })).toBe(false);
		expect(hasPointAssociatedNote({ associatedNoteScope: "point" })).toBe(false);
	});
});
