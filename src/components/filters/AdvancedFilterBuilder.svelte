<script lang="ts">
  import type { FilterConfig, FilterGroup, FilterCondition, SavedFilter } from "../../types/filter-types";
  import type { Card, Deck } from "../../data/types";
  import FilterConditionRow from "./FilterConditionRow.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { filterManager } from "../../services/filter-manager";

  interface Props {
    visible: boolean;
    initialConfig?: FilterConfig;
    cards: Card[];
    availableDecks: Deck[];
    availableTags: string[];
    onApply: (config: FilterConfig) => void;
    onSave: (config: FilterConfig) => void;
    onClose: () => void;
  }

  let { 
    visible, 
    initialConfig,
    cards = [],
    availableDecks = [], 
    availableTags = [], 
    onApply, 
    onSave,
    onClose 
  }: Props = $props();

  // 筛选配置状态
  let filterConfig = $state<FilterConfig>(
    initialConfig || {
      groups: [{
        id: `group-${Date.now()}`,
        logic: 'AND',
        conditions: [{
          id: `cond-${Date.now()}`,
          field: 'status',
          operator: 'equals',
          value: 'new',
          enabled: true
        }]
      }],
      globalLogic: 'AND'
    }
  );

  // 筛选结果统计
  let filteredCount = $state(0);
  let isCalculating = $state(false);

  // 计算筛选结果
  function calculateFilteredCount() {
    if (!visible) return;
    
    isCalculating = true;
    
    // 使用 setTimeout 避免阻塞 UI
    setTimeout(() => {
      try {
        const filtered = filterManager.applyFilter(cards, filterConfig, []);
        filteredCount = filtered.length;
      } catch (error) {
        console.error('[AdvancedFilterBuilder] 筛选计算失败:', error);
        filteredCount = 0;
      } finally {
        isCalculating = false;
      }
    }, 100);
  }

  // 当配置变化时重新计算
  $effect(() => {
    if (visible) {
      calculateFilteredCount();
    }
  });

  // 添加条件组
  function addGroup() {
    filterConfig.groups.push({
      id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      logic: 'AND',
      conditions: [{
        id: `cond-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        field: 'status',
        operator: 'equals',
        value: 'new',
        enabled: true
      }]
    });
    filterConfig = { ...filterConfig };
  }

  // 删除条件组
  function removeGroup(groupId: string) {
    if (filterConfig.groups.length <= 1) {
      console.warn('[AdvancedFilterBuilder] 至少需要保留一个条件组');
      return;
    }
    filterConfig.groups = filterConfig.groups.filter(g => g.id !== groupId);
    filterConfig = { ...filterConfig };
  }

  // 切换条件组逻辑
  function toggleGroupLogic(groupId: string) {
    const group = filterConfig.groups.find(g => g.id === groupId);
    if (group) {
      group.logic = group.logic === 'AND' ? 'OR' : 'AND';
      filterConfig = { ...filterConfig };
    }
  }

  // 切换全局逻辑
  function toggleGlobalLogic() {
    filterConfig.globalLogic = filterConfig.globalLogic === 'AND' ? 'OR' : 'AND';
    filterConfig = { ...filterConfig };
  }

  // 添加条件
  function addCondition(groupId: string) {
    const group = filterConfig.groups.find(g => g.id === groupId);
    if (group) {
      group.conditions.push({
        id: `cond-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        field: 'status',
        operator: 'equals',
        value: 'new',
        enabled: true
      });
      filterConfig = { ...filterConfig };
    }
  }

  // 更新条件
  function updateCondition(groupId: string, conditionId: string, updates: Partial<FilterCondition>) {
    const group = filterConfig.groups.find(g => g.id === groupId);
    if (group) {
      const condition = group.conditions.find(c => c.id === conditionId);
      if (condition) {
        Object.assign(condition, updates);
        filterConfig = { ...filterConfig };
      }
    }
  }

  // 删除条件
  function removeCondition(groupId: string, conditionId: string) {
    const group = filterConfig.groups.find(g => g.id === groupId);
    if (group) {
      if (group.conditions.length <= 1) {
        console.warn('[AdvancedFilterBuilder] 每个条件组至少需要一个条件');
        return;
      }
      group.conditions = group.conditions.filter(c => c.id !== conditionId);
      filterConfig = { ...filterConfig };
    }
  }

  // 应用筛选
  function handleApply() {
    onApply(filterConfig);
  }

  // 保存筛选
  function handleSave() {
    onSave(filterConfig);
  }

  // 清除筛选
  function handleClear() {
    filterConfig = {
      groups: [{
        id: `group-${Date.now()}`,
        logic: 'AND',
        conditions: [{
          id: `cond-${Date.now()}`,
          field: 'status',
          operator: 'equals',
          value: 'new',
          enabled: true
        }]
      }],
      globalLogic: 'AND'
    };
  }

  // 获取启用条件数量
  function getEnabledConditionsCount(): number {
    return filterConfig.groups.reduce((count, group) => {
      return count + group.conditions.filter(c => c.enabled).length;
    }, 0);
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="advanced-filter-overlay" onclick={onClose}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="advanced-filter-builder" onclick={(e) => e.stopPropagation()}>
      <!-- 头部 -->
      <header class="builder-header">
        <div class="header-title">
          <EnhancedIcon name="filter" size={20} />
          <h3>高级筛选器</h3>
        </div>
        <button class="close-btn" onclick={onClose}>
          <EnhancedIcon name="x" size={20} />
        </button>
      </header>

      <!-- 主体内容 -->
      <div class="builder-content">
        <!-- 全局逻辑切换 -->
        {#if filterConfig.groups.length > 1}
          <div class="global-logic-section">
            <span class="logic-label">条件组之间的关系:</span>
            <button 
              class="logic-toggle"
              onclick={toggleGlobalLogic}
            >
              {filterConfig.globalLogic === 'AND' ? '满足全部' : '满足任一'}
              <EnhancedIcon name="repeat" size={14} />
            </button>
          </div>
        {/if}

        <!-- 条件组列表 -->
        <div class="groups-container">
          {#each filterConfig.groups as group, groupIndex}
            <div class="filter-group" data-group-id={group.id}>
              <!-- 条件组头部 -->
              <div class="group-header">
                <div class="group-title">
                  <span class="group-label">条件组 {groupIndex + 1}</span>
                  <button 
                    class="group-logic-toggle"
                    onclick={() => toggleGroupLogic(group.id)}
                    title={group.logic === 'AND' ? '当前：需满足所有条件' : '当前：满足任一条件即可'}
                  >
                    {group.logic === 'AND' ? '且 (AND)' : '或 (OR)'}
                  </button>
                </div>
                
                {#if filterConfig.groups.length > 1}
                  <button 
                    class="remove-group-btn"
                    onclick={() => removeGroup(group.id)}
                    title="删除此条件组"
                  >
                    <EnhancedIcon name="trash" size={16} />
                  </button>
                {/if}
              </div>

              <!-- 条件列表 -->
              <div class="conditions-container">
                {#each group.conditions as condition}
                  <FilterConditionRow
                    {condition}
                    {availableDecks}
                    {availableTags}
                    onUpdate={(updates) => updateCondition(group.id, condition.id, updates)}
                    onRemove={() => removeCondition(group.id, condition.id)}
                  />
                {/each}

                <!-- 添加条件按钮 -->
                <button class="add-condition-btn" onclick={() => addCondition(group.id)}>
                  <EnhancedIcon name="plus" size={16} />
                  <span>添加条件</span>
                </button>
              </div>
            </div>

            <!-- 组间连接符 -->
            {#if groupIndex < filterConfig.groups.length - 1}
              <div class="group-connector">
                <span class="connector-badge">
                  {filterConfig.globalLogic === 'AND' ? '且 (AND)' : '或 (OR)'}
                </span>
              </div>
            {/if}
          {/each}
        </div>

        <!-- 添加条件组按钮 -->
        <button class="add-group-btn" onclick={addGroup}>
          <EnhancedIcon name="layers" size={16} />
          <span>添加条件组</span>
        </button>
      </div>

      <!-- 底部操作栏 -->
      <footer class="builder-footer">
        <!-- 筛选结果统计 -->
        <div class="filter-stats">
          <EnhancedIcon name="info-circle" size={16} />
          {#if isCalculating}
            <span class="calculating">计算中...</span>
          {:else}
            <span>
              共 {cards.length} 张卡片，
              符合条件 <strong>{filteredCount}</strong> 张
              ({getEnabledConditionsCount()} 个筛选条件)
            </span>
          {/if}
        </div>

        <!-- 操作按钮 -->
        <div class="footer-actions">
          <button class="btn-secondary" onclick={handleClear}>
            <EnhancedIcon name="rotate-ccw" size={16} />
            <span>清除</span>
          </button>
          <button class="btn-secondary" onclick={handleSave}>
            <EnhancedIcon name="save" size={16} />
            <span>保存</span>
          </button>
          <button class="btn-primary" onclick={handleApply}>
            <EnhancedIcon name="check" size={16} />
            <span>应用筛选</span>
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .advanced-filter-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .advanced-filter-builder {
    width: 100%;
    max-width: 900px;
    max-height: 90vh;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-l);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .builder-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-title h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: var(--radius-s);
    display: flex;
    align-items: center;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .builder-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .global-logic-section {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
  }

  .logic-label {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .logic-toggle,
  .group-logic-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-s);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .logic-toggle:hover,
  .group-logic-toggle:hover {
    opacity: 0.9;
  }

  .groups-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .filter-group {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: 1rem;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .group-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .remove-group-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: var(--radius-s);
    display: flex;
    align-items: center;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .remove-group-btn:hover {
    background: var(--background-modifier-error);
    color: var(--text-error);
  }

  .conditions-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .add-condition-btn,
  .add-group-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--background-primary);
    border: 1px dashed var(--background-modifier-border);
    border-radius: var(--radius-m);
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-condition-btn:hover,
  .add-group-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    color: var(--text-normal);
  }

  .group-connector {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.5rem 0;
  }

  .connector-badge {
    padding: 0.25rem 0.75rem;
    background: var(--background-modifier-border);
    border-radius: var(--radius-s);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .builder-footer {
    border-top: 1px solid var(--background-modifier-border);
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .filter-stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
    flex: 1;
  }

  .filter-stats strong {
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .calculating {
    font-style: italic;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .footer-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-secondary,
  .btn-primary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    border: none;
    border-radius: var(--radius-s);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .advanced-filter-overlay {
      padding: 0;
    }

    .advanced-filter-builder {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .builder-footer {
      flex-direction: column;
      align-items: stretch;
    }

    .footer-actions {
      width: 100%;
    }

    .btn-secondary,
    .btn-primary {
      flex: 1;
    }
  }
</style>

