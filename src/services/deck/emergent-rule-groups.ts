export interface EmergentRuleGroup {
	id: string;
	name: string;
	minCandidateCardCount: number;
	onlyLearnableDecks: boolean;
	requiredTags: string[];
	excludedTags: string[];
	sourceFolders: string[];
	priorityMin: number | null;
	priorityMax: number | null;
	createdAfter: string | null;
	createdBefore: string | null;
}

export interface MemoryDeckOrganizationSettingsLike {
	minCandidateCardCount?: number;
	activeRuleGroupId?: string;
	ruleGroups?: Partial<EmergentRuleGroup>[] | undefined;
}

export const DEFAULT_EMERGENT_RULE_GROUP: EmergentRuleGroup = {
	id: "default",
	name: "默认规则组",
	minCandidateCardCount: 2,
	onlyLearnableDecks: false,
	requiredTags: [],
	excludedTags: [],
	sourceFolders: [],
	priorityMin: null,
	priorityMax: null,
	createdAfter: null,
	createdBefore: null,
};

function normalizeStringArray(input: unknown): string[] {
	if (!Array.isArray(input)) return [];

	const seen = new Set<string>();
	return input
		.map((item) => String(item || "").trim())
		.filter((item) => {
			if (!item) return false;
			const normalized = item.replace(/\\/g, "/");
			if (seen.has(normalized)) return false;
			seen.add(normalized);
			return true;
		})
		.map((item) => item.replace(/\\/g, "/"));
}

function normalizeNullableNumber(input: unknown): number | null {
	if (input === null || input === undefined || input === "") {
		return null;
	}

	const value = Number(input);
	if (!Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.floor(value));
}

function normalizeNullableDate(input: unknown): string | null {
	const value = String(input || "").trim();
	if (!value) {
		return null;
	}

	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function normalizeEmergentRuleGroup(
	input: Partial<EmergentRuleGroup> | undefined,
	index = 0,
	fallbackMinCount = DEFAULT_EMERGENT_RULE_GROUP.minCandidateCardCount
): EmergentRuleGroup {
	const trimmedName = String(input?.name || "").trim();
	const minCandidateCardCount = Number(input?.minCandidateCardCount);
	const priorityMin = normalizeNullableNumber(input?.priorityMin);
	const priorityMax = normalizeNullableNumber(input?.priorityMax);

	return {
		id: String(input?.id || "").trim() || `rule-group-${index + 1}`,
		name: trimmedName || `规则组 ${index + 1}`,
		minCandidateCardCount:
			Number.isFinite(minCandidateCardCount) && minCandidateCardCount > 0
				? Math.max(1, Math.floor(minCandidateCardCount))
				: fallbackMinCount,
		onlyLearnableDecks: input?.onlyLearnableDecks === true,
		requiredTags: normalizeStringArray(input?.requiredTags),
		excludedTags: normalizeStringArray(input?.excludedTags),
		sourceFolders: normalizeStringArray(input?.sourceFolders),
		priorityMin,
		priorityMax:
			priorityMax !== null && priorityMin !== null ? Math.max(priorityMin, priorityMax) : priorityMax,
		createdAfter: normalizeNullableDate(input?.createdAfter),
		createdBefore: normalizeNullableDate(input?.createdBefore),
	};
}

export function getNormalizedEmergentRuleGroups(
	settingsLike?: MemoryDeckOrganizationSettingsLike | null
): EmergentRuleGroup[] {
	const fallbackMinCount =
		typeof settingsLike?.minCandidateCardCount === "number" && settingsLike.minCandidateCardCount > 0
			? Math.max(1, Math.floor(settingsLike.minCandidateCardCount))
			: DEFAULT_EMERGENT_RULE_GROUP.minCandidateCardCount;

	const rawGroups = Array.isArray(settingsLike?.ruleGroups) ? settingsLike?.ruleGroups || [] : [];
	if (rawGroups.length === 0) {
		return [
			{
				...DEFAULT_EMERGENT_RULE_GROUP,
				minCandidateCardCount: fallbackMinCount,
			},
		];
	}

	const seen = new Set<string>();
	const normalized = rawGroups
		.map((group, index) => normalizeEmergentRuleGroup(group, index, fallbackMinCount))
		.filter((group) => {
			if (seen.has(group.id)) return false;
			seen.add(group.id);
			return true;
		});

	return normalized.length > 0
		? normalized
		: [
				{
					...DEFAULT_EMERGENT_RULE_GROUP,
					minCandidateCardCount: fallbackMinCount,
				},
		  ];
}

export function getActiveEmergentRuleGroup(
	settingsLike?: MemoryDeckOrganizationSettingsLike | null
): EmergentRuleGroup {
	const groups = getNormalizedEmergentRuleGroups(settingsLike);
	const activeId = String(settingsLike?.activeRuleGroupId || "").trim();
	return groups.find((group) => group.id === activeId) || groups[0];
}

export function countEmergentRuleConditions(group: EmergentRuleGroup): number {
	let count = 0;
	if (group.requiredTags.length > 0) count += 1;
	if (group.excludedTags.length > 0) count += 1;
	if (group.sourceFolders.length > 0) count += 1;
	if (group.priorityMin !== null || group.priorityMax !== null) count += 1;
	if (group.createdAfter || group.createdBefore) count += 1;
	if (group.minCandidateCardCount !== DEFAULT_EMERGENT_RULE_GROUP.minCandidateCardCount) count += 1;
	if (group.onlyLearnableDecks) count += 1;
	return count;
}
