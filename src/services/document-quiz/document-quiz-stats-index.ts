import type { TestMode } from "../../types/question-bank-types";
import type { DocumentQuizStatsCommentV1 } from "../../types/document-quiz-types";
import { findDocumentQuizStatsCommentMatches } from "./document-quiz-stats-comment-locator";

export interface DocumentQuizInlineStatsSnapshot {
	blockId: string;
	attempts: number;
	correct: number;
	accuracy: number;
	lastAt?: string;
	lastMode?: TestMode;
}

/** 从正文索引所有「块 ID 行 + weave-test-stats 注释」 */
export function indexDocumentQuizStatsComments(
	bodyContent: string
): Map<string, DocumentQuizInlineStatsSnapshot> {
	const indexed = new Map<string, DocumentQuizInlineStatsSnapshot>();

	for (const match of findDocumentQuizStatsCommentMatches(bodyContent)) {
		indexed.set(match.blockId, match.snapshot);
	}

	return indexed;
}

export function inlineSnapshotToCommentV1(
	snapshot: DocumentQuizInlineStatsSnapshot
): DocumentQuizStatsCommentV1 {
	return {
		v: 1,
		attempts: snapshot.attempts,
		correct: snapshot.correct,
		accuracy: snapshot.accuracy,
		lastAt: snapshot.lastAt ?? new Date(0).toISOString(),
		lastMode: snapshot.lastMode,
	};
}
