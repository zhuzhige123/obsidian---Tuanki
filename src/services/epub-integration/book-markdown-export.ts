import { TFile, normalizePath } from "obsidian";
import { Notice } from "obsidian";
import type { App } from "obsidian";
import { generateUniqueVaultFilePath, resolveIRReadableMarkdownTargetFolder } from "../incremental-reading/IRReadableMarkdownPathResolver";
import { sanitizeFileName } from "../../utils/card-export-utils";
import { openFileWithExistingLeaf } from "../../utils/workspace-navigation";
import { createContentWithMetadata } from "../../utils/yaml-utils";
import { isSupportedBookFile } from "./book-format";

export interface BookMarkdownExportAsset {
	placeholder: string;
	suggestedName: string;
	data: Uint8Array;
	mimeType: string;
	originalHref?: string;
}

export interface ExportBookSectionToMarkdownInput {
	filePath: string;
	title: string;
	body: string;
	markdown?: string;
	assets?: BookMarkdownExportAsset[];
	sourceLink?: string;
	bookTitle?: string;
	author?: string;
	lastSelectedFolder?: string | null;
}

export interface ExportBookNotesToMarkdownInput {
	filePath: string;
	markdown: string;
	sourceLink?: string;
	bookTitle?: string;
	lastSelectedFolder?: string | null;
}

function sanitizeBookMarkdownTitle(title: string, fallback: string): string {
	const cleaned = String(title || "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\.+$/g, "")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.trim();
	return cleaned || fallback;
}

function normalizeSectionMarkdownBody(body: string, title: string): string {
	let normalized = String(body || "").replace(/\r\n?/g, "\n").trim();
	const normalizedTitle = String(title || "").trim();
	if (!normalized) {
		return "";
	}
	if (normalizedTitle) {
		const headingMatch = normalized.match(/^(#{1,6})\s+([^\n]+)\n*/);
		if (headingMatch && headingMatch[2]?.trim() === normalizedTitle) {
			normalized = normalized.slice(headingMatch[0].length).trim();
		}
	}
	return normalized.replace(/\n{3,}/g, "\n\n").trim();
}

function replaceAssetPlaceholders(markdown: string, replacements?: Map<string, string>): string {
	let result = String(markdown || "");
	if (!replacements || replacements.size === 0) {
		return result;
	}
	for (const [placeholder, replacement] of replacements.entries()) {
		result = result.split(placeholder).join(replacement);
	}
	return result;
}

function buildSectionMarkdownContent(options: {
	title: string;
	body: string;
	sourceLink?: string;
	bookTitle?: string;
	author?: string;
	assetReplacements?: Map<string, string>;
}): string {
	const title = sanitizeBookMarkdownTitle(options.title, "书籍章节");
	const body = normalizeSectionMarkdownBody(
		replaceAssetPlaceholders(options.body, options.assetReplacements),
		title
	);
	const metaLines = [
		options.bookTitle ? `> 来源书籍：${String(options.bookTitle).trim()}` : "",
		options.author ? `> 作者：${String(options.author).trim()}` : "",
		options.sourceLink ? `> 书籍溯源：${String(options.sourceLink).trim()}` : "",
	].filter(Boolean);
	const sections = [`# ${title}`, ""];
	if (metaLines.length > 0) {
		sections.push(...metaLines, "");
	}
	sections.push("## 正文", "", body || "（当前章节暂无可导出的正文内容）", "");
	const markdown = sections.join("\n");
	return options.sourceLink
		? createContentWithMetadata({ we_source: options.sourceLink }, markdown)
		: markdown;
}

function buildBookNotesMarkdownContent(options: {
	markdown: string;
	sourceLink?: string;
}): string {
	const markdown = String(options.markdown || "").replace(/\r\n?/g, "\n").trim() || "# 阅读笔记\n";
	return options.sourceLink
		? createContentWithMetadata({ we_source: options.sourceLink }, markdown)
		: markdown;
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalizedFolder = normalizePath(String(folderPath || "").trim());
	if (!normalizedFolder || normalizedFolder === "/") {
		return;
	}
	const segments = normalizedFolder.split("/").filter(Boolean);
	let currentPath = "";
	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		const existing = app.vault.getAbstractFileByPath(currentPath);
		if (!existing) {
			await app.vault.createFolder(currentPath);
		}
	}
}

async function prepareMarkdownExportPath(app: App, folderPath: string, title: string): Promise<string> {
	await ensureFolderExists(app, folderPath);
	return await generateUniqueVaultFilePath(
		app,
		folderPath,
		`${sanitizeBookMarkdownTitle(title, "书籍导出")}.md`
	);
}

function buildAssetFolderPath(notePath: string): string {
	const normalizedNotePath = normalizePath(String(notePath || "").trim());
	return normalizePath(`${normalizedNotePath.replace(/\.md$/i, "")}.assets`);
}

function uint8ArrayToArrayBuffer(data: Uint8Array): ArrayBuffer {
	return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function generateUniqueAssetPath(app: App, folderPath: string, suggestedName: string): Promise<string> {
	const rawFileName = String(suggestedName || "").trim();
	const dotIndex = rawFileName.lastIndexOf(".");
	const baseName = dotIndex > 0 ? rawFileName.slice(0, dotIndex) : rawFileName;
	const extension = dotIndex > 0 ? rawFileName.slice(dotIndex).toLowerCase() : "";
	const safeBaseName = sanitizeBookMarkdownTitle(sanitizeFileName(baseName || "image"), "image");
	let attempt = 0;
	while (attempt < 2000) {
		const fileName = attempt === 0 ? `${safeBaseName}${extension}` : `${safeBaseName}-${attempt + 1}${extension}`;
		const candidatePath = normalizePath(`${folderPath}/${fileName}`);
		if (!app.vault.getAbstractFileByPath(candidatePath)) {
			return candidatePath;
		}
		attempt += 1;
	}
	return normalizePath(`${folderPath}/${safeBaseName}-${Date.now()}${extension}`);
}

async function writeSectionExportAssets(
	app: App,
	notePath: string,
	assets: BookMarkdownExportAsset[]
): Promise<Map<string, string>> {
	const replacements = new Map<string, string>();
	if (!Array.isArray(assets) || assets.length === 0) {
		return replacements;
	}
	const assetFolderPath = buildAssetFolderPath(notePath);
	await ensureFolderExists(app, assetFolderPath);
	const usedNames = new Set<string>();
	for (const asset of assets) {
		const placeholder = String(asset?.placeholder || "").trim();
		if (!placeholder || !(asset?.data instanceof Uint8Array) || asset.data.length === 0) {
			continue;
		}
		const assetPath = await generateUniqueAssetPath(
			app,
			assetFolderPath,
			String(asset.suggestedName || "").trim() || "image"
		);
		const assetName = assetPath.split("/").pop() || assetPath;
		if (usedNames.has(assetName)) {
			continue;
		}
		usedNames.add(assetName);
		await app.vault.createBinary(assetPath, uint8ArrayToArrayBuffer(asset.data));
		replacements.set(placeholder, `![[${assetPath}]]`);
	}
	return replacements;
}

async function finalizeMarkdownExport(app: App, targetPath: string, content: string): Promise<TFile> {
	const normalizedContent = String(content || "").replace(/\r\n?/g, "\n").trim();
	const createdFile = await app.vault.create(
		targetPath,
		normalizedContent.endsWith("\n") ? normalizedContent : `${normalizedContent}\n`
	);
	await openFileWithExistingLeaf(app, createdFile, { openInNewTab: true, focus: true });
	new Notice(`已导出 Markdown：${createdFile.basename}`, 3000);
	return createdFile;
}

function resolveSupportedSourceFile(app: App, filePath: string): TFile {
	const sourceFile = app.vault.getAbstractFileByPath(String(filePath || "").trim());
	if (!(sourceFile instanceof TFile) || !isSupportedBookFile(sourceFile)) {
		throw new Error("未找到对应的书籍文件");
	}
	return sourceFile;
}

export async function exportBookSectionToMarkdown(
	app: App,
	input: ExportBookSectionToMarkdownInput
): Promise<TFile> {
	const sourceFile = resolveSupportedSourceFile(app, input.filePath);
	const exportFolder = resolveIRReadableMarkdownTargetFolder(app, {
		lastSelectedFolder: input.lastSelectedFolder,
		contextPath: sourceFile.path,
		allowActiveFileFallback: false,
	});
	const title = sanitizeBookMarkdownTitle(input.title, "书籍章节");
	const fileTitle = input.bookTitle
		? `${sanitizeBookMarkdownTitle(input.bookTitle, sourceFile.basename)} - ${title}`
		: `${sourceFile.basename} - ${title}`;
	const targetPath = await prepareMarkdownExportPath(app, exportFolder, fileTitle);
	const assetReplacements = await writeSectionExportAssets(app, targetPath, input.assets || []);
	const content = buildSectionMarkdownContent({
		title,
		body: input.markdown || input.body,
		sourceLink: input.sourceLink,
		bookTitle: input.bookTitle,
		author: input.author,
		assetReplacements,
	});
	return await finalizeMarkdownExport(app, targetPath, content);
}

export async function exportBookNotesToMarkdown(
	app: App,
	input: ExportBookNotesToMarkdownInput
): Promise<TFile> {
	const sourceFile = resolveSupportedSourceFile(app, input.filePath);
	const exportFolder = resolveIRReadableMarkdownTargetFolder(app, {
		lastSelectedFolder: input.lastSelectedFolder,
		contextPath: sourceFile.path,
		allowActiveFileFallback: false,
	});
	const bookTitle = sanitizeBookMarkdownTitle(input.bookTitle || sourceFile.basename, sourceFile.basename);
	const targetPath = await prepareMarkdownExportPath(app, exportFolder, `${bookTitle} - 阅读笔记`);
	const content = buildBookNotesMarkdownContent({
		markdown: input.markdown,
		sourceLink: input.sourceLink,
	});
	return await finalizeMarkdownExport(app, targetPath, content);
}
