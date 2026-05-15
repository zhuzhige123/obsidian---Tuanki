import type { App } from "obsidian";
import {
	migrateToIRBlockV4,
	type IRBlock,
	type IRDeck,
	type IRPriority,
} from "../../types/ir-types";
import {
	getSharedIRScheduleKernel,
	type IRPlannedSchedule,
	type IRPlannedScheduleItem,
	type ScheduleRecomputeReason,
} from "./IRScheduleKernel";
import { resolveAssociatedNotePath, resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { IRStorageService } from "./IRStorageService";

type SessionLike = { blockId?: string; duration?: number };

export interface IRProjectedScheduleSeedData {
	decksRecord?: Record<string, IRDeck>;
	blocksRecord?: Record<string, IRBlock>;
	history?: { sessions?: SessionLike[] };
}

export interface ProjectedScheduleOptions {
	deckIds?: string[];
	horizonDays?: number;
	reason?: ScheduleRecomputeReason;
	seedData?: IRProjectedScheduleSeedData;
	schedule?: IRPlannedSchedule;
}

export interface IRProjectedScheduleItem
	extends Omit<IRPlannedScheduleItem, "sourceType" | "explanation"> {
	sourceType: IRPlannedScheduleItem["sourceType"] | "legacy-block";
	explanation?: IRPlannedScheduleItem["explanation"];
}

export interface IRProjectedDayLoad {
	dateKey: string;
	items: IRProjectedScheduleItem[];
	totalEstimatedMinutes: number;
}

export interface IRProjectedScheduleSummary {
	schedule: IRPlannedSchedule;
	dayLoadsByDate: Map<string, IRProjectedDayLoad>;
	dayLoadsByDeckId: Map<string, Map<string, IRProjectedDayLoad>>;
}

function formatDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

function normalizeDeckIds(deckIds?: string[]): string[] {
	return Array.from(
		new Set((deckIds || []).map((deckId) => String(deckId || "").trim()).filter(Boolean))
	);
}

function cloneDayLoad(dateKey: string, load?: IRProjectedDayLoad): IRProjectedDayLoad {
	if (!load) {
		return {
			dateKey,
			items: [],
			totalEstimatedMinutes: 0,
		};
	}

	return {
		dateKey,
		items: [...load.items],
		totalEstimatedMinutes: load.totalEstimatedMinutes,
	};
}

function getOrCreateDayLoad(
	map: Map<string, IRProjectedDayLoad>,
	dateKey: string
): IRProjectedDayLoad {
	let load = map.get(dateKey);
	if (!load) {
		load = {
			dateKey,
			items: [],
			totalEstimatedMinutes: 0,
		};
		map.set(dateKey, load);
	}
	return load;
}

function pushProjectedItem(
	summary: IRProjectedScheduleSummary,
	dateKey: string,
	item: IRProjectedScheduleItem,
	deckIds: string[]
): void {
	const globalDayLoad = getOrCreateDayLoad(summary.dayLoadsByDate, dateKey);
	globalDayLoad.items.push(item);
	globalDayLoad.totalEstimatedMinutes += item.estimatedMinutes;

	for (const deckId of normalizeDeckIds(deckIds)) {
		let deckLoads = summary.dayLoadsByDeckId.get(deckId);
		if (!deckLoads) {
			deckLoads = new Map<string, IRProjectedDayLoad>();
			summary.dayLoadsByDeckId.set(deckId, deckLoads);
		}

		const deckDayLoad = getOrCreateDayLoad(deckLoads, dateKey);
		deckDayLoad.items.push(item);
		deckDayLoad.totalEstimatedMinutes += item.estimatedMinutes;
	}
}

function normalizeIdentifiers(values: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
	);
}

function buildDeckIdentifierContext(decks: IRDeck[], requestedDeckIds: string[]): {
	targetIdentifiers: Set<string>;
	canonicalByIdentifier: Map<string, string>;
} {
	const normalizedTargets = normalizeIdentifiers(requestedDeckIds);
	const targetIdentifiers = new Set<string>();
	const canonicalByIdentifier = new Map<string, string>();

	for (const deck of decks) {
		const deckId = String(deck?.id || "").trim();
		const deckPath = String((deck as any)?.path || "").trim();
		const identifiers = normalizeIdentifiers([deckId, deckPath]);
		if (identifiers.length === 0) {
			continue;
		}

		const isTarget =
			normalizedTargets.length === 0 ||
			identifiers.some((identifier) => normalizedTargets.includes(identifier));
		if (!isTarget) {
			continue;
		}

		for (const identifier of identifiers) {
			targetIdentifiers.add(identifier);
			canonicalByIdentifier.set(identifier, deckId || identifier);
		}
	}

	for (const identifier of normalizedTargets) {
		targetIdentifiers.add(identifier);
		if (!canonicalByIdentifier.has(identifier)) {
			canonicalByIdentifier.set(identifier, identifier);
		}
	}

	return {
		targetIdentifiers,
		canonicalByIdentifier,
	};
}

function shouldIncludeLegacyBlock(block: IRBlock): boolean {
	if (block.state === "suspended") return false;
	const tags = Array.isArray(block.tags) ? block.tags : [];
	if (
		tags.some((tag) => {
			const normalized = String(tag || "").trim().toLowerCase();
			return normalized === "ignore" || normalized === "#ignore";
		})
	) {
		return false;
	}
	return !/#ignore\b/i.test(String(block.contentPreview || ""));
}

function buildLegacyBlockDeckIdsByBlockId(
	decks: IRDeck[],
	targetIdentifiers: Set<string>,
	canonicalByIdentifier: Map<string, string>
): Map<string, string[]> {
	const result = new Map<string, string[]>();
	for (const deck of decks) {
		const identifiers = normalizeIdentifiers([deck.id, deck.path]);
		if (!identifiers.some((identifier) => targetIdentifiers.has(identifier))) {
			continue;
		}

		const canonicalDeckId =
			canonicalByIdentifier.get(String(deck.id || "").trim()) ||
			canonicalByIdentifier.get(String((deck as any)?.path || "").trim()) ||
			String(deck.id || (deck as any)?.path || "").trim();
		if (!canonicalDeckId) continue;

		for (const blockId of deck.blockIds || []) {
			const normalizedBlockId = String(blockId || "").trim();
			if (!normalizedBlockId) continue;
			const current = new Set(result.get(normalizedBlockId) || []);
			current.add(canonicalDeckId);
			result.set(normalizedBlockId, [...current]);
		}
	}
	return result;
}

function buildSessionTotalsByBlockId(
	sessions: SessionLike[] | undefined | null
): Map<string, number> {
	const totals = new Map<string, number>();
	for (const session of sessions || []) {
		const blockId = String(session?.blockId || "").trim();
		const duration = Number(session?.duration || 0);
		if (!blockId || duration <= 0) continue;
		totals.set(blockId, (totals.get(blockId) || 0) + duration);
	}
	return totals;
}

function mapLegacyPriority(priority?: IRPriority): number {
	switch (priority) {
		case 1:
			return 8;
		case 3:
			return 3;
		case 2:
		default:
			return 5;
	}
}

function estimateLegacyBlockMinutes(
	block: IRBlock,
	readingSecondsById: Map<string, number>
): number {
	const historicalSeconds = readingSecondsById.get(String(block.id || "").trim()) || 0;
	if (historicalSeconds > 0 && block.reviewCount > 0) {
		return Math.max(0.5, historicalSeconds / block.reviewCount / 60);
	}
	if (block.totalReadingTime && block.reviewCount > 0) {
		return Math.max(0.5, block.totalReadingTime / block.reviewCount / 60);
	}
	return 3;
}

function getLegacyBlockTitle(block: IRBlock): string {
	const headingTitle =
		Array.isArray(block.headingPath) && block.headingPath.length > 0
			? String(block.headingPath[block.headingPath.length - 1] || "").trim()
			: "";
	if (headingTitle) {
		return headingTitle;
	}

	const preview = String(block.contentPreview || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, 60);
	if (preview) {
		return preview;
	}

	return String(block.id || "Legacy Block").trim() || "Legacy Block";
}

function mapLegacyBlockToProjectedItem(
	block: IRBlock,
	deckId: string,
	readingSecondsById: Map<string, number>,
	todayEndMs: number
): IRProjectedScheduleItem {
	const migrated = migrateToIRBlockV4(block);
	const nextRepDate = Number(migrated.nextRepDate || 0);
	const title = getLegacyBlockTitle(block);
	const associatedNotePath = resolveAssociatedNotePaths({
		associatedNotePath:
			resolveAssociatedNotePath(block as any) ||
			resolveAssociatedNotePath((((block as any).meta || null) as any) || null),
		associatedNotePaths: Array.isArray((block as any).associatedNotePaths)
			? (block as any).associatedNotePaths
			: Array.isArray((block as any).meta?.associatedNotePaths)
				? (block as any).meta.associatedNotePaths
				: undefined,
	})[0];
	let scheduleStatus: string = migrated.status;
	if (scheduleStatus !== "new" && nextRepDate > 0 && nextRepDate <= todayEndMs) {
		scheduleStatus = "scheduled";
	}

	return {
		id: block.id,
		title,
		displayName:
			Array.isArray(block.headingPath) && block.headingPath.length > 0
				? String(block.headingPath[block.headingPath.length - 1] || "").trim() || undefined
				: undefined,
		sourceFile: String(block.filePath || "").trim(),
		topicKey: `source:${String(block.filePath || "").trim()}`,
		associatedNotePath,
		associatedNoteScope: associatedNotePath ? "point" : undefined,
		priority: Number(block.priorityUi ?? block.priorityEff ?? mapLegacyPriority(block.priority)),
		intervalDays: Number(migrated.intervalDays || block.interval || 1),
		scheduleStatus,
		nextRepDate,
		nextReviewDate: nextRepDate > 0 ? new Date(nextRepDate) : null,
		estimatedMinutes: estimateLegacyBlockMinutes(block, readingSecondsById),
		deckId,
		sourceType: "legacy-block",
	};
}

async function mergeLegacyBlocksIntoProjectedScheduleSummary(
	app: App,
	summary: IRProjectedScheduleSummary,
	options: ProjectedScheduleOptions
): Promise<IRProjectedScheduleSummary> {
	let storage: IRStorageService | null = null;
	const getStorage = async (): Promise<IRStorageService> => {
		if (!storage) {
			storage = new IRStorageService(app);
			await storage.initialize();
		}
		return storage;
	};

	const decksRecord =
		options.seedData?.decksRecord ||
		(await (await getStorage()).getAllDecks());
	const blocksRecord =
		options.seedData?.blocksRecord ||
		(await (await getStorage()).getAllBlocks());
	const history = options.seedData?.history || (await (await getStorage()).getHistory());

	const decks = Object.values(decksRecord || {});
	const blocks = Object.values(blocksRecord || {});
	if (decks.length === 0 || blocks.length === 0) {
		return summary;
	}

	const requestedDeckIds =
		options.deckIds?.length ? options.deckIds : decks.map((deck) => String(deck.id || "").trim());
	const { targetIdentifiers, canonicalByIdentifier } = buildDeckIdentifierContext(
		decks,
		requestedDeckIds
	);
	const blockDeckIdsById = buildLegacyBlockDeckIdsByBlockId(
		decks,
		targetIdentifiers,
		canonicalByIdentifier
	);
	const readingSecondsById = buildSessionTotalsByBlockId(history?.sessions);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayKey = formatDateKey(today);
	const todayEndMs = today.getTime() + 24 * 60 * 60 * 1000 - 1;

	for (const block of blocks) {
		if (!shouldIncludeLegacyBlock(block)) {
			continue;
		}

		const matchedDeckIds = new Set(blockDeckIdsById.get(String(block.id || "").trim()) || []);
		const legacyDeckPath = String((block as any)?.deckPath || "").trim();
		if (legacyDeckPath && targetIdentifiers.has(legacyDeckPath)) {
			matchedDeckIds.add(canonicalByIdentifier.get(legacyDeckPath) || legacyDeckPath);
		}

		if (matchedDeckIds.size === 0) {
			continue;
		}

		const primaryDeckId = [...matchedDeckIds][0];
		const item = mapLegacyBlockToProjectedItem(
			block,
			primaryDeckId,
			readingSecondsById,
			todayEndMs
		);
		const nextRepDate = Number(item.nextRepDate || 0);
		const dateKey = nextRepDate > todayEndMs ? formatDateKey(new Date(nextRepDate)) : todayKey;
		pushProjectedItem(summary, dateKey, item, [...matchedDeckIds]);
	}

	return summary;
}

export async function getProjectedScheduleSummary(
	app: App,
	options: ProjectedScheduleOptions = {}
): Promise<IRProjectedScheduleSummary> {
	const schedule =
		options.schedule ||
		(await getSharedIRScheduleKernel(app).recomputeScheduleForDeck(options.reason ?? "ui_refresh", {
			deckIds: options.deckIds,
			horizonDays: options.horizonDays,
		}));
	const summary = buildProjectedScheduleSummary(schedule);
	return await mergeLegacyBlocksIntoProjectedScheduleSummary(app, summary, options);
}

export function buildProjectedScheduleSummary(
	schedule: IRPlannedSchedule
): IRProjectedScheduleSummary {
	const summary: IRProjectedScheduleSummary = {
		schedule,
		dayLoadsByDate: new Map<string, IRProjectedDayLoad>(),
		dayLoadsByDeckId: new Map<string, Map<string, IRProjectedDayLoad>>(),
	};

	for (const day of schedule.days) {
		for (const originalItem of day.items) {
			const item: IRProjectedScheduleItem = {
				...originalItem,
				sourceType: originalItem.sourceType,
				explanation: originalItem.explanation,
			};
			pushProjectedItem(summary, day.dateKey, item, item.deckId ? [item.deckId] : []);
		}
	}

	return summary;
}

export function getProjectedDayLoad(
	summary: IRProjectedScheduleSummary,
	date: Date | string,
	deckIds?: string[]
): IRProjectedDayLoad {
	const dateKey = typeof date === "string" ? date : formatDateKey(date);
	const normalizedDeckIds = normalizeDeckIds(deckIds);

	if (normalizedDeckIds.length === 0) {
		return cloneDayLoad(dateKey, summary.dayLoadsByDate.get(dateKey));
	}

	const combined = cloneDayLoad(dateKey);
	for (const deckId of normalizedDeckIds) {
		const deckLoad = summary.dayLoadsByDeckId.get(deckId)?.get(dateKey);
		if (!deckLoad) continue;
		combined.items.push(...deckLoad.items);
		combined.totalEstimatedMinutes += deckLoad.totalEstimatedMinutes;
	}
	return combined;
}

export function buildProjectedDayLoadMap(
	summary: IRProjectedScheduleSummary,
	deckIds?: string[]
): Map<string, IRProjectedDayLoad> {
	const normalizedDeckIds = normalizeDeckIds(deckIds);
	if (normalizedDeckIds.length === 0) {
		return new Map(
			Array.from(summary.dayLoadsByDate.entries()).map(([dateKey, load]) => [
				dateKey,
				cloneDayLoad(dateKey, load),
			])
		);
	}

	const result = new Map<string, IRProjectedDayLoad>();
	for (const dateKey of Array.from(summary.dayLoadsByDate.keys()).sort((a, b) => a.localeCompare(b))) {
		const combined = getProjectedDayLoad(summary, dateKey, normalizedDeckIds);
		if (combined.items.length > 0) {
			result.set(dateKey, combined);
		}
	}
	return result;
}
