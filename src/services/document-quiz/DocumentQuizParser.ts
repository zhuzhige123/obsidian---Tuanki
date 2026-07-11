import { parseCardContent } from "../../parsing/card-content-parser";
import type {
	DocumentQuizItem,
	DocumentQuizItemStatus,
	DocumentQuizParseResult,
} from "../../types/document-quiz-types";
import { extractBodyContent } from "../../utils/yaml-utils";
import { isInputClozeQuestionContent } from "../../utils/question-bank/input-cloze-utils";
import { hasClozeSyntax } from "../../utils/cloze-mode";
import {
	DOC_QUIZ_CARD_DELIMITER,
	DOC_QUIZ_REGION_END,
	DOC_QUIZ_REGION_START,
} from "./document-quiz-constants";
import { EnhancedDelimiterDetector } from "../../utils/simplifiedParser/EnhancedDelimiterDetector";
import {
	detectQuestionKind,
	enrichDocumentQuizItem,
} from "./document-quiz-parse-summary";

export interface DocumentQuizParseOptions {
	/** 仅解析选区文本（仍用 filePath 作溯源） */
	selectionText?: string;
}

interface RawSegment {
	text: string;
	start: number;
	end: number;
}

const STATS_LINE_REGEX = /^\s*<!--\s*weave-test-stats:/;
const BLOCK_ID_LINE_REGEX = /(?:^|\s)\^([a-zA-Z0-9_-]+)\s*$/;
const HR_SPLIT_REGEX = /^---\s*$/m;

function cardTypeLabelFromKind(kind: ReturnType<typeof detectQuestionKind>): string {
	switch (kind) {
		case "single_choice":
		case "multiple_choice":
			return "choice";
		case "cloze":
			return "cloze";
		case "qa":
			return "qa";
		default:
			return "markdown";
	}
}

function stripStatsCommentLines(text: string): string {
	return text
		.split("\n")
		.filter((line) => !STATS_LINE_REGEX.test(line))
		.join("\n")
		.trim();
}

function extractBlockIdFromText(text: string): string | undefined {
	const lines = text.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (STATS_LINE_REGEX.test(line) || line.trim().startsWith("<!--")) {
			continue;
		}
		const match = line.match(BLOCK_ID_LINE_REGEX);
		if (match?.[1]) {
			return match[1];
		}
	}
	return undefined;
}

function sliceQuizRegion(body: string): string {
	const startIdx = body.indexOf(DOC_QUIZ_REGION_START);
	if (startIdx < 0) {
		return body;
	}
	const regionStart = startIdx + DOC_QUIZ_REGION_START.length;
	const endIdx = body.indexOf(DOC_QUIZ_REGION_END, regionStart);
	if (endIdx < 0) {
		return body.slice(regionStart).trim();
	}
	return body.slice(regionStart, endIdx).trim();
}

function splitByHeadings(text: string): RawSegment[] {
	const regex = /^##\s+.+$/gm;
	const indices: number[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		indices.push(match.index);
	}

	if (indices.length === 0) {
		return [];
	}

	const segments: RawSegment[] = [];
	for (let i = 0; i < indices.length; i++) {
		const start = indices[i];
		const end = i + 1 < indices.length ? indices[i + 1] : text.length;
		const chunk = text.slice(start, end).trim();
		if (chunk) {
			segments.push({ text: chunk, start, end });
		}
	}
	return segments;
}

function isQuizLikeBlock(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}
	if (trimmed.includes("---div---")) {
		return true;
	}
	if (isInputClozeQuestionContent(trimmed) || hasClozeSyntax(trimmed)) {
		return true;
	}
	if (/[（(]\s*[A-Z,，]+\s*[)）]/.test(trimmed) && /^[A-Z]\s*[.．、]/m.test(trimmed)) {
		return true;
	}
	return false;
}

function splitByCardDelimiter(text: string): RawSegment[] {
	const detector = new EnhancedDelimiterDetector(DOC_QUIZ_CARD_DELIMITER);
	const delimiterLines = detector.findValidDelimiterLineIndices(text);
	if (delimiterLines.length < 2) {
		return [];
	}

	const lines = text.split("\n");
	const lineOffsets: number[] = [];
	let offset = 0;
	for (const line of lines) {
		lineOffsets.push(offset);
		offset += line.length + 1;
	}

	const segments: RawSegment[] = [];

	for (let i = 0; i < delimiterLines.length - 1; i++) {
		const startDelimLine = delimiterLines[i];
		const endDelimLine = delimiterLines[i + 1];
		const blockText = lines.slice(startDelimLine + 1, endDelimLine).join("\n");

		if (!isQuizLikeBlock(blockText)) {
			continue;
		}

		const contentStartLine = startDelimLine + 1;
		const absoluteStart =
			contentStartLine <= endDelimLine - 1 ? lineOffsets[contentStartLine] : lineOffsets[endDelimLine];
		const absoluteEnd = lineOffsets[endDelimLine];

		segments.push({
			text: blockText,
			start: absoluteStart,
			end: absoluteEnd,
		});
	}

	return segments;
}

function hasStandaloneCardDelimiterLines(text: string): boolean {
	return text.split("\n").some((line) => line.trim() === DOC_QUIZ_CARD_DELIMITER);
}

function splitIntoSegments(body: string): RawSegment[] {
	const byHeading = splitByHeadings(body);
	if (byHeading.length > 0) {
		return byHeading;
	}
	const byCardDelimiter = splitByCardDelimiter(body);
	if (byCardDelimiter.length > 0) {
		return byCardDelimiter;
	}
	if (hasStandaloneCardDelimiterLines(body)) {
		return [];
	}
	return splitByHorizontalRules(body);
}

function splitByHorizontalRules(text: string): RawSegment[] {
	const lines = text.split("\n");
	const hrLineIndices: number[] = [];
	let offset = 0;
	for (const line of lines) {
		if (HR_SPLIT_REGEX.test(line)) {
			hrLineIndices.push(offset);
		}
		offset += line.length + 1;
	}

	if (hrLineIndices.length === 0) {
		const trimmed = text.trim();
		if (!trimmed) return [];
		const start = text.indexOf(trimmed);
		return [{ text: trimmed, start, end: start + trimmed.length }];
	}

	const segments: RawSegment[] = [];
	let segmentStart = 0;
	for (const hrPos of hrLineIndices) {
		const chunk = text.slice(segmentStart, hrPos).trim();
		if (chunk) {
			const absoluteStart = text.indexOf(chunk, segmentStart);
			segments.push({
				text: chunk,
				start: absoluteStart >= 0 ? absoluteStart : segmentStart,
				end: absoluteStart >= 0 ? absoluteStart + chunk.length : hrPos,
			});
		}
		const hrLineEnd = text.indexOf("\n", hrPos);
		segmentStart = hrLineEnd >= 0 ? hrLineEnd + 1 : hrPos + 3;
	}
	const tail = text.slice(segmentStart).trim();
	if (tail) {
		const absoluteStart = text.indexOf(tail, segmentStart);
		segments.push({
			text: tail,
			start: absoluteStart >= 0 ? absoluteStart : segmentStart,
			end: absoluteStart >= 0 ? absoluteStart + tail.length : text.length,
		});
	}
	return segments;
}

function evaluateItem(content: string): {
	status: DocumentQuizItemStatus;
	warnings: string[];
} {
	const warnings: string[] = [];
	let status: DocumentQuizItemStatus = "ok";

	if (!content.trim()) {
		return { status: "error", warnings: ["empty"] };
	}

	const typeLabel = cardTypeLabelFromKind(detectQuestionKind(content));
	if (typeLabel === "markdown" && !content.includes("---div---")) {
		warnings.push("no_back");
		status = "warn";
	}

	const parsed = parseCardContent(content);
	if (parsed.kind === "choice" && parsed.choice.options.length < 2) {
		warnings.push("choice_options");
		status = "warn";
	}

	return { status, warnings };
}

export function parseDocumentQuizContent(
	filePath: string,
	fullContent: string,
	options?: DocumentQuizParseOptions
): DocumentQuizParseResult {
	const errors: string[] = [];
	const bodyFromFile = extractBodyContent(fullContent);
	const frontmatterPrefixLength = fullContent.length - bodyFromFile.length;

	let bodyContent = options?.selectionText?.trim() ?? bodyFromFile;
	let bodyOffsetBase = 0;

	if (options?.selectionText) {
		bodyContent = options.selectionText.trim();
		bodyOffsetBase = 0;
	} else {
		bodyContent = sliceQuizRegion(bodyFromFile);
		bodyOffsetBase = bodyFromFile.indexOf(bodyContent);
		if (bodyOffsetBase < 0) {
			bodyOffsetBase = 0;
		}
	}

	const segments = splitIntoSegments(bodyContent);
	const items: DocumentQuizItem[] = [];
	const rawBlocks: string[] = [];

	segments.forEach((segment, index) => {
		const rawBlock = segment.text;
		const cleaned = stripStatsCommentLines(rawBlock);
		if (!isQuizLikeBlock(cleaned)) {
			return;
		}
		const blockId = extractBlockIdFromText(rawBlock);
		const { status, warnings } = evaluateItem(cleaned);

		if (status === "error") {
			errors.push(`Q${index + 1}: empty`);
			return;
		}

		const kind = detectQuestionKind(cleaned);
		const baseItem: DocumentQuizItem = {
			index,
			content: cleaned,
			blockId,
			cardTypeLabel: cardTypeLabelFromKind(kind),
			questionKind: kind,
			difficulty: "unset",
			mastery: "new",
			stemPreview: "",
			parseWarnings: warnings,
			status,
			bodyOffsetStart: bodyOffsetBase + segment.start,
			bodyOffsetEnd: bodyOffsetBase + segment.end,
		};

		items.push(enrichDocumentQuizItem(baseItem, rawBlock));
		rawBlocks.push(rawBlock);
	});

	return {
		filePath,
		items,
		rawBlocks,
		errors,
		bodyContent,
		frontmatterPrefixLength,
	};
}

export function hasPotentialDocumentQuizContent(content: string): boolean {
	const body = extractBodyContent(content);
	if (body.includes(DOC_QUIZ_REGION_START)) {
		return true;
	}
	if (/^##\s+.+/m.test(body) && (body.includes("---div---") || /^[A-D][.、]/m.test(body))) {
		return true;
	}
	if (body.includes(DOC_QUIZ_CARD_DELIMITER) && body.includes("---div---")) {
		return true;
	}
	return false;
}
