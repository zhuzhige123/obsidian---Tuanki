import type { App, TFile } from "obsidian";
import type {
	DocumentQuizItem,
	DocumentQuizStatsCommentV1,
	DocumentQuizWriteBackResult,
} from "../../types/document-quiz-types";
import type { QuestionTestStats, TestMode } from "../../types/question-bank-types";
import { extractBodyContent } from "../../utils/yaml-utils";
import {
	buildStatsCommentLine,
	ensureBlockIdInQuestionSlice,
	patchQuestionSliceInBody,
	upsertStatsCommentAfterBlockId,
} from "./DocumentQuizBlockIdWriter";
import { DocumentQuizStatsStorage } from "./DocumentQuizStatsStorage";

export class DocumentQuizStatsWriter {
	private readonly storage: DocumentQuizStatsStorage;

	constructor(private readonly app: App) {
		this.storage = new DocumentQuizStatsStorage(app);
	}

	async recordAttempt(options: {
		file: TFile;
		item: DocumentQuizItem;
		isCorrect: boolean;
		mode: TestMode;
	}): Promise<DocumentQuizWriteBackResult> {
		const { file, item, isCorrect, mode } = options;

		try {
			let fullContent = await this.app.vault.read(file);
			let bodyContent = extractBodyContent(fullContent);
			const frontmatterPrefix = fullContent.slice(0, fullContent.length - bodyContent.length);

			let blockId = item.blockId;

			if (blockId && fullContent.includes(`^${blockId}`)) {
				// 已有块 ID：仅更新统计注释
				const existingStats =
					(await this.storage.getStats(file.path, blockId)) ?? createEmptyTestStats();
				const nextStats = mergeAttempt(existingStats, isCorrect);
				const commentPayload = buildCommentPayload(nextStats, mode);
				const patchedBody = upsertStatsCommentAfterBlockId(
					bodyContent,
					blockId,
					buildStatsCommentLine(commentPayload)
				);
				await this.app.vault.modify(file, frontmatterPrefix + patchedBody);
				await this.storage.saveStats(file.path, blockId, nextStats);
				return { blockId, success: true };
			}

			const originalSlice = bodyContent.slice(item.bodyOffsetStart, item.bodyOffsetEnd);
			const ensured = ensureBlockIdInQuestionSlice(originalSlice, item.blockId);
			blockId = ensured.blockId;

			const existingStats =
				(await this.storage.getStats(file.path, blockId)) ?? createEmptyTestStats();
			const nextStats = mergeAttempt(existingStats, isCorrect);
			const commentPayload = buildCommentPayload(nextStats, mode);

			let patchedBody = patchQuestionSliceInBody(
				bodyContent,
				item.bodyOffsetStart,
				item.bodyOffsetEnd,
				ensured.updatedSlice.trimEnd() + "\n"
			);

			patchedBody = upsertStatsCommentAfterBlockId(
				patchedBody,
				blockId,
				buildStatsCommentLine(commentPayload)
			);

			await this.app.vault.modify(file, frontmatterPrefix + patchedBody);
			await this.storage.saveStats(file.path, blockId, nextStats);

			item.blockId = blockId;

			return { blockId, success: true };
		} catch (error) {
			return {
				blockId: item.blockId ?? "unknown",
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async writeBackFromReviewedCard(
		file: TFile,
		item: DocumentQuizItem,
		isCorrect: boolean,
		mode: TestMode
	): Promise<DocumentQuizWriteBackResult> {
		return this.recordAttempt({ file, item, isCorrect, mode });
	}
}

function mergeAttempt(stats: QuestionTestStats, isCorrect: boolean): QuestionTestStats {
	const totalAttempts = stats.totalAttempts + 1;
	const correctAttempts = stats.correctAttempts + (isCorrect ? 1 : 0);
	const incorrectAttempts = totalAttempts - correctAttempts;
	const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;
	const consecutiveCorrect = isCorrect ? (stats.consecutiveCorrect ?? 0) + 1 : 0;

	return {
		...stats,
		totalAttempts,
		correctAttempts,
		incorrectAttempts,
		accuracy,
		lastScore: isCorrect ? 100 : 0,
		bestScore: Math.max(stats.bestScore ?? 0, isCorrect ? 100 : 0),
		lastTestDate: new Date().toISOString(),
		consecutiveCorrect,
		isInErrorBook: !isCorrect ? true : stats.isInErrorBook ?? false,
	};
}

function createEmptyTestStats(): QuestionTestStats {
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

function buildCommentPayload(
	stats: QuestionTestStats,
	mode: TestMode
): DocumentQuizStatsCommentV1 {
	return {
		v: 1,
		attempts: stats.totalAttempts,
		correct: stats.correctAttempts,
		accuracy: stats.accuracy,
		lastAt: stats.lastTestDate,
		lastMode: mode,
	};
}
