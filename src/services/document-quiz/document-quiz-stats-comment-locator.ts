import { parseStatsCommentJson } from "./DocumentQuizStatsStorage";
import type { DocumentQuizInlineStatsSnapshot } from "./document-quiz-stats-index";

export const DOC_QUIZ_STATS_COMMENT_BODY_REGEX = /<!--\s*weave-test-stats:\s*([\s\S]*?)\s*-->/g;

const BLOCK_LINE_REGEX = /^.*\^([a-zA-Z0-9_-]+)\s*$/gm;

export interface DocumentQuizStatsCommentMatch {
	from: number;
	to: number;
	blockId: string;
	snapshot: DocumentQuizInlineStatsSnapshot;
}

export function findDocumentQuizStatsCommentMatches(text: string): DocumentQuizStatsCommentMatch[] {
	const matches: DocumentQuizStatsCommentMatch[] = [];
	const pattern = new RegExp(DOC_QUIZ_STATS_COMMENT_BODY_REGEX.source, "g");

	let match: RegExpExecArray | null = pattern.exec(text);
	while (match !== null) {
		const rawJson = match[1]?.trim();
		const snapshot = parseStatsCommentSnapshot(rawJson, match.index, text);
		if (snapshot) {
			matches.push({
				from: match.index,
				to: match.index + match[0].length,
				blockId: snapshot.blockId,
				snapshot,
			});
		}
		match = pattern.exec(text);
	}

	return matches;
}

function parseStatsCommentSnapshot(
	rawJson: string | undefined,
	commentStart: number,
	text: string
): DocumentQuizInlineStatsSnapshot | null {
	if (!rawJson) {
		return null;
	}
	const json = parseStatsCommentJson(rawJson);
	if (!json) {
		return null;
	}

	const attempts = typeof json.attempts === "number" ? json.attempts : 0;
	const correct = typeof json.correct === "number" ? json.correct : 0;
	if (attempts <= 0) {
		return null;
	}

	const blockId = findBlockIdBeforeIndex(text, commentStart);
	if (!blockId) {
		return null;
	}

	return {
		blockId,
		attempts,
		correct,
		accuracy:
			typeof json.accuracy === "number"
				? json.accuracy
				: attempts > 0
					? correct / attempts
					: 0,
		lastAt: typeof json.lastAt === "string" ? json.lastAt : undefined,
		lastMode: typeof json.lastMode === "string" ? (json.lastMode as DocumentQuizInlineStatsSnapshot["lastMode"]) : undefined,
	};
}

export function findBlockIdBeforeIndex(text: string, index: number): string | undefined {
	const before = text.slice(0, index);
	let lastBlockId: string | undefined;

	BLOCK_LINE_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null = BLOCK_LINE_REGEX.exec(before);
	while (match !== null) {
		lastBlockId = match[1]?.trim() || lastBlockId;
		match = BLOCK_LINE_REGEX.exec(before);
	}

	return lastBlockId;
}

export function extractBlockIdFromHref(href: string): string | undefined {
	const decoded = decodeURIComponent(href.trim());
	const hashIndex = decoded.lastIndexOf("#");
	if (hashIndex < 0) {
		return undefined;
	}
	const hash = decoded.slice(hashIndex);
	const match = hash.match(/#\^([a-zA-Z0-9_-]+)$/);
	return match?.[1];
}
