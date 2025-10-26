<!--
  全局筛选面板
  显示在Obsidian左侧边栏中，提供完整的筛选功能
-->

<script lang="ts">
  import type AnkiPlugin from '../../main';
  import type { Deck } from '../../data/types';
  import type { CardType } from '../../types/newCardParsingTypes';
  import type { TimeFilterType } from '../../types/time-filter-types';
  import { onMount, onDestroy } from 'svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { detectCardQuestionType } from '../../utils/card-type-utils';
  import { TIME_FILTER_OPTIONS } from '../../types/time-filter-types';
  import { getTimeFilterCounts } from '../../utils/time-filter-utils';
  
  interface Props {
    plugin: AnkiPlugin;
  }
  
  let { plugin }: Props = $props();
  
  // 筛选状态服务
  let filterService = plugin.filterStateService;
  
  // 数据加载
  let allDecks = $state<Deck[]>([]);
  let allCards = $state<any[]>([]);
  let isLoading = $state(true);
  
  // 当前筛选状态
  let selectedDeckId = $state<string | null>(null);
  let selectedCardTypes = $state<Set<CardType>>(new Set());
  let selectedPriority = $state<number | null>(null);
  let selectedTags = $state<Set<string>>(new Set());
  let selectedTimeFilter = $state<TimeFilterType>(null);  // 🆕 时间筛选
  
  // 展开/折叠状态
  let expandedSections = $state({
    decks: true,
    types: true,
    priority: true,
    tags: true,
    time: true  // 🆕 时间筛选section
  });
  
  // 题型配置
  const cardTypeConfig = [
    { id: 'qa' as CardType, label: '问答题', icon: 'message-circle' },
    { id: 'choice' as CardType, label: '选择题', icon: 'check-square' },
    { id: 'fill' as CardType, label: '填空题', icon: 'edit-3' },
    { id: 'cloze' as CardType, label: '挖空题', icon: 'eye-off' }
  ];
  
  // 优先级配置
  const priorityConfig = [
    { value: null, label: '全部', stars: '' },
    { value: 3, label: '高优先级', stars: '⭐⭐⭐' },
    { value: 2, label: '中优先级', stars: '⭐⭐' },
    { value: 1, label: '低优先级', stars: '⭐' },
    { value: 0, label: '无优先级', stars: '-' }
  ];
  
  // 计算统计数据
  let deckCardCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    allCards.forEach(card => {
      if (card.deckId) {
        counts[card.deckId] = (counts[card.deckId] || 0) + 1;
      }
    });
    return counts;
  });
  
  let typeCardCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    allCards.forEach(card => {
      const type = detectCardQuestionType(card);
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  });
  
  let priorityCardCounts = $derived.by(() => {
    const counts: Record<number, number> = {};
    allCards.forEach(card => {
      const priority = card.priority ?? 0;
      counts[priority] = (counts[priority] || 0) + 1;
    });
    counts[-1] = allCards.length; // 全部
    return counts;
  });
  
  // 🆕 时间筛选卡片数量统计
  let timeFilterCounts = $derived.by(() => {
    return getTimeFilterCounts(allCards);
  });
  
  // 标签列表（带数量统计）
  let tagList = $derived.by(() => {
    const tagCounts: Map<string, number> = new Map();
    allCards.forEach(card => {
      if (card.tags && Array.isArray(card.tags)) {
        card.tags.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });
    
    // 转换为数组并排序（按使用频率）
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  });
  
  // 🎨 为标签生成颜色（基于标签名称hash）
  function getTagColor(tag: string): string {
    const colors = ['red', 'blue', 'green', 'purple', 'orange', 'pink', 'cyan', 'yellow'];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
  
  // 加载数据
  async function loadData() {
    try {
      isLoading = true;
      allDecks = await plugin.dataStorage.getDecks();
      allCards = await plugin.dataStorage.getCards();
    } catch (error) {
      console.error('[GlobalFilterPanel] Failed to load data:', error);
    } finally {
      isLoading = false;
    }
  }
  
  // 处理牌组选择
  function handleDeckSelect(deckId: string | null) {
    selectedDeckId = deckId;
    filterService.updateFilter({ selectedDeckId: deckId });
  }
  
  // 处理题型切换
  function handleTypeToggle(type: CardType) {
    if (selectedCardTypes.has(type)) {
      selectedCardTypes.delete(type);
    } else {
      selectedCardTypes.add(type);
    }
    selectedCardTypes = new Set(selectedCardTypes);
    filterService.updateFilter({ selectedCardTypes });
  }
  
  // 处理优先级选择
  function handlePrioritySelect(priority: number | null) {
    selectedPriority = priority;
    filterService.updateFilter({ selectedPriority: priority });
  }
  
  // 处理标签切换
  function handleTagToggle(tag: string) {
    if (selectedTags.has(tag)) {
      selectedTags.delete(tag);
    } else {
      selectedTags.add(tag);
    }
    selectedTags = new Set(selectedTags);
    filterService.updateFilter({ selectedTags });
  }
  
  // 🆕 处理时间筛选选择
  function handleTimeFilterSelect(timeFilter: TimeFilterType) {
    selectedTimeFilter = timeFilter;
    filterService.updateFilter({ selectedTimeFilter: timeFilter });
  }
  
  // 清除所有筛选
  function clearAllFilters() {
    selectedDeckId = null;
    selectedCardTypes = new Set();
    selectedPriority = null;
    selectedTags = new Set();
    selectedTimeFilter = null;  // 🆕 清除时间筛选
    filterService.clearAll();
  }
  
  // 切换section展开/折叠
  function toggleSection(section: keyof typeof expandedSections) {
    expandedSections[section] = !expandedSections[section];
  }
  
  // 订阅筛选状态变化
  let unsubscribe: (() => void) | null = null;
  
  onMount(() => {
    loadData();
    
    // 订阅全局筛选状态
    unsubscribe = filterService.subscribe((state) => {
      selectedDeckId = state.selectedDeckId;
      selectedCardTypes = new Set(state.selectedCardTypes);
      selectedPriority = state.selectedPriority;
      selectedTags = new Set(state.selectedTags);
      selectedTimeFilter = state.selectedTimeFilter;  // 🆕 同步时间筛选
    });
  });
  
  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });
</script>

<div class="tuanki-global-filter-panel">
  {#if isLoading}
    <div class="filter-loading">
      <div class="loading-spinner"></div>
      <p>加载筛选数据...</p>
    </div>
  {:else}
    <!-- 牌组筛选 -->
    <div class="filter-section">
      <div 
        class="filter-section-header" 
        role="button"
        tabindex="0"
        onclick={() => toggleSection('decks')}
        onkeydown={(e) => e.key === 'Enter' && toggleSection('decks')}
      >
        <EnhancedIcon 
          name={expandedSections.decks ? 'chevron-down' : 'chevron-right'} 
          size={14} 
        />
        <span class="filter-section-title">牌组筛选</span>
        {#if selectedDeckId}
          <span class="filter-badge">1</span>
        {/if}
      </div>
      
      {#if expandedSections.decks}
        <div class="filter-section-content">
          <!-- 全部牌组 -->
          <div 
            class="tree-item nav-file"
            class:is-active={selectedDeckId === null}
            role="button"
            tabindex="0"
            onclick={() => handleDeckSelect(null)}
            onkeydown={(e) => e.key === 'Enter' && handleDeckSelect(null)}
          >
            <div class="tree-item-self">
              <div class="tree-item-inner">全部牌组</div>
              {#if allCards.length > 0}
                <div class="tree-item-flair">{allCards.length}</div>
              {/if}
            </div>
          </div>
          
          <!-- 牌组列表 -->
          {#each allDecks as deck}
            <div 
              class="tree-item nav-file"
              class:is-active={selectedDeckId === deck.id}
              role="button"
              tabindex="0"
              onclick={() => handleDeckSelect(deck.id)}
              onkeydown={(e) => e.key === 'Enter' && handleDeckSelect(deck.id)}
            >
              <div class="tree-item-self">
                <div class="tree-item-icon">
                  <EnhancedIcon name="folder" size={14} />
                </div>
                <div class="tree-item-inner">{deck.name}</div>
                {#if deckCardCounts[deck.id]}
                  <div class="tree-item-flair">{deckCardCounts[deck.id]}</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- 题型筛选 -->
    <div class="filter-section">
      <div 
        class="filter-section-header" 
        role="button"
        tabindex="0"
        onclick={() => toggleSection('types')}
        onkeydown={(e) => e.key === 'Enter' && toggleSection('types')}
      >
        <EnhancedIcon 
          name={expandedSections.types ? 'chevron-down' : 'chevron-right'} 
          size={14} 
        />
        <span class="filter-section-title">题型筛选</span>
        {#if selectedCardTypes.size > 0}
          <span class="filter-badge">{selectedCardTypes.size}</span>
        {/if}
      </div>
      
      {#if expandedSections.types}
        <div class="filter-section-content">
          {#each cardTypeConfig as typeItem}
            <div 
              class="tree-item checkbox-item"
              role="button"
              tabindex="0"
              onclick={() => handleTypeToggle(typeItem.id)}
              onkeydown={(e) => e.key === 'Enter' && handleTypeToggle(typeItem.id)}
            >
              <div class="tree-item-self">
                <div class="tree-item-icon">
                  <input 
                    type="checkbox" 
                    checked={selectedCardTypes.has(typeItem.id)}
                    onchange={() => handleTypeToggle(typeItem.id)}
                  />
                </div>
                <div class="tree-item-icon">
                  <EnhancedIcon name={typeItem.icon} size={14} />
                </div>
                <div class="tree-item-inner">{typeItem.label}</div>
                {#if typeCardCounts[typeItem.id]}
                  <div class="tree-item-flair">{typeCardCounts[typeItem.id]}</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- 优先级筛选 -->
    <div class="filter-section">
      <div 
        class="filter-section-header" 
        role="button"
        tabindex="0"
        onclick={() => toggleSection('priority')}
        onkeydown={(e) => e.key === 'Enter' && toggleSection('priority')}
      >
        <EnhancedIcon 
          name={expandedSections.priority ? 'chevron-down' : 'chevron-right'} 
          size={14} 
        />
        <span class="filter-section-title">优先级</span>
        {#if selectedPriority !== null}
          <span class="filter-badge">1</span>
        {/if}
      </div>
      
      {#if expandedSections.priority}
        <div class="filter-section-content">
          {#each priorityConfig as item}
            <div 
              class="tree-item nav-file"
              class:is-active={selectedPriority === item.value}
              role="button"
              tabindex="0"
              onclick={() => handlePrioritySelect(item.value)}
              onkeydown={(e) => e.key === 'Enter' && handlePrioritySelect(item.value)}
            >
              <div class="tree-item-self">
                <div class="tree-item-icon">
                  <EnhancedIcon name="star" size={14} />
                </div>
                <div class="tree-item-inner">
                  {item.label}
                  {#if item.stars}
                    <span class="priority-stars">{item.stars}</span>
                  {/if}
                </div>
                {#if item.value !== null && priorityCardCounts[item.value]}
                  <div class="tree-item-flair">{priorityCardCounts[item.value]}</div>
                {:else if item.value === null}
                  <div class="tree-item-flair">{priorityCardCounts[-1] || 0}</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- 🎨 标签筛选（多彩设计） -->
    <div class="filter-section">
      <div 
        class="filter-section-header" 
        role="button"
        tabindex="0"
        onclick={() => toggleSection('tags')}
        onkeydown={(e) => e.key === 'Enter' && toggleSection('tags')}
      >
        <EnhancedIcon 
          name={expandedSections.tags ? 'chevron-down' : 'chevron-right'} 
          size={14} 
        />
        <span class="filter-section-title">标签筛选</span>
        {#if selectedTags.size > 0}
          <span class="filter-badge">{selectedTags.size}</span>
        {/if}
      </div>
      
      {#if expandedSections.tags}
        <div class="filter-section-content">
          {#if tagList.length === 0}
            <div class="empty-state">
              <p>暂无标签</p>
            </div>
          {:else}
            {#each tagList as { tag, count }}
              <div 
                class="tag-filter-item"
                class:is-selected={selectedTags.has(tag)}
                role="button"
                tabindex="0"
                onclick={() => handleTagToggle(tag)}
                onkeydown={(e) => e.key === 'Enter' && handleTagToggle(tag)}
              >
                <div class="tag-color-dot" data-color={getTagColor(tag)}></div>
                <span class="tag-name">#{tag}</span>
                <span class="tag-count">{count}</span>
                {#if selectedTags.has(tag)}
                  <EnhancedIcon name="check" size={12} />
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- 🆕 时间筛选 -->
    <div class="filter-section">
      <div 
        class="filter-section-header"
        role="button"
        tabindex="0"
        onclick={() => toggleSection('time')}
        onkeydown={(e) => e.key === 'Enter' && toggleSection('time')}
      >
        <EnhancedIcon 
          name={expandedSections.time ? 'chevron-down' : 'chevron-right'} 
          size={14} 
        />
        <span class="filter-section-title">时间筛选</span>
        {#if selectedTimeFilter}
          <span class="filter-active-badge">
            {TIME_FILTER_OPTIONS.find(opt => opt.value === selectedTimeFilter)?.label}
          </span>
        {/if}
      </div>
      
      {#if expandedSections.time}
        <div class="filter-section-content">
          <!-- 全部 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === null}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect(null)}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect(null)}
          >
            <span class="time-filter-label">全部</span>
            <span class="time-filter-count">{timeFilterCounts['all']}</span>
            {#if selectedTimeFilter === null}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 今天 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'today'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('today')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('today')}
          >
            <EnhancedIcon name="calendar" size={12} />
            <span class="time-filter-label">今天</span>
            <span class="time-filter-count">{timeFilterCounts['today']}</span>
            {#if selectedTimeFilter === 'today'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 今天到期 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'due-today'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('due-today')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('due-today')}
          >
            <EnhancedIcon name="alert-circle" size={12} />
            <span class="time-filter-label">今天到期</span>
            <span class="time-filter-count">{timeFilterCounts['due-today']}</span>
            {#if selectedTimeFilter === 'due-today'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 今天添加 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'added-today'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('added-today')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('added-today')}
          >
            <EnhancedIcon name="plus-circle" size={12} />
            <span class="time-filter-label">今天添加</span>
            <span class="time-filter-count">{timeFilterCounts['added-today']}</span>
            {#if selectedTimeFilter === 'added-today'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 今天编辑 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'edited-today'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('edited-today')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('edited-today')}
          >
            <EnhancedIcon name="edit" size={12} />
            <span class="time-filter-label">今天编辑</span>
            <span class="time-filter-count">{timeFilterCounts['edited-today']}</span>
            {#if selectedTimeFilter === 'edited-today'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 今天复习 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'reviewed-today'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('reviewed-today')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('reviewed-today')}
          >
            <EnhancedIcon name="refresh-cw" size={12} />
            <span class="time-filter-label">今天复习</span>
            <span class="time-filter-count">{timeFilterCounts['reviewed-today']}</span>
            {#if selectedTimeFilter === 'reviewed-today'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 首次复习 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'first-review'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('first-review')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('first-review')}
          >
            <EnhancedIcon name="star" size={12} />
            <span class="time-filter-label">首次复习</span>
            <span class="time-filter-count">{timeFilterCounts['first-review']}</span>
            {#if selectedTimeFilter === 'first-review'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 今天重来 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'retry-today'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('retry-today')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('retry-today')}
          >
            <EnhancedIcon name="rotate-ccw" size={12} />
            <span class="time-filter-label">今天重来</span>
            <span class="time-filter-count">{timeFilterCounts['retry-today']}</span>
            {#if selectedTimeFilter === 'retry-today'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
          
          <!-- 从未复习 -->
          <div 
            class="time-filter-item"
            class:is-selected={selectedTimeFilter === 'never-reviewed'}
            role="button"
            tabindex="0"
            onclick={() => handleTimeFilterSelect('never-reviewed')}
            onkeydown={(e) => e.key === 'Enter' && handleTimeFilterSelect('never-reviewed')}
          >
            <EnhancedIcon name="inbox" size={12} />
            <span class="time-filter-label">从未复习</span>
            <span class="time-filter-count">{timeFilterCounts['never-reviewed']}</span>
            {#if selectedTimeFilter === 'never-reviewed'}
              <EnhancedIcon name="check" size={12} />
            {/if}
          </div>
        </div>
      {/if}
    </div>
    
    <!-- 清除筛选按钮 -->
    {#if filterService.hasActiveFilters()}
      <div class="filter-actions">
        <button 
          class="clear-filter-button"
          onclick={clearAllFilters}
        >
          <EnhancedIcon name="x-circle" size={14} />
          <span>清除所有筛选</span>
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .tuanki-global-filter-panel {
    padding: 8px 0;
    height: 100%;
    overflow-y: auto;
  }
  
  /* 加载状态 */
  .filter-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    color: var(--text-muted);
  }
  
  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* 筛选区块 */
  .filter-section {
    margin-bottom: 4px;
  }
  
  .filter-section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    cursor: pointer;
    user-select: none;
  }
  
  .filter-section-header:hover {
    background-color: var(--background-modifier-hover);
  }
  
  .filter-section-title {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }
  
  .filter-badge {
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 10px;
    font-weight: 600;
  }
  
  .filter-section-content {
    padding: 0;
  }
  
  /* 🎯 Obsidian原生树形列表样式 */
  .tree-item {
    cursor: pointer;
    user-select: none;
  }
  
  .tree-item-self {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 12px 2px 24px;
    border-radius: 4px;
    transition: background-color 0.1s;
  }
  
  .tree-item:hover .tree-item-self {
    background-color: var(--background-modifier-hover);
  }
  
  .tree-item.is-active .tree-item-self {
    background-color: var(--background-modifier-active-hover);
    color: var(--text-accent);
  }
  
  .tree-item-icon {
    display: flex;
    align-items: center;
    color: var(--text-muted);
  }
  
  .tree-item-inner {
    flex: 1;
    font-size: 13px;
  }
  
  .tree-item-flair {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 500;
  }
  
  /* 复选框项目 */
  .checkbox-item input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
  }
  
  .priority-stars {
    margin-left: 6px;
    color: var(--text-muted);
    font-size: 11px;
  }
  
  /* 🎨 多彩标签设计 */
  .tag-filter-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 24px;
    margin: 1px 0;
    border-radius: 4px;
    border-left: 3px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .tag-filter-item:hover {
    background-color: var(--background-modifier-hover);
  }
  
  .tag-filter-item.is-selected {
    background-color: var(--background-modifier-active-hover);
    border-left-color: var(--interactive-accent);
  }
  
  .tag-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  /* 多彩标签颜色 */
  .tag-color-dot[data-color="red"] { background: #ef4444; }
  .tag-color-dot[data-color="blue"] { background: #3b82f6; }
  .tag-color-dot[data-color="green"] { background: #10b981; }
  .tag-color-dot[data-color="purple"] { background: #a855f7; }
  .tag-color-dot[data-color="orange"] { background: #f97316; }
  .tag-color-dot[data-color="pink"] { background: #ec4899; }
  .tag-color-dot[data-color="cyan"] { background: #06b6d4; }
  .tag-color-dot[data-color="yellow"] { background: #eab308; }
  
  .tag-name {
    flex: 1;
    font-size: 13px;
  }
  
  .tag-count {
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 500;
  }
  
  /* 🆕 时间筛选项 */
  .time-filter-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 28px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-normal);
    border-radius: 4px;
    transition: all 0.15s ease;
  }
  
  .time-filter-item:hover {
    background-color: var(--background-modifier-hover);
  }
  
  .time-filter-item.is-selected {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  .time-filter-label {
    flex: 1;
  }
  
  .time-filter-count {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: auto;
  }
  
  .time-filter-item.is-selected .time-filter-count {
    color: var(--text-on-accent);
    opacity: 0.8;
  }
  
  /* 清除按钮 */
  .filter-actions {
    padding: 8px 12px;
    border-top: 1px solid var(--background-modifier-border);
    margin-top: 8px;
  }
  
  .clear-filter-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    border-radius: 4px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .clear-filter-button:hover {
    background: var(--background-modifier-error);
    border-color: var(--text-error);
    color: var(--text-error);
  }
  
  /* 空状态 */
  .empty-state {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
  
  /* 滚动条样式 */
  .tuanki-global-filter-panel::-webkit-scrollbar {
    width: 8px;
  }
  
  .tuanki-global-filter-panel::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .tuanki-global-filter-panel::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }
  
  .tuanki-global-filter-panel::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }
</style>

