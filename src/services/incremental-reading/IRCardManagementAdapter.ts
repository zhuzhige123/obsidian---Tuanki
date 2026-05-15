import { TFile, type App } from "obsidian";
import type { IRTraceSourceKind } from "./IRSourceTraceStats";
import { detectTraceSourceKind } from "./IRSourceTraceStats";
import { IRTagGroupService } from "./IRTagGroupService";

export interface IRTableFieldParams {
	title: string;
	sourceFile: string;
	sourceKind?: IRTraceSourceKind;
	sourceDocumentLabel?: string;
	sourceSubunitLabel?: string;
	sourceDocumentKey?: string;
	deckName?: string;
	deckIds?: string[];
	state?: string;
	priority?: number;
	priorityValue?: number;
	tags?: string[];
	associatedNotePaths?: string[];
	favorite?: boolean;
	nextReview?: string | null;
	reviewCount?: number;
	readingTime?: number;
	associatedNoteCount?: number;
	extractCardCount?: number;
	memoryCardCount?: number;
	tagGroupName?: string;
	created?: string;
}

export function getIRSourceDocumentLabel(
	sourceFile: string,
	sourceDocumentKey?: string
): string {
	const raw = sourceFile || sourceDocumentKey || "";
	if (!raw) return "未命名来源";
	const normalized = raw.replace(/\\/g, "/");
	return normalized.split("/").pop() || normalized;
}

export function getIRSourceSubunitLabel(
	value: string | undefined,
	sourceKind: IRTraceSourceKind
): string {
	if (sourceKind !== "pdf" && sourceKind !== "epub") {
		return "";
	}
	if (!value) {
		return "未定位到目录书签";
	}
	return value;
}

export function getIRPriorityValue(
	...values: Array<number | null | undefined>
): number {
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
	}
	return 5;
}

export function getIRTagGroupLabel(groupName?: string | null): string {
	return groupName?.trim() || "默认";
}

export function buildIRTableFields(params: IRTableFieldParams) {
	return {
		ir_title: params.title,
		ir_source_file: params.sourceFile,
		ir_source_document_key: params.sourceDocumentKey || params.sourceFile,
		ir_source_document_label:
			params.sourceDocumentLabel || getIRSourceDocumentLabel(params.sourceFile),
		ir_source_kind: params.sourceKind || detectTraceSourceKind(params.sourceFile),
		ir_source_subunit: params.sourceSubunitLabel || "",
		ir_deck: params.deckName || "未分配",
		ir_deck_ids: params.deckIds || [],
		ir_state: params.state,
		ir_priority: params.priorityValue ?? params.priority,
		ir_priority_value: params.priorityValue ?? params.priority ?? 5,
		ir_tags: params.tags || [],
		ir_primary_associated_note_path: (params.associatedNotePaths || [])[0],
		ir_associated_note_primary_path: (params.associatedNotePaths || [])[0],
		ir_associated_note_paths: params.associatedNotePaths || [],
		ir_favorite: params.favorite || false,
		ir_next_review: params.nextReview || null,
		ir_review_count: params.reviewCount || 0,
		ir_reading_time: params.readingTime || 0,
		ir_notes: params.associatedNoteCount || 0,
		ir_extract_cards: params.extractCardCount || 0,
		ir_memory_cards: params.memoryCardCount || 0,
		ir_tag_group: params.tagGroupName || "默认",
		ir_created: params.created,
	};
}

export async function createIRTagGroupNameResolver(
	app: App
): Promise<
	(options: {
		explicitGroupId?: string;
		documentPath?: string;
		tags?: string[];
	}) => Promise<string>
> {
	const tagGroupService = new IRTagGroupService(app);
	await tagGroupService.initialize();
	const tagGroups = await tagGroupService.getAllGroups();
	const tagGroupNameById = new Map(tagGroups.map((group) => [group.id, group.name]));
	const tagGroupByDocumentCache = new Map<string, string>();
	const tagGroupByTagsCache = new Map<string, string>();

	return async (options) => {
		const explicitGroupId = options.explicitGroupId?.trim();
		if (explicitGroupId) {
			return getIRTagGroupLabel(tagGroupNameById.get(explicitGroupId) || explicitGroupId);
		}

		const documentPath = options.documentPath?.trim();
		if (documentPath) {
			const cachedDocumentGroup = tagGroupByDocumentCache.get(documentPath);
			if (cachedDocumentGroup) {
				return cachedDocumentGroup;
			}

			const abstractFile = app.vault.getAbstractFileByPath(documentPath);
			if (abstractFile instanceof TFile && abstractFile.extension === "md") {
				const groupId = await tagGroupService.matchGroupForDocument(documentPath);
				const groupName = getIRTagGroupLabel(tagGroupNameById.get(groupId) || groupId);
				tagGroupByDocumentCache.set(documentPath, groupName);
				return groupName;
			}
		}

		const normalizedTagsKey = (options.tags || [])
			.map((tag) => String(tag).trim().toLowerCase())
			.sort()
			.join("|");
		const cachedTagsGroup = tagGroupByTagsCache.get(normalizedTagsKey);
		if (cachedTagsGroup) {
			return cachedTagsGroup;
		}

		const groupId = await tagGroupService.matchGroupForTags(options.tags || []);
		const groupName = getIRTagGroupLabel(tagGroupNameById.get(groupId) || groupId);
		tagGroupByTagsCache.set(normalizedTagsKey, groupName);
		return groupName;
	};
}
