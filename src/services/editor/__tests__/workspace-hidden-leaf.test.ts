vi.mock("obsidian", () => ({
	Platform: { isMobile: false },
	MarkdownView: class MarkdownView {},
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/"),
}));

import { Platform } from "obsidian";
import {
	cleanupRestoredDetachedEditorLeaves,
	resolveWorkspaceLeafParentSplits,
} from "../workspace-hidden-leaf";

describe("resolveWorkspaceLeafParentSplits", () => {
	it("prefers rootSplit on desktop", () => {
		const rootSplit = { id: "root" };
		const leftSplit = { id: "left" };
		const rightSplit = { id: "right" };

		const splits = resolveWorkspaceLeafParentSplits({
			rootSplit,
			leftSplit,
			rightSplit,
		} as never);

		expect(splits).toEqual([rootSplit]);
	});

	it("includes mobile side splits before rootSplit", () => {
		const originalIsMobile = Platform.isMobile;
		(Platform as { isMobile: boolean }).isMobile = true;

		const rootSplit = { id: "root" };
		const leftSplit = { id: "left" };
		const rightSplit = { id: "right" };

		const splits = resolveWorkspaceLeafParentSplits({
			rootSplit,
			leftSplit,
			rightSplit,
		} as never);

		expect(splits).toEqual([rightSplit, leftSplit, rootSplit]);

		(Platform as { isMobile: boolean }).isMobile = originalIsMobile;
	});
});

describe("cleanupRestoredDetachedEditorLeaves", () => {
	it("detaches leaves marked as weave detached editors", () => {
		const detachedLeaf = {
			detached: false,
			containerEl: document.createElement("div"),
			view: {},
			detach: () => {
				detachedLeaf.detached = true;
			},
		};
		detachedLeaf.containerEl.dataset.weaveDetachedLeafEditor = "true";

		const normalLeaf = {
			detached: false,
			containerEl: document.createElement("div"),
			view: {},
			detach: () => {
				normalLeaf.detached = true;
			},
		};

		const app = {
			workspace: {
				getLeavesOfType: () => [detachedLeaf, normalLeaf],
			},
		};

		cleanupRestoredDetachedEditorLeaves(app as never);

		expect(detachedLeaf.detached).toBe(true);
		expect(normalLeaf.detached).toBe(false);
	});
});
