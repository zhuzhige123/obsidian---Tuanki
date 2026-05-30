import { describe, expect, it } from "vitest";
import {
	DECK_STUDY_VIEW_MODE,
	normalizeDeckStudyViewMode,
	resolveDeckStudyViewByLocation,
	resolveDeckStudyViewMode,
} from "../deck-study-view-by-location";

describe("deck-study-view-by-location", () => {
	it("always resolves deck study to kanban view", () => {
		expect(resolveDeckStudyViewMode()).toBe("kanban");
		expect(DECK_STUDY_VIEW_MODE).toBe("kanban");
		expect(normalizeDeckStudyViewMode("grid", false)).toBe("kanban");
		expect(resolveDeckStudyViewByLocation({ autoEnabled: true, surfaceContext: "sidebar" })).toBe(
			"kanban"
		);
	});
});
