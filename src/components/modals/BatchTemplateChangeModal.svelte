<!--
  批量更换模板模态框
  支持选择新模板并进行字段映射
-->
<script lang="ts">

  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import { ICON_NAMES } from '../../icons/index.js';
  import type { FieldTemplate } from '../../data/template-types';
  import type { Card } from '../../data/types';
  import type { TemplateConsistencyCheck } from '../../types/batch-operation-types';

  interface Props {
    open: boolean;
    selectedCards: Card[];
    fieldTemplates: FieldTemplate[];
    onconfirm?: (result: TemplateChangeResult) => void;
    oncancel?: () => void;
  }

  interface FieldMapping {
    sourceField: string;
    targetField: string;
    sourceValue?: string;
  }

  interface TemplateChangeResult {
    targetTemplateId: string;
    fieldMappings: FieldMapping[];
    unmappedFieldHandling: {
      mode: 'delete' | 'merge';
      mergeTargetField?: string;
    };
  }

  let { open, selectedCards, fieldTemplates, onconfirm, oncancel }: Props = $props();

  // 状态管理
  let currentStep: 'selectTemplate' | 'fieldMapping' = $state('selectTemplate');
  let selectedTemplateId = $state('');
  let selectedTemplate: FieldTemplate | null = $state(null);
  let fieldMappings: FieldMapping[] = $state([]);
  let unmappedHandlingMode = $state<'delete' | 'merge'>('delete');
  let mergeTargetField = $state('');
  
  // 模板一致性检查
  let consistencyCheck = $state<TemplateConsistencyCheck>({
    isConsistent: true,
    sourceTemplateId: null,
    sourceTemplateName: null,
    templateGroups: []
  });

  // 检查模板一致性
  function checkTemplateConsistency(): TemplateConsistencyCheck {
    const templateMap = new Map<string, number>();
    
    selectedCards.forEach(card => {
      const count = templateMap.get(card.templateId) || 0;
      templateMap.set(card.templateId, count + 1);
    });
    
    const isConsistent = templateMap.size === 1;
    const sourceTemplateId = isConsistent 
      ? Array.from(templateMap.keys())[0] 
      : null;
    
    const sourceTemplate = fieldTemplates.find(t => t.id === sourceTemplateId);
    
    const templateGroups = Array.from(templateMap.entries()).map(([id, count]) => ({
      templateId: id,
      templateName: fieldTemplates.find(t => t.id === id)?.name || '未知模板',
      cardCount: count
    }));
    
    return {
      isConsistent,
      sourceTemplateId,
      sourceTemplateName: sourceTemplate?.name || null,
      templateGroups
    };
  }

  // 计算属性 - 基于源模板的字段
  let uniqueSourceFields = $derived(() => {
    if (!consistencyCheck.isConsistent || !consistencyCheck.sourceTemplateId) {
      return [];
    }
    
    const sourceTemplate = fieldTemplates.find(t => t.id === consistencyCheck.sourceTemplateId);
    if (!sourceTemplate) return [];
    
    return sourceTemplate.fields
      .filter(field => field.type === 'field')
      .map(field => (field as any).key)
      .sort();
  });

  let targetFields = $derived(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.fields
      .filter(field => field.type === 'field')
      .map(field => (field as any).key)
      .sort();
  });

  // 重置状态
  function resetState() {
    currentStep = 'selectTemplate';
    selectedTemplateId = '';
    selectedTemplate = null;
    fieldMappings = [];
    unmappedHandlingMode = 'delete';
    mergeTargetField = '';
    consistencyCheck = checkTemplateConsistency();
  }

  // 选择模板
  function handleTemplateSelect(templateId: string) {
    selectedTemplateId = templateId;
    selectedTemplate = fieldTemplates.find(t => t.id === templateId) || null;
  }

  // 下一步：进入字段映射
  function handleNextToMapping() {
    if (!selectedTemplate || !consistencyCheck.isConsistent) return;

    // 初始化字段映射
    fieldMappings = uniqueSourceFields().map(sourceField => ({
      sourceField,
      targetField: findBestMatch(sourceField, targetFields()),
      sourceValue: getFieldPreview(sourceField)
    }));

    // 初始化合并目标字段为第一个可用字段
    if (targetFields().length > 0) {
      mergeTargetField = targetFields()[0];
    }

    currentStep = 'fieldMapping';
  }

  // 智能字段匹配
  function findBestMatch(sourceField: string, targetFields: string[]): string {
    // 精确匹配
    if (targetFields.includes(sourceField)) {
      return sourceField;
    }

    // 常见字段映射
    const commonMappings: Record<string, string[]> = {
      'front': ['question', 'word', 'term', 'prompt'],
      'back': ['answer', 'definition', 'explanation', 'response'],
      'question': ['front', 'word', 'term', 'prompt'],
      'answer': ['back', 'definition', 'explanation', 'response'],
      'word': ['front', 'question', 'term'],
      'definition': ['back', 'answer', 'explanation'],
      'notes': ['extra', 'comment', 'remark'],
      'extra': ['notes', 'comment', 'additional'],
      'tags': ['tag', 'category', 'label'],
      'source': ['reference', 'origin', 'from']
    };

    const lowerSource = sourceField.toLowerCase();
    for (const [key, alternatives] of Object.entries(commonMappings)) {
      if (lowerSource.includes(key)) {
        for (const alt of alternatives) {
          const match = targetFields.find(tf => tf.toLowerCase().includes(alt));
          if (match) return match;
        }
      }
    }

    // 模糊匹配
    for (const targetField of targetFields) {
      if (targetField.toLowerCase().includes(lowerSource) || 
          lowerSource.includes(targetField.toLowerCase())) {
        return targetField;
      }
    }

    // 返回第一个可用字段或空字符串
    return targetFields[0] || '';
  }

  // 获取字段预览值
  function getFieldPreview(fieldName: string): string {
    for (const card of selectedCards.slice(0, 3)) {
      const value = card.fields?.[fieldName];
      if (value && value.trim()) {
        return value.length > 50 ? value.substring(0, 50) + '...' : value;
      }
    }
    return '';
  }

  // 更新字段映射
  function updateFieldMapping(sourceField: string, targetField: string) {
    const mapping = fieldMappings.find(m => m.sourceField === sourceField);
    if (mapping) {
      mapping.targetField = targetField;
    }
  }

  // 返回上一步
  function handleBackToTemplate() {
    currentStep = 'selectTemplate';
  }

  // 确认更换
  function handleConfirm() {
    if (!selectedTemplateId) return;

    const result: TemplateChangeResult = {
      targetTemplateId: selectedTemplateId,
      fieldMappings: fieldMappings.filter(m => m.targetField),
      unmappedFieldHandling: {
        mode: unmappedHandlingMode,
        mergeTargetField: unmappedHandlingMode === 'merge' ? mergeTargetField : undefined
      }
    };

    onconfirm?.(result);
    resetState();
  }

  // 取消操作
  function handleCancel() {
    oncancel?.();
    resetState();
  }

  // 监听open变化，重置状态
  $effect(() => {
    if (!open) {
      resetState();
    }
  });
</script>

{#if open}
<div class="btc-overlay" onclick={(e) => { if (e.currentTarget === e.target) handleCancel() }} onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCancel(); } }} role="button" tabindex="0">
  <div class="btc-modal" role="dialog" aria-labelledby="btc-title">
    <header class="btc-header">
      <h2 id="btc-title">
        {#if currentStep === 'selectTemplate'}
          批量更换模板
        {:else}
          字段映射配置
        {/if}
      </h2>
      <EnhancedButton variant="secondary" size="sm" onclick={handleCancel}>
        <EnhancedIcon name={ICON_NAMES.CLOSE} size={16} />
      </EnhancedButton>
    </header>

    <main class="btc-main">
      {#if currentStep === 'selectTemplate'}
        <!-- 步骤1：选择模板 -->
        <div class="btc-step">
          <!-- 模板一致性检查 -->
          {#if !consistencyCheck.isConsistent}
            <div class="btc-error-panel">
              <div class="btc-error-icon">
                <EnhancedIcon name={ICON_NAMES.WARNING} size={24} />
              </div>
              <div class="btc-error-content">
                <h3>无法批量更换模板</h3>
                <p>所选卡片来自不同模板，请选择相同模板的卡片后重试。</p>
                <div class="btc-template-breakdown">
                  <h4>卡片分布：</h4>
                  <ul>
                    {#each consistencyCheck.templateGroups as group}
                    <li>
                      <strong>{group.templateName}</strong>: {group.cardCount} 张
                    </li>
                    {/each}
                  </ul>
                </div>
                <p class="btc-hint">💡 提示：使用筛选功能按模板筛选卡片</p>
              </div>
            </div>
          {:else}
            <div class="btc-info btc-info-success">
              <EnhancedIcon name={ICON_NAMES.CHECK_CIRCLE} size={16} />
              <span>将为选中的 <strong>{selectedCards.length}</strong> 张卡片更换模板（当前模板：<strong>{consistencyCheck.sourceTemplateName}</strong>）</span>
            </div>
          {/if}

          <div class="btc-template-list">
            {#each fieldTemplates as template (template.id)}
              <div
                class="btc-template-item"
                class:selected={selectedTemplateId === template.id}
                onclick={() => handleTemplateSelect(template.id)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTemplateSelect(template.id); } }}
                role="button"
                tabindex="0"
                aria-label={`选择模板: ${template.name}`}
              >
                <div class="btc-template-icon">
                  <EnhancedIcon 
                    name={template.isOfficial ? ICON_NAMES.CHECK_CIRCLE : ICON_NAMES.TAG} 
                    size={20} 
                  />
                </div>
                <div class="btc-template-info">
                  <div class="btc-template-name">{template.name}</div>
                  <div class="btc-template-desc">
                    {template.description || '无描述'}
                  </div>
                  <div class="btc-template-fields">
                    {template.fields.filter(f => f.type === 'field').length} 个字段
                  </div>
                </div>
                {#if template.isOfficial}
                  <div class="btc-template-badge">官方</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <!-- 步骤2：字段映射 -->
        <div class="btc-step">
          <div class="btc-info">
            <EnhancedIcon name={ICON_NAMES.INFO} size={16} />
            <span>配置字段映射关系，将现有字段数据映射到新模板</span>
          </div>

          <div class="btc-mapping-container">
            <div class="btc-mapping-header">
              <span>原字段</span>
              <span>预览</span>
              <span>目标字段</span>
            </div>

            {#each fieldMappings as mapping (mapping.sourceField)}
              <div class="btc-mapping-row">
                <div class="btc-source-field">
                  <EnhancedIcon name={ICON_NAMES.TAG} size={14} />
                  <span>{mapping.sourceField}</span>
                </div>
                
                <div class="btc-field-preview" title={mapping.sourceValue}>
                  {mapping.sourceValue || '(空)'}
                </div>
                
                <div class="btc-target-field">
                  <select 
                    value={mapping.targetField}
                    onchange={(e) => updateFieldMapping(mapping.sourceField, e.currentTarget.value)}
                  >
                    <option value="">-- 不映射 --</option>
                    {#each targetFields() as field}
                      <option value={field}>{field}</option>
                    {/each}
                  </select>
                </div>
              </div>
            {/each}
          </div>

          <div class="btc-options">
            <h4>未映射字段处理方式</h4>
            <div class="btc-radio-group">
              <label class="btc-radio-label">
                <input 
                  type="radio" 
                  bind:group={unmappedHandlingMode} 
                  value="delete"
                />
                <div class="btc-radio-content">
                  <span class="btc-radio-title">删除未映射字段</span>
                  <small>不在新模板中的字段将被永久删除</small>
                </div>
              </label>
              <label class="btc-radio-label">
                <input 
                  type="radio" 
                  bind:group={unmappedHandlingMode} 
                  value="merge"
                />
                <div class="btc-radio-content">
                  <span class="btc-radio-title">合并到指定字段</span>
                  <small>将所有未映射字段内容合并到一个字段中</small>
                </div>
              </label>
            </div>
            
            {#if unmappedHandlingMode === 'merge'}
            <div class="btc-merge-target">
              <label for="merge-target-field">合并目标字段：</label>
              <select id="merge-target-field" bind:value={mergeTargetField}>
                {#each targetFields() as field}
                <option value={field}>{field}</option>
                {/each}
              </select>
              <small>未映射的字段内容将以"<strong>字段名</strong>: 内容"格式追加到目标字段</small>
            </div>
            {/if}
          </div>
        </div>
      {/if}
    </main>

    <footer class="btc-footer">
      {#if currentStep === 'selectTemplate'}
        <EnhancedButton variant="secondary" onclick={handleCancel}>
          取消
        </EnhancedButton>
        <EnhancedButton 
          variant="primary" 
          onclick={handleNextToMapping}
          disabled={!selectedTemplateId || !consistencyCheck.isConsistent}
        >
          下一步：字段映射
          <EnhancedIcon name={ICON_NAMES.CHEVRON_RIGHT} size={16} />
        </EnhancedButton>
      {:else}
        <EnhancedButton variant="secondary" onclick={handleBackToTemplate}>
          <EnhancedIcon name={ICON_NAMES.CHEVRON_LEFT} size={16} />
          上一步
        </EnhancedButton>
        <EnhancedButton variant="primary" onclick={handleConfirm}>
          确认更换模板
          <EnhancedIcon name={ICON_NAMES.CHECK} size={16} />
        </EnhancedButton>
      {/if}
    </footer>
  </div>
</div>
{/if}

<style>
  .btc-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .btc-modal {
    background: var(--background-primary);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-l);
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .btc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .btc-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .btc-main {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .btc-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    margin-bottom: 1.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .btc-info-success {
    background: var(--background-modifier-success);
    color: var(--text-success);
  }

  .btc-error-panel {
    display: flex;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--background-modifier-error-hover);
    border: 2px solid var(--background-modifier-error);
    border-radius: var(--radius-m);
    margin-bottom: 1.5rem;
  }

  .btc-error-icon {
    color: var(--text-error);
    flex-shrink: 0;
  }

  .btc-error-content h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-error);
  }

  .btc-error-content p {
    margin: 0 0 1rem 0;
    color: var(--text-normal);
    font-size: 0.875rem;
  }

  .btc-template-breakdown {
    background: var(--background-primary);
    padding: 0.75rem;
    border-radius: var(--radius-s);
    margin-bottom: 0.75rem;
  }

  .btc-template-breakdown h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .btc-template-breakdown ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .btc-template-breakdown li {
    margin: 0.25rem 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .btc-hint {
    color: var(--text-accent) !important;
    font-size: 0.8125rem !important;
  }

  .btc-template-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btc-template-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btc-template-item:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .btc-template-item.selected {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-success);
  }

  .btc-template-icon {
    color: var(--text-accent);
  }

  .btc-template-info {
    flex: 1;
  }

  .btc-template-name {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .btc-template-desc {
    color: var(--text-muted);
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .btc-template-fields {
    color: var(--text-faint);
    font-size: 0.75rem;
  }

  .btc-template-badge {
    background: var(--color-green);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-s);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .btc-mapping-container {
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    overflow: hidden;
  }

  .btc-mapping-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    background: var(--background-secondary);
    font-weight: 600;
    color: var(--text-normal);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .btc-mapping-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
    align-items: center;
  }

  .btc-mapping-row:last-child {
    border-bottom: none;
  }

  .btc-source-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-normal);
    font-weight: 500;
  }

  .btc-field-preview {
    color: var(--text-muted);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btc-target-field select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .btc-options {
    margin-top: 1.5rem;
    padding: 1.5rem;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
  }

  .btc-options h4 {
    margin: 0 0 1rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .btc-radio-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btc-radio-label {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btc-radio-label:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .btc-radio-label:has(input:checked) {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-success);
  }

  .btc-radio-label input[type="radio"] {
    margin-top: 0.125rem;
    cursor: pointer;
  }

  .btc-radio-content {
    flex: 1;
  }

  .btc-radio-title {
    display: block;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .btc-radio-content small {
    display: block;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .btc-merge-target {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--background-primary);
    border-radius: var(--radius-m);
  }

  .btc-merge-target label {
    display: block;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .btc-merge-target select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .btc-merge-target small {
    display: block;
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .btc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }
</style>
