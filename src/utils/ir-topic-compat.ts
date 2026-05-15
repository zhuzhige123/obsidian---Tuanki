import type { ReadingMaterial } from "../types/incremental-reading-types";
import type { IRChunkFileData, IRDeck, IRSession, IRStudySession } from "../types/ir-types";

export const IR_LEGACY_TOPICS_FILE = "topics.json";
export const IR_LEGACY_DECKS_FILE = "decks.json";
export const READING_TOPIC_YAML_KEY = "weave-reading-topic-id";
export const READING_LEGACY_DECK_YAML_KEY = "weave-reading-ir-deck-id";

function normalizeString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const normalized = value.trim();
	return normalized || undefined;
}

function normalizeStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((item) => normalizeString(item))
			.filter((item): item is string => Boolean(item));
	}

	const single = normalizeString(value);
	return single ? [single] : [];
}

function normalizeDueAtValue(value: unknown): string | undefined {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			return undefined;
		}
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	return normalizeString(value);
}

function getLegacyReadingMaterialDueAt(
	material: Partial<ReadingMaterial> | Record<string, unknown> | null | undefined
): string | undefined {
	const fsrs = (material as Record<string, unknown> | null | undefined)?.fsrs;
	if (!fsrs || typeof fsrs !== "object") {
		return undefined;
	}

	return normalizeDueAtValue((fsrs as Record<string, unknown>).due);
}

export function getReadingMaterialDueAt(
	material: Partial<ReadingMaterial> | Record<string, unknown> | null | undefined
): string | undefined {
	return (
		normalizeDueAtValue((material as Record<string, unknown> | null | undefined)?.nextDueAt) ||
		getLegacyReadingMaterialDueAt(material)
	);
}

export function setReadingMaterialDueAt<T extends Partial<ReadingMaterial>>(
	material: T,
	dueAt: string | number | Date | null | undefined
): T {
	const normalizedDueAt = normalizeDueAtValue(dueAt);
	const updated = { ...material } as Record<string, unknown>;
	updated.nextDueAt = normalizedDueAt;

	const fsrs = updated.fsrs;
	if (fsrs && typeof fsrs === "object") {
		updated.fsrs = {
			...(fsrs as Record<string, unknown>),
			due: normalizedDueAt,
		};
	}

	return updated as T;
}

export function getReadingTopicId(
	material: Partial<ReadingMaterial> | Record<string, unknown> | null | undefined
): string | undefined {
	return (
		normalizeString((material as Record<string, unknown> | null | undefined)?.topicId) ||
		normalizeString((material as Record<string, unknown> | null | undefined)?.readingDeckId)
	);
}

export function extractReadingTopicIdFromFrontmatter(
	frontmatter: Record<string, unknown> | null | undefined
): string | undefined {
	return (
		normalizeString(frontmatter?.[READING_TOPIC_YAML_KEY]) ||
		normalizeString(frontmatter?.[READING_LEGACY_DECK_YAML_KEY])
	);
}

export function normalizeReadingMaterialForRuntime<T extends Partial<ReadingMaterial>>(
	material: T
): T {
	const topicId = getReadingTopicId(material);
	const dueAt = getReadingMaterialDueAt(material);
	const normalized = { ...material } as Record<string, unknown>;

	if (topicId) {
		normalized.topicId = topicId;
		normalized.readingDeckId = topicId;
	}

	if (dueAt) {
		normalized.nextDueAt = dueAt;
	}

	const fsrs = normalized.fsrs;
	if (fsrs && typeof fsrs === "object" && dueAt) {
		normalized.fsrs = {
			...(fsrs as Record<string, unknown>),
			due: dueAt,
		};
	}

	return normalized as T;
}

export function serializeReadingMaterialForStorage<T extends Partial<ReadingMaterial>>(
	material: T
): T {
	const topicId = getReadingTopicId(material);
	const dueAt = getReadingMaterialDueAt(material);
	const serialized = { ...material } as Record<string, unknown>;

	if (topicId) {
		serialized.topicId = topicId;
	} else {
		serialized.topicId = undefined;
	}

	if (dueAt) {
		serialized.nextDueAt = dueAt;
	} else {
		serialized.nextDueAt = undefined;
	}

	const fsrs = serialized.fsrs;
	if (fsrs && typeof fsrs === "object") {
		serialized.fsrs = {
			...(fsrs as Record<string, unknown>),
			due: dueAt,
		};
	}

	serialized.readingDeckId = undefined;
	return serialized as T;
}

export function getTaskTopicId(
	task: { topicId?: string; deckId?: string } | Record<string, unknown> | null | undefined
): string | undefined {
	return (
		normalizeString((task as Record<string, unknown> | null | undefined)?.topicId) ||
		normalizeString((task as Record<string, unknown> | null | undefined)?.deckId)
	);
}

export function normalizeBookmarkTaskForRuntime<T extends { topicId?: string; deckId?: string }>(
	task: T
): T {
	const topicId = getTaskTopicId(task);
	if (!topicId) {
		return { ...task } as T;
	}

	return {
		...task,
		topicId,
		deckId: topicId,
	} as T;
}

export function serializeBookmarkTaskForStorage<T extends { topicId?: string; deckId?: string }>(
	task: T
): T {
	const topicId = getTaskTopicId(task);
	const serialized = { ...task } as Record<string, unknown>;

	if (topicId) {
		serialized.topicId = topicId;
	} else {
		serialized.topicId = undefined;
	}

	serialized.deckId = undefined;
	return serialized as T;
}

export function getChunkTopicIds(
	chunk: Partial<IRChunkFileData> | Record<string, unknown> | null | undefined
): string[] {
	const topicIds = normalizeStringArray(
		(chunk as Record<string, unknown> | null | undefined)?.topicIds
	);
	if (topicIds.length > 0) {
		return topicIds;
	}

	return normalizeStringArray((chunk as Record<string, unknown> | null | undefined)?.deckIds);
}

export function getChunkTopicTag(
	chunk: Partial<IRChunkFileData> | Record<string, unknown> | null | undefined
): string | undefined {
	return (
		normalizeString((chunk as Record<string, unknown> | null | undefined)?.topicTag) ||
		normalizeString((chunk as Record<string, unknown> | null | undefined)?.deckTag)
	);
}

export function normalizeChunkForRuntime<T extends Partial<IRChunkFileData>>(chunk: T): T {
	const topicIds = getChunkTopicIds(chunk);
	const topicTag = getChunkTopicTag(chunk);
	const normalized = { ...chunk } as Record<string, unknown>;

	if (topicIds.length > 0) {
		normalized.topicIds = [...topicIds];
		normalized.deckIds = [...topicIds];
	} else {
		normalized.topicIds = undefined;
		normalized.deckIds = undefined;
	}

	if (topicTag) {
		normalized.topicTag = topicTag;
		normalized.deckTag = topicTag;
	} else {
		normalized.topicTag = undefined;
		normalized.deckTag = undefined;
	}

	return normalized as T;
}

export function serializeChunkForStorage<T extends Partial<IRChunkFileData>>(chunk: T): T {
	const topicIds = getChunkTopicIds(chunk);
	const topicTag = getChunkTopicTag(chunk);
	const serialized = { ...chunk } as Record<string, unknown>;

	if (topicIds.length > 0) {
		serialized.topicIds = [...topicIds];
	} else {
		serialized.topicIds = undefined;
	}

	if (topicTag) {
		serialized.topicTag = topicTag;
	} else {
		serialized.topicTag = undefined;
	}

	serialized.deckIds = undefined;
	serialized.deckTag = undefined;
	return serialized as T;
}

function getSessionTopicName(
	session: { topicName?: string; deckName?: string } | Record<string, unknown>
): string | undefined {
	return (
		normalizeString((session as Record<string, unknown>).topicName) ||
		normalizeString((session as Record<string, unknown>).deckName)
	);
}

export function normalizeStudySessionForRuntime<T extends Partial<IRStudySession>>(session: T): T {
	const topicId = getTaskTopicId(session as { topicId?: string; deckId?: string });
	const topicName = getSessionTopicName(session as Record<string, unknown>);
	const normalized = { ...session } as Record<string, unknown>;

	if (topicId) {
		normalized.topicId = topicId;
		normalized.deckId = topicId;
	}

	if (topicName) {
		normalized.topicName = topicName;
		normalized.deckName = topicName;
	}

	return normalized as T;
}

export function serializeStudySessionForStorage<T extends Partial<IRStudySession>>(session: T): T {
	const topicId = getTaskTopicId(session as { topicId?: string; deckId?: string });
	const topicName = getSessionTopicName(session as Record<string, unknown>);
	const serialized = { ...session } as Record<string, unknown>;

	if (topicId) {
		serialized.topicId = topicId;
	} else {
		serialized.topicId = undefined;
	}

	if (topicName) {
		serialized.topicName = topicName;
	} else {
		serialized.topicName = undefined;
	}

	serialized.deckId = undefined;
	serialized.deckName = undefined;
	return serialized as T;
}

export function normalizeIRSessionForRuntime<T extends Partial<IRSession>>(session: T): T {
	const topicId = getTaskTopicId(session as { topicId?: string; deckId?: string });
	if (!topicId) {
		return { ...session } as T;
	}

	return {
		...session,
		topicId,
		deckId: topicId,
	} as T;
}

export function serializeIRSessionForStorage<T extends Partial<IRSession>>(session: T): T {
	const topicId = getTaskTopicId(session as { topicId?: string; deckId?: string });
	const serialized = { ...session } as Record<string, unknown>;

	if (topicId) {
		serialized.topicId = topicId;
	} else {
		serialized.topicId = undefined;
	}

	serialized.deckId = undefined;
	return serialized as T;
}

export function normalizeTopicStoreRecords(raw: unknown): Record<string, IRDeck> {
	if (!raw || typeof raw !== "object") {
		return {};
	}

	const data = raw as Record<string, unknown>;
	if (data.topics && typeof data.topics === "object") {
		return data.topics as Record<string, IRDeck>;
	}

	if (data.decks && typeof data.decks === "object") {
		return data.decks as Record<string, IRDeck>;
	}

	return data as Record<string, IRDeck>;
}

export function buildTopicStore(
	topics: Record<string, IRDeck>,
	version: string
): { version: string; topics: Record<string, IRDeck> } {
	return {
		version,
		topics,
	};
}
