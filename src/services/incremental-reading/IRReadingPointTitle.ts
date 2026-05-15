export function extractReadingPointDisplayName(fullTitle: string): string {
	const normalized = String(fullTitle || "").trim();
	if (!normalized) {
		return "";
	}

	const segments = normalized
		.split(/\s+[\/／]\s+/)
		.map((segment) => segment.trim())
		.filter(Boolean);

	if (segments.length === 0) {
		return normalized;
	}

	return segments[segments.length - 1] || normalized;
}
