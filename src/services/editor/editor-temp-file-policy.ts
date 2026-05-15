import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { LEGACY_DOT_TUANKI, PATHS, getPluginPaths, getV2PathsFromApp } from "../../config/paths";

export const DETACHED_EDITOR_TEMP_FILE_PREFIX = "weave-editor-";
export const DETACHED_EDITOR_TEMP_FILE_SUFFIX = ".md";

const MODAL_EDITOR_PERMANENT_FILE_PATTERN = /^modal-editor-permanent(?:-\d+)?\.md$/;
const DETACHED_EDITOR_SOURCE_FILE_EXTENSIONS = new Set([
	"md",
	"markdown",
	"txt",
	"pdf",
	"epub",
	"canvas",
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"avif",
	"svg",
	"bmp",
	"html",
	"htm",
	"xhtml",
	"xml",
	"json",
	"csv",
	"mp3",
	"m4a",
	"ogg",
	"oga",
	"wav",
	"mp4",
	"m4v",
	"webm",
	"mov",
	"avi",
	"mkv",
]);

function getParentFolder(path: string): string {
	const lastSlash = path.lastIndexOf("/");
	return lastSlash >= 0 ? path.slice(0, lastSlash) : "";
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

function hasKnownVaultFileExtension(normalizedPath: string): boolean {
	const fileName = normalizedPath.split("/").pop() || "";
	const lastDot = fileName.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === fileName.length - 1) {
		return false;
	}

	const extension = fileName.slice(lastDot + 1).toLowerCase();
	return DETACHED_EDITOR_SOURCE_FILE_EXTENSIONS.has(extension);
}

function sanitizeDetachedEditorSourcePath(sourcePath?: string): string {
	const rawSourcePath = (sourcePath || "").trim();
	if (!rawSourcePath) {
		return "";
	}

	const normalizedSourcePath = normalizePath(rawSourcePath)
		.replace(/^['"]+|['"]+$/g, "")
		.replace(/[?#].*$/, "")
		.trim();

	if (!normalizedSourcePath) {
		return "";
	}

	if (/^[a-z]+:\/\//i.test(normalizedSourcePath)) {
		return "";
	}

	if (/^[A-Za-z]:\//.test(normalizedSourcePath)) {
		return "";
	}

	if (normalizedSourcePath.startsWith("../") || normalizedSourcePath === "..") {
		return "";
	}

	return normalizedSourcePath;
}

export function getPluginEditorTempDir(app: App): string {
	return normalizePath(getPluginPaths(app).cache.editorTemp);
}

export function getVaultEditorTempDir(app: App): string {
	return normalizePath(`${getV2PathsFromApp(app as any).root}/editor`);
}

export function isDetachedEditorTempFileName(name: string): boolean {
	return (
		typeof name === "string" &&
		name.startsWith(DETACHED_EDITOR_TEMP_FILE_PREFIX) &&
		name.endsWith(DETACHED_EDITOR_TEMP_FILE_SUFFIX)
	);
}

export function isDetachedEditorTempFilePath(path?: string | null): boolean {
	if (!path) return false;

	const normalizedPath = normalizePath(path);
	const fileName = normalizedPath.split("/").pop() || "";
	return isDetachedEditorTempFileName(fileName);
}

export function resolveDetachedEditorTempFolder(app: App, sourcePath?: string): string {
	const normalizedSourcePath = sanitizeDetachedEditorSourcePath(sourcePath);
	if (!normalizedSourcePath) {
		// 嵌入式编辑器最终依赖 TFile + openFile，缓冲区必须放在 Vault 可见目录。
		return getVaultEditorTempDir(app);
	}

	if (!normalizedSourcePath || normalizedSourcePath === "." || normalizedSourcePath === "/") {
		return getVaultEditorTempDir(app);
	}

	const existingPathKind = inferExistingVaultPathKind(app, normalizedSourcePath);
	if (existingPathKind === "file") {
		return getParentFolder(normalizedSourcePath);
	}

	if (existingPathKind === "folder") {
		return normalizedSourcePath;
	}

	if (hasKnownVaultFileExtension(normalizedSourcePath)) {
		return getParentFolder(normalizedSourcePath);
	}

	return normalizedSourcePath;
}

export function buildDetachedEditorTempFilePath(folderPath: string, fileName: string): string {
	return folderPath ? normalizePath(`${folderPath}/${fileName}`) : fileName;
}

export function isModalEditorPermanentFilePath(path: string): boolean {
	const normalizedPath = normalizePath(path);
	const fileName = normalizedPath.split("/").pop() || "";
	return MODAL_EDITOR_PERMANENT_FILE_PATTERN.test(fileName);
}

export function isLegacyModalEditorPermanentFilePath(path: string): boolean {
	const normalizedPath = normalizePath(path);
	if (!isModalEditorPermanentFilePath(normalizedPath)) return false;

	if (normalizedPath.startsWith(`${LEGACY_DOT_TUANKI}/temp/`)) return true;
	if (normalizedPath.startsWith(`${PATHS.temp}/`)) return true;
	if (normalizedPath.includes(`/${LEGACY_DOT_TUANKI}/temp/`)) return true;
	if (normalizedPath.includes("/weave/temp/")) return true;
	return false;
}

export function isPluginCacheModalEditorPermanentFilePath(app: App, path: string): boolean {
	const normalizedPath = normalizePath(path);
	if (!isModalEditorPermanentFilePath(normalizedPath)) return false;

	const editorTempDir = getPluginEditorTempDir(app);
	return normalizedPath.startsWith(`${editorTempDir}/`);
}
