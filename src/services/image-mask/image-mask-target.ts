import type { MaskTarget } from "../../types/image-mask-types";

function stripQueryAndHash(value: string): string {
	const queryIndex = value.indexOf("?");
	const hashIndex = value.indexOf("#");
	const cutIndex = [queryIndex, hashIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
	return cutIndex === undefined ? value : value.slice(0, cutIndex);
}

function tryDecodeURIComponent(value: string): string {
	if (!value.includes("%")) {
		return value;
	}

	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function normalizeMaskTargetPath(value?: string): string {
	let normalized = String(value || "").trim();
	if (!normalized) {
		return "";
	}

	normalized = stripQueryAndHash(normalized).replace(/\\/g, "/");
	normalized = normalized.replace(/^\.\//, "");
	normalized = tryDecodeURIComponent(normalized);
	return normalized.trim();
}

export function getMaskTargetComparablePath(
	target?: Pick<MaskTarget, "imagePath" | "imageLink"> | null
): string {
	return normalizeMaskTargetPath(target?.imagePath || target?.imageLink || "");
}

export function buildMaskTargetKey(
	target?: Pick<MaskTarget, "imagePath" | "imageLink" | "imageOccurrence"> | null
): string | null {
	const comparablePath = getMaskTargetComparablePath(target);
	const occurrence = target?.imageOccurrence;
	if (!comparablePath || !Number.isFinite(occurrence) || (occurrence as number) < 1) {
		return null;
	}

	return `${comparablePath}::${occurrence}`;
}

export function normalizeImageResourceUrl(value?: string): string {
	const normalized = normalizeMaskTargetPath(value);
	return normalized;
}
