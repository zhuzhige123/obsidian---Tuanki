import { generateBlockId } from "../../utils/helpers";
import type { DocumentQuizItem } from "../../types/document-quiz-types";
import { DOC_QUIZ_BLOCK_ID_PREFIX, DOC_QUIZ_STATS_COMMENT_PREFIX } from "./document-quiz-constants";
import type { DocumentQuizStatsCommentV1 } from "../../types/document-quiz-types";

const STATS_LINE_REGEX = /^\s*<!--\s*weave-test-stats:[\s\S]*?-->\s*$/;
const BLOCK_ID_ONLY_LINE_REGEX = /^\s*\^([a-zA-Z0-9_-]+)\s*$/;

export function createDocumentQuizBlockId(): string {
	return `${DOC_QUIZ_BLOCK_ID_PREFIX}${generateBlockId()}`;
}

/**
 * 在题目块中确保存在正文行块 ID（不在 HTML 注释内）。
 */
export function ensureBlockIdInQuestionSlice(slice: string, existingBlockId?: string): {
	blockId: string;
	updatedSlice: string;
} {
	const blockId = existingBlockId ?? createDocumentQuizBlockId();
	if (existingBlockId && slice.includes(`^${existingBlockId}`)) {
		return { blockId, updatedSlice: slice };
	}

	const withoutStats = slice
		.split("\n")
		.filter((line) => !STATS_LINE_REGEX.test(line.trim()))
		.join("\n")
		.trimEnd();

	const lines = withoutStats.split("\n");
	let insertAt = lines.length - 1;
	while (insertAt >= 0 && lines[insertAt].trim() === "") {
		insertAt--;
	}

	if (insertAt < 0) {
		return {
			blockId,
			updatedSlice: `^${blockId}\n`,
		};
	}

	const targetLine = lines[insertAt];
	if (BLOCK_ID_ONLY_LINE_REGEX.test(targetLine.trim())) {
		lines[insertAt] = `^${blockId}`;
	} else if (/\^([a-zA-Z0-9_-]+)\s*$/.test(targetLine)) {
		lines[insertAt] = targetLine.replace(/\^([a-zA-Z0-9_-]+)\s*$/, `^${blockId}`);
	} else if (targetLine.trim().length > 0) {
		lines[insertAt] = `${targetLine.replace(/\s+$/, "")} ^${blockId}`;
	} else {
		lines.splice(insertAt + 1, 0, `^${blockId}`);
	}

	return {
		blockId,
		updatedSlice: `${lines.join("\n")}\n`,
	};
}

export function buildStatsCommentLine(payload: Record<string, unknown> | DocumentQuizStatsCommentV1): string {
	return `${DOC_QUIZ_STATS_COMMENT_PREFIX} ${JSON.stringify(payload)} -->`;
}

export function upsertStatsCommentAfterBlockId(
	fullContent: string,
	blockId: string,
	statsCommentLine: string
): string {
	const blockLineRegex = new RegExp(`^(.*\\^${escapeRegExp(blockId)}\\s*)$`, "m");
	const match = fullContent.match(blockLineRegex);
	if (!match || match.index === undefined) {
		return fullContent;
	}

	const lineEnd = match.index + match[0].length;
	const afterBlockLine = fullContent.slice(lineEnd);
	const statsRegex = /^\s*\n?\s*<!--\s*weave-test-stats:[\s\S]*?-->\s*/;
	if (statsRegex.test(afterBlockLine)) {
		const replacedTail = afterBlockLine.replace(statsRegex, `\n${statsCommentLine}\n`);
		return fullContent.slice(0, lineEnd) + replacedTail;
	}

	return `${fullContent.slice(0, lineEnd)}\n${statsCommentLine}\n${fullContent.slice(lineEnd)}`;
}

export function patchQuestionSliceInBody(
	bodyContent: string,
	bodyOffsetStart: number,
	bodyOffsetEnd: number,
	newSlice: string
): string {
	return bodyContent.slice(0, bodyOffsetStart) + newSlice + bodyContent.slice(bodyOffsetEnd);
}

/** 从题块文本中提取已有的 weave-test-stats 注释行（若有） */
export function extractStatsCommentLine(slice: string): string | undefined {
	for (const line of slice.split("\n")) {
		if (STATS_LINE_REGEX.test(line.trim())) {
			return line.trim();
		}
	}
	return undefined;
}

/** 按块 ID 或解析偏移定位单题在正文中的范围（含 ^blockId 行，不含统计注释） */
export function findQuestionSliceRangeInBody(
	bodyContent: string,
	options: { blockId?: string; bodyOffsetStart?: number; bodyOffsetEnd?: number }
): { start: number; end: number } | null {
	const { blockId, bodyOffsetStart, bodyOffsetEnd } = options;

	if (blockId) {
		const blockLineRegex = new RegExp(`^.*\\^${escapeRegExp(blockId)}\\s*$`, "m");
		const match = blockLineRegex.exec(bodyContent);
		if (match?.index !== undefined) {
			const blockLineEnd = match.index + match[0].length;
			const start = findQuestionSegmentStart(bodyContent, match.index);
			return { start, end: blockLineEnd };
		}
	}

	if (typeof bodyOffsetStart === "number" && typeof bodyOffsetEnd === "number") {
		return { start: bodyOffsetStart, end: bodyOffsetEnd };
	}

	return null;
}

/** 内容写回后，按长度差平移后续题目的正文偏移 */
export function shiftDocumentQuizItemOffsets(
	items: DocumentQuizItem[],
	changedIndex: number,
	patchStart: number,
	oldLength: number,
	newLength: number
): void {
	const delta = newLength - oldLength;
	if (delta === 0) {
		return;
	}
	const patchEnd = patchStart + oldLength;
	for (const item of items) {
		if (item.index === changedIndex) {
			item.bodyOffsetStart = patchStart;
			item.bodyOffsetEnd = patchStart + newLength;
			continue;
		}
		if (item.bodyOffsetStart >= patchEnd) {
			item.bodyOffsetStart += delta;
			item.bodyOffsetEnd += delta;
		}
	}
}

function findQuestionSegmentStart(bodyContent: string, blockLineStart: number): number {
	const before = bodyContent.slice(0, blockLineStart);

	let lastHeading = -1;
	const headingRe = /^##\s+.+$/gm;
	let match: RegExpExecArray | null;
	while ((match = headingRe.exec(before)) !== null) {
		lastHeading = match.index;
	}
	if (lastHeading >= 0) {
		return lastHeading;
	}

	let lastHrEnd = -1;
	const hrRe = /^---\s*$/gm;
	while ((match = hrRe.exec(before)) !== null) {
		lastHrEnd = match.index + match[0].length;
		if (before[lastHrEnd] === "\n") {
			lastHrEnd += 1;
		}
	}
	if (lastHrEnd >= 0) {
		return lastHrEnd;
	}

	const delimiter = "<->";
	const lastDelimiter = before.lastIndexOf(delimiter);
	if (lastDelimiter >= 0) {
		let start = lastDelimiter + delimiter.length;
		if (before[start] === "\r") {
			start += 1;
		}
		if (before[start] === "\n") {
			start += 1;
		}
		return start;
	}

	return 0;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
