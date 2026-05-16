import { TFile, TFolder, type App, type Vault } from "obsidian";

function walkFolder(folder: TFolder, onFile: (file: TFile) => void): void {
	for (const child of folder.children) {
		if (child instanceof TFile) {
			onFile(child);
			continue;
		}

		if (child instanceof TFolder) {
			walkFolder(child, onFile);
		}
	}
}

export function listVaultFiles(vault: Vault, filter?: (file: TFile) => boolean): TFile[] {
	if (typeof vault.getRoot !== "function") {
		const legacyFiles = typeof vault.getFiles === "function" ? vault.getFiles() : [];
		return filter ? legacyFiles.filter(filter) : legacyFiles;
	}

	const files: TFile[] = [];
	walkFolder(vault.getRoot(), (file) => {
		if (!filter || filter(file)) {
			files.push(file);
		}
	});
	return files;
}

export function listVaultMarkdownFiles(appOrVault: App | Vault, filter?: (file: TFile) => boolean): TFile[] {
	const vault = "vault" in appOrVault ? appOrVault.vault : appOrVault;
	if (typeof vault.getRoot !== "function" && typeof vault.getMarkdownFiles === "function") {
		const legacyFiles = vault.getMarkdownFiles();
		return filter ? legacyFiles.filter(filter) : legacyFiles;
	}

	return listVaultFiles(vault, (file) => file.extension === "md" && (!filter || filter(file)));
}

export function listVaultFilesInFolder(
	vault: Vault,
	folderPath: string,
	filter?: (file: TFile) => boolean
): TFile[] {
	if (typeof vault.getRoot !== "function") {
		const legacyFiles = typeof vault.getFiles === "function" ? vault.getFiles() : [];
		return legacyFiles.filter((file) => {
			const isInFolder = file.path === folderPath || file.path.startsWith(`${folderPath}/`);
			return isInFolder && (!filter || filter(file));
		});
	}

	const folder = vault.getAbstractFileByPath(folderPath);
	if (!(folder instanceof TFolder)) {
		return [];
	}

	const files: TFile[] = [];
	walkFolder(folder, (file) => {
		if (!filter || filter(file)) {
			files.push(file);
		}
	});
	return files;
}
