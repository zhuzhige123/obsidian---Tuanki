import { EPUB_RUNTIME } from "../epub-integration";

export const EPUB_LOCATE_LINK_PREFIX = "__weave_epub_link__=";
export const EPUB_LOCATE_CFI_PREFIX = "__weave_epub_cfi__=";
export const EPUB_LOCATE_EXCERPT_PREFIX = "__weave_epub_excerpt__=";
export const EPUB_LOCATE_TIME_PREFIX = "__weave_epub_time__=";

const EPUB_PROTOCOL_NAME_TOKENS = EPUB_RUNTIME.protocol.allNames.map((name) => name.toLowerCase());

export interface TaggedSourceLocateCandidates {
	rawSearchCandidates: string[];
	textCandidates: string[];
	epubLinkCandidates: string[];
	epubCfiCandidates: string[];
	excerptCandidates: string[];
	createdTime?: number;
	hasEpubTarget: boolean;
}

export interface SourceLocateTextCandidateOptions {
	minLength?: number;
	requireWordBoundaryHint?: boolean;
}

export interface SourceLocateTimestampOptions {
	includeDateOnly?: boolean;
	includeSeconds?: boolean;
	includeIsoMinute?: boolean;
}

export interface EpubMarkdownLocateCandidateOptions {
	epubFilePath: string;
	encodedCfi: string;
	rawCfi: string;
	excerptText?: string;
	createdTime?: number;
	sourceRef?: string;
	excerptId?: string;
}

export function parseTaggedSourceLocateCandidates(candidates: string[]): TaggedSourceLocateCandidates {
	const rawSearchCandidates: string[] = [];
	const textCandidates: string[] = [];
	const epubLinkCandidates: string[] = [];
	const epubCfiCandidates: string[] = [];
	const excerptCandidates: string[] = [];
	let createdTime: number | undefined;

	for (const candidate of candidates) {
		if (typeof candidate !== "string") continue;
		const value = candidate.trim();
		if (!value) continue;

		if (value.startsWith(EPUB_LOCATE_LINK_PREFIX)) {
			const linkValue = value.slice(EPUB_LOCATE_LINK_PREFIX.length).trim();
			if (linkValue) {
				epubLinkCandidates.push(linkValue);
				rawSearchCandidates.push(linkValue);
			}
			continue;
		}

		if (value.startsWith(EPUB_LOCATE_CFI_PREFIX)) {
			const cfiValue = value.slice(EPUB_LOCATE_CFI_PREFIX.length).trim();
			if (cfiValue) {
				epubCfiCandidates.push(cfiValue);
				rawSearchCandidates.push(cfiValue);
			}
			continue;
		}

		if (value.startsWith(EPUB_LOCATE_EXCERPT_PREFIX)) {
			const excerptValue = value.slice(EPUB_LOCATE_EXCERPT_PREFIX.length).trim();
			if (excerptValue) {
				excerptCandidates.push(excerptValue);
				rawSearchCandidates.push(excerptValue);
			}
			continue;
		}

		if (value.startsWith(EPUB_LOCATE_TIME_PREFIX)) {
			const numericValue = Number(value.slice(EPUB_LOCATE_TIME_PREFIX.length).trim());
			if (Number.isFinite(numericValue) && numericValue > 0) {
				createdTime = numericValue;
			}
			continue;
		}

		rawSearchCandidates.push(value);
		textCandidates.push(value);
	}

	return {
		rawSearchCandidates,
		textCandidates,
		epubLinkCandidates,
		epubCfiCandidates,
		excerptCandidates,
		createdTime,
		hasEpubTarget:
			epubLinkCandidates.length > 0 ||
			epubCfiCandidates.length > 0 ||
			excerptCandidates.length > 0,
	};
}

export function buildSourceLocateCandidateVariants(candidate: string): string[] {
	const value = String(candidate || "").trim();
	if (!value) return [];

	const variants = new Set<string>([value]);
	if (value.startsWith("^")) variants.add(value.slice(1));
	else variants.add(`^${value}`);

	if (value.startsWith("#^")) {
		variants.add(value.slice(2));
		variants.add(value.slice(1));
	}

	if (value.includes("#^")) {
		const [, suffix] = value.split("#^");
		if (suffix) {
			variants.add(suffix);
			variants.add(`^${suffix}`);
		}
	}

	return Array.from(variants).filter(Boolean);
}

export function buildSourceLocateSourceRefCandidates(sourceRef?: string): string[] {
	const trimmed = String(sourceRef || "").trim();
	if (
		!trimmed ||
		trimmed.startsWith("card:") ||
		trimmed.startsWith("canvas:") ||
		trimmed.startsWith("canvas-file-node:") ||
		trimmed.startsWith("canvas-node:")
	) {
		return [];
	}

	const variants = new Set<string>([trimmed]);
	if (trimmed.startsWith("#^")) {
		variants.add(trimmed.slice(1));
		variants.add(trimmed.slice(2));
	} else if (trimmed.startsWith("^")) {
		variants.add(`#${trimmed}`);
		variants.add(trimmed.slice(1));
	} else if (trimmed.startsWith("#")) {
		variants.add(trimmed.slice(1));
	} else {
		variants.add(`^${trimmed}`);
		variants.add(`#^${trimmed}`);
	}

	return Array.from(variants).filter(Boolean);
}

export function buildEpubMarkdownLocateCandidates(
	options: EpubMarkdownLocateCandidateOptions
): string[] {
	const candidates: string[] = [];
	const encodedCfi = String(options.encodedCfi || "").trim();
	const rawCfi = String(options.rawCfi || "").trim();
	const epubFilePath = String(options.epubFilePath || "").trim();
	const excerptId = String(options.excerptId || "").trim();
	const excerptText = String(options.excerptText || "").trim();

	if (epubFilePath && encodedCfi) {
		candidates.push(`${EPUB_LOCATE_LINK_PREFIX}${epubFilePath}#weave-cfi=${encodedCfi}`);
	}
	if (encodedCfi) {
		candidates.push(`${EPUB_LOCATE_CFI_PREFIX}${encodedCfi}`);
	}
	if (rawCfi) {
		candidates.push(`${EPUB_LOCATE_CFI_PREFIX}${rawCfi}`);
	}
	if (excerptId) {
		candidates.push(`${EPUB_LOCATE_EXCERPT_PREFIX}${excerptId}`);
	}
	if (
		typeof options.createdTime === "number" &&
		Number.isFinite(options.createdTime) &&
		options.createdTime > 0
	) {
		candidates.push(`${EPUB_LOCATE_TIME_PREFIX}${Math.trunc(options.createdTime)}`);
	}
	candidates.push(...buildSourceLocateSourceRefCandidates(options.sourceRef));
	if (excerptText) {
		candidates.push(excerptText);
		const firstLine = excerptText
			.split("\n")
			.map((line) => line.trim())
			.find(Boolean);
		if (firstLine && firstLine !== excerptText) {
			candidates.push(firstLine);
		}
	}

	return candidates.filter(Boolean);
}

export function decodeSourceLocateURIComponent(value: string, maxPasses = 2): string {
	let decoded = String(value || "");
	for (let i = 0; i < maxPasses; i += 1) {
		try {
			const next = decodeURIComponent(decoded);
			if (next === decoded) break;
			decoded = next;
		} catch {
			break;
		}
	}
	return decoded;
}

export function normalizeSourceLocateMatchValue(value: string): string {
	return decodeSourceLocateURIComponent(value)
		.replace(/\s+/g, " ")
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.trim()
		.toLowerCase();
}

export function isDescriptiveSourceLocateTextCandidate(
	candidate: string,
	options: SourceLocateTextCandidateOptions = {}
): boolean {
	const normalized = normalizeSourceLocateMatchValue(candidate);
	const minLength = options.minLength ?? 10;
	if (!normalized || normalized.length < minLength) {
		return false;
	}
	if (
		normalized.includes("weave-loc=") ||
		normalized.includes("weave-cfi=") ||
		normalized.includes("tuanki-cfi-") ||
		EPUB_PROTOCOL_NAME_TOKENS.some((name) => normalized.includes(name))
	) {
		return false;
	}
	if (normalized.startsWith("^") || normalized.startsWith("#^")) {
		return false;
	}
	if (
		normalized.endsWith(".md") ||
		normalized.endsWith(".epub") ||
		normalized.includes(".md#") ||
		normalized.includes(".epub#")
	) {
		return false;
	}
	if (options.requireWordBoundaryHint) {
		return /[\u4e00-\u9fff]/.test(normalized) || /\s/.test(candidate);
	}
	return true;
}

export function buildSourceLocateTimestampCandidates(
	createdTime: number,
	options: SourceLocateTimestampOptions = {}
): string[] {
	const date = new Date(createdTime);
	if (!Number.isFinite(date.getTime())) {
		return [];
	}

	const y = date.getFullYear();
	const mo = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	const variants = new Set<string>([`${y}-${mo}-${d} ${hh}:${mm}`]);

	if (options.includeSeconds) {
		variants.add(`${y}-${mo}-${d} ${hh}:${mm}:${ss}`);
	}
	if (options.includeDateOnly) {
		variants.add(`${y}-${mo}-${d}`);
	}
	if (options.includeIsoMinute) {
		variants.add(`${y}-${mo}-${d}T${hh}:${mm}`);
	}

	return Array.from(variants);
}
