<script lang="ts">
  import { Menu, Notice, normalizePath } from "obsidian";
  import type WeavePlugin from "../../main";
  import { BatchTagSuggestModal, type BatchTagSuggestItem } from "../../modals/BatchTagSuggestModal";
  import { VaultFolderSuggestModal } from "../../modals/VaultFolderSuggestModal";
  import {
    buildTagSuggestionOptions,
    normalizeTagSuggestionOptions,
    normalizeTagSuggestionValue,
  } from "../../utils/tag-suggest";
  import type { EmergentRuleGroup } from "../../services/deck/emergent-rule-groups";
  import {
    appendCreatedEmergentRuleGroupDraftState,
    appendDuplicatedEmergentRuleGroupDraftState,
    appendEmergentRuleGroupSourceFolder,
    appendEmergentRuleGroupTag,
    clearEmergentRuleConditionState,
    createEmergentRuleDraftEditorState,
    getCurrentEmergentRuleGroupDraft as resolveCurrentEmergentRuleGroupDraft,
    getEmergentRuleGroupDisplayName,
    getEmergentRulePrimaryTagField,
    normalizeEmergentRuleGroupsForSave,
    removeEmergentRuleGroupDraftState,
    removeEmergentRuleGroupSourceFolder,
    removeEmergentRuleGroupTag,
    setEmergentRuleConditionVisible as setEmergentRuleConditionVisibleInState,
    switchEmergentRulePrimaryTagCondition,
    updateEmergentRuleGroupDate,
    updateEmergentRuleGroupOnlyLearnable,
    updateEmergentRuleGroupPriority,
    updateEmergentRuleGroupThreshold,
    type EmergentRuleDraftEditorState,
  } from "../../services/deck/emergent-rule-group-drafts";
  import {
    EMERGENT_RULE_ADDABLE_CONDITION_OPTIONS,
    EMERGENT_RULE_CONDITION_FIELD_OPTIONS,
    getEmergentRuleConditionLabel,
    mergeVisibleEmergentRuleConditionKeys,
    type EmergentRuleConditionKey,
    type EmergentRuleTagField,
  } from "../../services/deck/emergent-rule-group-editor";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";

  interface Props {
    plugin: WeavePlugin;
    groups: EmergentRuleGroup[];
    activeRuleGroupId: string;
    isMobile?: boolean;
    onClose: () => void;
    onSave: (groups: EmergentRuleGroup[], activeRuleGroupId: string) => Promise<void> | void;
  }

  type TagField = EmergentRuleTagField;
  type ConditionKey = EmergentRuleConditionKey;

  let {
    plugin,
    groups: initialGroups,
    activeRuleGroupId: initialActiveRuleGroupId,
    isMobile = false,
    onClose,
    onSave,
  }: Props = $props();

  function createInitialDraftState(): EmergentRuleDraftEditorState {
    return createEmergentRuleDraftEditorState(initialGroups, initialActiveRuleGroupId);
  }

  const initialState: EmergentRuleDraftEditorState = createInitialDraftState();

  let draftGroups = $state<EmergentRuleGroup[]>(initialState.groups);
  let activeGroupId = $state<string>(initialState.activeGroupId);
  let primaryTagFieldByGroup = $state<Record<string, TagField>>(initialState.primaryTagFieldByGroup);
  let visibleConditionsByGroup = $state<Record<string, string[]>>(initialState.visibleConditionsByGroup);
  let saving = $state(false);

  let currentGroup = $derived(getCurrentGroup());
  let visibleConditions = $derived(getVisibleConditions(currentGroup.id));
  let primaryTagField = $derived(getPrimaryTagField(currentGroup.id));

  function getAnchorRect(anchor?: HTMLElement | null) {
    if (!anchor) return undefined;
    const rect = anchor.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  function collectAvailableVaultTags(): Array<{ name: string; count: number }> {
    return buildTagSuggestionOptions(plugin.app, [], "memory");
  }

  function getCurrentGroup(): EmergentRuleGroup {
    return resolveCurrentEmergentRuleGroupDraft(draftGroups, activeGroupId);
  }

  function getPrimaryTagField(groupId: string): TagField {
    return getEmergentRulePrimaryTagField(primaryTagFieldByGroup, draftGroups, groupId);
  }

  function getVisibleConditions(groupId: string): ConditionKey[] {
    const group = draftGroups.find((item) => item.id === groupId);
    if (!group) return [];
    return mergeVisibleEmergentRuleConditionKeys(visibleConditionsByGroup[groupId] || [], group);
  }

  function getConditionLabel(conditionKey: ConditionKey): string {
    return getEmergentRuleConditionLabel(conditionKey);
  }

  function getTagOperatorLabel(field: TagField): string {
    return field === "excludedTags" ? "不包含" : "包含任一";
  }

  function getTagPlaceholder(field: TagField): string {
    return field === "excludedTags" ? "选择排除标签" : "选择标签";
  }

  function getGroupDisplayName(group: Partial<EmergentRuleGroup> | null | undefined, index?: number): string {
    return getEmergentRuleGroupDisplayName(group, index);
  }

  function updateName(groupId: string, name: string): void {
    draftGroups = draftGroups.map((group) => (group.id === groupId ? { ...group, name } : group));
  }

  function updateThreshold(groupId: string, value: string): void {
    draftGroups = updateEmergentRuleGroupThreshold(draftGroups, groupId, value);
  }

  function updateDate(groupId: string, field: "createdAfter" | "createdBefore", value: string): void {
    draftGroups = updateEmergentRuleGroupDate(draftGroups, groupId, field, value);
  }

  function updatePriority(groupId: string, field: "priorityMin" | "priorityMax", value: string): void {
    draftGroups = updateEmergentRuleGroupPriority(draftGroups, groupId, field, value);
  }

  function updateOnlyLearnable(groupId: string, value: boolean): void {
    draftGroups = updateEmergentRuleGroupOnlyLearnable(draftGroups, groupId, value);
  }

  function appendTag(groupId: string, field: TagField, tag: string): void {
    draftGroups = appendEmergentRuleGroupTag(draftGroups, groupId, field, tag);
    primaryTagFieldByGroup = { ...primaryTagFieldByGroup, [groupId]: field };
  }

  function removeTag(groupId: string, field: TagField, tag: string): void {
    draftGroups = removeEmergentRuleGroupTag(draftGroups, groupId, field, tag);
  }

  function clearCondition(groupId: string, conditionKey: ConditionKey): void {
    const nextState = clearEmergentRuleConditionState(draftGroups, visibleConditionsByGroup, groupId, conditionKey);
    draftGroups = nextState.groups;
    visibleConditionsByGroup = nextState.visibleConditionsByGroup;
  }

  function setConditionVisible(groupId: string, conditionKey: ConditionKey): void {
    visibleConditionsByGroup = setEmergentRuleConditionVisibleInState(visibleConditionsByGroup, groupId, conditionKey);
  }

  function switchPrimaryTagCondition(groupId: string, targetField: TagField): void {
    const nextState = switchEmergentRulePrimaryTagCondition(
      draftGroups,
      primaryTagFieldByGroup,
      visibleConditionsByGroup,
      groupId,
      targetField
    );
    draftGroups = nextState.groups;
    primaryTagFieldByGroup = nextState.primaryTagFieldByGroup;
    visibleConditionsByGroup = nextState.visibleConditionsByGroup;
  }

  function createGroup(): void {
    const nextState = appendCreatedEmergentRuleGroupDraftState({
      groups: draftGroups,
      activeGroupId,
      primaryTagFieldByGroup,
      visibleConditionsByGroup,
    });
    draftGroups = nextState.groups;
    activeGroupId = nextState.activeGroupId;
    primaryTagFieldByGroup = nextState.primaryTagFieldByGroup;
    visibleConditionsByGroup = nextState.visibleConditionsByGroup;
  }

  function duplicateGroup(groupId: string): void {
    const nextState = appendDuplicatedEmergentRuleGroupDraftState(
      {
        groups: draftGroups,
        activeGroupId,
        primaryTagFieldByGroup,
        visibleConditionsByGroup,
      },
      groupId
    );
    if (!nextState) return;
    draftGroups = nextState.groups;
    activeGroupId = nextState.activeGroupId;
    primaryTagFieldByGroup = nextState.primaryTagFieldByGroup;
    visibleConditionsByGroup = nextState.visibleConditionsByGroup;
  }

  function removeGroup(groupId: string): void {
    const nextState = removeEmergentRuleGroupDraftState(
      {
        groups: draftGroups,
        activeGroupId,
        primaryTagFieldByGroup,
        visibleConditionsByGroup,
      },
      groupId
    );
    if (!nextState) {
      new Notice("至少需要保留一个涌现筛选组", 3000);
      return;
    }
    draftGroups = nextState.groups;
    activeGroupId = nextState.activeGroupId;
    primaryTagFieldByGroup = nextState.primaryTagFieldByGroup;
    visibleConditionsByGroup = nextState.visibleConditionsByGroup;
  }

  function showGroupSwitcherMenu(event: MouseEvent): void {
    const menu = new Menu();
    draftGroups.forEach((group, index) => {
      menu.addItem((item) => {
        item.setTitle(getGroupDisplayName(group, index)).setIcon(group.id === activeGroupId ? "check" : "gallery-vertical").onClick(() => {
          activeGroupId = group.id;
        });
      });
    });
    menu.showAtMouseEvent(event);
  }

  function showGroupMoreMenu(event: MouseEvent, groupId: string): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("复制筛选组").setIcon("copy").onClick(() => duplicateGroup(groupId)));
    menu.addItem((item) => item.setTitle("删除筛选组").setIcon("trash").onClick(() => removeGroup(groupId)));
    menu.showAtMouseEvent(event);
  }

  function showPrimaryTagOperatorMenu(event: MouseEvent, groupId: string): void {
    const activeField = getPrimaryTagField(groupId);
    const menu = new Menu();
    ([
      { field: "requiredTags", title: "包含任一" },
      { field: "excludedTags", title: "不包含" },
    ] as const).forEach((option) => {
      menu.addItem((item) => item.setTitle(option.title).setIcon(activeField === option.field ? "check" : "").onClick(() => switchPrimaryTagCondition(groupId, option.field)));
    });
    menu.showAtMouseEvent(event);
  }

  function showConditionFieldMenu(event: MouseEvent, groupId: string, currentKey: ConditionKey): void {
    const menu = new Menu();
    EMERGENT_RULE_CONDITION_FIELD_OPTIONS.forEach((option) => {
      menu.addItem((item) => item.setTitle(option.title).setIcon(currentKey === option.key ? "check" : option.icon).onClick(() => switchConditionType(groupId, currentKey, option.key)));
    });
    menu.showAtMouseEvent(event);
  }

  function switchConditionType(groupId: string, fromKey: ConditionKey, toKey: ConditionKey): void {
    if (fromKey === toKey) return;
    clearCondition(groupId, fromKey);
    if (toKey === "requiredTags") return switchPrimaryTagCondition(groupId, "requiredTags");
    if (toKey === "excludedTags") return switchPrimaryTagCondition(groupId, "excludedTags");
    setConditionVisible(groupId, toKey);
  }

  function showConditionRowMenu(event: MouseEvent, groupId: string, conditionKey: ConditionKey): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("清空条件").setIcon("eraser").onClick(() => clearCondition(groupId, conditionKey)));
    menu.showAtMouseEvent(event);
  }

  function showAddConditionMenu(event: MouseEvent, groupId: string): void {
    const currentVisible = new Set(getVisibleConditions(groupId));
    const menu = new Menu();
    let hasItem = false;
    EMERGENT_RULE_ADDABLE_CONDITION_OPTIONS.forEach((condition) => {
      if (currentVisible.has(condition.key)) return;
      hasItem = true;
      menu.addItem((item) => item.setTitle(condition.title).setIcon(condition.icon).onClick(() => setConditionVisible(groupId, condition.key)));
    });
    if (!hasItem) {
      new Notice("可添加的条件已经全部显示", 2500);
      return;
    }
    menu.showAtMouseEvent(event);
  }

  function openTagSuggest(groupId: string, field: TagField, anchor?: HTMLElement | null): void {
    const targetGroup = draftGroups.find((group) => group.id === groupId);
    if (!targetGroup) return;
    const existingTags = new Set(
      (targetGroup[field] || [])
        .map((tag) => normalizeTagSuggestionValue(tag).toLowerCase())
        .filter(Boolean)
    );
    const items: BatchTagSuggestItem[] = normalizeTagSuggestionOptions(collectAvailableVaultTags())
      .filter((item) => !existingTags.has(item.key));
    if (items.length === 0) {
      new Notice("没有可添加的标签", 2500);
      return;
    }
    new BatchTagSuggestModal(
      plugin.app,
      items,
      (item) => appendTag(groupId, field, item.tag),
      {
        placeholder: field === "requiredTags" ? "搜索要包含的标签..." : "搜索要排除的标签...",
        anchorRect: isMobile ? undefined : getAnchorRect(anchor),
      }
    ).open();
  }

  async function addSourceFolder(groupId: string, anchor?: HTMLElement | null): Promise<void> {
    const picker = new VaultFolderSuggestModal(plugin.app, {
      placeholder: "选择要观察的来源文件夹",
      anchorRect: isMobile ? undefined : getAnchorRect(anchor),
    });
    const selectedFolder = await picker.openAndSelect();
    if (!selectedFolder) return;
    const normalizedFolder = selectedFolder === "/" ? "/" : normalizePath(selectedFolder);
    draftGroups = appendEmergentRuleGroupSourceFolder(draftGroups, groupId, normalizedFolder);
  }

  function removeSourceFolder(groupId: string, folderPath: string): void {
    draftGroups = removeEmergentRuleGroupSourceFolder(draftGroups, groupId, folderPath);
  }

  async function handleApply(): Promise<void> {
    if (saving) return;
    saving = true;
    const normalizedGroups = normalizeEmergentRuleGroupsForSave(draftGroups);
    try {
      await onSave(normalizedGroups, activeGroupId);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      new Notice(`涌现筛选组保存失败：${message}`, 4000);
    } finally {
      saving = false;
    }
  }
</script>

<div class="weave-emergent-rule-editor" class:is-mobile={isMobile}>
  <div class="weave-emergent-rule-editor__header">
    <div class="weave-emergent-rule-editor__title">涌现筛选组</div>
    <div class="weave-emergent-rule-editor__header-actions">
      <button class="weave-emergent-rule-editor__icon-btn" type="button" onclick={createGroup} aria-label="新增筛选组" title="新增筛选组">
        <ObsidianIcon name="plus" size={16} />
      </button>
    </div>
  </div>

  <div class="weave-emergent-rule-editor__body">
    <div class="weave-emergent-rule-editor__row weave-emergent-rule-editor__group-head">
      <button type="button" class="weave-emergent-rule-editor__switcher weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__group-switcher" onclick={(event) => showGroupSwitcherMenu(event)}>
        <span class="weave-emergent-rule-editor__switcher-label">{getGroupDisplayName(currentGroup)}</span>
        <ObsidianIcon name="chevron-down" size={14} />
      </button>
      <input class="weave-emergent-rule-editor__input weave-emergent-rule-editor__group-name-input" type="text" value={currentGroup.name} placeholder="规则组名称" oninput={(event) => updateName(currentGroup.id, (event.currentTarget as HTMLInputElement).value)} />
      <button class="weave-emergent-rule-editor__icon-btn weave-emergent-rule-editor__group-more-btn" type="button" onclick={(event) => showGroupMoreMenu(event, currentGroup.id)} aria-label="更多" title="更多">
        <ObsidianIcon name="more-horizontal" size={16} />
      </button>
    </div>

    <section class="weave-emergent-rule-editor__card">
      <div class="weave-emergent-rule-editor__section-title">显示门槛</div>
      <div class="weave-emergent-rule-editor__threshold-row">
        <span class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__threshold-label is-static">标签簇卡片数</span>
        <span class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__threshold-operator is-static">至少</span>
        <input class="weave-emergent-rule-editor__inline-input weave-emergent-rule-editor__threshold-input" type="number" min="1" value={currentGroup.minCandidateCardCount} oninput={(event) => updateThreshold(currentGroup.id, (event.currentTarget as HTMLInputElement).value)} />
        <span class="weave-emergent-rule-editor__suffix weave-emergent-rule-editor__threshold-suffix">张</span>
      </div>
    </section>

    <section class="weave-emergent-rule-editor__card">
      <div class="weave-emergent-rule-editor__section-title">候选池过滤</div>
      <div class="weave-emergent-rule-editor__condition-list">
        <div class="weave-emergent-rule-editor__condition-row">
          <span class="weave-emergent-rule-editor__logic-pill">当</span>
          <button type="button" class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__condition-field" onclick={(event) => showConditionFieldMenu(event, currentGroup.id, primaryTagField)}>
            <span>{getConditionLabel(primaryTagField)}</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
          <button type="button" class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__condition-operator" onclick={(event) => showPrimaryTagOperatorMenu(event, currentGroup.id)}>
            <span>{getTagOperatorLabel(primaryTagField)}</span>
            <ObsidianIcon name="chevron-down" size={12} />
          </button>
          <div class="weave-emergent-rule-editor__value-surface weave-emergent-rule-editor__condition-value is-clickable" role="button" tabindex="0" onclick={(event) => openTagSuggest(currentGroup.id, primaryTagField, event.currentTarget as HTMLElement)} onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTagSuggest(currentGroup.id, primaryTagField, event.currentTarget as HTMLElement); } }}>
            {#if currentGroup[primaryTagField].length > 0}
              {#each currentGroup[primaryTagField] as tag (tag)}
                <span class="weave-emergent-rule-editor__chip" class:is-muted={primaryTagField === "excludedTags"}>
                  <span>{tag}</span>
                  <button type="button" class="weave-emergent-rule-editor__chip-remove" onclick={(event) => { event.stopPropagation(); removeTag(currentGroup.id, primaryTagField, tag); }} aria-label={`移除标签 ${tag}`}>
                    <ObsidianIcon name="x" size={12} />
                  </button>
                </span>
              {/each}
            {:else}
              <span class="weave-emergent-rule-editor__placeholder">{getTagPlaceholder(primaryTagField)}</span>
            {/if}
          </div>
          <button type="button" class="weave-emergent-rule-editor__icon-btn is-row" onclick={(event) => showConditionRowMenu(event, currentGroup.id, primaryTagField)} aria-label="更多">
            <ObsidianIcon name="more-horizontal" size={14} />
          </button>
        </div>

        {#if visibleConditions.includes("createdAt")}
          <div class="weave-emergent-rule-editor__condition-row">
            <span class="weave-emergent-rule-editor__logic-pill">与</span>
            <button type="button" class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__condition-field" onclick={(event) => showConditionFieldMenu(event, currentGroup.id, "createdAt")}>
              <span>{getConditionLabel("createdAt")}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
            <span class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__condition-operator is-static">在范围内</span>
            <div class="weave-emergent-rule-editor__split-surface weave-emergent-rule-editor__condition-value">
              <input type="date" value={currentGroup.createdAfter || ""} oninput={(event) => updateDate(currentGroup.id, "createdAfter", (event.currentTarget as HTMLInputElement).value)} />
              <input type="date" value={currentGroup.createdBefore || ""} oninput={(event) => updateDate(currentGroup.id, "createdBefore", (event.currentTarget as HTMLInputElement).value)} />
            </div>
            <button type="button" class="weave-emergent-rule-editor__icon-btn is-row" onclick={(event) => showConditionRowMenu(event, currentGroup.id, "createdAt")} aria-label="更多">
              <ObsidianIcon name="more-horizontal" size={14} />
            </button>
          </div>
        {/if}

        {#if visibleConditions.includes("onlyLearnableDecks")}
          <div class="weave-emergent-rule-editor__condition-row">
            <span class="weave-emergent-rule-editor__logic-pill">与</span>
            <button type="button" class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__condition-field" onclick={(event) => showConditionFieldMenu(event, currentGroup.id, "onlyLearnableDecks")}>
              <span>{getConditionLabel("onlyLearnableDecks")}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
            <span class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__condition-operator is-static">仅显示</span>
            <label class="weave-emergent-rule-editor__toggle-surface weave-emergent-rule-editor__condition-value">
              <input type="checkbox" checked={currentGroup.onlyLearnableDecks} onchange={(event) => updateOnlyLearnable(currentGroup.id, (event.currentTarget as HTMLInputElement).checked)} />
              <span>含有可学习卡片的涌现牌组</span>
            </label>
            <button type="button" class="weave-emergent-rule-editor__icon-btn is-row" onclick={(event) => showConditionRowMenu(event, currentGroup.id, "onlyLearnableDecks")} aria-label="更多">
              <ObsidianIcon name="more-horizontal" size={14} />
            </button>
          </div>
        {/if}

        {#if visibleConditions.includes("sourceFolders")}
          <div class="weave-emergent-rule-editor__condition-row">
            <span class="weave-emergent-rule-editor__logic-pill">与</span>
            <button type="button" class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__condition-field" onclick={(event) => showConditionFieldMenu(event, currentGroup.id, "sourceFolders")}>
              <span>{getConditionLabel("sourceFolders")}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
            <span class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__condition-operator is-static">位于</span>
            <div class="weave-emergent-rule-editor__value-surface weave-emergent-rule-editor__condition-value is-clickable" role="button" tabindex="0" onclick={(event) => void addSourceFolder(currentGroup.id, event.currentTarget as HTMLElement)} onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void addSourceFolder(currentGroup.id, event.currentTarget as HTMLElement); } }}>
              {#if currentGroup.sourceFolders.length > 0}
                {#each currentGroup.sourceFolders as folderPath (folderPath)}
                  <span class="weave-emergent-rule-editor__folder-chip">
                    <span>{folderPath}</span>
                    <button type="button" class="weave-emergent-rule-editor__chip-remove" onclick={(event) => { event.stopPropagation(); removeSourceFolder(currentGroup.id, folderPath); }} aria-label={`移除文件夹 ${folderPath}`}>
                      <ObsidianIcon name="x" size={12} />
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="weave-emergent-rule-editor__placeholder">选择文件夹</span>
              {/if}
            </div>
            <button type="button" class="weave-emergent-rule-editor__icon-btn is-row" onclick={(event) => showConditionRowMenu(event, currentGroup.id, "sourceFolders")} aria-label="更多">
              <ObsidianIcon name="more-horizontal" size={14} />
            </button>
          </div>
        {/if}

        {#if visibleConditions.includes("priority")}
          <div class="weave-emergent-rule-editor__condition-row">
            <span class="weave-emergent-rule-editor__logic-pill">与</span>
            <button type="button" class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__condition-field" onclick={(event) => showConditionFieldMenu(event, currentGroup.id, "priority")}>
              <span>{getConditionLabel("priority")}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
            <span class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__condition-operator is-static">介于</span>
            <div class="weave-emergent-rule-editor__split-surface weave-emergent-rule-editor__condition-value is-number">
              <input type="number" min="0" placeholder="最低" value={currentGroup.priorityMin ?? ""} oninput={(event) => updatePriority(currentGroup.id, "priorityMin", (event.currentTarget as HTMLInputElement).value)} />
              <input type="number" min="0" placeholder="最高" value={currentGroup.priorityMax ?? ""} oninput={(event) => updatePriority(currentGroup.id, "priorityMax", (event.currentTarget as HTMLInputElement).value)} />
            </div>
            <button type="button" class="weave-emergent-rule-editor__icon-btn is-row" onclick={(event) => showConditionRowMenu(event, currentGroup.id, "priority")} aria-label="更多">
              <ObsidianIcon name="more-horizontal" size={14} />
            </button>
          </div>
        {/if}

        {#if visibleConditions.includes("excludedTags") && primaryTagField !== "excludedTags"}
          <div class="weave-emergent-rule-editor__condition-row">
            <span class="weave-emergent-rule-editor__logic-pill">与</span>
            <button type="button" class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__menu-trigger weave-emergent-rule-editor__condition-field" onclick={(event) => showConditionFieldMenu(event, currentGroup.id, "excludedTags")}>
              <span>{getConditionLabel("excludedTags")}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
            <span class="weave-emergent-rule-editor__pill weave-emergent-rule-editor__condition-operator is-static">不包含</span>
            <div class="weave-emergent-rule-editor__value-surface weave-emergent-rule-editor__condition-value is-clickable" role="button" tabindex="0" onclick={(event) => openTagSuggest(currentGroup.id, "excludedTags", event.currentTarget as HTMLElement)} onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTagSuggest(currentGroup.id, "excludedTags", event.currentTarget as HTMLElement); } }}>
              {#if currentGroup.excludedTags.length > 0}
                {#each currentGroup.excludedTags as tag (tag)}
                  <span class="weave-emergent-rule-editor__chip is-muted">
                    <span>{tag}</span>
                    <button type="button" class="weave-emergent-rule-editor__chip-remove" onclick={(event) => { event.stopPropagation(); removeTag(currentGroup.id, "excludedTags", tag); }} aria-label={`移除标签 ${tag}`}>
                      <ObsidianIcon name="x" size={12} />
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="weave-emergent-rule-editor__placeholder">选择排除标签</span>
              {/if}
            </div>
            <button type="button" class="weave-emergent-rule-editor__icon-btn is-row" onclick={(event) => showConditionRowMenu(event, currentGroup.id, "excludedTags")} aria-label="更多">
              <ObsidianIcon name="more-horizontal" size={14} />
            </button>
          </div>
        {/if}
      </div>

      <button type="button" class="weave-emergent-rule-editor__add-condition weave-emergent-rule-editor__menu-trigger" onclick={(event) => showAddConditionMenu(event, currentGroup.id)}>
        <ObsidianIcon name="plus" size={14} />
        <span>添加条件</span>
      </button>
    </section>
  </div>

  <div class="weave-emergent-rule-editor__footer">
    <button type="button" class="weave-emergent-rule-editor__footer-btn" onclick={onClose} disabled={saving}>取消</button>
    <button type="button" class="weave-emergent-rule-editor__footer-btn mod-cta" onclick={() => void handleApply()} disabled={saving}>{saving ? "保存中..." : "保存并应用"}</button>
  </div>
</div>

<style>
  :global(.weave-emergent-rule-group-modal .modal-title),
  :global(.weave-emergent-rule-group-modal .modal-close-button) {
    display: none;
  }

  .weave-emergent-rule-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--background-primary);
  }

  .weave-emergent-rule-editor__header,
  .weave-emergent-rule-editor__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .weave-emergent-rule-editor__footer {
    border-bottom: 0;
    border-top: 1px solid var(--background-modifier-border);
    justify-content: flex-end;
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }

  .weave-emergent-rule-editor__title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .weave-emergent-rule-editor__header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .weave-emergent-rule-editor__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 14px 16px;
  }

  .weave-emergent-rule-editor__group-head,
  .weave-emergent-rule-editor__condition-row,
  .weave-emergent-rule-editor__threshold-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .weave-emergent-rule-editor__group-head {
    margin-bottom: 0;
    align-self: flex-start;
    max-width: 100%;
  }

  .weave-emergent-rule-editor__group-switcher {
    flex: 0 0 auto;
    max-width: 42%;
  }

  .weave-emergent-rule-editor__switcher-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .weave-emergent-rule-editor__group-name-input {
    flex: 1 1 220px;
    width: min(100%, 280px);
    max-width: 280px;
    min-width: 0;
  }

  .weave-emergent-rule-editor__group-more-btn {
    flex: 0 0 auto;
  }

  .weave-emergent-rule-editor__switcher,
  .weave-emergent-rule-editor__icon-btn,
  .weave-emergent-rule-editor__pill,
  .weave-emergent-rule-editor__footer-btn,
  .weave-emergent-rule-editor__add-condition {
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 88%, transparent);
    color: var(--text-normal);
    border-radius: 10px;
    min-height: 36px;
    padding: 0 12px;
    cursor: pointer;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease;
  }

  .weave-emergent-rule-editor__switcher,
  .weave-emergent-rule-editor__pill,
  .weave-emergent-rule-editor__add-condition,
  .weave-emergent-rule-editor__footer-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 14px;
    line-height: 1.2;
    font-weight: 500;
  }

  .weave-emergent-rule-editor__menu-trigger {
    justify-content: space-between;
  }

  .weave-emergent-rule-editor__menu-trigger > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .weave-emergent-rule-editor__icon-btn {
    width: 36px;
    min-height: 36px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .weave-emergent-rule-editor__icon-btn.is-row {
    margin-left: 0;
  }

  .weave-emergent-rule-editor__pill.is-static {
    cursor: default;
  }

  .weave-emergent-rule-editor__logic-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    min-height: 36px;
    padding: 0 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
    color: var(--text-normal);
    font-weight: 600;
  }

  .weave-emergent-rule-editor__card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 12px 13px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
    background: color-mix(in srgb, var(--background-secondary) 60%, transparent);
  }

  .weave-emergent-rule-editor__card + .weave-emergent-rule-editor__card {
    margin-top: 0;
  }

  .weave-emergent-rule-editor__section-title,
  .weave-emergent-rule-editor__suffix,
  .weave-emergent-rule-editor__placeholder {
    font-size: 13px;
    color: var(--text-muted);
  }

  .weave-emergent-rule-editor__section-title {
    font-weight: 600;
    line-height: 1.35;
  }

  .weave-emergent-rule-editor__input,
  .weave-emergent-rule-editor__inline-input,
  .weave-emergent-rule-editor__split-surface input {
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));
    color: var(--text-normal);
    border-radius: 10px;
    min-height: 36px;
    padding: 0 12px;
    box-sizing: border-box;
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease,
      background-color 140ms ease;
  }

  .weave-emergent-rule-editor__input {
    flex: 1 1 240px;
    min-width: 220px;
  }

  .weave-emergent-rule-editor__inline-input {
    width: 84px;
  }

  .weave-emergent-rule-editor__threshold-row {
    flex-wrap: nowrap;
    align-self: flex-start;
    width: auto;
    max-width: 100%;
  }

  .weave-emergent-rule-editor__threshold-label {
    flex: 0 0 auto;
    min-width: 0;
    justify-content: flex-start;
  }

  .weave-emergent-rule-editor__threshold-operator,
  .weave-emergent-rule-editor__threshold-input,
  .weave-emergent-rule-editor__threshold-suffix {
    flex: 0 0 auto;
  }

  .weave-emergent-rule-editor__condition-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .weave-emergent-rule-editor__condition-row {
    gap: 10px;
    padding: 9px 10px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 80%, transparent);
    background: color-mix(in srgb, var(--background-primary) 82%, var(--background-secondary));
    align-self: flex-start;
    max-width: 100%;
  }

  .weave-emergent-rule-editor__condition-field,
  .weave-emergent-rule-editor__condition-operator {
    flex: 0 0 auto;
  }

  .weave-emergent-rule-editor__condition-field {
    min-width: 88px;
  }

  .weave-emergent-rule-editor__condition-operator {
    min-width: 96px;
  }

  .weave-emergent-rule-editor__condition-value {
    flex: 0 1 auto;
    min-width: 0;
    width: auto;
  }

  .weave-emergent-rule-editor__value-surface,
  .weave-emergent-rule-editor__toggle-surface,
  .weave-emergent-rule-editor__split-surface {
    flex: 0 1 auto;
    min-width: 0;
    width: fit-content;
    max-width: min(100%, 300px);
    display: flex;
    align-items: center;
    align-content: flex-start;
    justify-content: flex-start;
    gap: 8px;
    flex-wrap: wrap;
    min-height: 36px;
    padding: 5px 9px;
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 76%, var(--background-secondary));
  }

  .weave-emergent-rule-editor__value-surface.is-clickable {
    cursor: pointer;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease;
  }

  .weave-emergent-rule-editor__switcher:hover,
  .weave-emergent-rule-editor__pill:hover,
  .weave-emergent-rule-editor__icon-btn:hover,
  .weave-emergent-rule-editor__add-condition:hover,
  .weave-emergent-rule-editor__value-surface.is-clickable:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--background-secondary) 76%, var(--interactive-accent) 8%);
  }

  .weave-emergent-rule-editor__switcher:active,
  .weave-emergent-rule-editor__pill:active,
  .weave-emergent-rule-editor__icon-btn:active,
  .weave-emergent-rule-editor__add-condition:active,
  .weave-emergent-rule-editor__value-surface.is-clickable:active {
    transform: scale(0.985);
  }

  .weave-emergent-rule-editor__switcher:focus-visible,
  .weave-emergent-rule-editor__pill:focus-visible,
  .weave-emergent-rule-editor__icon-btn:focus-visible,
  .weave-emergent-rule-editor__add-condition:focus-visible,
  .weave-emergent-rule-editor__input:focus-visible,
  .weave-emergent-rule-editor__inline-input:focus-visible,
  .weave-emergent-rule-editor__split-surface input:focus-visible,
  .weave-emergent-rule-editor__value-surface.is-clickable:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--interactive-accent) 70%, var(--background-modifier-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
  }

  .weave-emergent-rule-editor__toggle-surface input {
    margin: 0;
    accent-color: var(--interactive-accent);
  }

  .weave-emergent-rule-editor__toggle-surface {
    justify-content: flex-start;
  }

  .weave-emergent-rule-editor__toggle-surface span {
    flex: 0 1 auto;
    min-width: 0;
    line-height: 1.35;
  }

  .weave-emergent-rule-editor__split-surface {
    flex-wrap: nowrap;
  }

  .weave-emergent-rule-editor__split-surface input {
    flex: 1 1 132px;
    min-width: 0;
  }

  .weave-emergent-rule-editor__split-surface.is-number input {
    width: 84px;
  }

  .weave-emergent-rule-editor__chip,
  .weave-emergent-rule-editor__folder-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 6px 8px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--text-normal);
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-primary));
  }

  .weave-emergent-rule-editor__chip.is-muted {
    border-color: var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 88%, transparent);
  }

  .weave-emergent-rule-editor__folder-chip {
    border-color: var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 82%, transparent);
  }

  .weave-emergent-rule-editor__chip > span:first-child,
  .weave-emergent-rule-editor__folder-chip > span:first-child {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .weave-emergent-rule-editor__chip-remove {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .weave-emergent-rule-editor__add-condition {
    align-self: flex-start;
    min-width: 132px;
  }

  .weave-emergent-rule-editor__footer-btn.mod-cta {
    background: color-mix(in srgb, var(--interactive-accent) 82%, black 6%);
    color: var(--text-on-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 72%, black 8%);
  }

  .weave-emergent-rule-editor__footer-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  @media (max-width: 720px) {
    .weave-emergent-rule-editor__header,
    .weave-emergent-rule-editor__body,
    .weave-emergent-rule-editor__footer {
      padding-left: 14px;
      padding-right: 14px;
    }

    .weave-emergent-rule-editor__body {
      gap: 10px;
    }

    .weave-emergent-rule-editor__header,
    .weave-emergent-rule-editor__footer {
      flex-wrap: wrap;
    }

    .weave-emergent-rule-editor__footer {
      justify-content: stretch;
    }

    .weave-emergent-rule-editor__footer-btn {
      flex: 1 1 0;
    }

    .weave-emergent-rule-editor__group-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "switcher more"
        "name name";
      gap: 8px;
      align-items: center;
      align-self: stretch;
    }

    .weave-emergent-rule-editor__group-switcher {
      grid-area: switcher;
      width: 100%;
      max-width: none;
      min-width: 0;
      justify-content: flex-start;
      border-radius: 12px;
    }

    .weave-emergent-rule-editor__group-name-input {
      grid-area: name;
      width: 100%;
      flex: 1 1 auto;
      max-width: none;
      min-width: 0;
      min-height: 40px;
    }

    .weave-emergent-rule-editor__group-more-btn {
      grid-area: more;
      width: 40px;
    }

    .weave-emergent-rule-editor__card {
      gap: 8px;
      padding: 12px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--background-secondary) 42%, transparent);
    }

    .weave-emergent-rule-editor__section-title {
      font-size: 12px;
    }

    .weave-emergent-rule-editor__threshold-row {
      gap: 6px;
      align-items: center;
      flex-wrap: nowrap;
      align-self: stretch;
    }

    .weave-emergent-rule-editor__threshold-label {
      display: inline-flex;
      flex: 0 0 auto;
      min-width: 0;
      padding: 0;
      min-height: auto;
      border: 0;
      background: transparent;
      color: var(--text-normal);
      font-weight: 600;
    }

    .weave-emergent-rule-editor__threshold-operator {
      flex: 0 0 auto;
      padding-left: 0;
      padding-right: 0;
      min-height: auto;
      border: 0;
      background: transparent;
      color: var(--text-muted);
    }

    .weave-emergent-rule-editor__threshold-input {
      width: 3ch;
      min-width: 0;
      padding: 0;
      min-height: auto;
      border: 0;
      border-radius: 0;
      background: transparent;
      text-align: center;
      font-size: 15px;
      font-weight: 700;
    }

    .weave-emergent-rule-editor__threshold-suffix {
      flex: 0 0 auto;
      font-size: 12px;
    }

    .weave-emergent-rule-editor__condition-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      row-gap: 8px;
      column-gap: 8px;
      padding: 0;
      border: 0;
      background: transparent;
      align-self: stretch;
    }

    .weave-emergent-rule-editor__logic-pill {
      display: none;
    }

    .weave-emergent-rule-editor__condition-field {
      width: auto;
      flex-basis: auto;
      flex: 0 1 auto;
      min-width: 0;
      justify-content: flex-start;
      max-width: 100%;
    }

    .weave-emergent-rule-editor__condition-operator {
      width: auto;
      flex-basis: auto;
      flex: 0 0 auto;
      min-width: 0;
      justify-content: flex-start;
    }

    .weave-emergent-rule-editor__condition-field,
    .weave-emergent-rule-editor__condition-operator {
      min-height: 28px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      font-size: 13px;
    }

    .weave-emergent-rule-editor__condition-field {
      color: var(--text-normal);
      font-weight: 600;
    }

    .weave-emergent-rule-editor__condition-operator {
      color: var(--text-muted);
      font-weight: 500;
    }

    .weave-emergent-rule-editor__condition-value {
      width: 100%;
      flex-basis: 100%;
      flex: 1 1 100%;
    }

    .weave-emergent-rule-editor__value-surface,
    .weave-emergent-rule-editor__toggle-surface,
    .weave-emergent-rule-editor__split-surface {
      width: 100%;
      flex-basis: 100%;
      max-width: none;
      min-height: 44px;
      padding-top: 8px;
      padding-bottom: 8px;
      border-radius: 12px;
    }

    .weave-emergent-rule-editor__icon-btn.is-row {
      flex: 0 0 auto;
      width: auto;
    }

    .weave-emergent-rule-editor__icon-btn.is-row {
      margin-left: 0;
      width: 28px;
      min-height: 28px;
      border: 0;
      background: transparent;
      color: var(--text-muted);
      margin-left: auto;
    }

    .weave-emergent-rule-editor__toggle-surface {
      align-items: flex-start;
    }

    .weave-emergent-rule-editor__split-surface {
      flex-wrap: wrap;
    }

    .weave-emergent-rule-editor__split-surface.is-number {
      flex-wrap: nowrap;
    }

    .weave-emergent-rule-editor__split-surface input {
      flex: 1 1 132px;
    }

    .weave-emergent-rule-editor__add-condition {
      width: 100%;
      min-width: 0;
      justify-content: center;
      padding-left: 14px;
      padding-right: 14px;
      min-height: 40px;
      border-style: dashed;
      background: color-mix(in srgb, var(--background-primary) 76%, transparent);
    }

    .weave-emergent-rule-editor.is-mobile .weave-emergent-rule-editor__switcher,
    .weave-emergent-rule-editor.is-mobile .weave-emergent-rule-editor__condition-field,
    .weave-emergent-rule-editor.is-mobile .weave-emergent-rule-editor__condition-operator {
      box-shadow: none;
    }

    .weave-emergent-rule-editor.is-mobile .weave-emergent-rule-editor__switcher :global(svg),
    .weave-emergent-rule-editor.is-mobile .weave-emergent-rule-editor__condition-field :global(svg),
    .weave-emergent-rule-editor.is-mobile .weave-emergent-rule-editor__condition-operator :global(svg) {
      display: none;
    }
  }
</style>
