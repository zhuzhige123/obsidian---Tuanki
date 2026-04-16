import type { App } from "obsidian";
import { getV2Paths, normalizeWeaveParentFolder } from "../config/paths";

function normalizeJsonFile(path: string): string {
	return String(path || "").replace(/\\/g, "/").toLowerCase();
}

type VaultAdapterLike = Partial<App["vault"]["adapter"]>;

type LegacyDirInspection = {
	dir: string;
	exists: boolean;
	hasMeaningfulData: boolean;
	removableFiles: string[];
	hasOtherEntries: boolean;
};

export type LegacyMemoryStorageCleanupCandidate = {
	dir: string;
	removableFiles: string[];
};

function createMissingInspection(dir: string): LegacyDirInspection {
	return {
		dir,
		exists: false,
		hasMeaningfulData: false,
		removableFiles: [],
		hasOtherEntries: false,
	};
}

function hasAdapterMethod<T extends keyof VaultAdapterLike>(
	adapter: VaultAdapterLike | undefined,
	method: T
): adapter is VaultAdapterLike & Required<Pick<VaultAdapterLike, T>> {
	return !!adapter && typeof adapter[method] === "function";
}

async function inspectLegacyCardsDir(
	adapter: VaultAdapterLike | undefined,
	dir: string
): Promise<LegacyDirInspection> {
	if (
		!hasAdapterMethod(adapter, "exists") ||
		!hasAdapterMethod(adapter, "list") ||
		!hasAdapterMethod(adapter, "read")
	) {
		return createMissingInspection(dir);
	}

	if (!(await adapter.exists(dir))) {
		return createMissingInspection(dir);
	}

	try {
		const listing = await adapter.list(dir);
		const files = listing.files || [];
		const folders = listing.folders || [];
		const removableFiles: string[] = [];
		let hasMeaningfulData = false;

		for (const file of files) {
			const normalized = normalizeJsonFile(file);
			if (!normalized.endsWith(".json")) {
				return {
					dir,
					exists: true,
					hasMeaningfulData: true,
					removableFiles,
					hasOtherEntries: true,
				};
			}

			if (normalized.endsWith("/card-files-index.json")) {
				removableFiles.push(file);
				continue;
			}

			try {
				const raw = await adapter.read(file);
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed?.cards)) {
					if (
						parsed.cards.some(
							(card: unknown) =>
								card &&
								typeof card === "object" &&
								typeof (card as { uuid?: unknown }).uuid === "string"
						)
					) {
						hasMeaningfulData = true;
						break;
					}
					removableFiles.push(file);
					continue;
				}

				hasMeaningfulData = true;
				break;
			} catch {
				hasMeaningfulData = true;
				break;
			}
		}

		return {
			dir,
			exists: true,
			hasMeaningfulData,
			removableFiles,
			hasOtherEntries: folders.length > 0,
		};
	} catch {
		return {
			dir,
			exists: true,
			hasMeaningfulData: true,
			removableFiles: [],
			hasOtherEntries: true,
		};
	}
}

async function inspectLegacyDeckCardsDir(
	adapter: VaultAdapterLike | undefined,
	dir: string
): Promise<LegacyDirInspection> {
	if (
		!hasAdapterMethod(adapter, "exists") ||
		!hasAdapterMethod(adapter, "list") ||
		!hasAdapterMethod(adapter, "read")
	) {
		return createMissingInspection(dir);
	}

	if (!(await adapter.exists(dir))) {
		return createMissingInspection(dir);
	}

	try {
		const listing = await adapter.list(dir);
		const files = listing.files || [];
		const folders = listing.folders || [];
		const removableFiles: string[] = [];
		let hasMeaningfulData = false;

		for (const file of files) {
			const normalized = normalizeJsonFile(file);
			if (!normalized.endsWith(".json")) {
				return {
					dir,
					exists: true,
					hasMeaningfulData: true,
					removableFiles,
					hasOtherEntries: true,
				};
			}

			try {
				const raw = await adapter.read(file);
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed?.cardUUIDs)) {
					if (parsed.cardUUIDs.some((uuid: unknown) => typeof uuid === "string" && uuid.trim())) {
						hasMeaningfulData = true;
						break;
					}
					removableFiles.push(file);
					continue;
				}

				hasMeaningfulData = true;
				break;
			} catch {
				hasMeaningfulData = true;
				break;
			}
		}

		return {
			dir,
			exists: true,
			hasMeaningfulData,
			removableFiles,
			hasOtherEntries: folders.length > 0,
		};
	} catch {
		return {
			dir,
			exists: true,
			hasMeaningfulData: true,
			removableFiles: [],
			hasOtherEntries: true,
		};
	}
}

export async function hasLegacyMemoryCardStorage(
	app: App,
	weaveParentFolder?: string
): Promise<boolean> {
	const adapter = app?.vault?.adapter as VaultAdapterLike | undefined;
	const v2Paths = getV2Paths(normalizeWeaveParentFolder(weaveParentFolder));
	const cardsDir = await inspectLegacyCardsDir(adapter, v2Paths.memory.cards);
	return cardsDir.hasMeaningfulData;
}

export async function getUnusedLegacyMemoryStorageCandidates(
	app: App,
	weaveParentFolder?: string
): Promise<LegacyMemoryStorageCleanupCandidate[]> {
	const adapter = app?.vault?.adapter as VaultAdapterLike | undefined;
	const v2Paths = getV2Paths(normalizeWeaveParentFolder(weaveParentFolder));
	const inspections = await Promise.all([
		inspectLegacyCardsDir(adapter, v2Paths.memory.cards),
		inspectLegacyDeckCardsDir(adapter, v2Paths.memory.deckCards),
	]);

	return inspections
		.filter((inspection) => inspection.exists && !inspection.hasMeaningfulData && !inspection.hasOtherEntries)
		.map((inspection) => ({
			dir: inspection.dir,
			removableFiles: [...inspection.removableFiles],
		}));
}

async function removeDirIfEmpty(adapter: VaultAdapterLike | undefined, dir: string): Promise<boolean> {
	if (!hasAdapterMethod(adapter, "exists") || !hasAdapterMethod(adapter, "list")) {
		return false;
	}

	if (!(await adapter.exists(dir))) {
		return false;
	}

	const listing = await adapter.list(dir);
	const hasFiles = (listing.files || []).length > 0;
	const hasFolders = (listing.folders || []).length > 0;
	if (hasFiles || hasFolders) {
		return false;
	}

	if (typeof adapter.rmdir === "function") {
		await adapter.rmdir(dir, false);
	} else if (typeof adapter.remove === "function") {
		await adapter.remove(dir);
	}
	return true;
}

export async function cleanupUnusedLegacyMemoryStorage(
	app: App,
	weaveParentFolder?: string
): Promise<{ removedFiles: string[]; removedDirs: string[] }> {
	const adapter = app?.vault?.adapter as VaultAdapterLike | undefined;
	const removedFiles: string[] = [];
	const removedDirs: string[] = [];

	if (!hasAdapterMethod(adapter, "exists") || !hasAdapterMethod(adapter, "remove")) {
		return { removedFiles, removedDirs };
	}

	const candidates = await getUnusedLegacyMemoryStorageCandidates(app, weaveParentFolder);

	for (const candidate of candidates) {
		for (const filePath of candidate.removableFiles) {
			if (await adapter.exists(filePath)) {
				await adapter.remove(filePath);
				removedFiles.push(filePath);
			}
		}

		if (await removeDirIfEmpty(adapter, candidate.dir)) {
			removedDirs.push(candidate.dir);
		}
	}

	return { removedFiles, removedDirs };
}
