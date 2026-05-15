import type { ClozeDelimiterSettings } from "./cloze-syntax";
import { hasAnyClozeSyntax } from "./cloze-syntax";

export type ClozeMode = "reveal" | "input";

const CLOZE_MODE_DIRECTIVE_REGEX = /%%\s*weave-cloze-mode\s*:\s*(input|reveal)\s*%%/i;
const YAML_FRONTMATTER_CAPTURE_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)?/;
const CLOZE_MODE_YAML_FIELD_REGEX = /^\s*we_cloze_mode\s*:\s*(input|reveal)\s*$/im;
const CLOZE_MODE_TAG_LINE_REGEX = /^[ \t]*#(?:we_)?input[ \t]*$/gim;
const CLOZE_MODE_TAG_TOKEN_REGEX = /(^|\s)#(?:we_)?input\b/gim;
const CLOZE_MODE_YAML_TAG_ITEM_REGEX = /^\s*-\s*["']?(?:we_input|input)["']?\s*$/im;
const CLOZE_MODE_YAML_INLINE_TAG_REGEX =
	/^\s*tags\s*:\s*\[[^\]]*\b(?:we_input|input)\b[^\]]*\]\s*$/im;
const CLOZE_MODE_KEY_LINE_REGEX = /^\s*we_cloze_mode\s*:\s*(input|reveal)\s*$/i;

export function detectClozeModeFromContent(content: string): ClozeMode {
	if (!content) return "reveal";

	const { frontmatter } = splitFrontmatter(content);
	if (frontmatter) {
		const yamlModeMatch = frontmatter.match(CLOZE_MODE_YAML_FIELD_REGEX);
		if (yamlModeMatch) {
			return yamlModeMatch[1].toLowerCase() === "input" ? "input" : "reveal";
		}

		if (
			CLOZE_MODE_YAML_TAG_ITEM_REGEX.test(frontmatter) ||
			CLOZE_MODE_YAML_INLINE_TAG_REGEX.test(frontmatter)
		) {
			return "input";
		}
	}

	if (/(^|\s)#(?:we_)?input\b/i.test(content)) {
		return "input";
	}

	const legacyMatch = content.match(CLOZE_MODE_DIRECTIVE_REGEX);
	if (!legacyMatch) return "reveal";

	return legacyMatch[1].toLowerCase() === "input" ? "input" : "reveal";
}

export function resolveClozeModeForRender(
	originalContent: string | null | undefined,
	renderedContent: string
): ClozeMode {
	if (originalContent?.trim()) {
		return detectClozeModeFromContent(originalContent);
	}

	return detectClozeModeFromContent(renderedContent);
}

export function shouldRevealClozeAnswersForRender(
	clozeMode: ClozeMode | null | undefined,
	showClozeAnswers: boolean
): boolean {
	void clozeMode;
	return showClozeAnswers;
}

export function hasClozeSyntax(
	content: string,
	clozeSettings?: ClozeDelimiterSettings | null
): boolean {
	if (!content) return false;
	return hasAnyClozeSyntax(content, clozeSettings);
}

export function setClozeModeInContent(content: string, mode: ClozeMode): string {
	const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
	const cleanedContent = stripLegacyModeMarkers(content);
	const { frontmatter, body } = splitFrontmatter(cleanedContent);
	const normalizedBody = body.replace(/^\r?\n+/, "");

	if (mode === "input") {
		const lines = (frontmatter ? frontmatter.split(/\r?\n/) : []).filter(
			(line) => !CLOZE_MODE_KEY_LINE_REGEX.test(line)
		);

		lines.push("we_cloze_mode: input");
		const nextFrontmatter = lines.join(lineEnding).trim();
		const wrappedFrontmatter = `---${lineEnding}${nextFrontmatter}${lineEnding}---`;

		return normalizedBody
			? `${wrappedFrontmatter}${lineEnding}${lineEnding}${normalizedBody}`
			: wrappedFrontmatter;
	}

	if (!frontmatter) {
		return normalizedBody;
	}

	const lines = frontmatter.split(/\r?\n/).filter((line) => !CLOZE_MODE_KEY_LINE_REGEX.test(line));

	const nextFrontmatter = lines.join(lineEnding).trim();
	if (!nextFrontmatter) {
		return normalizedBody;
	}

	const wrappedFrontmatter = `---${lineEnding}${nextFrontmatter}${lineEnding}---`;
	return normalizedBody
		? `${wrappedFrontmatter}${lineEnding}${lineEnding}${normalizedBody}`
		: wrappedFrontmatter;
}

function stripLegacyModeMarkers(content: string): string {
	if (!content) return "";

	return content
		.replace(CLOZE_MODE_DIRECTIVE_REGEX, "")
		.replace(CLOZE_MODE_TAG_LINE_REGEX, "")
		.replace(CLOZE_MODE_TAG_TOKEN_REGEX, "$1")
		.replace(/[ \t]+(\r?\n)/g, "$1")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
	if (!content) {
		return { frontmatter: null, body: "" };
	}

	const match = content.match(YAML_FRONTMATTER_CAPTURE_REGEX);
	if (!match) {
		return { frontmatter: null, body: content };
	}

	const full = match[0];
	const frontmatter = match[1] ?? "";
	const body = content.slice(full.length);
	return { frontmatter, body };
}
