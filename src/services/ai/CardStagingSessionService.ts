import type { WeavePlugin } from "../../main";
import type { Card } from "../../data/types";
import type {
	CardStagingCommitResult,
	CardStagingItem,
	CardStagingSession,
	CardStagingSessionSummary,
	CreateCardStagingSessionParams,
} from "../../types/card-staging-types";
import { CardConverter } from "./CardConverter";
import { saveMemoryCard } from "../weave-domain";
import {
	buildStagingPreviewCard,
	filterPreviewItemsForStudyMode,
} from "./card-staging-card-builder";
import { generateId } from "../../utils/helpers";
import { logger } from "../../utils/logger";
import { i18n } from "../../utils/i18n";

function normalizeTagList(tags: string[] | undefined): string[] {
	return Array.from(
		new Set((tags ?? []).map((tag) => String(tag || "").trim().replace(/^#+/, "")).filter(Boolean))
	);
}

function mergeTagLists(baseTags: string[] | undefined, importTags: string[] | undefined): string[] {
	return normalizeTagList([...(baseTags ?? []), ...(importTags ?? [])]);
}

export class CardStagingSessionService {
	private sessions = new Map<string, CardStagingSession>();
	private activeSessionId: string | null = null;
	private persistHandler: ((session: CardStagingSession) => Promise<void>) | null = null;

	setPersistHandler(handler: ((session: CardStagingSession) => Promise<void>) | null): void {
		this.persistHandler = handler;
	}

	createSession(params: CreateCardStagingSessionParams): CardStagingSession {
		const sessionId = generateId();
		const filteredItems = filterPreviewItemsForStudyMode(params.items, params.studyMode);
		const stagingItems: CardStagingItem[] = filteredItems.map((item, index) => ({
			id: `${sessionId}-item-${index}`,
			previewItemId: item.id,
			generatedCard: item.generatedCard,
			previewCard: buildStagingPreviewCard(item, index, sessionId),
			status: "pending",
		}));

		const session: CardStagingSession = {
			id: sessionId,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			sourceFilePath: params.sourceFilePath,
			sourceFileName: params.sourceFileName,
			studyMode: params.studyMode,
			targetDeckId: params.targetDeckId,
			targetDeckName: params.targetDeckName,
			targetQuestionBankId: params.targetQuestionBankId,
			targetQuestionBankName: params.targetQuestionBankName,
			generationConfig: params.generationConfig,
			importAutoTags: normalizeTagList(params.importAutoTags),
			items: stagingItems,
			currentIndex: 0,
			viewMode: params.viewMode ?? "preview",
		};

		this.sessions.set(sessionId, session);
		this.activeSessionId = sessionId;
		void this.persistActiveSession(session);
		return session;
	}

	getSession(sessionId: string): CardStagingSession | null {
		return this.sessions.get(sessionId) ?? null;
	}

	getActiveSession(): CardStagingSession | null {
		if (!this.activeSessionId) return null;
		return this.sessions.get(this.activeSessionId) ?? null;
	}

	setActiveSession(sessionId: string | null): void {
		this.activeSessionId = sessionId;
	}

	restoreSession(session: CardStagingSession): void {
		this.sessions.set(session.id, session);
		this.activeSessionId = session.id;
	}

	getSummary(sessionId: string): CardStagingSessionSummary | null {
		const session = this.getSession(sessionId);
		if (!session) return null;

		const keptCount = session.items.filter((item) => item.status === "kept").length;
		const discardedCount = session.items.filter((item) => item.status === "discarded").length;
		const pendingCount = session.items.filter((item) => item.status === "pending").length;

		return {
			sessionId: session.id,
			totalCount: session.items.length,
			pendingCount,
			keptCount,
			discardedCount,
			sourceFileName: session.sourceFileName,
			studyMode: session.studyMode,
		};
	}

	getPendingCards(sessionId: string): Card[] {
		const session = this.getSession(sessionId);
		if (!session) return [];
		return session.items.filter((item) => item.status === "pending").map((item) => item.previewCard);
	}

	reopenKeptItemsForStudy(sessionId: string): Card[] {
		const session = this.getSession(sessionId);
		if (!session) return [];

		const cards: Card[] = [];
		for (const item of session.items) {
			if (item.status !== "kept") continue;
			item.status = "pending";
			cards.push(item.previewCard);
		}

		if (cards.length > 0) {
			session.updatedAt = new Date().toISOString();
			void this.persistActiveSession(session);
		}

		return cards;
	}

	getKeptItems(sessionId: string): CardStagingItem[] {
		const session = this.getSession(sessionId);
		if (!session) return [];
		return session.items.filter((item) => item.status === "kept");
	}

	findItemByCardUuid(sessionId: string, cardUuid: string): CardStagingItem | null {
		const session = this.getSession(sessionId);
		if (!session) return null;
		return session.items.find((item) => item.previewCard.uuid === cardUuid) ?? null;
	}

	keepItem(sessionId: string, itemId: string): CardStagingSession | null {
		return this.updateItemStatus(sessionId, itemId, "kept");
	}

	markItemReviewed(sessionId: string, itemId: string, reviewedCard: Card): CardStagingSession | null {
		const session = this.getSession(sessionId);
		if (!session) return null;

		const item = session.items.find((entry) => entry.id === itemId);
		if (!item) return null;

		item.status = "kept";
		this.applyPreviewCardUpdate(item, reviewedCard, session);
		session.updatedAt = new Date().toISOString();
		void this.persistActiveSession(session);
		return session;
	}

	updateItemPreviewCard(sessionId: string, itemId: string, updatedCard: Card): CardStagingSession | null {
		const session = this.getSession(sessionId);
		if (!session) return null;

		const item = session.items.find((entry) => entry.id === itemId);
		if (!item) return null;

		this.applyPreviewCardUpdate(item, updatedCard, session, { syncGeneratedContent: true });
		session.updatedAt = new Date().toISOString();
		void this.persistActiveSession(session);
		return session;
	}

	discardItem(sessionId: string, itemId: string): CardStagingSession | null {
		return this.updateItemStatus(sessionId, itemId, "discarded");
	}

	setViewMode(sessionId: string, viewMode: CardStagingSession["viewMode"]): CardStagingSession | null {
		const session = this.getSession(sessionId);
		if (!session) return null;
		session.viewMode = viewMode;
		session.updatedAt = new Date().toISOString();
		void this.persistActiveSession(session);
		return session;
	}

	isSessionComplete(sessionId: string): boolean {
		const session = this.getSession(sessionId);
		if (!session) return true;
		return session.items.every((item) => item.status !== "pending");
	}

	async commitSession(
		plugin: WeavePlugin,
		sessionId: string,
		options?: { targetQuestionBankId?: string }
	): Promise<CardStagingCommitResult> {
		const session = this.getSession(sessionId);
		if (!session) {
			throw new Error(i18n.t("aiAssistant.staging.errors.sessionMissing"));
		}

		const keptItems = this.getKeptItems(sessionId);
		if (keptItems.length === 0) {
			throw new Error(i18n.t("aiAssistant.staging.errors.noKeptCards"));
		}

		const fsrs = plugin.fsrs;
		if (!fsrs) {
			throw new Error(i18n.t("aiAssistant.staging.errors.fsrsNotReady"));
		}

		const converted = CardConverter.convertBatch(
			keptItems.map((item) => ({
				...item.generatedCard,
				tags: mergeTagLists(item.generatedCard.tags, session.importAutoTags),
				metadata: { ...item.generatedCard.metadata },
			})),
			session.targetDeckId,
			session.sourceFilePath ?? undefined,
			session.generationConfig.templates,
			fsrs,
			session.targetDeckName
		);

		let importedCount = 0;
		const savedCardUuids: string[] = [];
		for (let index = 0; index < converted.cards.length; index += 1) {
			const card = converted.cards[index];
			const previewCard = keptItems[index]?.previewCard;
			if (previewCard?.fsrs) {
				card.fsrs = { ...previewCard.fsrs };
			}
			if (previewCard?.stats) {
				card.stats = { ...previewCard.stats };
			}
			if (previewCard?.reviewHistory) {
				card.reviewHistory = [...previewCard.reviewHistory];
			}
			await saveMemoryCard(plugin, card, "create");
			if (card.uuid) {
				savedCardUuids.push(card.uuid);
			}
			importedCount += 1;
		}

		let targetQuestionBankId = session.targetQuestionBankId;
		let targetQuestionBankName = session.targetQuestionBankName;
		if (session.studyMode === "exam") {
			const selectedBankId =
				options?.targetQuestionBankId?.trim() || session.targetQuestionBankId?.trim();
			if (!selectedBankId) {
				throw new Error(i18n.t("aiAssistant.staging.selectQuestionBankFirst"));
			}

			const questionBankService = plugin.questionBankService;
			if (!questionBankService) {
				throw new Error(i18n.t("aiAssistant.staging.errors.questionBankServiceNotReady"));
			}

			await questionBankService.getAllBanks();
			const bank = questionBankService.getQuestionBank(selectedBankId);
			if (!bank) {
				throw new Error(i18n.t("aiAssistant.staging.errors.questionBankNotFound"));
			}

			await questionBankService.addQuestionRefs(selectedBankId, savedCardUuids);
			targetQuestionBankId = bank.id;
			targetQuestionBankName = bank.name;
		}

		this.sessions.delete(sessionId);
		if (this.activeSessionId === sessionId) {
			this.activeSessionId = null;
		}
		await plugin.clearCardStagingSession();

		return {
			sessionId,
			importedCount,
			failedCount: converted.errors.length,
			selectedCount: keptItems.length,
			targetDeckId: session.targetDeckId,
			targetDeckName: session.targetDeckName,
			targetQuestionBankId,
			targetQuestionBankName,
			importedItemIds: keptItems.map((item) => item.previewItemId),
		};
	}

	clearSession(sessionId: string): void {
		this.sessions.delete(sessionId);
		if (this.activeSessionId === sessionId) {
			this.activeSessionId = null;
		}
	}

	private applyPreviewCardUpdate(
		item: CardStagingItem,
		updatedCard: Card,
		session: CardStagingSession,
		options?: { syncGeneratedContent?: boolean }
	): void {
		item.previewCard = {
			...item.previewCard,
			...updatedCard,
			uuid: item.previewCard.uuid,
			deckId: session.targetDeckId,
			fsrs: updatedCard.fsrs ? { ...updatedCard.fsrs } : item.previewCard.fsrs,
			stats: updatedCard.stats ? { ...updatedCard.stats } : item.previewCard.stats,
			reviewHistory: updatedCard.reviewHistory
				? [...updatedCard.reviewHistory]
				: item.previewCard.reviewHistory,
		};

		if (options?.syncGeneratedContent && updatedCard.content) {
			item.generatedCard = {
				...item.generatedCard,
				content: updatedCard.content,
			};
		}
	}

	private updateItemStatus(
		sessionId: string,
		itemId: string,
		status: CardStagingItem["status"]
	): CardStagingSession | null {
		const session = this.getSession(sessionId);
		if (!session) return null;

		const item = session.items.find((entry) => entry.id === itemId);
		if (!item) return null;

		item.status = status;
		session.updatedAt = new Date().toISOString();
		void this.persistActiveSession(session);
		return session;
	}

	private async persistActiveSession(session: CardStagingSession): Promise<void> {
		if (!this.persistHandler) return;
		try {
			await this.persistHandler(session);
		} catch (error) {
			logger.debug("[CardStagingSessionService] 暂存会话持久化失败:", error);
		}
	}
}

let sharedCardStagingSessionService: CardStagingSessionService | null = null;

export function getCardStagingSessionService(): CardStagingSessionService {
	if (!sharedCardStagingSessionService) {
		sharedCardStagingSessionService = new CardStagingSessionService();
	}
	return sharedCardStagingSessionService;
}
