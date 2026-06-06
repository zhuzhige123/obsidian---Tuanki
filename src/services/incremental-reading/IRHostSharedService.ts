import { Notice, TFile, type App } from "obsidian";
import { IRDeckSelectorModal } from "../../modals/IRDeckSelectorModal";
import type { IRChunkFileData } from "../../types/ir-types";
import { createDefaultChunkFileData, generateChunkId, generateSourceId } from "../../types/ir-types";
import { logger } from "../../utils/logger";
import { EpubStorageService } from "../epub-integration/EpubStorageService";
import { IREpubBookmarkTaskService } from "./IREpubBookmarkTaskService";
import {
	normalizeIRReadableMarkdownFolderPath,
	resolveIRReadableMarkdownTargetFolder,
} from "./IRReadableMarkdownPathResolver";
import { recomputeAndBroadcastIRData } from "./IRScheduleRefreshService";
import { IRStorageService } from "./IRStorageService";

export interface IRSelectionQuickCreatePreferencesLike {
	selectionQuickCreateLastFolder?: string;
}

export interface IREpubScheduleChapterOptions {
	filePath: string;
	title: string;
	tocHref: string;
	tocLevel: number;
	deckId?: string;
}

export interface IREpubResumePointOptions {
	filePath: string;
	cfi: string;
	chapterHref?: string;
	chapterTitle?: string;
	deckId?: string;
}

export interface IRTopicRef {
	id: string;
	name: string;
	path?: string;
}

export interface IREnsureExternalDocumentChunkScheduledOptions {
	autoSubscribedAt?: string;
	autoSubscribedFolderPath?: string;
	pinToToday?: boolean;
	storage?: IRStorageService;
	existingChunk?: IRChunkFileData | null;
}

const IR_FOLDER_SUBSCRIPTION_NEW_BADGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export class IRHostSharedService {
	private irEpubBookmarkTaskService: IREpubBookmarkTaskService | null = null;

	constructor(private readonly app: App) {}

	cleanIRReadingPointTitle(rawTitle: string): string {
		return String(rawTitle || "")
			.replace(/\r\n?/g, " ")
			.replace(/^\s*#{1,6}\s+/, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	deriveIRReadingPointDraftFromSelection(selectedText: string): {
		title: string;
		titleDetected: boolean;
	} {
		const normalized = String(selectedText || "").replace(/\r\n?/g, "\n").trim();
		const lines = normalized.split("\n");
		const firstNonEmptyLine = lines.find((line) => line.trim().length > 0) || normalized;
		const headingMatch = firstNonEmptyLine.trim().match(/^#{1,6}\s+(.+)$/);
		if (headingMatch?.[1]) {
			return {
				title: this.cleanIRReadingPointTitle(headingMatch[1]) || "未命名阅读点",
				titleDetected: true,
			};
		}

		const cleanedLine = this.cleanIRReadingPointTitle(firstNonEmptyLine);
		return {
			title: cleanedLine.length > 80 ? `${cleanedLine.slice(0, 80).trim()}...` : cleanedLine || "未命名阅读点",
			titleDetected: false,
		};
	}

	normalizeSelectionQuickCreateFolderPath(folderPath: string): string {
		return normalizeIRReadableMarkdownFolderPath(folderPath);
	}

	getSelectionQuickCreateFolderConfig(
		settings: IRSelectionQuickCreatePreferencesLike | null | undefined,
		contextPath?: string
	): { initialFolder: string } {
		return {
			initialFolder: this.normalizeSelectionQuickCreateFolderPath(
				resolveIRReadableMarkdownTargetFolder(this.app, {
					lastSelectedFolder: settings?.selectionQuickCreateLastFolder,
					contextPath,
					allowActiveFileFallback: true,
				})
			),
		};
	}

	getUpdatedSelectionQuickCreatePreferences(
		settings: IRSelectionQuickCreatePreferencesLike,
		update: { folderPath?: string }
	): IRSelectionQuickCreatePreferencesLike {
		if (update.folderPath === undefined) {
			return settings;
		}

		return {
			...settings,
			selectionQuickCreateLastFolder: this.normalizeSelectionQuickCreateFolderPath(update.folderPath),
		};
	}

	normalizeEpubBookmarkHref(href: string): string {
		return String(href || "").trim();
	}

	getIncrementalReadingTodayStart(): Date {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return today;
	}

	getIncrementalReadingDateKey(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
			date.getDate()
		).padStart(2, "0")}`;
	}

	async getAvailableEpubIncrementalReadingTopics(): Promise<Array<{ id: string; name: string }>> {
		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			return Object.values(await storage.getAllDecks())
				.filter((deck) => !deck.archivedAt)
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((deck) => ({
					id: String(deck.id || deck.path || "").trim(),
					name: String(deck.name || deck.id || deck.path || "增量阅读").trim(),
				}))
				.filter((deck) => deck.id && deck.name);
		} catch (error) {
			logger.error("[IRHostSharedService] 获取 EPUB 增量阅读专题列表失败:", error);
			return [];
		}
	}

	async resolveIRDeckById(deckId: string): Promise<IRTopicRef | null> {
		const normalizedDeckId = String(deckId || "").trim();
		if (!normalizedDeckId) {
			return null;
		}

		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const deck = await storage.getDeckById(normalizedDeckId);
			if (!deck || deck.archivedAt) {
				return null;
			}

			return {
				id: normalizedDeckId,
				name: String(deck.name || "").trim() || "增量阅读",
				path: String(deck.path || "").trim() || undefined,
			};
		} catch {
			return null;
		}
	}

	async getIRDeckIdentifiers(deck: { id: string; path?: string }): Promise<string[]> {
		const identifiers = new Set<string>();
		const deckId = String(deck?.id || "").trim();
		const deckPath = String(deck?.path || "").trim();
		if (deckId) {
			identifiers.add(deckId);
		}
		if (deckPath) {
			identifiers.add(deckPath);
		}
		if (!deckId || deckPath) {
			return Array.from(identifiers);
		}

		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const storedDeck = await storage.getDeckById(deckId);
			const legacyPath = String(storedDeck?.path || "").trim();
			if (legacyPath) {
				identifiers.add(legacyPath);
			}
		} catch { /* no-op */ }

		return Array.from(identifiers);
	}

	async pickIRDeck(): Promise<IRTopicRef | null> {
		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const decks = Object.values(await storage.getAllDecks())
				.filter((deck) => !deck.archivedAt)
				.sort((left, right) => left.name.localeCompare(right.name));
			if (decks.length === 0) {
				new Notice("暂无可用增量阅读专题", 3000);
				return null;
			}

			return await new Promise((resolve) => {
				let resolved = false;
				let closeTimer: ReturnType<typeof setTimeout> | null = null;
				const settle = (value: IRTopicRef | null) => {
					if (resolved) return;
					resolved = true;
					if (closeTimer) {
						window.clearTimeout(closeTimer);
						closeTimer = null;
					}
					resolve(value);
				};

				const modal = new IRDeckSelectorModal(this.app, decks, (deck) => {
					settle({ id: deck.id, name: deck.name, path: deck.path });
				});
				const originalOnClose = (modal as { onClose?: () => void }).onClose?.bind(modal);
				(modal as { onClose?: () => void }).onClose = () => {
					try {
						originalOnClose?.();
					} catch { /* no-op */ }
					if (resolved || closeTimer) {
						return;
					}
					closeTimer = window.setTimeout(() => {
						closeTimer = null;
						settle(null);
					}, 0);
				};
				modal.open();
			});
		} catch (error) {
			logger.error("[IRHostSharedService] 打开专题选择失败:", error);
			new Notice("打开增量阅读专题列表失败", 3000);
			return null;
		}
	}

	async scheduleEpubChapterForIncrementalReading(
		options: IREpubScheduleChapterOptions,
		resolveDeck?: (deckId: string) => Promise<IRTopicRef | null>,
		pickDeck?: () => Promise<IRTopicRef | null>
	): Promise<void> {
		const sourceFile = this.app.vault.getAbstractFileByPath(String(options.filePath || "").trim());
		if (!(sourceFile instanceof TFile) || sourceFile.extension !== "epub") {
			new Notice("未找到对应的 EPUB 文件", 3000);
			return;
		}

		const normalizedHref = this.normalizeEpubBookmarkHref(options.tocHref);
		if (!normalizedHref) {
			new Notice("未能读取章节定位信息", 3000);
			return;
		}

		const picked =
			(await (resolveDeck ?? this.resolveIRDeckById.bind(this))(String(options.deckId || "").trim())) ??
			(await (pickDeck ?? this.pickIRDeck.bind(this))());
		if (!picked) {
			return;
		}

		const service = await this.ensureIREpubBookmarkTaskServiceReady();
		const epubStorageService = new EpubStorageService(this.app);
		const sourceEntry = await epubStorageService.ensureSourceIdentity(sourceFile.path);
		const existingTasks = await service.getTasksByDeckIdentifiers(await this.getIRDeckIdentifiers(picked));
		const title = this.cleanIRReadingPointTitle(options.title) || sourceFile.basename || "EPUB 章节";

		const duplicateTask = existingTasks.find(
			(task) =>
				(String(task.epubFilePath || "").trim() === sourceFile.path ||
					(Boolean(sourceEntry?.sourceId) && task.sourceId === sourceEntry?.sourceId)) &&
				this.normalizeEpubBookmarkHref(task.tocHref) === normalizedHref
		);
		if (duplicateTask) {
			new Notice(`章节“${title}”已存在于专题“${picked.name}”中`, 3500);
			return;
		}

		await service.batchCreateTasks([
			{
				deckId: picked.id,
				epubFilePath: sourceFile.path,
				sourceId: sourceEntry?.sourceId,
				title,
				tocHref: normalizedHref,
				tocLevel: Math.max(1, Number(options.tocLevel || 0)),
				priorityUi: 5,
				nextRepDate: Date.now(),
			},
		]);

		await recomputeAndBroadcastIRData(this.app, "import_materials", {
			deckIds: [picked.id],
		});
		new Notice(`已将“${title}”添加到专题“${picked.name}”`, 3500);
	}

	async markEpubResumePointFromReader(
		options: IREpubResumePointOptions,
		resolveDeck?: (deckId: string) => Promise<IRTopicRef | null>
	): Promise<void> {
		const normalizedFilePath = String(options.filePath || "").trim();
		const normalizedCfi = String(options.cfi || "").trim();
		if (!normalizedFilePath || !normalizedCfi) {
			new Notice("没有可用的阅读位置", 3000);
			return;
		}

		const service = await this.ensureIREpubBookmarkTaskServiceReady();
		const resolvedDeck = await (resolveDeck ?? this.resolveIRDeckById.bind(this))(String(options.deckId || "").trim());
		const tasks = resolvedDeck
			? (await service.getTasksByDeckIdentifiers(await this.getIRDeckIdentifiers(resolvedDeck))).filter(
					(task) => String(task.epubFilePath || "").trim() === normalizedFilePath
			  )
			: await service.getTasksByEpub(normalizedFilePath);
		if (tasks.length === 0) {
			new Notice("未找到此 EPUB 的 IR 任务", 3000);
			return;
		}

		const normalizedChapterHref = this.normalizeEpubBookmarkHref(String(options.chapterHref || ""));
		let matchedTask =
			tasks.find((task) => {
				const normalizedTaskHref = this.normalizeEpubBookmarkHref(task.tocHref);
				if (!normalizedChapterHref || !normalizedTaskHref) {
					return false;
				}
				return (
					normalizedChapterHref.endsWith(normalizedTaskHref) ||
					normalizedTaskHref.endsWith(normalizedChapterHref)
				);
			}) ?? tasks[0];

		await service.setResumePoint(matchedTask.id, normalizedCfi);
		new Notice(`续读点已保存：${String(options.chapterTitle || "").trim() || matchedTask.title}`);
	}

	async ensureExternalDocumentChunkScheduled(
		file: TFile,
		deckId: string,
		deckName: string,
		options?: IREnsureExternalDocumentChunkScheduledOptions
	): Promise<boolean> {
		const storage = options?.storage ?? new IRStorageService(this.app);
		await storage.initialize();
		const chunks = options?.existingChunk === undefined ? await storage.getAllChunkData() : undefined;
		const existing =
			(options?.existingChunk ??
				Object.values(chunks || {}).find((chunk) => String(chunk.filePath || "").trim() === file.path) ??
				null);
		const now = Date.now();
		const nextAutoSubscribedAt = String(options?.autoSubscribedAt || "").trim();
		const nextAutoSubscribedFolderPath = String(options?.autoSubscribedFolderPath || "").trim();
		const pinToToday = options?.pinToToday === true;
		const todayStart = this.getIncrementalReadingTodayStart();
		const todayStartMs = todayStart.getTime();
		const todayDateKey = this.getIncrementalReadingDateKey(todayStart);
		const deckTag = `#IR_deck_${deckName}`;

		if (existing) {
			const existingDeckIds = Array.isArray(existing.deckIds) ? existing.deckIds : [];
			const existingTopicIds = Array.isArray(existing.topicIds) ? existing.topicIds : [];
			const existingStatus = String(existing.scheduleStatus || "").trim();
			const shouldResetDueAt =
				pinToToday ||
				existingStatus === "removed" ||
				existingStatus === "done" ||
				existingStatus === "suspended" ||
				!existingStatus ||
				!Number(existing.nextRepDate || 0);
			const existingMeta = { ...(existing.meta || {}) } as Record<string, unknown>;
			let changed = false;

			if (existingDeckIds.length !== 1 || existingDeckIds[0] !== deckId) {
				existing.deckIds = [deckId];
				changed = true;
			}
			if (existingTopicIds.length !== 1 || existingTopicIds[0] !== deckId) {
				existing.topicIds = [deckId];
				changed = true;
			}
			if (existing.topicTag !== deckTag) {
				existing.topicTag = deckTag;
				changed = true;
			}
			if (existing.deckTag !== deckTag) {
				existing.deckTag = deckTag;
				changed = true;
			}
			if (shouldResetDueAt && existing.nextRepDate !== (pinToToday ? todayStartMs : now)) {
				existing.nextRepDate = pinToToday ? todayStartMs : now;
				changed = true;
			}
			if (!existing.intervalDays) {
				existing.intervalDays = 1;
				changed = true;
			}
			if (shouldResetDueAt && existing.scheduleStatus !== "new") {
				existing.scheduleStatus = "new";
				changed = true;
			}
			if (existingMeta.externalDocument !== true) {
				existingMeta.externalDocument = true;
				changed = true;
			}
			if (nextAutoSubscribedAt && existingMeta.autoSubscribedAt !== nextAutoSubscribedAt) {
				existingMeta.autoSubscribedAt = nextAutoSubscribedAt;
				changed = true;
			}
			if (
				nextAutoSubscribedFolderPath &&
				existingMeta.autoSubscribedFolderPath !== nextAutoSubscribedFolderPath
			) {
				existingMeta.autoSubscribedFolderPath = nextAutoSubscribedFolderPath;
				changed = true;
			}
			if (pinToToday && existingMeta.sourceSequenceLocked !== true) {
				existingMeta.sourceSequenceLocked = true;
				changed = true;
			}
			if (pinToToday && existingMeta.sourceSequenceAnchorDateKey !== todayDateKey) {
				existingMeta.sourceSequenceAnchorDateKey = todayDateKey;
				changed = true;
			}
			if (!pinToToday && existingMeta.sourceSequenceLocked !== undefined) {
				delete existingMeta.sourceSequenceLocked;
				changed = true;
			}
			if (!pinToToday && existingMeta.sourceSequenceAnchorDateKey !== undefined) {
				delete existingMeta.sourceSequenceAnchorDateKey;
				changed = true;
			}
			if (nextAutoSubscribedAt) {
				existingMeta.autoSubscribedBadgeUntil = new Date(
					Date.parse(nextAutoSubscribedAt) + IR_FOLDER_SUBSCRIPTION_NEW_BADGE_WINDOW_MS
				).toISOString();
			}
			if (!changed) {
				return false;
			}

			existing.updatedAt = now;
			existing.meta = existingMeta as unknown;
			await storage.saveChunkData(existing);
			return true;
		}

		const chunk = createDefaultChunkFileData(generateChunkId(), generateSourceId(), file.path);
		chunk.topicIds = [deckId];
		chunk.deckIds = [deckId];
		chunk.topicTag = deckTag;
		chunk.deckTag = deckTag;
		chunk.updatedAt = now;
		chunk.nextRepDate = pinToToday ? todayStartMs : now;
		chunk.meta = {
			...(chunk.meta || {}),
			externalDocument: true,
			...(pinToToday
				? {
						sourceSequenceLocked: true,
						sourceSequenceAnchorDateKey: todayDateKey,
				  }
				: {}),
			...(nextAutoSubscribedAt
				? {
						autoSubscribedAt: nextAutoSubscribedAt,
						autoSubscribedFolderPath: nextAutoSubscribedFolderPath || undefined,
						autoSubscribedBadgeUntil: new Date(
							Date.parse(nextAutoSubscribedAt) + IR_FOLDER_SUBSCRIPTION_NEW_BADGE_WINDOW_MS
						).toISOString(),
				  }
				: {}),
		} as unknown;
		await storage.saveChunkData(chunk);
		return true;
	}

	private async ensureIREpubBookmarkTaskServiceReady(): Promise<IREpubBookmarkTaskService> {
		if (!this.irEpubBookmarkTaskService) {
			this.irEpubBookmarkTaskService = new IREpubBookmarkTaskService(this.app);
		}
		await this.irEpubBookmarkTaskService.initialize();
		return this.irEpubBookmarkTaskService;
	}
}
