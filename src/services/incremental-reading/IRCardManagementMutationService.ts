import { normalizePath, type App } from "obsidian";
import type { Card } from "../../data/types";
import { logger } from "../../utils/logger";
import { IRPointWriteService } from "./IRPointWriteService";
import { IRTagGroupService } from "./IRTagGroupService";

export type IRCardManagementMutationKind = "block" | "chunk" | "pdf" | "epub";

export interface IRCardManagementMutationResult {
	kind: IRCardManagementMutationKind;
	sourceDocumentPath?: string;
}

function resolveCardSourceDocumentPath(card: Card): string | undefined {
	const cardLike = card as any;
	const rawPath = String(
		cardLike.ir_source_document_key ||
			cardLike.sourceDocumentKey ||
			cardLike.sourceFile ||
			cardLike.ir_source_file ||
			""
	).trim();

	return rawPath ? normalizePath(rawPath) : undefined;
}

async function clearTagGroupCache(app: App, sourceDocumentPath?: string): Promise<void> {
	if (!sourceDocumentPath) return;
	const tagGroupService = new IRTagGroupService(app);
	await tagGroupService.initialize();
	await tagGroupService.clearDocumentMapCache(sourceDocumentPath);
}

export async function updateIRCardManagementTags(
	app: App,
	card: Card,
	tags: string[]
): Promise<IRCardManagementMutationResult> {
	const pointWriteService = new IRPointWriteService(app);
	const result = await pointWriteService.updateTags(card, tags);
	if (result) {
		await clearTagGroupCache(app, result.sourceDocumentPath);
		return result;
	}

	logger.warn("[IRCardManagementMutationService] 无法识别的 IR 标签更新对象", {
		cardId: card.uuid,
	});
	throw new Error("不支持的增量阅读对象");
}

export async function updateIRCardManagementPriority(
	app: App,
	card: Card,
	priority: number
): Promise<IRCardManagementMutationResult> {
	const pointWriteService = new IRPointWriteService(app);
	const result = await pointWriteService.updatePriority(card, priority);
	if (result) {
		return result;
	}

	logger.warn("[IRCardManagementMutationService] 无法识别的 IR 优先级更新对象", {
		cardId: card.uuid,
		priority,
	});
	throw new Error("不支持的增量阅读对象");
}

export async function updateIRCardManagementAssociatedNotes(
	app: App,
	card: Card,
	notePaths: string[]
): Promise<IRCardManagementMutationResult> {
	const pointWriteService = new IRPointWriteService(app);
	const result = await pointWriteService.updateAssociatedNotes(card, notePaths);
	if (result) {
		return result;
	}

	logger.warn("[IRCardManagementMutationService] 无法识别的 IR 关联笔记更新对象", {
		cardId: card.uuid,
		notePaths,
	});
	throw new Error("不支持的增量阅读对象");
}

export async function updateIRCardManagementDecks(
	app: App,
	card: Card,
	deckIds: string[]
): Promise<IRCardManagementMutationResult> {
	const pointWriteService = new IRPointWriteService(app);
	const result = await pointWriteService.updateDecks(card, deckIds);
	if (result) {
		return result;
	}

	logger.warn("[IRCardManagementMutationService] 无法识别的 IR 专题更新对象", {
		cardId: card.uuid,
		deckIds,
	});
	throw new Error("不支持的增量阅读对象");
}

export { resolveCardSourceDocumentPath };
