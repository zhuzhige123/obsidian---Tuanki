import type { FSRS } from "../../algorithms/fsrs";
import type { StudySession } from "../../data/study-types";
import { CardState, Rating, type Card } from "../../data/types";
import type { StudyQueueState, StudySessionSnapshot } from "../../types/study-types";
import { getSessionQueueInsertionPlan, requeueFutureDueCards } from "../../utils/learning-steps/sessionQueueScheduling";
import { logger } from "../../utils/logger";

export interface MemoryStudyLearningConfig {
	learningSteps: number[];
	relearningSteps: number[];
}

export interface MemoryStudySessionStateBridge {
	getCurrentCard: () => Card | undefined;
	getShowAnswer: () => boolean;
	setShowAnswer: (value: boolean) => void;
	getCurrentCardIndex: () => number;
	setCurrentCardIndex: (value: number) => void;
	getCardStartTime: () => number;
	setCardStartTime: (value: number) => void;
	getStudyQueue: () => Card[];
	setStudyQueue: (queue: Card[]) => void;
	getQueueInitialized?: () => boolean;
	getSession: () => StudySession;
	getSessionStudiedCards: () => Set<string>;
	setTimerPaused?: (value: boolean) => void;
}

export interface SaveReviewSnapshotArgs {
	card: Card;
	rating: Rating;
	responseTime: number;
	currentCardIndex: number;
	session: StudySession;
}

export interface AfterCardPersistedArgs {
	card: Card;
	rating: Rating;
	responseTime: number;
	prevState: CardState;
	log: unknown;
	session: StudySession;
}

export interface AdvanceStudyCardArgs {
	movedCount: number;
	nextIndex: number;
	nextPendingDueAt: string | null;
}

export interface CreateMemoryStudySessionControllerOptions {
	getFsrs: () => FSRS;
	getMode?: () => "normal" | "advance" | undefined;
	state: MemoryStudySessionStateBridge;
	getLearningConfigForCard: (card: Card) => MemoryStudyLearningConfig;
	applyLearningScheduling: (
		prevState: CardState,
		rating: Rating,
		updatedFsrsCard: Card["fsrs"],
		card: Card
	) => void;
	saveReviewSnapshot?: (args: SaveReviewSnapshotArgs) => void;
	updateReviewStats: (card: Card, rating: Rating, responseTime: number) => void;
	persistRatedCard: (card: Card) => Promise<void>;
	afterCardPersisted?: (args: AfterCardPersistedArgs) => Promise<void> | void;
	onInvalidFsrs?: () => void;
	onBeforeAdvance?: () => Promise<void> | void;
	onAfterAdvance?: (args: AdvanceStudyCardArgs) => Promise<void> | void;
	setSessionCompletionStatus: (
		reason: "completed" | "paused-until-next-due",
		pendingNextDueAt?: string
	) => void;
	onFinishSession: (session: StudySession) => Promise<void> | void;
}

function ensureCardStats(card: Card): void {
	if (!card.stats) {
		card.stats = {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
			memoryRate: 0,
		};
	}
}

function ensureCardReviewHistory(card: Card): void {
	if (!card.reviewHistory) {
		card.reviewHistory = [];
	}
}

function ensureSessionCardReviews(session: StudySession): void {
	if (!session.cardReviews) {
		session.cardReviews = [];
	}
}

function resolveSessionType(session: StudySession): "review" | "new" | "learning" | "mixed" {
	if (session.newCardsLearned > 0 && session.cardsReviewed > session.newCardsLearned) {
		return "mixed";
	}
	if (session.newCardsLearned > 0) {
		return "new";
	}
	return "mixed";
}

export function createMemoryStudySessionController(options: CreateMemoryStudySessionControllerOptions) {
	function isQueueInitialized(): boolean {
		return options.state.getQueueInitialized?.() ?? options.state.getStudyQueue().length > 0;
	}

	function getQueueProgress(): StudyQueueState | null {
		const studyQueue = options.state.getStudyQueue();
		if (!isQueueInitialized() || studyQueue.length === 0) {
			return null;
		}

		return {
			currentCardIndex: options.state.getCurrentCardIndex(),
			studyQueueCardIds: studyQueue.map((card) => card.uuid),
			sessionStudiedCardIds: Array.from(options.state.getSessionStudiedCards()),
		};
	}

	function getSessionSnapshot(): StudySessionSnapshot {
		const session = options.state.getSession();
		const currentCardIndex = options.state.getCurrentCardIndex();
		const studyQueue = options.state.getStudyQueue();

		return {
			deckId: session.deckId,
			currentCardIndex,
			remainingCardIds: studyQueue.slice(currentCardIndex).map((card) => card.uuid),
			stats: {
				completed: session.cardsReviewed,
				correct: session.correctAnswers,
				incorrect: Math.max(0, session.cardsReviewed - session.correctAnswers),
			},
			sessionType: resolveSessionType(session),
		};
	}

	function shouldPersist(): boolean {
		const snapshot = getSessionSnapshot();
		return snapshot.remainingCardIds.length > 0 && snapshot.stats.completed > 0;
	}

	async function handleLearningStepsInsertion(
		card: Card,
		rating: Rating,
		prevState: CardState
	): Promise<void> {
		const memoryScheduling = options.getLearningConfigForCard(card);
		const queueInsertionPlan = getSessionQueueInsertionPlan(prevState, rating, memoryScheduling);
		let shouldInsert = queueInsertionPlan.shouldInsert;
		let insertOffset = queueInsertionPlan.insertOffset;

		if (shouldInsert && prevState === CardState.New && rating <= Rating.Hard) {
			insertOffset = rating === Rating.Again ? 1 : 3;
		} else if (shouldInsert && prevState === CardState.Learning && rating === Rating.Again) {
			insertOffset = 1;
		} else if (shouldInsert && prevState === CardState.Review && rating === Rating.Again) {
			insertOffset = 2;
		}

		if (!shouldInsert) {
			return;
		}

		const currentQueue = options.state.getStudyQueue();
		if (currentQueue.length === 0) {
			return;
		}

		const currentPos = options.state.getCurrentCardIndex();
		const insertPos = Math.min(currentPos + insertOffset, currentQueue.length);
		currentQueue.splice(insertPos, 0, card);
	}

	async function finishSession(): Promise<void> {
		const session = options.state.getSession();
		if (!session.completionReason) {
			options.setSessionCompletionStatus("completed");
		}

		session.endTime = new Date();
		session.totalTime = Math.max(
			0,
			Math.round((session.endTime.getTime() - session.startTime.getTime()) / 1000)
		);
		await options.onFinishSession(session);
	}

	async function nextCard(): Promise<void> {
		await options.onBeforeAdvance?.();

		const studyQueue = options.state.getStudyQueue();
		if (!Array.isArray(studyQueue) || studyQueue.length === 0) {
			logger.warn("nextCard: No study queue available");
			await finishSession();
			return;
		}

		const currentCardIndex = options.state.getCurrentCardIndex();
		if (currentCardIndex >= studyQueue.length - 1) {
			logger.debug("[StudyModal] Reached end of study queue, finishing session");
			await finishSession();
			return;
		}

		const { nextIndex, movedCount, nextPendingDueAt } = requeueFutureDueCards(
			studyQueue,
			currentCardIndex,
			Date.now(),
			{
				allowFutureDueCards: options.getMode?.() === "advance",
				continueWithPendingCards: options.getMode?.() !== "advance",
			}
		);

		if (movedCount > 0) {
			options.state.setStudyQueue([...studyQueue]);
		}

		if (nextIndex >= 0 && nextIndex < studyQueue.length) {
			options.state.setCurrentCardIndex(nextIndex);
			options.state.setShowAnswer(false);
			options.state.setCardStartTime(Date.now());
			options.state.setTimerPaused?.(false);
			await options.onAfterAdvance?.({ movedCount, nextIndex, nextPendingDueAt });
			return;
		}

		if (nextPendingDueAt) {
			options.setSessionCompletionStatus("paused-until-next-due", nextPendingDueAt);
		} else {
			options.setSessionCompletionStatus("completed");
			logger.warn("nextCard: Invalid next index", nextIndex, "queueLength:", studyQueue.length);
		}

		await finishSession();
	}

	async function rateCurrentCard(rating: Rating): Promise<void> {
		const cardToRate = options.state.getCurrentCard();
		if (!cardToRate || !options.state.getShowAnswer()) {
			return;
		}

		if (!cardToRate.fsrs) {
			options.onInvalidFsrs?.();
			return;
		}

		const currentCardIndex = options.state.getCurrentCardIndex();
		const session = options.state.getSession();
		const responseTime = Date.now() - options.state.getCardStartTime();

		options.saveReviewSnapshot?.({
			card: cardToRate,
			rating,
			responseTime,
			currentCardIndex,
			session,
		});

		const prevState = cardToRate.fsrs.state;
		const { card: updatedCard, log } = options.getFsrs().review(cardToRate.fsrs, rating);
		options.applyLearningScheduling(prevState, rating, updatedCard, cardToRate);
		cardToRate.fsrs = updatedCard;

		ensureCardReviewHistory(cardToRate);
		const reviewHistory = cardToRate.reviewHistory ?? [];
		reviewHistory.push(log);
		cardToRate.reviewHistory = reviewHistory;
		ensureCardStats(cardToRate);
		cardToRate.stats.totalReviews++;
		const responseSeconds = Math.max(0, Math.round(responseTime / 1000));
		cardToRate.stats.totalTime += responseSeconds;
		cardToRate.stats.averageTime =
			cardToRate.stats.totalReviews > 0
				? cardToRate.stats.totalTime / cardToRate.stats.totalReviews
				: 0;

		options.updateReviewStats(cardToRate, rating, responseTime);

		ensureSessionCardReviews(session);
		session.cardReviews.push({
			cardId: cardToRate.uuid,
			rating,
			responseTime,
			timestamp: new Date(),
		});
		session.cardsReviewed++;
		if (prevState === CardState.New) {
			session.newCardsLearned++;
		}
		if (rating >= 3) {
			session.correctAnswers++;
		}
		options.state.getSessionStudiedCards().add(cardToRate.uuid);

		try {
			await options.persistRatedCard(cardToRate);
			await options.afterCardPersisted?.({
				card: cardToRate,
				rating,
				responseTime,
				prevState,
				log,
				session,
			});
			await handleLearningStepsInsertion(cardToRate, rating, prevState);
			options.state.setStudyQueue([...options.state.getStudyQueue()]);
		} catch (error) {
			logger.error("保存卡片失败", error);
		}

		await nextCard();
	}

	return {
		rateCurrentCard,
		handleLearningStepsInsertion,
		nextCard,
		finishSession,
		getQueueProgress,
		getSessionSnapshot,
		shouldPersist,
	};
}
