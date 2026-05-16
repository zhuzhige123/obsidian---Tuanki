/**
 * Vault-scoped plugin local storage.
 *
 * Plugin-owned local key/value state converges into:
 *   .obsidian/plugins/weave/state/local-storage.json
 *
 * Browser localStorage is intentionally no longer used by runtime code so
 * plugin state stays inside Obsidian's plugin data area.
 */

import type { App } from "obsidian";
import { getPluginPaths } from "../config/paths";
import { DirectoryUtils } from "./directory-utils";
import { logger } from "./logger";

const MANAGED_PREFIXES = ["weave-", "weave_", "attachment_"] as const;
const PERSIST_DELAY_MS = 150;
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
			return null;
		}

		if (typeof this.entries[key] === "string") {
			return this.entries[key];
		}

		return null;
	}

	setItem(key: string, value: string): void {
		if (!this.isManagedKey(key)) {
			return;
		}

		this.entries[key] = value;
		this.schedulePersist();
	}

	removeItem(key: string): void {
		if (!this.isManagedKey(key)) {
			return;
		}

		delete this.entries[key];
		this.schedulePersist();
	}

	/**
	 * Get all managed keys matching a prefix.
	 */
	getKeysWithPrefix(prefix: string): string[] {
		const keys = new Set<string>();

		for (const key of Object.keys(this.entries)) {
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
	}

	private isManagedKey(key: string): boolean {
		return MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix));
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
	}

	private async persistPendingEntries(): Promise<void> {
		if (!this.app || !this.storagePath || !this.dirty) {
			await this.persistPromise;
			return;
		}

		const snapshot = { ...this.entries };
		this.dirty = false;

		this.persistPromise = this.persistPromise.then(async () => {
			const persisted = await this.writeEntriesSnapshot(snapshot);
			if (persisted) {
				return;
			}

			this.dirty = true;
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

}

export const vaultStorage = new VaultLocalStorage();
