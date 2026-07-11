import type { Card } from "../../data/types";
import { CardType } from "../../data/types";
import type { DocumentQuizItem, DocumentQuizSession } from "../../types/document-quiz-types";
import type { QuestionBankModeConfig, QuestionTestStats, TestMode } from "../../types/question-bank-types";
import { buildStagingBankId } from "../ai/card-staging-card-builder";
import { generateId } from "../../utils/helpers";
import { DocumentQuizStatsStorage } from "./DocumentQuizStatsStorage";

const DOC_QUIZ_CARD_UUID_PREFIX = "weave-docquiz-";

export function buildDocumentQuizBankId(sessionId: string): string {
	return buildStagingBankId(`docquiz-${sessionId}`);
}

export function buildDocumentQuizCardUuid(sessionId: string, index: number): string {
	return `${DOC_QUIZ_CARD_UUID_PREFIX}${sessionId}-${index}`;
}

export function isDocumentQuizCardUuid(uuid: string | undefined | null): boolean {
	return typeof uuid === "string" && uuid.startsWith(DOC_QUIZ_CARD_UUID_PREFIX);
}

function emptyTestStats(): QuestionTestStats {
	const now = new Date().toISOString();
	return {
		totalAttempts: 0,
		correctAttempts: 0,
		incorrectAttempts: 0,
		accuracy: 0,
		bestScore: 0,
		averageScore: 0,
		lastScore: 0,
		averageResponseTime: 0,
		fastestTime: 0,
		lastTestDate: now,
		isInErrorBook: false,
		consecutiveCorrect: 0,
	};
}

export async function buildDocumentQuizCards(options: {
	sessionId: string;
	filePath: string;
	items: DocumentQuizItem[];
	statsStorage: DocumentQuizStatsStorage;
}): Promise<Card[]> {
	const { sessionId, filePath, items, statsStorage } = options;
	const bankId = buildDocumentQuizBankId(sessionId);
	const now = new Date().toISOString();

	const cards: Card[] = [];
	for (const item of items) {
		let testStats = emptyTestStats();
		if (item.blockId) {
			const existing = await statsStorage.getStats(filePath, item.blockId);
			if (existing) {
				testStats = existing;
			}
		}

		cards.push({
			id: generateId(),
			uuid: buildDocumentQuizCardUuid(sessionId, item.index),
			deckId: bankId,
			type: CardType.Basic,
			cardPurpose: "test",
			content: item.content,
			sourceFile: filePath,
			sourceBlock: item.blockId,
			stats: {
				totalReviews: 0,
				totalTime: 0,
				averageTime: 0,
				testStats,
			},
			created: now,
			modified: now,
			metadata: {
				documentQuizItemIndex: item.index,
			},
		});
	}

	return cards;
}

export class DocumentQuizSessionService {
	private readonly sessions = new Map<string, DocumentQuizSession>();

	createSession(
		input: {
			filePath: string;
			fileName: string;
			items: DocumentQuizItem[];
			cards: Card[];
			mode: TestMode;
			config?: QuestionBankModeConfig;
		},
		sessionId?: string
	): DocumentQuizSession {
		const id = sessionId ?? generateId();
		const session: DocumentQuizSession = {
			id,
			filePath: input.filePath,
			fileName: input.fileName,
			items: input.items,
			cards: input.cards,
			mode: input.mode,
			config: input.config,
		};
		this.sessions.set(id, session);
		return session;
	}

	getSession(sessionId: string): DocumentQuizSession | undefined {
		return this.sessions.get(sessionId);
	}

	findItemByCardUuid(sessionId: string, cardUuid: string): DocumentQuizItem | undefined {
		const session = this.getSession(sessionId);
		if (!session) return undefined;
		const card = session.cards.find((c) => c.uuid === cardUuid);
		if (!card) return undefined;
		const index = card.metadata?.documentQuizItemIndex;
		if (typeof index !== "number") return undefined;
		return session.items.find((item) => item.index === index);
	}

	clearSession(sessionId: string): void {
		this.sessions.delete(sessionId);
	}
}

let sessionServiceSingleton: DocumentQuizSessionService | null = null;

export function getDocumentQuizSessionService(): DocumentQuizSessionService {
	if (!sessionServiceSingleton) {
		sessionServiceSingleton = new DocumentQuizSessionService();
	}
	return sessionServiceSingleton;
}
