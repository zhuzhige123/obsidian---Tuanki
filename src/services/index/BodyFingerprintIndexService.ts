import { getPluginPaths } from "../../config/paths";
import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import {
	getCardBodyFingerprint,
	getCardRetentionScore,
} from "../../utils/card-content-fingerprint";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";

const BODY_FINGERPRINT_INDEX_VERSION = 1;

interface BodyFingerprintIndexEntry {
	uuid: string;
	score: number;
}

interface BodyFingerprintIndexSnapshot {
	version: number;
	updatedAt: string;
	initialized: boolean;
	fullRebuildRequired: boolean;
	fingerprintToEntry: Record<string, BodyFingerprintIndexEntry>;
	uuidToFingerprint: Record<string, string>;
}

export class BodyFingerprintIndexService {
	private writeChain: Promise<void> = Promise.resolve();
	private memoryIndex: Map<string, string> | null = null;

	constructor(private plugin: WeavePlugin) {}

	private get adapter() {
		return this.plugin.app.vault.adapter;
	}

	private get indexRoot(): string {
		return getPluginPaths(this.plugin.app).indices.root;
	}

	private get indexPath(): string {
		return getPluginPaths(this.plugin.app).indices.bodyFingerprint;
	}

	async initialize(): Promise<void> {
		await DirectoryUtils.ensureDirRecursive(this.adapter, this.indexRoot);
	}

	async markFullRebuildRequired(): Promise<void> {
		this.memoryIndex = null;
		await this.mutateSnapshot((snapshot) => ({
			...snapshot,
			fullRebuildRequired: true,
		}));
	}

	async needsRebuild(): Promise<boolean> {
		const { snapshot } = await this.readSnapshot();
		return !snapshot.initialized || snapshot.fullRebuildRequired;
	}

	async getIndexMap(): Promise<Map<string, string>> {
		if (this.memoryIndex) {
			return new Map(this.memoryIndex);
		}

		const { snapshot } = await this.readSnapshot();
		this.memoryIndex = this.snapshotToMap(snapshot);
		return new Map(this.memoryIndex);
	}

	async rebuildFromCards(cards: Card[]): Promise<void> {
		const fingerprintToEntry: Record<string, BodyFingerprintIndexEntry> = {};
		const uuidToFingerprint: Record<string, string> = {};

		for (const card of cards) {
			this.applyCardToIndexMaps(card, fingerprintToEntry, uuidToFingerprint);
		}

		await this.mutateSnapshot(() => ({
			version: BODY_FINGERPRINT_INDEX_VERSION,
			updatedAt: new Date().toISOString(),
			initialized: true,
			fullRebuildRequired: false,
			fingerprintToEntry,
			uuidToFingerprint,
		}));
		this.memoryIndex = this.entriesToMap(fingerprintToEntry);
	}

	async upsertCards(cards: Card[]): Promise<void> {
		const normalizedCards = cards.filter((card) => Boolean(card?.uuid));
		if (normalizedCards.length === 0) {
			return;
		}

		await this.mutateSnapshot((snapshot) => {
			const fingerprintToEntry = { ...snapshot.fingerprintToEntry };
			const uuidToFingerprint = { ...snapshot.uuidToFingerprint };

			for (const card of normalizedCards) {
				this.applyCardToIndexMaps(card, fingerprintToEntry, uuidToFingerprint);
			}

			return {
				...snapshot,
				updatedAt: new Date().toISOString(),
				initialized: snapshot.initialized || normalizedCards.length > 0,
				fingerprintToEntry,
				uuidToFingerprint,
			};
		});

		this.memoryIndex = null;
	}

	async removeCards(cardUUIDs: string[]): Promise<void> {
		const uniqueUUIDs = Array.from(new Set(cardUUIDs.filter(Boolean)));
		if (uniqueUUIDs.length === 0) {
			return;
		}

		let requiresRebuild = false;

		await this.mutateSnapshot((snapshot) => {
			const fingerprintToEntry = { ...snapshot.fingerprintToEntry };
			const uuidToFingerprint = { ...snapshot.uuidToFingerprint };

			for (const uuid of uniqueUUIDs) {
				const fingerprint = uuidToFingerprint[uuid];
				delete uuidToFingerprint[uuid];
				if (!fingerprint) {
					continue;
				}

				const entry = fingerprintToEntry[fingerprint];
				if (entry?.uuid === uuid) {
					delete fingerprintToEntry[fingerprint];
					requiresRebuild = true;
				}
			}

			return {
				...snapshot,
				updatedAt: new Date().toISOString(),
				fullRebuildRequired: snapshot.fullRebuildRequired || requiresRebuild,
				fingerprintToEntry,
				uuidToFingerprint,
			};
		});

		this.memoryIndex = null;
	}

	private applyCardToIndexMaps(
		card: Card,
		fingerprintToEntry: Record<string, BodyFingerprintIndexEntry>,
		uuidToFingerprint: Record<string, string>
	): void {
		const uuid = String(card.uuid || "").trim();
		if (!uuid) {
			return;
		}

		const fingerprint = getCardBodyFingerprint(card);
		const previousFingerprint = uuidToFingerprint[uuid];
		if (previousFingerprint && previousFingerprint !== fingerprint) {
			const previousEntry = fingerprintToEntry[previousFingerprint];
			if (previousEntry?.uuid === uuid) {
				delete fingerprintToEntry[previousFingerprint];
			}
		}

		if (!fingerprint) {
			delete uuidToFingerprint[uuid];
			return;
		}

		uuidToFingerprint[uuid] = fingerprint;
		const score = getCardRetentionScore(card);
		const existing = fingerprintToEntry[fingerprint];
		if (!existing || score >= existing.score) {
			fingerprintToEntry[fingerprint] = { uuid, score };
		}
	}

	private createEmptySnapshot(): BodyFingerprintIndexSnapshot {
		return {
			version: BODY_FINGERPRINT_INDEX_VERSION,
			updatedAt: "",
			initialized: false,
			fullRebuildRequired: false,
			fingerprintToEntry: {},
			uuidToFingerprint: {},
		};
	}

	private normalizeSnapshot(
		snapshot?: Partial<BodyFingerprintIndexSnapshot> | null
	): BodyFingerprintIndexSnapshot {
		const fingerprintToEntry: Record<string, BodyFingerprintIndexEntry> = {};
		for (const [fingerprint, entry] of Object.entries(snapshot?.fingerprintToEntry || {})) {
			const uuid = String(entry?.uuid || "").trim();
			if (!fingerprint || !uuid) {
				continue;
			}
			fingerprintToEntry[fingerprint] = {
				uuid,
				score: Number.isFinite(entry?.score) ? Number(entry.score) : 0,
			};
		}

		const uuidToFingerprint: Record<string, string> = {};
		for (const [uuid, fingerprint] of Object.entries(snapshot?.uuidToFingerprint || {})) {
			const normalizedUuid = String(uuid || "").trim();
			const normalizedFingerprint = String(fingerprint || "").trim();
			if (!normalizedUuid || !normalizedFingerprint) {
				continue;
			}
			uuidToFingerprint[normalizedUuid] = normalizedFingerprint;
		}

		return {
			version: BODY_FINGERPRINT_INDEX_VERSION,
			updatedAt: typeof snapshot?.updatedAt === "string" ? snapshot.updatedAt : "",
			initialized: snapshot?.initialized === true,
			fullRebuildRequired: snapshot?.fullRebuildRequired === true,
			fingerprintToEntry,
			uuidToFingerprint,
		};
	}

	private snapshotToMap(snapshot: BodyFingerprintIndexSnapshot): Map<string, string> {
		return this.entriesToMap(snapshot.fingerprintToEntry);
	}

	private entriesToMap(
		fingerprintToEntry: Record<string, BodyFingerprintIndexEntry>
	): Map<string, string> {
		const index = new Map<string, string>();
		for (const [fingerprint, entry] of Object.entries(fingerprintToEntry)) {
			if (fingerprint && entry?.uuid) {
				index.set(fingerprint, entry.uuid);
			}
		}
		return index;
	}

	private async readSnapshot(): Promise<{
		snapshot: BodyFingerprintIndexSnapshot;
		exists: boolean;
	}> {
		try {
			const exists = await this.adapter.exists(this.indexPath);
			if (!exists) {
				return {
					snapshot: this.createEmptySnapshot(),
					exists: false,
				};
			}

			const raw = await this.adapter.read(this.indexPath);
			return {
				snapshot: this.normalizeSnapshot(
					JSON.parse(raw) as Partial<BodyFingerprintIndexSnapshot>
				),
				exists: true,
			};
		} catch (error) {
			logger.warn("[BodyFingerprintIndex] 读取索引失败，将回退为未初始化状态", error);
			return {
				snapshot: this.createEmptySnapshot(),
				exists: false,
			};
		}
	}

	private async writeSnapshot(snapshot: BodyFingerprintIndexSnapshot): Promise<void> {
		await this.initialize();
		await this.adapter.write(this.indexPath, JSON.stringify(snapshot));
	}

	private async mutateSnapshot(
		mutator: (snapshot: BodyFingerprintIndexSnapshot) => BodyFingerprintIndexSnapshot
	): Promise<void> {
		this.writeChain = this.writeChain.then(async () => {
			const { snapshot } = await this.readSnapshot();
			const nextSnapshot = mutator(snapshot);
			await this.writeSnapshot({
				...nextSnapshot,
				version: BODY_FINGERPRINT_INDEX_VERSION,
			});
		});

		await this.writeChain;
	}
}

let bodyFingerprintIndexServiceInstance: BodyFingerprintIndexService | null = null;

export function getBodyFingerprintIndexService(
	plugin?: WeavePlugin
): BodyFingerprintIndexService {
	if (!bodyFingerprintIndexServiceInstance && plugin) {
		bodyFingerprintIndexServiceInstance = new BodyFingerprintIndexService(plugin);
	}

	if (!bodyFingerprintIndexServiceInstance) {
		throw new Error("BodyFingerprintIndexService not initialized");
	}

	return bodyFingerprintIndexServiceInstance;
}

export function initBodyFingerprintIndexService(plugin: WeavePlugin): BodyFingerprintIndexService {
	bodyFingerprintIndexServiceInstance = new BodyFingerprintIndexService(plugin);
	return bodyFingerprintIndexServiceInstance;
}
