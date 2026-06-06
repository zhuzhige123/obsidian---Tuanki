import { describe, expect, it } from "vitest";
import {
	DECK_STUDY_VIEW_MODE,
	resolveDeckStudyViewMode,
} from "../deck-study-view-by-location";

describe("deck-study-view-by-location", () => {
	it("always resolves deck study to kanban view", () => {
		expect(resolveDeckStudyViewMode()).toBe("kanban");
		expect(DECK_STUDY_VIEW_MODE).toBe("kanban");
	});
});
