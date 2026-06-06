import { type EventRef, Notice, TFile } from "obsidian";
import type { WeavePlugin } from "../../main";
import {
	applyWeDecksMembershipToCard,
	isPersistedMemoryCardUuid,
	resolveWeDecksMembershipFromValues,
} from "../../utils/card-we-decks-membership";
import { isDetachedEditorTempFilePath } from "../editor/editor-temp-file-policy";
import { saveMemoryCard } from "../weave-domain";
import { logger } from "../../utils/logger";
import { t } from "../../utils/i18n";

export const WEAVE_CARD_WE_DECKS_UI_SYNC_EVENT = "weave:card-we-decks-ui-sync";

export interface CardWeDecksUiSyncDetail {
	sessionId: string;
	deckId: string;
	deckNames: string[];
}

export class CardWeDecksPropertySyncService {
	private plugin: WeavePlugin;
	private eventRef: EventRef | null = null;
	private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private lastWeDecksByFile = new Map<string, string>();
	private readonly debounceMs = 400;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	start(): void {
		this.eventRef = this.plugin.app.metadataCache.on("changed", (file) => {
			if (!(file instanceof TFile) || file.extension !== "md") {
				return;
			}
			if (!isDetachedEditorTempFilePath(file.path)) {
				return;
			}
			void this.scheduleHandleFile(file);
		});
		logger.debug("[CardWeDecksPropertySync] started");
	}

	stop(): void {
		if (this.eventRef) {
			this.plugin.app.metadataCache.offref(this.eventRef);
			this.eventRef = null;
		}
		for (const timer of this.debounceTimers.values()) {
			window.clearTimeout(timer);
		}
		this.debounceTimers.clear();
		this.lastWeDecksByFile.clear();
	}

	private scheduleHandleFile(file: TFile): void {
		const existing = this.debounceTimers.get(file.path);
		if (existing) {
			window.clearTimeout(existing);
		}

		this.debounceTimers.set(
			file.path,
			window.setTimeout(() => {
				this.debounceTimers.delete(file.path);
				void this.handleFile(file);
			}, this.debounceMs)
		);
	}

	private async handleFile(file: TFile): Promise<void> {
		const lookup = this.plugin.editorPoolManager?.getSessionByEditorFilePath(file.path);
		if (!lookup) {
			return;
		}

		const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const rawWeDecks = frontmatter?.we_decks;
		const serialized = JSON.stringify(rawWeDecks ?? null);
		if (this.lastWeDecksByFile.get(file.path) === serialized) {
			return;
		}
		this.lastWeDecksByFile.set(file.path, serialized);

		const decks = await this.plugin.dataStorage?.getDecks();
		if (!decks) {
			return;
		}

		const memoryDecks = decks.filter((deck) => deck.purpose !== "test");
		const resolution = resolveWeDecksMembershipFromValues(rawWeDecks, memoryDecks);

		if (resolution.invalidNames.length > 0) {
			const invalidLabel = resolution.invalidNames.join("、");
			new Notice(
				t("cards.editorModal.weDecksDeckNotFound", { name: invalidLabel }),
				5000
			);
			return;
		}

		let latestContent = lookup.card.content || "";
		try {
			latestContent = await this.plugin.app.vault.read(file);
		} catch (error) {
			logger.warn("[CardWeDecksPropertySync] read editor file failed:", error);
		}

		const applied = applyWeDecksMembershipToCard(lookup.card, latestContent, memoryDecks);
		Object.assign(lookup.card, applied.card);

		this.emitUiSync({
			sessionId: lookup.sessionId,
			deckId: resolution.formalDeckId || "",
			deckNames: resolution.formalDeckNames,
		});

		if (!isPersistedMemoryCardUuid(lookup.card.uuid)) {
			return;
		}

		if (resolution.cleared || !resolution.formalDeckId) {
			return;
		}

		const currentFormalDeckId = memoryDecks.find((deck) => deck.id === lookup.card.deckId)?.id;
		if (currentFormalDeckId === resolution.formalDeckId) {
			return;
		}

		try {
			const saveResult = await saveMemoryCard(this.plugin, applied.card, "update");
			if (!saveResult.success) {
				new Notice(saveResult.error || t("cards.editorModal.saveFailedPrefix"), 5000);
				return;
			}
			if (saveResult.data) {
				Object.assign(lookup.card, saveResult.data);
			}
		} catch (error) {
			logger.error("[CardWeDecksPropertySync] persist deck membership failed:", error);
			new Notice(t("cards.editorModal.saveFailedPrefix"), 5000);
		}
	}

	private emitUiSync(detail: CardWeDecksUiSyncDetail): void {
		window.dispatchEvent(
			new CustomEvent<CardWeDecksUiSyncDetail>(WEAVE_CARD_WE_DECKS_UI_SYNC_EVENT, {
				detail,
			})
		);
	}
}
