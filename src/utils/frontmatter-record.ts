import type { FileManager, TFile } from "obsidian";
import { isRecord } from "./typed-json";

export type FrontmatterRecord = Record<string, unknown>;

export async function processFrontmatterRecord(
	fileManager: FileManager,
	file: TFile,
	mutator: (frontmatter: FrontmatterRecord) => void
): Promise<void> {
	await fileManager.processFrontMatter(file, (raw) => {
		if (!isRecord(raw)) {
			return;
		}
		mutator(raw);
	});
}
