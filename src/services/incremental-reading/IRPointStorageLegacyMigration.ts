import { normalizePath } from "obsidian";
import { normalizeChunkForRuntime, normalizeTopicStoreRecords } from "../../utils/ir-topic-compat";
import type { ReadingMaterial, ReadingMaterialsIndex } from "../../types/incremental-reading-types";
import type { IRBlock, IRChunkFileData, IRDeck, IRSourceFileMeta } from "../../types/ir-types";

export type LegacyTopicRecord = {
	id: string;
	name: string;
};

type IRLegacyReadPaths = {
	legacyTopics: string;
	legacyDecks: string;
	materialsIndex: string;
	chunks: string;
	blocks: string;
	sources: string;
	pdfBookmarkTasks: string;
	epubBookmarkTasks: string;
};

export type IRLegacyReadApi = {
	readJson<T>(path: string, fallback: T): Promise<T>;
	paths: IRLegacyReadPaths;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function readLegacyTopicStoreRecords(
	api: IRLegacyReadApi
): Promise<Record<string, IRDeck>> {
	const [topicsFile, decksFile] = await Promise.all([
		api.readJson<Record<string, unknown>>(api.paths.legacyTopics, {} as Record<string, unknown>),
		api.readJson<Record<string, unknown>>(api.paths.legacyDecks, {} as Record<string, unknown>),
	]);
	return {
		...normalizeTopicStoreRecords(decksFile),
		...normalizeTopicStoreRecords(topicsFile),
	};
}

export async function getLegacyTopicsMap(
	api: IRLegacyReadApi,
	defaultTopicName: string
): Promise<Map<string, LegacyTopicRecord>> {
	const topicsRoot = await readLegacyTopicStoreRecords(api);
	const map = new Map<string, LegacyTopicRecord>();

	for (const [topicId, value] of Object.entries(topicsRoot)) {
		if (!isRecord(value)) {
			continue;
		}
		map.set(topicId, {
			id: topicId,
			name: (typeof value.name === "string" && value.name.trim()) || topicId || defaultTopicName,
		});
	}

	return map;
}

export async function getLegacyDecks(api: IRLegacyReadApi): Promise<Record<string, IRDeck>> {
	return await readLegacyTopicStoreRecords(api);
}

export async function getLegacyMaterials(api: IRLegacyReadApi): Promise<Map<string, ReadingMaterial>> {
	const legacyIndex = await api.readJson<ReadingMaterialsIndex>(api.paths.materialsIndex, {
		version: "1.0.0",
		lastUpdated: "",
		materials: {},
	});
	return new Map(Object.entries(legacyIndex.materials || {}));
}

export async function getLegacyChunkData(api: IRLegacyReadApi): Promise<Map<string, IRChunkFileData>> {
	const rawStore = await api.readJson<Record<string, unknown>>(api.paths.chunks, {
		version: "1.0.0",
		chunks: {},
	});
	const rawChunks = isRecord(rawStore.chunks) ? rawStore.chunks : rawStore;
	const chunks = new Map<string, IRChunkFileData>();

	for (const [chunkId, rawChunk] of Object.entries(rawChunks || {})) {
		if (!isRecord(rawChunk)) {
			continue;
		}

		const normalized = normalizeChunkForRuntime({
			...rawChunk,
			chunkId:
				typeof rawChunk.chunkId === "string" && rawChunk.chunkId.trim()
					? rawChunk.chunkId
					: chunkId,
		} as IRChunkFileData);
		if (typeof normalized.chunkId === "string" && normalized.chunkId.trim()) {
			chunks.set(normalized.chunkId, normalized);
		}
	}

	return chunks;
}

export async function getLegacyBlocksData(api: IRLegacyReadApi): Promise<Map<string, IRBlock>> {
	const rawStore = await api.readJson<Record<string, unknown>>(api.paths.blocks, {
		version: "1.0.0",
		blocks: {},
	});
	const rawBlocks = isRecord(rawStore.blocks) ? rawStore.blocks : rawStore;
	const blocks = new Map<string, IRBlock>();

	for (const [blockId, rawBlock] of Object.entries(rawBlocks || {})) {
		if (!isRecord(rawBlock)) {
			continue;
		}

		const normalizedId = (typeof rawBlock.id === "string" && rawBlock.id.trim()) || blockId;
		if (!normalizedId) {
			continue;
		}

		const headingPath = Array.isArray(rawBlock.headingPath)
			? rawBlock.headingPath
					.map((value) => (typeof value === "string" ? value.trim() : ""))
					.filter(Boolean)
			: [];
		const startLine =
			typeof rawBlock.startLine === "number"
				? rawBlock.startLine
				: typeof rawBlock.blockIndex === "number"
					? rawBlock.blockIndex
					: 0;
		const headingText =
			(typeof rawBlock.headingText === "string" && rawBlock.headingText.trim()) ||
			headingPath[headingPath.length - 1] ||
			normalizedId;

		blocks.set(normalizedId, {
			id: normalizedId,
			filePath: typeof rawBlock.filePath === "string" ? rawBlock.filePath : "",
			headingPath,
			headingLevel: typeof rawBlock.headingLevel === "number" ? rawBlock.headingLevel : 1,
			startLine,
			endLine: typeof rawBlock.endLine === "number" ? rawBlock.endLine : startLine,
			priority:
				typeof rawBlock.priority === "number" && [1, 2, 3].includes(rawBlock.priority)
					? (rawBlock.priority as 1 | 2 | 3)
					: 2,
			state:
				typeof rawBlock.state === "string" && rawBlock.state.trim()
					? (rawBlock.state as IRBlock["state"])
					: "new",
			interval: typeof rawBlock.interval === "number" ? rawBlock.interval : 0,
			intervalFactor: typeof rawBlock.intervalFactor === "number" ? rawBlock.intervalFactor : 1.5,
			nextReview: typeof rawBlock.nextReview === "string" ? rawBlock.nextReview : null,
			reviewCount: typeof rawBlock.reviewCount === "number" ? rawBlock.reviewCount : 0,
			lastReview: typeof rawBlock.lastReview === "string" ? rawBlock.lastReview : null,
			favorite: Boolean(rawBlock.favorite),
			tags: Array.isArray(rawBlock.tags)
				? rawBlock.tags.filter((item): item is string => typeof item === "string")
				: [],
			notes: typeof rawBlock.notes === "string" ? rawBlock.notes : "",
			extractedCards: Array.isArray(rawBlock.extractedCards)
				? rawBlock.extractedCards.filter((item): item is string => typeof item === "string")
				: [],
			totalReadingTime:
				typeof rawBlock.totalReadingTime === "number" ? rawBlock.totalReadingTime : 0,
			firstReadAt: typeof rawBlock.firstReadAt === "string" ? rawBlock.firstReadAt : null,
			priorityUi: typeof rawBlock.priorityUi === "number" ? rawBlock.priorityUi : undefined,
			priorityEff: typeof rawBlock.priorityEff === "number" ? rawBlock.priorityEff : undefined,
			priorityUpdatedAt:
				typeof rawBlock.priorityUpdatedAt === "string" ? rawBlock.priorityUpdatedAt : undefined,
			dailyAppearances: isRecord(rawBlock.dailyAppearances)
				? (Object.fromEntries(
						Object.entries(rawBlock.dailyAppearances)
							.filter(([, value]) => typeof value === "number")
							.map(([date, value]) => [date, Number(value)])
				  ) as Record<string, number>)
				: undefined,
			tagGroupId:
				typeof rawBlock.tagGroupId === "string" && rawBlock.tagGroupId.trim()
					? rawBlock.tagGroupId
					: undefined,
			createdAt:
				typeof rawBlock.createdAt === "string" ? rawBlock.createdAt : new Date(0).toISOString(),
			updatedAt:
				typeof rawBlock.updatedAt === "string" ? rawBlock.updatedAt : new Date().toISOString(),
			headingText,
			deckPath:
				typeof rawBlock.deckPath === "string" && rawBlock.deckPath.trim()
					? rawBlock.deckPath
					: undefined,
			blockIndex: typeof rawBlock.blockIndex === "number" ? rawBlock.blockIndex : startLine,
			contentPreview:
				typeof rawBlock.contentPreview === "string" ? rawBlock.contentPreview : headingText,
		} as IRBlock);
	}

	return blocks;
}

export async function getLegacySources(api: IRLegacyReadApi): Promise<Map<string, IRSourceFileMeta>> {
	const rawStore = await api.readJson<Record<string, unknown>>(api.paths.sources, {
		version: "1.0.0",
		sources: {},
	});
	const rawSources = isRecord(rawStore.sources) ? rawStore.sources : rawStore;
	const sources = new Map<string, IRSourceFileMeta>();

	for (const [sourceId, rawSource] of Object.entries(rawSources || {})) {
		if (!isRecord(rawSource)) {
			continue;
		}
		const normalizedSourceId =
			(typeof rawSource.sourceId === "string" && rawSource.sourceId.trim()) || sourceId;
		if (!normalizedSourceId) {
			continue;
		}
		sources.set(normalizedSourceId, {
			sourceId: normalizedSourceId,
			originalPath: typeof rawSource.originalPath === "string" ? rawSource.originalPath : "",
			rawFilePath: typeof rawSource.rawFilePath === "string" ? rawSource.rawFilePath : "",
			indexFilePath: typeof rawSource.indexFilePath === "string" ? rawSource.indexFilePath : "",
			chunkIds: Array.isArray(rawSource.chunkIds)
				? rawSource.chunkIds.filter((item): item is string => typeof item === "string")
				: [],
			title: typeof rawSource.title === "string" ? rawSource.title : normalizedSourceId,
			author: typeof rawSource.author === "string" ? rawSource.author : undefined,
			tagGroup:
				typeof rawSource.tagGroup === "string" && rawSource.tagGroup.trim()
					? rawSource.tagGroup
					: "default",
			createdAt: typeof rawSource.createdAt === "number" ? rawSource.createdAt : Date.now(),
			updatedAt: typeof rawSource.updatedAt === "number" ? rawSource.updatedAt : Date.now(),
		});
	}

	return sources;
}

export async function readLegacyBookmarkTaskStores(api: IRLegacyReadApi): Promise<{
	pdfStore: Record<string, unknown>;
	epubStore: Record<string, unknown>;
}> {
	const [pdfStore, epubStore] = await Promise.all([
		api.readJson<Record<string, unknown>>(api.paths.pdfBookmarkTasks, {}),
		api.readJson<Record<string, unknown>>(api.paths.epubBookmarkTasks, {}),
	]);
	return { pdfStore, epubStore };
}

export function deriveLegacyBlockTitle(block: IRBlock): string {
	const headingPath = Array.isArray(block.headingPath) ? block.headingPath : [];
	const headingTitle = String(headingPath[headingPath.length - 1] || "").trim();
	if (headingTitle) {
		return headingTitle;
	}
	if (typeof block.headingText === "string" && block.headingText.trim()) {
		return block.headingText.trim();
	}
	const preview = String(block.contentPreview || "").trim();
	if (preview) {
		return preview.replace(/\s+/g, " ").slice(0, 80);
	}
	const fileName = normalizePath(String(block.filePath || "").trim()).split("/").pop() || "";
	return fileName.replace(/\.md$/i, "") || String(block.id || "").trim() || "未命名阅读点";
}

export function resolveLegacyBlockTopicIds(
	block: IRBlock,
	legacyDecks: Record<string, IRDeck>,
	defaultTopicId: string
): string[] {
	const topicIds = new Set<string>();
	const directDeckPath = String((block as { deckPath?: string }).deckPath || "").trim();
	if (directDeckPath) {
		topicIds.add(directDeckPath);
	}

	for (const [deckKey, deck] of Object.entries(legacyDecks || {})) {
		if (!Array.isArray(deck.blockIds) || !deck.blockIds.includes(block.id)) {
			continue;
		}
		const deckId = String(deck.id || deck.path || deckKey || "").trim();
		if (deckId) {
			topicIds.add(deckId);
		}
	}

	if (topicIds.size === 0) {
		topicIds.add(defaultTopicId);
	}

	return Array.from(topicIds);
}

export function resolveLegacyTopicName(
	topicId: string | undefined,
	topicsMap: Map<string, LegacyTopicRecord>,
	defaultTopicName: string
): string {
	if (topicId && topicsMap.has(topicId)) {
		return topicsMap.get(topicId)?.name || defaultTopicName;
	}
	return topicId || defaultTopicName;
}
