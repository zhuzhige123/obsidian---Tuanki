<script lang="ts">
  import type { EmergentRuleGroup } from '../../services/deck/emergent-rule-groups';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface Props {
    groups: EmergentRuleGroup[];
    activeRuleGroupId: string;
    onClose: () => void;
    onSave: (groups: EmergentRuleGroup[]) => void;
    onCreateGroup: () => void;
  }

  let {
    groups = $bindable(),
    activeRuleGroupId = $bindable(),
    onClose,
    onSave,
    onCreateGroup
  }: Props = $props();

  let currentGroup = $derived(groups.find(g => g.id === activeRuleGroupId) || groups[0]);
  let visibleConditions = $state<string[]>(['requiredTags']);

  function handleSave() {
    onSave(groups);
    onClose();
  }

  function handleCancel() {
    onClose();
  }

  function updateGroupName(value: string) {
    if (currentGroup) {
      currentGroup.name = value;
    }
  }

  function updateMinCandidateCount(value: string) {
    if (currentGroup) {
      currentGroup.minCandidateCardCount = parseInt(value) || 5;
    }
  }

  function updateOnlyLearnableDecks(value: boolean) {
    if (currentGroup) {
      currentGroup.onlyLearnableDecks = value;
    }
  }

  function updateCreatedAfter(value: string) {
    if (currentGroup) {
      currentGroup.createdAfter = value;
    }
  }

  function updateCreatedBefore(value: string) {
    if (currentGroup) {
      currentGroup.createdBefore = value;
    }
  }

  function updatePriorityMin(value: string) {
    if (currentGroup) {
      currentGroup.priorityMin = value ? parseInt(value) : null;
    }
  }

  function updatePriorityMax(value: string) {
    if (currentGroup) {
      currentGroup.priorityMax = value ? parseInt(value) : null;
    }
  }

  function removeRequiredTag(tag: string) {
    if (currentGroup) {
      currentGroup.requiredTags = currentGroup.requiredTags.filter(t => t !== tag);
    }
  }

  function removeExcludedTag(tag: string) {
    if (currentGroup) {
      currentGroup.excludedTags = currentGroup.excludedTags.filter(t => t !== tag);
    }
  }

  function removeSourceFolder(folder: string) {
    if (currentGroup) {
      currentGroup.sourceFolders = currentGroup.sourceFolders.filter(f => f !== folder);
    }
  }

  function toggleCondition(condition: string) {
    if (visibleConditions.includes(condition)) {
      visibleConditions = visibleConditions.filter(c => c !== condition);
    } else {
      visibleConditions = [...visibleConditions, condition];
    }
  }

  function switchGroup(groupId: string) {
    activeRuleGroupId = groupId;
  }
</script>

<div class="mobile-emergent-modal">
  <header class="mobile-emergent-modal__header">
    <button class="mobile-emergent-modal__back-btn" type="button" onclick={handleCancel}>
      <ObsidianIcon name="arrow-left" size={20} />
    </button>
    <h1 class="mobile-emergent-modal__title">涌现筛选组</h1>
    <button class="mobile-emergent-modal__add-btn" type="button" onclick={onCreateGroup}>
      <ObsidianIcon name="plus" size={20} />
    </button>
  </header>

  <div class="mobile-emergent-modal__body">
    <!-- 规则组选择器 -->
    <div class="mobile-emergent-modal__group-selector">
      <select
        class="mobile-emergent-modal__select"
        value={activeRuleGroupId}
        onchange={(e) => switchGroup((e.currentTarget as HTMLSelectElement).value)}
      >
        {#each groups as group (group.id)}
          <option value={group.id}>{group.name || "默认观察"}</option>
        {/each}
      </select>
    </div>

    <!-- 配置卡片 -->
    <div class="mobile-emergent-modal__config">
      <!-- 基本信息 -->
      <div class="mobile-emergent-modal__card">
        <div class="mobile-emergent-modal__field">
          <label class="mobile-emergent-modal__label" for="mobile-emergent-group-name">规则组名称</label>
          <input
            id="mobile-emergent-group-name"
            type="text"
            class="mobile-emergent-modal__input"
            value={currentGroup?.name || ""}
            oninput={(e) => updateGroupName((e.currentTarget as HTMLInputElement).value)}
            placeholder="默认观察"
          />
        </div>

        <div class="mobile-emergent-modal__field">
          <label class="mobile-emergent-modal__label" for="mobile-emergent-min-candidate-count">最小候选卡片数</label>
          <input
            id="mobile-emergent-min-candidate-count"
            type="number"
            class="mobile-emergent-modal__input"
            min="1"
            value={currentGroup?.minCandidateCardCount || 5}
            oninput={(e) => updateMinCandidateCount((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="mobile-emergent-modal__field">
          <div class="mobile-emergent-modal__label">仅显示有可学卡片的牌组</div>
          <label class="mobile-emergent-modal__toggle">
            <input
              type="checkbox"
              checked={currentGroup?.onlyLearnableDecks === true}
              onchange={(e) => updateOnlyLearnableDecks((e.currentTarget as HTMLInputElement).checked)}
            />
            <span>开启后自动隐藏无可学卡片的候选牌组</span>
          </label>
        </div>
      </div>

      <!-- 必需标签 -->
      <div class="mobile-emergent-modal__card">
        <div class="mobile-emergent-modal__field">
          <div class="mobile-emergent-modal__label">必需标签（包含任一）</div>
          <div class="mobile-emergent-modal__tag-list">
            {#if currentGroup?.requiredTags && currentGroup.requiredTags.length > 0}
              {#each currentGroup.requiredTags as tag (tag)}
                <span class="mobile-emergent-modal__tag">
                  {tag}
                  <button
                    type="button"
                    class="mobile-emergent-modal__tag-remove"
                    onclick={() => removeRequiredTag(tag)}
                  >
                    <ObsidianIcon name="x" size={12} />
                  </button>
                </span>
              {/each}
            {:else}
              <span class="mobile-emergent-modal__placeholder">点击添加标签</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- 可选条件 -->
      {#if visibleConditions.includes('createdAt')}
        <div class="mobile-emergent-modal__card">
          <div class="mobile-emergent-modal__field">
            <div class="mobile-emergent-modal__label">创建时间范围</div>
            <div class="mobile-emergent-modal__date-range">
              <input
                type="date"
                class="mobile-emergent-modal__input"
                value={currentGroup?.createdAfter || ""}
                oninput={(e) => updateCreatedAfter((e.currentTarget as HTMLInputElement).value)}
              />
              <span class="mobile-emergent-modal__range-divider">至</span>
              <input
                type="date"
                class="mobile-emergent-modal__input"
                value={currentGroup?.createdBefore || ""}
                oninput={(e) => updateCreatedBefore((e.currentTarget as HTMLInputElement).value)}
              />
            </div>
          </div>
        </div>
      {/if}

      {#if visibleConditions.includes('priority')}
        <div class="mobile-emergent-modal__card">
          <div class="mobile-emergent-modal__field">
            <div class="mobile-emergent-modal__label">优先级范围</div>
            <div class="mobile-emergent-modal__priority-range">
              <input
                type="number"
                class="mobile-emergent-modal__input"
                min="0"
                placeholder="最低"
                value={currentGroup?.priorityMin ?? ""}
                oninput={(e) => updatePriorityMin((e.currentTarget as HTMLInputElement).value)}
              />
              <span class="mobile-emergent-modal__range-divider">至</span>
              <input
                type="number"
                class="mobile-emergent-modal__input"
                min="0"
                placeholder="最高"
                value={currentGroup?.priorityMax ?? ""}
                oninput={(e) => updatePriorityMax((e.currentTarget as HTMLInputElement).value)}
              />
            </div>
          </div>
        </div>
      {/if}

      {#if visibleConditions.includes('excludedTags')}
        <div class="mobile-emergent-modal__card">
          <div class="mobile-emergent-modal__field">
            <div class="mobile-emergent-modal__label">排除标签</div>
            <div class="mobile-emergent-modal__tag-list">
              {#if currentGroup?.excludedTags && currentGroup.excludedTags.length > 0}
                {#each currentGroup.excludedTags as tag (tag)}
                  <span class="mobile-emergent-modal__tag is-muted">
                    {tag}
                    <button
                      type="button"
                      class="mobile-emergent-modal__tag-remove"
                      onclick={() => removeExcludedTag(tag)}
                    >
                      <ObsidianIcon name="x" size={12} />
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="mobile-emergent-modal__placeholder">点击添加排除标签</span>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      {#if visibleConditions.includes('sourceFolders')}
        <div class="mobile-emergent-modal__card">
          <div class="mobile-emergent-modal__field">
            <div class="mobile-emergent-modal__label">来源文件夹</div>
            <div class="mobile-emergent-modal__folder-list">
              {#if currentGroup?.sourceFolders && currentGroup.sourceFolders.length > 0}
                {#each currentGroup.sourceFolders as folder (folder)}
                  <span class="mobile-emergent-modal__folder">
                    {folder}
                    <button
                      type="button"
                      class="mobile-emergent-modal__folder-remove"
                      onclick={() => removeSourceFolder(folder)}
                    >
                      <ObsidianIcon name="x" size={12} />
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="mobile-emergent-modal__placeholder">点击添加文件夹</span>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- 添加条件按钮 -->
      <div class="mobile-emergent-modal__add-condition">
        <button
          type="button"
          class="mobile-emergent-modal__text-btn"
          onclick={() => toggleCondition('createdAt')}
        >
          <ObsidianIcon name="plus" size={16} />
          <span>{visibleConditions.includes('createdAt') ? '移除' : '添加'}创建时间条件</span>
        </button>
        <button
          type="button"
          class="mobile-emergent-modal__text-btn"
          onclick={() => toggleCondition('priority')}
        >
          <ObsidianIcon name="plus" size={16} />
          <span>{visibleConditions.includes('priority') ? '移除' : '添加'}优先级条件</span>
        </button>
        <button
          type="button"
          class="mobile-emergent-modal__text-btn"
          onclick={() => toggleCondition('excludedTags')}
        >
          <ObsidianIcon name="plus" size={16} />
          <span>{visibleConditions.includes('excludedTags') ? '移除' : '添加'}排除标签</span>
        </button>
        <button
          type="button"
          class="mobile-emergent-modal__text-btn"
          onclick={() => toggleCondition('sourceFolders')}
        >
          <ObsidianIcon name="plus" size={16} />
          <span>{visibleConditions.includes('sourceFolders') ? '移除' : '添加'}来源文件夹</span>
        </button>
      </div>
    </div>
  </div>

  <footer class="mobile-emergent-modal__footer">
    <button class="mobile-emergent-modal__cancel-btn" type="button" onclick={handleCancel}>
      取消
    </button>
    <button class="mobile-emergent-modal__save-btn" type="button" onclick={handleSave}>
      保存并应用
    </button>
  </footer>
</div>

<style>
  .mobile-emergent-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--background-primary);
    display: flex;
    flex-direction: column;
    z-index: 1000;
  }

  .mobile-emergent-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .mobile-emergent-modal__back-btn,
  .mobile-emergent-modal__add-btn {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: var(--text-normal);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
  }

  .mobile-emergent-modal__back-btn:active,
  .mobile-emergent-modal__add-btn:active {
    background: var(--background-modifier-hover);
  }

  .mobile-emergent-modal__title {
    font-size: 17px;
    font-weight: 600;
    margin: 0;
    color: var(--text-normal);
  }

  .mobile-emergent-modal__toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-normal);
  }

  .mobile-emergent-modal__toggle input {
    margin: 0;
  }

  .mobile-emergent-modal__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    padding-bottom: 80px;
  }

  .mobile-emergent-modal__group-selector {
    margin-bottom: 16px;
  }

  .mobile-emergent-modal__select {
    width: 100%;
    padding: 12px 16px;
    font-size: 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .mobile-emergent-modal__config {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mobile-emergent-modal__card {
    background: var(--background-secondary);
    border-radius: 12px;
    padding: 16px;
  }

  .mobile-emergent-modal__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-emergent-modal__field + .mobile-emergent-modal__field {
    margin-top: 16px;
  }

  .mobile-emergent-modal__label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .mobile-emergent-modal__input {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .mobile-emergent-modal__tag-list,
  .mobile-emergent-modal__folder-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 44px;
    padding: 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
  }

  .mobile-emergent-modal__tag,
  .mobile-emergent-modal__folder {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 6px;
    font-size: 14px;
  }

  .mobile-emergent-modal__tag.is-muted {
    background: var(--background-modifier-border);
    color: var(--text-muted);
  }

  .mobile-emergent-modal__tag-remove,
  .mobile-emergent-modal__folder-remove {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-emergent-modal__placeholder {
    color: var(--text-muted);
    font-size: 14px;
    padding: 8px;
  }

  .mobile-emergent-modal__date-range,
  .mobile-emergent-modal__priority-range {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-emergent-modal__date-range .mobile-emergent-modal__input,
  .mobile-emergent-modal__priority-range .mobile-emergent-modal__input {
    flex: 1;
  }

  .mobile-emergent-modal__range-divider {
    color: var(--text-muted);
    font-size: 14px;
  }

  .mobile-emergent-modal__add-condition {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }

  .mobile-emergent-modal__text-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    color: var(--text-normal);
    font-size: 15px;
    cursor: pointer;
  }

  .mobile-emergent-modal__text-btn:active {
    background: var(--background-modifier-hover);
  }

  .mobile-emergent-modal__footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: var(--background-primary);
    border-top: 1px solid var(--background-modifier-border);
  }

  .mobile-emergent-modal__cancel-btn,
  .mobile-emergent-modal__save-btn {
    flex: 1;
    padding: 14px;
    font-size: 16px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    border: none;
  }

  .mobile-emergent-modal__cancel-btn {
    background: var(--background-secondary);
    color: var(--text-normal);
  }

  .mobile-emergent-modal__save-btn {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .mobile-emergent-modal__cancel-btn:active {
    opacity: 0.8;
  }

  .mobile-emergent-modal__save-btn:active {
    opacity: 0.9;
  }
</style>
