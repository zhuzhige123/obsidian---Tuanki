import { normalizePath, type App } from "obsidian";
import type { Card } from "../../data/types";
import type { IRPriority, IRBlockMeta } from "../../types/ir-types";
import { DEFAULT_IR_BLOCK_META } from "../../types/ir-types";
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import {
	type IREpubBookmarkTask,
	IREpubBookmarkTaskService,
	isEpubBookmarkTaskId,
} from "./IREpubBookmarkTaskService";
import {
	type IRPdfBookmarkTask,
	IRPdfBookmarkTaskService,
	isPdfBookmarkTaskId,
} from "./IRPdfBookmarkTaskService";
import {
	IRPointTagService,
	normalizeReadingPointTags,
} from "./IRPointTagService";
import {
	isIrBlockCard,
	isIrChunkCard,
	mutateIrBlock,
	readCardMetaRecord,
	resolveCardSourceDocumentPath,
	resolveIrPointKindFromCard,
} from "../../utils/ir-card-metadata";
import { isRecord } from "../../utils/typed-json";
import { IRStorageService } from "./IRStorageService";

export type IRPointWriteKind = "block" | "chunk" | "pdf" | "epub";

export interface IRPointWriteResult {
	kind: IRPointWriteKind;
	sourceDocumentPath?: string;
}

export interface IRPdfPointCreateInput {
	topicId?: string;
	deckId?: string;
	materialId?: string;
	pdfPath: string;
	title: string;
	link: string;
	annotationId?: string;
	priorityUi?: number;
	sourceSequenceGroup?: string;
	sourceSequenceOrder?: number;
	sourceSequenceLocked?: boolean;
	sourceSequenceAnchorDateKey?: string;
}

export interface IREpubPointCreateInput {
	topicId?: string;
	deckId?: string;
	epubFilePath: string;
	sourceId?: string;
	title: string;
	tocHref: string;
	tocLevel: number;
	priorityUi?: number;
	sourceSequenceGroup?: string;
	sourceSequenceOrder?: number;
	sourceSequenceLocked?: boolean;
	sourceSequenceAnchorDateKey?: string;
}

export interface IREpubBatchPointCreateInput extends IREpubPointCreateInput {
	nextRepDate?: number;
}

export interface IRPointDeleteInput {
	id: string;
	kind?: IRPointWriteKind;
}

export interface IRPointWriteTarget {
	id: string;
	kind?: IRPointWriteKind;
	sourceDocumentPath?: string;
}

function resolveLegacyPriority(priority: number): IRPriority {
	if (priority >= 6) return 1;
	if (priority >= 4) return 2;
	return 3;
}

function normalizeDeckIds(deckIds: string[]): string[] {
	return Array.from(
		new Set(
			(Array.isArray(deckIds) ? deckIds : [])
				.map((deckId) => String(deckId || "").trim())
				.filter(Boolean)
		)
	);
}

function buildCardLikeTarget(target: IRPointWriteTarget): Card {
	const metadata: Record<string, unknown> = {};
	if (target.kind === "chunk") {
		metadata.irChunk = true;
	}
	if (target.kind === "block") {
		metadata.irBlock = true;
	}
	return {
		uuid: target.id,
		metadata,
		ir_source_document_key: target.sourceDocumentPath,
	} as unknown as Card;
}

export class IRPointWriteService {
	private readonly storage: IRStorageService;
	private readonly pdfService: IRPdfBookmarkTaskService;
	private readonly epubService: IREpubBookmarkTaskService;
	private readonly pointTagService: IRPointTagService;

	constructor(private readonly app: App) {
		this.storage = new IRStorageService(app);
		this.pdfService = new IRPdfBookmarkTaskService(app);
		this.epubService = new IREpubBookmarkTaskService(app);
		this.pointTagService = new IRPointTagService(app);
	}

	async createPdfPoint(input: IRPdfPointCreateInput): Promise<IRPdfBookmarkTask> {
		await this.pdfService.initialize();
		return await this.pdfService.createTask(input);
	}

	async createEpubPoint(input: IREpubPointCreateInput): Promise<IREpubBookmarkTask> {
		await this.epubService.initialize();
		return await this.epubService.createTask(input);
	}

	async batchCreateEpubPoints(
		inputs: IREpubBatchPointCreateInput[]
	): Promise<IREpubBookmarkTask[]> {
		await this.epubService.initialize();
		return await this.epubService.batchCreateTasks(inputs);
	}

	async deletePointsByDeckIdentifiers(deckIds: string[]): Promise<number> {
		const normalizedDeckIds = normalizeDeckIds(deckIds);
		if (normalizedDeckIds.length === 0) {
			return 0;
		}

		await Promise.all([this.pdfService.initialize(), this.epubService.initialize()]);
		const [deletedPdf, deletedEpub] = await Promise.all([
			this.pdfService.deleteTasksByDeckIdentifiers(normalizedDeckIds),
			this.epubService.deleteTasksByDeckIdentifiers(normalizedDeckIds),
		]);
		return deletedPdf + deletedEpub;
	}

	async deletePdfPointsByPaths(pdfPaths: string[]): Promise<number> {
		const normalizedPaths = Array.from(
			new Set(
				(Array.isArray(pdfPaths) ? pdfPaths : [])
					.map((path) => normalizePath(String(path || "").trim()))
					.filter(Boolean)
			)
		);
		if (normalizedPaths.length === 0) {
			return 0;
		}

		await this.pdfService.initialize();
		return await this.pdfService.deleteTasksByPdfPaths(normalizedPaths);
	}

	async deleteEpubPointsByPaths(epubPaths: string[]): Promise<number> {
		const normalizedPaths = Array.from(
			new Set(
				(Array.isArray(epubPaths) ? epubPaths : [])
					.map((path) => normalizePath(String(path || "").trim()))
					.filter(Boolean)
			)
		);
		if (normalizedPaths.length === 0) {
			return 0;
		}

		await this.epubService.initialize();
		return await this.epubService.deleteTasksByEpubPaths(normalizedPaths);
	}

	async deleteCard(card: Card): Promise<boolean> {
		return await this.deletePoint({
			id: card.uuid,
			kind: resolveIrPointKindFromCard(card),
		});
	}

	async deletePoint(input: IRPointDeleteInput): Promise<boolean> {
		if (isPdfBookmarkTaskId(input.id)) {
			await this.pdfService.initialize();
			return await this.pdfService.deleteTask(input.id);
		}

		if (isEpubBookmarkTaskId(input.id)) {
			await this.epubService.initialize();
			return await this.epubService.deleteTask(input.id);
		}

		await this.storage.initialize();

		if (input.kind === "chunk") {
			const chunk = await this.storage.getChunkData(input.id);
			if (!chunk) {
				return false;
			}
			await this.storage.deleteChunkData(input.id);
			return true;
		}

		if (input.kind === "block") {
			const allBlocks = await this.storage.getAllBlocks();
			if (!allBlocks[input.id]) {
				return false;
			}
			await this.storage.deleteBlock(input.id);
			return true;
		}

		const chunk = await this.storage.getChunkData(input.id);
		if (chunk) {
			await this.storage.deleteChunkData(input.id);
			return true;
		}

		const allBlocks = await this.storage.getAllBlocks();
		if (allBlocks[input.id]) {
			await this.storage.deleteBlock(input.id);
			return true;
		}

		return false;
	}

	async updatePointTags(
		target: IRPointWriteTarget,
		tags: string[]
	): Promise<IRPointWriteResult | null> {
		return await this.updateTags(buildCardLikeTarget(target), tags);
	}

	async updateTags(card: Card, tags: string[]): Promise<IRPointWriteResult | null> {
		const normalizedTags = normalizeReadingPointTags(tags);

		if (isPdfBookmarkTaskId(card.uuid)) {
			const updatedTask = await this.pointTagService.savePdfTaskTags(card.uuid, normalizedTags);
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "pdf",
				sourceDocumentPath:
					normalizePath(String(updatedTask.pdfPath || "").trim()) || resolveCardSourceDocumentPath(card),
			};
		}

		if (isEpubBookmarkTaskId(card.uuid)) {
			const updatedTask = await this.pointTagService.saveEpubTaskTags(card.uuid, normalizedTags);
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "epub",
				sourceDocumentPath:
					normalizePath(String(updatedTask.epubFilePath || "").trim()) ||
					resolveCardSourceDocumentPath(card),
			};
		}

		await this.storage.initialize();

		if (isIrChunkCard(card)) {
			const updatedChunk = await this.pointTagService.saveChunkTags(card.uuid, normalizedTags);
			if (!updatedChunk) {
				return null;
			}
			return {
				kind: "chunk",
				sourceDocumentPath:
					normalizePath(String(updatedChunk.filePath || "").trim()) ||
					resolveCardSourceDocumentPath(card),
			};
		}

		if (isIrBlockCard(card)) {
			const allBlocks = await this.storage.getAllBlocks();
			const block = allBlocks[card.uuid];
			if (!block) {
				return null;
			}

			const nextGroupId = await this.pointTagService.matchGroupForTags(normalizedTags);
			block.tags = normalizedTags;
			block.tagGroupId = nextGroupId;
			mutateIrBlock(block, (mutableBlock) => {
				const meta = mutableBlock.meta;
				if (isRecord(meta)) {
					mutableBlock.meta = {
						...meta,
						tagGroup: nextGroupId,
					};
				}
			});

			await this.storage.saveBlock(block);
			return {
				kind: "block",
				sourceDocumentPath: resolveCardSourceDocumentPath(card),
			};
		}

		return null;
	}

	async updatePriority(card: Card, priority: number): Promise<IRPointWriteResult | null> {
		if (isPdfBookmarkTaskId(card.uuid)) {
			await this.pdfService.initialize();
			const updatedTask = await this.pdfService.updateTask(card.uuid, {
				priorityUi: priority,
				priorityEff: priority,
			});
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "pdf",
				sourceDocumentPath:
					normalizePath(String(updatedTask.pdfPath || "").trim()) || resolveCardSourceDocumentPath(card),
			};
		}

		if (isEpubBookmarkTaskId(card.uuid)) {
			await this.epubService.initialize();
			const updatedTask = await this.epubService.updateTask(card.uuid, {
				priorityUi: priority,
				priorityEff: priority,
			});
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "epub",
				sourceDocumentPath:
					normalizePath(String(updatedTask.epubFilePath || "").trim()) ||
					resolveCardSourceDocumentPath(card),
			};
		}

		await this.storage.initialize();

		if (isIrChunkCard(card)) {
			const chunk = await this.storage.getChunkData(card.uuid);
			if (!chunk) {
				return null;
			}
			chunk.priorityUi = priority;
			chunk.priorityEff = priority;
			await this.storage.saveChunkData(chunk);
			return {
				kind: "chunk",
				sourceDocumentPath:
					normalizePath(String(chunk.filePath || "").trim()) || resolveCardSourceDocumentPath(card),
			};
		}

		if (isIrBlockCard(card)) {
			const allBlocks = await this.storage.getAllBlocks();
			const block = allBlocks[card.uuid];
			if (!block) {
				return null;
			}
			mutateIrBlock(block, (mutableBlock) => {
				mutableBlock.priorityUi = priority;
				mutableBlock.priorityEff = priority;
			});
			block.priority = resolveLegacyPriority(priority);
			await this.storage.saveBlock(block);
			return {
				kind: "block",
				sourceDocumentPath: resolveCardSourceDocumentPath(card),
			};
		}

		return null;
	}

	async updatePointAssociatedNotes(
		target: IRPointWriteTarget,
		notePaths: string[]
	): Promise<IRPointWriteResult | null> {
		return await this.updateAssociatedNotes(buildCardLikeTarget(target), notePaths);
	}

	async updateAssociatedNotes(card: Card, notePaths: string[]): Promise<IRPointWriteResult | null> {
		const normalizedNotePaths = resolveAssociatedNotePaths({
			associatedNotePaths: notePaths,
		});
		const primaryPath = normalizedNotePaths[0];

		if (isPdfBookmarkTaskId(card.uuid)) {
			await this.pdfService.initialize();
			const updatedTask = await this.pdfService.updateTask(card.uuid, {
				meta: {
					...DEFAULT_IR_BLOCK_META,
					...(readCardMetaRecord(card) as Partial<IRBlockMeta>),
					primaryAssociatedNotePath: primaryPath,
					associatedNotePath: primaryPath,
					associatedNotePaths: normalizedNotePaths,
				},
			});
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "pdf",
				sourceDocumentPath:
					normalizePath(String(updatedTask.pdfPath || "").trim()) || resolveCardSourceDocumentPath(card),
			};
		}

		if (isEpubBookmarkTaskId(card.uuid)) {
			await this.epubService.initialize();
			const updatedTask = await this.epubService.updateTask(card.uuid, {
				meta: {
					...DEFAULT_IR_BLOCK_META,
					...(readCardMetaRecord(card) as Partial<IRBlockMeta>),
					primaryAssociatedNotePath: primaryPath,
					associatedNotePath: primaryPath,
					associatedNotePaths: normalizedNotePaths,
				},
			});
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "epub",
				sourceDocumentPath:
					normalizePath(String(updatedTask.epubFilePath || "").trim()) ||
					resolveCardSourceDocumentPath(card),
			};
		}

		await this.storage.initialize();

		if (isIrChunkCard(card)) {
			const chunk = await this.storage.getChunkData(card.uuid);
			if (!chunk) {
				return null;
			}
			chunk.meta = {
				...(chunk.meta || {}),
				primaryAssociatedNotePath: primaryPath,
				associatedNotePath: primaryPath,
				associatedNotePaths: normalizedNotePaths,
			};
			await this.storage.saveChunkData(chunk);
			return {
				kind: "chunk",
				sourceDocumentPath:
					normalizePath(String(chunk.filePath || "").trim()) || resolveCardSourceDocumentPath(card),
			};
		}

		if (isIrBlockCard(card)) {
			const allBlocks = await this.storage.getAllBlocks();
			const block = allBlocks[card.uuid];
			if (!block) {
				return null;
			}
			mutateIrBlock(block, (mutableBlock) => {
				mutableBlock.primaryAssociatedNotePath = primaryPath;
				mutableBlock.associatedNotePath = primaryPath;
				mutableBlock.associatedNotePaths = normalizedNotePaths;
				const meta = mutableBlock.meta;
				if (isRecord(meta)) {
					mutableBlock.meta = {
						...meta,
						primaryAssociatedNotePath: primaryPath,
						associatedNotePath: primaryPath,
						associatedNotePaths: normalizedNotePaths,
					};
				}
			});
			await this.storage.saveBlock(block);
			return {
				kind: "block",
				sourceDocumentPath: resolveCardSourceDocumentPath(card),
			};
		}

		return null;
	}

	async updateEpubResumePoint(
		taskId: string,
		cfi: string
	): Promise<IRPointWriteResult | null> {
		if (!isEpubBookmarkTaskId(taskId)) {
			return null;
		}

		await this.epubService.initialize();
		const task = await this.epubService.getTask(taskId);
		if (!task) {
			return null;
		}

		await this.epubService.setResumePoint(taskId, cfi);
		return {
			kind: "epub",
			sourceDocumentPath:
				normalizePath(String(task.epubFilePath || "").trim()) || undefined,
		};
	}

	async updateDecks(card: Card, deckIds: string[]): Promise<IRPointWriteResult | null> {
		const normalizedDeckIds = normalizeDeckIds(deckIds).slice(0, 1);

		if (isPdfBookmarkTaskId(card.uuid)) {
			await this.pdfService.initialize();
			const primaryDeckId = normalizedDeckIds[0] || "";
			const updatedTask = await this.pdfService.updateTask(card.uuid, {
				topicId: primaryDeckId,
				deckId: primaryDeckId,
			});
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "pdf",
				sourceDocumentPath:
					normalizePath(String(updatedTask.pdfPath || "").trim()) || resolveCardSourceDocumentPath(card),
			};
		}

		if (isEpubBookmarkTaskId(card.uuid)) {
			await this.epubService.initialize();
			const primaryDeckId = normalizedDeckIds[0] || "";
			const updatedTask = await this.epubService.updateTask(card.uuid, {
				topicId: primaryDeckId,
				deckId: primaryDeckId,
			});
			if (!updatedTask) {
				return null;
			}
			return {
				kind: "epub",
				sourceDocumentPath:
					normalizePath(String(updatedTask.epubFilePath || "").trim()) ||
					resolveCardSourceDocumentPath(card),
			};
		}

		await this.storage.initialize();

		if (isIrChunkCard(card)) {
			await this.storage.updateChunkDecks(card.uuid, normalizedDeckIds);
			const chunk = await this.storage.getChunkData(card.uuid);
			return {
				kind: "chunk",
				sourceDocumentPath:
					normalizePath(String(chunk?.filePath || "").trim()) || resolveCardSourceDocumentPath(card),
			};
		}

		if (isIrBlockCard(card)) {
			const allDecks = await this.storage.getAllDecks();
			const currentDeckIds = Object.values(allDecks)
				.filter((deck) => Array.isArray(deck.blockIds) && deck.blockIds.includes(card.uuid))
				.map((deck) => String(deck.id || deck.path || "").trim())
				.filter(Boolean);
			const currentDeckSet = new Set(currentDeckIds);
			const nextDeckSet = new Set(normalizedDeckIds);

			for (const deckId of currentDeckIds) {
				if (!nextDeckSet.has(deckId)) {
					await this.storage.removeBlocksFromDeck(deckId, [card.uuid]);
				}
			}

			for (const deckId of normalizedDeckIds) {
				if (!currentDeckSet.has(deckId)) {
					await this.storage.addBlocksToDeck(deckId, [card.uuid]);
				}
			}

			return {
				kind: "block",
				sourceDocumentPath: resolveCardSourceDocumentPath(card),
			};
		}

		return null;
	}
}
