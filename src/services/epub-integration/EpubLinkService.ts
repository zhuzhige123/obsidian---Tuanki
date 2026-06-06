import { App, TFile } from "obsidian";
import type { EpubHighlightStyle } from "./types";
import { inflateRaw } from "pako";
import { openEpubInPreferredLeaf } from "../../utils/epub-leaf-utils";
import { logger } from "../../utils/logger";
import { EPUB_RUNTIME } from "./epub-runtime";
import { ensureEpubPremiumAccess } from "./epub-premium";

export interface EpubLinkParams {
	filePath: string;
	cfi: string;
	text: string;
	chapter?: number;
	sourceId?: string;
	excerptId?: string;
}

interface EpubLinkMarkupRange {
	start: number;
	end: number;
	markup: string;
}

export class EpubLinkService {
	private static readonly COMPACT_READIUM_PREFIX = "readium:loc~";
	private static readonly COMPACT_PAYLOAD_PREFIX = "weave-loc=";
	private static readonly MAX_CHAPTER_LABEL_LENGTH = 24;
	private static readonly EPUB_WIKILINK_REGEX =
		/\[\[(?:(?!\]\]).)+\.epub(?:(?!\]\]).)*\]\]/gi;
	private static readonly HIGHLIGHT_STYLE_TOKENS = new Set<EpubHighlightStyle>([
		"underline",
		"strikethrough",
		"wavy",
	]);
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private static escapeRegex(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	private static createSupportedProtocolLinkStartRegex(): RegExp {
		const protocolPattern = EPUB_RUNTIME.protocol.allNames
			.map((name) => EpubLinkService.escapeRegex(name))
			.join("|");
		return new RegExp(`\\[[^\\]]*]\\(obsidian:\\/\\/(?:${protocolPattern})\\?`, "gi");
	}

	private static createSupportedBareProtocolHrefRegex(): RegExp {
		const protocolPattern = EPUB_RUNTIME.protocol.allNames
			.map((name) => EpubLinkService.escapeRegex(name))
			.join("|");
		return new RegExp(`obsidian:\\/\\/(?:${protocolPattern})\\?[^\\s"'<>]+`, "gi");
	}

	private static matchesSupportedProtocolHref(value: string): boolean {
		return EPUB_RUNTIME.protocol.allNames.some((name) =>
			value.startsWith(`obsidian://${name}?`)
		);
	}

	static normalizeHighlightColorToken(color?: string): string | undefined {
		switch (String(color || "").trim().toLowerCase()) {
			case "blue":
			case "green":
			case "purple":
			case "red":
			case "yellow":
				return String(color || "").trim().toLowerCase();
			case "pink":
				return "red";
			default:
				return undefined;
		}
	}

	static isHighlightStyleToken(value?: string): value is EpubHighlightStyle {
		return EpubLinkService.HIGHLIGHT_STYLE_TOKENS.has(
			String(value || "").trim().toLowerCase() as EpubHighlightStyle
		);
	}

	static parseHighlightCalloutMeta(meta?: string): {
		color?: string;
		style?: EpubHighlightStyle;
	} {
		const tokens = String(meta || "")
			.split(/[+\s]+/)
			.map((token) => token.trim().toLowerCase())
			.filter(Boolean);
		let color: string | undefined;
		let style: EpubHighlightStyle | undefined;
		for (const token of tokens) {
			const normalizedColor = EpubLinkService.normalizeHighlightColorToken(token);
			if (normalizedColor) {
				color = normalizedColor;
				continue;
			}
			if (EpubLinkService.isHighlightStyleToken(token)) {
				style = token;
			}
		}
		return { color, style };
	}

	static buildHighlightCalloutMeta(color?: string, style?: EpubHighlightStyle): string {
		const normalizedColor = EpubLinkService.normalizeHighlightColorToken(color);
		const tokens = [normalizedColor, style].filter((token): token is string => Boolean(token));
		return tokens.join("+");
	}

	private static findSupportedProtocolHrefIndex(value: string): number {
		const matches = EPUB_RUNTIME.protocol.allNames
			.map((name) => value.indexOf(`obsidian://${name}?`))
			.filter((index) => index >= 0);
		return matches.length > 0 ? Math.min(...matches) : -1;
	}

	static encodeCfiForWikilink(cfi: string): string {
		return cfi.replace(/\[/g, "%5B").replace(/\]/g, "%5D").replace(/\|/g, "%7C");
	}

	static encodeTextForWikilink(text: string): string {
		return encodeURIComponent(text);
	}

	static decodeCfiFromWikilink(encoded: string): string {
		return encoded.replace(/%5B/gi, "[").replace(/%5D/gi, "]").replace(/%7C/gi, "|");
	}

	static normalizeCfi(cfi: string): string {
		let normalized = cfi.replace(/%5B/gi, "[").replace(/%5D/gi, "]").replace(/%7C/gi, "|");
		if (normalized.includes("%")) {
			try {
				normalized = decodeURIComponent(normalized);
			} catch {
				/* use as-is */
			}
		}
		return normalized;
	}

	private static decodeCompactLocatorField(value?: string): string | undefined {
		if (!value) {
			return undefined;
		}
		try {
			const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
			const paddingLength = (4 - (normalized.length % 4)) % 4;
			const binary = atob(`${normalized}${"=".repeat(paddingLength)}`);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch {
			return undefined;
		}
	}

	static extractEmbeddedTextFromReadiumLocator(cfi: string): string | undefined {
		const normalized = EpubLinkService.normalizeCfi(cfi);
		if (!normalized.startsWith(EpubLinkService.COMPACT_READIUM_PREFIX)) {
			return undefined;
		}
		const parts = normalized.slice("readium:".length).split("~");
		if (parts[0] !== "loc") {
			return undefined;
		}
		return EpubLinkService.decodeCompactLocatorField(parts[5]);
	}

	private static decodeBase64Url(value: string): Uint8Array | undefined {
		try {
			const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
			const paddingLength = (4 - (normalized.length % 4)) % 4;
			const binary = atob(`${normalized}${"=".repeat(paddingLength)}`);
			return Uint8Array.from(binary, (char) => char.charCodeAt(0));
		} catch {
			return undefined;
		}
	}

	private static parseCompactPayloadSubpath(
		payloadText: string
	): Pick<EpubLinkParams, "cfi" | "text" | "chapter"> | null {
		try {
			const compressed = EpubLinkService.decodeBase64Url(payloadText);
			if (!compressed) {
				return null;
			}
			const decompressed: unknown = (inflateRaw as (data: Uint8Array) => Uint8Array)(compressed);
			const bytes =
				decompressed instanceof Uint8Array
					? decompressed
					: decompressed instanceof ArrayBuffer
						? new Uint8Array(decompressed)
						: Array.isArray(decompressed)
							? Uint8Array.from(
									decompressed.filter((byte): byte is number => typeof byte === "number")
								)
							: null;
			if (!bytes) {
				return null;
			}
			const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
			if (!Array.isArray(payload) || typeof payload[0] !== "string") {
				return null;
			}
			return {
				cfi: payload[0],
				text: typeof payload[1] === "string" ? payload[1] : "",
				chapter: typeof payload[2] === "number" ? payload[2] : undefined,
			};
		} catch (error) {
			logger.warn("[EpubLinkService] Failed to decode compact EPUB payload:", error);
			return null;
		}
	}

	private static buildLegacySubpath(
		cfi: string,
		_text: string,
		_chapterIndex?: number,
		sourceId?: string,
		excerptId?: string
	): string {
		const safeCfi = EpubLinkService.encodeCfiForWikilink(cfi);
		let subpath = `weave-cfi=${safeCfi}`;
		if (sourceId) {
			subpath += `&sid=${encodeURIComponent(sourceId)}`;
		}
		if (excerptId) {
			subpath += `&eid=${encodeURIComponent(excerptId)}`;
		}
		return subpath;
	}

	static hasSupportedEpubSubpath(subpath: string): boolean {
		return (
			subpath.includes(EpubLinkService.COMPACT_PAYLOAD_PREFIX) ||
			subpath.includes("weave-cfi=") ||
			subpath.includes("tuanki-cfi=") ||
			subpath.includes("tuanki-cfi-")
		);
	}

	static extractFirstEpubLinkMarkup(content: string): string | undefined {
		if (!content) return undefined;
		const normalized = content.replace(/\r\n/g, "\n");
		const wikilinkMatch = normalized.match(
			/(\[\[(?:(?!\]\]).)+\.epub(?:(?!\]\]).)*(?:#weave-loc=|#weave-cfi=|#tuanki-cfi=|#tuanki-cfi-)(?:(?!\]\]).)*\]\])/i
		);
		if (wikilinkMatch?.[1]) {
			return wikilinkMatch[1];
		}
		return EpubLinkService.extractLegacyProtocolLinkMarkup(normalized);
	}

	static isLegacyEpubLinkMarkup(markup: string): boolean {
		if (!markup) return false;

		if (
			EpubLinkService.matchesSupportedProtocolHref(markup) ||
			EpubLinkService.findSupportedProtocolHrefIndex(markup) >= 0
		) {
			return true;
		}

		if (!(markup.startsWith("[[") && markup.endsWith("]]"))) {
			return false;
		}

		const inner = markup.slice(2, -2);
		const hashIndex = inner.indexOf("#");
		if (hashIndex < 0) {
			return false;
		}

		const hashContent = inner.slice(hashIndex + 1);
		if (
			hashContent.includes(EpubLinkService.COMPACT_PAYLOAD_PREFIX) ||
			hashContent.includes("tuanki-cfi=") ||
			hashContent.includes("tuanki-cfi-")
		) {
			return true;
		}

		return (
			hashContent.includes("weave-cfi=") && /(?:^|[&?])(text|chapter)=/.test(hashContent)
		);
	}

	private static collectEpubLinkMarkupRanges(content: string): EpubLinkMarkupRange[] {
		const ranges: EpubLinkMarkupRange[] = [];

		const wikilinkRegex = new RegExp(EpubLinkService.EPUB_WIKILINK_REGEX.source, "gi");
		let wikilinkMatch: RegExpExecArray | null;
		while ((wikilinkMatch = wikilinkRegex.exec(content)) !== null) {
			const markup = wikilinkMatch[0];
			const start = wikilinkMatch.index;
			if (start === undefined) {
				continue;
			}
			ranges.push({
				start,
				end: start + markup.length,
				markup,
			});
		}

		const protocolStartRegex = EpubLinkService.createSupportedProtocolLinkStartRegex();
		let startMatch: RegExpExecArray | null;
		while ((startMatch = protocolStartRegex.exec(content)) !== null) {
			const start = startMatch.index;
			const openParenIndex = content.indexOf("(", start);
			if (openParenIndex < 0) {
				continue;
			}

			let depth = 0;
			let end = -1;
			for (let i = openParenIndex; i < content.length; i++) {
				const char = content[i];
				if (char === "(") {
					depth++;
				} else if (char === ")") {
					depth--;
					if (depth === 0) {
						end = i + 1;
						break;
					}
				}
			}

			if (end <= start) {
				continue;
			}

			ranges.push({
				start,
				end,
				markup: content.slice(start, end),
			});
			protocolStartRegex.lastIndex = end;
		}

		const bareProtocolRegex = EpubLinkService.createSupportedBareProtocolHrefRegex();
		let bareProtocolMatch: RegExpExecArray | null;
		while ((bareProtocolMatch = bareProtocolRegex.exec(content)) !== null) {
			const markup = bareProtocolMatch[0];
			const start = bareProtocolMatch.index;
			if (start === undefined) {
				continue;
			}
			const end = start + markup.length;
			const overlapsExistingRange = ranges.some(
				(range) => start < range.end && end > range.start
			);
			if (overlapsExistingRange) {
				continue;
			}
			ranges.push({
				start,
				end,
				markup,
			});
		}

		return ranges.sort((a, b) => a.start - b.start);
	}

	static collectEpubLinkMarkups(content: string): string[] {
		return EpubLinkService.collectEpubLinkMarkupRanges(content).map(({ markup }) => markup);
	}

	migrateEpubLinkMarkup(markup: string, sourcePath?: string): string | null {
		if (!EpubLinkService.isLegacyEpubLinkMarkup(markup)) {
			return null;
		}

		const parsed = EpubLinkService.parseLinkMarkup(markup);
		if (!parsed?.filePath || !/\.epub$/i.test(parsed.filePath)) {
			return null;
		}

		return this.buildEpubLink(
			parsed.filePath,
			parsed.cfi,
			parsed.text,
			parsed.chapter,
			undefined,
			sourcePath
		);
	}

	migrateLegacyEpubLinksInContent(
		content: string,
		sourcePath?: string
	): { content: string; changed: boolean; updatedLinks: number } {
		if (!content) {
			return { content, changed: false, updatedLinks: 0 };
		}

		const ranges = EpubLinkService.collectEpubLinkMarkupRanges(content).filter(({ markup }) =>
			EpubLinkService.isLegacyEpubLinkMarkup(markup)
		);
		if (ranges.length === 0) {
			return { content, changed: false, updatedLinks: 0 };
		}

		let migratedContent = content;
		let updatedLinks = 0;
		for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
			const migratedMarkup = this.migrateEpubLinkMarkup(range.markup, sourcePath);
			if (!migratedMarkup || migratedMarkup === range.markup) {
				continue;
			}
			migratedContent =
				migratedContent.slice(0, range.start) +
				migratedMarkup +
				migratedContent.slice(range.end);
			updatedLinks++;
		}

		return {
			content: migratedContent,
			changed: updatedLinks > 0,
			updatedLinks,
		};
	}

	private static injectSourceIdIntoMarkup(markup: string, sourceId: string): string | null {
		if (!markup || !sourceId) {
			return null;
		}

		if (markup.startsWith("[[") && markup.endsWith("]]")) {
			const inner = markup.slice(2, -2);
			const hashIndex = inner.indexOf("#");
			if (hashIndex < 0) {
				return null;
			}

			const aliasIndex = inner.indexOf("|", hashIndex);
			const hashContent =
				aliasIndex >= 0 ? inner.slice(hashIndex + 1, aliasIndex) : inner.slice(hashIndex + 1);
			if (!EpubLinkService.hasSupportedEpubSubpath(hashContent) || /(?:^|[&?])sid=/.test(hashContent)) {
				return null;
			}

			const prefix = inner.slice(0, hashIndex + 1);
			const suffix = aliasIndex >= 0 ? inner.slice(aliasIndex) : "";
			return `[[${prefix}${hashContent}&sid=${encodeURIComponent(sourceId)}${suffix}]]`;
		}

		const href = EpubLinkService.matchesSupportedProtocolHref(markup)
			? markup
			: EpubLinkService.extractProtocolHrefFromMarkdownLink(markup);
		if (!href || /(?:^|[?&])sid=/.test(href)) {
			return null;
		}

		const rewrittenHref = href.includes("?")
			? `${href}&sid=${encodeURIComponent(sourceId)}`
			: `${href}?sid=${encodeURIComponent(sourceId)}`;
		if (markup === href) {
			return rewrittenHref;
		}

		return markup.replace(href, rewrittenHref);
	}

	async enrichEpubLinksWithSourceIdsInContent(
		content: string,
		sourcePath?: string
	): Promise<{ content: string; changed: boolean; updatedLinks: number }> {
		if (!content) {
			return { content, changed: false, updatedLinks: 0 };
		}

		const normalized = this.migrateLegacyEpubLinksInContent(content, sourcePath);
		const baseContent = normalized.content;
		let updatedLinks = normalized.updatedLinks;

		const { EpubStorageService } = await import("./EpubStorageService");
		const storageService = new EpubStorageService(this.app);
		const ranges = EpubLinkService.collectEpubLinkMarkupRanges(baseContent);
		if (ranges.length === 0) {
			return {
				content: baseContent,
				changed: normalized.changed,
				updatedLinks,
			};
		}

		let migratedContent = baseContent;
		for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
			const parsed = EpubLinkService.parseLinkMarkup(range.markup);
			if (!parsed?.filePath || parsed.sourceId) {
				continue;
			}
			const sourceEntry = await storageService.ensureSourceIdentity(parsed.filePath);
			if (!sourceEntry?.sourceId) {
				continue;
			}
			const migratedMarkup = EpubLinkService.injectSourceIdIntoMarkup(
				range.markup,
				sourceEntry.sourceId
			);
			if (!migratedMarkup || migratedMarkup === range.markup) {
				continue;
			}
			migratedContent =
				migratedContent.slice(0, range.start) +
				migratedMarkup +
				migratedContent.slice(range.end);
			updatedLinks++;
		}

		return {
			content: migratedContent,
			changed: updatedLinks > 0 || normalized.changed,
			updatedLinks,
		};
	}

	static extractFilePathFromEpubLinkMarkup(markup: string): string | null {
		if (!markup) return null;

		if (markup.startsWith("[[") && markup.endsWith("]]")) {
			const inner = markup.slice(2, -2);
			const hashIndex = inner.indexOf("#");
			const pipeIndex = inner.indexOf("|");
			const boundaryIndexCandidates = [hashIndex, pipeIndex].filter((index) => index >= 0);
			const boundaryIndex =
				boundaryIndexCandidates.length > 0 ? Math.min(...boundaryIndexCandidates) : inner.length;
			return inner.slice(0, boundaryIndex) || null;
		}

		const href = EpubLinkService.matchesSupportedProtocolHref(markup)
			? markup
			: EpubLinkService.extractProtocolHrefFromMarkdownLink(markup) || "";
		if (!href) return null;

		return EpubLinkService.parseProtocolHref(href)?.filePath || null;
	}

	private static extractLegacyProtocolLinkMarkup(content: string): string | undefined {
		return EpubLinkService.collectEpubLinkMarkupRanges(content).find(({ markup }) => !markup.startsWith("[["))
			?.markup;
	}

	private static extractProtocolHrefFromMarkdownLink(markup: string): string | null {
		const hrefStartIndex = EpubLinkService.findSupportedProtocolHrefIndex(markup);
		const openParenIndex = hrefStartIndex > 0 ? hrefStartIndex - 1 : -1;
		const closeParenIndex = markup.lastIndexOf(")");
		if (openParenIndex < 0 || closeParenIndex <= openParenIndex) {
			return null;
		}

		return markup.slice(openParenIndex + 1, closeParenIndex);
	}

	private static decodeQueryValue(value: string): string {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}

	private static extractProtocolQueryParams(href: string): Record<string, string> {
		const params: Record<string, string> = {};
		for (const key of ["file", "cfi", "text", "chapter", "sid"]) {
			const match = href.match(new RegExp(`[?&]${key}=([^&)]*)`, "i"));
			if (match?.[1]) {
				params[key] = EpubLinkService.decodeQueryValue(match[1]);
			}
		}
		return params;
	}

	private static parseProtocolHref(href: string): EpubLinkParams | null {
		try {
			const url = new URL(href);
			return EpubLinkService.parseProtocolParams(Object.fromEntries(url.searchParams.entries()));
		} catch {
			return EpubLinkService.parseProtocolParams(EpubLinkService.extractProtocolQueryParams(href));
		}
	}

	static extractShortBookName(filePath: string): string {
		const fullName =
			filePath
				.split("/")
				.pop()
				?.replace(/\.epub$/i, "") || "EPUB";
		const mainTitle = fullName.split(/[([{]/)[0].trim();
		if (mainTitle.length > 25) {
			return `${mainTitle.slice(0, 25)}...`;
		}
		return mainTitle || fullName.slice(0, 25);
	}

	private static sanitizeWikilinkAlias(alias: string): string {
		return alias
			.replace(/\r?\n+/g, " ")
			.replace(/\|/g, " / ")
			.replace(/\]\]/g, "] ]")
			.replace(/\s+/g, " ")
			.trim();
	}

	private static truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}
		return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
	}

	private extractLinkPath(filePath: string, sourcePath?: string): string {
		const abstractFile = this.app?.vault?.getAbstractFileByPath?.(filePath);
		if (abstractFile instanceof TFile && typeof this.app?.fileManager?.generateMarkdownLink === "function") {
			try {
				const generated = this.app.fileManager.generateMarkdownLink(abstractFile, sourcePath || "");
				if (generated.startsWith("[[") && generated.endsWith("]]")) {
					const inner = generated.slice(2, -2).trim();
					if (inner) {
						return inner;
					}
				}
			} catch (error) {
				logger.debug("[EpubLinkService] Failed to generate shortest linkpath:", error);
			}
		}
		return filePath;
	}

	private static buildChapterLabel(chapterIndex?: number, chapterTitle?: string): string {
		const sanitizedChapterTitle = EpubLinkService.sanitizeWikilinkAlias(chapterTitle || "");
		if (sanitizedChapterTitle) {
			return EpubLinkService.truncateText(
				sanitizedChapterTitle,
				EpubLinkService.MAX_CHAPTER_LABEL_LENGTH
			);
		}
		if (chapterIndex !== undefined) {
			return `章节 ${chapterIndex}`;
		}
		return "";
	}

	private static buildQuoteTitleSuffix(
		chapterIndex?: number,
		chapterTitle?: string,
		timestamp?: string
	): string {
		const parts: string[] = [];
		const chapterLabel = EpubLinkService.buildChapterLabel(chapterIndex, chapterTitle);
		if (chapterLabel) {
			parts.push(`[${chapterLabel}]`);
		}
		if (timestamp) {
			parts.push(timestamp);
		}
		return parts.length > 0 ? ` ${parts.join(" ")}` : "";
	}

	private static buildDisplayAlias(filePath: string): string {
		const bookName = EpubLinkService.extractShortBookName(filePath);
		return EpubLinkService.sanitizeWikilinkAlias(bookName) || "EPUB";
	}

	static formatQuotedExcerptText(text: string, style?: EpubHighlightStyle): string {
		if (style !== "strikethrough") {
			return text;
		}

		return text
			.split("\n")
			.map((line) => {
				const trimmed = line.trim();
				if (!trimmed || (/^~~.*~~$/).test(trimmed)) {
					return line;
				}
				const leadingWhitespace = line.match(/^\s*/)?.[0] || "";
				const trailingWhitespace = line.match(/\s*$/)?.[0] || "";
				return `${leadingWhitespace}~~${trimmed}~~${trailingWhitespace}`;
			})
			.join("\n");
	}

	buildEpubLink(
		filePath: string,
		cfi: string,
		_text: string,
		_chapterIndex?: number,
		_chapterTitle?: string,
		sourcePath?: string,
		sourceId?: string,
		excerptId?: string
	): string {
		const displayText = EpubLinkService.buildDisplayAlias(filePath);
		const linkPath = this.extractLinkPath(filePath, sourcePath);
		const subpath = EpubLinkService.buildLegacySubpath(cfi, "", undefined, sourceId, excerptId);
		return `[[${linkPath}#${subpath}|${displayText}]]`;
	}

	buildQuoteBlock(
		filePath: string,
		cfi: string,
		text: string,
		chapterIndex?: number,
		color?: string,
		chapterTitle?: string,
		timestamp?: string,
		sourcePath?: string,
		sourceId?: string,
		excerptId?: string,
		style?: EpubHighlightStyle
	): string {
		const link = this.buildEpubLink(
			filePath,
			cfi,
			text,
			chapterIndex,
			chapterTitle,
			sourcePath,
			sourceId,
			excerptId
		);
		const calloutMetaValue = EpubLinkService.buildHighlightCalloutMeta(color, style);
		const calloutMeta = calloutMetaValue ? `|${calloutMetaValue}` : "";
		const titleSuffix = EpubLinkService.buildQuoteTitleSuffix(
			chapterIndex,
			chapterTitle,
			timestamp
		);
		const quotedLines = EpubLinkService.formatQuotedExcerptText(text, style)
			.split("\n")
			.map((_line) => `> ${_line}`)
			.join("\n");
		return `> [!EPUB${calloutMeta}] ${link}${titleSuffix}\n${quotedLines}\n`;
	}

	static parseLinkMarkup(markup: string): EpubLinkParams | null {
		if (!markup) return null;

		if (markup.startsWith("[[") && markup.endsWith("]]")) {
			const inner = markup.slice(2, -2);
			const hashIdx = inner.indexOf("#");
			if (hashIdx === -1) {
				return null;
			}
			const parsed = EpubLinkService.parseEpubLink(inner.slice(hashIdx));
			if (!parsed) {
				return null;
			}
			const filePath = EpubLinkService.extractFilePathFromEpubLinkMarkup(markup);
			return filePath || parsed.sourceId ? { ...parsed, filePath: filePath || "" } : null;
		}

		const href = EpubLinkService.matchesSupportedProtocolHref(markup)
			? markup
			: EpubLinkService.extractProtocolHrefFromMarkdownLink(markup) || "";
		if (!href) {
			return null;
		}

		return EpubLinkService.parseProtocolHref(href);
	}

	static parseEpubLink(subpath: string): EpubLinkParams | null {
		if (!subpath || !EpubLinkService.hasSupportedEpubSubpath(subpath)) {
			return null;
		}

		try {
			const hashContent = subpath.startsWith("#") ? subpath.slice(1) : subpath;
			const compactPayloadMatch = hashContent.match(/weave-loc=([^&|\]]*)/);
			if (compactPayloadMatch?.[1]) {
				const compactParsed = EpubLinkService.parseCompactPayloadSubpath(compactPayloadMatch[1]);
				if (compactParsed) {
					return {
						filePath: "",
						cfi: compactParsed.cfi,
						text: compactParsed.text,
						chapter: compactParsed.chapter,
					};
				}
			}

			// support both weave-cfi= (current) and tuanki-cfi- (legacy) formats
			const cfiMatch =
				hashContent.match(/weave-cfi=(epubcfi\([^)]*\))/) ||
				hashContent.match(/weave-cfi=([^&|\]]*)/) ||
				hashContent.match(/tuanki-cfi=(epubcfi\([^)]*\))/) ||
				hashContent.match(/tuanki-cfi=([^&|\]]*)/) ||
				hashContent.match(/tuanki-cfi-(epubcfi\([^)]*\))/) ||
				hashContent.match(/tuanki-cfi-([^&|\]]*)/);
			const chapterMatch = hashContent.match(/[&?]chapter=(\d+)/);
			const textMatch = hashContent.match(/[&?]text=([^&|\]]*)/);
			const sourceIdMatch = hashContent.match(/[&?]sid=([^&|\]]*)/);
			const excerptIdMatch = hashContent.match(/[&?]eid=([^&|\]]*)/);

			if (!cfiMatch) {
				return null;
			}

			let cfi = cfiMatch[1];
			cfi = EpubLinkService.decodeCfiFromWikilink(cfi);
			if (cfi.includes("%")) {
				try {
					cfi = decodeURIComponent(cfi);
				} catch {
					/* use as-is */
				}
			}

			return {
				filePath: "",
				cfi,
				text: textMatch?.[1]
					? decodeURIComponent(textMatch[1])
					: EpubLinkService.extractEmbeddedTextFromReadiumLocator(cfi) || "",
				chapter: chapterMatch ? parseInt(chapterMatch[1], 10) : undefined,
				sourceId: sourceIdMatch?.[1] ? decodeURIComponent(sourceIdMatch[1]) : undefined,
				excerptId: excerptIdMatch?.[1] ? decodeURIComponent(excerptIdMatch[1]) : undefined,
			};
		} catch (e) {
			logger.warn("[EpubLinkService] Failed to parse epub link:", subpath, e);
			return null;
		}
	}

	static parseProtocolParams(params: Record<string, string>): EpubLinkParams | null {
		const file = params.file;
		const cfi = params.cfi;
		const text = params.text || "";
		const chapter = params.chapter;
		const sourceId = params.sid;

		if ((!file && !sourceId) || !cfi) return null;

		return {
			filePath: file || "",
			cfi,
			text,
			chapter: chapter ? parseInt(chapter, 10) : undefined,
			sourceId: sourceId || undefined,
		};
	}

	async navigateToEpubLocation(
		filePath: string,
		cfi: string,
		text: string,
		sourceId?: string
	): Promise<void> {
		try {
			if (!ensureEpubPremiumAccess(this.app)) {
				return;
			}
			const { EpubStorageService } = await import("./EpubStorageService");
			const resolvedFilePath = await new EpubStorageService(this.app).resolveSourceFilePath(
				sourceId,
				filePath
			);
			if (!resolvedFilePath) {
				logger.warn("[EpubLinkService] Unable to resolve EPUB source:", {
					filePath,
					sourceId,
				});
				return;
			}
			const targetLeaf = await openEpubInPreferredLeaf(this.app, resolvedFilePath, {
				pendingCfi: cfi,
				pendingText: text,
			});
			if (!targetLeaf) return;

			this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });

			logger.debug("[EpubLinkService] Navigated to:", resolvedFilePath, cfi, sourceId);
		} catch (error) {
			logger.error("[EpubLinkService] Navigation failed:", error);
		}
	}
}
