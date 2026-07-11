/**
 * 测试评分引擎
 * 负责计算题目得分、总分和成绩等级
 */

import { isStagingBankId } from "../ai/card-staging-card-builder";
import type { TestQuestionRecord, TestSession } from "../../types/question-bank-types";

export type GradeLevel = "A+" | "A" | "B+" | "B" | "C" | "D" | "F";

export interface QuestionScore {
	questionId: string;
	score: number; // 0-1之间的分数
	maxScore: number; // 满分（通常为1）
	isCorrect: boolean;
	partialCredit?: number; // 部分得分（用于挖空题等）
}

export interface SessionScore {
	totalScore: number; // 总分（0-100）
	correctCount: number;
	wrongCount: number;
	skippedCount: number;
	totalQuestions: number;
	accuracy: number; // 正确率（0-100）
	grade: GradeLevel;
	questionScores: QuestionScore[];
}

export class TestScoringEngine {
	// 成绩等级阈值配置
	private static readonly GRADE_THRESHOLDS = {
		"A+": 95,
		A: 90,
		"B+": 85,
		B: 80,
		C: 70,
		D: 60,
		F: 0,
	};

	/**
	 * 计算单个题目得分
	 */
	static scoreQuestion(record: TestQuestionRecord): QuestionScore {
		const questionId = record.questionId;
		const maxScore = 1;
		let score = 0;
		let isCorrect = false;

		if (record.isCorrect === true) {
			score = maxScore;
			isCorrect = true;
		} else if (record.isCorrect === false) {
			score = 0;
			isCorrect = false;
		} else {
			// 未作答
			score = 0;
			isCorrect = false;
		}

		return {
			questionId,
			score,
			maxScore,
			isCorrect,
		};
	}

	/**
	 * 计算多选题得分（一错全错规则）
	 */
	static scoreMultipleChoice(userAnswer: string[] | null, correctAnswer: string[]): QuestionScore {
		const maxScore = 1;
		let score = 0;
		let isCorrect = false;

		if (!userAnswer || userAnswer.length === 0) {
			// 未作答
			return {
				questionId: "",
				score: 0,
				maxScore,
				isCorrect: false,
			};
		}

		// 一错全错规则
		if (userAnswer.length !== correctAnswer.length) {
			isCorrect = false;
			score = 0;
		} else {
			const sortedUser = [...userAnswer].sort();
			const sortedCorrect = [...correctAnswer].sort();
			isCorrect = sortedUser.every((ans, idx) => ans === sortedCorrect[idx]);
			score = isCorrect ? maxScore : 0;
		}

		return {
			questionId: "",
			score,
			maxScore,
			isCorrect,
		};
	}

	/**
	 * 计算挖空题得分（部分得分规则）
	 */
	static scoreClozeQuestion(userAnswers: string[] | null, correctAnswers: string[]): QuestionScore {
		const maxScore = 1;
		let score = 0;
		let correctBlanks = 0;

		if (!userAnswers || userAnswers.length === 0) {
			return {
				questionId: "",
				score: 0,
				maxScore,
				isCorrect: false,
				partialCredit: 0,
			};
		}

		// 计算每个空的得分
		const totalBlanks = correctAnswers.length;
		const scorePerBlank = maxScore / totalBlanks;

		for (let i = 0; i < totalBlanks; i++) {
			const userAns = userAnswers[i]?.trim().toLowerCase() || "";
			const correctAns = correctAnswers[i]?.trim().toLowerCase() || "";

			if (userAns === correctAns) {
				correctBlanks++;
				score += scorePerBlank;
			}
		}

		const partialCredit = (correctBlanks / totalBlanks) * 100;
		const isCorrect = correctBlanks === totalBlanks;

		return {
			questionId: "",
			score,
			maxScore,
			isCorrect,
			partialCredit,
		};
	}

	/**
	 * 计算测试会话总分
	 */
	static scoreSession(session: TestSession): SessionScore {
		const questionScores: QuestionScore[] = [];
		let totalScore = 0;
		let correctCount = 0;
		let wrongCount = 0;
		let skippedCount = 0;

		// 计算每道题的得分
		for (const record of session.questions) {
			const questionScore = this.scoreQuestion(record);
			questionScores.push(questionScore);
			totalScore += questionScore.score;

			if (record.isCorrect === true) {
				correctCount++;
			} else if (record.isCorrect === false) {
				wrongCount++;
			} else {
				skippedCount++;
			}
		}

		// 计算百分制总分
		const totalQuestions = session.questions.length;
		const answeredCount = correctCount + wrongCount;
		const percentageScore = this.calculatePercentageScore({
			totalScore,
			correctCount,
			totalQuestions,
			answeredCount,
			useAnsweredOnlyScoring: this.shouldScoreAnsweredQuestionsOnly(session, answeredCount, totalQuestions),
		});

		// 计算正确率（只考虑已作答的题目）
		const accuracy = answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0;

		// 计算成绩等级
		const grade = this.calculateGrade(percentageScore);

		return {
			totalScore: percentageScore,
			correctCount,
			wrongCount,
			skippedCount,
			totalQuestions,
			accuracy,
			grade,
			questionScores,
		};
	}

	/**
	 * Staging（文档测验、AI 预览等）只练部分题时不应把未作答题算进分母，
	 * 否则会出现「正确率 100% 但得分 4.5 / 等级 F」的矛盾结果。
	 */
	static shouldScoreAnsweredQuestionsOnly(
		session: TestSession,
		answeredCount: number,
		totalQuestions: number
	): boolean {
		return (
			isStagingBankId(session.bankId) &&
			answeredCount > 0 &&
			answeredCount < totalQuestions
		);
	}

	static calculatePercentageScore(options: {
		totalScore: number;
		correctCount: number;
		totalQuestions: number;
		answeredCount: number;
		useAnsweredOnlyScoring: boolean;
	}): number {
		const { totalScore, correctCount, totalQuestions, answeredCount, useAnsweredOnlyScoring } =
			options;

		if (useAnsweredOnlyScoring) {
			return answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0;
		}

		return totalQuestions > 0 ? (totalScore / totalQuestions) * 100 : 0;
	}

	/**
	 * 根据分数计算成绩等级
	 */
	static calculateGrade(score: number): GradeLevel {
		if (score >= this.GRADE_THRESHOLDS["A+"]) return "A+";
		if (score >= this.GRADE_THRESHOLDS.A) return "A";
		if (score >= this.GRADE_THRESHOLDS["B+"]) return "B+";
		if (score >= this.GRADE_THRESHOLDS.B) return "B";
		if (score >= this.GRADE_THRESHOLDS.C) return "C";
		if (score >= this.GRADE_THRESHOLDS.D) return "D";
		return "F";
	}

	/**
	 * 获取成绩等级描述
	 */
	static getGradeDescription(grade: GradeLevel): string {
		const descriptions: Record<GradeLevel, string> = {
			"A+": "优秀+",
			A: "优秀",
			"B+": "良好+",
			B: "良好",
			C: "中等",
			D: "及格",
			F: "不及格",
		};

		return descriptions[grade] || grade;
	}

	/**
	 * 获取成绩等级颜色
	 */
	static getGradeColor(grade: GradeLevel): string {
		const colors: Record<GradeLevel, string> = {
			"A+": "#22c55e", // 绿色
			A: "#10b981",
			"B+": "#3b82f6", // 蓝色
			B: "#2563eb",
			C: "#f59e0b", // 橙色
			D: "#ef4444", // 红色
			F: "#dc2626",
		};

		return colors[grade] || "#6b7280";
	}

	/**
	 * 计算排名（相对于历史成绩）
	 */
	static calculatePercentile(currentScore: number, historicalScores: number[]): number {
		if (historicalScores.length === 0) {
			return 0;
		}

		const lowerScores = historicalScores.filter((_score) => _score < currentScore);
		const percentile = (lowerScores.length / historicalScores.length) * 100;

		return Math.round(percentile);
	}

	/**
	 * 获取进步建议
	 */
	static getImprovementSuggestions(sessionScore: SessionScore): string[] {
		const suggestions: string[] = [];
		const { accuracy, wrongCount, skippedCount } = sessionScore;

		if (accuracy < 60) {
			suggestions.push("正确率较低，建议复习基础知识后再次测试");
		} else if (accuracy < 80) {
			suggestions.push("正确率尚可，继续巩固薄弱知识点");
		} else if (accuracy < 95) {
			suggestions.push("表现良好，继续保持！");
		} else {
			suggestions.push("优秀！已完全掌握该题库内容");
		}

		if (wrongCount > 0) {
			suggestions.push(`有${wrongCount}道题答错，建议查看解析并记入错题本`);
		}

		if (skippedCount > 0) {
			suggestions.push(`有${skippedCount}道题未作答，建议下次完整作答`);
		}

		return suggestions;
	}

	/**
	 * 生成测试报告摘要
	 */
	static generateReportSummary(sessionScore: SessionScore): string {
		const { totalScore, correctCount, totalQuestions, grade } = sessionScore;
		const gradeDesc = this.getGradeDescription(grade);

		return `本次测试得分：${totalScore.toFixed(
			1
		)}分（${gradeDesc}），答对${correctCount}/${totalQuestions}题`;
	}
}
