import {
	computeReadingViewportLockRect,
	isEditableFocusedWithin,
	resolveReadingViewportLockTarget,
} from "../mobile-reading-viewport-lock";

describe("resolveReadingViewportLockTarget", () => {
	it("prefers the study leaf view-content over inner wrapper", () => {
		const leaf = document.createElement("div");
		leaf.className = "workspace-leaf-content";
		leaf.setAttribute("data-type", "weave-study-view");

		const viewContent = document.createElement("div");
		viewContent.className = "view-content";
		const wrapper = document.createElement("div");
		wrapper.className = "weave-study-view-wrapper";
		const overlay = document.createElement("div");
		overlay.className = "study-interface-overlay";

		leaf.appendChild(viewContent);
		viewContent.appendChild(wrapper);
		wrapper.appendChild(overlay);
		document.body.appendChild(leaf);

		expect(resolveReadingViewportLockTarget(overlay)).toBe(viewContent);

		leaf.remove();
	});
});

describe("computeReadingViewportLockRect", () => {
	it("starts below the Obsidian view-header so native actions stay visible", () => {
		const leaf = document.createElement("div");
		leaf.className = "workspace-leaf-content";
		leaf.setAttribute("data-type", "weave-question-bank-view");

		const viewHeader = document.createElement("div");
		viewHeader.className = "view-header";
		Object.defineProperty(viewHeader, "getBoundingClientRect", {
			value: () => ({
				top: 20,
				left: 0,
				right: 390,
				bottom: 64,
				width: 390,
				height: 44,
				x: 0,
				y: 20,
			}),
		});

		const viewContent = document.createElement("div");
		viewContent.className = "view-content";

		leaf.append(viewHeader, viewContent);
		document.body.appendChild(leaf);

		const rect = computeReadingViewportLockRect(viewContent, {
			offsetTop: 0,
			offsetLeft: 0,
			width: 390,
			height: 700,
			keyboardVisible: true,
		});

		expect(rect.top).toBe(64);
		expect(rect.height).toBe(700 - 64);

		leaf.remove();
	});
});

describe("isEditableFocusedWithin", () => {
	it("returns true when a textarea inside the root is focused", () => {
		const root = document.createElement("div");
		const textarea = document.createElement("textarea");
		root.appendChild(textarea);
		document.body.appendChild(root);
		textarea.focus();

		expect(isEditableFocusedWithin(root)).toBe(true);

		root.remove();
	});

	it("returns false when focus is outside the root", () => {
		const root = document.createElement("div");
		const outside = document.createElement("button");
		document.body.appendChild(root);
		document.body.appendChild(outside);
		outside.focus();

		expect(isEditableFocusedWithin(root)).toBe(false);

		root.remove();
		outside.remove();
	});
});
