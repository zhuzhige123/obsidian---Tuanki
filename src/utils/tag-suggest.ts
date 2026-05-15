import { AbstractInputSuggest, App } from "obsidian";
import type { Card } from "../data/types";
import { getCardTagValues, removeHashPrefix } from "./tag-utils";

export type TagSuggestionDataSource = "memory" | "questionBank" | "incremental-reading";
export type TagSuggestionOption = string | { name: string; count?: number };

export interface TagSuggestionItem {
	key: string;
	tag: string;
	label: string;
	count: number;
	keywords: string[];
	searchText: string;
	isCreateSuggestion?: boolean;
}

type MetadataCacheWithTags = App["metadataCache"] & {
	getTags?: () => Record<string, number> | null | undefined;
};

interface TagInputSuggestOptions {
	getItems: () => TagSuggestionItem[];
	onSelectTag: (tag: string) => void;
	getQuery?: () => string;
	isActive?: () => boolean;
	limit?: number;
	createSuggestion?: (query: string) => TagSuggestionItem | null;
}

export function normalizeTagSuggestionValue(tag: string): string {
	return removeHashPrefix(String(tag || "").trim());
}

export function formatTagSuggestionLabel(tag: string): string {
	const normalized = normalizeTagSuggestionValue(tag);
	return normalized ? `#${normalized}` : "#";
}

export function normalizeTagSuggestionOptions(options: TagSuggestionOption[]): TagSuggestionItem[] {
	const tagMap = new Map<string, TagSuggestionItem>();

	for (const option of options || []) {
		const rawName = typeof option === "string" ? option : option?.name;
		const normalized = normalizeTagSuggestionValue(String(rawName || ""));
		if (!normalized) {
			continue;
		}

		const key = normalized.toLocaleLowerCase();
		const count = typeof option === "string" ? 0 : Math.max(0, Number(option.count) || 0);
		const label = formatTagSuggestionLabel(normalized);
		const keywords = Array.from(new Set([normalized, label]));
		const searchText = keywords.map((value) => value.toLocaleLowerCase()).join(" ");
		const existing = tagMap.get(key);

		if (existing) {
			existing.count = Math.max(existing.count, count);
			existing.keywords = Array.from(new Set([...existing.keywords, ...keywords]));
			existing.searchText = existing.keywords.map((value) => value.toLocaleLowerCase()).join(" ");
			continue;
		}

		tagMap.set(key, {
			key,
			tag: normalized,
			label,
			count,
			keywords,
			searchText,
		});
	}

	return Array.from(tagMap.values()).sort(
		(a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN")
	);
}

export function filterTagSuggestionItems(
	items: TagSuggestionItem[],
	query: string,
	limit = 40
): TagSuggestionItem[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const filtered = normalizedQuery
		? items.filter((item) => item.searchText.includes(normalizedQuery))
		: [...items];

	return filtered
		.sort((a, b) => {
			const aTag = a.tag.toLocaleLowerCase();
			const bTag = b.tag.toLocaleLowerCase();
			const aStarts = normalizedQuery && aTag.startsWith(normalizedQuery) ? 1 : 0;
			const bStarts = normalizedQuery && bTag.startsWith(normalizedQuery) ? 1 : 0;
			if (aStarts !== bStarts) {
				return bStarts - aStarts;
			}
			if (a.count !== b.count) {
				return b.count - a.count;
			}
			return a.tag.localeCompare(b.tag, "zh-CN");
		})
		.slice(0, Math.max(1, limit));
}

function collectVaultTagCounts(app: App): Map<string, number> {
	const usageByTag = new Map<string, number>();
	const metadataCache = app.metadataCache as MetadataCacheWithTags | undefined;
	const cachedVaultTags = metadataCache?.getTags?.();

	if (cachedVaultTags && typeof cachedVaultTags === "object") {
		for (const [rawTag, usageCount] of Object.entries(cachedVaultTags)) {
			const normalizedTag = normalizeTagSuggestionValue(rawTag);
			if (!normalizedTag) {
				continue;
			}
			const safeUsageCount = typeof usageCount === "number" && Number.isFinite(usageCount)
				? Math.max(0, Math.floor(usageCount))
				: 0;
			usageByTag.set(normalizedTag, Math.max(usageByTag.get(normalizedTag) ?? 0, safeUsageCount));
		}
		return usageByTag;
	}

	for (const markdownFile of app.vault.getMarkdownFiles()) {
		const cache = metadataCache?.getFileCache?.(markdownFile) ?? null;
		const tagsInFile = new Set<string>();
		const frontmatterTags = cache?.frontmatter?.tags;

		if (Array.isArray(frontmatterTags)) {
			frontmatterTags
				.map((tag) => normalizeTagSuggestionValue(String(tag || "")))
				.filter(Boolean)
				.forEach((tag) => tagsInFile.add(tag));
		} else if (typeof frontmatterTags === "string") {
			frontmatterTags
				.split(/[\n,，]/)
				.map((tag) => normalizeTagSuggestionValue(tag))
				.filter(Boolean)
				.forEach((tag) => tagsInFile.add(tag));
		}

		for (const tagCache of cache?.tags ?? []) {
			const normalizedTag = normalizeTagSuggestionValue(String(tagCache.tag || ""));
			if (normalizedTag) {
				tagsInFile.add(normalizedTag);
			}
		}

		for (const tag of tagsInFile) {
			usageByTag.set(tag, (usageByTag.get(tag) ?? 0) + 1);
		}
	}

	return usageByTag;
}

export function buildTagSuggestionOptions(
	app: App,
	cards: Card[],
	dataSource: TagSuggestionDataSource
): Array<{ name: string; count: number }> {
	const usageByTag = collectVaultTagCounts(app);

	for (const card of Array.isArray(cards) ? cards : []) {
		const tagsInCard = new Set<string>();
		for (const rawTag of getCardTagValues(card, dataSource)) {
			const normalizedTag = normalizeTagSuggestionValue(rawTag);
			if (normalizedTag) {
				tagsInCard.add(normalizedTag);
			}
		}
		for (const tag of tagsInCard) {
			usageByTag.set(tag, (usageByTag.get(tag) ?? 0) + 1);
		}
	}

	return Array.from(usageByTag.entries())
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

export function expandTagSuggestionPaths(tags: string[]): string[] {
	const tagSet = new Set<string>();

	for (const rawTag of tags) {
		const normalized = normalizeTagSuggestionValue(rawTag);
		if (!normalized) {
			continue;
		}
		const parts = normalized.split("/").filter(Boolean);
		for (let index = 1; index <= parts.length; index += 1) {
			tagSet.add(parts.slice(0, index).join("/"));
		}
	}

	return Array.from(tagSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export class TagInputSuggest extends AbstractInputSuggest<TagSuggestionItem> {
	private readonly options: TagInputSuggestOptions;
	private readonly targetEl: HTMLInputElement | HTMLDivElement;
	private readonly handleInput = () => {
		if (!this.isActive()) {
			this.close();
		}
	};
	private readonly handleBlur = () => {
		window.setTimeout(() => this.close(), 120);
	};

	constructor(app: App, inputEl: HTMLInputElement | HTMLDivElement, options: TagInputSuggestOptions) {
		super(app, inputEl);
		this.options = options;
		this.targetEl = inputEl;
		if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
			this.limit = Math.max(1, Math.floor(options.limit));
		}
		inputEl.addEventListener("input", this.handleInput);
		inputEl.addEventListener("blur", this.handleBlur);
	}

	destroy(): void {
		this.targetEl.removeEventListener("input", this.handleInput);
		this.targetEl.removeEventListener("blur", this.handleBlur);
		this.close();
	}

	getSuggestions(_inputStr: string): TagSuggestionItem[] {
		if (!this.isActive()) {
			return [];
		}

		const query = this.getQuery();
		const suggestions = filterTagSuggestionItems(this.options.getItems(), query, this.limit);
		const createSuggestion = this.options.createSuggestion?.(query) ?? null;

		return createSuggestion ? [createSuggestion, ...suggestions] : suggestions;
	}

	renderSuggestion(item: TagSuggestionItem, el: HTMLElement): void {
		el.addClass("weave-batch-tag-suggestion");
		if (item.isCreateSuggestion) {
			el.addClass("weave-batch-tag-suggestion--create");
		}
		const row = el.createDiv({ cls: "weave-batch-tag-suggestion__row" });
		row.createSpan({
			text: item.label,
			cls: "weave-batch-tag-suggestion__title",
		});
		if (item.count > 0) {
			row.createSpan({
				text: `(${item.count})`,
				cls: "weave-batch-tag-suggestion__meta",
			});
		}
	}

	selectSuggestion(item: TagSuggestionItem): void {
		this.options.onSelectTag(item.tag);
		this.close();
	}

	private getQuery(): string {
		return this.options.getQuery ? this.options.getQuery() : this.getValue();
	}

	private isActive(): boolean {
		return this.options.isActive ? this.options.isActive() : true;
	}
}
