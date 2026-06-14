import type { FSRS } from "../../algorithms/fsrs";
import type { StudySession } from "../../data/study-types";
import { CardState, CardType, Rating, type Card } from "../../data/types";
import { createMemoryStudySessionController } from "./memory-study-session-controller";

function createCard(overrides: Partial<Card> = {}): Card {
	return {
		uuid: overrides.uuid || "card-1",
		deckId: overrides.deckId || "deck-a",
		type: overrides.type || CardType.Basic,
		content: overrides.content || "Front\n---div---\nBack",
		created: overrides.created || "2026-04-01T00:00:00.000Z",
		modified: overrides.modified || "2026-04-01T00:00:00.000Z",
		tags: overrides.tags || [],
		stats: overrides.stats || {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
			memoryRate: 0,
		},
		fsrs: overrides.fsrs || {
			due: "2026-04-01T10:00:00.000Z",
			stability: 3,
			difficulty: 5,
			elapsedDays: 1,
			scheduledDays: 1,
			reps: 0,
			lapses: 0,
			state: CardState.New,
			retrievability: 0.9,
		},
		...overrides,
	} as Card;
}

function createSession(deckId = "deck-a"): StudySession {
	return {
		id: "session-1",
		deckId,
		startTime: new Date("2026-04-01T09:00:00.000Z"),
		cardsReviewed: 0,
		newCardsLearned: 0,
		correctAnswers: 0,
		totalTime: 0,
		cardReviews: [],
	};
}

describe("createMemoryStudySessionController", () => {
	it("reinserts learning-step cards into the current study queue after rating", async () => {
		const queue = [createCard({ uuid: "current" }), createCard({ uuid: "later" })];
		let showAnswer = true;
		let currentCardIndex = 0;
		let cardStartTime = Date.now() - 5000;
		const session = createSession();
		const sessionStudiedCards = new Set<string>();
		const persistRatedCard = vi.fn(async () => undefined);
		const finishSession = vi.fn(async () => undefined);

		const controller = createMemoryStudySessionController({
			getFsrs: () => ({
				review: () => ({
					card: {
						...queue[0].fsrs,
						state: CardState.Learning,
						due: new Date(Date.now() + 60_000).toISOString(),
					},
					log: { rating: Rating.Again },
				}),
			}) as unknown as FSRS,
			getMode: () => "normal",
			state: {
				getCurrentCard: () => queue[currentCardIndex],
				getShowAnswer: () => showAnswer,
				setShowAnswer: (value) => {
					showAnswer = value;
				},
				getCurrentCardIndex: () => currentCardIndex,
				setCurrentCardIndex: (value) => {
					currentCardIndex = value;
				},
				getCardStartTime: () => cardStartTime,
				setCardStartTime: (value) => {
					cardStartTime = value;
				},
				getStudyQueue: () => queue,
				setStudyQueue: (nextQueue) => {
					queue.splice(0, queue.length, ...nextQueue);
				},
				getSession: () => session,
				getSessionStudiedCards: () => sessionStudiedCards,
			},
			getLearningConfigForCard: () => ({
				learningSteps: [1, 10],
				relearningSteps: [10],
			}),
			applyLearningScheduling: () => undefined,
			updateReviewStats: () => undefined,
			persistRatedCard,
			setSessionCompletionStatus: (reason, pendingNextDueAt) => {
				session.completionReason = reason;
				session.pendingNextDueAt = pendingNextDueAt;
			},
			onFinishSession: finishSession,
		});

		await controller.rateCurrentCard(Rating.Again);

		expect(persistRatedCard).toHaveBeenCalledTimes(1);
		expect(queue.map((card) => card.uuid)).toEqual(["current", "later", "current"]);
		expect(currentCardIndex).toBe(1);
		expect(showAnswer).toBe(false);
		expect(session.cardsReviewed).toBe(1);
		expect(session.newCardsLearned).toBe(1);
		expect(sessionStudiedCards.has("current")).toBe(true);
		expect(finishSession).not.toHaveBeenCalled();
	});

	it("continues within the fixed queue in normal mode when only pending cards remain", async () => {
		const queue = [
			createCard({
				uuid: "current",
				fsrs: {
					due: "2026-04-01T09:00:00.000Z",
					stability: 3,
					difficulty: 5,
					elapsedDays: 1,
					scheduledDays: 1,
					reps: 1,
					lapses: 0,
					state: CardState.Review,
					retrievability: 0.9,
				},
			}),
			createCard({
				uuid: "future",
				fsrs: {
					due: "2099-04-01T09:00:00.000Z",
					stability: 4,
					difficulty: 5,
					elapsedDays: 1,
					scheduledDays: 1,
					reps: 2,
					lapses: 0,
					state: CardState.Review,
					retrievability: 0.9,
				},
			}),
		];
		let showAnswer = false;
		let currentCardIndex = 0;
		let cardStartTime = Date.now();
		const session = createSession();
		const sessionStudiedCards = new Set<string>();
		const finishSession = vi.fn(async () => undefined);

		const controller = createMemoryStudySessionController({
			getFsrs: () => ({} as FSRS),
			getMode: () => "normal",
			state: {
				getCurrentCard: () => queue[currentCardIndex],
				getShowAnswer: () => showAnswer,
				setShowAnswer: (value) => {
					showAnswer = value;
				},
				getCurrentCardIndex: () => currentCardIndex,
				setCurrentCardIndex: (value) => {
					currentCardIndex = value;
				},
				getCardStartTime: () => cardStartTime,
				setCardStartTime: (value) => {
					cardStartTime = value;
				},
				getStudyQueue: () => queue,
				setStudyQueue: (nextQueue) => {
					queue.splice(0, queue.length, ...nextQueue);
				},
				getSession: () => session,
				getSessionStudiedCards: () => sessionStudiedCards,
			},
			getLearningConfigForCard: () => ({ learningSteps: [], relearningSteps: [] }),
			applyLearningScheduling: () => undefined,
			updateReviewStats: () => undefined,
			persistRatedCard: async () => undefined,
			setSessionCompletionStatus: (reason, pendingNextDueAt) => {
				session.completionReason = reason;
				session.pendingNextDueAt = pendingNextDueAt;
			},
			onFinishSession: finishSession,
		});

		await controller.nextCard();

		expect(currentCardIndex).toBe(1);
		expect(showAnswer).toBe(false);
		expect(session.completionReason).toBeUndefined();
		expect(finishSession).not.toHaveBeenCalled();
	});

	it("finishes the session with persisted completion metadata", async () => {
		const queue = [createCard({ uuid: "current" })];
		let showAnswer = false;
		let currentCardIndex = 0;
		let cardStartTime = Date.now();
		const session = createSession();
		const sessionStudiedCards = new Set<string>();
		const finishSession = vi.fn(async () => undefined);

		const controller = createMemoryStudySessionController({
			getFsrs: () => ({} as FSRS),
			getMode: () => "normal",
			state: {
				getCurrentCard: () => queue[currentCardIndex],
				getShowAnswer: () => showAnswer,
				setShowAnswer: (value) => {
					showAnswer = value;
				},
				getCurrentCardIndex: () => currentCardIndex,
				setCurrentCardIndex: (value) => {
					currentCardIndex = value;
				},
				getCardStartTime: () => cardStartTime,
				setCardStartTime: (value) => {
					cardStartTime = value;
				},
				getStudyQueue: () => queue,
				setStudyQueue: (nextQueue) => {
					queue.splice(0, queue.length, ...nextQueue);
				},
				getSession: () => session,
				getSessionStudiedCards: () => sessionStudiedCards,
			},
			getLearningConfigForCard: () => ({ learningSteps: [], relearningSteps: [] }),
			applyLearningScheduling: () => undefined,
			updateReviewStats: () => undefined,
			persistRatedCard: async () => undefined,
			setSessionCompletionStatus: (reason, pendingNextDueAt) => {
				session.completionReason = reason;
				session.pendingNextDueAt = pendingNextDueAt;
			},
			onFinishSession: finishSession,
		});

		await controller.finishSession();

		expect(session.completionReason).toBe("completed");
		expect(session.endTime).toBeInstanceOf(Date);
		expect(session.totalTime).toBeGreaterThanOrEqual(0);
		expect(finishSession).toHaveBeenCalledWith(session);
	});

	it("uses getResponseTimeMs when rating a card", async () => {
		const queue = [createCard({ uuid: "current" })];
		let showAnswer = true;
		let currentCardIndex = 0;
		const session = createSession();
		const sessionStudiedCards = new Set<string>();
		const saveReviewSnapshot = vi.fn();
		const updateReviewStats = vi.fn();

		const controller = createMemoryStudySessionController({
			getFsrs: () => ({
				review: () => ({
					card: {
						...queue[0].fsrs,
						state: CardState.Review,
						due: new Date(Date.now() + 86_400_000).toISOString(),
					},
					log: { rating: Rating.Good },
				}),
			}) as unknown as FSRS,
			getMode: () => "normal",
			state: {
				getCurrentCard: () => queue[currentCardIndex],
				getShowAnswer: () => showAnswer,
				setShowAnswer: (value) => {
					showAnswer = value;
				},
				getCurrentCardIndex: () => currentCardIndex,
				setCurrentCardIndex: (value) => {
					currentCardIndex = value;
				},
				getCardStartTime: () => Date.now() - 120_000,
				setCardStartTime: () => undefined,
				getResponseTimeMs: () => 45_000,
				getStudyQueue: () => queue,
				setStudyQueue: (nextQueue) => {
					queue.splice(0, queue.length, ...nextQueue);
				},
				getSession: () => session,
				getSessionStudiedCards: () => sessionStudiedCards,
			},
			getLearningConfigForCard: () => ({ learningSteps: [], relearningSteps: [] }),
			applyLearningScheduling: () => undefined,
			saveReviewSnapshot,
			updateReviewStats,
			persistRatedCard: async () => undefined,
			setSessionCompletionStatus: () => undefined,
			onFinishSession: async () => undefined,
		});

		await controller.rateCurrentCard(Rating.Good);

		expect(saveReviewSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ responseTime: 45_000 })
		);
		expect(updateReviewStats).toHaveBeenCalledWith(
			queue[0],
			Rating.Good,
			45_000
		);
	});

	it("exports authoritative queue/session snapshots for persistence", () => {
		const queue = [createCard({ uuid: "card-a" }), createCard({ uuid: "card-b" })];
		let showAnswer = false;
		let currentCardIndex = 1;
		let cardStartTime = Date.now();
		const session = createSession();
		session.cardsReviewed = 3;
		session.correctAnswers = 2;
		session.newCardsLearned = 1;
		const sessionStudiedCards = new Set<string>(["card-a"]);

		const controller = createMemoryStudySessionController({
			getFsrs: () => ({} as FSRS),
			getMode: () => "normal",
			state: {
				getCurrentCard: () => queue[currentCardIndex],
				getShowAnswer: () => showAnswer,
				setShowAnswer: (value) => {
					showAnswer = value;
				},
				getCurrentCardIndex: () => currentCardIndex,
				setCurrentCardIndex: (value) => {
					currentCardIndex = value;
				},
				getCardStartTime: () => cardStartTime,
				setCardStartTime: (value) => {
					cardStartTime = value;
				},
				getStudyQueue: () => queue,
				setStudyQueue: (nextQueue) => {
					queue.splice(0, queue.length, ...nextQueue);
				},
				getQueueInitialized: () => true,
				getSession: () => session,
				getSessionStudiedCards: () => sessionStudiedCards,
			},
			getLearningConfigForCard: () => ({ learningSteps: [], relearningSteps: [] }),
			applyLearningScheduling: () => undefined,
			updateReviewStats: () => undefined,
			persistRatedCard: async () => undefined,
			setSessionCompletionStatus: (reason, pendingNextDueAt) => {
				session.completionReason = reason;
				session.pendingNextDueAt = pendingNextDueAt;
			},
			onFinishSession: async () => undefined,
		});

		expect(controller.getQueueProgress()).toEqual({
			currentCardIndex: 1,
			studyQueueCardIds: ["card-a", "card-b"],
			sessionStudiedCardIds: ["card-a"],
		});
		expect(controller.getSessionSnapshot()).toEqual({
			deckId: "deck-a",
			currentCardIndex: 1,
			remainingCardIds: ["card-b"],
			stats: {
				completed: 3,
				correct: 2,
				incorrect: 1,
			},
			sessionType: "mixed",
		});
		expect(controller.shouldPersist()).toBe(true);
	});
});
