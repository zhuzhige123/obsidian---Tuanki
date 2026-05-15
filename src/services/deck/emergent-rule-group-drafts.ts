import { DEFAULT_EMERGENT_RULE_GROUP, type EmergentRuleGroup } from "./emergent-rule-groups";
import {
	buildVisibleEmergentRuleConditionKeys,
	type EmergentRuleConditionKey,
	type EmergentRuleTagField,
} from "./emergent-rule-group-editor";

export interface EmergentRuleDraftConditionState {
	groups: EmergentRuleGroup[];
	visibleConditionsByGroup: Record<string, string[]>;
}

export interface EmergentRuleDraftEditorState {
	groups: EmergentRuleGroup[];
	activeGroupId: string;
	primaryTagFieldByGroup: Record<string, EmergentRuleTagField>;
	visibleConditionsByGroup: Record<string, string[]>;
}

export function cloneEmergentRuleGroups(groups: EmergentRuleGroup[]): EmergentRuleGroup[] {
	return (groups.length > 0 ? groups : [DEFAULT_EMERGENT_RULE_GROUP]).map((group) => ({
		...group,
		requiredTags: [...(group.requiredTags || [])],
		excludedTags: [...(group.excludedTags || [])],
		sourceFolders: [...(group.sourceFolders || [])],
	}));
}

export function getEmergentRuleGroupDisplayName(
	group: Partial<EmergentRuleGroup> | null | undefined,
	index?: number
): string {
	const name = String(group?.name || "").trim();
	if (name) return name;
	return typeof index === "number" ? `规则组 ${index + 1}` : "默认规则组";
}

export function getCurrentEmergentRuleGroupDraft(
	groups: EmergentRuleGroup[],
	activeGroupId: string
): EmergentRuleGroup {
	return groups.find((group) => group.id === activeGroupId) || groups[0] || DEFAULT_EMERGENT_RULE_GROUP;
}

export function buildEmergentRulePrimaryTagFieldMap(
	groups: EmergentRuleGroup[]
): Record<string, EmergentRuleTagField> {
	return Object.fromEntries(
		groups.map((group) => [
			group.id,
			group.requiredTags.length === 0 && group.excludedTags.length > 0 ? "excludedTags" : "requiredTags",
		])
	);
}

export function getEmergentRulePrimaryTagField(
	primaryTagFieldByGroup: Record<string, EmergentRuleTagField>,
	groups: EmergentRuleGroup[],
	groupId: string
): EmergentRuleTagField {
	const selected = primaryTagFieldByGroup[groupId];
	if (selected === "requiredTags" || selected === "excludedTags") {
		return selected;
	}
	const group = groups.find((item) => item.id === groupId);
	if (!group) return "requiredTags";
	return group.requiredTags.length === 0 && group.excludedTags.length > 0 ? "excludedTags" : "requiredTags";
}

export function buildEmergentRuleVisibleConditionsMap(
	groups: EmergentRuleGroup[]
): Record<string, string[]> {
	return Object.fromEntries(groups.map((group) => [group.id, buildVisibleEmergentRuleConditionKeys(group)]));
}

export function createEmergentRuleDraftEditorState(
	groups: EmergentRuleGroup[],
	activeGroupId: string
): EmergentRuleDraftEditorState {
	const normalizedGroups = cloneEmergentRuleGroups(groups);
	const normalizedActiveGroupId =
		String(activeGroupId || "").trim() || normalizedGroups[0]?.id || DEFAULT_EMERGENT_RULE_GROUP.id;
	return {
		groups: normalizedGroups,
		activeGroupId: normalizedActiveGroupId,
		primaryTagFieldByGroup: buildEmergentRulePrimaryTagFieldMap(normalizedGroups),
		visibleConditionsByGroup: buildEmergentRuleVisibleConditionsMap(normalizedGroups),
	};
}

export function createEmergentRuleGroupDraft(groups: EmergentRuleGroup[]): EmergentRuleGroup {
	const nextIndex = groups.length + 1;
	return {
		id: `rule-group-${Date.now()}`,
		name: `规则组 ${nextIndex}`,
		minCandidateCardCount:
			groups[groups.length - 1]?.minCandidateCardCount || DEFAULT_EMERGENT_RULE_GROUP.minCandidateCardCount,
		onlyLearnableDecks: false,
		requiredTags: [],
		excludedTags: [],
		sourceFolders: [],
		priorityMin: null,
		priorityMax: null,
		createdAfter: null,
		createdBefore: null,
	};
}

export function appendCreatedEmergentRuleGroupDraftState(
	state: EmergentRuleDraftEditorState
): EmergentRuleDraftEditorState {
	const newGroup = createEmergentRuleGroupDraft(state.groups);
	return {
		groups: [...state.groups, newGroup],
		activeGroupId: newGroup.id,
		primaryTagFieldByGroup: { ...state.primaryTagFieldByGroup, [newGroup.id]: "requiredTags" },
		visibleConditionsByGroup: { ...state.visibleConditionsByGroup, [newGroup.id]: [] },
	};
}

export function appendDuplicatedEmergentRuleGroupDraftState(
	state: EmergentRuleDraftEditorState,
	groupId: string
): EmergentRuleDraftEditorState | null {
	const nextGroup = duplicateEmergentRuleGroupDraft(state.groups, groupId);
	if (!nextGroup) return null;
	const primaryTagField = getEmergentRulePrimaryTagField(state.primaryTagFieldByGroup, state.groups, groupId);
	return {
		groups: [...state.groups, nextGroup],
		activeGroupId: nextGroup.id,
		primaryTagFieldByGroup: { ...state.primaryTagFieldByGroup, [nextGroup.id]: primaryTagField },
		visibleConditionsByGroup: {
			...state.visibleConditionsByGroup,
			[nextGroup.id]: [...buildVisibleEmergentRuleConditionKeys(nextGroup)],
		},
	};
}

export function removeEmergentRuleGroupDraftState(
	state: EmergentRuleDraftEditorState,
	groupId: string
): EmergentRuleDraftEditorState | null {
	if (state.groups.length <= 1) {
		return null;
	}
	const nextGroups = state.groups.filter((group) => group.id !== groupId);
	const { [groupId]: _removedPrimary, ...nextPrimary } = state.primaryTagFieldByGroup;
	const { [groupId]: _removedVisible, ...nextVisible } = state.visibleConditionsByGroup;
	return {
		groups: nextGroups,
		activeGroupId:
			state.activeGroupId === groupId ? nextGroups[0]?.id || DEFAULT_EMERGENT_RULE_GROUP.id : state.activeGroupId,
		primaryTagFieldByGroup: nextPrimary,
		visibleConditionsByGroup: nextVisible,
	};
}

export function duplicateEmergentRuleGroupDraft(
	groups: EmergentRuleGroup[],
	groupId: string
): EmergentRuleGroup | null {
	const sourceGroup = groups.find((group) => group.id === groupId);
	if (!sourceGroup) return null;
	return {
		...sourceGroup,
		id: `rule-group-${Date.now()}`,
		name: `${sourceGroup.name || "规则组"} 副本`,
		requiredTags: [...sourceGroup.requiredTags],
		excludedTags: [...sourceGroup.excludedTags],
		sourceFolders: [...sourceGroup.sourceFolders],
	};
}

export function setEmergentRuleConditionVisible(
	visibleConditionsByGroup: Record<string, string[]>,
	groupId: string,
	conditionKey: EmergentRuleConditionKey
): Record<string, string[]> {
	const next = new Set<EmergentRuleConditionKey>((visibleConditionsByGroup[groupId] || []) as EmergentRuleConditionKey[]);
	next.add(conditionKey);
	return {
		...visibleConditionsByGroup,
		[groupId]: Array.from(next),
	};
}

export function hideEmergentRuleCondition(
	visibleConditionsByGroup: Record<string, string[]>,
	groupId: string,
	conditionKey: EmergentRuleConditionKey
): Record<string, string[]> {
	const next = new Set<EmergentRuleConditionKey>((visibleConditionsByGroup[groupId] || []) as EmergentRuleConditionKey[]);
	next.delete(conditionKey);
	return {
		...visibleConditionsByGroup,
		[groupId]: Array.from(next),
	};
}

export function normalizeEmergentRuleTagLabel(raw: string): string {
	return String(raw || "").replace(/^#/, "").trim();
}

export function mergeUniqueEmergentRuleTags(...lists: string[][]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	lists.forEach((list) => {
		list.forEach((tag) => {
			const normalized = normalizeEmergentRuleTagLabel(tag);
			if (!normalized || seen.has(normalized)) return;
			seen.add(normalized);
			merged.push(normalized);
		});
	});
	return merged;
}

export function updateEmergentRuleGroupThreshold(
	groups: EmergentRuleGroup[],
	groupId: string,
	value: string
): EmergentRuleGroup[] {
	const parsed = Number(value);
	return groups.map((group) =>
		group.id === groupId
			? {
					...group,
					minCandidateCardCount:
						Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 1,
			  }
			: group
	);
}

export function updateEmergentRuleGroupName(
	groups: EmergentRuleGroup[],
	groupId: string,
	name: string
): EmergentRuleGroup[] {
	return groups.map((group) => (group.id === groupId ? { ...group, name } : group));
}

export function updateEmergentRuleGroupDate(
	groups: EmergentRuleGroup[],
	groupId: string,
	field: "createdAfter" | "createdBefore",
	value: string
): EmergentRuleGroup[] {
	const nextValue = String(value || "").trim() || null;
	return groups.map((group) => (group.id === groupId ? { ...group, [field]: nextValue } : group));
}

export function updateEmergentRuleGroupPriority(
	groups: EmergentRuleGroup[],
	groupId: string,
	field: "priorityMin" | "priorityMax",
	value: string
): EmergentRuleGroup[] {
	const trimmed = String(value || "").trim();
	const parsed = trimmed === "" ? null : Number(trimmed);
	return groups.map((group) =>
		group.id === groupId
			? { ...group, [field]: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed as number)) : null }
			: group
	);
}

export function updateEmergentRuleGroupOnlyLearnable(
	groups: EmergentRuleGroup[],
	groupId: string,
	value: boolean
): EmergentRuleGroup[] {
	return groups.map((group) => (group.id === groupId ? { ...group, onlyLearnableDecks: value } : group));
}

export function appendEmergentRuleGroupTag(
	groups: EmergentRuleGroup[],
	groupId: string,
	field: EmergentRuleTagField,
	tag: string
): EmergentRuleGroup[] {
	const normalizedTag = normalizeEmergentRuleTagLabel(tag);
	if (!normalizedTag) return groups;
	return groups.map((group) => {
		if (group.id !== groupId) return group;
		const currentTags = group[field] || [];
		if (currentTags.includes(normalizedTag)) return group;
		return {
			...group,
			[field]: [...currentTags, normalizedTag],
		};
	});
}

export function removeEmergentRuleGroupTag(
	groups: EmergentRuleGroup[],
	groupId: string,
	field: EmergentRuleTagField,
	tag: string
): EmergentRuleGroup[] {
	return groups.map((group) =>
		group.id === groupId ? { ...group, [field]: group[field].filter((item) => item !== tag) } : group
	);
}

export function clearEmergentRuleConditionInGroups(
	groups: EmergentRuleGroup[],
	groupId: string,
	conditionKey: EmergentRuleConditionKey
): EmergentRuleGroup[] {
	return groups.map((group) => {
		if (group.id !== groupId) return group;
		if (conditionKey === "requiredTags") return { ...group, requiredTags: [] };
		if (conditionKey === "excludedTags") return { ...group, excludedTags: [] };
		if (conditionKey === "sourceFolders") return { ...group, sourceFolders: [] };
		if (conditionKey === "createdAt") return { ...group, createdAfter: null, createdBefore: null };
		if (conditionKey === "onlyLearnableDecks") return { ...group, onlyLearnableDecks: false };
		return { ...group, priorityMin: null, priorityMax: null };
	});
}

export function clearEmergentRuleConditionState(
	groups: EmergentRuleGroup[],
	visibleConditionsByGroup: Record<string, string[]>,
	groupId: string,
	conditionKey: EmergentRuleConditionKey
): EmergentRuleDraftConditionState {
	const nextGroups = clearEmergentRuleConditionInGroups(groups, groupId, conditionKey);
	if (conditionKey === "requiredTags") {
		return {
			groups: nextGroups,
			visibleConditionsByGroup,
		};
	}
	return {
		groups: nextGroups,
		visibleConditionsByGroup: hideEmergentRuleCondition(visibleConditionsByGroup, groupId, conditionKey),
	};
}

export function switchEmergentRulePrimaryTagCondition(
	groups: EmergentRuleGroup[],
	primaryTagFieldByGroup: Record<string, EmergentRuleTagField>,
	visibleConditionsByGroup: Record<string, string[]>,
	groupId: string,
	targetField: EmergentRuleTagField
): EmergentRuleDraftEditorState {
	const currentField = getEmergentRulePrimaryTagField(primaryTagFieldByGroup, groups, groupId);
	if (currentField === targetField) {
		return {
			groups,
			activeGroupId: groupId,
			primaryTagFieldByGroup: { ...primaryTagFieldByGroup, [groupId]: targetField },
			visibleConditionsByGroup,
		};
	}

	const nextGroups = groups.map((group) => {
		if (group.id !== groupId) return group;
		if (targetField === "excludedTags") {
			return {
				...group,
				requiredTags: [],
				excludedTags: mergeUniqueEmergentRuleTags(group.excludedTags, group.requiredTags),
			};
		}
		return {
			...group,
			requiredTags: mergeUniqueEmergentRuleTags(group.requiredTags, group.excludedTags),
			excludedTags: [],
		};
	});

	return {
		groups: nextGroups,
		activeGroupId: groupId,
		primaryTagFieldByGroup: { ...primaryTagFieldByGroup, [groupId]: targetField },
		visibleConditionsByGroup:
			targetField === "excludedTags"
				? setEmergentRuleConditionVisible(visibleConditionsByGroup, groupId, "excludedTags")
				: hideEmergentRuleCondition(visibleConditionsByGroup, groupId, "excludedTags"),
	};
}

export function appendEmergentRuleGroupSourceFolder(
	groups: EmergentRuleGroup[],
	groupId: string,
	folderPath: string
): EmergentRuleGroup[] {
	return groups.map((group) => {
		if (group.id !== groupId) return group;
		if (group.sourceFolders.includes(folderPath)) return group;
		return {
			...group,
			sourceFolders: [...group.sourceFolders, folderPath],
		};
	});
}

export function removeEmergentRuleGroupSourceFolder(
	groups: EmergentRuleGroup[],
	groupId: string,
	folderPath: string
): EmergentRuleGroup[] {
	return groups.map((group) =>
		group.id === groupId
			? {
					...group,
					sourceFolders: group.sourceFolders.filter((folder) => folder !== folderPath),
			  }
			: group
	);
}

export function normalizeEmergentRuleGroupsForSave(groups: EmergentRuleGroup[]): EmergentRuleGroup[] {
	return groups.map((group, index) => ({
		...group,
		name: String(group.name || "").trim() || `规则组 ${index + 1}`,
		minCandidateCardCount: Math.max(1, Math.floor(group.minCandidateCardCount || 1)),
		onlyLearnableDecks: group.onlyLearnableDecks === true,
		requiredTags: [...(group.requiredTags || [])],
		excludedTags: [...(group.excludedTags || [])],
		sourceFolders: [...(group.sourceFolders || [])],
		priorityMin: group.priorityMin ?? null,
		priorityMax:
			group.priorityMax !== null && group.priorityMin !== null
				? Math.max(group.priorityMin, group.priorityMax)
				: group.priorityMax ?? null,
		createdAfter: group.createdAfter || null,
		createdBefore: group.createdBefore || null,
	}));
}
