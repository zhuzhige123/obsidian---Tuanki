import type { App } from "obsidian";
import { TFile } from "obsidian";
import { logger } from "../../utils/logger";
import { EpubLinkService } from "./EpubLinkService";

export interface EpubLinkMigrationSummary {
	scannedFiles: number;
	updatedFiles: number;
	updatedLinks: number;
}

export class EpubLinkMigrationService {
	private app: App;
	private runPromise: Promise<EpubLinkMigrationSummary> | null = null;

	constructor(app: App) {
		this.app = app;
	}

	private mayContainEpubLink(content: string): boolean {
		return (
			content.includes(".epub#weave-cfi=") ||
			content.includes(".epub#weave-loc=") ||
			content.includes(".epub#tuanki-cfi=") ||
			content.includes(".epub#tuanki-cfi-") ||
			content.includes("obsidian://weave-epub?")
		);
	}

	async backfillSourceIdsInMarkdownFiles(): Promise<EpubLinkMigrationSummary> {
		if (this.runPromise) {
			return this.runPromise;
		}

		this.runPromise = this.runBackfill();
		try {
			return await this.runPromise;
		} finally {
			this.runPromise = null;
		}
	}

	private async runBackfill(): Promise<EpubLinkMigrationSummary> {
		const summary: EpubLinkMigrationSummary = {
			scannedFiles: 0,
			updatedFiles: 0,
			updatedLinks: 0,
		};
		const linkService = new EpubLinkService(this.app);
		const markdownFiles = this.app.vault.getFiles().filter((file) => file.extension === "md");

		for (let index = 0; index < markdownFiles.length; index += 1) {
			const file = markdownFiles[index];
			if (!(file instanceof TFile)) {
				continue;
			}

			let content = "";
			try {
				content = await this.app.vault.cachedRead(file);
			} catch (error) {
				logger.debug("[EpubLinkMigrationService] Failed to read markdown file:", {
					path: file.path,
					error,
				});
				continue;
			}

			if (!this.mayContainEpubLink(content)) {
				continue;
			}

			summary.scannedFiles += 1;
			const migration = await linkService.enrichEpubLinksWithSourceIdsInContent(content);
			if (!migration.changed || migration.content === content) {
				continue;
			}

			await this.app.vault.process(file, (current) =>
				current === content ? migration.content : current
			);
			summary.updatedFiles += 1;
			summary.updatedLinks += migration.updatedLinks;
		}

		logger.info("[EpubLinkMigrationService] EPUB sourceId backfill finished:", summary);
		return summary;
	}
}
