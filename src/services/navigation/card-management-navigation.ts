export type CardManagementExternalTargetView = "table" | "grid" | "kanban";

export interface CardManagementFilterByCardsRequest {
	requestId: string;
	cardIds: string[];
	filterName: string;
	parentCardPreview?: string;
	replaceExisting?: boolean;
	targetView?: CardManagementExternalTargetView;
	selectCards?: boolean;
	scrollToCard?: boolean;
}

declare global {
	interface Window {
		__weavePendingCardManagementFilterByCards?: CardManagementFilterByCardsRequest | null;
	}
}

function normalizeCardIds(cardIds: unknown): string[] {
	if (!Array.isArray(cardIds)) {
		return [];
	}

	return Array.from(
		new Set(
			cardIds
				.map((cardId) => String(cardId || "").trim())
				.filter(Boolean)
		)
	);
}

export function normalizeCardManagementFilterByCardsRequest(
	request: Partial<CardManagementFilterByCardsRequest> | null | undefined
): CardManagementFilterByCardsRequest | null {
	if (!request || typeof request !== "object") {
		return null;
	}

	const cardIds = normalizeCardIds(request.cardIds);
	if (cardIds.length === 0) {
		return null;
	}

	const requestId = String(request.requestId || "").trim();
	if (!requestId) {
		return null;
	}

	const targetView =
		request.targetView === "table" || request.targetView === "grid" || request.targetView === "kanban"
			? request.targetView
			: undefined;

	const filterName = String(request.filterName || "").trim() || "卡片筛选";
	const parentCardPreview = String(request.parentCardPreview || "").trim() || undefined;

	return {
		requestId,
		cardIds,
		filterName,
		...(parentCardPreview ? { parentCardPreview } : {}),
		...(targetView ? { targetView } : {}),
		replaceExisting: request.replaceExisting ?? true,
		selectCards: request.selectCards ?? false,
		scrollToCard: request.scrollToCard ?? false,
	};
}

export function setPendingCardManagementFilterByCardsRequest(
	request: Partial<CardManagementFilterByCardsRequest> | null | undefined
): CardManagementFilterByCardsRequest | null {
	const normalized = normalizeCardManagementFilterByCardsRequest(request);
	if (typeof window === "undefined") {
		return normalized;
	}

	window.__weavePendingCardManagementFilterByCards = normalized;
	return normalized;
}

export function consumePendingCardManagementFilterByCardsRequest(): CardManagementFilterByCardsRequest | null {
	if (typeof window === "undefined") {
		return null;
	}

	const pending = normalizeCardManagementFilterByCardsRequest(
		window.__weavePendingCardManagementFilterByCards
	);
	window.__weavePendingCardManagementFilterByCards = null;
	return pending;
}

export function clearPendingCardManagementFilterByCardsRequest(requestId?: string | null): void {
	if (typeof window === "undefined") {
		return;
	}

	if (!requestId) {
		window.__weavePendingCardManagementFilterByCards = null;
		return;
	}

	const pending = normalizeCardManagementFilterByCardsRequest(
		window.__weavePendingCardManagementFilterByCards
	);
	if (!pending || pending.requestId === requestId) {
		window.__weavePendingCardManagementFilterByCards = null;
	}
}

export function dispatchCardManagementFilterByCards(
	request: Partial<CardManagementFilterByCardsRequest> | null | undefined
): CardManagementFilterByCardsRequest | null {
	const normalized = setPendingCardManagementFilterByCardsRequest(request);
	if (!normalized || typeof window === "undefined") {
		return normalized;
	}

	window.dispatchEvent(
		new CustomEvent("Weave:filter-by-cards", {
			detail: normalized,
		})
	);
	return normalized;
}
