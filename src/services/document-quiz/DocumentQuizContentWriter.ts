import type { App, TFile } from "obsidian";
import type { DocumentQuizItem, DocumentQuizWriteBackResult } from "../../types/document-quiz-types";
import { extractBodyContent } from "../../utils/yaml-utils";
import {
	ensureBlockIdInQuestionSlice,
	extractStatsCommentLine,
	findQuestionSliceRangeInBody,
	patchQuestionSliceInBody,
	shiftDocumentQuizItemOffsets,
	upsertStatsCommentAfterBlockId,
} from "./DocumentQuizBlockIdWriter";

const STATS_LINE_REGEX = /^\s*<!--\s*weave-test-stats:/;

function normalizeEditedQuizContent(content: string): string {
	return content
		.split("\n")
		.filter((line) => !STATS_LINE_REGEX.test(line.trim()))
		.join("\n")
		.trimEnd();
}

export class DocumentQuizContentWriter {
	constructor(private readonly app: App) {}

	async writeBackFromEditedCard(
		file: TFile,
		item: DocumentQuizItem,
		editedContent: string,
		allItems?: DocumentQuizItem[]
	): Promise<DocumentQuizWriteBackResult> {
		try {
			const normalizedContent = normalizeEditedQuizContent(editedContent);
			if (!normalizedContent.trim()) {
				return {
					blockId: item.blockId ?? "unknown",
					success: false,
					error: "empty content",
				};
			}

			const fullContent = await this.app.vault.read(file);
			const bodyContent = extractBodyContent(fullContent);
			const frontmatterPrefix = fullContent.slice(0, fullContent.length - bodyContent.length);

			const range = findQuestionSliceRangeInBody(bodyContent, {
				blockId: item.blockId,
				bodyOffsetStart: item.bodyOffsetStart,
				bodyOffsetEnd: item.bodyOffsetEnd,
			});

			if (!range) {
				return {
					blockId: item.blockId ?? "unknown",
					success: false,
					error: "question slice not found",
				};
			}

			const originalSlice = bodyContent.slice(range.start, range.end);
			const existingStatsLine = extractStatsCommentLine(originalSlice);

			const ensured = ensureBlockIdInQuestionSlice(normalizedContent, item.blockId);
			const blockId = ensured.blockId;
			const newSlice = `${ensured.updatedSlice.trimEnd()}\n`;
			const oldLength = range.end - range.start;

			let patchedBody = patchQuestionSliceInBody(
				bodyContent,
				range.start,
				range.end,
				newSlice
			);

			if (existingStatsLine) {
				patchedBody = upsertStatsCommentAfterBlockId(
					patchedBody,
					blockId,
					existingStatsLine
				);
			}

			await this.app.vault.modify(file, frontmatterPrefix + patchedBody);

			item.blockId = blockId;
			item.content = normalizedContent;
			shiftDocumentQuizItemOffsets(allItems ?? [item], item.index, range.start, oldLength, newSlice.length);

			return { blockId, success: true };
		} catch (error) {
			return {
				blockId: item.blockId ?? "unknown",
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
