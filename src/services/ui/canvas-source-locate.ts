import { extractBodyContent, parseYAMLFromContent } from "../../utils/yaml-utils";

export type CanvasSourceNodeRect = {
	x: number;
	y: number;
	width?: number;
	height?: number;
};

export type CanvasLocateSupport = {
	rawWeSource: string | null;
	nodeRect: CanvasSourceNodeRect | null;
	textCandidates: string[];
};

function getCanvasSourceValues(content: string): string[] {
	const yaml = parseYAMLFromContent(content);
	const sourceValues = Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source];

	return sourceValues
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.trim())
		.filter(Boolean);
}

export function getPrimaryCanvasWeSource(content: string): string | null {
	const sourceValues = getCanvasSourceValues(content);
	return (
		sourceValues.find((value) => value.toLowerCase().includes(".canvas") && value.includes("?")) ??
		sourceValues.find((value) => value.toLowerCase().includes(".canvas")) ??
		sourceValues.find((value) => value.includes("?")) ??
		sourceValues[0] ??
		null
	);
}

export function normalizeCanvasNodeId(value: string | null | undefined): string | undefined {
	const normalized = String(value || "")
		.trim()
		.replace(/^canvas:/, "")
		.replace(/^\^/, "")
		.split("?")[0]
		.trim();
	return normalized || undefined;
}

export function getCanvasNodeIdFromSourceLink(sourceLink: string): string | undefined {
	const rawLink = String(sourceLink || "").trim();
	if (!rawLink) return undefined;

	const markerIndex = rawLink.indexOf("#^");
	if (markerIndex === -1) return undefined;

	let fragment = rawLink.slice(markerIndex + 2);
	const aliasIndex = fragment.indexOf("|");
	if (aliasIndex !== -1) {
		fragment = fragment.slice(0, aliasIndex);
	}
	fragment = fragment.split("]]")[0] || fragment;
	return normalizeCanvasNodeId(fragment);
}

export function getCanvasSourceNodeRectFromSourceLink(sourceLink: string): CanvasSourceNodeRect | null {
	const weSource = String(sourceLink || "").trim();
	if (!weSource) return null;

	const queryIndex = weSource.indexOf("?");
	if (queryIndex === -1) return null;

	const aliasIndex = weSource.indexOf("|", queryIndex);
	const queryEndCandidate = weSource.lastIndexOf("]]");
	const queryEnd =
		aliasIndex !== -1 && (queryEndCandidate === -1 || aliasIndex < queryEndCandidate)
			? aliasIndex
			: queryEndCandidate;
	const query = weSource.slice(queryIndex + 1, queryEnd > queryIndex ? queryEnd : undefined);
	const params = new URLSearchParams(query);
	const x = Number(params.get("x"));
	const y = Number(params.get("y"));
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

	const width = Number(params.get("w"));
	const height = Number(params.get("h"));

	return {
		x,
		y,
		width: Number.isFinite(width) ? width : undefined,
		height: Number.isFinite(height) ? height : undefined,
	};
}

export function getCanvasSourceNodeRectFromCardContent(content: string): CanvasSourceNodeRect | null {
	const weSource = getPrimaryCanvasWeSource(content);
	if (!weSource) return null;
	return getCanvasSourceNodeRectFromSourceLink(weSource);
}

export function getCanvasTextCandidatesFromText(content: string): string[] {
	const body = String(content || "").trim();
	if (!body) return [];

	const lines = body
		.split(/\r?\n/)
		.map((line) => line.replace(/^>\s?/, "").trim())
		.filter((line) => line.length >= 12);

	const uniqueCandidates = new Set<string>();
	for (const line of lines) {
		const normalized = line.replace(/\s+/g, " ").trim();
		if (normalized.length >= 12) {
			uniqueCandidates.add(normalized.slice(0, 120));
		}
		if (uniqueCandidates.size >= 3) break;
	}

	return Array.from(uniqueCandidates);
}

export function getCanvasTextCandidatesFromCardContent(content: string): string[] {
	return getCanvasTextCandidatesFromText(extractBodyContent(content || ""));
}

export function getCanvasLocateSupportFromCardContent(content: string): CanvasLocateSupport {
	return {
		rawWeSource: getPrimaryCanvasWeSource(content),
		nodeRect: getCanvasSourceNodeRectFromCardContent(content),
		textCandidates: getCanvasTextCandidatesFromCardContent(content),
	};
}
