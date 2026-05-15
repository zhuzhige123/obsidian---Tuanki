export interface ClozeDelimiterSettings {
	enabled?: boolean;
	openDelimiter?: string;
	closeDelimiter?: string;
	placeholder?: string;
}

export interface NormalizedClozeDelimiterSettings {
	enabled: boolean;
	openDelimiter: string;
	closeDelimiter: string;
	placeholder: string;
}

export type DetectedClozeMatchType = "standard" | "anki" | "anki-hint";

export interface DetectedClozeMatch {
	fullMatch: string;
	text: string;
	index: number;
	endIndex: number;
	type: DetectedClozeMatchType;
	ordinal?: number;
	hint?: string;
}

export const DEFAULT_CLOZE_DELIMITER_SETTINGS: NormalizedClozeDelimiterSettings = {
	enabled: true,
	openDelimiter: "==",
	closeDelimiter: "==",
	placeholder: "[...]",
};

const ANKI_CLOZE_REGEX = /\{\{c(\d+)::([\s\S]+?)(?:::(.+?))?\}\}/g;

let globalClozeDelimiterSettings: NormalizedClozeDelimiterSettings = {
	...DEFAULT_CLOZE_DELIMITER_SETTINGS,
};

function normalizeDelimiter(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeClozeDelimiterSettings(
	settings?: ClozeDelimiterSettings | null
): NormalizedClozeDelimiterSettings {
	return {
		enabled: settings?.enabled ?? DEFAULT_CLOZE_DELIMITER_SETTINGS.enabled,
		openDelimiter: normalizeDelimiter(
			settings?.openDelimiter,
			DEFAULT_CLOZE_DELIMITER_SETTINGS.openDelimiter
		),
		closeDelimiter: normalizeDelimiter(
			settings?.closeDelimiter,
			DEFAULT_CLOZE_DELIMITER_SETTINGS.closeDelimiter
		),
		placeholder:
			typeof settings?.placeholder === "string"
				? settings.placeholder
				: DEFAULT_CLOZE_DELIMITER_SETTINGS.placeholder,
	};
}

function resolveClozeDelimiterSettings(
	settings?: ClozeDelimiterSettings | null
): NormalizedClozeDelimiterSettings {
	return settings == null
		? globalClozeDelimiterSettings
		: normalizeClozeDelimiterSettings(settings);
}

export function setGlobalClozeDelimiterSettings(settings?: ClozeDelimiterSettings | null): void {
	globalClozeDelimiterSettings = normalizeClozeDelimiterSettings(settings);
}

export function getGlobalClozeDelimiterSettings(): NormalizedClozeDelimiterSettings {
	return { ...globalClozeDelimiterSettings };
}

export function escapeRegexLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function buildConfiguredClozeRegex(
	settings?: ClozeDelimiterSettings | null,
	flags = "g"
): RegExp {
	const resolved = resolveClozeDelimiterSettings(settings);
	return new RegExp(
		`${escapeRegexLiteral(resolved.openDelimiter)}([\\s\\S]+?)${escapeRegexLiteral(resolved.closeDelimiter)}`,
		flags
	);
}

export function wrapWithConfiguredCloze(text: string, settings?: ClozeDelimiterSettings | null): string {
	const resolved = resolveClozeDelimiterSettings(settings);
	return `${resolved.openDelimiter}${text}${resolved.closeDelimiter}`;
}

export function getConfiguredClozeSyntaxExample(
	sample = "文本",
	settings?: ClozeDelimiterSettings | null
): string {
	return wrapWithConfiguredCloze(sample, settings);
}

export function hasConfiguredClozeSyntax(
	content: string,
	settings?: ClozeDelimiterSettings | null
): boolean {
	if (!content) {
		return false;
	}

	const resolved = resolveClozeDelimiterSettings(settings);
	if (!resolved.enabled) {
		return false;
	}

	return buildConfiguredClozeRegex(resolved, "s").test(content);
}

export function hasAnkiClozeSyntax(content: string): boolean {
	if (!content) {
		return false;
	}

	return /\{\{c\d*::/.test(content);
}

export function hasAnyClozeSyntax(
	content: string,
	settings?: ClozeDelimiterSettings | null
): boolean {
	return hasConfiguredClozeSyntax(content, settings) || hasAnkiClozeSyntax(content);
}

export function getConfiguredClozeMatches(
	content: string,
	settings?: ClozeDelimiterSettings | null
): DetectedClozeMatch[] {
	if (!content) {
		return [];
	}

	const resolved = resolveClozeDelimiterSettings(settings);
	if (!resolved.enabled) {
		return [];
	}

	const matches: DetectedClozeMatch[] = [];
	const regex = buildConfiguredClozeRegex(resolved, "g");

	for (const match of content.matchAll(regex)) {
		const fullMatch = match[0] ?? "";
		const text = (match[1] ?? "").trim();
		const index = match.index ?? -1;
		if (!text || index < 0) {
			continue;
		}

		matches.push({
			fullMatch,
			text,
			index,
			endIndex: index + fullMatch.length,
			type: "standard",
		});
	}

	return matches;
}

export function getAnkiClozeMatches(content: string): DetectedClozeMatch[] {
	if (!content) {
		return [];
	}

	const matches: DetectedClozeMatch[] = [];
	for (const match of content.matchAll(ANKI_CLOZE_REGEX)) {
		const fullMatch = match[0] ?? "";
		const text = (match[2] ?? "").trim();
		const index = match.index ?? -1;
		if (!text || index < 0) {
			continue;
		}

		const hint = match[3]?.trim();
		matches.push({
			fullMatch,
			text,
			index,
			endIndex: index + fullMatch.length,
			type: hint ? "anki-hint" : "anki",
			ordinal: Number.parseInt(match[1] ?? "", 10),
			hint: hint || undefined,
		});
	}

	return matches;
}

export function getAllClozeMatches(
	content: string,
	settings?: ClozeDelimiterSettings | null
): DetectedClozeMatch[] {
	return [...getConfiguredClozeMatches(content, settings), ...getAnkiClozeMatches(content)].sort(
		(a, b) => a.index - b.index
	);
}

export function extractConfiguredClozeTexts(
	content: string,
	settings?: ClozeDelimiterSettings | null
): string[] {
	return getConfiguredClozeMatches(content, settings).map((match) => match.text);
}

export function replaceConfiguredClozeSyntax(
	content: string,
	replacer: (match: DetectedClozeMatch) => string,
	settings?: ClozeDelimiterSettings | null
): string {
	if (!content) {
		return content;
	}

	const matches = getConfiguredClozeMatches(content, settings);
	if (matches.length === 0) {
		return content;
	}

	let cursor = 0;
	let result = "";
	for (const match of matches) {
		result += content.slice(cursor, match.index);
		result += replacer(match);
		cursor = match.endIndex;
	}

	result += content.slice(cursor);
	return result;
}

export function replaceAnkiClozeSyntax(
	content: string,
	replacer: (match: DetectedClozeMatch) => string
): string {
	if (!content) {
		return content;
	}

	const matches = getAnkiClozeMatches(content);
	if (matches.length === 0) {
		return content;
	}

	let cursor = 0;
	let result = "";
	for (const match of matches) {
		result += content.slice(cursor, match.index);
		result += replacer(match);
		cursor = match.endIndex;
	}

	result += content.slice(cursor);
	return result;
}
