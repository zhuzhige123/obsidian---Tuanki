<script lang="ts">
  /**
   * 模板映射模态窗组件
   * 处理模板切换时的字段映射
   */
  
  import { createEventDispatcher } from 'svelte';
  import { cardEditEventBus } from '../../events/CardEditEventBus';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import type { FieldTemplate, TriadTemplate } from '../../data/template-types';

  interface Props {
    /** 是否显示模态窗 */
    isOpen: boolean;
    /** 源模板 */
    fromTemplate: FieldTemplate | TriadTemplate;
    /** 目标模板 */
    toTemplate: FieldTemplate | TriadTemplate;
    /** 当前数据 */
    currentData: {
      fields: Record<string, string>;
      markdownContent?: string;
    };
    /** 映射模式 */
    mode: 'fields' | 'markdown';
  }

  let {
    isOpen = false,
    fromTemplate,
    toTemplate,
    currentData,
    mode = 'fields'
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    confirm: { mappings: Record<string, string>; config: any };
    cancel: void;
  }>();

  // 映射状态
  let fieldMappings = $state<Record<string, string>>({});
  let isProcessing = $state(false);
  let previewData = $state<Record<string, string>>({});

  // 获取源字段和目标字段
  let sourceFields = $derived(() => {
    console.log('[TemplateMappingModal] 获取源字段:', {
      fromTemplate,
      hasFieldTemplate: 'fieldTemplate' in fromTemplate,
      fields: 'fieldTemplate' in fromTemplate ? fromTemplate.fieldTemplate?.fields : fromTemplate.fields
    });

    if ('fieldTemplate' in fromTemplate) {
      // 三位一体模板
      const fields = fromTemplate.fieldTemplate?.fields || [];
      return fields
        .filter(f => f.type === 'field')
        .map(f => f as any);
    } else {
      // 字段模板
      const fields = fromTemplate.fields || [];
      return fields
        .filter(f => f.type === 'field')
        .map(f => f as any);
    }
  });

  let targetFields = $derived(() => {
    console.log('[TemplateMappingModal] 获取目标字段:', {
      toTemplate,
      hasFieldTemplate: 'fieldTemplate' in toTemplate,
      fields: 'fieldTemplate' in toTemplate ? toTemplate.fieldTemplate?.fields : toTemplate.fields
    });

    if ('fieldTemplate' in toTemplate) {
      // 三位一体模板
      const fields = toTemplate.fieldTemplate?.fields || [];
      return fields
        .filter(f => f.type === 'field')
        .map(f => f as any);
    } else {
      // 字段模板
      const fields = toTemplate.fields || [];
      return fields
        .filter(f => f.type === 'field')
        .map(f => f as any);
    }
  });

  /**
   * 初始化映射
   */
  function initializeMappings(): void {
    const mappings: Record<string, string> = {};

    const sourceFieldsArray = sourceFields();
    const targetFieldsArray = targetFields();

    console.log('[TemplateMappingModal] 初始化映射:', {
      sourceFields: sourceFieldsArray,
      targetFields: targetFieldsArray
    });

    // 智能映射：尝试匹配相似的字段名
    for (const targetField of targetFieldsArray) {
      const targetKey = targetField.key;
      const targetName = targetField.name || targetKey;

      // 1. 精确匹配key
      const exactMatch = sourceFieldsArray.find(sf => sf.key === targetKey);
      if (exactMatch) {
        mappings[targetKey] = exactMatch.key;
        continue;
      }

      // 2. 精确匹配name
      const nameMatch = sourceFieldsArray.find(sf =>
        (sf.name || sf.key).toLowerCase() === targetName.toLowerCase()
      );
      if (nameMatch) {
        mappings[targetKey] = nameMatch.key;
        continue;
      }

      // 3. 模糊匹配
      const fuzzyMatch = sourceFieldsArray.find(sf => {
        const sourceName = (sf.name || sf.key).toLowerCase();
        const targetNameLower = targetName.toLowerCase();
        return sourceName.includes(targetNameLower) || targetNameLower.includes(sourceName);
      });
      if (fuzzyMatch) {
        mappings[targetKey] = fuzzyMatch.key;
        continue;
      }

      // 4. 默认映射到第一个未使用的字段
      const usedSourceKeys = Object.values(mappings);
      const unusedSource = sourceFieldsArray.find(sf => !usedSourceKeys.includes(sf.key));
      if (unusedSource) {
        mappings[targetKey] = unusedSource.key;
      }
    }

    fieldMappings = mappings;
    console.log('[TemplateMappingModal] 初始化映射完成:', mappings);
    updatePreview();
  }

  /**
   * 更新预览
   */
  function updatePreview(): void {
    const preview: Record<string, string> = {};
    
    for (const [targetKey, sourceKey] of Object.entries(fieldMappings)) {
      if (sourceKey && currentData.fields[sourceKey]) {
        preview[targetKey] = currentData.fields[sourceKey];
      } else {
        preview[targetKey] = '';
      }
    }
    
    previewData = preview;
  }

  /**
   * 处理映射变更
   */
  function handleMappingChange(targetKey: string, sourceKey: string): void {
    fieldMappings[targetKey] = sourceKey;
    updatePreview();
  }

  /**
   * 自动映射
   */
  function autoMap(): void {
    initializeMappings();
  }

  /**
   * 清除所有映射
   */
  function clearMappings(): void {
    fieldMappings = {};
    previewData = {};
  }

  /**
   * 确认映射
   */
  async function confirmMapping(): Promise<void> {
    isProcessing = true;
    
    try {
      // 构建映射配置
      const config = {
        fieldMappings,
        sourceTemplate: fromTemplate,
        targetTemplate: toTemplate,
        mode
      };

      // 发射确认事件
      dispatch('confirm', { mappings: fieldMappings, config });
      
      // 发射全局事件
      cardEditEventBus.emitSync('template:mapping-completed', {
        mappings: fieldMappings,
        stats: {
          mapped: Object.keys(fieldMappings).filter(k => fieldMappings[k]).length,
          created: targetFields.length - Object.keys(fieldMappings).filter(k => fieldMappings[k]).length,
          merged: 0
        }
      });
      
    } catch (error) {
      console.error('[TemplateMappingModal] Mapping failed:', error);
    } finally {
      isProcessing = false;
    }
  }

  /**
   * 取消映射
   */
  function cancelMapping(): void {
    dispatch('cancel');
  }

  // 监听isOpen变化，初始化映射
  $effect(() => {
    if (isOpen) {
      initializeMappings();
    }
  });
</script>

{#if isOpen}
  <div class="mapping-overlay" role="presentation">
    <div class="mapping-modal" role="dialog" aria-modal="true" aria-label="模板字段映射">
      <header class="mapping-header">
        <div class="header-title">
          <EnhancedIcon name="shuffle" size="20" />
          <h2>模板字段映射</h2>
        </div>
        <button class="close-btn" onclick={cancelMapping}>
          <EnhancedIcon name="x" size="16" />
        </button>
      </header>

      <div class="mapping-content">
        <div class="template-info">
          <div class="template-card from">
            <h3>源模板</h3>
            <div class="template-name">{fromTemplate.name}</div>
            <div class="field-count">{sourceFields.length} 个字段</div>
          </div>
          
          <div class="arrow">
            <EnhancedIcon name="arrow-right" size="24" />
          </div>
          
          <div class="template-card to">
            <h3>目标模板</h3>
            <div class="template-name">{toTemplate.name}</div>
            <div class="field-count">{targetFields.length} 个字段</div>
          </div>
        </div>

        <div class="mapping-controls">
          <button class="control-btn" onclick={autoMap}>
            <EnhancedIcon name="zap" size="14" />
            自动映射
          </button>
          <button class="control-btn" onclick={clearMappings}>
            <EnhancedIcon name="trash-2" size="14" />
            清除映射
          </button>
        </div>

        <div class="mapping-table">
          <div class="table-header">
            <div class="col-target">目标字段</div>
            <div class="col-source">源字段</div>
            <div class="col-preview">预览</div>
          </div>
          
          <div class="table-body">
            {#each targetFields() as targetField}
              <div class="mapping-row">
                <div class="col-target">
                  <div class="field-info">
                    <div class="field-name">{targetField.name || targetField.key}</div>
                    <div class="field-key">{targetField.key}</div>
                  </div>
                </div>

                <div class="col-source">
                  <select
                    class="source-select"
                    value={fieldMappings[targetField.key] || ''}
                    onchange={(e) => handleMappingChange(targetField.key, (e.target as HTMLSelectElement).value)}
                  >
                    <option value="">-- 选择源字段 --</option>
                    {#each sourceFields() as sourceField}
                      <option value={sourceField.key}>
                        {sourceField.name || sourceField.key}
                      </option>
                    {/each}
                  </select>
                </div>
                
                <div class="col-preview">
                  <div class="preview-content">
                    {previewData[targetField.key] || '(空)'}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <footer class="mapping-footer">
        <div class="mapping-stats">
          已映射: {Object.values(fieldMappings).filter(v => v).length} / {targetFields.length}
        </div>
        
        <div class="footer-actions">
          <button class="footer-btn btn-secondary" onclick={cancelMapping}>
            取消
          </button>
          <button 
            class="footer-btn btn-primary"
            onclick={confirmMapping}
            disabled={isProcessing || Object.values(fieldMappings).filter(v => v).length === 0}
          >
            {#if isProcessing}
              <div class="btn-spinner"></div>
              处理中...
            {:else}
              <EnhancedIcon name="check" size="16" />
              确认映射
            {/if}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .mapping-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000002;
    padding: 1rem;
  }

  .mapping-modal {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mapping-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-title h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .mapping-content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .template-info {
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .template-card {
    flex: 1;
    padding: 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    text-align: center;
  }

  .template-card h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .template-name {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .field-count {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .template-card.from {
    border-color: var(--text-accent);
  }

  .template-card.to {
    border-color: var(--text-success);
  }

  .arrow {
    color: var(--text-muted);
  }

  .mapping-controls {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .control-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .control-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .mapping-table {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .table-header > div {
    padding: 0.75rem;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-normal);
    border-right: 1px solid var(--background-modifier-border);
  }

  .table-header > div:last-child {
    border-right: none;
  }

  .table-body {
    max-height: 300px;
    overflow-y: auto;
  }

  .mapping-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .mapping-row:last-child {
    border-bottom: none;
  }

  .mapping-row > div {
    padding: 0.75rem;
    border-right: 1px solid var(--background-modifier-border);
  }

  .mapping-row > div:last-child {
    border-right: none;
  }

  .field-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field-name {
    font-weight: 500;
    color: var(--text-normal);
  }

  .field-key {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-monospace);
  }

  .source-select {
    width: 100%;
    padding: 0.5rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    font-size: 0.875rem;
  }

  .source-select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .preview-content {
    font-size: 0.875rem;
    color: var(--text-muted);
    max-height: 3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
  }

  .mapping-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .mapping-stats {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .footer-actions {
    display: flex;
    gap: 0.75rem;
  }

  .footer-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .footer-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-left-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .mapping-modal {
      max-width: 100%;
      margin: 0;
    }

    .template-info {
      flex-direction: column;
      gap: 1rem;
    }

    .arrow {
      transform: rotate(90deg);
    }

    .table-header,
    .mapping-row {
      grid-template-columns: 1fr;
    }

    .table-header > div,
    .mapping-row > div {
      border-right: none;
      border-bottom: 1px solid var(--background-modifier-border);
    }

    .mapping-footer {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .footer-actions {
      justify-content: center;
    }
  }
</style>
