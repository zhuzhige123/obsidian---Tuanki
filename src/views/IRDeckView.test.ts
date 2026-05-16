
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

	class ItemView extends actual.Component {
		public leaf: unknown;
		public app = new actual.App();
		public containerEl = document.createElement("div");
		public contentEl = createMockContentEl();

		constructor(leaf: unknown) {
			super();
			this.leaf = leaf;
			this.containerEl.appendChild(this.contentEl);
		}

		async setState(): Promise<void> {}
	}

	return {
		...actual,
		ItemView,
		Notice: class {},
		Platform: { ...actual.Platform, isMobile: false },
	};
});

import { IRDeckView } from "./IRDeckView";

type WorkspaceEventRef = {
	name: string;
	callback: (value: unknown) => void;
};

type MockWorkspace = {
	layoutReady: boolean;
	activeLeaf: unknown;
	getActiveLeaf: () => unknown;
	on: (name: string, callback: (value: unknown) => void) => WorkspaceEventRef;
	offref: (ref: WorkspaceEventRef) => void;
	onLayoutReady: (callback: () => void) => void;
	emit: (name: string, value: unknown) => void;
	markLayoutReady: () => void;
	setActiveLeaf: (nextLeaf: unknown) => void;
};

function createMockWorkspace(leaf: unknown, options?: { layoutReady?: boolean; activeLeaf?: unknown }) {
	const listeners = new Map<string, Set<(value: unknown) => void>>();
	const layoutReadyCallbacks: Array<() => void> = [];
	const workspace: MockWorkspace = {
		layoutReady: options?.layoutReady ?? true,
		activeLeaf: options?.activeLeaf ?? leaf,
		getActiveLeaf: () => workspace.activeLeaf,
		on: (name: string, callback: (value: unknown) => void) => {
			const current = listeners.get(name) ?? new Set();
			current.add(callback);
			listeners.set(name, current);
			return { name, callback };
		},
		offref: (ref: WorkspaceEventRef) => {
			listeners.get(ref.name)?.delete(ref.callback);
		},
		onLayoutReady: (callback: () => void) => {
			layoutReadyCallbacks.push(callback);
		},
		emit(name: string, value: unknown) {
			for (const callback of listeners.get(name) ?? []) {
				callback(value);
			}
		},
		markLayoutReady() {
			workspace.layoutReady = true;
			for (const callback of layoutReadyCallbacks) {
				callback();
			}
		},
		setActiveLeaf(nextLeaf: unknown) {
			workspace.activeLeaf = nextLeaf;
			workspace.emit("active-leaf-change", nextLeaf);
		},
	};

	return workspace;
}

describe("IRDeckView", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("schedules the same-leaf calendar redirect after onOpen resolves", async () => {
		vi.useFakeTimers();

		const leaf = {};
		const openIRDeckCalendar = vi.fn(
			() =>
				new Promise<void>(() => {
					// keep pending to simulate the leaf view transition waiting on Obsidian internals
				})
		);
		const workspace = createMockWorkspace(leaf);
		const plugin = { app: { workspace }, openIRDeckCalendar } as any;
		const view = new IRDeckView(leaf as any, plugin);

		await view.setState({ filePath: "weave/incremental-reading/points/增量阅读灵感阅读专题.irdeck" }, {} as any);

		const onOpenPromise = view.onOpen();
		await expect(onOpenPromise).resolves.toBeUndefined();
		expect(openIRDeckCalendar).not.toHaveBeenCalled();

		await vi.runOnlyPendingTimersAsync();

		expect(openIRDeckCalendar).toHaveBeenCalledTimes(1);
		expect(openIRDeckCalendar).toHaveBeenCalledWith(
			"weave/incremental-reading/points/增量阅读灵感阅读专题.irdeck",
			leaf
		);
	});

	it("waits until startup restore is done before redirecting a background irdeck tab", async () => {
		vi.useFakeTimers();

		const leaf = {};
		const hiddenLeaf = {};
		const openIRDeckCalendar = vi.fn(() => Promise.resolve());
		const workspace = createMockWorkspace(leaf, {
			layoutReady: false,
			activeLeaf: hiddenLeaf,
		});
		const plugin = { app: { workspace }, openIRDeckCalendar } as any;
		const view = new IRDeckView(leaf as any, plugin);

		await view.setState(
			{ filePath: "weave/incremental-reading/points/增量阅读灵感阅读专题.irdeck" },
			{} as any
		);
		await expect(view.onOpen()).resolves.toBeUndefined();

		await vi.runOnlyPendingTimersAsync();
		expect(openIRDeckCalendar).not.toHaveBeenCalled();

		workspace.markLayoutReady();
		await vi.runOnlyPendingTimersAsync();
		expect(openIRDeckCalendar).not.toHaveBeenCalled();

		workspace.setActiveLeaf(leaf);
		await vi.runOnlyPendingTimersAsync();

		expect(openIRDeckCalendar).toHaveBeenCalledTimes(1);
		expect(openIRDeckCalendar).toHaveBeenCalledWith(
			"weave/incremental-reading/points/增量阅读灵感阅读专题.irdeck",
			leaf
		);
	});
});
