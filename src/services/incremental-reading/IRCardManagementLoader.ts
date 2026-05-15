import type { App } from "obsidian";
import type { Card } from "../../data/types";
import type {
	IRBlock,
	IRDeck,
	IRSourceFileMeta,
} from "../../types/ir-types";
import type { IRPointSnapshot } from "../../types/ir-point-storage-types";
import type { ReadingMaterial } from "../../types/incremental-reading-types";
import { logger } from "../../utils/logger";
import { IRStorageService } from "./IRStorageService";
import { IRPointDataReadService } from "./IRPointDataReadService";
import { getSharedIRWorkspaceSnapshotService } from "./IRWorkspaceSnapshotService";
import {
	buildLegacyChunkFromPointSnapshot,
	getLegacyBookmarkTaskKind,
	getStoredPointKind,
} from "./IRLegacyTaskCompatAdapter";
import {
	buildIREpubPointCard,
	buildIREpubTaskCard,
	buildIRChunkCard,
	buildIRPdfPointCard,
	buildIRPdfTaskCard,
	buildLegacyIRBlockCard,
	type IRCardBuilderHelpers,
} from "./IRCardManagementBuilders";
import { createIRTagGroupNameResolver } from "./IRCardManagementAdapter";

export interface IRCardManagementLoadResult {
	irBlocks: Record<string, IRBlock>;
	irDecks: Record<string, IRDeck>;
	irExtractCardIds: Set<string>;
	cards: Card[];
	legacyCount: number;
	chunkCount: number;
	pdfTaskCount: number;
	epubTaskCount: number;
}

function buildIRSessionTotalsByBlockId(
        sessions: Array<{ blockId?: string; duration?: number }> | undefined | null
): Map<string, number> {
        const totals = new Map<string, number>();
	for (const session of sessions || []) {
		const blockId = String(session?.blockId || "");
		const duration = Number(session?.duration || 0);
		if (!blockId || duration <= 0) continue;
		totals.set(blockId, (totals.get(blockId) || 0) + duration);
        }
        return totals;
}

function dedupeCardsByUuid(cards: Card[]): Card[] {
        const deduped = new Map<string, Card>();
        const duplicateIds: string[] = [];
        let invalidCount = 0;

        for (const card of cards) {
                const uuid = String(card?.uuid || "").trim();
                if (!uuid) {
                        invalidCount++;
                        continue;
                }

                if (deduped.has(uuid)) {
                        duplicateIds.push(uuid);
                        deduped.delete(uuid);
                }
                deduped.set(uuid, card);
        }

        if (duplicateIds.length > 0 || invalidCount > 0) {
                logger.warn(
                        `[IR] Card management loader deduped cards: duplicates=${duplicateIds.length}, invalid=${invalidCount}`,
                        duplicateIds.length > 0
                                ? { duplicateIds: Array.from(new Set(duplicateIds)).slice(0, 10) }
                                : undefined
                );
        }

        return Array.from(deduped.values());
}

async function collectIRExtractCardIds(
        plugin: {
                readingMaterialManager?: {
                        getAllMaterials?: () => ReadingMaterial[] | Promise<ReadingMaterial[]>;
                };
	}
): Promise<Set<string>> {
	const extractCardIds = new Set<string>();
	const manager = plugin?.readingMaterialManager;
	if (!manager?.getAllMaterials) {
		return extractCardIds;
	}

	try {
		const materials = (await Promise.resolve(manager.getAllMaterials())) as ReadingMaterial[];
		for (const material of materials || []) {
			for (const cardId of material.extractedCards || []) {
				if (cardId) {
					extractCardIds.add(cardId);
				}
			}
		}
	} catch (error) {
		logger.warn("[IR] 收集摘录卡回退ID失败:", error);
	}

	return extractCardIds;
}

export async function loadIRCardManagementData(options: {
	app: App;
	plugin: {
		settings?: {
			incrementalReading?: { importFolder?: string };
			weaveParentFolder?: string;
		};
		readingMaterialManager?: {
			getAllMaterials?: () => ReadingMaterial[] | Promise<ReadingMaterial[]>;
		};
	};
	storage: IRStorageService;
	helpers: Omit<IRCardBuilderHelpers, "resolveTagGroupName">;
}): Promise<IRCardManagementLoadResult> {
	const { app, plugin, storage, helpers } = options;
	void storage;
	const workspaceSnapshotPromise = getSharedIRWorkspaceSnapshotService(app).getWorkspaceData();
	let pointSnapshots: IRPointSnapshot[] = [];
	try {
		pointSnapshots = await new IRPointDataReadService(app).listPointSnapshots();
	} catch (error) {
		logger.warn("[IR] 新点存储读取失败，回退旧任务读取:", error);
	}
	const workspaceSnapshot = await workspaceSnapshotPromise;
	const irBlocks = workspaceSnapshot.blocksRecord;
	const irDecks = workspaceSnapshot.decksRecord;
	const history = workspaceSnapshot.history;
	const irExtractCardIds = await collectIRExtractCardIds(plugin);
	const readingSecondsById = buildIRSessionTotalsByBlockId(history.sessions);
	const chunkData = workspaceSnapshot.chunksRecord;
	const sourcesData = workspaceSnapshot.sourcesRecord as Record<string, IRSourceFileMeta>;
	const resolveTagGroupName = await createIRTagGroupNameResolver(app);
	const builderHelpers: IRCardBuilderHelpers = {
		...helpers,
		resolveTagGroupName,
	};

	logger.info(
		`[IR] 加载数据: blocks=${Object.keys(irBlocks).length}, decks=${Object.keys(irDecks).length}, chunks=${Object.keys(chunkData).length}, sources=${Object.keys(sourcesData).length}`
	);

	const convertedCards: Card[] = [];
	const chunkIds = new Set(Object.keys(chunkData));
	const handledChunkIds = new Set<string>();

	for (const block of Object.values(irBlocks)) {
		const card = await buildLegacyIRBlockCard({
			block,
			irDecks,
			chunkIds,
			readingSecondsById,
			helpers: builderHelpers,
		});
		if (card) {
			convertedCards.push(card);
		}
	}

	try {
		for (const snapshot of pointSnapshots) {
			if (getStoredPointKind(snapshot) !== "chunk") {
				continue;
			}

			handledChunkIds.add(snapshot.point.id);
			if (snapshot.point.schedule.status === "done" || snapshot.point.schedule.status === "removed") {
				continue;
			}

			const { chunk, source } = buildLegacyChunkFromPointSnapshot(snapshot);
			const card = await buildIRChunkCard({
				app,
				chunk,
				source,
				readingSecondsById,
				helpers: builderHelpers,
			});
			convertedCards.push(card);
		}
	} catch (error) {
		logger.warn("[IR] chunk point 加载失败（继续使用旧 chunks 数据）:", error);
	}

	for (const chunk of Object.values(chunkData)) {
		if (handledChunkIds.has(chunk.chunkId)) {
			continue;
		}
		const card = await buildIRChunkCard({
			app,
			chunk,
			source: sourcesData[chunk.sourceId],
			readingSecondsById,
			helpers: builderHelpers,
		});
		convertedCards.push(card);
	}

	let pdfTaskCount = 0;
	const handledBookmarkIds = new Set<string>();
	try {
		for (const snapshot of pointSnapshots) {
			const bookmarkKind = getLegacyBookmarkTaskKind(snapshot);
			if (bookmarkKind !== "pdf") {
				continue;
			}

			handledBookmarkIds.add(snapshot.point.id);
			if (snapshot.point.schedule.status === "done" || snapshot.point.schedule.status === "removed") {
				continue;
			}

			const card = await buildIRPdfPointCard({
				point: snapshot.point,
				material: snapshot.material,
				topicId: snapshot.topicId,
				topicName: snapshot.topicName,
				readingSecondsById,
				helpers: builderHelpers,
			});
			convertedCards.push(card);
			pdfTaskCount++;
		}

		const pdfTasks = workspaceSnapshot.pdfTasks;

		for (const task of pdfTasks) {
			if (handledBookmarkIds.has(task.id)) continue;
			if (task.status === "done" || task.status === "removed") continue;
			const card = await buildIRPdfTaskCard({
				task,
				readingSecondsById,
				helpers: builderHelpers,
			});
			convertedCards.push(card);
			pdfTaskCount++;
		}

		if (pdfTaskCount > 0) {
			logger.info(`[IR] 加载了 ${pdfTaskCount} 个PDF书签任务`);
		}
	} catch (error) {
		logger.warn("[IR] PDF书签任务加载失败（继续使用其他数据）:", error);
	}

	let epubTaskCount = 0;
	try {
		for (const snapshot of pointSnapshots) {
			const bookmarkKind = getLegacyBookmarkTaskKind(snapshot);
			if (bookmarkKind !== "epub") {
				continue;
			}

			handledBookmarkIds.add(snapshot.point.id);
			if (snapshot.point.schedule.status === "done" || snapshot.point.schedule.status === "removed") {
				continue;
			}

			const card = await buildIREpubPointCard({
				point: snapshot.point,
				material: snapshot.material,
				topicId: snapshot.topicId,
				topicName: snapshot.topicName,
				readingSecondsById,
				helpers: builderHelpers,
			});
			convertedCards.push(card);
			epubTaskCount++;
		}

		const epubTasks = workspaceSnapshot.epubTasks;

		for (const task of epubTasks) {
			if (handledBookmarkIds.has(task.id)) continue;
			if (task.status === "done" || task.status === "removed") continue;
			const card = await buildIREpubTaskCard({
				task,
				readingSecondsById,
				helpers: builderHelpers,
			});
			convertedCards.push(card);
			epubTaskCount++;
		}

		if (epubTaskCount > 0) {
			logger.info(`[IR] 加载了 ${epubTaskCount} 个EPUB书签任务`);
		}
	} catch (error) {
		logger.warn("[IR] EPUB书签任务加载失败（继续使用其他数据）:", error);
	}

        return {
                irBlocks,
                irDecks,
                irExtractCardIds,
                cards: dedupeCardsByUuid(convertedCards),
                legacyCount: Object.keys(irBlocks).length,
                chunkCount: Object.keys(chunkData).length,
                pdfTaskCount,
                epubTaskCount,
        };
}
