import { parseCardContent } from "../../parsing/card-content-parser";
import type { QuestionTestStats } from "../../types/question-bank-types";
import type {
	DocumentQuizDifficultyLabel,
	DocumentQuizItem,
	DocumentQuizMasteryLabel,
	DocumentQuizParseSummary,
	DocumentQuizQuestionKind,
} from "../../types/document-quiz-types";
import { getCardMetadata, type CardYAMLDifficulty } from "../../utils/yaml-utils";
import { isInputClozeQuestionContent } from "../../utils/question-bank/input-cloze-utils";
import { hasClozeSyntax } from "../../utils/cloze-mode";
import { buildDocumentQuizStatsKey, parseStatsCommentJson } from "./DocumentQuizStatsStorage";

const STATS_COMMENT_REGEX = /<!--\s*weave-test-stats:\s*([\s\S]*?)\s*-->/i;
const DIFFICULTY_TAG_REGEX = /#(?:简单|容易|easy)\b|#(?:中等|medium)\b|#(?:困难|难|hard)\b/i;

export function detectQuestionKind(content: string): DocumentQuizQuestionKind {
	const parsed = parseCardContent(content);
	if (parsed.kind === "choice") {
		return parsed.choice.isMultipleChoice ? "multiple_choice" : "single_choice";
	}
	if (isInputClozeQuestionContent(content) || hasClozeSyntax(content)) {
		return "cloze";
	}
	if (content.includes("---div---")) {
		return "qa";
	}
	return "other";
}

export function extractDifficultyLabel(content: string): DocumentQuizDifficultyLabel {
	const metadata = getCardMetadata(content);
	if (metadata.we_difficulty) {
		return metadata.we_difficulty;
	}

	const tagMatch = content.match(DIFFICULTY_TAG_REGEX);
	if (!tagMatch) {
		return "unset";
	}

	const token = tagMatch[0].toLowerCase();
	if (token.includes("困难") || token.includes("hard") || token === "#难") {
		return "hard";
	}
	if (token.includes("中等") || token.includes("medium")) {
		return "medium";
	}
	return "easy";
}

function extractInlineHistoryStats(rawBlock: string): QuestionTestStats | undefined {
	const match = rawBlock.match(STATS_COMMENT_REGEX);
	if (!match?.[1]) {
		return undefined;
	}
	const json = parseStatsCommentJson(match[1]);
	if (!json) {
		return undefined;
	}
	const attempts = typeof json.attempts === "number" ? json.attempts : 0;
	const correct = typeof json.correct === "number" ? json.correct : 0;
	const accuracy =
		typeof json.accuracy === "number"
			? json.accuracy
			: attempts > 0
				? correct / attempts
				: 0;
	if (attempts <= 0) {
		return undefined;
	}
	return {
		attempts,
		correct,
		accuracy,
		lastTestDate: typeof json.lastAt === "string" ? json.lastAt : undefined,
	};
}

export function resolveMasteryLabel(
	attempts: number,
	accuracy: number
): DocumentQuizMasteryLabel {
	if (attempts <= 0) {
		return "new";
	}
	if (accuracy >= 0.85) {
		return "strong";
	}
	if (accuracy >= 0.6) {
		return "fair";
	}
	return "weak";
}

function extractStemPreview(content: string, kind: DocumentQuizQuestionKind): string {
	const parsed = parseCardContent(content);
	let stem = "";

	if (parsed.kind === "choice") {
		stem = parsed.choice.question;
	} else {
		const front = content.split(/---div---/i)[0] ?? content;
		stem = front
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !/^[A-Z]\s*[.．、]/.test(line))
			.join(" ");
	}

	stem = stem
		.replace(/\^[\w-]+/g, "")
		.replace(/==([^=]+)==/g, "$1")
		.replace(/\s+/g, " ")
		.trim();

	if (!stem) {
		return kind === "cloze" ? "（挖空题）" : "（无题干预览）";
	}

	return stem.length > 72 ? `${stem.slice(0, 72)}…` : stem;
}

function pickHistoryStats(
	inlineStats: QuestionTestStats | undefined,
	storedStats: QuestionTestStats | undefined
): QuestionTestStats | undefined {
	if (!inlineStats && !storedStats) {
		return undefined;
	}
	if (!inlineStats) {
		return storedStats;
	}
	if (!storedStats) {
		return inlineStats;
	}
	return storedStats.attempts >= inlineStats.attempts ? storedStats : inlineStats;
}

export function enrichDocumentQuizItem(
	item: DocumentQuizItem,
	rawBlock: string,
	storedStats?: QuestionTestStats
): DocumentQuizItem {
	const questionKind = detectQuestionKind(item.content);
	const difficulty = extractDifficultyLabel(item.content);
	const stemPreview = extractStemPreview(item.content, questionKind);
	const historyStats = pickHistoryStats(
		extractInlineHistoryStats(rawBlock),
		storedStats
	);
	const historicalAttempts = historyStats?.attempts ?? 0;
	const historicalAccuracy = historyStats?.accuracy ?? 0;

	return {
		...item,
		questionKind,
		difficulty,
		stemPreview,
		mastery: resolveMasteryLabel(historicalAttempts, historicalAccuracy),
		historicalAttempts,
		historicalAccuracy: historicalAttempts > 0 ? historicalAccuracy : undefined,
	};
}

export function mergeStoredStatsIntoItems(
	items: DocumentQuizItem[],
	filePath: string,
	storedByKey: Record<string, QuestionTestStats>,
	rawBlocksByIndex: Map<number, string>
): DocumentQuizItem[] {
	return items.map((item) => {
		const stored =
			item.blockId !== undefined
				? storedByKey[buildDocumentQuizStatsKey(filePath, item.blockId)]
				: undefined;
		const rawBlock = rawBlocksByIndex.get(item.index) ?? item.content;
		return enrichDocumentQuizItem(item, rawBlock, stored);
	});
}

export function buildDocumentQuizParseSummary(items: DocumentQuizItem[]): DocumentQuizParseSummary {
	const summary: DocumentQuizParseSummary = {
		typeCounts: {
			total: items.length,
			singleChoice: 0,
			multipleChoice: 0,
			cloze: 0,
			qa: 0,
			other: 0,
			ready: 0,
			warn: 0,
			error: 0,
		},
		difficultyCounts: {
			easy: 0,
			medium: 0,
			hard: 0,
			unset: 0,
		},
		masteryCounts: {
			new: 0,
			weak: 0,
			fair: 0,
			strong: 0,
		},
	};

	for (const item of items) {
		switch (item.questionKind) {
			case "single_choice":
				summary.typeCounts.singleChoice += 1;
				break;
			case "multiple_choice":
				summary.typeCounts.multipleChoice += 1;
				break;
			case "cloze":
				summary.typeCounts.cloze += 1;
				break;
			case "qa":
				summary.typeCounts.qa += 1;
				break;
			default:
				summary.typeCounts.other += 1;
		}

		if (item.status === "ok") {
			summary.typeCounts.ready += 1;
		} else if (item.status === "warn") {
			summary.typeCounts.warn += 1;
		} else {
			summary.typeCounts.error += 1;
		}

		summary.difficultyCounts[item.difficulty] += 1;
		summary.masteryCounts[item.mastery] += 1;
	}

	return summary;
}

export function difficultyLabelFromYaml(value: CardYAMLDifficulty | undefined): DocumentQuizDifficultyLabel {
	return value ?? "unset";
}
