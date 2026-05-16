import { setIcon } from "obsidian";
import { IRDeckSelectorModal } from "./IRDeckSelectorModal";

type CreateOptions = {
	cls?: string;
	text?: string;
};

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../tests/mocks/obsidian")>(
		"../tests/mocks/obsidian"
	);

	class SuggestModal<T> extends actual.Component {
		app: InstanceType<typeof actual.App>;
		close = vi.fn();

		constructor(app: InstanceType<typeof actual.App>) {
			super();
			this.app = app;
		}

		setPlaceholder(_value: string): void {}
		setInstructions(_value: Array<{ command: string; purpose: string }>): void {}
	}

	return {
		...actual,
		SuggestModal,
		setIcon: vi.fn((element: HTMLElement, iconName: string) => {
			element.setAttribute("data-icon", iconName);
		}),
	};
});

describe("IRDeckSelectorModal", () => {
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

	it("renders only the deck name in the suggestion item", () => {
		const modal = new IRDeckSelectorModal({} as any, [], () => {});
		const el = document.createElement("div");

		modal.renderSuggestion(
			{
				id: "deck-5wdl3b4j",
				name: "心理学",
				path: "",
				tag: "",
				createdAt: "",
				updatedAt: "",
				stats: undefined,
			} as any,
			el
		);

		const row = el.querySelector(".weave-ir-deck-suggestion-row") as HTMLElement | null;
		const name = el.querySelector(".weave-ir-deck-suggestion-name") as HTMLElement | null;
		const deckId = el.querySelector(".weave-ir-deck-suggestion-id");

		expect(row).toBeTruthy();
		expect(el.classList.contains("weave-ir-deck-suggestion")).toBe(true);
		expect(row?.classList.contains("weave-ir-deck-suggestion-row")).toBe(true);
		expect(name?.textContent).toBe("心理学");
		expect(name?.tagName).toBe("SPAN");
		expect(deckId).toBeNull();
		expect(el.textContent).not.toContain("deck-5wdl3b4j");
		expect(setIcon).toHaveBeenCalled();
	});

	it("calls onSelect and closes the modal when a deck is chosen", () => {
		const onSelect = vi.fn();
		const modal = new IRDeckSelectorModal({} as any, [], onSelect);
		const deck = {
			id: "deck-reading",
			name: "阅读",
			path: "",
			tag: "",
			createdAt: "",
			updatedAt: "",
			stats: undefined,
		} as any;

		modal.onChooseSuggestion(deck, {} as any);

		expect(onSelect).toHaveBeenCalledWith(deck);
		expect((modal as any).close).toHaveBeenCalledTimes(1);
	});
});
