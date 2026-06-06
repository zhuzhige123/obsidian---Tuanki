import { isRecord } from "./typed-json";

/** Normalize AnkiConnect field payloads (string or `{ value: string }`). */
export function readAnkiConnectFieldValue(field: unknown): string {
	if (typeof field === "string") {
		return field;
	}
	if (isRecord(field) && typeof field.value === "string") {
		return field.value;
	}
	if (field === null || field === undefined) {
		return "";
	}
	if (typeof field === "number" || typeof field === "boolean") {
		return String(field);
	}
	return "";
}
