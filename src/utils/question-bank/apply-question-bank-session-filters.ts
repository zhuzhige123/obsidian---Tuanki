/**
 * 考试会话题目筛选：题量、智能抽题、打乱顺序
 * 供题库列表、考试视图与学习界面共用，避免配置在入口层丢失。
 */

import type { Card } from "../../data/types";
import { parseChoiceQuestion } from "../../parsing/choice-question-parser";
import type { QuestionBankModeConfig, TestMode } from "../../types/question-bank-types";
import { logger } from "../logger";
import { isInputClozeQuestionContent } from "./input-cloze-utils";

export type SessionQuestionType =
	| "single_choice"
	| "multiple_choice"
	| "cloze"
	| "short_answer";

interface DynamicDifficulty {
	totalAttempts: number;
	correctAttempts: number;
	currentAccuracy: number;
	recentAccuracy: number;
	computedDifficulty: number;
	difficultyLevel: "easy" | "medium" | "hard";
	confidence: number;
}

export function shuffleQuestionBankArray<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export function resolveSessionQuestionCount(
	config: QuestionBankModeConfig | undefined,
	mode: TestMode,
	totalAvailable: number
): number | undefined {
	if (!config || totalAvailable <= 0) {
		return undefined;
	}

	const customCount = config.customQuestionCount?.[mode];
	if (customCount === null || customCount === undefined) {
		if (config.questionCount && config.questionCount > 0) {
			return Math.min(config.questionCount, totalAvailable);
		}
		return undefined;
	}

	if (customCount <= 0) {
		return undefined;
	}

	return Math.min(customCount, totalAvailable);
}

export function shouldShuffleSessionQuestions(
	config: QuestionBankModeConfig | undefined,
	questionOrder?: "sequential" | "random"
): boolean {
	if (questionOrder === "random") {
		return true;
	}
	return Boolean(config?.options?.shuffleQuestions ?? config?.shuffleQuestions);
}

export function shouldShuffleSessionOptions(
	config: QuestionBankModeConfig | undefined,
	choiceOptionOrder?: "sequential" | "random"
): boolean {
	if (choiceOptionOrder === "random") {
		return true;
	}
	return Boolean(config?.options?.shuffleOptions ?? config?.shuffleOptions);
}

function detectQuestionType(card: Card): SessionQuestionType {
	const parsed = parseChoiceQuestion(card.content);
	if (parsed?.correctAnswers?.length) {
		return parsed.correctAnswers.length > 1 ? "multiple_choice" : "single_choice";
	}
	if (isInputClozeQuestionContent(card.content)) {
		return "cloze";
	}
	return "short_answer";
}

function redistributeRatio(
	originalRatio: Record<string, number>,
	availableTypes: string[]
): Record<string, number> {
	const adjustedRatio: Record<string, number> = {};
	let totalRatio = 0;

	for (const type of availableTypes) {
		totalRatio += originalRatio[type] || 0;
	}

	if (totalRatio === 0) {
		const averageRatio = 100 / availableTypes.length;
		for (const type of availableTypes) {
			adjustedRatio[type] = averageRatio;
		}
		return adjustedRatio;
	}

	for (const type of availableTypes) {
		adjustedRatio[type] = ((originalRatio[type] || 0) / totalRatio) * 100;
	}
	return adjustedRatio;
}

function computeDynamicDifficulty(card: Card): DynamicDifficulty {
	const stats = card.stats?.errorTracking;

	if (!stats) {
		return {
			totalAttempts: 0,
			correctAttempts: 0,
			currentAccuracy: 0.5,
			recentAccuracy: 0.5,
			computedDifficulty: 5,
			difficultyLevel: "medium",
			confidence: 0,
		};
	}

	const totalAttempts = stats.correctCount + stats.errorCount;
	const accuracy = stats.accuracy;
	const correctAttempts = stats.correctCount;

	let difficulty = 5;
	if (accuracy >= 0.9) difficulty = 2;
	else if (accuracy >= 0.7) difficulty = 3;
	else if (accuracy >= 0.5) difficulty = 5;
	else if (accuracy >= 0.3) difficulty = 7;
	else difficulty = 9;

	const confidence = Math.min(totalAttempts / 10, 1);
	const adjustedDifficulty = difficulty * confidence + 5 * (1 - confidence);
	const finalDifficulty = Math.max(1, Math.min(10, Math.round(adjustedDifficulty)));

	return {
		totalAttempts,
		correctAttempts,
		currentAccuracy: accuracy,
		recentAccuracy: accuracy,
		computedDifficulty: finalDifficulty,
		difficultyLevel: finalDifficulty <= 3 ? "easy" : finalDifficulty <= 7 ? "medium" : "hard",
		confidence,
	};
}

function getQuestionDifficulty(card: Card): "easy" | "medium" | "hard" {
	const dynamicDiff = computeDynamicDifficulty(card);
	if (dynamicDiff.confidence > 0.3) {
		return dynamicDiff.difficultyLevel;
	}
	return card.difficulty || "medium";
}

type QuestionWithMetadata = Card & {
	questionType: SessionQuestionType;
	evaluatedDifficulty: string;
	dynamicData: DynamicDifficulty;
};

function createDoubleGroups(questions: QuestionWithMetadata[]) {
	const groups: Record<string, Record<string, QuestionWithMetadata[]>> = {};

	for (const question of questions) {
		const type = question.questionType;
		const difficulty = question.evaluatedDifficulty;

		if (!groups[type]) {
			groups[type] = {};
		}
		if (!groups[type][difficulty]) {
			groups[type][difficulty] = [];
		}
		groups[type][difficulty].push(question);
	}

	return groups;
}

function summarizeGroups(groups: Record<string, Record<string, Card[]>>) {
	const summary: Record<string, Record<string, number>> = {};
	for (const type of Object.keys(groups)) {
		summary[type] = {};
		for (const difficulty of Object.keys(groups[type])) {
			summary[type][difficulty] = groups[type][difficulty].length;
		}
	}
	return summary;
}

async function performLayeredSampling(
	groups: Record<string, Record<string, Card[]>>,
	config: {
		questionTypeRatio: Record<string, number>;
		difficultyDistribution: Record<string, number>;
	},
	targetCount: number
): Promise<Card[]> {
	const sampledQuestions: Card[] = [];
	const { questionTypeRatio, difficultyDistribution } = config;

	const availableTypes = Object.keys(groups).filter((type) =>
		Object.values(groups[type]).some((arr) => arr.length > 0)
	);
	const availableDifficulties = ["easy", "medium", "hard"].filter((difficulty) =>
		availableTypes.some((type) => groups[type]?.[difficulty]?.length > 0)
	);

	const adjustedTypeRatio = redistributeRatio(questionTypeRatio, availableTypes);
	const adjustedDifficultyRatio = redistributeRatio(difficultyDistribution, availableDifficulties);

	for (const type of availableTypes) {
		const typeCount = Math.floor((targetCount * (adjustedTypeRatio[type] || 0)) / 100);
		if (typeCount <= 0) continue;

		for (const difficulty of availableDifficulties) {
			const difficultyCount = Math.floor((typeCount * (adjustedDifficultyRatio[difficulty] || 0)) / 100);
			const availableQuestions = groups[type]?.[difficulty] || [];
			if (difficultyCount <= 0 || availableQuestions.length === 0) continue;

			const actualCount = Math.min(difficultyCount, availableQuestions.length);
			const sampled = shuffleQuestionBankArray(availableQuestions).slice(0, actualCount);
			sampledQuestions.push(...sampled);
		}
	}

	const remaining = targetCount - sampledQuestions.length;
	if (remaining > 0) {
		const allAvailable = Object.values(groups)
			.flatMap((typeGroup) => Object.values(typeGroup))
			.flat();
		const unused = allAvailable.filter((q) => !sampledQuestions.some((s) => s.uuid === q.uuid));
		sampledQuestions.push(...shuffleQuestionBankArray(unused).slice(0, remaining));
	}

	return sampledQuestions;
}

async function applyIntelligentFiltering(
	questions: Card[],
	config: {
		questionTypeRatio: Record<string, number>;
		difficultyDistribution: Record<string, number>;
	},
	targetCount: number
): Promise<Card[]> {
	if (targetCount <= 0 || questions.length === 0) {
		return [];
	}

	if (targetCount >= questions.length) {
		return config.questionTypeRatio ? shuffleQuestionBankArray(questions) : questions;
	}

	const questionsWithMetadata: QuestionWithMetadata[] = questions.map((question) => ({
		...question,
		questionType: detectQuestionType(question),
		evaluatedDifficulty: getQuestionDifficulty(question),
		dynamicData: computeDynamicDifficulty(question),
	}));

	const groups = createDoubleGroups(questionsWithMetadata);
	logger.debug("[question-bank-session-filters] 双维度分组:", summarizeGroups(groups));

	const sampledQuestions = await performLayeredSampling(groups, config, targetCount);
	return shuffleQuestionBankArray(sampledQuestions);
}

/**
 * 按考试配置筛选题库题目（题量、智能抽题、打乱）。
 */
export async function applyQuestionBankSessionFilters(
	allQuestions: Card[],
	config: QuestionBankModeConfig | undefined,
	mode: TestMode
): Promise<Card[]> {
	if (!config || allQuestions.length === 0) {
		return [...allQuestions];
	}

	let filteredQuestions = [...allQuestions];
	const targetCount = resolveSessionQuestionCount(config, mode, filteredQuestions.length) ??
		filteredQuestions.length;

	if (config.questionTypeRatio || config.difficultyDistribution) {
		filteredQuestions = await applyIntelligentFiltering(filteredQuestions, {
			questionTypeRatio:
				config.questionTypeRatio ||
				({ single_choice: 40, multiple_choice: 30, cloze: 20, short_answer: 10 }),
			difficultyDistribution:
				config.difficultyDistribution || ({ easy: 30, medium: 50, hard: 20 }),
		}, targetCount);
	} else if (targetCount > 0 && targetCount < filteredQuestions.length) {
		filteredQuestions = shuffleQuestionBankArray(filteredQuestions).slice(0, targetCount);
	}

	logger.debug("[question-bank-session-filters] 筛选完成", {
		original: allQuestions.length,
		final: filteredQuestions.length,
		targetCount,
	});

	return filteredQuestions;
}
