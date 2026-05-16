
vi.mock("obsidian", () => ({
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/$/, ""),
	Notice: class {},
	TFile: class {
		path: string;
		basename: string;
		constructor(path: string) {
			this.path = path;
			this.basename = path.split("/").pop()?.replace(/\.md$/i, "") || path;
		}
	},
	Menu: class {},
}));

import {
	createAssociatedMarkdownNote,
	resolvePreferredAssociatedNoteFolder,
} from "../IRAssociatedNoteMenu";

describe("IRAssociatedNoteMenu", () => {
	it("优先使用现有关联笔记所在目录", () => {
		const app = {
			workspace: {
				getActiveFile: () => ({
					parent: { path: "Active/Folder" },
				}),
			},
		} as any;

		expect(
			resolvePreferredAssociatedNoteFolder(app, {
				notePaths: ["Notes/Primary.md", "Other/Extra.md"],
				fallbackFilePath: "Source/Doc.pdf",
			})
		).toBe("Notes");
	});

	it("没有关联笔记时回退到来源文件目录", () => {
		const app = {
			workspace: {
				getActiveFile: () => null,
			},
		} as any;

		expect(
			resolvePreferredAssociatedNoteFolder(app, {
				notePaths: [],
				fallbackFilePath: "Books/Chapter/source.md",
			})
		).toBe("Books/Chapter");
	});

	it("创建新关联笔记时会自动避让重名并补建目录", async () => {
		const existingPaths = new Set<string>(["Notes/Sub/Reading Note.md"]);
		const createdFolders: string[] = [];
		const createdFiles: Array<{ path: string; content: string }> = [];

		const app = {
			vault: {
				getAbstractFileByPath: (path: string) => {
					if (existingPaths.has(path)) {
						return { path };
					}
					return null;
				},
				createFolder: vi.fn(async (path: string) => {
					createdFolders.push(path);
				}),
				create: vi.fn(async (path: string, content: string) => {
					createdFiles.push({ path, content });
					return { path, basename: "Reading Note 2" };
				}),
			},
		} as any;

		const created = await createAssociatedMarkdownNote(app, {
			baseName: "Reading Note",
			preferredFolderPath: "Notes/Sub",
			initialContent: "# Title",
		});

		expect(createdFolders).toEqual(["Notes", "Notes/Sub"]);
		expect(createdFiles).toEqual([
			{
				path: "Notes/Sub/Reading Note 2.md",
				content: "# Title",
			},
		]);
		expect(created.path).toBe("Notes/Sub/Reading Note 2.md");
	});
});
