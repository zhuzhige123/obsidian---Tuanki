import { type App, TAbstractFile, TFile, normalizePath } from "obsidian";
import { getV2PathsFromApp } from "../../config/paths";
import { logger } from "../../utils/logger";
import { IREpubBookmarkTaskService } from "../incremental-reading/IREpubBookmarkTaskService";
import { EpubBookmarkService } from "./EpubBookmarkService";
import { EpubLinkService } from "./EpubLinkService";
import { EpubStorageService } from "./EpubStorageService";
import { isSupportedBookFile, isSupportedBookPath, SUPPORTED_BOOK_EXTENSIONS } from "./book-format";
import { EPUB_RUNTIME } from "./epub-runtime";

export interface EpubPathSyncResult {
	updatedMarkdownFiles: number;
	updatedBookmarkFiles: number;
	updatedCanvasFiles: number;
	updatedCardFiles: number;
	updatedCanvasBindings: number;
	updatedBooks: number;
	updatedTasks: number;
	updatedLinks: number;
}

const EMPTY_RESULT: EpubPathSyncResult = {
	updatedMarkdownFiles: 0,
	updatedBookmarkFiles: 0,
	updatedCanvasFiles: 0,
	updatedCardFiles: 0,
	updatedCanvasBindings: 0,
	updatedBooks: 0,
	updatedTasks: 0,
	updatedLinks: 0,
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EPUB_PROTOCOL_LINK_PATTERN = new RegExp(
	`obsidian://(?:${EPUB_RUNTIME.protocol.allNames.map(escapeRegExp).join("|")})\\?[^\\s"'<>]*`,
	"gi"
);
const SUPPORTED_BOOK_WIKILINK_PATH_PATTERN = `(?:[^\\]\n]+?(?:\\.fb2\\.zip|\\.(?:${SUPPORTED_BOOK_EXTENSIONS.map(escapeRegExp).join("|")})))`;
const SUPPORTED_BOOK_WIKILINK_PATTERN = new RegExp(
	`\\[\\[(${SUPPORTED_BOOK_WIKILINK_PATH_PATTERN})(#[^\\]\n|]*)?(\\|[^\\]\n]*)?\\]\\]`,
	"gi"
);

export class EpubPathSyncService {
	private app: App;
	private bookmarkService: EpubBookmarkService;
	private storageService: EpubStorageService;
	private irEpubTaskService: IREpubBookmarkTaskService;

	constructor(app: App) {
		this.app = app;
		this.bookmarkService = new EpubBookmarkService(app);
		this.storageService = new EpubStorageService(app);
		this.irEpubTaskService = new IREpubBookmarkTaskService(app);
	}

	async syncRenamedTarget(file: TAbstractFile, oldPath: string): Promise<EpubPathSyncResult> {
		const newPath = normalizePath(file.path || "");
		const normalizedOldPath = normalizePath(oldPath || "");

		if (!normalizedOldPath || !newPath || normalizedOldPath === newPath) {
			return { ...EMPTY_RESULT };
		}

		const affectsEpubLinks =
			file instanceof TFile
				? isSupportedBookFile(file)
				: this.containsTrackedEpubDescendant(normalizedOldPath);

		const result: EpubPathSyncResult = { ...EMPTY_RESULT };
		result.updatedCanvasBindings = await this.storageService.updateCanvasBindingReferences(
			normalizedOldPath,
			newPath
		);
		if (!affectsEpubLinks && result.updatedCanvasBindings === 0) {
			return { ...EMPTY_RESULT };
		}
		result.updatedMarkdownFiles = await this.updateVaultTextFiles(
			"md",
			normalizedOldPath,
			newPath,
			result
		);
		result.updatedCanvasFiles = await this.updateVaultTextFiles(
			"canvas",
			normalizedOldPath,
			newPath,
			result
		);
		result.updatedCardFiles = await this.updateCardJsonFiles(normalizedOldPath, newPath, result);
		result.updatedBooks = await this.storageService.updateBookFileReferences(
			normalizedOldPath,
			newPath
		);
		result.updatedBookmarkFiles = await this.bookmarkService.updateBookFileReferences(
			normalizedOldPath,
			newPath
		);
		result.updatedTasks = await this.irEpubTaskService.updateEpubFileReferences(
			normalizedOldPath,
			newPath
		);

		return result;
	}

	private containsTrackedEpubDescendant(folderPath: string): boolean {
		const prefix = `${folderPath}/`;
		return this.app.vault
			.getFiles()
			.some((file) => isSupportedBookFile(file) && normalizePath(file.path).startsWith(prefix));
	}

	private async updateVaultTextFiles(
		extension: "md" | "canvas",
		oldPath: string,
		newPath: string,
		result: EpubPathSyncResult
	): Promise<number> {
		const files = this.app.vault.getFiles().filter((file) => file.extension === extension);
		let updated = 0;

		for (const file of files) {
			const changed = await this.processTextFile(file, oldPath, newPath, result);
			if (changed) {
				updated += 1;
			}
		}

		return updated;
	}

	private async updateCardJsonFiles(
		oldPath: string,
		newPath: string,
		result: EpubPathSyncResult
	): Promise<number> {
		const v2Paths = getV2PathsFromApp(this.app);
		const jsonFiles = this.app.vault
			.getFiles()
			.filter(
				(file) =>
					file.extension === "json" &&
					file.path.startsWith(`${v2Paths.memory.cards}/`) &&
					file.name !== "card-files-index.json"
			);

		let updated = 0;
		for (const file of jsonFiles) {
			const changed = await this.processTextFile(file, oldPath, newPath, result);
			if (changed) {
				updated += 1;
			}
		}

		return updated;
	}

	private async processTextFile(
		file: TFile,
		oldPath: string,
		newPath: string,
		result: EpubPathSyncResult
	): Promise<boolean> {
		let changed = false;

		await this.app.vault.process(file, (content) => {
			const rewrite = rewriteEpubReferences(content, oldPath, newPath);
			if (!rewrite.changed) {
				return content;
			}

			changed = true;
			result.updatedLinks += rewrite.updatedLinks;
			return rewrite.content;
		});

		return changed;
	}
}

export function rewriteEpubReferences(
	content: string,
	oldPath: string,
	newPath: string
): {
	content: string;
	updatedLinks: number;
	changed: boolean;
} {
	let updatedLinks = 0;
	let changed = false;
	let nextContent = content;

	nextContent = nextContent.replace(
		SUPPORTED_BOOK_WIKILINK_PATTERN,
		(fullMatch, filePath: string, hash?: string, alias?: string) => {
			const remapped = remapEpubPath(filePath, oldPath, newPath);
			if (!remapped || remapped === filePath) {
				return fullMatch;
			}
			const safeHash = typeof hash === "string" ? hash : "";
			const safeAlias = typeof alias === "string" ? alias : "";
			const rewrittenAlias = rewriteAlias(safeAlias, filePath, remapped);
			changed = true;
			updatedLinks += 1;
			return `[[${remapped}${safeHash}${rewrittenAlias}]]`;
		}
	);

	nextContent = nextContent.replace(EPUB_PROTOCOL_LINK_PATTERN, (fullMatch) => {
		const rewritten = rewriteProtocolLink(fullMatch, oldPath, newPath);
		if (rewritten === fullMatch) {
			return fullMatch;
		}
		changed = true;
		updatedLinks += 1;
		return rewritten;
	});

	return {
		content: nextContent,
		updatedLinks,
		changed,
	};
}

function rewriteAlias(aliasSegment: string, oldFilePath: string, newFilePath: string): string {
	if (!aliasSegment.startsWith("|")) {
		return aliasSegment;
	}

	const oldShortName = EpubLinkService.extractShortBookName(oldFilePath);
	const newShortName = EpubLinkService.extractShortBookName(newFilePath);
	const aliasText = aliasSegment.slice(1);

	if (!aliasText || oldShortName === newShortName) {
		return aliasSegment;
	}

	if (aliasText === oldShortName) {
		return `|${newShortName}`;
	}

	if (aliasText.startsWith(`${oldShortName} > `)) {
		return `|${newShortName}${aliasText.slice(oldShortName.length)}`;
	}

	return aliasSegment;
}

function rewriteProtocolLink(link: string, oldPath: string, newPath: string): string {
	const { urlText, suffix } = splitProtocolLinkSuffix(link);

	try {
		const url = new URL(urlText);
		const rawFilePath = url.searchParams.get("file");
		if (!rawFilePath) {
			return link;
		}

		const decodedPath = decodeURIComponent(rawFilePath);
		const remapped = remapEpubPath(decodedPath, oldPath, newPath);
		if (!remapped || remapped === decodedPath) {
			return link;
		}

		const encodedRemapped = encodeURIComponent(remapped);
		const rewrittenUrlText = urlText.replace(/([?&]file=)([^&]*)/i, `$1${encodedRemapped}`);
		return `${rewrittenUrlText}${suffix}`;
	} catch (error) {
		logger.debug("[EpubPathSyncService] Failed to rewrite protocol link:", error);
		return link;
	}
}

function splitProtocolLinkSuffix(link: string): { urlText: string; suffix: string } {
	let urlText = link;
	let suffix = "";
	let openParens = 0;
	let closeParens = 0;

	for (const char of link) {
		if (char === "(") {
			openParens += 1;
		} else if (char === ")") {
			closeParens += 1;
		}
	}

	while (urlText.endsWith(")") && closeParens > openParens) {
		urlText = urlText.slice(0, -1);
		suffix = `)${suffix}`;
		closeParens -= 1;
	}

	return { urlText, suffix };
}

function remapEpubPath(filePath: string, oldPath: string, newPath: string): string | null {
	const normalizedFilePath = normalizePath(filePath || "");
	const normalizedOldPath = normalizePath(oldPath || "");
	const normalizedNewPath = normalizePath(newPath || "");

	if (
		!normalizedFilePath ||
		!normalizedOldPath ||
		!normalizedNewPath ||
		!isSupportedBookPath(normalizedFilePath)
	) {
		return null;
	}

	if (normalizedFilePath === normalizedOldPath) {
		return normalizedNewPath;
	}

	if (normalizedFilePath.startsWith(`${normalizedOldPath}/`)) {
		return `${normalizedNewPath}${normalizedFilePath.slice(normalizedOldPath.length)}`;
	}

	return null;
}
