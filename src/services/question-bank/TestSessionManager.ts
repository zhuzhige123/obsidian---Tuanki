import { logger } from "../../utils/logger";
/**
 * 测试会话管理器
 * 负责管理题库考试会话的生命周期
 */

import type { Card } from "../../data/types";
import { parseChoiceQuestion } from "../../parsing/choice-question-parser";
import type {
	PersistedTestQuestionRecord,
	PersistedTestSession,
	QuestionTestStats,
	TestAttempt,
	TestHistoryEntry,
	TestHistoryQuestionSummary,
	TestMode,
	TestQuestionRecord,
	TestSession,
} from "../../types/question-bank-types";
import { generateId } from "../../utils/helpers";
import {
	checkInputClozeAnswers,
	extractInputClozeAnswers,
	isInputClozeQuestionContent,
} from "../../utils/question-bank/input-cloze-utils";
import { accuracyCalculator } from "./AccuracyCalculator";
import { isStagingBankId } from "../ai/card-staging-card-builder";
import type { QuestionBankStorage } from "./QuestionBankStorage";
import type { QuestionBankService } from "./QuestionBankService";
import { TestScoringEngine } from "./TestScoringEngine";

export interface SessionConfig {
	bankId: string;
	mode: TestMode;
	questionCount?: number; // 题目数量限制（可选）
	timeLimit?: number; // 时间限制（毫秒，可选）
	shuffleQuestions?: boolean; // 是否打乱题目顺序
	shuffleOptions?: boolean; // 是否打乱选项顺序
}

export interface AnswerSubmission {
	questionId: string;
	answer: string | string[]; // 单选为string，多选/输入式挖空为string[]
	timeSpent: number; // 答题用时（秒）
}

export class TestSessionManager {
	private storage: QuestionBankStorage;
	private bankService: QuestionBankService | undefined;
	private currentSession: TestSession | null = null;
	private sessionStartTime = 0;
	private questionStartTime = 0;

	constructor(storage: QuestionBankStorage, bankService?: QuestionBankService) {
		this.storage = storage;
		this.bankService = bankService;
	}

	private buildHistoryQuestionSummaries(session: TestSession): TestHistoryQuestionSummary[] {
		return (session.questions || []).flatMap((question): TestHistoryQuestionSummary[] => {
			if (!question?.questionId) {
				return [];
			}

			return [
				{
					questionId: question.questionId,
					isCorrect:
						question.isCorrect === true ? true : question.isCorrect === false ? false : null,
					answered:
						question.isCorrect !== null ||
						question.userAnswer !== null ||
						Boolean(question.submittedAt),
					timeSpentSeconds: Math.max(0, question.timeSpent || 0),
				},
			];
		});
	}

	/**
	 * 开始新的测试会话
	 */
	async startSession(config: SessionConfig, questions: Card[]): Promise<TestSession> {
		if (this.currentSession) {
			throw new Error("已有进行中的测试会话，请先完成或取消当前会话");
		}

		// 处理题目列表
		let selectedQuestions = [...questions];

		// 限制题目数量
		if (config.questionCount && config.questionCount < selectedQuestions.length) {
			selectedQuestions = selectedQuestions.slice(0, config.questionCount);
		}

		// 打乱题目顺序
		if (config.shuffleQuestions) {
			selectedQuestions = this.shuffleArray(selectedQuestions);
		}

		// 获取题库名称
		let bankName = "未知题库";
		if (this.bankService) {
			const bank = this.bankService.getBankById(config.bankId);
			bankName = bank?.name || "未知题库";
		}

		// 创建测试会话
		const session: TestSession = {
			id: generateId(),
			bankId: config.bankId,
			bankName,
			mode: config.mode,
			startTime: new Date().toISOString(),
			duration: 0,
			status: "in_progress",
			questions: selectedQuestions.map((_q) => {
				//  容错处理：即使题目格式有问题，也让会话正常启动
				let correctAnswer: string | string[] | null = null;
				let errorMessage: string | undefined = undefined;

				try {
					correctAnswer = this.extractCorrectAnswer(_q);
				} catch (error) {
					// 记录错误信息，但不阻断会话启动
					errorMessage = error instanceof Error ? error.message : "未知错误";
					logger.warn(`[TestSessionManager] 题目 ${_q.uuid} 格式错误:`, errorMessage);
				}

				return {
					questionId: _q.uuid, //  修复：使用uuid字段而非已废弃的id字段
					question: _q,
					userAnswer: null,
					correctAnswer,
					isCorrect: null,
					timeSpent: 0,
					submittedAt: null,
					errorMessage,
				};
			}),
			currentQuestionIndex: 0,
			score: 0,
			totalQuestions: selectedQuestions.length,
			correctCount: 0,
			wrongCount: 0,
			skippedCount: 0,
			completedQuestions: 0,
			incorrectCount: 0,
			accuracy: 0,
			config: {
				timeLimit: config.timeLimit,
				shuffleOptions: config.shuffleOptions || false,
			},
		};

		this.currentSession = session;
		this.sessionStartTime = Date.now();
		this.questionStartTime = Date.now();

		// 持久化会话（用于恢复）
		await this.saveSession(session);

		return session;
	}

	/**
	 * 提交答案
	 */
	async submitAnswer(submission: AnswerSubmission): Promise<{
		isCorrect: boolean;
		correctAnswer: string | string[] | null;
		questionRecord: TestQuestionRecord;
	}> {
		if (!this.currentSession) {
			throw new Error("没有进行中的测试会话");
		}

		const currentIndex = this.currentSession.currentQuestionIndex;
		const questionRecord = this.currentSession.questions[currentIndex];

		if (!questionRecord) {
			throw new Error("当前题目不存在");
		}

		// 检查题目ID匹配
		if (questionRecord.questionId !== submission.questionId) {
			throw new Error("提交的题目ID与当前题目不匹配");
		}

		// 检查是否已经提交过
		if (questionRecord.isCorrect !== null) {
			throw new Error("该题目已经提交过答案");
		}

		// 计算答题时间
		const timeSpent = submission.timeSpent || (Date.now() - this.questionStartTime) / 1000;

		// 判断答案是否正确
		const isCorrect = this.checkAnswer(
			submission.answer,
			questionRecord.correctAnswer,
			questionRecord.question
		);

		// 更新题目记录
		questionRecord.userAnswer = submission.answer;
		questionRecord.isCorrect = isCorrect;
		questionRecord.timeSpent = timeSpent;
		questionRecord.submittedAt = new Date().toISOString();

		// 更新会话统计
		if (isCorrect) {
			this.currentSession.correctCount++;
		} else {
			this.currentSession.wrongCount++;
		}

		//  修复：更新已完成题数（用于显示答题次数和进度）
		this.currentSession.completedQuestions++;

		this.recalculateSessionStats();

		// 持久化会话（完成态不需要保存完整会话，仅写历史分数并清理恢复文件）
		await this.saveSession(this.currentSession);

		return {
			isCorrect,
			correctAnswer: questionRecord.correctAnswer,
			questionRecord,
		};
	}

	/**
	 * 撤销当前题目的已提交答案
	 */
	async undoCurrentAnswer(): Promise<boolean> {
		if (!this.currentSession) {
			return false;
		}

		const currentIndex = this.currentSession.currentQuestionIndex;
		const questionRecord = this.currentSession.questions[currentIndex];
		if (!questionRecord || questionRecord.isCorrect === null) {
			return false;
		}

		if (questionRecord.isCorrect === true) {
			this.currentSession.correctCount = Math.max(0, this.currentSession.correctCount - 1);
		} else if (questionRecord.isCorrect === false) {
			this.currentSession.wrongCount = Math.max(0, this.currentSession.wrongCount - 1);
		}

		this.currentSession.completedQuestions = Math.max(0, this.currentSession.completedQuestions - 1);
		questionRecord.userAnswer = null;
		questionRecord.isCorrect = null;
		questionRecord.timeSpent = 0;
		questionRecord.submittedAt = null;

		this.recalculateSessionStats();
		this.questionStartTime = Date.now();
		await this.saveSession(this.currentSession);
		return true;
	}

	/**
	 * 跳过当前题目
	 */
	skipQuestion(): void {
		if (!this.currentSession) {
			throw new Error("没有进行中的测试会话");
		}

		const currentIndex = this.currentSession.currentQuestionIndex;
		const questionRecord = this.currentSession.questions[currentIndex];

		if (questionRecord && questionRecord.isCorrect === null) {
			this.currentSession.skippedCount++;
		}
	}

	/**
	 * 移动到下一题
	 */
	async moveToNextQuestion(): Promise<boolean> {
		if (!this.currentSession) {
			throw new Error("没有进行中的测试会话");
		}

		const nextIndex = this.currentSession.currentQuestionIndex + 1;

		if (nextIndex >= this.currentSession.totalQuestions) {
			// 已经是最后一题，无法继续
			return false;
		}

		this.currentSession.currentQuestionIndex = nextIndex;
		this.questionStartTime = Date.now();

		// 持久化会话
		await this.saveSession(this.currentSession);

		return true;
	}

	/**
	 * 移动到上一题（仅查看，不能修改）
	 */
	async moveToPreviousQuestion(): Promise<boolean> {
		if (!this.currentSession) {
			throw new Error("没有进行中的测试会话");
		}

		const prevIndex = this.currentSession.currentQuestionIndex - 1;

		if (prevIndex < 0) {
			// 已经是第一题
			return false;
		}

		this.currentSession.currentQuestionIndex = prevIndex;

		// 持久化会话
		await this.saveSession(this.currentSession);

		return true;
	}

	/**
	 * 跳转到指定题目
	 */
	async jumpToQuestion(targetIndex: number): Promise<boolean> {
		if (!this.currentSession) {
			throw new Error("没有进行中的测试会话");
		}

		// 验证索引有效性
		if (targetIndex < 0 || targetIndex >= this.currentSession.totalQuestions) {
			logger.warn(`[TestSessionManager] 无效的题目索引: ${targetIndex}`);
			return false;
		}

		// 更新当前题目索引
		this.currentSession.currentQuestionIndex = targetIndex;

		// 重置计时器（如果是未答题，重新开始计时）
		const targetQuestion = this.currentSession.questions[targetIndex];
		if (targetQuestion && targetQuestion.isCorrect === null) {
			this.questionStartTime = Date.now();
		}

		// 持久化会话
		await this.saveSession(this.currentSession);

		return true;
	}

	/**
	 * 完成测试会话
	 */
	async completeSession(): Promise<TestSession> {
		if (!this.currentSession) {
			throw new Error("没有进行中的测试会话");
		}

		// 检查是否还有未答题目
		const unansweredCount = this.currentSession.questions.filter(
			(q) => q.isCorrect === null && q.userAnswer === null
		).length;

		if (unansweredCount > 0) {
			logger.warn(`[TestSessionManager] 还有 ${unansweredCount} 道题未作答`);
		}

		// 计算总用时
		const totalTimeSpent = (Date.now() - this.sessionStartTime) / 1000;

		// 更新会话状态
		this.currentSession.status = "completed";
		this.currentSession.endTime = new Date().toISOString();
		this.currentSession.totalTimeSpent = totalTimeSpent;

		this.recalculateSessionStats();

		if (!isStagingBankId(this.currentSession.bankId)) {
			// 持久化会话
			await this.saveSession(this.currentSession);

			// 更新题目的测试统计（题库侧 stats，不修改卡片本体）
			await this.updateQuestionStats();

			// 保存题目内容快照（历史回顾用）
			await this.saveSessionArchiveFromCompletedSession(this.currentSession);

			// 写入题库级历史分数（用于趋势图）
			await this.appendHistoryFromCompletedSession(this.currentSession);

			// 清理进行中恢复文件
			await this.storage.clearInProgressSession(this.currentSession.bankId);
		}

		const completedSession = { ...this.currentSession };
		this.currentSession = null;

		return completedSession;
	}

	/**
	 * 从当前会话中移除题目（不结束整场考试）
	 */
	async removeQuestionFromSession(cardUuid: string): Promise<"removed" | "empty" | "no-session"> {
		if (!this.currentSession) {
			return "no-session";
		}

		const questions = this.currentSession.questions;
		const removeIndex = questions.findIndex(
			(record) => record.questionId === cardUuid || record.question?.uuid === cardUuid
		);
		if (removeIndex < 0) {
			return "removed";
		}

		const removedRecord = questions[removeIndex];
		if (removedRecord.submittedAt) {
			this.currentSession.completedQuestions = Math.max(
				0,
				this.currentSession.completedQuestions - 1
			);
			if (removedRecord.isCorrect === true) {
				this.currentSession.correctCount = Math.max(0, this.currentSession.correctCount - 1);
			} else if (removedRecord.isCorrect === false) {
				this.currentSession.wrongCount = Math.max(0, this.currentSession.wrongCount - 1);
			}
		}

		const currentIndex = this.currentSession.currentQuestionIndex;
		questions.splice(removeIndex, 1);
		this.currentSession.totalQuestions = questions.length;

		if (questions.length === 0) {
			await this.storage.clearInProgressSession(this.currentSession.bankId);
			this.currentSession = null;
			return "empty";
		}

		if (removeIndex < currentIndex) {
			this.currentSession.currentQuestionIndex = currentIndex - 1;
		} else 		if (removeIndex === currentIndex && currentIndex >= questions.length) {
			this.currentSession.currentQuestionIndex = questions.length - 1;
		}

		this.recalculateSessionStats();

		await this.saveSession(this.currentSession);
		return "removed";
	}

	/**
	 * 取消测试会话
	 */
	async cancelSession(): Promise<void> {
		if (!this.currentSession) {
			return;
		}

		// 退出时仅保存进行中进度（用于恢复），不写入完成态历史
		await this.saveSession(this.currentSession);
		this.currentSession = null;
	}

	/**
	 * 获取当前会话
	 */
	getCurrentSession(): TestSession | null {
		return this.currentSession;
	}

	/**
	 * 保存当前会话状态
	 *  用于外部修改题目后同步保存会话数据
	 */
	async saveCurrentSession(): Promise<void> {
		if (this.currentSession) {
			await this.saveSession(this.currentSession);
		}
	}

	/**
	 * 获取当前题目
	 *  创新方案：从数据库实时刷新卡片数据，确保始终是最新内容
	 */
	async getCurrentQuestionWithRefresh(): Promise<TestQuestionRecord | null> {
		if (!this.currentSession) {
			return null;
		}

		const currentIndex = this.currentSession.currentQuestionIndex;
		const questionRecord = this.currentSession.questions[currentIndex];

		if (!questionRecord) {
			return null;
		}

		// 如果没有 bankService，使用会话缓存
		if (!this.bankService) {
			return questionRecord;
		}

		// 从数据库重新加载卡片（获取最新数据）
		try {
			const freshCard = await this.bankService.getQuestionById(
				this.currentSession.bankId,
				questionRecord.questionId
			);

			if (freshCard) {
				//  更新会话数组中的卡片引用
				questionRecord.question = freshCard;

				//  重新提取正确答案
				try {
					questionRecord.correctAnswer = this.extractCorrectAnswer(freshCard);
					questionRecord.errorMessage = undefined;
				} catch (error) {
					questionRecord.correctAnswer = null;
					questionRecord.errorMessage = error instanceof Error ? error.message : "未知错误";
				}
			}
		} catch (error) {
			logger.error("[TestSessionManager] 刷新卡片失败:", error);
		}

		return questionRecord;
	}

	/**
	 * 获取当前题目（旧方法，保持兼容）
	 */
	getCurrentQuestion(): TestQuestionRecord | null {
		if (!this.currentSession) {
			return null;
		}

		const currentIndex = this.currentSession.currentQuestionIndex;
		return this.currentSession.questions[currentIndex] || null;
	}

	/**
	 * 获取当前题目索引（0-based）
	 */
	getCurrentIndex(): number {
		if (!this.currentSession) {
			return 0;
		}
		return this.currentSession.currentQuestionIndex;
	}

	/**
	 * 获取会话进度
	 */
	getProgress(): {
		current: number;
		total: number;
		percentage: number;
		answered: number;
		unanswered: number;
	} | null {
		if (!this.currentSession) {
			return null;
		}

		const answered = this.currentSession.correctCount + this.currentSession.wrongCount;
		const unanswered = this.currentSession.totalQuestions - answered;

		return {
			current: this.currentSession.currentQuestionIndex + 1,
			total: this.currentSession.totalQuestions,
			percentage: (answered / this.currentSession.totalQuestions) * 100,
			answered,
			unanswered,
		};
	}

	/**
	 * 恢复未完成的会话
	 */
	async restoreSession(bankId: string): Promise<TestSession | null> {
		try {
			const persisted = await this.storage.loadInProgressSession(bankId);
			if (!persisted || persisted.status !== "in_progress") {
				return null;
			}

			const questions = this.bankService?.getQuestionsByBank
				? await this.bankService.getQuestionsByBank(bankId)
				: [];
			const questionsMap = new Map<string, Card>();
			for (const q of questions) {
				questionsMap.set(q.uuid, q);
			}

			const restored: TestSession = {
				id: persisted.id,
				bankId: persisted.bankId,
				bankName: persisted.bankName,
				mode: persisted.mode,
				startTime: persisted.startTime,
				endTime: persisted.endTime,
				duration: persisted.duration,
				status: persisted.status,
				questions: (persisted.questions || []).map((r) => {
					const question = questionsMap.get(r.questionId);
					return {
						questionId: r.questionId,
						question: question as Card,
						userAnswer: r.userAnswer,
						correctAnswer: r.correctAnswer,
						isCorrect: r.isCorrect,
						timeSpent: r.timeSpent,
						submittedAt: r.submittedAt,
						errorMessage: r.errorMessage,
					};
				}),
				currentQuestionIndex: persisted.currentQuestionIndex,
				score: persisted.score,
				totalQuestions: persisted.totalQuestions,
				correctCount: persisted.correctCount,
				wrongCount: persisted.wrongCount,
				skippedCount: persisted.skippedCount,
				completedQuestions: persisted.completedQuestions,
				incorrectCount: persisted.incorrectCount,
				accuracy: persisted.accuracy,
				totalTimeSpent: persisted.totalTimeSpent,
				completed: persisted.completed,
				abandoned: persisted.abandoned,
				config: persisted.config,
			};

			// 过滤掉已经找不到题目对象的记录（题目被删除的情况）
			const beforeCount = restored.questions.length;
			restored.questions = restored.questions.filter((q) => !!q.question);
			restored.totalQuestions = restored.questions.length;

			// 如果有题目被过滤掉，重新计算统计数据
			if (restored.questions.length < beforeCount) {
				let correctCount = 0;
				let wrongCount = 0;
				let skippedCount = 0;
				let completedQuestions = 0;
				for (const q of restored.questions) {
					if (q.submittedAt) {
						completedQuestions++;
						if (q.isCorrect === true) correctCount++;
						else if (q.isCorrect === false) wrongCount++;
					} else if (q.userAnswer === null && q.timeSpent > 0) {
						skippedCount++;
						completedQuestions++;
					}
				}
				restored.correctCount = correctCount;
				restored.wrongCount = wrongCount;
				restored.incorrectCount = wrongCount;
				restored.skippedCount = skippedCount;
				restored.completedQuestions = completedQuestions;
				restored.accuracy = completedQuestions > 0 ? correctCount / completedQuestions : 0;
			}

			if (restored.currentQuestionIndex >= restored.totalQuestions) {
				restored.currentQuestionIndex = Math.max(0, restored.totalQuestions - 1);
			}

			this.currentSession = restored;
			this.sessionStartTime = new Date(restored.startTime).getTime();
			this.questionStartTime = Date.now();

			return restored;
		} catch (error) {
			logger.error("[TestSessionManager] Restore session failed:", error);
			return null;
		}
	}

	// ==================== 私有方法 ====================

	private recalculateSessionStats(): void {
		if (!this.currentSession) {
			return;
		}

		const session = this.currentSession;
		session.incorrectCount = session.wrongCount;
		const answeredCount = session.correctCount + session.wrongCount;
		session.accuracy = answeredCount > 0 ? session.correctCount / answeredCount : 0;
		session.score = Math.round(TestScoringEngine.scoreSession(session).totalScore);
	}

	/**
	 * 保存会话到存储
	 */
	private async saveSession(session: TestSession): Promise<void> {
		if (isStagingBankId(session.bankId)) {
			return;
		}

		try {
			await this.storage.saveInProgressSession(session.bankId, this.toPersistedSession(session));
		} catch (error) {
			logger.error("[TestSessionManager] Save session failed:", error);
			throw error;
		}
	}

	private toPersistedSession(session: TestSession): PersistedTestSession {
		const questions: PersistedTestQuestionRecord[] = (session.questions || []).map((q) => ({
			questionId: q.questionId,
			userAnswer: q.userAnswer,
			correctAnswer: q.correctAnswer,
			isCorrect: q.isCorrect,
			errorMessage: q.errorMessage,
			timeSpent: q.timeSpent,
			submittedAt: q.submittedAt,
		}));

		return {
			id: session.id,
			bankId: session.bankId,
			bankName: session.bankName,
			mode: session.mode,
			startTime: session.startTime,
			endTime: session.endTime,
			duration: session.duration,
			questions,
			totalQuestions: session.totalQuestions,
			completedQuestions: session.completedQuestions,
			correctCount: session.correctCount,
			incorrectCount: session.incorrectCount,
			wrongCount: session.wrongCount,
			score: session.score,
			accuracy: session.accuracy,
			skippedCount: session.skippedCount,
			status: session.status,
			currentQuestionIndex: session.currentQuestionIndex,
			totalTimeSpent: session.totalTimeSpent,
			completed: session.completed,
			abandoned: session.abandoned,
			config: session.config,
		};
	}

	private async appendHistoryFromCompletedSession(session: TestSession): Promise<void> {
		try {
			const answered = (session.correctCount || 0) + (session.wrongCount || 0);
			const accuracy = answered > 0 ? ((session.correctCount || 0) / answered) * 100 : 0;
			const score =
				typeof session.score === "number"
					? session.score
					: session.totalQuestions
					? Math.round(((session.correctCount || 0) / session.totalQuestions) * 100)
					: 0;
			const durationSeconds = Math.round(
				(session.totalTimeSpent || session.duration || 0)
			);

			const entry: TestHistoryEntry = {
				sessionId: session.id,
				bankId: session.bankId,
				timestamp: session.startTime || new Date().toISOString(),
				mode: session.mode,
				score,
				accuracy,
				totalQuestions: session.totalQuestions || session.questions?.length || 0,
				correctCount: session.correctCount || 0,
				durationSeconds,
				questionSummaries: this.buildHistoryQuestionSummaries(session),
			};

			await this.storage.appendTestHistoryEntry(session.bankId, entry);
		} catch (error) {
			logger.error("[TestSessionManager] 写入历史分数失败:", error);
		}
	}

	/**
	 * 从卡片中提取正确答案
	 *  输入式挖空题按空位顺序提取答案，选择题仍然只认选项中的 {} 标记
	 *  设为public：允许外部在编辑卡片后重新提取正确答案
	 */
	public extractCorrectAnswer(card: Card): string | string[] {
		const availableOptions = this.extractAvailableOptions(card.content);

		if (availableOptions.length === 0 && isInputClozeQuestionContent(card.content)) {
			const answers = extractInputClozeAnswers(card.content);
			if (answers.length === 0) {
				throw new Error("输入式挖空题未找到可判定的答案");
			}

			return answers;
		}

		if (availableOptions.length === 0) {
			throw new Error("无法识别选项格式。请使用 A. 选项内容\\nB. 选项内容 等标准格式");
		}

		const parsed = this.parseAnswerFromContent(card.content);

		// 严格验证
		const validation = this.validateCorrectAnswer(parsed, availableOptions);

		if (!validation.valid) {
			throw new Error(
				`无法获取有效的正确答案。\\n错误原因: ${
					validation.reason
				}\\n可用选项: [${availableOptions.join(
					", "
				)}]\\n请在题干末尾用（B）标明答案，或使用 Answer: B / Answer: A,C`
			);
		}

		return parsed;
	}

	/**
	 * 提取卡片中的所有可用选项标识
	 */
	private extractAvailableOptions(content: string): string[] {
		// 只在---div---之前查找
		const dividerIndex = content.indexOf("---div---");
		const optionsArea = dividerIndex > -1 ? content.substring(0, dividerIndex) : content;

		const lines = optionsArea.split("\n");
		const options: string[] = [];

		for (const line of lines) {
			// 匹配选项格式：A. 或 A、
			const match = line.match(/^\s*([A-Z])[.．、]/);
			if (match) {
				const optionId = match[1];
				if (!options.includes(optionId)) {
					options.push(optionId);
				}
			}
		}

		return options;
	}

	/**
	 * 严格验证正确答案
	 */
	private validateCorrectAnswer(
		answer: string | string[],
		availableOptions: string[]
	): { valid: boolean; reason?: string } {
		// 验证1: 答案不能为空
		if (!answer || (Array.isArray(answer) && answer.length === 0)) {
			return {
				valid: false,
				reason: "未找到正确答案。请在题干末尾写（B）或使用 Answer: 行",
			};
		}

		const answerArray = Array.isArray(answer) ? answer : [answer];

		// 验证2: 每个答案必须是单个大写字母
		for (const a of answerArray) {
			if (typeof a !== "string" || !/^[A-Z]$/.test(a.trim())) {
				return {
					valid: false,
					reason: `答案"${a}"格式错误（必须是A-Z的单个字母）`,
				};
			}
		}

		// 验证3: 每个答案必须在可用选项中存在
		for (const a of answerArray) {
			if (!availableOptions.includes(a.trim())) {
				return {
					valid: false,
					reason: `答案"${a}"不在可用选项[${availableOptions.join(", ")}]中`,
				};
			}
		}

		// 验证4: 多选答案不能重复
		if (answerArray.length !== new Set(answerArray).size) {
			return {
				valid: false,
				reason: "多选答案存在重复",
			};
		}

		return { valid: true };
	}

	/** 从卡片内容解析答案（题干括号 / Answer: 行） */
	private parseAnswerFromContent(content: string): string | string[] {
		const parsed = parseChoiceQuestion(content);
		if (parsed?.correctAnswers?.length) {
			const answers = parsed.correctAnswers.map((a) => a.trim().toUpperCase()).filter(Boolean);
			return answers.length === 1 ? answers[0] : answers;
		}

		return [];
	}

	/**
	 * 检查答案是否正确
	 */
	private checkAnswer(
		userAnswer: string | string[] | null,
		correctAnswer: string | string[] | null,
		question: Card
	): boolean {
		// 如果没有用户答案，肯定错误
		if (
			!userAnswer ||
			(Array.isArray(userAnswer) && userAnswer.length === 0)
		) {
			return false;
		}

		//  如果正确答案为null（格式错误），无法判断对错
		if (!correctAnswer) {
			return false;
		}

		if (
			isInputClozeQuestionContent(question.content) &&
			this.extractAvailableOptions(question.content).length === 0
		) {
			const normalizedUserAnswer = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
			const normalizedCorrectAnswer = Array.isArray(correctAnswer)
				? correctAnswer
				: [correctAnswer];

			return checkInputClozeAnswers(normalizedUserAnswer, normalizedCorrectAnswer);
		}

		// 单选题
		if (typeof correctAnswer === "string" && typeof userAnswer === "string") {
			return userAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase();
		}

		// 多选题（一错全错规则）
		if (Array.isArray(correctAnswer) && Array.isArray(userAnswer)) {
			if (userAnswer.length !== correctAnswer.length) {
				return false;
			}

			const sortedUser = [...userAnswer].map((a) => a.trim().toUpperCase()).sort();
			const sortedCorrect = [...correctAnswer].map((a) => a.trim().toUpperCase()).sort();

			return sortedUser.every((answer, index) => answer === sortedCorrect[index]);
		}

		return false;
	}

	/**
	 * 更新题目的测试统计
	 */
	private async updateQuestionStats(): Promise<void> {
		if (!this.currentSession) {
			return;
		}

		try {
			const statsByUuid = await this.storage.loadGlobalQuestionStats();

			for (const record of this.currentSession.questions) {
				if (record.isCorrect === null) continue;

				const uuid = record.questionId;
				const existing = statsByUuid[uuid];
				const stats: QuestionTestStats = existing || {
					totalAttempts: 0,
					correctAttempts: 0,
					incorrectAttempts: 0,
					accuracy: 0,
					bestScore: 0,
					averageScore: 0,
					lastScore: 0,
					averageResponseTime: 0,
					fastestTime: 0,
					lastTestDate: new Date().toISOString(),
					isInErrorBook: false,
					consecutiveCorrect: 0,
				};

				stats.totalAttempts++;

				if (record.isCorrect) {
					stats.correctAttempts++;
					stats.consecutiveCorrect++;
				} else {
					stats.incorrectAttempts++;
					stats.consecutiveCorrect = 0;
					stats.isInErrorBook = true;
					stats.lastIncorrectDate = record.submittedAt || new Date().toISOString();
				}

				if (stats.isInErrorBook && stats.consecutiveCorrect >= 3) {
					stats.isInErrorBook = false;
				}

				const score = record.isCorrect ? 100 : 0;
				stats.lastScore = score;
				stats.bestScore = Math.max(stats.bestScore || 0, score);
				const prevAvg = stats.averageScore || 0;
				stats.averageScore = (prevAvg * (stats.totalAttempts - 1) + score) / stats.totalAttempts;

				stats.lastTestDate = record.submittedAt || new Date().toISOString();

				if (record.timeSpent > 0) {
					const totalTime = (stats.averageResponseTime || 0) * (stats.totalAttempts - 1);
					stats.averageResponseTime = (totalTime + record.timeSpent) / stats.totalAttempts;
					if ((stats.fastestTime || 0) === 0 || record.timeSpent < (stats.fastestTime || 0)) {
						stats.fastestTime = record.timeSpent;
					}
				}

				// 追加 attempts 历史（用于EWMA）
				const newAttempt: TestAttempt = {
					isCorrect: record.isCorrect,
					mode: this.currentSession.mode,
					timestamp: record.submittedAt || new Date().toISOString(),
					score,
					timeSpent: record.timeSpent * 1000,
				};

				const attempts = [...(stats.attempts || []), newAttempt];
				const uniq = new Map<string, TestAttempt>();
				for (const a of attempts) {
					if (!a?.timestamp) continue;
					uniq.set(a.timestamp, a);
				}
				const mergedAttempts = Array.from(uniq.values()).sort(
					(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
				);

				stats.attempts = mergedAttempts.length > 200 ? mergedAttempts.slice(-200) : mergedAttempts;

				// 使用科学算法计算掌握度
				stats.masteryMetrics = accuracyCalculator.calculateMastery(stats.attempts);

				// 向后兼容：保留旧的accuracy字段
				stats.accuracy = stats.masteryMetrics.historicalAccuracy / 100;

				statsByUuid[uuid] = stats;
			}

			await this.storage.saveGlobalQuestionStats(statsByUuid);
		} catch (error) {
			logger.error("[TestSessionManager] Update question stats failed:", error);
		}
	}

	private async saveSessionArchiveFromCompletedSession(session: TestSession): Promise<void> {
		try {
			const archive = {
				_schemaVersion: "1.0.0",
				sessionId: session.id,
				bankId: session.bankId,
				bankName: session.bankName,
				mode: session.mode,
				startTime: session.startTime,
				endTime: session.endTime,
				score: session.score,
				totalQuestions: session.totalQuestions,
				correctCount: session.correctCount,
				wrongCount: session.wrongCount,
				totalTimeSpent: session.totalTimeSpent,
				questions: (session.questions || []).map((r) => ({
					questionId: r.questionId,
					snapshot: r.question
						? {
								uuid: r.question.uuid,
								content: r.question.content,
								tags: r.question.tags,
								templateId: r.question.templateId,
								cardType: r.question.type,
								created: r.question.created,
								modified: r.question.modified,
						  }
						: null,
					userAnswer: r.userAnswer,
					correctAnswer: r.correctAnswer,
					isCorrect: r.isCorrect,
					timeSpent: r.timeSpent,
					submittedAt: r.submittedAt,
					errorMessage: r.errorMessage,
				})),
			};

			await this.storage.saveSessionArchive(session.bankId, session.id, archive);
		} catch (error) {
			logger.error("[TestSessionManager] 保存会话归档失败:", error);
		}
	}

	/**
	 * 打乱数组顺序（Fisher-Yates 算法）
	 */
	private shuffleArray<T>(array: T[]): T[] {
		const shuffled = [...array];

		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}

		return shuffled;
	}
}
