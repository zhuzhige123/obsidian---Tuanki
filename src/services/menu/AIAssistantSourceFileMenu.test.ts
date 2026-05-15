import { Menu, TFile } from "obsidian";
import type { MenuItem as MockMenuItem } from "../../tests/mocks/obsidian";
import {
	buildAIAssistantSourceFileMenu,
	buildAIAssistantSourceFileTree,
} from "./AIAssistantSourceFileMenu";

type TrackingMenu = Menu & {
	findItemByTitle(title: string): MockMenuItem | undefined;
};

vi.mock("obsidian", async () => {
	return await vi.importActual<typeof import("../../tests/mocks/obsidian")>(
		"../../tests/mocks/obsidian"
	);
});

describe("AIAssistantSourceFileMenu", () => {
	function createFile(path: string, mtime = 0): TFile {
		const name = path.split("/").pop() ?? path;
		const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
		const basename = extension ? name.slice(0, -(extension.length + 1)) : name;
		return Object.assign(new TFile(), {
			path,
			name,
			basename,
			extension,
			stat: {
				ctime: mtime,
				mtime,
				size: 1024,
			},
		});
	}

	it("builds a folder-first source file tree", () => {
		const files = [
			createFile("zeta.md"),
			createFile("notes/beta.md"),
			createFile("notes/alpha.md"),
			createFile("archive/2026/review.md"),
		];

		const tree = buildAIAssistantSourceFileTree(files);

		expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual([
			"folder:archive",
			"folder:notes",
			"file:zeta.md",
		]);
		expect(tree[0]?.children?.map((node) => `${node.kind}:${node.name}`)).toEqual([
			"folder:2026",
		]);
		expect(tree[1]?.children?.map((node) => `${node.kind}:${node.name}`)).toEqual([
			"file:alpha.md",
			"file:beta.md",
		]);
	});

	it("marks the current file in the native dropdown menu", () => {
		const files = [
			createFile("inbox/today.md", 300),
			createFile("projects/project-a.md", 200),
			createFile("readme.md", 100),
		];

		const onSelect = vi.fn();
		const menu = new Menu() as TrackingMenu;

		buildAIAssistantSourceFileMenu(menu, {
			files,
			currentFilePath: "projects/project-a.md",
			onSelect,
		});

		expect(
			menu.findItemByTitle("\u5f53\u524d\u6587\u4ef6\uff1aproject-a.md")?.isDisabled()
		).toBe(true);
		expect(
			menu.findItemByTitle("\u5168\u90e8 Markdown \u6587\u4ef6")?.isDisabled()
		).toBe(true);
		expect(menu.findItemByTitle("\u6700\u8fd1\u4fee\u6539")).toBeUndefined();

		const projectsSubmenu = menu.findItemByTitle("projects")?.getSubmenu() as TrackingMenu | null;
		expect(projectsSubmenu).toBeTruthy();
		const selectedFileItem = projectsSubmenu?.findItemByTitle("project-a.md");
		expect(selectedFileItem?.isChecked()).toBe(true);
		selectedFileItem?.trigger();
		expect(onSelect).toHaveBeenLastCalledWith(files[1]);
	});
});
