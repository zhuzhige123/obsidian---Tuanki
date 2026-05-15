import { TAbstractFile, TFile, normalizePath } from "obsidian";

export const SUPPORTED_BOOK_EXTENSIONS = [
	"epub",
	"mobi",
	"azw3",
	"fb2",
	"fbz",
	"cbz",
	"txt",
] as const;

export type SupportedBookExtension = (typeof SUPPORTED_BOOK_EXTENSIONS)[number];

const SUPPORTED_BOOK_EXTENSION_SET = new Set<string>(SUPPORTED_BOOK_EXTENSIONS);

export function normalizeBookExtension(value: string): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/^\.+/, "");
}

export function getBookExtensionFromPath(filePath: string): string {
	const normalizedPath = normalizePath(String(filePath || ""));
	const fileName = normalizedPath.split("/").pop() || normalizedPath;
	const normalizedFileName = fileName.toLowerCase();
	if (normalizedFileName.endsWith(".fb2.zip") || normalizedFileName.endsWith(".fbz")) {
		return "fbz";
	}
	const dotIndex = fileName.lastIndexOf(".");
	return dotIndex >= 0 ? normalizeBookExtension(fileName.slice(dotIndex + 1)) : "";
}

export function getBookFormatDisplayLabel(extensionOrPath: string): string {
	const normalized = isSupportedBookPath(extensionOrPath)
		? getBookExtensionFromPath(extensionOrPath)
		: normalizeBookExtension(extensionOrPath);

	switch (normalized) {
		case "epub":
			return "EPUB";
		case "mobi":
			return "MOBI";
		case "azw3":
			return "AZW3";
		case "fb2":
			return "FB2";
		case "fbz":
			return "FB2.ZIP";
		case "cbz":
			return "CBZ";
		case "txt":
			return "TXT";
		default:
			return normalized ? normalized.toUpperCase() : "未知格式";
	}
}

export function isSupportedBookExtension(value: string): value is SupportedBookExtension {
	return SUPPORTED_BOOK_EXTENSION_SET.has(normalizeBookExtension(value));
}

export function isSupportedBookPath(filePath: string): boolean {
	return isSupportedBookExtension(getBookExtensionFromPath(filePath));
}

export function isSupportedBookFile(file: TAbstractFile | null | undefined): file is TFile {
	return file instanceof TFile && isSupportedBookPath(file.path);
}

export function stripSupportedBookExtension(value: string): string {
	return String(value || "")
		.trim()
		.replace(/\.fb2\.zip$/i, "")
		.replace(/\.(epub|mobi|azw3|fb2|fbz|cbz|txt)$/i, "");
}

export function usesPlainTextBookAdapter(extensionOrPath: string): boolean {
	const normalized = isSupportedBookPath(extensionOrPath)
		? getBookExtensionFromPath(extensionOrPath)
		: normalizeBookExtension(extensionOrPath);
	return normalized === "txt";
}

export function usesFoliateGenericBookLoader(extensionOrPath: string): boolean {
	const normalized = isSupportedBookPath(extensionOrPath)
		? getBookExtensionFromPath(extensionOrPath)
		: normalizeBookExtension(extensionOrPath);
	return normalized !== "" && normalized !== "epub" && normalized !== "txt";
}
