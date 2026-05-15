import { CompletionContext, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { App, Editor, EditorSuggest, MarkdownView, TFile } from "obsidian";
import type { EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo } from "obsidian";
import type { Card } from "../data/types";
import type { WeavePlugin } from "../main";
import { getCardTagValues } from "./tag-utils";
import {
  filterWeaveCardReferenceCandidates,
  buildWeaveCardReferenceToken,
  getWeaveCardReferenceSuggestMatch,
  type WeaveCardReferenceCandidate,
} from "./weave-card-reference";

type WeaveTagCandidate = {
  tag: string;
  usageCount: number;
};

type MetadataCacheWithTags = App["metadataCache"] & {
  getTags?: () => Record<string, number> | null | undefined;
};

function getWeaveTagSuggestMatch(line: string, cursorCh: number): {
  startOffset: number;
  endOffset: number;
  query: string;
} | null {
  const textBeforeCursor = line.slice(0, cursorCh);
  const match = /(?:^|[\s([{"'“‘（【])#([^\s#]*)$/u.exec(textBeforeCursor);
  if (!match) {
    return null;
  }

  const query = match[1]?.trim() ?? "";

  const hashIndex = textBeforeCursor.lastIndexOf("#");
  if (hashIndex < 0) {
    return null;
  }

  return {
    startOffset: hashIndex,
    endOffset: cursorCh,
    query,
  };
}

// Obsidian Link Autocompletion Suggest
export class LinkSuggest extends EditorSuggest<TFile> {
  constructor(app: App, private plugin: WeavePlugin) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const match = line.match(/\[\[([^\]]*)$/);
    if (match) {
      return {
        start: { line: cursor.line, ch: (match.index || 0) + 2 },
        end: cursor,
        query: match[1],
      };
    }
    return null;
  }

  getSuggestions(context: EditorSuggestContext): TFile[] | Promise<TFile[]> {
    const files = this.app.vault.getMarkdownFiles();
    const query = context.query.toLowerCase();
    return files.filter((file) => file.basename.toLowerCase().includes(query));
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.basename);
  }

  selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
    const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!currentView) return;

    const editor = currentView.editor;
    const linkText = this.app.fileManager.generateMarkdownLink(file, "");

    const start = this.context?.start;
    const end = this.context?.end;

    if (!start || !end) return;

    editor.replaceRange(linkText.slice(2, -2), start, end);
  }
}

export class WeaveTagSuggest extends EditorSuggest<WeaveTagCandidate> {
  private cachedTags: WeaveTagCandidate[] = [];
  private cacheExpiresAt = 0;
  private inflightLoad: Promise<WeaveTagCandidate[]> | null = null;
  private activeEditor: Editor | null = null;

  private isEditorComposing(editor: Editor | null | undefined): boolean {
    return Boolean((editor as (Editor & { cm?: { composing?: boolean } }) | null | undefined)?.cm?.composing);
  }

  constructor(app: App, private plugin: WeavePlugin) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    if (!file) {
      return null;
    }

    if (this.isEditorComposing(editor)) {
      this.activeEditor = null;
      return null;
    }

    const line = editor.getLine(cursor.line);
    const match = getWeaveTagSuggestMatch(line, cursor.ch);
    if (!match) {
      return null;
    }

    this.activeEditor = editor;

    return {
      start: { line: cursor.line, ch: match.startOffset },
      end: { line: cursor.line, ch: match.endOffset },
      query: match.query,
    };
  }

  async getSuggestions(context: EditorSuggestContext): Promise<WeaveTagCandidate[]> {
    const editor = ((context as EditorSuggestContext & { editor?: Editor }).editor) ?? this.activeEditor;
    if (this.isEditorComposing(editor)) {
      return [];
    }

    const query = context.query.trim().toLocaleLowerCase();
    const tags = await this.getCandidateTags();
    return tags
      .filter((candidate) => query.length === 0 || candidate.tag.toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        const aTag = a.tag.toLocaleLowerCase();
        const bTag = b.tag.toLocaleLowerCase();
        const aStarts = aTag.startsWith(query) ? 1 : 0;
        const bStarts = bTag.startsWith(query) ? 1 : 0;
        if (aStarts !== bStarts) {
          return bStarts - aStarts;
        }
        if (a.usageCount !== b.usageCount) {
          return b.usageCount - a.usageCount;
        }
        return a.tag.localeCompare(b.tag, "zh-Hans-CN");
      })
      .slice(0, 30);
  }

  renderSuggestion(candidate: WeaveTagCandidate, el: HTMLElement): void {
    const titleEl = el.createDiv({ cls: "weave-tag-suggest-title" });
    titleEl.setText(`#${candidate.tag}`);

    const metaEl = el.createDiv({ cls: "weave-tag-suggest-meta" });
    metaEl.setText(`${candidate.usageCount} 次使用`);
  }

  selectSuggestion(candidate: WeaveTagCandidate, _evt: MouseEvent | KeyboardEvent): void {
    const editor = ((this.context as (EditorSuggestContext & { editor?: Editor }) | null)?.editor)
      ?? this.activeEditor;
    const start = this.context?.start;
    const end = this.context?.end;

    if (!editor || !start || !end) return;

    editor.replaceRange(`#${candidate.tag}`, start, end);
    this.activeEditor = null;
  }

  private async getCandidateTags(): Promise<WeaveTagCandidate[]> {
    const now = Date.now();
    if (this.cacheExpiresAt > now && this.cachedTags.length > 0) {
      return this.cachedTags;
    }

    if (this.inflightLoad) {
      return this.inflightLoad;
    }

    const loadPromise = this.plugin.dataStorage
      ? this.plugin.dataStorage.getCards()
      : Promise.resolve([] as Card[]);

    this.inflightLoad = loadPromise
      .then((cards) => {
        const usageByTag = new Map<string, number>();

		const metadataCache = this.app.metadataCache as MetadataCacheWithTags | undefined;
		const cachedVaultTags = metadataCache?.getTags?.();
		if (cachedVaultTags && typeof cachedVaultTags === "object") {
			for (const [rawTag, usageCount] of Object.entries(cachedVaultTags)) {
				const normalizedTag = rawTag.trim().replace(/^#+/, "");
				if (!normalizedTag) {
					continue;
				}
				const safeUsageCount = typeof usageCount === "number" && Number.isFinite(usageCount)
					? usageCount
					: 0;
				usageByTag.set(normalizedTag, Math.max(usageByTag.get(normalizedTag) ?? 0, safeUsageCount));
			}
		} else {
			const markdownFiles = this.app.vault?.getMarkdownFiles?.() ?? [];
			for (const markdownFile of markdownFiles) {
				const cache = metadataCache?.getFileCache?.(markdownFile) ?? null;
				for (const tagCache of cache?.tags ?? []) {
					const normalizedTag = String(tagCache.tag ?? "").trim().replace(/^#+/, "");
					if (!normalizedTag) {
						continue;
					}
					usageByTag.set(normalizedTag, (usageByTag.get(normalizedTag) ?? 0) + 1);
				}
			}
		}

        for (const card of Array.isArray(cards) ? cards : []) {
          for (const rawTag of getCardTagValues(card, "memory")) {
            const normalizedTag = rawTag.trim().replace(/^#+/, "");
            if (!normalizedTag) {
              continue;
            }
            usageByTag.set(normalizedTag, (usageByTag.get(normalizedTag) ?? 0) + 1);
          }
        }

        this.cachedTags = Array.from(usageByTag.entries()).map(([tag, usageCount]) => ({
          tag,
          usageCount,
        }));
        this.cacheExpiresAt = Date.now() + 10_000;
        return this.cachedTags;
      })
      .catch(() => [])
      .finally(() => {
        this.inflightLoad = null;
      }) as Promise<WeaveTagCandidate[]> | null;

    return this.inflightLoad ?? [];
  }
}

export class WeaveCardReferenceSuggest extends EditorSuggest<WeaveCardReferenceCandidate> {
  private cachedCards: Card[] = [];
  private cacheExpiresAt = 0;
  private inflightLoad: Promise<Card[]> | null = null;
  private activeEditor: Editor | null = null;

  private isEditorComposing(editor: Editor | null | undefined): boolean {
    return Boolean((editor as (Editor & { cm?: { composing?: boolean } }) | null | undefined)?.cm?.composing);
  }

  constructor(app: App, private plugin: WeavePlugin) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    if (!file) {
      return null;
    }

    if (this.isEditorComposing(editor)) {
      this.activeEditor = null;
      return null;
    }

    const line = editor.getLine(cursor.line);
    const match = getWeaveCardReferenceSuggestMatch(line, cursor.ch);
    if (!match) {
      return null;
    }

    this.activeEditor = editor;

    return {
      start: { line: cursor.line, ch: match.startOffset },
      end: { line: cursor.line, ch: match.endOffset },
      query: match.query,
    };
  }

  async getSuggestions(context: EditorSuggestContext): Promise<WeaveCardReferenceCandidate[]> {
    const editor = ((context as EditorSuggestContext & { editor?: Editor }).editor) ?? this.activeEditor;
    if (this.isEditorComposing(editor)) {
      return [];
    }

    const cards = await this.getCandidateCards();
    return filterWeaveCardReferenceCandidates(cards, context.query, 24);
  }

  renderSuggestion(candidate: WeaveCardReferenceCandidate, el: HTMLElement): void {
    const titleEl = el.createDiv({ cls: "weave-card-reference-suggest-title" });
    titleEl.setText(candidate.label);

    const metaEl = el.createDiv({ cls: "weave-card-reference-suggest-meta" });
    metaEl.setText(candidate.card.uuid);

    const previewEl = el.createDiv({ cls: "weave-card-reference-suggest-preview" });
    previewEl.setText(candidate.preview);
  }

  selectSuggestion(candidate: WeaveCardReferenceCandidate, _evt: MouseEvent | KeyboardEvent): void {
    const editor = ((this.context as (EditorSuggestContext & { editor?: Editor }) | null)?.editor)
      ?? this.activeEditor;
    const start = this.context?.start;
    const end = this.context?.end;

    if (!editor || !start || !end) return;

    editor.replaceRange(buildWeaveCardReferenceToken(candidate.card.uuid), start, end);
    this.activeEditor = null;
  }

  private async getCandidateCards(): Promise<Card[]> {
    const now = Date.now();
    if (this.cacheExpiresAt > now && this.cachedCards.length > 0) {
      return this.cachedCards;
    }

    if (this.inflightLoad) {
      return this.inflightLoad;
    }

    const loadPromise = this.plugin.dataStorage
      ? this.plugin.dataStorage.getCards()
      : Promise.resolve([] as Card[]);

    this.inflightLoad = loadPromise
      .then((cards) => {
        this.cachedCards = Array.isArray(cards) ? cards.filter((card) => Boolean(card?.uuid)) : [];
        this.cacheExpiresAt = Date.now() + 10_000;
        return this.cachedCards;
      })
      .catch(() => [])
      .finally(() => {
        this.inflightLoad = null;
      }) as Promise<Card[]> | null;

    return this.inflightLoad ?? [];
  }
}
