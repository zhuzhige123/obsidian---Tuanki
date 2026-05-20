
vi.mock("../epub-runtime", () => ({
	getEpubRuntime: () => ({
		pluginId: "weave-epub-reader",
		collaboratorHostPluginIds: ["weave"],
	}),
}));

import { registerEpubHost, resolveEpubHost, unregisterEpubHost } from "../epub-host";

describe("epub-host resolution", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("prefers the locally registered host capability when it exists", async () => {
		const runtimeHost = {
			openEpubReader: vi.fn(),
		};
		const collaboratorHost = {
			openEpubReader: vi.fn(),
		};
		const getPlugin = vi.fn((pluginId: string) => {
			if (pluginId === "weave-epub-reader") {
				return runtimeHost;
			}
			if (pluginId === "weave") {
				return collaboratorHost;
			}
			return null;
		});
		const app = {
			plugins: {
				getPlugin,
			},
		} as any;
		const localHost = {
			openEpubReader: vi.fn(async () => undefined),
		};

		registerEpubHost(app, localHost);
		const resolved = resolveEpubHost(app);
		await resolved?.openEpubReader?.("Books/demo.epub");
		unregisterEpubHost(app);

		expect(localHost.openEpubReader).toHaveBeenCalledWith("Books/demo.epub");
		expect(runtimeHost.openEpubReader).not.toHaveBeenCalled();
		expect(collaboratorHost.openEpubReader).not.toHaveBeenCalled();
	});

	it("falls back to collaborator Weave for missing capabilities when the local host is registered", async () => {
		const collaboratorCreateCard = vi.fn(async () => undefined);
		const localHost = {
			openEpubReader: vi.fn(async () => undefined),
		};
		const app = {
			plugins: {
				getPlugin: vi.fn((pluginId: string) => {
					if (pluginId === "weave-epub-reader") {
						return null;
					}
					if (pluginId === "weave") {
						return {
							openCreateCardModal: collaboratorCreateCard,
						};
					}
					return null;
				}),
			},
		} as any;

		registerEpubHost(app, localHost);
		const resolved = resolveEpubHost(app);
		await resolved?.openCreateCardModal?.({ initialContent: "demo" });
		unregisterEpubHost(app);

		expect(collaboratorCreateCard).toHaveBeenCalledWith({ initialContent: "demo" });
	});

	it("does not expose local IR capabilities when the registered host does not implement them", () => {
		const localHost = {
			openEpubReader: vi.fn(async () => undefined),
		};
		const app = {
			plugins: {
				getPlugin: vi.fn(() => null),
			},
		} as any;

		registerEpubHost(app, localHost);
		const resolved = resolveEpubHost(app);
		unregisterEpubHost(app);

		expect(resolved?.openIRReadingPointFromExternalSelection).toBeUndefined();
		expect(resolved?.scheduleEpubChapterForIncrementalReading).toBeUndefined();
		expect(resolved?.markEpubResumePointFromReader).toBeUndefined();
		expect(resolved?.getAvailableEpubIncrementalReadingTopics).toBeUndefined();
	});

	it("falls back to collaborator Weave IR capabilities when the registered host does not implement them", async () => {
		const collaboratorCreateReadingPoint = vi.fn(async () => undefined);
		const collaboratorGetTopics = vi.fn(async () => [{ id: "deck-1", name: "专题 1" }]);
		const localHost = {
			openEpubReader: vi.fn(async () => undefined),
		};
		const app = {
			plugins: {
				getPlugin: vi.fn((pluginId: string) => {
					if (pluginId === "weave-epub-reader") {
						return null;
					}
					if (pluginId === "weave") {
						return {
							openIRReadingPointFromExternalSelection: collaboratorCreateReadingPoint,
							getAvailableEpubIncrementalReadingTopics: collaboratorGetTopics,
						};
					}
					return null;
				}),
			},
		} as any;

		registerEpubHost(app, localHost);
		const resolved = resolveEpubHost(app);
		await resolved?.openIRReadingPointFromExternalSelection?.({
			filePath: "Books/demo.epub",
			selectedText: "demo excerpt",
		});
		const topics = await resolved?.getAvailableEpubIncrementalReadingTopics?.();
		unregisterEpubHost(app);

		expect(collaboratorCreateReadingPoint).toHaveBeenCalledWith({
			filePath: "Books/demo.epub",
			selectedText: "demo excerpt",
		});
		expect(collaboratorGetTopics).toHaveBeenCalled();
		expect(topics).toEqual([{ id: "deck-1", name: "专题 1" }]);
	});

	it("falls back to the runtime plugin id when neither local host nor collaborator host is registered", () => {
		const runtimeHost = {
			openEpubReader: vi.fn(),
		};
		const getPlugin = vi.fn((pluginId: string) =>
			pluginId === "weave-epub-reader" ? runtimeHost : null
		);
		const app = {
			plugins: {
				getPlugin,
			},
		} as any;

		const resolved = resolveEpubHost(app);

		expect(getPlugin).toHaveBeenCalledWith("weave");
		expect(getPlugin).toHaveBeenCalledWith("weave-epub-reader");
		expect(resolved).toBe(runtimeHost);
	});

	it("returns null when local host, collaborator host, and runtime plugin host are all unavailable", () => {
		const app = {
			plugins: {
				getPlugin: vi.fn(() => null),
			},
		} as any;

		expect(resolveEpubHost(app)).toBeNull();
	});
});
