import { describe, expect, it, vi, beforeEach } from "vitest";
import { BatchTagSuggestModal } from "./BatchTagSuggestModal";
import { setIcon } from "obsidian";

type CreateOptions = {
	cls?: string;
	text?: string;
};

vi.mock("obsidian", () => {
	class App {}

	class SuggestModal<T> {
		app: App;
		modalEl: HTMLDivElement;
		containerEl: HTMLDivElement;

		constructor(app: App) {
			this.app = app;
			this.modalEl = document.createElement("div");
			this.containerEl = document.createElement("div");
		}

		setPlaceholder(_value: string): void {}
		setInstructions(_value: Array<{ command: string; purpose: string }>): void {}
		onOpen(): void {}
	}

	return {
		App,
		SuggestModal,
		setIcon: vi.fn((element: HTMLElement, iconName: string) => {
			element.setAttribute("data-icon", iconName);
		}),
	};
});

describe("BatchTagSuggestModal", () => {
	beforeEach(() => {
		if (!(HTMLElement.prototype as any).addClass) {
			(HTMLElement.prototype as any).addClass = function (...classNames: string[]) {
				this.classList.add(...classNames);
				return this;
			};
		}

		if (!(HTMLElement.prototype as any).createDiv) {
			(HTMLElement.prototype as any).createDiv = function (options?: CreateOptions) {
				const el = document.createElement("div");
				if (options?.cls) el.className = options.cls;
				if (typeof options?.text === "string") el.textContent = options.text;
				this.appendChild(el);
				return el;
			};
		}

		if (!(HTMLElement.prototype as any).createSpan) {
			(HTMLElement.prototype as any).createSpan = function (options?: CreateOptions) {
				const el = document.createElement("span");
				if (options?.cls) el.className = options.cls;
				if (typeof options?.text === "string") el.textContent = options.text;
				this.appendChild(el);
				return el;
			};
		}

		vi.clearAllMocks();
	});

	it("renders tag icon and label on the same flex row", () => {
		const modal = new BatchTagSuggestModal(
			{} as any,
			[],
			() => {}
		);
		const el = document.createElement("div");

		modal.renderSuggestion(
			{
				tag: "later",
				label: "later",
			},
			el
		);

		const row = el.querySelector(".weave-batch-tag-suggestion__row") as HTMLElement | null;
		const icon = el.querySelector(".weave-batch-tag-suggestion__icon") as HTMLElement | null;
		const title = el.querySelector(".weave-batch-tag-suggestion__title") as HTMLElement | null;

		expect(row).toBeTruthy();
		expect(icon).toBeTruthy();
		expect(title).toBeTruthy();
		expect(el.classList.contains("weave-batch-tag-suggestion")).toBe(true);
		expect(row?.classList.contains("weave-batch-tag-suggestion__row")).toBe(true);
		expect(title?.tagName).toBe("SPAN");
		expect(title?.textContent).toBe("later");
		expect(setIcon).toHaveBeenCalledWith(icon, "tag");
	});

	it("uses the provided icon when present", () => {
		const modal = new BatchTagSuggestModal(
			{} as any,
			[],
			() => {}
		);
		const el = document.createElement("div");

		modal.renderSuggestion(
			{
				tag: "__remove_all__",
				label: "删除全部 3 个标签",
				icon: "trash-2",
			},
			el
		);

		const icon = el.querySelector(".weave-batch-tag-suggestion__icon") as HTMLElement | null;
		expect(setIcon).toHaveBeenCalledWith(icon, "trash-2");
	});
});
