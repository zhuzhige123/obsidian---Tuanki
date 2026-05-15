import { EpubLinkService } from "./EpubLinkService";
import type { HighlightSourceLocator, ReaderHighlight } from "./reader-engine-types";

function normalizeLocator(locator?: Partial<HighlightSourceLocator> | null): HighlightSourceLocator | null {
	const sourceFile = String(locator?.sourceFile || "").trim();
	if (!sourceFile) {
		return null;
	}

	const sourceRef = String(locator?.sourceRef || "").trim();
	const excerptId = String(locator?.excerptId || "").trim();
	return {
		sourceFile,
		sourceRef: sourceRef || undefined,
		...(excerptId ? { excerptId } : {}),
	};
}

function collectHighlightSourceLocators(highlight: ReaderHighlight): HighlightSourceLocator[] {
	const merged = new Map<string, HighlightSourceLocator>();
	const pushLocator = (locator?: Partial<HighlightSourceLocator> | null) => {
		const normalized = normalizeLocator(locator);
		if (!normalized) {
			return;
		}
		const key = `${normalized.sourceFile}::${normalized.sourceRef || ""}::${normalized.excerptId || ""}`;
		if (!merged.has(key)) {
			merged.set(key, normalized);
		}
	};

	if (highlight.sourceFile) {
		pushLocator({
			sourceFile: highlight.sourceFile,
			sourceRef: highlight.sourceRef,
			excerptId: highlight.excerptId,
		});
	}

	for (const locator of highlight.sourceLocators || []) {
		pushLocator(locator);
	}

	return Array.from(merged.values()).sort((a, b) => {
		const left = `${a.sourceFile}::${a.sourceRef || ""}::${a.excerptId || ""}`;
		const right = `${b.sourceFile}::${b.sourceRef || ""}::${b.excerptId || ""}`;
		return left.localeCompare(right);
	});
}

export function buildReaderHighlightCollectionSignature(highlights: ReaderHighlight[]): string {
	return highlights
		.map((highlight) =>
			JSON.stringify({
				cfiRange: EpubLinkService.normalizeCfi(String(highlight.cfiRange || "")),
				color: String(highlight.color || "").trim(),
				text: typeof highlight.text === "string" ? highlight.text : "",
				createdTime: typeof highlight.createdTime === "number" ? highlight.createdTime : 0,
				presentation: highlight.presentation || "highlight",
				sourceLocators: collectHighlightSourceLocators(highlight).map(
					(locator) => `${locator.sourceFile}::${locator.sourceRef || ""}::${locator.excerptId || ""}`
				),
			})
		)
		.sort((a, b) => a.localeCompare(b))
		.join("\n");
}
