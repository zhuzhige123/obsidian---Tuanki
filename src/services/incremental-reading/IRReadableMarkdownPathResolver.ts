import type { App } from "obsidian";
import { normalizePath } from "obsidian";

type VaultConfigLike = {
	getConfig?: (key: string) => unknown;
	config?: Record<string, unknown>;
};

function normalizeFolderPath(folderPath?: string | null): string {
	const raw = String(folderPath || "").trim().replace(/\\/g, "/");
	if (!raw || raw === "." || raw === "/") {
		return "/";
	}

	return normalizePath(raw);
}

function readVaultConfigValue(app: App, key: string): unknown {
	try {
		const vault = app.vault as VaultConfigLike;
		const getterValue = vault?.getConfig?.(key);
		if (getterValue !== undefined) {
			return getterValue;
		}

		return vault?.config?.[key];
	} catch {
		return undefined;
	}
}

function getParentFolder(path: string): string {
	const normalizedPath = normalizePath(path);
	const lastSlash = normalizedPath.lastIndexOf("/");
	if (lastSlash <= 0) {
		return "/";
	}

	return normalizePath(normalizedPath.slice(0, lastSlash));
}

function inferExistingVaultPathKind(app: App, normalizedPath: string): "file" | "folder" | null {
	try {
		const abstractFile = app.vault.getAbstractFileByPath?.(normalizedPath);
		if (!abstractFile) return null;

		if (typeof (abstractFile as { extension?: unknown }).extension === "string") {
			return "file";
		}

		if (Array.isArray((abstractFile as { children?: unknown }).children)) {
			return "folder";
		}

		const ctorName = (abstractFile as { constructor?: { name?: string } }).constructor?.name;
		if (ctorName === "TFile") return "file";
		if (ctorName === "TFolder") return "folder";
	} catch {}

	return null;
}

function looksLikeFilePath(normalizedPath: string): boolean {
	const lastSegment = normalizedPath.split("/").pop() || "";
	const lastDot = lastSegment.lastIndexOf(".");
	return lastDot > 0 && lastDot < lastSegment.length - 1;
}

function resolveContextFolder(app: App, contextPath?: string | null): string | null {
	const rawPath = String(contextPath || "").trim();
	if (!rawPath) {
		return null;
	}

	const normalizedPath = normalizePath(rawPath);
	if (!normalizedPath || normalizedPath === "." || normalizedPath === "/") {
		return "/";
	}

	const existingKind = inferExistingVaultPathKind(app, normalizedPath);
	if (existingKind === "file") {
		return getParentFolder(normalizedPath);
	}

	if (existingKind === "folder") {
		return normalizeFolderPath(normalizedPath);
	}

	if (looksLikeFilePath(normalizedPath)) {
		return getParentFolder(normalizedPath);
	}

	return normalizeFolderPath(normalizedPath);
}

function getActiveFilePath(app: App): string | null {
	try {
		const activeFile = (app.workspace as { getActiveFile?: () => { path?: string } | null })
			.getActiveFile?.();
		const path = String(activeFile?.path || "").trim();
		return path ? normalizePath(path) : null;
	} catch {
		return null;
	}
}

export function normalizeIRReadableMarkdownFolderPath(folderPath?: string | null): string {
	return normalizeFolderPath(folderPath);
}

export function resolveObsidianDefaultNewNoteFolder(
	app: App,
	options: {
		contextPath?: string | null;
		allowActiveFileFallback?: boolean;
	} = {}
): string | null {
	const locationValue = String(
		readVaultConfigValue(app, "newFileLocation") ??
			readVaultConfigValue(app, "newFileDestination") ??
			""
	)
		.trim()
		.toLowerCase();
	const configuredFolderPath = String(
		readVaultConfigValue(app, "newFileFolderPath") ??
			readVaultConfigValue(app, "newFileFolder") ??
			""
	).trim();
	const contextFolder =
		resolveContextFolder(app, options.contextPath) ||
		(options.allowActiveFileFallback ? resolveContextFolder(app, getActiveFilePath(app)) : null);

	if (locationValue.includes("current")) {
		return contextFolder;
	}

	if (locationValue.includes("root") || locationValue.includes("vault")) {
		return "/";
	}

	if (locationValue.includes("folder") || locationValue.includes("specified")) {
		return configuredFolderPath ? normalizeFolderPath(configuredFolderPath) : "/";
	}

	if (configuredFolderPath) {
		return normalizeFolderPath(configuredFolderPath);
	}

	return null;
}

export function resolveIRReadableMarkdownTargetFolder(
	app: App,
	options: {
		lastSelectedFolder?: string | null;
		contextPath?: string | null;
		allowActiveFileFallback?: boolean;
	} = {}
): string {
	const rememberedFolder = String(options.lastSelectedFolder || "").trim();
	if (rememberedFolder) {
		return normalizeFolderPath(rememberedFolder);
	}

	return (
		resolveObsidianDefaultNewNoteFolder(app, {
			contextPath: options.contextPath,
			allowActiveFileFallback: options.allowActiveFileFallback,
		}) || "/"
	);
}

export async function generateUniqueVaultFilePath(
	app: App,
	folderPath: string,
	fileName: string
): Promise<string> {
	const normalizedFolder = normalizeFolderPath(folderPath);
	const normalizedFileName = String(fileName || "").trim();
	if (!normalizedFileName) {
		throw new Error("file-name-required");
	}

	const lastDot = normalizedFileName.lastIndexOf(".");
	const baseName =
		lastDot > 0 ? normalizedFileName.slice(0, lastDot).trim() : normalizedFileName;
	const extension = lastDot > 0 ? normalizedFileName.slice(lastDot) : "";
	const baseCandidate =
		normalizedFolder === "/"
			? normalizedFileName
			: normalizePath(`${normalizedFolder}/${normalizedFileName}`);

	if (!(await app.vault.adapter.exists(baseCandidate))) {
		return baseCandidate;
	}

	for (let index = 2; index <= 500; index++) {
		const nextFileName = `${baseName} ${index}${extension}`;
		const nextCandidate =
			normalizedFolder === "/"
				? nextFileName
				: normalizePath(`${normalizedFolder}/${nextFileName}`);
		if (!(await app.vault.adapter.exists(nextCandidate))) {
			return nextCandidate;
		}
	}

	const fallbackFileName = `${baseName}-${Date.now()}${extension}`;
	return normalizedFolder === "/"
		? fallbackFileName
		: normalizePath(`${normalizedFolder}/${fallbackFileName}`);
}
