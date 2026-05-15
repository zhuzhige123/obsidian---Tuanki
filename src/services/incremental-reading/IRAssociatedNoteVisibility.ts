import { normalizePath } from "obsidian";

export interface AssociatedNoteCarrier {
	primaryAssociatedNotePath?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];
	associatedNoteScope?: "point" | "material";
}

export function normalizeAssociatedNotePath(path?: string | null): string {
	return path ? normalizePath(path) : "";
}

export function getVisibleAssociatedNotePath(material?: AssociatedNoteCarrier | null): string {
	return (
		normalizeAssociatedNotePath(material?.primaryAssociatedNotePath) ||
		normalizeAssociatedNotePath(material?.associatedNotePath) ||
		(Array.isArray(material?.associatedNotePaths)
			? material.associatedNotePaths.map((path) => normalizeAssociatedNotePath(path)).find(Boolean) || ""
			: "")
	);
}

export function getPointAssociatedNotePath(material?: AssociatedNoteCarrier | null): string {
	const normalizedPath = getVisibleAssociatedNotePath(material);
	if (!normalizedPath) return "";
	return material?.associatedNoteScope === "material" ? "" : normalizedPath;
}

export function hasVisibleAssociatedNote(material?: AssociatedNoteCarrier | null): boolean {
	return getVisibleAssociatedNotePath(material).length > 0;
}

export function hasPointAssociatedNote(material?: AssociatedNoteCarrier | null): boolean {
	return getPointAssociatedNotePath(material).length > 0;
}
