import { normalizePath } from "obsidian";
import type { App, TAbstractFile } from "obsidian";

type FileExplorerInstance = {
	revealInFolder?: (file: TAbstractFile) => void;
};

type InternalPluginsAccessor = {
	internalPlugins?: {
		getPluginById?: (id: string) => { instance?: FileExplorerInstance } | null;
	};
};

/**
 * Reveal a vault file or folder in Obsidian's built-in file explorer.
 * Returns false when the path is missing or the file explorer plugin is unavailable.
 */
export function revealVaultPathInExplorer(app: App, vaultPath: string): boolean {
	const normalized = normalizePath(vaultPath);
	const abstractFile = app.vault.getAbstractFileByPath(normalized);
	if (!abstractFile) {
		return false;
	}

	const explorer = (app as unknown as InternalPluginsAccessor).internalPlugins?.getPluginById?.(
		"file-explorer"
	);
	const revealInFolder = explorer?.instance?.revealInFolder;
	if (typeof revealInFolder !== "function") {
		return false;
	}

	revealInFolder(abstractFile);
	return true;
}
