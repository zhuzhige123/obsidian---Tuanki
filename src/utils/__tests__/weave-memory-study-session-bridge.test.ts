import { describe, expect, it, vi } from "vitest";
import { syncWeaveMemoryStudySessionBroadcast, WEAVE_STUDY_VIEW_TYPE } from "../weave-memory-study-session-bridge";

describe("weave-memory-study-session-bridge", () => {
	it("broadcasts whether weave study leaves are open", () => {
		const events: Array<{ active: boolean }> = [];
		const listener = (event: Event) => {
			const detail = (event as CustomEvent<{ active: boolean }>).detail;
			events.push(detail);
		};
		window.addEventListener("Weave:memory-study-session", listener);

		const getLeavesOfType = vi.fn(() => [{ id: "leaf-1" }]);
		const app = {
			workspace: { getLeavesOfType },
		} as unknown as import("obsidian").App;

		syncWeaveMemoryStudySessionBroadcast(app);

		window.removeEventListener("Weave:memory-study-session", listener);
		expect(getLeavesOfType).toHaveBeenCalledWith(WEAVE_STUDY_VIEW_TYPE);
		expect(events.at(-1)).toEqual({ active: true });
	});
});
