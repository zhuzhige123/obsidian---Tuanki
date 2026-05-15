import type { Card } from "../data/types";
import { extractBodyContent } from "./yaml-utils";

export const WEAVE_CARD_REFERENCE_PREFIX = "@_";
export const WEAVE_CARD_REFERENCE_TRIGGER_REGEX = /@_([A-Za-z0-9_-]*)$/;

const WEAVE_CARD_REFERENCE_ALIAS_TERMINATORS = new Set([
	"\t",
	"\n",
	"\v",
	"\f",
	"\r",
	" ",
	",",
	".",
	";",
	":",
	"!",
	"?",
	"，",
	"。",
	"；",
	"：",
	"！",
	"？",
	"、",
	")",
	"]",
	"}",
	">",
	"）",
	"】",
	"》",
	"」",
	"』",
	"〉",
	"〕",
	'"',
	"'",
	"`",
	"|",
]);

export interface WeaveCardReferenceCandidate {
	card: Card;
	label: string;
	preview: string;
}

export interface ParsedWeaveCardReference {
	raw: string;
	uuid: string;
	alias: string | null;
	startIndex: number;
	endIndex: number;
}

export interface WeaveCardReferenceAtPosition extends ParsedWeaveCardReference {
	uuidStartIndex: number;
	uuidEndIndex: number;
	aliasStartIndex: number | null;
	aliasEndIndex: number | null;
}

export interface WeaveCardReferenceTriggerMatch {
	query: string;
	startOffset: number;
}

export interface WeaveCardReferenceSuggestMatch {
	query: string;
	startOffset: number;
	endOffset: number;
}

function normalizeSearchText(value: string | null | undefined): string {
	return String(value || "").trim().toLowerCase();
}

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	if (maxLength <= 1) {
		return value.slice(0, maxLength);
	}
	return `${value.slice(0, maxLength - 1)}…`;
}

function getCardBodyLines(card: Card): string[] {
	return extractBodyContent(card.content || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function getCardTimestamp(card: Card): number {
	const value = Date.parse(card.modified || card.created || "");
	return Number.isFinite(value) ? value : 0;
}

function buildSearchText(card: Card, label: string, preview: string): string {
	return normalizeSearchText([card.uuid, label, preview, card.sourceFile].filter(Boolean).join("\n"));
}

function isWeaveCardReferenceUUIDChar(value: string, isFirstChar: boolean): boolean {
	return isFirstChar ? /[A-Za-z0-9]/.test(value) : /[A-Za-z0-9_-]/.test(value);
}

function isWeaveCardReferenceAliasTerminator(value: string): boolean {
	return !value || WEAVE_CARD_REFERENCE_ALIAS_TERMINATORS.has(value);
}

export function parseWeaveCardReferencesInText(text: string): ParsedWeaveCardReference[] {
	const input = String(text || "");
	const references: ParsedWeaveCardReference[] = [];
	let cursor = 0;

	while (cursor < input.length) {
		const triggerIndex = input.indexOf(WEAVE_CARD_REFERENCE_PREFIX, cursor);
		if (triggerIndex < 0) {
			break;
		}

		let readIndex = triggerIndex + WEAVE_CARD_REFERENCE_PREFIX.length;
		const firstUuidChar = input.charAt(readIndex);
		if (!isWeaveCardReferenceUUIDChar(firstUuidChar, true)) {
			cursor = triggerIndex + WEAVE_CARD_REFERENCE_PREFIX.length;
			continue;
		}

		readIndex += 1;
		while (readIndex < input.length && isWeaveCardReferenceUUIDChar(input.charAt(readIndex), false)) {
			readIndex += 1;
		}

		const uuid = input.slice(triggerIndex + WEAVE_CARD_REFERENCE_PREFIX.length, readIndex);
		let alias: string | null = null;

		if (input.charAt(readIndex) === "|") {
			const aliasStart = readIndex + 1;
			let aliasEnd = aliasStart;

			while (
				aliasEnd < input.length &&
				!isWeaveCardReferenceAliasTerminator(input.charAt(aliasEnd))
			) {
				aliasEnd += 1;
			}

			const normalizedAlias = compactWhitespace(input.slice(aliasStart, aliasEnd));
			if (normalizedAlias) {
				alias = normalizedAlias;
				readIndex = aliasEnd;
			}
		}

		references.push({
			raw: input.slice(triggerIndex, readIndex),
			uuid,
			alias,
			startIndex: triggerIndex,
			endIndex: readIndex,
		});
		cursor = readIndex;
	}

	return references;
}

export function findWeaveCardReferenceAtPosition(
	text: string,
	position: number
): WeaveCardReferenceAtPosition | null {
	const input = String(text || "");
	const normalizedPosition = Number.isFinite(position)
		? Math.max(0, Math.min(input.length, Math.trunc(position)))
		: 0;

	for (const reference of parseWeaveCardReferencesInText(input)) {
		const uuidStartIndex = reference.startIndex + WEAVE_CARD_REFERENCE_PREFIX.length;
		const uuidEndIndex = uuidStartIndex + reference.uuid.length;
		const aliasStartIndex = reference.alias
			? uuidEndIndex + 1
			: null;
		const aliasEndIndex =
			aliasStartIndex !== null && reference.alias
				? aliasStartIndex + reference.alias.length
				: null;

		if (normalizedPosition < reference.startIndex || normalizedPosition > reference.endIndex) {
			continue;
		}

		return {
			...reference,
			uuidStartIndex,
			uuidEndIndex,
			aliasStartIndex,
			aliasEndIndex,
		};
	}

	return null;
}

export function extractWeaveCardReferenceUUIDsFromText(text: string): string[] {
	const unique = new Set<string>();
	for (const match of parseWeaveCardReferencesInText(text)) {
		const uuid = (match.uuid || "").trim();
		if (uuid) {
			unique.add(uuid);
		}
	}
	return Array.from(unique);
}

export function extractWeaveCardReferenceUUIDs(content: string): string[] {
	return extractWeaveCardReferenceUUIDsFromText(extractBodyContent(content || ""));
}

export function getWeaveCardReferenceTriggerMatch(
	textBeforeCursor: string
): WeaveCardReferenceTriggerMatch | null {
	const text = String(textBeforeCursor || "");
	const triggerIndex = text.lastIndexOf(WEAVE_CARD_REFERENCE_PREFIX);
	if (triggerIndex < 0) {
		return null;
	}

	const query = text.slice(triggerIndex + WEAVE_CARD_REFERENCE_PREFIX.length);
	if (/\s/.test(query)) {
		return null;
	}
	if (query.includes("|")) {
		return null;
	}

	return {
		query,
		startOffset: triggerIndex,
	};
}

export function getWeaveCardReferenceSuggestMatch(
	text: string,
	cursorOffset: number
): WeaveCardReferenceSuggestMatch | null {
	const input = String(text || "");
	const normalizedCursorOffset = Number.isFinite(cursorOffset)
		? Math.max(0, Math.min(input.length, Math.trunc(cursorOffset)))
		: 0;

	const existingReference = findWeaveCardReferenceAtPosition(input, normalizedCursorOffset);
	if (
		existingReference &&
		normalizedCursorOffset >= existingReference.uuidStartIndex &&
		normalizedCursorOffset < existingReference.uuidEndIndex
	) {
		return null;
	}

	const typingMatch = getWeaveCardReferenceTriggerMatch(input.slice(0, normalizedCursorOffset));
	if (typingMatch) {
		return {
			query: typingMatch.query,
			startOffset: typingMatch.startOffset,
			endOffset: normalizedCursorOffset,
		};
	}

	return null;
}

export function buildWeaveCardReferenceToken(uuid: string, alias?: string): string {
	const normalized = String(uuid || "").trim();
	if (!normalized) {
		return WEAVE_CARD_REFERENCE_PREFIX;
	}
	const rawUuid = normalized.startsWith(WEAVE_CARD_REFERENCE_PREFIX)
		? normalized.slice(WEAVE_CARD_REFERENCE_PREFIX.length)
		: normalized;
	const aliasSeparatorIndex = rawUuid.indexOf("|");
	const normalizedUuid = aliasSeparatorIndex >= 0 ? rawUuid.slice(0, aliasSeparatorIndex) : rawUuid;
	const token = `${WEAVE_CARD_REFERENCE_PREFIX}${normalizedUuid}`;
	const normalizedAlias = compactWhitespace(String(alias || ""));
	return normalizedAlias ? `${token}|${normalizedAlias}` : token;
}

export function buildWeaveCardReferenceDisplayText(reference: Pick<ParsedWeaveCardReference, "uuid" | "alias">): string {
	const normalizedAlias = compactWhitespace(String(reference.alias || ""));
	return normalizedAlias
		? `${WEAVE_CARD_REFERENCE_PREFIX}${normalizedAlias}`
		: buildWeaveCardReferenceToken(reference.uuid);
}

export function buildWeaveCardReferenceLabel(card: Card, maxLength = 48): string {
	const firstLine = getCardBodyLines(card)[0] || "";
	const normalized = compactWhitespace(firstLine);
	if (!normalized) {
		return truncateText(card.uuid, maxLength);
	}
	return truncateText(normalized, maxLength);
}

export function buildWeaveCardReferencePreview(card: Card, maxLength = 96): string {
	const body = compactWhitespace(extractBodyContent(card.content || ""));
	if (!body) {
		return card.uuid;
	}
	return truncateText(body, maxLength);
}

export function filterWeaveCardReferenceCandidates(
	cards: Card[],
	query: string,
	limit = 20
): WeaveCardReferenceCandidate[] {
	const normalizedQuery = normalizeSearchText(query);
	const decorated = cards.map((card) => {
		const label = buildWeaveCardReferenceLabel(card);
		const preview = buildWeaveCardReferencePreview(card);
		const uuid = normalizeSearchText(card.uuid);
		const searchText = buildSearchText(card, label, preview);
		const score = normalizedQuery
			? uuid === normalizedQuery
				? 0
				: uuid.startsWith(normalizedQuery)
					? 1
					: normalizeSearchText(label).startsWith(normalizedQuery)
						? 2
						: searchText.includes(normalizedQuery)
							? 3
							: Number.POSITIVE_INFINITY
			: 10;
		return {
			card,
			label,
			preview,
			score,
			timestamp: getCardTimestamp(card),
		};
	});

	return decorated
		.filter((item) => item.score !== Number.POSITIVE_INFINITY)
		.sort((left, right) => {
			if (left.score !== right.score) {
				return left.score - right.score;
			}
			if (left.timestamp !== right.timestamp) {
				return right.timestamp - left.timestamp;
			}
			return left.label.localeCompare(right.label, "zh-Hans-CN");
		})
		.slice(0, limit)
		.map(({ card, label, preview }) => ({ card, label, preview }));
}

export function collectWeaveRelatedCardUUIDs(anchorCard: Card, cards: Card[]): string[] {
	const anchorId = String(anchorCard.uuid || "").trim();
	if (!anchorId) {
		return [];
	}

	const cardsByUUID = new Map(cards.map((card) => [card.uuid, card] as const));
	const related = new Set<string>();

	for (const referencedId of extractWeaveCardReferenceUUIDs(anchorCard.content || "")) {
		if (referencedId !== anchorId && cardsByUUID.has(referencedId)) {
			related.add(referencedId);
		}
	}

	for (const card of cards) {
		if (card.uuid === anchorId) {
			continue;
		}
		const references = extractWeaveCardReferenceUUIDs(card.content || "");
		if (references.includes(anchorId)) {
			related.add(card.uuid);
		}
	}

	return Array.from(related);
}
