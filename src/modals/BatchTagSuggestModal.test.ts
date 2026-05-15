import { describe, expect, it, vi, beforeEach } from "vitest";
import { BatchTagSuggestModal } from "./BatchTagSuggestModal";

type CreateOptions = {
	cls?: string;
	text?: string;
};

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../tests/mocks/obsidian")>("../tests/mocks/obsidian");

	class SuggestModal<T> {
		app: unknown;
		modalEl: HTMLDivElement;
		containerEl: HTMLDivElement;
		close = vi.fn();

		constructor(app: unknown) {
			this.app = app;
			this.modalEl = document.createElement("div");
			this.containerEl = document.createElement("div");
		}

		setPlaceholder(_value: string): void {}
		setInstructions(_value: Array<{ command: string; purpose: string }>): void {}
		onOpen(): void {}
	}

	return {
		...actual,
		SuggestModal,
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

	it("renders tag label in a clean single row", () => {
		const modal = new BatchTagSuggestModal(
			{} as any,
			[],
			() => {}
		);
		const el = document.createElement("div");

		modal.renderSuggestion(
			{
				key: "later",
				tag: "later",
				label: "later",
				count: 0,
				keywords: ["later", "#later"],
				searchText: "later #later",
			},
			el
		);

		const row = el.querySelector(".weave-batch-tag-suggestion__row") as HTMLElement | null;
		const title = el.querySelector(".weave-batch-tag-suggestion__title") as HTMLElement | null;

		expect(row).toBeTruthy();
		expect(title).toBeTruthy();
		expect(el.classList.contains("weave-batch-tag-suggestion")).toBe(true);
		expect(row?.classList.contains("weave-batch-tag-suggestion__row")).toBe(true);
		expect(title?.tagName).toBe("SPAN");
		expect(title?.textContent).toBe("later");
	});

	it("accepts legacy icon field but keeps rendering text only", () => {
		const modal = new BatchTagSuggestModal(
			{} as any,
			[],
			() => {}
		);
		const el = document.createElement("div");

		modal.renderSuggestion(
			{
				key: "__remove_all__",
				tag: "__remove_all__",
				label: "删除全部 3 个标签",
				count: 0,
				icon: "trash-2",
				keywords: ["全部", "移除全部"],
				searchText: "全部 移除全部 删除全部 3 个标签",
			},
			el
		);

		const icon = el.querySelector(".weave-batch-tag-suggestion__icon") as HTMLElement | null;
		const title = el.querySelector(".weave-batch-tag-suggestion__title") as HTMLElement | null;
		expect(icon).toBeNull();
		expect(title?.textContent).toBe("删除全部 3 个标签");
	});

	it("selects item and closes modal", () => {
		const onSelect = vi.fn();
		const modal = new BatchTagSuggestModal(
			{} as any,
			[],
			onSelect
		);

		modal.onChooseSuggestion(
			{
				key: "later",
				tag: "later",
				label: "later",
				count: 0,
				keywords: ["later", "#later"],
				searchText: "later #later",
			},
			new MouseEvent("click")
		);

		expect(onSelect).toHaveBeenCalledWith({
			key: "later",
			tag: "later",
			label: "later",
			count: 0,
			keywords: ["later", "#later"],
			searchText: "later #later",
		});
		expect((modal as any).close).toHaveBeenCalledTimes(1);
	});

	it("reuses shared tag filtering and keeps create suggestion at the front", () => {
		const modal = new BatchTagSuggestModal(
			{} as any,
			[
				{
					key: "alpha",
					tag: "alpha",
					label: "#alpha",
					count: 3,
					keywords: ["alpha", "#alpha"],
					searchText: "alpha #alpha",
				},
				{
					key: "beta",
					tag: "beta",
					label: "#beta",
					count: 1,
					keywords: ["beta", "#beta"],
					searchText: "beta #beta",
				},
			],
			() => {},
			{
				createSuggestion: (query) => ({
					key: query,
					tag: query,
					label: `新建 #${query}`,
					count: 0,
					keywords: [query, `#${query}`, "新建"],
					searchText: `${query} #${query} 新建`,
					isCreateSuggestion: true,
				}),
			}
		);

		const suggestions = modal.getSuggestions("alp");

		expect(suggestions[0]).toMatchObject({
			tag: "alp",
			isCreateSuggestion: true,
		});
		expect(suggestions[1]).toMatchObject({ tag: "alpha" });
	});
});
