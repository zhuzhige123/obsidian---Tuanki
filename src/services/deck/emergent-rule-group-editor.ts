import type { EmergentRuleGroup } from "./emergent-rule-groups";

export type EmergentRuleTagField = "requiredTags" | "excludedTags";
export type EmergentRuleConditionKey =
	| EmergentRuleTagField
	| "sourceFolders"
	| "createdAt"
	| "priority"
	| "onlyLearnableDecks";

export interface EmergentRuleConditionOption {
	key: EmergentRuleConditionKey;
	title: string;
	icon: string;
}

const EMERGENT_RULE_CONDITION_KEY_SET = new Set<EmergentRuleConditionKey>([
	"requiredTags",
	"excludedTags",
	"sourceFolders",
	"createdAt",
	"priority",
	"onlyLearnableDecks",
]);

export const EMERGENT_RULE_CONDITION_FIELD_OPTIONS: readonly EmergentRuleConditionOption[] = [
	{ key: "requiredTags", title: "标签（包含任一）", icon: "tag" },
	{ key: "excludedTags", title: "标签（不包含）", icon: "minus-circle" },
	{ key: "onlyLearnableDecks", title: "卡片状态", icon: "check-circle" },
	{ key: "sourceFolders", title: "来源文件夹", icon: "folder-open" },
	{ key: "createdAt", title: "创建时间", icon: "calendar" },
	{ key: "priority", title: "优先级", icon: "list-ordered" },
] as const;

export const EMERGENT_RULE_ADDABLE_CONDITION_OPTIONS: readonly EmergentRuleConditionOption[] = [
	{ key: "excludedTags", title: "排除标签", icon: "minus-circle" },
	{ key: "onlyLearnableDecks", title: "卡片状态", icon: "check-circle" },
	{ key: "sourceFolders", title: "来源文件夹", icon: "folder-open" },
	{ key: "createdAt", title: "创建时间", icon: "calendar" },
	{ key: "priority", title: "优先级", icon: "list-ordered" },
] as const;

export function isEmergentRuleConditionKey(value: string): value is EmergentRuleConditionKey {
	return EMERGENT_RULE_CONDITION_KEY_SET.has(value as EmergentRuleConditionKey);
}

export function normalizeEmergentRuleConditionKeys(
	input: readonly string[] | undefined | null
): EmergentRuleConditionKey[] {
	const normalized: EmergentRuleConditionKey[] = [];
	const seen = new Set<EmergentRuleConditionKey>();
	for (const rawKey of input || []) {
		if (!isEmergentRuleConditionKey(String(rawKey || ""))) continue;
		const key = rawKey as EmergentRuleConditionKey;
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(key);
	}
	return normalized;
}

export function buildVisibleEmergentRuleConditionKeys(
	group: Pick<
		EmergentRuleGroup,
		"excludedTags" | "sourceFolders" | "createdAfter" | "createdBefore" | "priorityMin" | "priorityMax" | "onlyLearnableDecks"
	>
): EmergentRuleConditionKey[] {
	const visible: EmergentRuleConditionKey[] = [];
	if (group.excludedTags.length > 0) visible.push("excludedTags");
	if (group.sourceFolders.length > 0) visible.push("sourceFolders");
	if (group.createdAfter || group.createdBefore) visible.push("createdAt");
	if (group.priorityMin !== null || group.priorityMax !== null) visible.push("priority");
	if (group.onlyLearnableDecks) visible.push("onlyLearnableDecks");
	return visible;
}

export function mergeVisibleEmergentRuleConditionKeys(
	input: readonly string[] | undefined | null,
	group: Pick<
		EmergentRuleGroup,
		"excludedTags" | "sourceFolders" | "createdAfter" | "createdBefore" | "priorityMin" | "priorityMax" | "onlyLearnableDecks"
	>
): EmergentRuleConditionKey[] {
	const visible = new Set<EmergentRuleConditionKey>(normalizeEmergentRuleConditionKeys(input));
	for (const key of buildVisibleEmergentRuleConditionKeys(group)) {
		visible.add(key);
	}
	return Array.from(visible);
}

export function getEmergentRuleConditionLabel(conditionKey: EmergentRuleConditionKey): string {
	if (conditionKey === "requiredTags" || conditionKey === "excludedTags") return "标签";
	if (conditionKey === "sourceFolders") return "来源文件夹";
	if (conditionKey === "createdAt") return "创建时间";
	if (conditionKey === "priority") return "优先级";
	return "卡片状态";
}
