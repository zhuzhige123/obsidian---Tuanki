import { type App, type TFile, normalizePath } from "obsidian";
import { getV2PathsFromApp } from "../../config/paths";
import { logger } from "../../utils/logger";
import { EpubLinkService } from "./EpubLinkService";
import { EpubStorageService } from "./EpubStorageService";

export interface BacklinkHighlight {
	cfiRange: string;
	color: string;
	text: string;
	sourceFile: string;
	sourceRef?: string;
	createdTime?: number;
}

export interface BacklinkSourceMatch {
	sourceFile: string;
	sourceRef?: string;
}

export interface BacklinkSourceHint {
	text?: string;
	createdTime?: number;
}

interface ParsedEpubCallout {
	color: string;
	linkMarkup: string;
	quotedText: string;
	fullMatch: string;
	createdTime?: number;
}

type JsonCardLike = {
	uuid?: string;
	content?: string;
	modified?: string;
};

type CanvasNodeLike = {
	id?: string;
	type?: string;
	text?: string;
	file?: string;
	subpath?: string;
};

type ResolvedCalloutLink = {
	filePath: string;
	cfi: string;
	sourceId?: string;
};

type EpubTargetIdentity = {
	filePath: string;
	fileName: string;
	sourceId?: string;
};

type OpenMarkdownViewLike = {
	file?: { path?: string };
	editor?: {
		getValue?: () => string;
		setValue?: (value: string) => void;
	};
	save?: () => Promise<void>;
};

export class EpubBacklinkHighlightService {
	private app: App;
	private storageService: EpubStorageService;

	constructor(app: App) {
		this.app = app;
		this.storageService = new EpubStorageService(app);
	}

	async collectHighlights(
		epubFilePath: string,
		boundCanvasPath?: string | null
	): Promise<BacklinkHighlight[]> {
		const highlights: BacklinkHighlight[] = [];
		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);

		let sourceFiles = this.findBacklinkSources(targetIdentity);
		logger.debug("[EpubBacklinkHighlight] findBacklinkSources result:", sourceFiles.length);

		if (sourceFiles.length === 0) {
			sourceFiles = this.findBacklinkSourcesByVaultScan(targetIdentity);
			logger.debug("[EpubBacklinkHighlight] vault scan fallback:", sourceFiles.length);
		}

		if (sourceFiles.length === 0) {
			sourceFiles = await this.findBacklinkSourcesByContentSearch(targetIdentity);
			logger.debug("[EpubBacklinkHighlight] content search fallback:", sourceFiles.length);
		}

		const readPromises = sourceFiles.map(async (sourcePath) => {
			try {
				const content = await this.app.vault.adapter.read(sourcePath);
				const parsed = this.parseEpubCallouts(content, targetIdentity, sourcePath);
				if (parsed.length === 0) {
					logger.debug(
						"[EpubBacklinkHighlight] parseEpubCallouts found 0 highlights in:",
						sourcePath
					);
				}
				return parsed;
			} catch (_e) {
				logger.debug("[EpubBacklinkHighlightService] Failed to read:", sourcePath);
				return [] as BacklinkHighlight[];
			}
		});

		const [markdownResults, canvasHighlights, jsonHighlights] = await Promise.all([
			Promise.all(readPromises),
			this.collectCanvasHighlights(targetIdentity, boundCanvasPath),
			this.collectCardJsonHighlights(targetIdentity),
		]);

		for (const parsed of markdownResults) {
			highlights.push(...parsed);
		}
		highlights.push(...canvasHighlights, ...jsonHighlights);

		logger.debug(
			`[EpubBacklinkHighlightService] Found ${highlights.length} highlights for ${epubFilePath} ` +
				`(markdown=${sourceFiles.length}, canvas=${canvasHighlights.length}, json=${jsonHighlights.length})`
		);
		return highlights;
	}

	async findSourceForCfi(
		cfiRange: string,
		epubFilePath: string,
		preferredSourceFile?: string,
		hint?: BacklinkSourceHint
	): Promise<BacklinkSourceMatch | null> {
		const normalizedTargetCfi = EpubLinkService.normalizeCfi(cfiRange);
		const allHighlights = await this.collectHighlights(epubFilePath);
		let matchedHighlights = allHighlights.filter(
			(highlight) => EpubLinkService.normalizeCfi(highlight.cfiRange) === normalizedTargetCfi
		);
		if (matchedHighlights.length === 0) {
			matchedHighlights = this.findHighlightsByHint(allHighlights, hint);
		}
		if (matchedHighlights.length === 0) {
			return null;
		}

		const normalizedPreferredPath = preferredSourceFile
			? normalizePath(preferredSourceFile)
			: "";
		if (normalizedPreferredPath) {
			const sameSourceMatches = matchedHighlights.filter(
				(highlight) => normalizePath(highlight.sourceFile || "") === normalizedPreferredPath
			);
			const preferredMatch = this.pickPreferredSourceMatch(sameSourceMatches);
			if (preferredMatch) {
				return {
					sourceFile: preferredMatch.sourceFile,
					sourceRef: preferredMatch.sourceRef,
				};
			}
		}

		const matched = this.pickPreferredSourceMatch(matchedHighlights);
		if (!matched) {
			return null;
		}

		return {
			sourceFile: matched.sourceFile,
			sourceRef: matched.sourceRef,
		};
	}

	private findHighlightsByHint(
		highlights: BacklinkHighlight[],
		hint?: BacklinkSourceHint
	): BacklinkHighlight[] {
		const normalizedTargetText = this.normalizeHighlightText(hint?.text);
		if (!normalizedTargetText) {
			return [];
		}

		const textMatches = highlights.filter(
			(highlight) => this.normalizeHighlightText(highlight.text) === normalizedTargetText
		);
		if (textMatches.length <= 1) {
			return textMatches;
		}

		if (typeof hint?.createdTime === "number" && Number.isFinite(hint.createdTime) && hint.createdTime > 0) {
			const sameTimestampMatches = textMatches.filter((highlight) =>
				this.isSameHighlightTimestamp(highlight.createdTime, hint.createdTime)
			);
			if (sameTimestampMatches.length > 0) {
				return sameTimestampMatches;
			}
		}

		return textMatches;
	}

	private normalizeHighlightText(text?: string): string {
		return String(text || "")
			.replace(/\r\n/g, "\n")
			.replace(/\u00a0/g, " ")
			.replace(/[ \t]+/g, " ")
			.replace(/\n{2,}/g, "\n")
			.trim();
	}

	private isSameHighlightTimestamp(left?: number, right?: number): boolean {
		if (
			typeof left !== "number" ||
			!Number.isFinite(left) ||
			left <= 0 ||
			typeof right !== "number" ||
			!Number.isFinite(right) ||
			right <= 0
		) {
			return false;
		}

		return Math.abs(left - right) < 60_000;
	}

	async findSourceFileForCfi(cfiRange: string, epubFilePath: string): Promise<string | null> {
		const matchedSource = await this.findSourceForCfi(cfiRange, epubFilePath);
		if (matchedSource?.sourceFile) {
			return matchedSource.sourceFile;
		}

		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		const encodedCfi = EpubLinkService.encodeCfiForWikilink(cfiRange);
		const normalizedCfi = EpubLinkService.normalizeCfi(cfiRange);

		const allFiles = this.app.vault.getMarkdownFiles();
		for (const file of allFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (!this.contentMayReferenceTarget(content, targetIdentity)) continue;
				if (content.includes(encodedCfi) || content.includes(cfiRange)) {
					return file.path;
				}
				const parsed = this.parseEpubCallouts(content, targetIdentity, file.path);
				for (const p of parsed) {
					if (EpubLinkService.normalizeCfi(p.cfiRange) === normalizedCfi) {
						return file.path;
					}
				}
			} catch {
				/* skip */
			}
		}

		const canvasFiles = this.app.vault.getFiles().filter((f) => f.extension === "canvas");
		for (const file of canvasFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (!this.contentMayReferenceTarget(content, targetIdentity)) continue;
				if (content.includes(encodedCfi) || content.includes(cfiRange)) {
					return file.path;
				}

				const parsed = await this.parseHighlightsFromCanvasContent(
					content,
					targetIdentity,
					file.path,
					false
				);
				for (const p of parsed) {
					if (EpubLinkService.normalizeCfi(p.cfiRange) === normalizedCfi) {
						return p.sourceFile || file.path;
					}
				}
			} catch {
				/* skip */
			}
		}

		const jsonFiles = this.getRelevantCardJsonFiles();
		for (const file of jsonFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (!this.contentMayReferenceTarget(content, targetIdentity)) continue;
				const parsed = this.parseHighlightsFromCardJsonContent(content, targetIdentity, file.path);
				for (const highlight of parsed) {
					if (EpubLinkService.normalizeCfi(highlight.cfiRange) === normalizedCfi) {
						return file.path;
					}
				}
			} catch {
				/* skip */
			}
		}

		return null;
	}

	private pickPreferredSourceMatch(highlights: BacklinkHighlight[]): BacklinkHighlight | null {
		if (highlights.length === 0) {
			return null;
		}

		const cardMatch = highlights.find(
			(highlight) =>
				typeof highlight.sourceRef === "string" && highlight.sourceRef.startsWith("card:")
		);
		if (cardMatch) {
			return cardMatch;
		}

		const referencedMatch = highlights.find(
			(highlight) =>
				typeof highlight.sourceRef === "string" && highlight.sourceRef.trim().length > 0
		);
		if (referencedMatch) {
			return referencedMatch;
		}

		const markdownMatch = highlights.find((highlight) => highlight.sourceFile.endsWith(".md"));
		if (markdownMatch) {
			return markdownMatch;
		}

		const canvasMatch = highlights.find((highlight) => highlight.sourceFile.endsWith(".canvas"));
		if (canvasMatch) {
			return canvasMatch;
		}

		const jsonMatch = highlights.find((highlight) => highlight.sourceFile.endsWith(".json"));
		if (jsonMatch) {
			return jsonMatch;
		}

		return highlights[0] || null;
	}

	async deleteHighlight(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		sourceRef?: string
	): Promise<boolean> {
		if (sourceFile.endsWith(".canvas")) {
			return this.deleteHighlightFromCanvas(sourceFile, cfiRange, epubFilePath, sourceRef);
		}

		if (sourceFile.endsWith(".json")) {
			return this.deleteHighlightFromCardJson(sourceFile, cfiRange, epubFilePath, sourceRef);
		}

		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return await this.processVaultTextFile(sourceFile, (content) =>
				this.removeCalloutByCfi(content, cfiRange, targetIdentity)
			);
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] deleteHighlight failed:", _e);
			return false;
		}
	}

	async changeHighlightColor(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newColor: string,
		sourceRef?: string
	): Promise<boolean> {
		if (sourceFile.endsWith(".canvas")) {
			return this.changeCanvasHighlightColor(
				sourceFile,
				cfiRange,
				epubFilePath,
				newColor,
				sourceRef
			);
		}

		if (sourceFile.endsWith(".json")) {
			return this.changeCardJsonHighlightColor(
				sourceFile,
				cfiRange,
				epubFilePath,
				newColor,
				sourceRef
			);
		}

		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return await this.processVaultTextFile(sourceFile, (content) =>
				this.updateCalloutColor(content, cfiRange, targetIdentity, newColor)
			);
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] changeHighlightColor failed:", _e);
			return false;
		}
	}

	private async waitForMetadataCache(timeoutMs: number): Promise<void> {
		if (this.isMetadataCacheReady()) return;

		return new Promise<void>((resolve) => {
			let settled = false;
			const handler = () => {
				if (settled) return;
				settled = true;
				this.app.metadataCache.off("resolved", handler);
				resolve();
			};
			this.app.metadataCache.on("resolved", handler);
			setTimeout(() => {
				if (!settled) {
					settled = true;
					this.app.metadataCache.off("resolved", handler);
					resolve();
				}
			}, timeoutMs);
		});
	}

	private isMetadataCacheReady(): boolean {
		const resolvedLinks = this.app.metadataCache.resolvedLinks;
		return resolvedLinks && Object.keys(resolvedLinks).length > 0;
	}

	private findBacklinkSources(targetIdentity: EpubTargetIdentity): string[] {
		const sources: string[] = [];
		const resolvedLinks = this.app.metadataCache.resolvedLinks;
		for (const sourcePath in resolvedLinks) {
			const links = resolvedLinks[sourcePath];
			if (links?.[targetIdentity.filePath]) {
				sources.push(sourcePath);
			}
		}

		if (sources.length === 0) {
			try {
				const epubFile = this.app.vault.getAbstractFileByPath(targetIdentity.filePath);
				if (epubFile && "path" in epubFile) {
					const backlinks = (this.app.metadataCache as any).getBacklinksForFile?.(epubFile);
					if (backlinks?.data) {
						for (const [path] of backlinks.data) {
							if (!sources.includes(path)) sources.push(path);
						}
					}
				}
			} catch (_e) {
				logger.debug("[EpubBacklinkHighlightService] getBacklinksForFile fallback failed");
			}
		}

		return sources;
	}

	private findBacklinkSourcesByVaultScan(targetIdentity: EpubTargetIdentity): string[] {
		if (!targetIdentity.fileName && !targetIdentity.sourceId) return [];

		const candidates: string[] = [];
		const mdFiles = this.app.vault.getMarkdownFiles();

		for (const file of mdFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.links) continue;

			for (const link of cache.links) {
				if (this.textMayReferenceTarget(link.link || "", targetIdentity)) {
					candidates.push(file.path);
					break;
				}
			}
		}

		logger.debug(
			`[EpubBacklinkHighlightService] Vault scan found ${candidates.length} candidates for ${targetIdentity.filePath}`
		);
		return candidates;
	}

	private async findBacklinkSourcesByContentSearch(targetIdentity: EpubTargetIdentity): Promise<string[]> {
		if (!targetIdentity.fileName && !targetIdentity.sourceId) return [];

		const candidates: string[] = [];
		const mdFiles = this.app.vault.getMarkdownFiles();
		const batchSize = 50;
		for (let i = 0; i < mdFiles.length; i += batchSize) {
			const batch = mdFiles.slice(i, i + batchSize);
			const results = await Promise.all(
				batch.map(async (file) => {
					try {
						const content = await this.app.vault.cachedRead(file);
						if (content.includes("[!EPUB") && this.contentMayReferenceTarget(content, targetIdentity)) {
							return file.path;
						}
					} catch (_e) {
						/* skip */
					}
					return null;
				})
			);
			for (const path of results) {
				if (path) candidates.push(path);
			}
		}

		logger.debug(
			`[EpubBacklinkHighlightService] Content search found ${candidates.length} candidates for ${targetIdentity.filePath}`
		);
		return candidates;
	}

	private async collectCanvasHighlights(
		targetIdentity: EpubTargetIdentity,
		boundCanvasPath?: string | null
	): Promise<BacklinkHighlight[]> {
		const results: BacklinkHighlight[] = [];
		const canvasFiles = this.app.vault.getFiles().filter((f) => f.extension === "canvas");
		const candidatePaths = new Set<string>();

		for (const file of canvasFiles) {
			candidatePaths.add(file.path);
		}
		if (boundCanvasPath) {
			candidatePaths.add(boundCanvasPath);
		}

		for (const canvasPath of candidatePaths) {
			try {
				const file = this.app.vault.getAbstractFileByPath(canvasPath);
				if (!(file && this.isTFile(file) && file.extension === "canvas")) continue;
				const content = await this.app.vault.cachedRead(file);
				const isBoundCanvas = boundCanvasPath === canvasPath;
				if (!isBoundCanvas && !this.contentMayReferenceTarget(content, targetIdentity)) continue;
				results.push(
					...(await this.parseHighlightsFromCanvasContent(
						content,
						targetIdentity,
						file.path,
						isBoundCanvas
					))
				);
			} catch (_e) {
				logger.debug("[EpubBacklinkHighlightService] Failed to read canvas:", canvasPath);
			}
		}

		return results;
	}

	private async collectCardJsonHighlights(targetIdentity: EpubTargetIdentity): Promise<BacklinkHighlight[]> {
		const results: BacklinkHighlight[] = [];
		const jsonFiles = this.getRelevantCardJsonFiles();

		for (const file of jsonFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (!this.contentMayReferenceTarget(content, targetIdentity)) continue;
				results.push(...this.parseHighlightsFromCardJsonContent(content, targetIdentity, file.path));
			} catch (_e) {
				logger.debug("[EpubBacklinkHighlightService] Failed to read card json:", file.path);
			}
		}

		return results;
	}

	private getRelevantCardJsonFiles() {
		const v2Paths = getV2PathsFromApp(this.app);
		return this.app.vault.getFiles().filter((file) => {
			if (file.extension !== "json") return false;
			if (
				file.path.startsWith(`${v2Paths.memory.cards}/`) &&
				file.name !== "card-files-index.json"
			) {
				return true;
			}
			return false;
		});
	}

	private async parseHighlightsFromCanvasContent(
		content: string,
		targetIdentity: EpubTargetIdentity,
		sourceFile: string,
		includeFileNodes: boolean
	): Promise<BacklinkHighlight[]> {
		try {
			const parsed = JSON.parse(content) as { nodes?: CanvasNodeLike[] };
			const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
			const results: BacklinkHighlight[] = [];

			for (const node of nodes) {
				if (node?.type === "text" && typeof node.text === "string" && node.text.length > 0) {
					results.push(...this.parseEpubCallouts(node.text, targetIdentity, sourceFile, node.id));
					continue;
				}

				if (
					!includeFileNodes ||
					node?.type !== "file" ||
					typeof node.file !== "string" ||
					node.file.length === 0
				) {
					continue;
				}

				results.push(...(await this.collectHighlightsFromCanvasFileNode(node, targetIdentity)));
			}

			return results;
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] Failed to parse canvas json:", sourceFile);
			return [];
		}
	}

	private async collectHighlightsFromCanvasFileNode(
		node: CanvasNodeLike,
		targetIdentity: EpubTargetIdentity
	): Promise<BacklinkHighlight[]> {
		const target = this.app.vault.getAbstractFileByPath(node.file!);
		if (!(target && this.isTFile(target))) {
			return [];
		}

		try {
			const content = await this.app.vault.cachedRead(target);
			if (target.extension === "md") {
				return this.parseEpubCallouts(content, targetIdentity, target.path);
			}
			if (target.extension === "json") {
				return this.parseHighlightsFromCardJsonContent(content, targetIdentity, target.path);
			}
		} catch (_e) {
			logger.debug(
				"[EpubBacklinkHighlightService] Failed to read canvas file node target:",
				node.file
			);
		}

		return [];
	}

	private isTFile(file: unknown): file is TFile {
		return !!file && typeof file === "object" && "path" in file && "extension" in file;
	}

	private parseHighlightsFromCardJsonContent(
		content: string,
		targetIdentity: EpubTargetIdentity,
		sourceFile: string
	): BacklinkHighlight[] {
		try {
			const parsed = JSON.parse(content);
			const cardArrays = this.extractCardArraysFromJson(parsed);
			const results: BacklinkHighlight[] = [];

			for (const cards of cardArrays) {
				for (const card of cards) {
					if (!card || typeof card.content !== "string") continue;
					const sourceRef =
						typeof card.uuid === "string" && card.uuid.length > 0 ? `card:${card.uuid}` : undefined;
					results.push(
						...this.parseEpubCallouts(card.content, targetIdentity, sourceFile, sourceRef)
					);
				}
			}

			return results;
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] Failed to parse card json:", sourceFile);
			return [];
		}
	}

	private extractCardArraysFromJson(parsed: unknown): JsonCardLike[][] {
		if (Array.isArray(parsed)) {
			return [parsed as JsonCardLike[]];
		}

		if (!parsed || typeof parsed !== "object") {
			return [];
		}

		const container = parsed as Record<string, unknown>;
		const arrays: JsonCardLike[][] = [];

		if (Array.isArray(container.cards)) {
			arrays.push(container.cards as JsonCardLike[]);
		}

		if (Array.isArray(container.questions)) {
			arrays.push(container.questions as JsonCardLike[]);
		}

		return arrays;
	}

	private async deleteHighlightFromCanvas(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		sourceRef?: string
	): Promise<boolean> {
		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			const targetNodeId = this.normalizeCanvasSourceRef(sourceRef);
			return await this.processVaultJsonFile(sourceFile, (parsed) => {
				const nodes = Array.isArray(parsed?.nodes) ? (parsed.nodes as CanvasNodeLike[]) : [];
				let changed = false;

				for (const node of nodes) {
					if (node?.type !== "text" || typeof node.text !== "string") continue;
					if (targetNodeId && node.id !== targetNodeId) continue;

					const updatedText = this.removeCalloutByCfi(node.text, cfiRange, targetIdentity);
					if (updatedText !== node.text) {
						node.text = updatedText;
						changed = true;
						if (targetNodeId) break;
					}
				}

				return changed ? parsed : null;
			});
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] deleteHighlightFromCanvas failed:", _e);
			return false;
		}
	}

	private async changeCanvasHighlightColor(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newColor: string,
		sourceRef?: string
	): Promise<boolean> {
		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			const targetNodeId = this.normalizeCanvasSourceRef(sourceRef);
			return await this.processVaultJsonFile(sourceFile, (parsed) => {
				const nodes = Array.isArray(parsed?.nodes) ? (parsed.nodes as CanvasNodeLike[]) : [];
				let changed = false;

				for (const node of nodes) {
					if (node?.type !== "text" || typeof node.text !== "string") continue;
					if (targetNodeId && node.id !== targetNodeId) continue;

					const updatedText = this.updateCalloutColor(node.text, cfiRange, targetIdentity, newColor);
					if (updatedText !== node.text) {
						node.text = updatedText;
						changed = true;
						if (targetNodeId) break;
					}
				}

				return changed ? parsed : null;
			});
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] changeCanvasHighlightColor failed:", _e);
			return false;
		}
	}

	private async deleteHighlightFromCardJson(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		sourceRef?: string
	): Promise<boolean> {
		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		return this.mutateCardJsonHighlights(sourceFile, sourceRef, (content) =>
			this.removeCalloutByCfi(content, cfiRange, targetIdentity)
		);
	}

	private async changeCardJsonHighlightColor(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newColor: string,
		sourceRef?: string
	): Promise<boolean> {
		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		return this.mutateCardJsonHighlights(sourceFile, sourceRef, (content) =>
			this.updateCalloutColor(content, cfiRange, targetIdentity, newColor)
		);
	}

	private async mutateCardJsonHighlights(
		sourceFile: string,
		sourceRef: string | undefined,
		mutator: (content: string) => string
	): Promise<boolean> {
		try {
			return await this.processVaultJsonFile(sourceFile, (parsed) => {
				const cardArrays = this.extractCardArraysFromJson(parsed);
				const targetCardUuid = sourceRef?.startsWith("card:") ? sourceRef.slice(5) : null;
				let changed = false;

				for (const cards of cardArrays) {
					for (const card of cards) {
						if (!card || typeof card.content !== "string") continue;
						if (targetCardUuid && card.uuid !== targetCardUuid) continue;

						const updatedContent = mutator(card.content);
						if (updatedContent !== card.content) {
							card.content = updatedContent;
							card.modified = new Date().toISOString();
							changed = true;
							if (targetCardUuid) break;
						}
					}
					if (changed && targetCardUuid) break;
				}

				return changed ? parsed : null;
			});
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] mutateCardJsonHighlights failed:", _e);
			return false;
		}
	}

	private removeCalloutByCfi(
		content: string,
		cfiRange: string,
		targetIdentity: EpubTargetIdentity
	): string {
		let result = content;
		const normalizedTargetCfi = EpubLinkService.normalizeCfi(cfiRange);
		for (const callout of this.extractEpubCallouts(content)) {
			const resolvedLink = this.resolveCalloutLink(callout);
			if (!resolvedLink || !this.isSameEpubTarget(resolvedLink, targetIdentity)) continue;
			if (EpubLinkService.normalizeCfi(resolvedLink.cfi) === normalizedTargetCfi) {
				result = result.replace(callout.fullMatch, "");
				result = result.replace(/\n{3,}/g, "\n\n");
				result = result.replace(/^\n+/, "");
				break;
			}
		}
		return result;
	}

	private updateCalloutColor(
		content: string,
		cfiRange: string,
		targetIdentity: EpubTargetIdentity,
		newColor: string
	): string {
		const normalizedTargetCfi = EpubLinkService.normalizeCfi(cfiRange);
		for (const callout of this.extractEpubCallouts(content)) {
			const resolvedLink = this.resolveCalloutLink(callout);
			if (!resolvedLink || !this.isSameEpubTarget(resolvedLink, targetIdentity)) continue;
			if (EpubLinkService.normalizeCfi(resolvedLink.cfi) === normalizedTargetCfi) {
				const oldCalloutHeader = callout.fullMatch.split("\n")[0];
				const newCalloutHeader = oldCalloutHeader.replace(
					/> \[!EPUB(?:\|[^\]]+)?\]/,
					`> [!EPUB|${newColor}]`
				);
				return content.replace(oldCalloutHeader, newCalloutHeader);
			}
		}
		return content;
	}

	private normalizeCanvasSourceRef(sourceRef?: string): string | undefined {
		if (!sourceRef) return undefined;
		return sourceRef.startsWith("canvas:") ? sourceRef.slice(7) : sourceRef;
	}

	private async processVaultTextFile(
		sourcePath: string,
		mutator: (content: string) => string
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file && this.isTFile(file))) {
			return false;
		}

		const updatedInOpenEditor = await this.tryProcessOpenMarkdownFile(sourcePath, mutator);
		if (updatedInOpenEditor !== null) {
			return updatedInOpenEditor;
		}

		const current = await this.readVaultFileText(file);
		const updated = mutator(current);
		if (updated === current) {
			return false;
		}

		await this.writeVaultFileText(file, updated);
		return true;
	}

	private async processVaultJsonFile(
		sourcePath: string,
		mutator: (parsed: any) => any | null
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file && this.isTFile(file))) {
			return false;
		}

		const content = await this.readVaultFileText(file);
		const parsed = JSON.parse(content);
		const updatedParsed = mutator(parsed);
		if (!updatedParsed) {
			return false;
		}
		const updated = JSON.stringify(updatedParsed);
		if (updated === content) {
			return false;
		}

		await this.writeVaultFileText(file, updated);
		return true;
	}

	private async tryProcessOpenMarkdownFile(
		sourcePath: string,
		mutator: (content: string) => string
	): Promise<boolean | null> {
		const views = this.getOpenMarkdownViewsForPath(sourcePath);
		if (views.length === 0) {
			return null;
		}

		let changed = false;
		for (const view of views) {
			const editor = view.editor;
			const current = editor?.getValue?.();
			if (typeof current !== "string") {
				continue;
			}

			const updated = mutator(current);
			if (updated === current) {
				continue;
			}

			editor?.setValue?.(updated);
			changed = true;
		}

		if (!changed) {
			return false;
		}

		for (const view of views) {
			if (typeof view.save === "function") {
				await view.save();
			}
		}

		return true;
	}

	private getOpenMarkdownViewsForPath(sourcePath: string): OpenMarkdownViewLike[] {
		const getLeavesOfType = (this.app.workspace as any)?.getLeavesOfType;
		if (typeof getLeavesOfType !== "function") {
			return [];
		}

		const normalizedSourcePath = normalizePath(sourcePath);
		return getLeavesOfType
			.call(this.app.workspace, "markdown")
			.map((leaf: any) => leaf?.view as OpenMarkdownViewLike | undefined)
			.filter((view: OpenMarkdownViewLike | undefined): view is OpenMarkdownViewLike => {
				if (!view) {
					return false;
				}
				const path = typeof view?.file?.path === "string" ? normalizePath(view.file.path) : "";
				return (
					path === normalizedSourcePath &&
					typeof view.editor?.getValue === "function" &&
					typeof view.editor?.setValue === "function"
				);
			});
	}

	private async readVaultFileText(file: TFile): Promise<string> {
		const adapter = this.app.vault.adapter;
		if (adapter && typeof adapter.read === "function") {
			return await adapter.read(file.path);
		}
		return await this.app.vault.cachedRead(file);
	}

	private async writeVaultFileText(file: TFile, updated: string): Promise<void> {
		const vault = this.app.vault as typeof this.app.vault & {
			modify?: (file: TFile, data: string) => Promise<void>;
			process?: (file: TFile, fn: () => string) => Promise<void>;
		};
		if (typeof vault.modify === "function") {
			await vault.modify(file, updated);
			return;
		}

		if (typeof vault.process === "function") {
			await vault.process(file, () => updated);
			return;
		}

		const adapter = this.app.vault.adapter;
		if (adapter && typeof adapter.write === "function") {
			await adapter.write(file.path, updated);
			return;
		}

		throw new Error(`Unable to write vault file: ${file.path}`);
	}

	private parseEpubCallouts(
		content: string,
		targetIdentity: EpubTargetIdentity,
		sourceFile: string,
		sourceRef?: string
	): BacklinkHighlight[] {
		const results: BacklinkHighlight[] = [];
		for (const callout of this.extractEpubCallouts(content)) {
			const color = this.normalizeHighlightColor(callout.color);
			const quotedBody = callout.quotedText;
			const resolvedLink = this.resolveCalloutLink(callout);
			if (!resolvedLink || !this.isSameEpubTarget(resolvedLink, targetIdentity)) continue;

			const text = quotedBody
				.split("\n")
				.map((line: string) => line.replace(/^>\s?/, ""))
				.join("\n")
				.trim();

			results.push({
				cfiRange: resolvedLink.cfi,
				color,
				text,
				sourceFile,
				sourceRef,
				createdTime: callout.createdTime,
			});
		}

		return results;
	}

	private normalizeHighlightColor(color?: string): string {
		switch (color) {
			case "blue":
			case "green":
			case "purple":
			case "red":
				return color;
			case "pink":
				return "red";
			default:
				return "yellow";
		}
	}

	private extractEpubCallouts(content: string): ParsedEpubCallout[] {
		const results: ParsedEpubCallout[] = [];
		const normalized = content.replace(/\r\n/g, "\n");
		const lines = normalized.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const header = lines[i];
			const headerMatch = header.match(/^> \[!EPUB(?:\|([^\]]+))?\]\s*(.*)$/);
			if (!headerMatch) continue;

			const rest = headerMatch[2] || "";
			const linkMarkup = EpubLinkService.extractFirstEpubLinkMarkup(rest);
			if (!linkMarkup) continue;
			const linkStart = rest.indexOf(linkMarkup);
			if (linkStart === -1) continue;
			const linkEnd = linkStart + linkMarkup.length;

			const bodyLines: string[] = [];
			let j = i + 1;
			while (j < lines.length && lines[j].startsWith(">")) {
				bodyLines.push(lines[j]);
				j++;
			}

			const blockLines = [header, ...bodyLines];
			const fullMatch = `${blockLines.join("\n")}${j < lines.length ? "\n" : ""}`;
			results.push({
				color: headerMatch[1] || "yellow",
				linkMarkup,
				quotedText: bodyLines.join("\n"),
				fullMatch,
				createdTime: this.parseCalloutTimestamp(rest.slice(linkEnd).trim()),
			});
			i = j - 1;
		}

		return results;
	}

	private parseCalloutTimestamp(raw: string): number | undefined {
		if (!raw) return undefined;
		const match = raw.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})(?::\d{2})?$/);
		if (!match) return undefined;
		const parsed = new Date(match[1].replace(" ", "T"));
		const time = parsed.getTime();
		return Number.isFinite(time) ? time : undefined;
	}

	private resolveCalloutLink(callout: ParsedEpubCallout): ResolvedCalloutLink | null {
		const parsed = EpubLinkService.parseLinkMarkup(callout.linkMarkup);
		return parsed?.cfi
			? { filePath: parsed.filePath, cfi: parsed.cfi, sourceId: parsed.sourceId }
			: null;
	}

	private isSameEpubTarget(link: ResolvedCalloutLink, targetIdentity: EpubTargetIdentity): boolean {
		if (link.sourceId && targetIdentity.sourceId) {
			return link.sourceId === targetIdentity.sourceId;
		}

		return normalizePath(link.filePath || "") === targetIdentity.filePath;
	}

	private textMayReferenceTarget(text: string, targetIdentity: EpubTargetIdentity): boolean {
		const normalizedText = String(text || "");
		if (!normalizedText) {
			return false;
		}

		if (targetIdentity.fileName && normalizedText.includes(targetIdentity.fileName)) {
			return true;
		}

		return !!(targetIdentity.sourceId && normalizedText.includes(`sid=${targetIdentity.sourceId}`));
	}

	private contentMayReferenceTarget(content: string, targetIdentity: EpubTargetIdentity): boolean {
		return this.textMayReferenceTarget(content, targetIdentity);
	}

	private async resolveTargetIdentity(epubFilePath: string): Promise<EpubTargetIdentity> {
		const normalizedPath = normalizePath(epubFilePath || "");
		let sourceId: string | undefined;

		if (normalizedPath) {
			try {
				sourceId = (await this.storageService.ensureSourceIdentity(normalizedPath))?.sourceId;
			} catch (error) {
				logger.debug("[EpubBacklinkHighlightService] Failed to resolve EPUB source identity:", {
					epubFilePath: normalizedPath,
					error,
				});
			}
		}

		return {
			filePath: normalizedPath,
			fileName: normalizedPath.split("/").pop() || "",
			sourceId,
		};
	}
}
