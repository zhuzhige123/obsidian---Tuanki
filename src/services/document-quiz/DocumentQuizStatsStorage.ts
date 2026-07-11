import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import type { QuestionTestStats } from "../../types/question-bank-types";
import { getPluginDir } from "../../config/paths";
import { DirectoryUtils } from "../../utils/directory-utils";
import { safeReadJson, safeWriteJson } from "../../utils/safe-json-io";
import { isRecord, parseJsonUnknown } from "../../utils/typed-json";
import { DOC_QUIZ_STATS_FILE } from "./document-quiz-constants";

interface DocumentQuizStatsFile {
	_schemaVersion: string;
	statsByKey: Record<string, QuestionTestStats>;
}

function buildStatsFilePath(app: App): string {
	return normalizePath(`${getPluginDir(app)}/${DOC_QUIZ_STATS_FILE}`);
}

export function buildDocumentQuizStatsKey(filePath: string, blockId: string): string {
	const normalizedPath = normalizePath(filePath);
	return `${normalizedPath}#^${blockId}`;
}

export class DocumentQuizStatsStorage {
	constructor(private readonly app: App) {}

	async loadAll(): Promise<Record<string, QuestionTestStats>> {
		const filePath = buildStatsFilePath(this.app);
		const parsed = await safeReadJson<unknown>(this.app.vault.adapter, filePath, this.app);
		if (!parsed || !isRecord(parsed)) {
			return {};
		}
		const stats = parsed.statsByKey;
		return isRecord(stats) ? (stats as Record<string, QuestionTestStats>) : {};
	}

	async getStats(filePath: string, blockId: string): Promise<QuestionTestStats | undefined> {
		const all = await this.loadAll();
		return all[buildDocumentQuizStatsKey(filePath, blockId)];
	}

	async saveStats(filePath: string, blockId: string, stats: QuestionTestStats): Promise<void> {
		const all = await this.loadAll();
		all[buildDocumentQuizStatsKey(filePath, blockId)] = stats;
		await this.writeAll(all);
	}

	private async writeAll(statsByKey: Record<string, QuestionTestStats>): Promise<void> {
		const filePath = buildStatsFilePath(this.app);
		const payload: DocumentQuizStatsFile = {
			_schemaVersion: "1.0.0",
			statsByKey,
		};
		await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, filePath);
		await safeWriteJson(
			this.app.vault.adapter,
			filePath,
			`${JSON.stringify(payload, null, 2)}\n`,
			this.app
		);
	}
}

export function parseStatsCommentJson(raw: string): Record<string, unknown> | null {
	const trimmed = raw.trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start < 0 || end <= start) {
		return null;
	}
	try {
		const parsed = parseJsonUnknown(trimmed.slice(start, end + 1));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
