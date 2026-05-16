
vi.mock("obsidian", () => {
	const createMockContentEl = () => {
		const el = document.createElement("div") as HTMLDivElement & {
			empty: () => void;
			addClass: (...classes: string[]) => void;
			createDiv: (options?: string | { cls?: string | string[]; text?: string | DocumentFragment }) => HTMLDivElement;
			createEl: <K extends keyof HTMLElementTagNameMap>(
				tag: K,
				o?: string | Record<string, unknown>,
				callback?: (el: HTMLElementTagNameMap[K]) => void
			) => HTMLElementTagNameMap[K];
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
		el.createEl = ((tag: keyof HTMLElementTagNameMap) => {
			const child = document.createElement(tag);
			el.appendChild(child);
			return child;
		}) as any;
		return el;
	};

	class ItemView {
		public leaf: unknown;
		public contentEl = createMockContentEl();
		public app: unknown;

		constructor(leaf: unknown) {
			this.leaf = leaf;
		}

		async setState(): Promise<void> {}
	}

	return {
		ItemView,
		WorkspaceLeaf: class {},
		setIcon: vi.fn(),
	};
});

vi.mock("../services/premium/PremiumFeatureGuard", () => ({
	PREMIUM_FEATURES: { INCREMENTAL_READING: "incremental-reading" },
	PremiumFeatureGuard: {
		getInstance: () => ({
			canUseFeature: () => true,
		}),
	},
}));

vi.mock("../utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../utils/view-location-utils", () => ({
	getViewSurfaceTokens: () => ({
		context: "sidebar",
		surfaceBackground: "var(--background-primary)",
		elevatedBackground: "var(--background-secondary)",
	}),
}));

import { IRCalendarView } from "./IRCalendarView";

describe("IRCalendarView", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not block workspace restore when setState runs after onOpen", async () => {
		vi.useFakeTimers();

		const leaf = {};
		const workspace = {
			on: vi.fn(() => ({ name: "layout-change" })),
			offref: vi.fn(),
		};
		const plugin = { app: { workspace } } as any;
		const view = new IRCalendarView(leaf as any, plugin);
		(view as any).app = plugin.app;

		const pendingLoad = new Promise<void>(() => {
			// keep pending to simulate waiting for allCoreServices during startup restore
		});
		const loadComponentAsync = vi
			.spyOn(view as any, "loadComponentAsync")
			.mockReturnValue(pendingLoad);

		await expect(view.onOpen()).resolves.toBeUndefined();
		expect(loadComponentAsync).toHaveBeenCalledTimes(1);

		const restoreRace = Promise.race([
			view
				.setState(
					{
						focusDeckId: "deck-1",
						focusDeckName: "专题一",
						filePath: "weave/incremental-reading/points/topic.irdeck",
					},
					{} as any
				)
				.then(() => "resolved"),
			new Promise((resolve) => {
				setTimeout(() => resolve("timeout"), 0);
			}),
		]);

		await vi.runAllTimersAsync();

		await expect(restoreRace).resolves.toBe("resolved");
		expect(loadComponentAsync).toHaveBeenCalledTimes(2);
	});
});
