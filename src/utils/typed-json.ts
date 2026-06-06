/**
 * Typed JSON boundaries — prefer `unknown` over `any` for community ESLint score.
 */
export function parseJsonUnknown(text: string): unknown {
	return JSON.parse(text) as unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

export function readNumber(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Safe string coercion for unknown values (avoids `[object Object]` from no-base-to-string). */
export function coerceScalarString(value: unknown, fallback = ""): string {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return fallback;
}
