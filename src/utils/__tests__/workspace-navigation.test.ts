vi.mock("obsidian", () => {
	class TFile {
		path = "";
		name = "";
		extension = "";
	}

	return { TFile };
});

import { TFile } from "obsidian";
import { openLinkWithExistingLeaf } from "../workspace-navigation";

type MockLeaf = {
	view: {
		file: TFile | null;
		getViewType: () => string;
	};
	openFile: any;
};

function createTFile(path: string): TFile {
	const file = new TFile();
	Object.assign(file, {
		path,
		name: path.split("/").pop() || path,
		extension: path.includes(".") ? path.split(".").pop() || "" : "",
	});
	return file;
}

function createLeaf(): MockLeaf {
	return {
		view: {
			file: null,
			getViewType: () => "markdown",
		},
		openFile: vi.fn(async function (this: MockLeaf, file: TFile) {
			this.view.file = file;
		}),
	};
}

describe("openLinkWithExistingLeaf", () => {
	it("opens a resolved plain file path directly instead of routing through openLinkText", async () => {
		const targetFile = createTFile("Notes/source.md");
		const leaf = createLeaf();
		const revealLeaf = vi.fn(async () => undefined);
		const setActiveLeaf = vi.fn();
		const workspace: any = {
			openLinkText: vi.fn(async () => undefined),
			getLeaf: vi.fn(() => leaf),
			iterateAllLeaves: (callback: (leaf: MockLeaf) => void) => callback(leaf),
			revealLeaf,
			setActiveLeaf,
		};
		const app: any = {
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => targetFile),
			},
			vault: {
				getAbstractFileByPath: vi.fn((path: string) =>
					path === targetFile.path ? targetFile : null
				),
			},
			workspace,
		};

		const openedLeaf = await openLinkWithExistingLeaf(app, "Notes/source.md", "Books/demo.epub", {
			openInNewTab: true,
			focus: true,
		});

		expect(openedLeaf).toBe(leaf);
		expect(workspace.openLinkText).not.toHaveBeenCalled();
		expect(workspace.getLeaf).toHaveBeenCalledWith("tab");
		expect(leaf.openFile).toHaveBeenCalledWith(targetFile, {
			active: true,
			state: undefined,
		});
	});

	it("keeps using openLinkText when the link contains a subpath", async () => {
		const targetFile = createTFile("Notes/source.md");
		const workspace: any = {
			openLinkText: vi.fn(async () => undefined),
			getMostRecentLeaf: vi.fn(() => null),
			iterateAllLeaves: vi.fn(),
			getLeavesOfType: vi.fn(() => []),
		};
		const app: any = {
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => targetFile),
			},
			vault: {
				getAbstractFileByPath: vi.fn((path: string) =>
					path === targetFile.path ? targetFile : null
				),
			},
			workspace,
		};

		await openLinkWithExistingLeaf(
			app,
			"[[Notes/source.md#^block]]",
			"Books/demo.epub",
			{ focus: true }
		);

		expect(workspace.openLinkText).toHaveBeenCalledWith(
			"[[Notes/source.md#^block]]",
			"Books/demo.epub",
			false,
			{ active: true }
		);
	});
});
