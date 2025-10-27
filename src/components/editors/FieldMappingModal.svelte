<script lang="ts">
  // FieldMappingModal.svelte
  import type { FieldTemplate } from '../../data/template-types';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { createEventDispatcher } from 'svelte';

  interface Props {
    open: boolean;
    currentFields: Record<string, string>;
    targetTemplate: FieldTemplate | null;
  }

  let { open, currentFields, targetTemplate }: Props = $props();

  const dispatch = createEventDispatcher<{
    confirm: { mapping: Record<string, string> };
    cancel: void;
  }>();

  let mapping = $state<Record<string, string>>({});

  // Generate initial mapping suggestion when component opens
  $effect(() => {
    if (open && targetTemplate) {
      const newMapping: Record<string, string> = {};
      const targetFields = targetTemplate.fields.filter(f => f.type === 'field').map(f => (f as import('../../data/template-types').FieldTemplateField).key);
      
      // 添加标签字段到当前字段列表中（如果不存在）
      const fieldsWithTags = { ...currentFields };
      if (!fieldsWithTags.tags && !fieldsWithTags.标签) {
        fieldsWithTags.tags = ''; // 添加标签字段
      }
      
      for (const oldKey of Object.keys(fieldsWithTags)) {
        const oldKeyLower = oldKey.toLowerCase();
        // Enhanced suggestion logic with semantic matching
        let suggestedKey = targetFields.find(newKey => newKey === oldKeyLower);
        if (!suggestedKey) {
          suggestedKey = targetFields.find(newKey => newKey.includes(oldKeyLower) || oldKeyLower.includes(newKey));
        }
        // Special handling for tags field
        if (oldKey === 'tags' || oldKey === '标签') {
          suggestedKey = targetFields.find(newKey => 
            newKey.toLowerCase().includes('tag') || 
            newKey.toLowerCase().includes('标签') ||
            newKey.toLowerCase().includes('label')
          ) || suggestedKey;
        }
        newMapping[oldKey] = suggestedKey || '';
      }
      mapping = newMapping;
    }
  });

  // 获取字段的颜色指示器类型
  function getFieldColorType(fieldKey: string): string {
    const key = fieldKey.toLowerCase();
    const isQuestionField = key.includes('question') || key.includes('front') || key.includes('问题') || key.includes('正面');
    const isAnswerField = key.includes('answer') || key.includes('back') || key.includes('答案') || key.includes('背面');
    const isTagField = key.includes('tag') || key.includes('标签') || key.includes('label');
    
    if (isQuestionField) return 'front';
    if (isAnswerField) return 'back';
    if (isTagField) return 'tags';
    return 'general';
  }

  // 获取字段的显示名称
  function getFieldDisplayName(fieldKey: string): string {
    if (fieldKey === 'tags') return '标签';
    return fieldKey;
  }

  function handleConfirm() {
    dispatch('confirm', { mapping });
  }

  function handleCancel() {
    dispatch('cancel');
  }

</script>

{#if open && targetTemplate}
<button class="fm-overlay" onclick={(e) => { if (e.currentTarget === e.target) handleCancel() }}>
  <div class="fm-modal" role="document">
    <header class="fm-header">
      <h2>字段映射</h2>
      <EnhancedButton variant="secondary" size="sm" onclick={handleCancel}>
        <EnhancedIcon name="x" size={16} />
      </EnhancedButton>
    </header>
    <main class="fm-main">
      <p class="fm-hint">将当前字段的值，映射到新模板 <strong>{targetTemplate.name}</strong> 的字段中：</p>
      <div class="fm-grid">
        <div class="fm-grid-header">
          <span>当前字段</span>
          <span></span>
          <span>新模板字段</span>
        </div>
        {#each Object.keys({ ...currentFields, ...(currentFields.tags || currentFields.标签 ? {} : { tags: '' }) }) as oldKey}
          <div class="fm-row">
            <div class="fm-field-box current">
              <div class="fm-field-with-indicator">
                <div class="fm-field-color-indicator" data-type={getFieldColorType(oldKey)}></div>
                <span class="fm-field-name" title={getFieldDisplayName(oldKey)}>
                  {getFieldDisplayName(oldKey)}
                </span>
              </div>
            </div>
            <div class="fm-arrow">→</div>
            <div class="fm-select-wrapper">
              <select class="fm-select" bind:value={mapping[oldKey]}>
                <option value="">不迁移</option>
                {#each targetTemplate.fields as item}
                  {#if item.type === 'field'}
                    {@const newField = item as import('../../data/template-types').FieldTemplateField}
                    <option value={newField.key}>{newField.name || newField.key}</option>
                  {/if}
                {/each}
              </select>
              {#if mapping[oldKey]}
                <div class="fm-target-field-preview">
                  <div class="fm-field-color-indicator" data-type={getFieldColorType(mapping[oldKey])}></div>
                  <span class="fm-target-field-name">
                    {(() => {
                      const field = targetTemplate.fields.find(f => f.type === 'field' && (f as any).key === mapping[oldKey]);
                      return field && field.type === 'field' ? (field as import('../../data/template-types').FieldTemplateField).name || mapping[oldKey] : mapping[oldKey];
                    })()}
                  </span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </main>
    <footer class="fm-footer">
      <EnhancedButton variant="secondary" onclick={handleCancel}>取消</EnhancedButton>
      <EnhancedButton variant="primary" onclick={handleConfirm}>应用映射</EnhancedButton>
    </footer>
  </div>
</button>
{/if}

<style>
  .fm-overlay {
    all: unset;
    display: block;
    width: 100%;
    height: 100%;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100001; /* Higher than card edit modal */
  }
  
  .fm-modal {
    width: 100%;
    max-width: 720px; /* 增加宽度以防止截断 */
    max-height: 80vh; /* 限制最大高度 */
    background: var(--background-secondary);
    border-radius: 1rem;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    animation: slideUpFade 0.3s ease-out;
  }

  @keyframes slideUpFade {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  .fm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }
  
  .fm-header h2 { 
    margin: 0; 
    font-size: 1.125rem; 
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .fm-main {
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
    min-height: 0; /* 确保flex子元素可以收缩 */
  }
  
  .fm-hint {
    margin-bottom: 1.5rem;
    color: var(--text-muted);
    font-size: 0.95rem;
    line-height: 1.5;
  }
  
  .fm-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .fm-grid-header {
    display: grid;
    grid-template-columns: 2fr auto 2fr; /* 更平衡的列宽 */
    gap: 1rem;
    font-weight: 600;
    color: var(--text-normal);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.9rem;
  }
  
  .fm-row {
    display: grid;
    grid-template-columns: 2fr auto 2fr; /* 更平衡的列宽 */
    gap: 1rem;
    align-items: stretch; /* 改为stretch以保持高度一致 */
    padding: 0.5rem 0;
    transition: all 0.2s ease;
  }

  .fm-row:hover {
    background: rgba(139, 92, 246, 0.03);
    border-radius: 0.5rem;
    margin: 0 -0.5rem;
    padding: 0.5rem;
  }
  
  .fm-field-box {
    padding: 1rem;
    background: var(--background-primary);
    border-radius: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    transition: all 0.2s ease;
    min-height: 60px;
    display: flex;
    align-items: center;
  }

  .fm-field-box:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .fm-field-with-indicator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }

  /* 颜色指示器 - 简洁干净的设计 */
  .fm-field-color-indicator {
    width: 3px;
    height: 20px;
    border-radius: 1.5px;
    flex-shrink: 0;
    transition: all 0.15s ease;
    opacity: 0.8;
  }

  .fm-field-box:hover .fm-field-color-indicator {
    opacity: 1;
    transform: scaleX(1.2);
  }

  /* 简洁的颜色方案 - 适配深色模式，所有类型使用统一样式 */
  .fm-field-color-indicator {
    background: var(--text-muted) !important;
    opacity: 0.6 !important;
  }

  .fm-field-name {
    font-weight: 500;
    color: var(--text-normal);
    font-size: 0.9rem;
    /* 防止字段名截断 */
    word-break: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
    line-height: 1.4;
    flex: 1;
  }
  
  .fm-arrow {
    font-size: 1.25rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .fm-row:hover .fm-arrow {
    color: var(--text-accent);
    transform: translateX(2px);
  }
  
  .fm-select-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .fm-select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9rem;
    transition: all 0.2s ease;
    min-height: 44px;
  }

  .fm-select:focus {
    outline: none;
    border-color: var(--text-accent);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
  }

  .fm-select:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  /* 目标字段预览 */
  .fm-target-field-preview {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(139, 92, 246, 0.05);
    border-radius: 0.5rem;
    border: 1px solid rgba(139, 92, 246, 0.2);
    animation: fadeInUp 0.2s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .fm-target-field-name {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-accent);
    word-break: break-word;
    overflow-wrap: break-word;
    line-height: 1.3;
  }
  
  .fm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .fm-modal {
      max-width: 95vw;
      margin: 0 1rem;
    }

    .fm-grid-header,
    .fm-row {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }

    .fm-arrow {
      display: none;
    }

    .fm-field-box {
      padding: 0.75rem;
    }

    .fm-field-name {
      font-size: 0.85rem;
    }

    .fm-select {
      padding: 0.625rem;
      font-size: 0.85rem;
    }
  }

  /* 暗色主题优化 - 使用 Obsidian 主题类 */
  :global(body.theme-dark) .fm-field-box:hover {
    box-shadow: 0 2px 8px rgba(255, 255, 255, 0.05);
  }

  .fm-target-field-preview {
    background: rgba(139, 92, 246, 0.08);
    border-color: rgba(139, 92, 246, 0.25);
  }

  /* 滚动条样式优化 */
  .fm-main::-webkit-scrollbar {
    width: 8px;
  }

  .fm-main::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .fm-main::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .fm-main::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }
</style>
