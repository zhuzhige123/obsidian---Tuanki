import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../tests/mocks/obsidian")>(
		"../tests/mocks/obsidian"
	);

	const createMockContentEl = () => {
		const el = document.createElement("div") as HTMLDivElement & {
			empty: () => void;
			addClass: (...classes: string[]) => void;
			createDiv: (options?: string | { cls?: string | string[]; text?: string | DocumentFragment }) => HTMLDivElement;
		};
		el.empty = () => {
			el.innerHTML = "";
		};
		el.addClass = (...classes: string[]) => {
			el.classList.add(...classes);
		};
		el.createDiv = (options) => {
			const div = document.createElement("div");
			if (typeof options === "string") {
				div.className = options;
			} else if (options) {
				if (options.cls) {
					div.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
				}
				if (options.text) {
					if (typeof options.text === "string") {
						div.textContent = options.text;
					} else {
						div.appendChild(options.text);
					}
				}
			}
			el.appendChild(div);
			return div;
		};
		return el;
	};

	class ItemView {
		public leaf: unknown;
		public contentEl = createMockContentEl();

		constructor(leaf: unknown) {
			this.leaf = leaf;
		}

		async setState(): Promise<void> {}
	}

	return {
		...actual,
		ItemView,
	};
});

import { WDeckView } from "./WDeckView";

describe("WDeckView", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("schedules the same-leaf study redirect after onOpen resolves", async () => {
		vi.useFakeTimers();

		const leaf = {};
		const openWDeckStudy = vi.fn(
			() =>
				new Promise<void>(() => {
					// keep pending to simulate the leaf view transition waiting on Obsidian internals
				})
		);
		const plugin = { openWDeckStudy } as any;
		const view = new WDeckView(leaf as any, plugin);

		await view.setState({ filePath: "vault/study/demo_01.wdeck" }, {} as any);

		const onOpenPromise = view.onOpen();
		await expect(onOpenPromise).resolves.toBeUndefined();
		expect(openWDeckStudy).not.toHaveBeenCalled();

		await vi.runOnlyPendingTimersAsync();

		expect(openWDeckStudy).toHaveBeenCalledTimes(1);
		expect(openWDeckStudy).toHaveBeenCalledWith("vault/study/demo_01.wdeck", leaf);
	});
});
