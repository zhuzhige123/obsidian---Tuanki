import { logger } from "../../utils/logger";
/**
 * 题库数据存储服务
 *
 *  数据结构（v4.0.0 .qbank 单文件格式）：
 * ```
 * weave/question-bank/
 * ├── {题组名称1}.qbank               (题组1，包含所有数据)
 * ├── {题组名称2}.qbank               (题组2，包含所有数据)
 * └── ...
 *
 * .obsidian/plugins/weave/cache/question-bank/
 * ├── in-progress.json                (进行中会话，插件缓存)
 * ├── session-archives.json           (会话归档，插件缓存)
 * └── question-stats.json             (题目统计缓存)
 * ```
 *
 * @module services/question-bank/QuestionBankStorage
 */

import { App } from "obsidian";
import type { QBankFileData, QuestionInBank, QBankStats } from "./QBankFileTypes";
import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import type { Card, Deck } from "../../data/types";
import type {
	ErrorBookEntry,
	PersistedTestSession,
	QuestionRef,
	QuestionTestStats,
	TestHistoryEntry,
	TestHistoryQuestionSummary,
	TestSession,
} from "../../types/question-bank-types";
import { DirectoryUtils } from "../../utils/directory-utils";
import { accuracyCalculator } from "./AccuracyCalculator";
import { safeReadJson, safeWriteJson } from "../../utils/safe-json-io";
import {
	readUnknownBoolean,
	readUnknownNumber,
	readUnknownProperty,
	readUnknownString,
} from "../../utils/dynamic-access";
import { isRecord, parseJsonUnknown, readNumber, readString } from "../../utils/typed-json";
import type { TestAttempt } from "../../types/question-bank-types";

type QBankExtendedData = QBankFileData & {
	refs?: QuestionRef[];
	testHistory?: TestHistoryEntry[];
	errorBook?: ErrorBookEntry[];
};

type StatsAttemptRecord = {
	isCorrect: boolean;
	timestamp: string;
	score?: number;
	timeSpent?: number;
	sessionId?: string;
};

type SessionArchiveOverride = {
	archive: Record<string, unknown> | null;
	removedQuestions: number;
};

type SessionArchiveQuestionSummary = {
	questionId?: string;
	isCorrect?: boolean;
	timeSpent?: number;
};

function readQBankField(
	data: QBankFileData & Record<string, unknown>,
	key: "testHistory" | "errorBook" | "refs" | "questions"
): unknown {
	return readUnknownProperty(data, key);
}

function writeQBankTestHistory(
	data: QBankFileData & Record<string, unknown>,
	entries: TestHistoryEntry[]
): void {
	(data as QBankExtendedData).testHistory = entries;
}

function writeQBankErrorBook(
	data: QBankFileData & Record<string, unknown>,
	entries: ErrorBookEntry[]
): void {
	(data as QBankExtendedData).errorBook = entries;
}

function readSessionArchiveQuestions(archive: Record<string, unknown>): SessionArchiveQuestionSummary[] {
	const rawQuestions = readUnknownProperty(archive, "questions");
	if (!Array.isArray(rawQuestions)) {
		return [];
	}

	const questions: SessionArchiveQuestionSummary[] = [];
	for (const item of rawQuestions) {
		if (!isRecord(item)) {
			continue;
		}
		questions.push({
			questionId: readString(item, "questionId"),
			isCorrect: readUnknownBoolean(item, "isCorrect"),
			timeSpent: readUnknownNumber(item, "timeSpent"),
		});
	}
	return questions;
}

function normalizeFileNameFromPath(path: string): string {
	const normalized = String(path || "").replace(/\\/g, "/").trim();
	if (!normalized) {
		return "";
	}

	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] || normalized;
}

/**
 * 题库数据存储服务
 */
export interface QuestionCardCleanupResult {
	affectedBankIds: string[];
	removedRefs: number;
	removedGlobalStats: number;
	removedErrorBookEntries: number;
	updatedInProgressSessions: number;
	removedInProgressSessions: number;
	updatedSessionArchives: number;
	removedSessionArchives: number;
	updatedHistoryEntries: number;
	removedHistoryEntries: number;
}

export class QuestionBankStorage {
	private app: App;
	private basePath: string;
	private runtimeCacheDir: string;

	constructor(app: App) {
		if (!app || !app.vault) {
			throw new Error("QuestionBankStorage requires a valid App instance with vault");
		}
		this.app = app;
		// 根据当前数据源动态计算路径
		this.basePath = this.getQuestionBankPath();
		this.runtimeCacheDir = `${getPluginPaths(this.app).cache.root}/question-bank`;
		logger.debug("[QuestionBankStorage] Initialized with basePath:", this.basePath);
	}

	normalizeQBankFileDataForPersistence(
		data: (Partial<QBankFileData> & Record<string, unknown>) | null | undefined,
		filePathOrName = ""
	): QBankFileData & Record<string, unknown> {
		const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
		const typed = raw as Partial<QBankFileData>;
		const fileName =
			this.sanitizeFileName(
				normalizeFileNameFromPath(filePathOrName).replace(/\.qbank$/i, "") || "untitled-bank"
			) || "untitled-bank";
		const metadata = typed.metadata && typeof typed.metadata === "object"
			? { ...(typed.metadata as Record<string, unknown>) }
			: {};
		const normalizedCreatedAt =
			typeof metadata.createdAt === "string" && String(metadata.createdAt).trim()
				? String(metadata.createdAt)
				: new Date(0).toISOString();
		const normalizedUpdatedAt =
			typeof metadata.updatedAt === "string" && String(metadata.updatedAt).trim()
				? String(metadata.updatedAt)
				: normalizedCreatedAt;
		const normalizedQuestions = Array.isArray(typed.questions)
			? typed.questions
					.map((question) => this.normalizeQuestionInBank(question))
					.filter((question): question is QuestionInBank => !!question)
			: Array.isArray(readUnknownProperty(raw, "refs"))
				? this.normalizeQuestionRefs(readUnknownProperty(raw, "refs")).map((ref) => ({
						cardUuid: ref.cardUuid,
						addedAt: ref.addedAt,
						testHistory: [],
						stats: this.normalizeQuestionStats(undefined),
					}))
				: [];
		const totalTests = normalizedQuestions.reduce(
			(sum, question) => sum + (question.stats?.totalAttempts || 0),
			0
		);
		const normalizedStats: QBankStats = {
			totalQuestions: normalizedQuestions.length,
			totalTests,
			averageScore:
				typeof typed.stats?.averageScore === "number" ? typed.stats.averageScore : undefined,
			highestScore:
				typeof typed.stats?.highestScore === "number" ? typed.stats.highestScore : undefined,
			lowestScore:
				typeof typed.stats?.lowestScore === "number" ? typed.stats.lowestScore : undefined,
			errorBookCount:
				typeof typed.stats?.errorBookCount === "number"
					? typed.stats.errorBookCount
					: normalizedQuestions.filter((question) => question.stats.isInErrorBook).length,
			lastTestedAt:
				typeof typed.stats?.lastTestedAt === "string" && typed.stats.lastTestedAt.trim()
					? typed.stats.lastTestedAt
					: undefined,
		};

		return {
			...raw,
			id: typeof typed.id === "string" && typed.id.trim() ? typed.id.trim() : fileName,
			name: typeof typed.name === "string" && typed.name.trim() ? typed.name.trim() : fileName,
			description: typeof typed.description === "string" ? typed.description : "",
			deckType: "question-bank",
			refs: undefined,
			metadata: {
				...metadata,
				tags: Array.isArray(metadata.tags)
					? metadata.tags.map((tag) => String(tag)).filter(Boolean)
					: [],
				createdAt: normalizedCreatedAt,
				updatedAt: normalizedUpdatedAt,
			},
			config: {
				defaultMode:
					typeof typed.config?.defaultMode === "string" && typed.config.defaultMode.trim()
						? typed.config.defaultMode
						: "exam",
				defaultQuestionCount:
					typeof typed.config?.defaultQuestionCount === "number"
						? typed.config.defaultQuestionCount
						: undefined,
				defaultTimeLimit:
					typeof typed.config?.defaultTimeLimit === "number"
						? typed.config.defaultTimeLimit
						: undefined,
				enableErrorBook:
					typeof typed.config?.enableErrorBook === "boolean"
						? typed.config.enableErrorBook
						: true,
				showExplanation:
					typeof typed.config?.showExplanation === "boolean"
						? typed.config.showExplanation
						: false,
			},
			questions: normalizedQuestions,
			stats: normalizedStats,
			testHistory: this.normalizeTestHistoryEntries(readUnknownProperty(raw, "testHistory")),
			errorBook: this.normalizeErrorBookEntries(readUnknownProperty(raw, "errorBook")),
		};
	}

	async writeQBankFileData(
		filePath: string,
		data: (QBankFileData & Record<string, unknown>) | null | undefined
	): Promise<void> {
		const raw = data && typeof data === "object" ? ({ ...(data as Record<string, unknown>) } as Record<string, unknown>) : {};
		const rawMetadata = raw.metadata && typeof raw.metadata === "object"
			? { ...(raw.metadata as Record<string, unknown>) }
			: {};
		const now = new Date().toISOString();
		raw.metadata = {
			...rawMetadata,
			createdAt:
				typeof rawMetadata.createdAt === "string" && String(rawMetadata.createdAt).trim()
					? String(rawMetadata.createdAt)
					: now,
			updatedAt: now,
		};
		const normalized = this.normalizeQBankFileDataForPersistence(
			raw as QBankFileData & Record<string, unknown>,
			filePath
		);
		await safeWriteJson(
			this.app.vault.adapter as unknown,
			filePath,
			JSON.stringify(normalized, null, 2),
			this.app as unknown
		);
	}

	private async readQBankJsonFile(
		filePath: string
	): Promise<(QBankFileData & Record<string, unknown>) | null> {
		return await safeReadJson<QBankFileData & Record<string, unknown>>(
			this.app.vault.adapter as unknown,
			filePath,
			this.app as unknown
		);
	}

	private async listQBankFilePaths(): Promise<string[]> {
		return this.app.vault
			.getFiles()
			.filter((file) => file.extension === "qbank" && file.path.startsWith(this.basePath))
			.map((file) => file.path);
	}

	/**
	 * 获取题库文件夹路径（基于当前数据源）
	 */
	private getQuestionBankPath(): string {
		return getV2PathsFromApp(this.app).questionBank.root;
	}

	private getRuntimeInProgressFilePath(): string {
		return `${this.runtimeCacheDir}/in-progress.json`;
	}

	private getRuntimeSessionArchivesFilePath(): string {
		return `${this.runtimeCacheDir}/session-archives.json`;
	}

	private getRuntimeQuestionStatsFilePath(): string {
		return `${this.runtimeCacheDir}/question-stats.json`;
	}

	private buildHistoryQuestionSummaries(questions: unknown[]): TestHistoryQuestionSummary[] {
		if (!Array.isArray(questions) || questions.length === 0) {
			return [];
		}

		return questions.flatMap((question): TestHistoryQuestionSummary[] => {
			if (!isRecord(question)) {
				return [];
			}

			const questionId = readString(question, "questionId")?.trim() ?? "";
			if (!questionId) {
				return [];
			}

			const isCorrectRaw = readUnknownProperty(question, "isCorrect");
			const isCorrect =
				isCorrectRaw === true ? true : isCorrectRaw === false ? false : null;
			const answered =
				readUnknownBoolean(question, "answered") ??
				(isCorrect !== null ||
					(readUnknownProperty(question, "userAnswer") !== null &&
						readUnknownProperty(question, "userAnswer") !== undefined) ||
					Boolean(readUnknownProperty(question, "submittedAt")));
			const rawTimeSpent =
				readUnknownNumber(question, "timeSpentSeconds") ??
				readUnknownNumber(question, "timeSpent") ??
				0;

			return [
				{
					questionId,
					isCorrect,
					answered,
					timeSpentSeconds: Math.max(0, rawTimeSpent),
				},
			];
		});
	}

	private buildHistoryEntryFromQuestionSummaries(
		entry: TestHistoryEntry,
		questionSummaries: TestHistoryQuestionSummary[]
	): TestHistoryEntry {
		const totalQuestions = questionSummaries.length;
		const correctCount = questionSummaries.filter((question) => question.isCorrect === true).length;
		const answeredCount = questionSummaries.filter((question) => question.answered).length;
		const durationSeconds = Math.round(
			questionSummaries.reduce((sum, question) => sum + question.timeSpentSeconds, 0)
		);

		return {
			...entry,
			totalQuestions,
			correctCount,
			score: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
			accuracy: answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0,
			durationSeconds,
			questionSummaries,
		};
	}

	private cleanupTestHistoryEntries(
		entries: TestHistoryEntry[],
		archiveOverrides:
			| Record<string, SessionArchiveOverride>
			| undefined,
		removedCardUuids: Set<string>
	): { entries: TestHistoryEntry[]; updatedEntries: number; removedEntries: number } {
		let updatedEntries = 0;
		let removedEntries = 0;
		const nextEntries: TestHistoryEntry[] = [];

		for (const entry of entries) {
			const embeddedSummaries = this.buildHistoryQuestionSummaries(entry?.questionSummaries || []);
			if (embeddedSummaries.length > 0) {
				const remainingSummaries = embeddedSummaries.filter(
					(question) => !removedCardUuids.has(question.questionId)
				);
				const removedCount = embeddedSummaries.length - remainingSummaries.length;

				if (removedCount === 0) {
					nextEntries.push(entry);
					continue;
				}

				if (remainingSummaries.length === 0) {
					removedEntries += 1;
					continue;
				}

				nextEntries.push(this.buildHistoryEntryFromQuestionSummaries(entry, remainingSummaries));
				updatedEntries += 1;
				continue;
			}

			const override = entry?.sessionId ? archiveOverrides?.[entry.sessionId] : undefined;
			if (!override || override.removedQuestions === 0) {
				nextEntries.push(entry);
				continue;
			}

			if (override.archive === null) {
				removedEntries += 1;
				continue;
			}

			const remainingSummaries = this.buildHistoryQuestionSummaries(
				readSessionArchiveQuestions(override.archive)
			);
			if (remainingSummaries.length === 0) {
				removedEntries += 1;
				continue;
			}

			nextEntries.push(this.buildHistoryEntryFromQuestionSummaries(entry, remainingSummaries));
			updatedEntries += 1;
		}

		return {
			entries: nextEntries,
			updatedEntries,
			removedEntries,
		};
	}

	// ============================================================================
	// 初始化和路径管理
	// ============================================================================

	/**
	 * 初始化存储目录结构
	 */
	async initialize(): Promise<void> {
		const adapter = this.app.vault.adapter;

		if (!(await adapter.exists(this.basePath))) {
			await DirectoryUtils.ensureDirRecursive(adapter, this.basePath);
		}

		if (!(await adapter.exists(this.runtimeCacheDir))) {
			await DirectoryUtils.ensureDirRecursive(adapter, this.runtimeCacheDir);
		}

		await this.migratePerFilesToConsolidated();
		await this.migrateRuntimeFilesToPluginCache();
		await this.migrateLegacyBankStateToQBank();
		await this.migrateLegacyTestSessionsToHistory();
		await this.migratePerBankQuestionStatsToGlobal();
	}

	private computeStatsFromAttempts(
		attempts: Array<{ isCorrect: boolean; timestamp: string; score?: number; timeSpent?: number }>
	): QuestionTestStats {
		const sorted = (attempts || [])
			.filter((a) => a && typeof a.timestamp === "string")
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		const totalAttempts = sorted.length;
		const correctAttempts = sorted.filter((a) => a.isCorrect).length;
		const incorrectAttempts = totalAttempts - correctAttempts;

		let bestScore = 0;
		let lastScore = 0;
		let averageScore = 0;
		let fastestTime = 0;
		let averageResponseTime = 0;
		let totalTime = 0;
		let lastTestDate = new Date().toISOString();
		let lastIncorrectDate: string | undefined = undefined;

		let isInErrorBook = false;
		let consecutiveCorrect = 0;

		for (let i = 0; i < sorted.length; i++) {
			const it = sorted[i];
			const score = typeof it.score === "number" ? it.score : it.isCorrect ? 100 : 0;
			const timeSpentMs = typeof it.timeSpent === "number" ? it.timeSpent : 0;

			lastScore = score;
			bestScore = Math.max(bestScore, score);
			averageScore = (averageScore * i + score) / (i + 1);

			if (timeSpentMs > 0) {
				totalTime += timeSpentMs;
				averageResponseTime = totalTime / (i + 1);
				if (fastestTime === 0 || timeSpentMs < fastestTime) {
					fastestTime = timeSpentMs;
				}
			}

			lastTestDate = it.timestamp;

			if (it.isCorrect) {
				consecutiveCorrect++;
				if (isInErrorBook && consecutiveCorrect >= 3) {
					isInErrorBook = false;
				}
			} else {
				consecutiveCorrect = 0;
				isInErrorBook = true;
				lastIncorrectDate = it.timestamp;
			}
		}

		const history: TestAttempt[] = sorted.map((a) => ({
			isCorrect: !!a.isCorrect,
			mode: "exam",
			timestamp: a.timestamp,
			score: typeof a.score === "number" ? a.score : a.isCorrect ? 100 : 0,
			timeSpent: typeof a.timeSpent === "number" ? a.timeSpent : 0,
		}));

		const masteryMetrics = accuracyCalculator.calculateMastery(history);

		return {
			totalAttempts,
			correctAttempts,
			incorrectAttempts,
			accuracy: masteryMetrics.historicalAccuracy / 100,
			masteryMetrics,
			bestScore,
			averageScore,
			lastScore,
			averageResponseTime,
			fastestTime,
			lastTestDate,
			isInErrorBook,
			consecutiveCorrect,
			lastIncorrectDate,
			attempts: history,
		};
	}

	private readStatsAttempts(attempts: unknown): StatsAttemptRecord[] {
		if (!Array.isArray(attempts)) {
			return [];
		}

		const result: StatsAttemptRecord[] = [];
		for (const item of attempts) {
			if (!isRecord(item)) {
				continue;
			}

			const timestamp = readString(item, "timestamp");
			if (!timestamp) {
				continue;
			}

			result.push({
				isCorrect: item.isCorrect === true,
				timestamp,
				score: readNumber(item, "score"),
				timeSpent: readNumber(item, "timeSpent"),
				sessionId: readString(item, "sessionId"),
			});
		}
		return result;
	}

	private mergeQuestionTestStats(a?: QuestionTestStats, b?: QuestionTestStats): QuestionTestStats {
		if (!a) return b as QuestionTestStats;
		if (!b) return a;

		const attemptsA = this.readStatsAttempts(a.attempts);
		const attemptsB = this.readStatsAttempts(b.attempts);

		const uniq = new Map<string, StatsAttemptRecord>();
		for (const it of [...attemptsA, ...attemptsB]) {
			if (!it.timestamp) continue;
			uniq.set(it.timestamp, it);
		}
		const mergedAttempts = Array.from(uniq.values()).sort(
			(x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime()
		);

		if (mergedAttempts.length > 0) {
			const trimmed = mergedAttempts.length > 200 ? mergedAttempts.slice(-200) : mergedAttempts;
			return this.computeStatsFromAttempts(trimmed);
		}

		return (a.totalAttempts || 0) >= (b.totalAttempts || 0) ? a : b;
	}

	private async migratePerBankQuestionStatsToGlobal(): Promise<void> {
		try {
			const banks = await this.loadBanks();
			if (!banks || banks.length === 0) return;

			const adapter = this.app.vault.adapter;
			const globalStats = await this.loadGlobalQuestionStats();
			let changed = false;

			for (const bank of banks) {
				const filePath = this.getBankQuestionStatsFilePath(bank.id);
				const exists = await adapter.exists(filePath);
				if (!exists) continue;

				const perBank = await this.loadBankQuestionStats(bank.id);
				const uuids = Object.keys(perBank || {});
				if (uuids.length === 0) {
					try {
						await adapter.remove(filePath);
					} catch { /* no-op */ }
					continue;
				}

				for (const uuid of uuids) {
					globalStats[uuid] = this.mergeQuestionTestStats(globalStats[uuid], perBank[uuid]);
					changed = true;
				}

				try {
					await adapter.remove(filePath);
				} catch { /* no-op */ }
			}

			if (changed) {
				await this.saveGlobalQuestionStats(globalStats);
			}
		} catch (error) {
			logger.error("[QuestionBankStorage] 迁移题目统计到全局失败:", error);
		}
	}

	private async cleanupRemovedQBankFiles(retainedBankIds: Set<string>): Promise<void> {
		const qbankFilePaths = await this.listQBankFilePaths();
		for (const filePath of qbankFilePaths) {
			try {
				const raw = await this.app.vault.adapter.read(filePath);
				const parsed = parseJsonUnknown(raw);
				const bankId = readString(isRecord(parsed) ? parsed : {}, "id")?.trim() ?? "";
				if (!bankId || retainedBankIds.has(bankId)) {
					continue;
				}

				await this.app.vault.adapter.remove(filePath);
				logger.info(`[QuestionBankStorage] 已删除残留题组文件: ${filePath}`);
			} catch (error) {
				logger.warn(`[QuestionBankStorage] 清理残留 .qbank 失败: ${filePath}`, error);
			}
		}
	}

	private async loadLegacyBanksFromJson(): Promise<Deck[]> {
		try {
			const legacyBanksPath = getV2PathsFromApp(this.app).questionBank.banks;
			const exists = await this.app.vault.adapter.exists(legacyBanksPath);
			if (!exists) return [];

			const raw = await this.app.vault.adapter.read(legacyBanksPath);
			if (!raw || raw.trim().length === 0) return [];

			const parsed = parseJsonUnknown(raw);
			if (!Array.isArray(parsed)) return [];

			return parsed
				.filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === "string")
				.map((bank) => {
					return {
						id: String(bank.id),
						name: typeof bank.name === "string" ? bank.name : String(bank.id),
						description: typeof bank.description === "string" ? bank.description : "",
						category: typeof bank.category === "string" ? bank.category : "",
						categoryIds: Array.isArray(bank.categoryIds) ? bank.categoryIds.filter((id): id is string => typeof id === "string") : [],
						parentId: typeof bank.parentId === "string" ? bank.parentId : undefined,
						path: typeof bank.path === "string" ? bank.path : (typeof bank.name === "string" ? bank.name : String(bank.id)),
						level: typeof bank.level === "number" ? bank.level : 0,
						order: typeof bank.order === "number" ? bank.order : 0,
						created: typeof bank.created === "string" ? bank.created : new Date().toISOString(),
						modified: typeof bank.modified === "string" ? bank.modified : new Date().toISOString(),
						tags: Array.isArray(bank.tags) ? bank.tags.filter((tag): tag is string => typeof tag === "string") : [],
						settings: isRecord(bank.settings) ? bank.settings : {},
						stats: isRecord(bank.stats) ? bank.stats : {},
						inheritSettings: bank.inheritSettings === true,
						metadata: isRecord(bank.metadata) ? bank.metadata : {},
						deckType: bank.deckType === "question-bank" ? "question-bank" : "question-bank",
						includeSubdecks: bank.includeSubdecks === true,
					} as Deck;
				});
		} catch (error) {
			logger.warn("[QuestionBankStorage] 回退加载 legacy banks.json 失败:", error);
			return [];
		}
	}

	private async migrateLegacyBankStateToQBank(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const legacyPaths = getV2PathsFromApp(this.app).questionBank;

		const legacyHistoryByBank = await this.loadConsolidatedMap<TestHistoryEntry[]>(
			legacyPaths.testHistory
		);
		const legacyErrorBookByBank = await this.loadConsolidatedMap<ErrorBookEntry[]>(legacyPaths.errorBook);

		if (
			Object.keys(legacyHistoryByBank).length === 0 &&
			Object.keys(legacyErrorBookByBank).length === 0
		) {
			return;
		}

		const banks = await this.loadBanks();
		for (const bank of banks) {
			const qbankRecord = await this.readQBankDataByBankId(bank.id);
			if (!qbankRecord) {
				continue;
			}

			let changed = false;

			const legacyHistory = this.normalizeTestHistoryEntries(legacyHistoryByBank[bank.id]);
			if (legacyHistory.length > 0) {
				const existingHistory = this.normalizeTestHistoryEntries(
					readQBankField(qbankRecord.data, "testHistory")
				);
				writeQBankTestHistory(
					qbankRecord.data,
					this.mergeTestHistoryEntries(existingHistory, legacyHistory)
				);
				changed = true;
			}

			const legacyErrorBook = this.normalizeErrorBookEntries(legacyErrorBookByBank[bank.id]);
			if (legacyErrorBook.length > 0) {
				const existingErrorBook = this.normalizeErrorBookEntries(
					readQBankField(qbankRecord.data, "errorBook")
				);
				writeQBankErrorBook(
					qbankRecord.data,
					this.mergeErrorBookEntries(existingErrorBook, legacyErrorBook)
				);
				changed = true;
			}

			if (changed) {
				await this.writeQBankFileData(qbankRecord.filePath, qbankRecord.data);
			}
		}

		if (Object.keys(legacyHistoryByBank).length === 0) {
			if (await adapter.exists(legacyPaths.testHistory)) {
				await adapter.remove(legacyPaths.testHistory);
			}
		} else {
			await this.saveConsolidatedMap(legacyPaths.testHistory, legacyHistoryByBank);
		}

		if (Object.keys(legacyErrorBookByBank).length === 0) {
			if (await adapter.exists(legacyPaths.errorBook)) {
				await adapter.remove(legacyPaths.errorBook);
			}
		} else {
			await this.saveConsolidatedMap(legacyPaths.errorBook, legacyErrorBookByBank);
		}
	}

	/**
	 * 获取文件完整路径
	 */
	private getFilePath(filename: string): string {
		return `${this.basePath}/${filename}`;
	}

	// ============================================================================
	// 考试题组存储
	// ============================================================================

	/**
	 * 保存考试题组列表（新格式：直接生成 .qbank 文件）
	 */
	async saveBanks(banks: Deck[]): Promise<void> {
		try {
			const retainedBankIds = new Set(
				banks.map((bank) => String(bank?.id || "").trim()).filter(Boolean)
			);

			// 为每个题组生成/更新 .qbank 文件
			for (const bank of banks) {
				await this.saveQBankFile(bank);
			}
			await this.cleanupRemovedQBankFiles(retainedBankIds);
			logger.debug("[QuestionBankStorage] 已保存所有题组为 .qbank 文件，题库数:", banks.length);
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存考试题组失败:", error);
			throw new Error(
				`保存考试题组失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * 保存单个题组为 .qbank 文件
	 */
	private async saveQBankFile(bank: Deck): Promise<void> {
		try {
			const bankId = bank.id;
			const existingQbankRecord = await this.readQBankDataByBankId(bankId);
			const existingTestHistory = this.normalizeTestHistoryEntries(
				readQBankField(existingQbankRecord?.data ?? {}, "testHistory")
			);
			const existingErrorBook = this.normalizeErrorBookEntries(
				readQBankField(existingQbankRecord?.data ?? {}, "errorBook")
			);

			// 1. 读取题目引用
			const refs = await this.loadBankQuestionRefs(bankId);

			// 2. 读取题目统计
			const globalStats = await this.loadGlobalQuestionStats();

			// 3. 构建题目数据（包含统计信息）
			const questions: QuestionInBank[] = refs.map((ref) => {
				const stats = globalStats[ref.cardUuid];
				const normalizedAttempts: QuestionInBank["testHistory"] = Array.isArray(stats?.attempts)
					? stats.attempts.flatMap((attempt, index): QuestionInBank["testHistory"] => {
							if (!isRecord(attempt)) {
								return [];
							}

							const sessionId = readString(attempt, "sessionId")?.trim();
							const timestamp = readString(attempt, "timestamp")?.trim();
							return [
								{
									sessionId: sessionId && sessionId.length > 0 ? sessionId : `${ref.cardUuid}-${index + 1}`,
									timestamp: timestamp && timestamp.length > 0 ? timestamp : new Date().toISOString(),
									isCorrect: attempt.isCorrect === true,
									score: readNumber(attempt, "score") ?? 0,
									timeSpent: readNumber(attempt, "timeSpent") ?? 0,
									mode: "exam",
								},
							];
					  })
					: [];
				return {
					cardUuid: ref.cardUuid,
					addedAt: ref.addedAt,
					testHistory: normalizedAttempts,
					stats: {
						totalAttempts: stats?.totalAttempts || 0,
						correctAttempts: stats?.correctAttempts || 0,
						accuracy: stats?.accuracy || 0,
						isInErrorBook: stats?.isInErrorBook || false,
						lastTestedAt: stats?.lastTestDate,
						averageTimeSpent: stats?.averageResponseTime,
						highestScore: stats?.bestScore,
					}
				};
			});

			// 4. 计算题库统计
			const stats: QBankStats = {
				totalQuestions: questions.length,
				totalTests: questions.reduce((sum, q) => sum + q.stats.totalAttempts, 0),
				averageScore: this.calculateAverageScore(questions),
				highestScore: this.calculateHighestScore(questions),
				lowestScore: this.calculateLowestScore(questions),
				errorBookCount: questions.filter(q => q.stats.isInErrorBook).length,
				lastTestedAt: this.calculateLastTestedAt(questions),
			};

			// 5. 构建 .qbank 文件数据
			const qbankData: QBankExtendedData = {
				id: bankId,
				name: bank.name,
				description: bank.description || '',
				deckType: 'question-bank',
				metadata: {
					pairedMemoryDeckId: readUnknownString(bank.metadata, "pairedMemoryDeckId"),
					tags: bank.tags || [],
					createdAt: bank.created || new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				config: {
					defaultMode: 'exam',
					defaultQuestionCount: undefined,
					defaultTimeLimit: undefined,
					enableErrorBook: true,
					showExplanation: false,
				},
				questions,
				stats,
				testHistory: existingTestHistory,
				errorBook: existingErrorBook,
			};

			// 6. 生成文件路径（使用题组名称）
			const filePath =
				existingQbankRecord?.filePath ||
				`${this.basePath}/${this.sanitizeFileName(bank.name)}.qbank`;

			// 7. 写入文件
			await this.writeQBankFileData(filePath, qbankData as QBankFileData & Record<string, unknown>);

			logger.debug(`[QuestionBankStorage] 已保存 .qbank 文件: ${filePath}`);
		} catch (error) {
			logger.error(`[QuestionBankStorage] 保存 .qbank 文件失败: ${bank.name}`, error);
			throw error;
		}
	}

	/**
	 * 清理文件名（移除不安全字符）
	 */
	private sanitizeFileName(name: string): string {
		return name
			.replace(/[<>:"/\\|?*]/g, '_')  // 替换不安全字符
			.replace(/\s+/g, '_')            // 空格替换为下划线
			.replace(/_{2,}/g, '_')          // 多个下划线合并
			.trim();
	}

	/**
	 * 计算平均分
	 */
	private calculateAverageScore(questions: QuestionInBank[]): number {
		const scores = questions
			.filter(q => q.stats.highestScore !== undefined)
			.map(q => q.stats.highestScore!);
		return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
	}

	/**
	 * 计算最高分
	 */
	private calculateHighestScore(questions: QuestionInBank[]): number {
		const scores = questions
			.filter(q => q.stats.highestScore !== undefined)
			.map(q => q.stats.highestScore!);
		return scores.length > 0 ? Math.max(...scores) : 0;
	}

	/**
	 * 计算最低分
	 */
	private calculateLowestScore(questions: QuestionInBank[]): number {
		const scores = questions
			.filter(q => q.stats.highestScore !== undefined)
			.map(q => q.stats.highestScore!);
		return scores.length > 0 ? Math.min(...scores) : 0;
	}

	/**
	 * 计算最后测试时间
	 */
	private calculateLastTestedAt(questions: QuestionInBank[]): string | undefined {
		const dates = questions
			.filter(q => q.stats.lastTestedAt)
			.map(q => new Date(q.stats.lastTestedAt!).getTime());
		return dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : undefined;
	}

	async saveGlobalQuestionStats(statsByUuid: Record<string, QuestionTestStats>): Promise<void> {
		const filePath = this.getGlobalQuestionStatsFilePath();
		const payload = {
			_schemaVersion: "1.0.0",
			statsByUuid,
		};

		try {
			await this.app.vault.adapter.write(filePath, JSON.stringify(payload));
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存全局题目统计失败:", error);
			throw new Error(
				`保存全局题目统计失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async loadGlobalQuestionStats(): Promise<Record<string, QuestionTestStats>> {
		const filePath = this.getGlobalQuestionStatsFilePath();

		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) return {};
			const data = await this.app.vault.adapter.read(filePath);
			if (!data || data.trim().length === 0) return {};
			const parsed = parseJsonUnknown(data);
			const stats = isRecord(parsed) ? parsed.statsByUuid : undefined;
			return isRecord(stats) ? (stats as Record<string, QuestionTestStats>) : {};
		} catch (error) {
			logger.error("[QuestionBankStorage] 加载全局题目统计失败:", error);
			return {};
		}
	}

	/**
	 * 加载考试题组列表（新格式：只读取 .qbank 文件）
	 */
	async loadBanks(): Promise<Deck[]> {
		try {
			// 只扫描 .qbank 文件
			const qbankFilePaths = await this.listQBankFilePaths();

			if (qbankFilePaths.length === 0) {
				const legacyBanks = await this.loadLegacyBanksFromJson();
				if (legacyBanks.length > 0) {
					logger.debug(`[QuestionBankStorage] 未找到 .qbank 文件，回退加载 legacy banks.json: ${legacyBanks.length}`);
					return legacyBanks;
				}
				logger.debug("[QuestionBankStorage] 未找到 .qbank 文件");
				return [];
			}

			const banks: Deck[] = [];

			for (const filePath of qbankFilePaths) {
				try {
					const qbankData = await this.readQBankJsonFile(filePath);
					if (!qbankData) {
						throw new Error(`.qbank 文件读取失败: ${filePath}`);
					}

					// 转换为 Deck 格式
					const deck: Deck = {
						id: qbankData.id,
						name: qbankData.name,
						description: qbankData.description || '',
						deckType: 'question-bank',
						metadata: qbankData.metadata || {},
						created: qbankData.metadata?.createdAt || new Date().toISOString(),
						modified: qbankData.metadata?.updatedAt || new Date().toISOString(),
						tags: qbankData.metadata?.tags || [],
						// 平级架构字段
						category: '',
						categoryIds: [],
						parentId: undefined,
						path: qbankData.name,
						level: 0,
						order: 0,
						inheritSettings: false,
						settings: {},
						stats: {},
						includeSubdecks: false,
					};

					banks.push(deck);
				} catch (error) {
					logger.error(`[QuestionBankStorage] 解析 .qbank 文件失败: ${filePath}`, error);
				}
			}

			logger.debug(`[QuestionBankStorage] 加载了 ${banks.length} 个题组`);
			return banks;
		} catch (error) {
			logger.error("[QuestionBankStorage] 加载考试题组失败:", error);
			return [];
		}
	}

	// ============================================================================
	// 题目卡片存储（按题库分离）
	// ============================================================================

	private getBankDir(bankId: string): string {
		return `${this.basePath}/banks/${bankId}`;
	}

	private async ensureBankDir(bankId: string): Promise<void> {
		const adapter = this.app.vault.adapter;
		const banksDir = `${this.basePath}/banks`;
		if (!(await adapter.exists(banksDir))) {
			await DirectoryUtils.ensureDirRecursive(adapter, banksDir);
		}

		const bankDir = this.getBankDir(bankId);
		if (!(await adapter.exists(bankDir))) {
			await DirectoryUtils.ensureDirRecursive(adapter, bankDir);
		}
	}

	private getBankQuestionRefsFilePath(bankId: string): string {
		return `${this.getBankDir(bankId)}/questions.json`;
	}

	private getBankQuestionStatsFilePath(bankId: string): string {
		return `${this.getBankDir(bankId)}/question-stats.json`;
	}

	private getGlobalQuestionStatsFilePath(): string {
		return this.getRuntimeQuestionStatsFilePath();
	}

	private async loadStatsMapFromFile(filePath: string): Promise<Record<string, QuestionTestStats>> {
		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) return {};
			const data = await this.app.vault.adapter.read(filePath);
			if (!data || data.trim().length === 0) return {};
			const parsed = parseJsonUnknown(data);
			const stats = isRecord(parsed) ? parsed.statsByUuid : undefined;
			return isRecord(stats) ? (stats as Record<string, QuestionTestStats>) : {};
		} catch {
			return { /* no-op */ };
		}
	}

	private async saveStatsMapToFile(
		filePath: string,
		statsByUuid: Record<string, QuestionTestStats>
	): Promise<void> {
		const payload = {
			_schemaVersion: "1.0.0",
			statsByUuid,
		};
		await this.app.vault.adapter.write(filePath, JSON.stringify(payload));
	}

	private normalizeTestHistoryEntries(entries: unknown): TestHistoryEntry[] {
		if (!Array.isArray(entries)) {
			return [];
		}

		return entries.filter((entry): entry is TestHistoryEntry => {
			return isRecord(entry) && typeof entry.sessionId === "string";
		});
	}

	private normalizeErrorBookEntries(entries: unknown): ErrorBookEntry[] {
		if (!Array.isArray(entries)) {
			return [];
		}

		return entries.filter((entry): entry is ErrorBookEntry => {
			return isRecord(entry) && typeof entry.cardId === "string";
		});
	}

	private mergeTestHistoryEntries(
		existingEntries: TestHistoryEntry[],
		incomingEntries: TestHistoryEntry[]
	): TestHistoryEntry[] {
		const merged = new Map<string, TestHistoryEntry>();

		for (const entry of incomingEntries) {
			if (!entry?.sessionId) {
				continue;
			}
			merged.set(entry.sessionId, entry);
		}

		for (const entry of existingEntries) {
			if (!entry?.sessionId) {
				continue;
			}
			merged.set(entry.sessionId, entry);
		}

		return Array.from(merged.values()).sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	}

	private mergeErrorBookEntries(
		existingEntries: ErrorBookEntry[],
		incomingEntries: ErrorBookEntry[]
	): ErrorBookEntry[] {
		const merged = new Map<string, ErrorBookEntry>();

		for (const entry of incomingEntries) {
			if (!entry?.cardId) {
				continue;
			}
			merged.set(entry.cardId, entry);
		}

		for (const entry of existingEntries) {
			if (!entry?.cardId) {
				continue;
			}
			merged.set(entry.cardId, entry);
		}

		return Array.from(merged.values());
	}

	private async migrateRuntimeFilesToPluginCache(): Promise<void> {
		const legacyPaths = getV2PathsFromApp(this.app).questionBank;

		try {
			const legacyInProgress = await this.loadConsolidatedMap<PersistedTestSession>(legacyPaths.inProgress);
			const runtimeInProgress = await this.loadConsolidatedMap<PersistedTestSession>(
				this.getRuntimeInProgressFilePath()
			);
			const mergedInProgress = { ...legacyInProgress, ...runtimeInProgress };
			if (Object.keys(mergedInProgress).length > 0) {
				await this.saveConsolidatedMap(this.getRuntimeInProgressFilePath(), mergedInProgress);
			}
		} catch (error) {
			logger.error("[QuestionBankStorage] 迁移 in-progress 到插件缓存失败:", error);
		}

		try {
			const legacyArchives = await this.loadConsolidatedMap<Record<string, unknown>>(
				legacyPaths.sessionArchives
			);
			const runtimeArchives = await this.loadConsolidatedMap<Record<string, unknown>>(
				this.getRuntimeSessionArchivesFilePath()
			);
			const mergedArchives = { ...legacyArchives, ...runtimeArchives };
			if (Object.keys(mergedArchives).length > 0) {
				await this.saveConsolidatedMap(this.getRuntimeSessionArchivesFilePath(), mergedArchives);
			}
		} catch (error) {
			logger.error("[QuestionBankStorage] 迁移 session-archives 到插件缓存失败:", error);
		}

		try {
			const legacyStats = await this.loadStatsMapFromFile(legacyPaths.questionStats);
			const runtimeStats = await this.loadStatsMapFromFile(this.getRuntimeQuestionStatsFilePath());
			const mergedStats = { ...legacyStats, ...runtimeStats };
			if (Object.keys(mergedStats).length > 0) {
				await this.saveStatsMapToFile(this.getRuntimeQuestionStatsFilePath(), mergedStats);
			}
		} catch (error) {
			logger.error("[QuestionBankStorage] 迁移 question-stats 到插件缓存失败:", error);
		}
	}

	private async loadConsolidatedMap<T>(filePath: string): Promise<Record<string, T>> {
		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) return {};
			const data = await this.app.vault.adapter.read(filePath);
			if (!data || data.trim().length === 0) return {};
			const parsed = parseJsonUnknown(data);
			if (!isRecord(parsed)) return {};
			const byBank = parsed.byBank;
			if (!isRecord(byBank)) return {};
			return byBank as Record<string, T>;
		} catch {
			return { /* no-op */ };
		}
	}

	private async saveConsolidatedMap<T>(filePath: string, byBank: Record<string, T>): Promise<void> {
		const payload = { _schemaVersion: "2.0.0", byBank };
		await this.app.vault.adapter.write(filePath, JSON.stringify(payload));
	}

	private normalizeQuestionAddedAt(value: unknown): string {
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				const parsed = Date.parse(trimmed);
				if (!Number.isNaN(parsed)) {
					return new Date(parsed).toISOString();
				}
			}
		}

		if (typeof value === "number" && Number.isFinite(value)) {
			return new Date(value).toISOString();
		}

		return new Date().toISOString();
	}

	private normalizeQuestionStats(stats: unknown): QuestionInBank["stats"] {
		const raw = stats && typeof stats === "object" ? (stats as Record<string, unknown>) : {};

		return {
			totalAttempts: typeof raw.totalAttempts === "number" ? raw.totalAttempts : 0,
			correctAttempts: typeof raw.correctAttempts === "number" ? raw.correctAttempts : 0,
			accuracy: typeof raw.accuracy === "number" ? raw.accuracy : 0,
			isInErrorBook: raw.isInErrorBook === true,
			lastTestedAt: typeof raw.lastTestedAt === "string" ? raw.lastTestedAt : undefined,
			averageTimeSpent: typeof raw.averageTimeSpent === "number" ? raw.averageTimeSpent : undefined,
			highestScore: typeof raw.highestScore === "number" ? raw.highestScore : undefined,
			lowestScore: typeof raw.lowestScore === "number" ? raw.lowestScore : undefined,
		};
	}

	private normalizeQuestionInBank(question: unknown): QuestionInBank | null {
		if (!isRecord(question)) {
			return null;
		}

		const cardUuidSource =
			readString(question, "cardUuid") ??
			readString(question, "uuid") ??
			"";
		const cardUuid = cardUuidSource.trim();
		if (!cardUuid) {
			return null;
		}

		const testHistory = readUnknownProperty(question, "testHistory");

		return {
			cardUuid,
			addedAt: this.normalizeQuestionAddedAt(readUnknownProperty(question, "addedAt")),
			testHistory: Array.isArray(testHistory) ? (testHistory as QuestionInBank["testHistory"]) : [],
			stats: this.normalizeQuestionStats(readUnknownProperty(question, "stats")),
		};
	}

	private normalizeQuestionRefs(refs: unknown): QuestionRef[] {
		if (!Array.isArray(refs)) {
			return [];
		}

		const normalized: QuestionRef[] = [];
		const seen = new Set<string>();

		for (const ref of refs) {
			const cardUuid =
				readUnknownString(ref, "cardUuid")?.trim() ??
				readUnknownString(ref, "uuid")?.trim() ??
				"";
			if (!cardUuid || seen.has(cardUuid)) {
				continue;
			}

			const addedAtSource = isRecord(ref) ? readUnknownProperty(ref, "addedAt") : undefined;

			normalized.push({
				cardUuid,
				addedAt: this.normalizeQuestionAddedAt(addedAtSource),
			});
			seen.add(cardUuid);
		}

		return normalized;
	}

	async saveBankQuestionRefs(bankId: string, refs: QuestionRef[]): Promise<void> {
		if (!Array.isArray(refs)) {
			const errorMsg = `saveBankQuestionRefs 期望数组参数，但得到: ${typeof refs}`;
			logger.error(`[QuestionBankStorage] ${errorMsg}`);
			throw new Error(errorMsg);
		}

		try {
			// 1. 找到对应的 .qbank 文件
			const qbankFile = await this.findQBankFileByBankId(bankId);
			if (!qbankFile) {
				throw new Error(`找不到题库 ${bankId} 的 .qbank 文件`);
			}

			// 2. 读取现有数据
			const data = await this.readQBankJsonFile(qbankFile);
			if (!data) {
				throw new Error(`.qbank 文件读取失败: ${qbankFile}`);
			}
			const normalizedRefs = this.normalizeQuestionRefs(refs);
			const legacyRefs = readUnknownProperty(data, "refs");
			const isLegacyRefFile = Array.isArray(legacyRefs);

			// 3. 更新题目引用（保留现有测试历史和统计）
			const existingByUuid = new Map<string, QuestionInBank>();
			for (const question of Array.isArray(data.questions) ? data.questions : []) {
				const normalized = this.normalizeQuestionInBank(question);
				if (!normalized) {
					continue;
				}
				existingByUuid.set(normalized.cardUuid, normalized);
			}

			data.questions = normalizedRefs.map((ref) => {
				const preserved = existingByUuid.get(ref.cardUuid);
				if (preserved) {
					return {
						...preserved,
						addedAt: ref.addedAt,
					};
				}

				return {
					cardUuid: ref.cardUuid,
					addedAt: ref.addedAt,
					testHistory: [],
					stats: this.normalizeQuestionStats(undefined),
				};
			});

			if (isLegacyRefFile) {
				(data as QBankExtendedData).refs = normalizedRefs;
			}

			if (!data.stats) {
				data.stats = {
					totalQuestions: data.questions.length,
					totalTests: 0,
				};
			} else {
				data.stats.totalQuestions = data.questions.length;
			}

			// 4. 写回文件
			await this.writeQBankFileData(qbankFile, data);
			logger.debug(
				`[QuestionBankStorage] 已更新 .qbank 文件题目引用: ${bankId}, 数量: ${normalizedRefs.length}`
			);
		} catch (error) {
			logger.error("[QuestionBankStorage] 更新 .qbank 文件题目引用失败:", error);
			throw new Error(
				`更新 .qbank 文件题目引用失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async loadBankQuestionRefs(bankId: string): Promise<QuestionRef[]> {
		try {
			// 1. 找到对应的 .qbank 文件
			const qbankFile = await this.findQBankFileByBankId(bankId);
			if (!qbankFile) {
				logger.warn(`[QuestionBankStorage] 未找到题库的 .qbank 文件: ${bankId}`);
				return [];
			}

			// 2. 读取文件
			const qbankData = await this.readQBankJsonFile(qbankFile);
			if (!qbankData) {
				logger.warn(`[QuestionBankStorage] 读取 .qbank 文件失败: ${qbankFile}`);
				return [];
			}
			const legacyRefs = readQBankField(qbankData, "refs");
			if (Array.isArray(legacyRefs)) {
				return this.normalizeQuestionRefs(legacyRefs);
			}

			const rawQuestions = readQBankField(qbankData, "questions");
			const questionItems = Array.isArray(rawQuestions) ? rawQuestions : [];

			const normalizedQuestions: QuestionInBank[] = [];
			let hasLegacyShape = false;

			for (const question of questionItems) {
				const normalized = this.normalizeQuestionInBank(question);
				if (!normalized) {
					hasLegacyShape = true;
					continue;
				}

				if (
					!isRecord(question) ||
					readString(question, "cardUuid") !== normalized.cardUuid ||
					typeof readString(question, "addedAt") !== "string" ||
					!Array.isArray(readUnknownProperty(question, "testHistory")) ||
					!isRecord(readUnknownProperty(question, "stats"))
				) {
					hasLegacyShape = true;
				}

				normalizedQuestions.push(normalized);
			}

			if (hasLegacyShape || normalizedQuestions.length !== questionItems.length) {
				qbankData.questions = normalizedQuestions;
				if (qbankData.stats) {
					qbankData.stats.totalQuestions = normalizedQuestions.length;
				}
				await this.writeQBankFileData(qbankFile, qbankData);
				logger.info(`[QuestionBankStorage] 已自修复题库题目引用结构: ${bankId}`);
			}

			// 3. 提取题目引用
			return normalizedQuestions.map((q) => ({
				cardUuid: q.cardUuid,
				addedAt: q.addedAt,
			}));
		} catch (error) {
			logger.error(`[QuestionBankStorage] 加载题目引用失败: ${bankId}`, error);
			return [];
		}
	}

	/**
	 * 根据 bankId 查找 .qbank 文件
	 */
	private async findQBankFileByBankId(bankId: string): Promise<string | null> {
		const qbankFilePaths = await this.listQBankFilePaths();

		for (const filePath of qbankFilePaths) {
			try {
				const data = await this.readQBankJsonFile(filePath);
				if (!data) {
					continue;
				}
				if (data.id === bankId) {
					return filePath;
				}
			} catch {
				continue;
			}
		}

		const legacyRefsPath = this.getBankQuestionRefsFilePath(bankId);
		try {
			if (await this.app.vault.adapter.exists(legacyRefsPath)) {
				return legacyRefsPath;
			}
		} catch { /* no-op */ }

		return null;
	}

	private async readQBankDataByBankId(
		bankId: string
	): Promise<{ filePath: string; data: QBankFileData & Record<string, unknown> } | null> {
		const qbankFile = await this.findQBankFileByBankId(bankId);
		if (!qbankFile) {
			return null;
		}

		const data = await this.readQBankJsonFile(qbankFile);
		if (!data) {
			return null;
		}
		return { filePath: qbankFile, data };
	}

	async saveBankQuestionStats(
		bankId: string,
		statsByUuid: Record<string, QuestionTestStats>
	): Promise<void> {
		await this.ensureBankDir(bankId);
		const filePath = this.getBankQuestionStatsFilePath(bankId);
		const payload = {
			_schemaVersion: "1.0.0",
			bankId,
			statsByUuid,
		};

		try {
			await this.app.vault.adapter.write(filePath, JSON.stringify(payload));
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存题库题目统计失败:", error);
			throw new Error(
				`保存题库题目统计失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async loadBankQuestionStats(bankId: string): Promise<Record<string, QuestionTestStats>> {
		const filePath = this.getBankQuestionStatsFilePath(bankId);

		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) return {};
			const data = await this.app.vault.adapter.read(filePath);
			if (!data || data.trim().length === 0) return {};
			const parsed = parseJsonUnknown(data);
			const stats = isRecord(parsed) ? parsed.statsByUuid : undefined;
			return isRecord(stats) ? (stats as Record<string, QuestionTestStats>) : {};
		} catch (error) {
			logger.error("[QuestionBankStorage] 加载题库题目统计失败:", error);
			return {};
		}
	}

	async saveSessionArchive(bankId: string, sessionId: string, archive: unknown): Promise<void> {
		const filePath = this.getRuntimeSessionArchivesFilePath();
		const all = await this.loadConsolidatedMap<Record<string, unknown>>(filePath);
		if (!all[bankId]) all[bankId] = {};
		all[bankId][sessionId] = archive;
		try {
			await this.saveConsolidatedMap(filePath, all);
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存会话归档失败:", error);
			throw new Error(
				`保存会话归档失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * 保存题库的题目列表（单文件存储）
	 * 每个题库的所有题目存储在一个 questions.json 文件中
	 * @param bankId 题库ID
	 * @param questions 题目列表
	 */
	async saveBankQuestions(bankId: string, questions: Card[]): Promise<void> {
		//  参数验证：确保传入的是数组
		if (!Array.isArray(questions)) {
			const errorMsg = `saveBankQuestions 期望数组参数，但得到: ${typeof questions}`;
			logger.error(`[QuestionBankStorage] ${errorMsg}`);
			throw new Error(errorMsg);
		}

		// 确保目录存在
		const bankDir = `${this.basePath}/banks/${bankId}`;
		if (!(await this.app.vault.adapter.exists(bankDir))) {
			await DirectoryUtils.ensureDirRecursive(this.app.vault.adapter, bankDir);
		}

		const filePath = `${bankDir}/questions.json`;
		const payload = {
			_schemaVersion: "1.0.0",
			bankId,
			questions,
		};
		const data = JSON.stringify(payload);

		try {
			await this.app.vault.adapter.write(filePath, data);
			logger.debug(`[QuestionBankStorage] 已保存题库题目: ${bankId}, 题目数: ${questions.length}`);
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存题库题目失败:", error);
			throw new Error(
				`保存题库题目失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * 加载题库的题目列表（单文件存储）
	 * @param bankId 题库ID
	 */
	async loadBankQuestions(bankId: string): Promise<Card[]> {
		const filePath = `${this.basePath}/banks/${bankId}/questions.json`;

		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) {
				return [];
			}

			const data = await this.app.vault.adapter.read(filePath);

			//  增强错误处理：检查空文件和格式错误
			if (!data || data.trim().length === 0) {
				logger.warn(`[QuestionBankStorage] 题库题目文件为空: ${bankId}`);
				return [];
			}

			const parsed = parseJsonUnknown(data);

			const questions = isRecord(parsed) ? parsed.questions : undefined;
			if (!Array.isArray(questions)) {
				logger.error(
					`[QuestionBankStorage] 题目数据格式错误，期望数组但得到: ${typeof questions}`
				);
				return [];
			}

			return questions.filter((item): item is Card => isRecord(item));
		} catch (error) {
			logger.error(`[QuestionBankStorage] 加载题库题目失败: ${bankId}`, error);
			return [];
		}
	}

	// 按题库分离存储：每个题库一个文件夹，一个 questions.json 文件
	// 类似记忆牌组的 decks/{deckId}/cards.json 结构

	// ============================================================================
	// 测试会话存储
	// ============================================================================

	async saveInProgressSession(bankId: string, session: PersistedTestSession): Promise<void> {
		const filePath = this.getRuntimeInProgressFilePath();
		const all = await this.loadConsolidatedMap<PersistedTestSession>(filePath);
		all[bankId] = session;
		try {
			await this.saveConsolidatedMap(filePath, all);
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存进行中会话失败:", error);
			throw new Error(
				`保存进行中会话失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async loadInProgressSession(bankId: string): Promise<PersistedTestSession | null> {
		const filePath = this.getRuntimeInProgressFilePath();
		const all = await this.loadConsolidatedMap<PersistedTestSession>(filePath);
		return all[bankId] || null;
	}

	async clearInProgressSession(bankId: string): Promise<void> {
		const filePath = this.getRuntimeInProgressFilePath();
		const all = await this.loadConsolidatedMap<PersistedTestSession>(filePath);
		if (bankId in all) {
			delete all[bankId];
			try {
				await this.saveConsolidatedMap(filePath, all);
			} catch (error) {
				logger.error("[QuestionBankStorage] 清理进行中会话失败:", error);
			}
		}
	}

	async loadTestHistory(bankId: string): Promise<TestHistoryEntry[]> {
		try {
			const qbankRecord = await this.readQBankDataByBankId(bankId);
			if (!qbankRecord) {
				return [];
			}

			return this.normalizeTestHistoryEntries(readQBankField(qbankRecord.data, "testHistory"));
		} catch (error) {
			logger.error("[QuestionBankStorage] 加载测试历史失败:", error);
			return [];
		}
	}

	async appendTestHistoryEntry(
		bankId: string,
		entry: TestHistoryEntry,
		maxEntries = 200
	): Promise<void> {
		const qbankRecord = await this.readQBankDataByBankId(bankId);
		if (!qbankRecord) {
			throw new Error(`找不到题库 ${bankId} 的 .qbank 文件`);
		}

		const history = this.normalizeTestHistoryEntries(readQBankField(qbankRecord.data, "testHistory"));

		const map = new Map<string, TestHistoryEntry>();
		for (const it of history) {
			if (it?.sessionId) map.set(it.sessionId, it);
		}
		map.set(entry.sessionId, entry);

		const merged = Array.from(map.values()).sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);

		writeQBankTestHistory(
			qbankRecord.data,
			merged.length > maxEntries ? merged.slice(-maxEntries) : merged
		);
		try {
			await this.writeQBankFileData(
				qbankRecord.filePath,
				qbankRecord.data
			);
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存历史分数失败:", error);
			throw new Error(
				`保存历史分数失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	// ============================================================================
	// 错题本存储
	// ============================================================================

	/**
	 * 保存错题本数据
	 */
	async saveErrorBook(bankId: string, errors: ErrorBookEntry[]): Promise<void> {
		const qbankRecord = await this.readQBankDataByBankId(bankId);
		if (!qbankRecord) {
			throw new Error(`找不到题库 ${bankId} 的 .qbank 文件`);
		}

		writeQBankErrorBook(qbankRecord.data, this.normalizeErrorBookEntries(errors));
		try {
			await this.writeQBankFileData(
				qbankRecord.filePath,
				qbankRecord.data
			);
		} catch (error) {
			logger.error("[QuestionBankStorage] 保存错题本失败:", error);
			throw new Error(
				`保存错题本失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async loadErrorBook(bankId: string): Promise<ErrorBookEntry[]> {
		try {
			const qbankRecord = await this.readQBankDataByBankId(bankId);
			if (!qbankRecord) {
				return [];
			}

			return this.normalizeErrorBookEntries(readQBankField(qbankRecord.data, "errorBook"));
		} catch (error) {
			logger.error("[QuestionBankStorage] 加载错题本失败:", error);
			return [];
		}
	}

	async deleteErrorBook(bankId: string): Promise<void> {
		const qbankRecord = await this.readQBankDataByBankId(bankId);
		if (!qbankRecord) {
			return;
		}

		writeQBankErrorBook(qbankRecord.data, []);
		try {
			await this.writeQBankFileData(
				qbankRecord.filePath,
				qbankRecord.data
			);
		} catch (error) {
			logger.error("[QuestionBankStorage] 删除错题本失败:", error);
		}
	}

	/**
	 * 删除题库的题目文件
	 * @param bankId 题库ID
	 */
	async deleteTestHistory(bankId: string): Promise<void> {
		const qbankRecord = await this.readQBankDataByBankId(bankId);
		if (!qbankRecord) {
			return;
		}

		writeQBankTestHistory(qbankRecord.data, []);
		try {
			await this.writeQBankFileData(
				qbankRecord.filePath,
				qbankRecord.data
			);
		} catch (error) {
			logger.error("[QuestionBankStorage] 删除测试历史失败:", error);
		}
	}

	async deleteSessionArchives(bankId: string): Promise<void> {
		const filePath = this.getRuntimeSessionArchivesFilePath();
		await this.deleteConsolidatedBankEntry<Record<string, unknown>>(
			filePath,
			bankId,
			"删除会话归档失败"
		);
	}

	async deleteBankData(bankId: string): Promise<void> {
		const qbankRecord = await this.readQBankDataByBankId(bankId);
		const refs = await this.loadBankQuestionRefs(bankId);
		const legacyPaths = getV2PathsFromApp(this.app).questionBank;

		await this.deleteBankQuestions(bankId);
		await this.deleteErrorBook(bankId);
		await this.deleteTestHistory(bankId);
		await this.clearInProgressSession(bankId);
		await this.deleteSessionArchives(bankId);
		await this.deleteConsolidatedBankEntry<TestHistoryEntry[]>(
			legacyPaths.testHistory,
			bankId,
			"删除 legacy 测试历史失败"
		);
		await this.deleteConsolidatedBankEntry<ErrorBookEntry[]>(
			legacyPaths.errorBook,
			bankId,
			"删除 legacy 错题本失败"
		);
		await this.deleteConsolidatedBankEntry<PersistedTestSession>(
			legacyPaths.inProgress,
			bankId,
			"删除 legacy 进行中会话失败"
		);
		await this.deleteConsolidatedBankEntry<Record<string, unknown>>(
			legacyPaths.sessionArchives,
			bankId,
			"删除 legacy 会话归档失败"
		);

		if (qbankRecord && qbankRecord.filePath.endsWith(".qbank")) {
			try {
				if (await this.app.vault.adapter.exists(qbankRecord.filePath)) {
					await this.app.vault.adapter.remove(qbankRecord.filePath);
				}
			} catch (error) {
				logger.error(`[QuestionBankStorage] 删除题组文件失败: ${qbankRecord.filePath}`, error);
			}
		}

		await this.removeLegacyBankIndexEntry(bankId);

		await this.removeUnreferencedGlobalStats(refs.map((ref) => ref.cardUuid));
	}

	private async removeLegacyBankIndexEntry(bankId: string): Promise<void> {
		const legacyBanksPath = getV2PathsFromApp(this.app).questionBank.banks;
		try {
			if (!(await this.app.vault.adapter.exists(legacyBanksPath))) {
				return;
			}

			const raw = await this.app.vault.adapter.read(legacyBanksPath);
			if (!raw || raw.trim().length === 0) {
				return;
			}

			const parsed = parseJsonUnknown(raw);
			if (!Array.isArray(parsed)) {
				return;
			}

			const filtered = parsed.filter((item) => {
				if (!isRecord(item)) {
					return true;
				}
				const itemId = readString(item, "id")?.trim() ?? "";
				return itemId !== bankId;
			});

			if (filtered.length === parsed.length) {
				return;
			}

			if (filtered.length === 0) {
				await this.app.vault.adapter.remove(legacyBanksPath);
				return;
			}

			await this.app.vault.adapter.write(legacyBanksPath, JSON.stringify(filtered, null, 2));
		} catch (error) {
			logger.warn("[QuestionBankStorage] 清理 legacy banks 索引失败:", error);
		}
	}

	async cleanupDeletedCards(cardUuids: string[]): Promise<QuestionCardCleanupResult> {
		const uniqueCardUuids = Array.from(new Set(cardUuids.filter(Boolean)));
		const targetCardUuids = new Set(uniqueCardUuids);
		const affectedBankIds = new Set<string>();
		const historyArchiveOverrides = new Map<string, Record<string, SessionArchiveOverride>>();
		const result: QuestionCardCleanupResult = {
			affectedBankIds: [],
			removedRefs: 0,
			removedGlobalStats: 0,
			removedErrorBookEntries: 0,
			updatedInProgressSessions: 0,
			removedInProgressSessions: 0,
			updatedSessionArchives: 0,
			removedSessionArchives: 0,
			updatedHistoryEntries: 0,
			removedHistoryEntries: 0,
		};

		if (targetCardUuids.size === 0) {
			return result;
		}

		const banks = await this.loadBanks();
		for (const bank of banks) {
			const refs = await this.loadBankQuestionRefs(bank.id);
			if (refs.length === 0) {
				continue;
			}

			const filteredRefs = refs.filter((ref) => !targetCardUuids.has(ref.cardUuid));
			const removedCount = refs.length - filteredRefs.length;
			if (removedCount === 0) {
				continue;
			}

			await this.saveBankQuestionRefs(bank.id, filteredRefs);
			affectedBankIds.add(bank.id);
			result.removedRefs += removedCount;
		}

		result.removedGlobalStats = await this.removeUnreferencedGlobalStats(targetCardUuids);

		for (const bank of banks) {
			const entries = await this.loadErrorBook(bank.id);
			if (entries.length === 0) {
				continue;
			}

			const filteredEntries = entries.filter((entry) => !targetCardUuids.has(entry.cardId));
			const removedCount = entries.length - filteredEntries.length;
			if (removedCount === 0) {
				continue;
			}

			await this.saveErrorBook(bank.id, filteredEntries);
			affectedBankIds.add(bank.id);
			result.removedErrorBookEntries += removedCount;
		}

		const inProgressPath = this.getRuntimeInProgressFilePath();
		const inProgressSessions = await this.loadConsolidatedMap<PersistedTestSession>(inProgressPath);
		let inProgressChanged = false;
		for (const [bankId, session] of Object.entries(inProgressSessions)) {
			const cleanup = this.cleanupPersistedSession(session, targetCardUuids);
			if (cleanup.removedQuestions === 0) {
				continue;
			}

			if (cleanup.session) {
				inProgressSessions[bankId] = cleanup.session;
				result.updatedInProgressSessions += 1;
			} else {
				delete inProgressSessions[bankId];
				result.removedInProgressSessions += 1;
			}

			affectedBankIds.add(bankId);
			inProgressChanged = true;
		}
		if (inProgressChanged) {
			await this.saveConsolidatedMap(inProgressPath, inProgressSessions);
		}

		const sessionArchivesPath = this.getRuntimeSessionArchivesFilePath();
		const sessionArchives =
			await this.loadConsolidatedMap<Record<string, unknown>>(sessionArchivesPath);
		let sessionArchivesChanged = false;
		for (const [bankId, archiveMap] of Object.entries(sessionArchives)) {
			if (!archiveMap || typeof archiveMap !== "object") {
				continue;
			}

			let bankChanged = false;
			const nextArchiveMap = { ...(archiveMap) };
			for (const [sessionId, archive] of Object.entries(nextArchiveMap)) {
				const cleanup = this.cleanupSessionArchive(archive, targetCardUuids);
				if (cleanup.removedQuestions === 0) {
					continue;
				}

				let bankArchiveOverrides = historyArchiveOverrides.get(bankId);
				if (!bankArchiveOverrides) {
					bankArchiveOverrides = {};
					historyArchiveOverrides.set(bankId, bankArchiveOverrides);
				}
				bankArchiveOverrides[sessionId] = {
					archive: cleanup.archive,
					removedQuestions: cleanup.removedQuestions,
				};

				if (cleanup.archive) {
					nextArchiveMap[sessionId] = cleanup.archive;
					result.updatedSessionArchives += 1;
				} else {
					delete nextArchiveMap[sessionId];
					result.removedSessionArchives += 1;
				}

				bankChanged = true;
			}

			if (!bankChanged) {
				continue;
			}

			if (Object.keys(nextArchiveMap).length > 0) {
				sessionArchives[bankId] = nextArchiveMap;
			} else {
				delete sessionArchives[bankId];
			}

			affectedBankIds.add(bankId);
			sessionArchivesChanged = true;
		}
		if (sessionArchivesChanged) {
			await this.saveConsolidatedMap(sessionArchivesPath, sessionArchives);
		}

		for (const bank of banks) {
			const entries = await this.loadTestHistory(bank.id);
			if (entries.length === 0) {
				continue;
			}

			const cleanup = this.cleanupTestHistoryEntries(
				entries,
				historyArchiveOverrides.get(bank.id),
				targetCardUuids
			);
			if (cleanup.updatedEntries === 0 && cleanup.removedEntries === 0) {
				continue;
			}

			await this.saveTestHistoryEntries(bank.id, cleanup.entries);

			affectedBankIds.add(bank.id);
			result.updatedHistoryEntries += cleanup.updatedEntries;
			result.removedHistoryEntries += cleanup.removedEntries;
		}

		result.affectedBankIds = Array.from(affectedBankIds);
		return result;
	}

	async deleteBankQuestions(bankId: string): Promise<void> {
		const filePath = `${this.basePath}/banks/${bankId}/questions.json`;
		const statsPath = `${this.basePath}/banks/${bankId}/question-stats.json`;

		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (exists) {
				await this.app.vault.adapter.remove(filePath);
			}

			const statsExists = await this.app.vault.adapter.exists(statsPath);
			if (statsExists) {
				await this.app.vault.adapter.remove(statsPath);
			}

			// 尝试删除题库目录（如果为空）
			const bankDir = `${this.basePath}/banks/${bankId}`;
			const dirExists = await this.app.vault.adapter.exists(bankDir);
			if (dirExists) {
				try {
					await this.app.vault.adapter.rmdir(bankDir, false);
				} catch {
					// 目录不为空，忽略错误
				}
			}
		} catch (error) {
			logger.error("[QuestionBankStorage] 删除题库题目失败:", error);
		}
	}

	// ============================================================================
	// 数据清理和维护
	// ============================================================================

	/**
	 * 清理过期的测试会话（保留最近30天）
	 */
	async cleanupOldSessions(daysToKeep = 30): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

		let removed = 0;
		try {
			const banks = await this.loadBanks();

			for (const bank of banks) {
				const entries = await this.loadTestHistory(bank.id);
				if (!Array.isArray(entries) || entries.length === 0) {
					continue;
				}

				const filteredEntries = entries.filter((e) => {
					const t = new Date(e.timestamp).getTime();
					return Number.isFinite(t) && t >= cutoffDate.getTime();
				});

				const diff = entries.length - filteredEntries.length;
				if (diff > 0) {
					await this.saveTestHistoryEntries(bank.id, filteredEntries);
					removed += diff;
				}
			}

			logger.debug(`[QuestionBankStorage] 清理了 ${removed} 条过期历史分数`);
			return removed;
		} catch (error) {
			logger.error("[QuestionBankStorage] 清理历史分数失败:", error);
			return removed;
		}
	}

	/**
	 * 获取存储统计信息
	 */
	async getStorageStats(): Promise<{
		banks: number;
		questions: number;
		sessions: number;
		errorBooks: number;
	}> {
		const banks = await this.loadBanks();
		const sessions = await this.getAllTestHistoryCount();

		let totalQuestions = 0;
		let errorBooks = 0;
		for (const bank of banks) {
			try {
				const refs = await this.loadBankQuestionRefs(bank.id);
				totalQuestions += refs.length;

				const errorEntries = await this.loadErrorBook(bank.id);
				if (errorEntries.length > 0) {
					errorBooks += 1;
				}
			} catch (error) {
				logger.error(`[QuestionBankStorage] 加载题库${bank.id}题目失败:`, error);
			}
		}

		return {
			banks: banks.length,
			questions: totalQuestions,
			sessions,
			errorBooks,
		};
	}

	private async getAllTestHistoryCount(): Promise<number> {
		try {
			const banks = await this.loadBanks();
			let total = 0;
			for (const bank of banks) {
				const entries = await this.loadTestHistory(bank.id);
				total += entries.length;
			}
			return total;
		} catch {
			return 0;
		}
	}

	private async deleteConsolidatedBankEntry<T>(
		filePath: string,
		bankId: string,
		errorMessage: string
	): Promise<void> {
		const all = await this.loadConsolidatedMap<T>(filePath);
		if (!(bankId in all)) {
			return;
		}

		delete all[bankId];

		try {
			await this.saveConsolidatedMap(filePath, all);
		} catch (error) {
			logger.error(`[QuestionBankStorage] ${errorMessage}:`, error);
		}
	}

	private async saveTestHistoryEntries(bankId: string, entries: TestHistoryEntry[]): Promise<void> {
		const qbankRecord = await this.readQBankDataByBankId(bankId);
		if (!qbankRecord) {
			return;
		}

		writeQBankTestHistory(qbankRecord.data, this.normalizeTestHistoryEntries(entries));
		await this.writeQBankFileData(
			qbankRecord.filePath,
			qbankRecord.data
		);
	}

	private cleanupPersistedSession(
		session: PersistedTestSession,
		removedCardUuids: Set<string>
	): { session: PersistedTestSession | null; removedQuestions: number } {
		if (!session || !Array.isArray(session.questions) || session.questions.length === 0) {
			return { session, removedQuestions: 0 };
		}

		const remainingQuestions = session.questions.filter(
			(question) => !removedCardUuids.has(question.questionId)
		);
		const removedQuestions = session.questions.length - remainingQuestions.length;

		if (removedQuestions === 0) {
			return { session, removedQuestions: 0 };
		}

		if (remainingQuestions.length === 0) {
			return { session: null, removedQuestions };
		}

		const completedQuestions = remainingQuestions.filter(
			(question) =>
				question.isCorrect !== null || question.userAnswer !== null || Boolean(question.submittedAt)
		).length;
		const correctCount = remainingQuestions.filter(
			(question) => question.isCorrect === true
		).length;
		const incorrectCount = remainingQuestions.filter(
			(question) => question.isCorrect === false
		).length;
		const skippedCount = Math.max(0, completedQuestions - correctCount - incorrectCount);
		const totalQuestions = remainingQuestions.length;
		const currentQuestionIndex = Math.min(
			Math.max(session.currentQuestionIndex || 0, 0),
			totalQuestions - 1
		);
		const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
		const accuracy = completedQuestions > 0 ? correctCount / completedQuestions : 0;

		return {
			removedQuestions,
			session: {
				...session,
				questions: remainingQuestions,
				totalQuestions,
				completedQuestions,
				correctCount,
				incorrectCount,
				wrongCount: incorrectCount,
				skippedCount,
				score,
				accuracy,
				currentQuestionIndex,
			},
		};
	}

	private cleanupSessionArchive(
		archive: unknown,
		removedCardUuids: Set<string>
	): SessionArchiveOverride {
		if (!isRecord(archive)) {
			return { archive: null, removedQuestions: 0 };
		}

		const questions = readSessionArchiveQuestions(archive);
		if (questions.length === 0) {
			return { archive, removedQuestions: 0 };
		}

		const remainingQuestions = questions.filter(
			(question) => !removedCardUuids.has(question.questionId ?? "")
		);
		const removedQuestions = questions.length - remainingQuestions.length;

		if (removedQuestions === 0) {
			return { archive, removedQuestions: 0 };
		}

		if (remainingQuestions.length === 0) {
			return { archive: null, removedQuestions };
		}

		const correctCount = remainingQuestions.filter((question) => question.isCorrect === true).length;
		const wrongCount = remainingQuestions.filter((question) => question.isCorrect === false).length;
		const totalTimeSpent = remainingQuestions.reduce((sum, question) => {
			return sum + (typeof question.timeSpent === "number" ? question.timeSpent : 0);
		}, 0);
		const totalQuestions = remainingQuestions.length;
		const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

		return {
			removedQuestions,
			archive: {
				...archive,
				questions: remainingQuestions,
				totalQuestions,
				correctCount,
				wrongCount,
				score,
				totalTimeSpent,
			},
		};
	}

	private async collectReferencedQuestionUuids(): Promise<Set<string>> {
		const banks = await this.loadBanks();
		const referencedCardUuids = new Set<string>();

		for (const bank of banks) {
			const refs = await this.loadBankQuestionRefs(bank.id);
			for (const ref of refs) {
				if (ref?.cardUuid) {
					referencedCardUuids.add(ref.cardUuid);
				}
			}
		}

		return referencedCardUuids;
	}

	private async removeUnreferencedGlobalStats(cardUuids: Iterable<string>): Promise<number> {
		const candidateCardUuids = Array.from(new Set(Array.from(cardUuids).filter(Boolean)));
		if (candidateCardUuids.length === 0) {
			return 0;
		}

		const referencedCardUuids = await this.collectReferencedQuestionUuids();
		const globalStats = await this.loadGlobalQuestionStats();
		let removedGlobalStats = 0;
		let changed = false;

		for (const cardUuid of candidateCardUuids) {
			if (referencedCardUuids.has(cardUuid) || !(cardUuid in globalStats)) {
				continue;
			}

			delete globalStats[cardUuid];
			removedGlobalStats += 1;
			changed = true;
		}

		if (changed) {
			await this.saveGlobalQuestionStats(globalStats);
		}

		return removedGlobalStats;
	}

	private async migratePerFilesToConsolidated(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const v2 = getV2PathsFromApp(this.app);

		const dirs: Array<{
			dirName: string;
			targetPath: string;
			nested: boolean;
		}> = [
			{ dirName: "test-history", targetPath: v2.questionBank.testHistory, nested: false },
			{ dirName: "in-progress", targetPath: this.getRuntimeInProgressFilePath(), nested: false },
			{ dirName: "error-book", targetPath: v2.questionBank.errorBook, nested: false },
			{
				dirName: "session-archives",
				targetPath: this.getRuntimeSessionArchivesFilePath(),
				nested: true,
			},
		];

		for (const { dirName, targetPath, nested } of dirs) {
			const dirPath = `${this.basePath}/${dirName}`;
			try {
				if (!(await adapter.exists(dirPath))) continue;
				const stat = await adapter.stat(dirPath);
				if (!stat || stat.type !== "folder") continue;

				const listing = await adapter.list(dirPath);
				if (listing.files.length === 0 && listing.folders.length === 0) {
					try {
						await adapter.rmdir(dirPath, false);
					} catch { /* no-op */ }
					continue;
				}

				if (nested) {
					const consolidated: Record<string, Record<string, unknown>> = {};
					for (const subFolder of listing.folders) {
						const bankId = subFolder.split("/").pop() || "";
						if (!bankId) continue;
						try {
							const subListing = await adapter.list(subFolder);
							for (const file of subListing.files) {
								if (!file.endsWith(".json")) continue;
								const sessionId = file.split("/").pop()?.replace(".json", "") || "";
								try {
									const data = await adapter.read(file);
									if (!consolidated[bankId]) consolidated[bankId] = {};
									consolidated[bankId][sessionId] = parseJsonUnknown(data);
									await adapter.remove(file);
								} catch { /* no-op */ }
							}
							try {
								await adapter.rmdir(subFolder, false);
							} catch { /* no-op */ }
						} catch { /* no-op */ }
					}
					if (Object.keys(consolidated).length > 0) {
						const existing = await this.loadConsolidatedMap<Record<string, unknown>>(targetPath);
						for (const [bk, sessions] of Object.entries(consolidated)) {
							existing[bk] = { ...(existing[bk] || {}), ...sessions };
						}
						await this.saveConsolidatedMap(targetPath, existing);
					}
				} else {
					const consolidated: Record<string, unknown> = { /* no-op */ };
					for (const file of listing.files) {
						if (!file.endsWith(".json")) continue;
						const bankId = file.split("/").pop()?.replace(".json", "") || "";
						if (!bankId) continue;
						try {
							const data = await adapter.read(file);
							consolidated[bankId] = parseJsonUnknown(data);
							await adapter.remove(file);
						} catch { /* no-op */ }
					}
					if (Object.keys(consolidated).length > 0) {
						const existing = await this.loadConsolidatedMap<unknown>(targetPath);
						for (const [bk, val] of Object.entries(consolidated)) {
							if (!(bk in existing)) existing[bk] = val;
						}
						await this.saveConsolidatedMap(targetPath, existing);
					}
				}

				try {
					const afterListing = await adapter.list(dirPath);
					if (
						(afterListing.files?.length || 0) === 0 &&
						(afterListing.folders?.length || 0) === 0
					) {
						await adapter.rmdir(dirPath, false);
					}
				} catch { /* no-op */ }
			} catch (error) {
				logger.error(`[QuestionBankStorage] 迁移 ${dirName} 到合并文件失败:`, error);
			}
		}
	}

	private async migrateLegacyTestSessionsToHistory(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const dirPath = `${this.basePath}/test-sessions`;

		try {
			const exists = await adapter.exists(dirPath);
			if (!exists) return;

			const files = await adapter.list(dirPath);
			const sessionFiles = files.files.filter((f) => f.endsWith(".json"));
			if (sessionFiles.length === 0) return;

			for (const file of sessionFiles) {
				try {
					const raw = await adapter.read(file);
					const session = JSON.parse(raw) as TestSession;
					if (!session || !session.id || !session.bankId) continue;

					if (session.status === "completed") {
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

						await this.appendTestHistoryEntry(session.bankId, {
							sessionId: session.id,
							bankId: session.bankId,
							timestamp: session.startTime || new Date().toISOString(),
							mode: session.mode,
							score,
							accuracy,
							totalQuestions: session.totalQuestions || session.questions?.length || 0,
							correctCount: session.correctCount || 0,
							durationSeconds,
							questionSummaries: this.buildHistoryQuestionSummaries(session.questions || []),
						});

						await adapter.remove(file);
						continue;
					}

					if (session.status === "in_progress") {
						const persisted: PersistedTestSession = {
							id: session.id,
							bankId: session.bankId,
							bankName: session.bankName,
							mode: session.mode,
							startTime: session.startTime,
							endTime: session.endTime,
							duration: session.duration,
							questions: (session.questions || []).map((q) => ({
								questionId: q.questionId,
								userAnswer: q.userAnswer,
								correctAnswer: q.correctAnswer,
								isCorrect: q.isCorrect,
								errorMessage: q.errorMessage,
								timeSpent: q.timeSpent,
								submittedAt: q.submittedAt,
							})),
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

						await this.saveInProgressSession(session.bankId, persisted);
						await adapter.remove(file);
						continue;
					}

					if (session.status === "cancelled") {
						await adapter.remove(file);
					}
				} catch (error) {
					logger.error(`[QuestionBankStorage] 聚合迁移 test-sessions 失败: ${file}`, error);
				}
			}

			// 迁移完成后，如果目录为空则尝试删除
			try {
				const after = await adapter.list(dirPath);
				if ((after.files?.length || 0) === 0 && (after.folders?.length || 0) === 0) {
					await adapter.rmdir(dirPath, false);
				}
			} catch { /* no-op */ }
		} catch (error) {
			logger.error("[QuestionBankStorage] 聚合迁移 test-sessions 失败:", error);
		}
	}
}
