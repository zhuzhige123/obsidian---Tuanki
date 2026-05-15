/**
 * Vault-scoped plugin local storage
 *
 * Plugin-owned local key/value state now converges into:
 *   .obsidian/plugins/weave/state/local-storage.json
 *
 * Only non-plugin keys fall back to browser localStorage
 * (for example Obsidian's own `language` setting).
 */

import type { App } from "obsidian";
import { getPluginPaths } from "../config/paths";
import { DirectoryUtils } from "./directory-utils";
import { logger } from "./logger";

const MANAGED_PREFIXES = ["weave-", "weave_", "attachment_"] as const;
const PERSIST_DELAY_MS = 150;
const LEGACY_REMOVAL_SENTINEL = "__WEAVE_LOCAL_STORAGE_REMOVED__";

type ConflictEntry = {
	key: string;
	current: string;
	legacy: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

class VaultLocalStorage {
	private app: App | null = null;
	private storagePath: string | null = null;
	private entries: Record<string, string> = {};
	private initializePromise: Promise<void> | null = null;
	private persistPromise: Promise<void> = Promise.resolve();
	private persistTimer: ReturnType<typeof setTimeout> | null = null;
	private dirty = false;
	private pendingLegacyCleanup = new Set<string>();

	setApp(app: App): void {
		this.app = app;
		this.storagePath = getPluginPaths(app).state.localStorage;
	}

	async initialize(app: App): Promise<void> {
		if (this.app !== app || !this.initializePromise) {
			this.setApp(app);
			this.initializePromise = this.loadAndMigrate();
		}
		await this.initializePromise;
	}

	getItem(key: string): string | null {
		if (!this.isManagedKey(key)) {
			return this.readLegacyValue(key);
		}

		if (typeof this.entries[key] === "string") {
			return this.entries[key];
		}

		return this.readLegacyValue(key);
	}

	setItem(key: string, value: string): void {
		if (!this.isManagedKey(key)) {
			this.writeLegacyValue(key, value);
			return;
		}

		this.entries[key] = value;
		this.writeLegacyValue(key, value);
		this.pendingLegacyCleanup.add(key);
		this.schedulePersist();
	}

	removeItem(key: string): void {
		if (!this.isManagedKey(key)) {
			this.clearLegacyValue(key);
			return;
		}

		delete this.entries[key];
		this.writeLegacyValue(key, LEGACY_REMOVAL_SENTINEL);
		this.pendingLegacyCleanup.add(key);
		this.schedulePersist();
	}

	/**
	 * Get all managed keys matching a prefix.
	 * Falls back to scanning legacy window.localStorage entries before migration.
	 */
	getKeysWithPrefix(prefix: string): string[] {
		const keys = new Set<string>();

		for (const key of Object.keys(this.entries)) {
			if (key.startsWith(prefix)) {
				keys.add(key);
			}
		}

		for (const key of this.collectLegacyManagedEntries().keys()) {
			if (key.startsWith(prefix)) {
				keys.add(key);
			}
		}

		return Array.from(keys);
	}

	async flush(): Promise<void> {
		if (this.persistTimer !== null) {
			clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}
		await this.persistPendingEntries();
	}

	/**
	 * Test helper for resetting the singleton between runs.
	 */
	resetForTests(): void {
		if (this.persistTimer !== null) {
			clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}
		this.app = null;
		this.storagePath = null;
		this.entries = {};
		this.initializePromise = null;
		this.persistPromise = Promise.resolve();
		this.dirty = false;
		this.pendingLegacyCleanup.clear();
	}

	private isManagedKey(key: string): boolean {
		return MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix));
	}

	private readLegacyValue(key: string): string | null {
		const rawValue = this.readRawLegacyValue(key);
		return rawValue === LEGACY_REMOVAL_SENTINEL ? null : rawValue;
	}

	private readRawLegacyValue(key: string): string | null {
		if (typeof window === "undefined") {
			return null;
		}
		try {
			return window.localStorage.getItem(key);
		} catch {
			return null;
		}
	}

	private writeLegacyValue(key: string, value: string | undefined): void {
		if (typeof window === "undefined") {
			return;
		}
		try {
			if (typeof value === "string") {
				window.localStorage.setItem(key, value);
			} else {
				window.localStorage.removeItem(key);
			}
		} catch {
			// ignore browser localStorage failures
		}
	}

	private clearLegacyValue(key: string): void {
		this.writeLegacyValue(key, undefined);
	}

	private schedulePersist(): void {
		this.dirty = true;
		if (this.persistTimer !== null) {
			return;
		}

		this.persistTimer = setTimeout(() => {
			this.persistTimer = null;
			void this.persistPendingEntries();
		}, PERSIST_DELAY_MS);
	}

	private async loadAndMigrate(): Promise<void> {
		this.entries = await this.readPersistedEntries();

		const legacyEntries = this.collectLegacyManagedEntries();
		const conflicts: ConflictEntry[] = [];
		let mergedLegacyEntries = false;

		for (const [key, legacyValue] of legacyEntries) {
			if (legacyValue === LEGACY_REMOVAL_SENTINEL) {
				if (key in this.entries) {
					delete this.entries[key];
					mergedLegacyEntries = true;
				}
				this.pendingLegacyCleanup.add(key);
				continue;
			}

			const currentValue = this.entries[key];
			if (typeof currentValue !== "string") {
				this.entries[key] = legacyValue;
				mergedLegacyEntries = true;
			} else if (currentValue !== legacyValue) {
				conflicts.push({
					key,
					current: currentValue,
					legacy: legacyValue,
				});
			}
			this.pendingLegacyCleanup.add(key);
		}

		if (conflicts.length > 0) {
			await this.writeConflictSnapshot(conflicts);
		}

		if (mergedLegacyEntries) {
			const persisted = await this.writeEntriesSnapshot({ ...this.entries });
			if (persisted) {
				this.clearPendingLegacyCleanup();
			} else {
				this.dirty = true;
				this.schedulePersist();
			}
			return;
		}

		this.clearPendingLegacyCleanup();
	}

	private async persistPendingEntries(): Promise<void> {
		if (!this.app || !this.storagePath || !this.dirty) {
			await this.persistPromise;
			return;
		}

		const snapshot = { ...this.entries };
		const cleanupKeys = new Set(this.pendingLegacyCleanup);
		this.pendingLegacyCleanup.clear();
		this.dirty = false;

		this.persistPromise = this.persistPromise.then(async () => {
			const persisted = await this.writeEntriesSnapshot(snapshot);
			if (persisted) {
				for (const key of cleanupKeys) {
					this.clearLegacyValue(key);
				}
				return;
			}

			this.dirty = true;
			for (const key of cleanupKeys) {
				this.pendingLegacyCleanup.add(key);
			}
			this.schedulePersist();
		});

		await this.persistPromise;
	}

	private async readPersistedEntries(): Promise<Record<string, string>> {
		if (!this.app || !this.storagePath) {
			return {};
		}

		const adapter = this.app.vault.adapter;
		try {
			if (!(await adapter.exists(this.storagePath))) {
				return {};
			}

			const parsed = JSON.parse(await adapter.read(this.storagePath)) as unknown;
			if (!isRecord(parsed)) {
				return {};
			}

			const normalized: Record<string, string> = {};
			for (const [key, value] of Object.entries(parsed)) {
				if (typeof value === "string") {
					normalized[key] = value;
				}
			}
			return normalized;
		} catch (error) {
			logger.warn(`[VaultLocalStorage] 读取失败: ${this.storagePath}`, error);
			return {};
		}
	}

	private async writeEntriesSnapshot(entries: Record<string, string>): Promise<boolean> {
		if (!this.app || !this.storagePath) {
			return false;
		}

		const adapter = this.app.vault.adapter;
		try {
			await DirectoryUtils.ensureDirForFile(adapter, this.storagePath);
			await adapter.write(this.storagePath, JSON.stringify(entries, null, 2));
			return true;
		} catch (error) {
			logger.warn(`[VaultLocalStorage] 写入失败: ${this.storagePath}`, error);
			return false;
		}
	}

	private collectLegacyManagedEntries(): Map<string, string> {
		const entries = new Map<string, string>();
		if (typeof window === "undefined") {
			return entries;
		}

		try {
			for (let i = 0; i < window.localStorage.length; i++) {
				const rawKey = window.localStorage.key(i);
				if (!rawKey) {
					continue;
				}

				const canonicalKey = this.extractManagedKey(rawKey);
				if (!canonicalKey) {
					continue;
				}

				const value = this.readRawLegacyValue(canonicalKey);
				if (typeof value === "string") {
					entries.set(canonicalKey, value);
				}
			}
		} catch {
			// ignore legacy scan failures
		}

		return entries;
	}

	private extractManagedKey(rawKey: string): string | null {
		for (const prefix of MANAGED_PREFIXES) {
			const index = rawKey.indexOf(prefix);
			if (index >= 0) {
				return rawKey.slice(index);
			}
		}
		return null;
	}

	private clearPendingLegacyCleanup(): void {
		for (const key of this.pendingLegacyCleanup) {
			this.clearLegacyValue(key);
		}
		this.pendingLegacyCleanup.clear();
	}

	private async writeConflictSnapshot(conflicts: ConflictEntry[]): Promise<void> {
		if (!this.app) {
			return;
		}

		try {
			const adapter = this.app.vault.adapter;
			const snapshotPath = `${
				getPluginPaths(this.app).migration.root
			}/local-storage-conflicts/${Date.now()}.json`;
			await DirectoryUtils.ensureDirForFile(adapter, snapshotPath);
			await adapter.write(snapshotPath, JSON.stringify(conflicts, null, 2));
		} catch (error) {
			logger.warn("[VaultLocalStorage] 写入 localStorage 冲突快照失败", error);
		}
	}
}

export const vaultStorage = new VaultLocalStorage();
