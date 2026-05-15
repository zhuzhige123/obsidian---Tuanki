import { migrateToIRBlockV4, type IRBlock, type IRChunkFileData } from "../../types/ir-types";
import { getChunkTopicIds, getTaskTopicId } from "../../utils/ir-topic-compat";
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { extractReadingPointDisplayName } from "./IRReadingPointTitle";
import type { IRProjectedScheduleItem } from "./IRProjectedScheduleSummary";
import type { IREpubBookmarkTask } from "./IREpubBookmarkTaskService";
import type { IRPdfBookmarkTask } from "./IRPdfBookmarkTaskService";
import type { IRScheduleExplanation } from "./IRScheduleKernel";

export type ScheduleItemSourceType = IRProjectedScheduleItem["sourceType"];

export interface ScheduleItem {
	id: string;
	title: string;
	displayName?: string;
	sourceFile: string;
	autoSubscribedAt?: string;
	autoSubscribedBadgeUntil?: string;
	primaryAssociatedNotePath?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];
	associatedNoteScope?: "point" | "material";
	deckId?: string;
	priority: number;
	intervalDays: number;
	scheduleStatus: string;
	nextRepDate: number;
	nextReviewDate: Date | null;
	resumeLink?: string;
	sourceType?: ScheduleItemSourceType;
	explanation?: IRScheduleExplanation;
	sourceSequenceGroup?: string;
	sourceSequenceOrder?: number;
	sourceSequenceLocked?: boolean;
	sourceSequenceAnchorDateKey?: string;
}

function extractChunkTitleFromFilePath(filePath: string, fallbackId?: string): string {
	const fallback = String(fallbackId || "").trim();
	const baseName = String(filePath || "").trim().split("/").pop() || fallback;
	const stem = baseName.replace(/\.md$/i, "").trim();
	const cleaned = stem.replace(/^\d+_/, "").trim();
	return cleaned || stem || fallback || "Untitled";
}

function extractChunkTitle(chunk: IRChunkFileData, fallbackId?: string): string {
	const chunkMeta = (chunk?.meta || {}) as unknown as Record<string, unknown>;
	const pointTitle =
		typeof chunkMeta.pointTitle === "string"
			? String((chunkMeta.pointTitle as string) || "").trim()
			: "";
	if (pointTitle) {
		return pointTitle;
	}
	return extractChunkTitleFromFilePath(String(chunk?.filePath || "").trim(), fallbackId);
}

function getLegacyBlockDisplayName(block: IRBlock): string | undefined {
	const displayName = Array.isArray(block.headingPath) && block.headingPath.length > 0
		? String(block.headingPath[block.headingPath.length - 1] || "").trim()
		: "";
	return displayName || undefined;
}

function getLegacyBlockAssociatedNoteFields(
	block: IRBlock
): Pick<
	ScheduleItem,
	"primaryAssociatedNotePath" | "associatedNotePath" | "associatedNotePaths" | "associatedNoteScope"
> {
	const associatedNotePaths = resolveAssociatedNotePaths({
		associatedNotePath:
			(block as any).primaryAssociatedNotePath ||
			(block as any).associatedNotePath ||
			(block as any).meta?.associatedNotePath,
		associatedNotePaths: (block as any).associatedNotePaths || (block as any).meta?.associatedNotePaths,
	});
	const primaryAssociatedNotePath = associatedNotePaths[0] || undefined;
	return {
		primaryAssociatedNotePath,
		associatedNotePath: primaryAssociatedNotePath,
		associatedNotePaths,
		associatedNoteScope: primaryAssociatedNotePath ? "point" : undefined,
	};
}

function normalizeScheduleItemSequenceOrder(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function getScheduleItemSequenceMeta(meta: unknown): Pick<
	ScheduleItem,
	"sourceSequenceGroup" | "sourceSequenceOrder" | "sourceSequenceLocked" | "sourceSequenceAnchorDateKey"
> {
	const record = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
	const sourceSequenceGroup = String(record?.sourceSequenceGroup || "").trim() || undefined;
	const sourceSequenceOrder = normalizeScheduleItemSequenceOrder(record?.sourceSequenceOrder);
	const sourceSequenceAnchorDateKey = String(record?.sourceSequenceAnchorDateKey || "").trim() || undefined;

	return {
		sourceSequenceGroup,
		sourceSequenceOrder,
		sourceSequenceLocked: record?.sourceSequenceLocked === true ? true : undefined,
		sourceSequenceAnchorDateKey,
	};
}

export function buildScheduleItemFromProjectedItem(item: IRProjectedScheduleItem): ScheduleItem {
	return {
		id: item.id,
		title: item.title,
		displayName: item.displayName,
		sourceFile: item.sourceFile,
		autoSubscribedAt: item.autoSubscribedAt,
		autoSubscribedBadgeUntil: item.autoSubscribedBadgeUntil,
		primaryAssociatedNotePath: item.associatedNotePath,
		associatedNotePath: item.associatedNotePath,
		associatedNotePaths: item.associatedNotePath ? [item.associatedNotePath] : [],
		associatedNoteScope: item.associatedNoteScope,
		deckId: item.deckId,
		priority: item.priority,
		intervalDays: item.intervalDays,
		scheduleStatus: item.scheduleStatus,
		nextRepDate: item.nextRepDate,
		nextReviewDate: item.nextReviewDate,
		resumeLink: item.resumeLink,
		sourceType: item.sourceType,
		explanation: item.explanation,
		sourceSequenceGroup: item.sourceSequenceGroup,
		sourceSequenceOrder: item.sourceSequenceOrder,
		sourceSequenceLocked: item.sourceSequenceLocked,
		sourceSequenceAnchorDateKey: item.sourceSequenceAnchorDateKey,
	};
}

export function buildScheduleItemFromLegacyBlock(block: IRBlock): ScheduleItem {
	const migrated = migrateToIRBlockV4(block);
	const displayName = getLegacyBlockDisplayName(block);
	const title =
		displayName ||
		String((block as any).headingText || "").trim() ||
		String(block.contentPreview || "").trim().replace(/\s+/g, " ").slice(0, 60) ||
		String(block.id || "").trim() ||
		"Untitled";

	return {
		id: block.id,
		title,
		displayName,
		sourceFile: String(block.filePath || "").trim(),
		deckId: String((block as any).deckPath || "").trim() || undefined,
		...getLegacyBlockAssociatedNoteFields(block),
		priority: Number((block as any).priorityUi ?? (block as any).priorityEff ?? 5),
		intervalDays: Number((block as any).interval ?? migrated.intervalDays ?? 1),
		scheduleStatus: String((block as any).state || migrated.status || "new"),
		nextRepDate: Number(migrated.nextRepDate || 0),
		nextReviewDate: migrated.nextRepDate ? new Date(migrated.nextRepDate) : null,
		...getScheduleItemSequenceMeta((block as any).meta),
		sourceType: "legacy-block",
	};
}

export function buildScheduleItemFromChunkData(
	chunk: IRChunkFileData,
	fallbackId?: string
): ScheduleItem {
	const filePath = String(chunk?.filePath || "").trim();
	const title = extractChunkTitle(chunk, fallbackId || String(chunk?.chunkId || "").trim());
	const associatedNotePaths = resolveAssociatedNotePaths({
		associatedNotePath: chunk?.meta?.primaryAssociatedNotePath || chunk?.meta?.associatedNotePath,
		associatedNotePaths: chunk?.meta?.associatedNotePaths,
	});
	const primaryAssociatedNotePath = associatedNotePaths[0] || undefined;
	const nextRepDate = Number(chunk?.nextRepDate || 0);
	const chunkMeta = ((chunk?.meta || {}) as unknown) as Record<string, unknown>;

	return {
		id: String(chunk?.chunkId || fallbackId || "").trim(),
		title,
		displayName: extractReadingPointDisplayName(title),
		sourceFile: filePath,
		autoSubscribedAt:
			typeof chunkMeta.autoSubscribedAt === "string" ? chunkMeta.autoSubscribedAt : undefined,
		autoSubscribedBadgeUntil:
			typeof chunkMeta.autoSubscribedBadgeUntil === "string"
				? chunkMeta.autoSubscribedBadgeUntil
				: undefined,
		deckId: String(getChunkTopicIds(chunk)[0] || "").trim() || undefined,
		primaryAssociatedNotePath,
		associatedNotePath: primaryAssociatedNotePath,
		associatedNotePaths,
		associatedNoteScope: primaryAssociatedNotePath ? "point" : undefined,
		priority: Number(chunk?.priorityUi ?? chunk?.priorityEff ?? 5),
		intervalDays: Number(chunk?.intervalDays ?? 1),
		scheduleStatus: String(chunk?.scheduleStatus || "new"),
		nextRepDate,
		nextReviewDate: nextRepDate > 0 ? new Date(nextRepDate) : null,
		resumeLink: typeof chunkMeta.resumeLink === "string" ? chunkMeta.resumeLink : undefined,
		...getScheduleItemSequenceMeta(chunk?.meta),
		sourceType: "chunk",
	};
}

export function buildScheduleItemFromPdfTask(task: IRPdfBookmarkTask): ScheduleItem {
	const fullTitle = String(task?.title || "").trim() || "PDF";
	return {
		id: String(task?.id || "").trim(),
		title: fullTitle,
		displayName: extractReadingPointDisplayName(fullTitle),
		sourceFile: String(task?.pdfPath || "").trim(),
		primaryAssociatedNotePath: task?.meta?.primaryAssociatedNotePath || task?.meta?.associatedNotePath,
		associatedNotePath: task?.meta?.associatedNotePath || task?.meta?.primaryAssociatedNotePath,
		associatedNotePaths: resolveAssociatedNotePaths({
			associatedNotePath: task?.meta?.primaryAssociatedNotePath || task?.meta?.associatedNotePath,
			associatedNotePaths: task?.meta?.associatedNotePaths,
		}),
		associatedNoteScope:
			task?.meta?.associatedNotePath || task?.meta?.primaryAssociatedNotePath ? "point" : undefined,
		resumeLink: task?.link,
		priority: Number(task?.priorityUi ?? task?.priorityEff ?? 5),
		intervalDays: Number(task?.intervalDays ?? 1),
		scheduleStatus: String(task?.status || "new"),
		nextRepDate: Number(task?.nextRepDate || 0),
		nextReviewDate: task?.nextRepDate ? new Date(task.nextRepDate) : null,
		deckId: String(getTaskTopicId(task) || "").trim() || undefined,
		...getScheduleItemSequenceMeta(task?.meta),
		sourceType: "pdf",
	};
}

export async function buildScheduleItemFromEpubTask(
	task: IREpubBookmarkTask,
	options?: {
		resolvedFilePath?: string;
		resolveFilePath?: (
			input: Pick<IREpubBookmarkTask, "sourceId" | "epubFilePath">
		) => Promise<string>;
	}
): Promise<ScheduleItem> {
	const resolvedFilePath =
		options?.resolvedFilePath ||
		(await options?.resolveFilePath?.({
			sourceId: task?.sourceId,
			epubFilePath: task?.epubFilePath,
		})) ||
		String(task?.epubFilePath || "").trim();

	return {
		id: String(task?.id || "").trim(),
		title: String(task?.title || "").trim() || "EPUB",
		displayName: extractReadingPointDisplayName(String(task?.title || "").trim() || "EPUB"),
		sourceFile: resolvedFilePath,
		primaryAssociatedNotePath: task?.meta?.primaryAssociatedNotePath || task?.meta?.associatedNotePath,
		associatedNotePath: task?.meta?.associatedNotePath || task?.meta?.primaryAssociatedNotePath,
		associatedNotePaths: resolveAssociatedNotePaths({
			associatedNotePath: task?.meta?.primaryAssociatedNotePath || task?.meta?.associatedNotePath,
			associatedNotePaths: task?.meta?.associatedNotePaths,
		}),
		associatedNoteScope:
			task?.meta?.associatedNotePath || task?.meta?.primaryAssociatedNotePath ? "point" : undefined,
		priority: Number(task?.priorityUi ?? task?.priorityEff ?? 5),
		intervalDays: Number(task?.intervalDays ?? 1),
		scheduleStatus: String(task?.status || "new"),
		nextRepDate: Number(task?.nextRepDate || 0),
		nextReviewDate: task?.nextRepDate ? new Date(task.nextRepDate) : null,
		deckId: String(getTaskTopicId(task) || "").trim() || undefined,
		...getScheduleItemSequenceMeta(task?.meta),
		sourceType: "epub",
	};
}
