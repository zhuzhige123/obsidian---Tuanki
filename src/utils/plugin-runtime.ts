import type { App, DataAdapter } from "obsidian";
import { isCallable, readUnknownProperty } from "./dynamic-access";
import type WeavePlugin from "../main";

export type WeaveDataChangeContext = {
	source?: string;
	deckIds?: string[];
	suppressDeckNotifications?: boolean;
	suppressCardNotifications?: boolean;
	suppressSessionNotifications?: boolean;
};

export type PluginAugment = {
	__weaveDataChangeContext?: WeaveDataChangeContext;
	externalSyncWatcher?: { markInternalWrite?: () => void };
	dataSyncService?: { notifyChange?: (event: unknown) => Promise<void> | void };
	deckMembershipIndexService?: unknown;
	mediaFileHandler?: unknown;
	analyticsService?: unknown;
	autoSyncManager?: { onDeckDeleted?: (deckId: string) => void };
	wdeckService?: WeavePlugin["wdeckService"];
};

export type VaultDirListing = { files: string[]; folders: string[] };

export type VaultAdapterWithDirOps = DataAdapter & {
	list?: (path: string) => Promise<VaultDirListing>;
	rmdir?: (path: string, recursive: boolean) => Promise<void>;
	stat?: (path: string) => Promise<{ mtime: number } | null>;
};

export function asPluginAugment(plugin: WeavePlugin): WeavePlugin & PluginAugment {
	return plugin as WeavePlugin & PluginAugment;
}

export function getVaultAdapterWithDirOps(adapter: DataAdapter): VaultAdapterWithDirOps {
	return adapter as VaultAdapterWithDirOps;
}

export function getPluginInstance(app: App, pluginId: string): unknown {
	const pluginsContainer = readUnknownProperty(app, "plugins");
	const getPlugin = readUnknownProperty(pluginsContainer, "getPlugin");
	if (!isCallable(getPlugin)) {
		return undefined;
	}
	return Reflect.apply(getPlugin, pluginsContainer, [pluginId]);
}

export async function listVaultDirectory(
	adapter: VaultAdapterWithDirOps,
	dir: string
): Promise<VaultDirListing | null> {
	if (!adapter.list) {
		return null;
	}
	try {
		return await adapter.list(dir);
	} catch {
		return null;
	}
}
