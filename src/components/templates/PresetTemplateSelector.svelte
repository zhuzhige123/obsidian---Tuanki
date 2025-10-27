<script lang="ts">
  import type { PresetTemplate } from "../../templates/preset-templates";
  import { TemplateCategory } from "../../data/template-types";
  import { defaultPresetTemplateManager } from "../../templates/preset-templates";
  
  interface Props {
    onSelect: (template: PresetTemplate) => void;
    selectedCategory?: TemplateCategory;
    searchQuery?: string;
  }
  
  let { onSelect, selectedCategory, searchQuery = "" }: Props = $props();
  
  let currentCategory = $state<TemplateCategory | 'all'>(selectedCategory || 'all');
  let currentSearch = $state(searchQuery);
  let showPreview = $state<string | null>(null);
  
  // 获取所有分类
  const categories = $derived.by(() => {
    const allTemplates = defaultPresetTemplateManager.getAllTemplates();
    const categorySet = new Set<TemplateCategory>();
    allTemplates.forEach(template => categorySet.add(template.category));
    return Array.from(categorySet);
  });

  // 过滤模板
  const filteredTemplates = $derived.by(() => {
    let templates = defaultPresetTemplateManager.getAllTemplates();

    // 按分类过滤
    if (currentCategory !== 'all') {
      templates = templates.filter(t => t.category === currentCategory);
    }

    // 按搜索词过滤
    if (currentSearch.trim()) {
      templates = defaultPresetTemplateManager.searchTemplates(currentSearch);
      if (currentCategory !== 'all') {
        templates = templates.filter(t => t.category === currentCategory);
      }
    }

    return templates;
  });
  
  // 分类显示名称映射
  const categoryNames: Record<TemplateCategory | 'all', string> = {
    all: '全部',
    [TemplateCategory.BASIC]: '基础卡片',
    [TemplateCategory.CLOZE]: '挖空卡',
    [TemplateCategory.CHOICE]: '选择题',
    [TemplateCategory.LANGUAGE]: '语言学习',
    [TemplateCategory.SCIENCE]: '科学学科',
    [TemplateCategory.MATH]: '数学',
    [TemplateCategory.HISTORY]: '历史',
    [TemplateCategory.LITERATURE]: '文学',
    [TemplateCategory.PROGRAMMING]: '编程',
    [TemplateCategory.MEDICAL]: '医学',
    [TemplateCategory.GENERAL]: '通用'
  };
  
  // 难度显示名称映射
  const difficultyNames = {
    beginner: '初级',
    intermediate: '中级',
    advanced: '高级'
  };
  
  // 难度颜色映射
  const difficultyColors = {
    beginner: '#10b981',
    intermediate: '#f59e0b',
    advanced: '#ef4444'
  };
  
  function handleTemplateSelect(template: PresetTemplate) {
    onSelect(template);
  }
  
  function togglePreview(templateId: string) {
    showPreview = showPreview === templateId ? null : templateId;
  }
</script>

<div class="preset-template-selector">
  <!-- 搜索和过滤 -->
  <div class="selector-header">
    <div class="search-box">
      <input
        type="text"
        placeholder="搜索模板..."
        bind:value={currentSearch}
        class="search-input"
      />
    </div>
    
    <div class="category-filter">
      <select bind:value={currentCategory} class="category-select">
        <option value="all">全部分类</option>
        {#each categories as category}
          <option value={category}>{categoryNames[category]}</option>
        {/each}
      </select>
    </div>
  </div>
  
  <!-- 模板列表 -->
  <div class="template-list">
    {#if filteredTemplates.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">
          {currentSearch.trim() ? '没有找到匹配的模板' : '该分类下暂无模板'}
        </div>
        {#if currentSearch.trim()}
          <button 
            class="clear-search"
            onclick={() => currentSearch = ''}
          >
            清除搜索
          </button>
        {/if}
      </div>
    {:else}
      {#each filteredTemplates as template}
        <div class="template-item">
          <div class="template-header">
            <div class="template-info">
              <h3 class="template-name">{template.name}</h3>
              <p class="template-description">{template.description}</p>
            </div>
            
            <div class="template-meta">
              {#if template.difficulty}
                <span 
                  class="difficulty-badge"
                  style="background-color: {difficultyColors[template.difficulty]}20; color: {difficultyColors[template.difficulty]}"
                >
                  {difficultyNames[template.difficulty]}
                </span>
              {/if}
              
              <span class="category-badge">
                {categoryNames[template.category]}
              </span>
            </div>
          </div>
          
          <div class="template-tags">
            {#each template.tags as tag}
              <span class="tag">{tag}</span>
            {/each}
          </div>
          
          {#if template.usageExample}
            <div class="usage-example">
              <strong>使用场景：</strong>{template.usageExample}
            </div>
          {/if}
          
          <div class="template-actions">
            <button 
              class="preview-btn"
              onclick={() => togglePreview(template.id)}
            >
              {showPreview === template.id ? '隐藏预览' : '预览模板'}
            </button>
            
            <button 
              class="select-btn"
              onclick={() => handleTemplateSelect(template)}
            >
              使用此模板
            </button>
          </div>
          
          <!-- 模板预览 -->
          {#if showPreview === template.id}
            <div class="template-preview">
              <div class="preview-section">
                <h4>字段列表：</h4>
                <ul class="field-list">
                  {#each template.template.fields as field}
                    {#if field.type === 'field'}
                      <li class="field-item">
                        <span class="field-name">{field.name}</span>
                        <span class="field-side side-{field.side}">{field.side === 'front' ? '正面' : field.side === 'back' ? '背面' : '双面'}</span>
                      </li>
                    {:else if field.type === 'hr'}
                      <li class="separator-item">分割线</li>
                    {/if}
                  {/each}
                </ul>
              </div>
              
              <div class="preview-section">
                <h4>模板预览：</h4>
                <div class="template-preview-content">
                  <div class="preview-side">
                    <strong>正面：</strong>
                    <div class="preview-html">{template.template.frontTemplate}</div>
                  </div>
                  <div class="preview-side">
                    <strong>背面：</strong>
                    <div class="preview-html">{template.template.backTemplate}</div>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .preset-template-selector {
    max-height: 600px;
    overflow-y: auto;
  }
  
  .selector-header {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 6px;
  }
  
  .search-box {
    flex: 1;
  }
  
  .search-input {
    width: 100%;
    height: 36px;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    line-height: 1.2;
    box-sizing: border-box;
  }
  
  .category-filter {
    min-width: 120px;
  }
  
  .category-select {
    width: 100%;
    height: 36px;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    line-height: 1.2;
    box-sizing: border-box;
  }
  
  .template-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
  }
  
  .empty-icon {
    font-size: 3em;
    margin-bottom: 12px;
  }
  
  .empty-text {
    font-size: 1.1em;
    margin-bottom: 16px;
  }
  
  .clear-search {
    padding: 8px 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
  }
  
  .template-item {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 16px;
    background: var(--background-primary);
  }
  
  .template-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  
  .template-info {
    flex: 1;
  }
  
  .template-name {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: var(--text-normal);
  }
  
  .template-description {
    font-size: 0.9em;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
  }
  
  .template-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
  }
  
  .difficulty-badge,
  .category-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: 500;
  }
  
  .category-badge {
    background: var(--background-modifier-border);
    color: var(--text-muted);
  }
  
  .template-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  
  .tag {
    padding: 2px 6px;
    background: var(--background-secondary);
    border-radius: 4px;
    font-size: 0.8em;
    color: var(--text-muted);
  }
  
  .usage-example {
    font-size: 0.9em;
    color: var(--text-muted);
    margin-bottom: 12px;
    padding: 8px;
    background: var(--background-secondary);
    border-radius: 4px;
  }
  
  .template-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  
  .preview-btn,
  .select-btn {
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
  }
  
  .preview-btn {
    background: var(--background-secondary);
    color: var(--text-normal);
  }
  
  .select-btn {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }
  
  .preview-btn:hover {
    background: var(--background-modifier-hover);
  }
  
  .select-btn:hover {
    background: var(--interactive-accent-hover);
  }
  
  .template-preview {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .preview-section {
    margin-bottom: 16px;
  }
  
  .preview-section h4 {
    font-size: 0.9em;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: var(--text-normal);
  }
  
  .field-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .field-item,
  .separator-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    margin-bottom: 2px;
    background: var(--background-secondary);
    border-radius: 4px;
    font-size: 0.85em;
  }
  
  .separator-item {
    color: var(--text-muted);
    font-style: italic;
  }
  
  .field-name {
    font-weight: 500;
  }
  
  .field-side {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.75em;
    font-weight: 500;
  }
  
  .side-front {
    background: #10b98120;
    color: #10b981;
  }
  
  .side-back {
    background: #f59e0b20;
    color: #f59e0b;
  }
  
  .side-both {
    background: #8b5cf620;
    color: #8b5cf6;
  }
  
  .template-preview-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  
  .preview-side {
    padding: 8px;
    background: var(--background-secondary);
    border-radius: 4px;
    font-size: 0.85em;
  }
  
  .preview-html {
    margin-top: 4px;
    padding: 6px;
    background: var(--background-primary);
    border-radius: 3px;
    font-family: monospace;
    color: var(--text-muted);
    word-break: break-all;
  }
</style>
