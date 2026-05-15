import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedStudySession } from "../types/study-types";
import { StudySessionManager } from "./StudySessionManager";

function createPersistedSession(deckId: string, sessionId: string): PersistedStudySession {
	return {
		sessionId,
		deckId,
		deckName: deckId,
		mode: "normal",
		currentCardIndex: 2,
		currentCardId: `${deckId}-card-3`,
		remainingCardIds: [`${deckId}-card-3`, `${deckId}-card-4`],
		queueState: {
			currentCardIndex: 2,
			studyQueueCardIds: [`${deckId}-card-1`, `${deckId}-card-2`, `${deckId}-card-3`],
			sessionStudiedCardIds: [`${deckId}-card-1`, `${deckId}-card-2`],
		},
		startTime: 1000,
		pauseTime: 2000,
		stats: {
			completed: 2,
			correct: 2,
			incorrect: 0,
		},
		isPaused: true,
		sessionType: "mixed",
	};
}

describe("StudySessionManager persisted sessions", () => {
	let manager: StudySessionManager;

	beforeEach(() => {
		manager = StudySessionManager.getInstance();
		(manager as any).sessions.clear();
		manager.clearPersistedSession();
		(manager as any).activePersistedDeckId = null;
	});

	afterEach(() => {
		StudySessionManager.destroyInstance();
		vi.restoreAllMocks();
	});

	it("stores paused sessions per deck instead of overwriting them", () => {
		manager.setPersistedSession(createPersistedSession("deck-a", "session-a"));
		manager.setPersistedSession(createPersistedSession("deck-b", "session-b"));

		expect(manager.getPersistedSession("deck-a")?.sessionId).toBe("session-a");
		expect(manager.getPersistedSession("deck-b")?.sessionId).toBe("session-b");
		expect(manager.getPersistedSession()?.sessionId).toBe("session-b");

		const store = manager.getPersistedSessionStore();
		expect(store?.activeDeckId).toBe("deck-b");
		expect(store?.sessionsByDeckId["deck-a"]?.sessionId).toBe("session-a");
		expect(store?.sessionsByDeckId["deck-b"]?.sessionId).toBe("session-b");
	});

	it("restoring one deck keeps other paused deck sessions intact", () => {
		const sessionA = createPersistedSession("deck-a", "session-a");
		manager.setPersistedSession(sessionA);
		manager.setPersistedSession(createPersistedSession("deck-b", "session-b"));

		manager.restoreSession(sessionA);

		expect(manager.getPersistedSession("deck-a")).toBeNull();
		expect(manager.getPersistedSession("deck-b")?.sessionId).toBe("session-b");
	});

	it("destroyInstance stops cleanup timer and resets singleton", () => {
		const stopAutoCleanupSpy = vi.spyOn(manager, "stopAutoCleanup");

		StudySessionManager.destroyInstance();

		expect(stopAutoCleanupSpy).toHaveBeenCalledTimes(1);
		expect((StudySessionManager as any).instance).toBeNull();
	});
});
