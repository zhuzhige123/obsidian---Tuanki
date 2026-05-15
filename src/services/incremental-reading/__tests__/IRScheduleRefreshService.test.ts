import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invalidateScheduleCacheMock = vi.fn();
const recomputeScheduleForDeckMock = vi.fn();
const workspaceInvalidateMock = vi.fn();

vi.mock("../IRScheduleKernel", () => ({
	getSharedIRScheduleKernel: () => ({
		invalidateScheduleCache: invalidateScheduleCacheMock,
		recomputeScheduleForDeck: recomputeScheduleForDeckMock,
	}),
}));

vi.mock("../IRWorkspaceSnapshotService", () => ({
	getSharedIRWorkspaceSnapshotService: () => ({
		invalidate: workspaceInvalidateMock,
	}),
}));

vi.mock("../../../utils/logger", () => ({
	logger: {
		error: vi.fn(),
	},
}));

import {
	broadcastIRDataUpdated,
	IR_DATA_UPDATED_EVENT,
	recomputeAndBroadcastIRData,
} from "../IRScheduleRefreshService";

const originalWindow = (globalThis as any).window;
const originalCustomEvent = (globalThis as any).CustomEvent;

class TestCustomEvent<T = unknown> {
	type: string;
	detail: T;

	constructor(type: string, init?: { detail?: T }) {
		this.type = type;
		this.detail = init?.detail as T;
	}
}

describe("IRScheduleRefreshService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		recomputeScheduleForDeckMock.mockResolvedValue({
			generatedAt: 123456,
			deckIds: ["deck-1"],
		});
		(globalThis as any).window = {
			dispatchEvent: vi.fn(),
		};
		(globalThis as any).CustomEvent = TestCustomEvent;
	});

	afterEach(() => {
		(globalThis as any).window = originalWindow;
		(globalThis as any).CustomEvent = originalCustomEvent;
	});

	it("invalidates schedule cache before recomputing and broadcasts the fresh detail", async () => {
		const detail = await recomputeAndBroadcastIRData({} as any, "import_materials", {
			deckIds: ["deck-1"],
		});

		expect(workspaceInvalidateMock).toHaveBeenCalledTimes(1);
		expect(invalidateScheduleCacheMock).toHaveBeenCalledTimes(1);
		expect(recomputeScheduleForDeckMock).toHaveBeenCalledWith("import_materials", {
			deckIds: ["deck-1"],
		});
		expect(invalidateScheduleCacheMock.mock.invocationCallOrder[0]).toBeLessThan(
			recomputeScheduleForDeckMock.mock.invocationCallOrder[0]
		);
		expect(detail).toEqual({
			reason: "import_materials",
			generatedAt: 123456,
			deckIds: ["deck-1"],
		});
		expect((globalThis as any).window.dispatchEvent).toHaveBeenCalledTimes(1);
		const [event] = (globalThis as any).window.dispatchEvent.mock.calls[0];
		expect(event.type).toBe(IR_DATA_UPDATED_EVENT);
		expect(event.detail).toEqual(detail);
	});

	it("broadcasts a lightweight IR update while invalidating caches", () => {
		const detail = broadcastIRDataUpdated({} as any, {
			reason: "ui_refresh",
			deckIds: ["deck-2"],
		});

		expect(workspaceInvalidateMock).toHaveBeenCalledTimes(1);
		expect(invalidateScheduleCacheMock).toHaveBeenCalledTimes(1);
		expect(detail.reason).toBe("ui_refresh");
		expect(detail.deckIds).toEqual(["deck-2"]);
		expect(typeof detail.generatedAt).toBe("number");
		expect((globalThis as any).window.dispatchEvent).toHaveBeenCalledTimes(1);
		const [event] = (globalThis as any).window.dispatchEvent.mock.calls[0];
		expect(event.type).toBe(IR_DATA_UPDATED_EVENT);
		expect(event.detail).toEqual(detail);
	});

	it("can skip schedule cache invalidation for lightweight UI-only broadcasts", () => {
		const detail = broadcastIRDataUpdated({} as any, {
			reason: "ui_refresh",
			invalidateScheduleCache: false,
		});

		expect(workspaceInvalidateMock).toHaveBeenCalledTimes(1);
		expect(invalidateScheduleCacheMock).not.toHaveBeenCalled();
		expect((globalThis as any).window.dispatchEvent).toHaveBeenCalledTimes(1);
		const [event] = (globalThis as any).window.dispatchEvent.mock.calls[0];
		expect(event.type).toBe(IR_DATA_UPDATED_EVENT);
		expect(event.detail).toEqual(detail);
	});
});
