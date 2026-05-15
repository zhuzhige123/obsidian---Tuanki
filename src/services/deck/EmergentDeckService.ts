import type { App } from "obsidian";
import { Notice, normalizePath } from "obsidian";
import { getV2PathsFromApp } from "../../config/paths";
import { MEMORY_DECK_UI_TEXT } from "../../constants/memory-deck-ui-text";
import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type {
	EmergentDeckCandidate,
	FormalDeckBinding,
	FormalDeckBindingStore,
	FormalDeckBindingSummary,
	MemoryDeckView,
	MemoryDeckOrganizationRuntime,
	ResolvedDeckRef,
} from "../../types/emergent-deck-types";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { getCardDeckIds } from "../../utils/yaml-utils";

const STORE_VERSION = 1;
const DEFAULT_MIN_CANDIDATE_COUNT = 2;
const SERVICE_INSTANCES = new WeakMap<App, EmergentDeckService>();

function normalizeTag(raw: string): string {
	return String(raw || "")
		.trim()
		.replace(/^#+/, "")
		.replace(/\s+/g, " ");
}

function normalizeTagKey(raw: string): string {
	return normalizeTag(raw).toLowerCase();
}

function shouldIgnoreTag(tag: string): boolean {
	const normalized = normalizeTagKey(tag);
	return (
		!normalized ||
		normalized.startsWith("weave-") ||
		normalized.startsWith("we_") ||
		normalized.startsWith("__weave") ||
		normalized.startsWith("system/") ||
		normalized === "默认"
	);
}

function uniqueStrings(values: readonly string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function uniqueDeckRefs(values: readonly ResolvedDeckRef[]): ResolvedDeckRef[] {
	const seen = new Set<string>();
	const result: ResolvedDeckRef[] = [];
	for (const value of values) {
		if (!value?.id || seen.has(value.id)) continue;
		seen.add(value.id);
		result.push(value);
	}
	return result;
}

export class EmergentDeckService {
	constructor(private plugin: Pick<WeavePlugin, "app" | "settings">) {}

	private get adapter() {
		return this.plugin.app.vault.adapter;
	}

	private get bindingsPath(): string {
		return normalizePath(getV2PathsFromApp(this.plugin.app).memory.formalDeckBindings);
	}

	private get memoryRoot(): string {
		return normalizePath(getV2PathsFromApp(this.plugin.app).memory.root);
	}

	isEnabled(): boolean {
		return this.plugin.settings.memoryDeckOrganization?.enabled !== false;
	}

	getMinCandidateCardCount(): number {
		const value = this.plugin.settings.memoryDeckOrganization?.minCandidateCardCount;
		return typeof value === "number" && value > 0 ? Math.floor(value) : DEFAULT_MIN_CANDIDATE_COUNT;
	}

	getTagDriftFollowMode(): "off" | "ask" | "auto" {
		return this.plugin.settings.memoryDeckOrganization?.tagDriftFollowMode || "ask";
	}

	async getBindings(): Promise<FormalDeckBinding[]> {
		try {
			if (
				!this.adapter ||
				typeof this.adapter.exists !== "function" ||
				typeof this.adapter.read !== "function"
			) {
				return [];
			}
			if (!(await this.adapter.exists(this.bindingsPath))) {
				return [];
			}
			const raw = await this.adapter.read(this.bindingsPath);
			const parsed = JSON.parse(raw) as Partial<FormalDeckBindingStore>;
			if (!Array.isArray(parsed.bindings)) {
				return [];
			}
			return parsed.bindings.map((binding) => this.normalizeBinding(binding));
		} catch (error) {
			logger.warn("[EmergentDeckService] 读取正式牌组绑定失败", error);
			return [];
		}
	}

	async hasBindingsForDeck(formalDeckId: string): Promise<boolean> {
		const bindings = await this.getBindings();
		return bindings.some((binding) => binding.formalDeckId === formalDeckId);
	}

	async saveBindings(bindings: FormalDeckBinding[]): Promise<void> {
		await DirectoryUtils.ensureDirRecursive(this.adapter, this.memoryRoot);
		const payload: FormalDeckBindingStore = {
			version: STORE_VERSION,
			bindings: bindings.map((binding) => this.normalizeBinding(binding)),
		};
		await this.adapter.write(this.bindingsPath, JSON.stringify(payload, null, 2));
	}

	async promoteCandidateToDeck(
		candidate: EmergentDeckCandidate,
		formalDeckId: string
	): Promise<FormalDeckBinding> {
		const now = new Date().toISOString();
		const bindings = await this.getBindings();
		const existingIndex = bindings.findIndex(
			(binding) =>
				binding.formalDeckId === formalDeckId && binding.candidateId === String(candidate.id || "")
		);
		const nextBinding: FormalDeckBinding = {
			formalDeckId,
			candidateId: String(candidate.id || ""),
			bindingMode: "stable-weak-sync",
			primaryTagSet: uniqueStrings(candidate.sourceTags.map((tag) => normalizeTag(tag))),
			manualPinnedCardUUIDs: existingIndex >= 0 ? bindings[existingIndex].manualPinnedCardUUIDs || [] : [],
			manualExcludedCardUUIDs:
				existingIndex >= 0 ? bindings[existingIndex].manualExcludedCardUUIDs || [] : [],
			createdAt: existingIndex >= 0 ? bindings[existingIndex].createdAt : now,
			updatedAt: now,
		};

		if (existingIndex >= 0) {
			bindings[existingIndex] = nextBinding;
		} else {
			bindings.push(nextBinding);
		}

		await this.saveBindings(bindings);
		return nextBinding;
	}

	buildRuntime(cards: Card[], decks: Deck[], options?: { minCandidateCardCount?: number }): MemoryDeckOrganizationRuntime {
		const bindings = options ? undefined : undefined;
		void bindings;
		throw new Error("Use buildRuntimeWithBindings instead");
	}

	async buildRuntimeWithBindings(
		cards: Card[],
		decks: Deck[],
		options?: { minCandidateCardCount?: number }
	): Promise<MemoryDeckOrganizationRuntime> {
		const bindings = await this.getBindings();
		return this.buildRuntimeFromBindings(cards, decks, bindings, options);
	}

	buildRuntimeFromBindings(
		cards: Card[],
		decks: Deck[],
		bindings: FormalDeckBinding[],
		options?: { minCandidateCardCount?: number }
	): MemoryDeckOrganizationRuntime {
		const minCount = options?.minCandidateCardCount || this.getMinCandidateCardCount();
		const allTagsByCardUUID = new Map<string, string[]>();
		const tagToCardUUIDs = new Map<string, Set<string>>();
		const tagDisplayName = new Map<string, string>();

		for (const card of cards) {
			const normalizedTags = this.getNormalizedCardTags(card);
			allTagsByCardUUID.set(card.uuid, normalizedTags);
			for (const tag of normalizedTags) {
				const key = normalizeTagKey(tag);
				if (!key || shouldIgnoreTag(tag)) continue;
				if (!tagToCardUUIDs.has(key)) {
					tagToCardUUIDs.set(key, new Set());
					tagDisplayName.set(key, normalizeTag(tag));
				}
				tagToCardUUIDs.get(key)?.add(card.uuid);
			}
		}

		const promotedCandidateIds = new Set(bindings.map((binding) => binding.candidateId));
		const candidates: EmergentDeckCandidate[] = [];

		for (const [tagKey, cardUUIDSet] of tagToCardUUIDs.entries()) {
			if (cardUUIDSet.size < minCount) continue;
			const displayName = tagDisplayName.get(tagKey) || tagKey;
			const candidateId = `tag:${tagKey}`;
			candidates.push({
				id: candidateId,
				name: displayName,
				sourceTags: [displayName],
				cardUUIDs: Array.from(cardUUIDSet).sort(),
				score: cardUUIDSet.size,
				status: promotedCandidateIds.has(candidateId) ? "promoted" : "emergent",
				updatedAt: new Date().toISOString(),
			});
		}

		candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"));
		const emergentDeckViews: MemoryDeckView[] = candidates
			.filter((candidate) => candidate.status !== "ignored")
			.map((candidate) => ({
				id: candidate.id,
				name: candidate.name,
				kind: "emergent",
				statusBadge:
					candidate.status === "promoted"
						? MEMORY_DECK_UI_TEXT.emergentPromoted
						: MEMORY_DECK_UI_TEXT.emergentObserving,
				cardUUIDs: [...candidate.cardUUIDs],
				score: candidate.score,
				sourceTags: [...candidate.sourceTags],
			}));

		const formalDeckIdsByCardUUID: Record<string, string[]> = {};
		const emergentDeckIdsByCardUUID: Record<string, string[]> = {};
		const resolvedDeckRefsByCardUUID: Record<string, ResolvedDeckRef[]> = {};
		const formalDeckSummary: Record<string, FormalDeckBindingSummary> = {};
		const deckNameById = new Map(decks.map((deck) => [deck.id, deck.name] as const));
		const deckLookups = decks.map((deck) => ({
			id: deck.id,
			name: deck.name,
			purpose: deck.purpose,
		}));

		for (const card of cards) {
			const cardTags = new Set(allTagsByCardUUID.get(card.uuid) || []);
			const explicitFormalDeckIds = getCardDeckIds(card, deckLookups, {
				fallbackToReferences: false,
			}).deckIds;
			const matchedEmergentDeckIds: string[] = [];
			formalDeckIdsByCardUUID[card.uuid] = explicitFormalDeckIds;

			for (const binding of bindings) {
				if ((binding.manualExcludedCardUUIDs || []).includes(card.uuid)) {
					continue;
				}

				const matchesPinned = (binding.manualPinnedCardUUIDs || []).includes(card.uuid);
				const matchesTagSet = binding.primaryTagSet.some((tag) => cardTags.has(normalizeTag(tag)));
				if (!matchesPinned && !matchesTagSet) {
					continue;
				}

				const summary = formalDeckSummary[binding.formalDeckId] || {
					bindingCount: 0,
					autoTagNames: [],
					matchedCardCount: 0,
				};
				summary.bindingCount += 1;
				summary.autoTagNames = uniqueStrings([
					...summary.autoTagNames,
					...binding.primaryTagSet.map((tag) => normalizeTag(tag)),
				]);
				summary.matchedCardCount += 1;
				formalDeckSummary[binding.formalDeckId] = summary;
			}

			for (const candidate of candidates) {
				if (candidate.cardUUIDs.includes(card.uuid) && candidate.status !== "ignored") {
					matchedEmergentDeckIds.push(candidate.id);
				}
			}
			emergentDeckIdsByCardUUID[card.uuid] = uniqueStrings(matchedEmergentDeckIds);
		}

		const primaryDeckIdByCardUUID: Record<string, string | undefined> = {};
		for (const card of cards) {
			const formalDeckIds = formalDeckIdsByCardUUID[card.uuid] || [];
			const emergentDeckIds = emergentDeckIdsByCardUUID[card.uuid] || [];
			const resolvedRefs: ResolvedDeckRef[] = [
				...formalDeckIds.map((deckId) => ({
					id: deckId,
					name: deckNameById.get(deckId) || deckId,
					kind: "formal" as const,
				})),
				...emergentDeckIds.map((deckId) => ({
					id: deckId,
					name: candidates.find((candidate) => candidate.id === deckId)?.name || deckId,
					kind: "emergent" as const,
				})),
			];

			primaryDeckIdByCardUUID[card.uuid] = formalDeckIds[0] || undefined;
			const primaryId = primaryDeckIdByCardUUID[card.uuid];
			resolvedDeckRefsByCardUUID[card.uuid] = uniqueDeckRefs(
				resolvedRefs.map((ref) => ({
					...ref,
					isPrimary: ref.id === primaryId,
				}))
			);
		}

		return {
			candidates,
			emergentDeckViews,
			formalDeckIdsByCardUUID,
			emergentDeckIdsByCardUUID,
			resolvedDeckRefsByCardUUID,
			primaryDeckIdByCardUUID,
			formalDeckSummary,
		};
	}

	getResolvedDeckIdsForCard(
		card: Card,
		decks: Deck[],
		runtime?: MemoryDeckOrganizationRuntime
	): string[] {
		const legacy = getCardDeckIds(
			card,
			decks.map((deck) => ({ id: deck.id, name: deck.name, purpose: deck.purpose })),
			{ fallbackToReferences: false }
		);
		const formalDeckIds = runtime?.formalDeckIdsByCardUUID[card.uuid] || [];
		const emergentDeckIds = runtime?.emergentDeckIdsByCardUUID[card.uuid] || [];
		return uniqueStrings([
			...(formalDeckIds.length > 0 ? formalDeckIds : legacy.deckIds || []),
			...emergentDeckIds,
		]);
	}

	getPrimaryDeckIdForCard(
		card: Card,
		decks: Deck[],
		runtime?: MemoryDeckOrganizationRuntime
	): string | undefined {
		if (runtime?.primaryDeckIdByCardUUID[card.uuid]) {
			return runtime.primaryDeckIdByCardUUID[card.uuid];
		}

		return getCardDeckIds(
			card,
			decks.map((deck) => ({ id: deck.id, name: deck.name, purpose: deck.purpose })),
			{ fallbackToReferences: false }
		).primaryDeckId;
	}

	private normalizeBinding(binding: Partial<FormalDeckBinding>): FormalDeckBinding {
		const now = new Date().toISOString();
		return {
			formalDeckId: String(binding.formalDeckId || "").trim(),
			candidateId: String(binding.candidateId || "").trim(),
			bindingMode: "stable-weak-sync",
			primaryTagSet: uniqueStrings((binding.primaryTagSet || []).map((tag) => normalizeTag(tag))),
			manualPinnedCardUUIDs: uniqueStrings(binding.manualPinnedCardUUIDs || []),
			manualExcludedCardUUIDs: uniqueStrings(binding.manualExcludedCardUUIDs || []),
			createdAt: binding.createdAt || now,
			updatedAt: binding.updatedAt || now,
		};
	}

	private getNormalizedCardTags(card: Card): string[] {
		const tags = Array.isArray(card.tags) ? card.tags : [];
		return uniqueStrings(tags.map((tag) => normalizeTag(tag)).filter((tag) => !shouldIgnoreTag(tag)));
	}
}

export function getEmergentDeckService(plugin: Pick<WeavePlugin, "app" | "settings">): EmergentDeckService {
	const existing = SERVICE_INSTANCES.get(plugin.app);
	if (existing) {
		return existing;
	}
	const service = new EmergentDeckService(plugin);
	SERVICE_INSTANCES.set(plugin.app, service);
	return service;
}
