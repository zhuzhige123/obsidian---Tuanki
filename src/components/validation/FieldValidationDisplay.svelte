<script lang="ts">
  import type { FieldValidationError } from "../../validation/field-validation";
  
  interface Props {
    errors: FieldValidationError[];
    warnings: FieldValidationError[];
    infos: FieldValidationError[];
    showDetails?: boolean;
  }
  
  let { errors, warnings, infos, showDetails = false }: Props = $props();
  
  let showAllDetails = $state(showDetails);
  
  // 按字段分组错误
  const errorsByField = $derived(() => {
    const grouped = new Map<string, FieldValidationError[]>();
    
    [...errors, ...warnings, ...infos].forEach(error => {
      if (!grouped.has(error.fieldId)) {
        grouped.set(error.fieldId, []);
      }
      grouped.get(error.fieldId)!.push(error);
    });
    
    return grouped;
  });
  
  // 获取严重程度的图标和颜色
  function getSeverityIcon(severity: 'error' | 'warning' | 'info'): string {
    switch (severity) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '•';
    }
  }
  
  function getSeverityClass(severity: 'error' | 'warning' | 'info'): string {
    switch (severity) {
      case 'error': return 'validation-error';
      case 'warning': return 'validation-warning';
      case 'info': return 'validation-info';
      default: return '';
    }
  }
</script>

{#if errors.length > 0 || warnings.length > 0 || infos.length > 0}
  <div class="validation-panel">
    <!-- 总览 -->
    <div class="validation-summary">
      {#if errors.length > 0}
        <span class="validation-count error">
          ❌ {errors.length} 个错误
        </span>
      {/if}
      
      {#if warnings.length > 0}
        <span class="validation-count warning">
          ⚠️ {warnings.length} 个警告
        </span>
      {/if}
      
      {#if infos.length > 0}
        <span class="validation-count info">
          ℹ️ {infos.length} 个提示
        </span>
      {/if}
      
      <button 
        class="toggle-details"
        onclick={() => showAllDetails = !showAllDetails}
      >
        {showAllDetails ? '收起详情' : '显示详情'}
      </button>
    </div>
    
    <!-- 详细信息 -->
    {#if showAllDetails}
      <div class="validation-details">
        {#each Array.from(errorsByField.entries()) as [fieldId, fieldErrors]}
          <div class="field-validation">
            <h4 class="field-name">{fieldErrors[0].fieldName}</h4>
            
            {#each fieldErrors as error}
              <div class="validation-item {getSeverityClass(error.severity)}">
                <div class="validation-header">
                  <span class="severity-icon">{getSeverityIcon(error.severity)}</span>
                  <span class="rule-name">{error.ruleName}</span>
                </div>
                
                <div class="validation-message">
                  {error.message}
                </div>
                
                {#if error.suggestions && error.suggestions.length > 0}
                  <div class="validation-suggestions">
                    <strong>建议：</strong>
                    <ul>
                      {#each error.suggestions as suggestion}
                        <li>{suggestion}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .validation-panel {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-secondary);
    margin: 8px 0;
  }
  
  .validation-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .validation-count {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.9em;
    font-weight: 500;
  }
  
  .validation-count.error {
    color: var(--text-error);
  }
  
  .validation-count.warning {
    color: var(--text-warning);
  }
  
  .validation-count.info {
    color: var(--text-muted);
  }
  
  .toggle-details {
    margin-left: auto;
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.85em;
  }
  
  .toggle-details:hover {
    background: var(--background-modifier-hover);
  }
  
  .validation-details {
    padding: 12px;
  }
  
  .field-validation {
    margin-bottom: 16px;
  }
  
  .field-validation:last-child {
    margin-bottom: 0;
  }
  
  .field-name {
    font-size: 0.95em;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .validation-item {
    margin-bottom: 8px;
    padding: 8px;
    border-radius: 4px;
    border-left: 3px solid;
  }
  
  .validation-item.validation-error {
    background: var(--background-modifier-error);
    border-left-color: var(--text-error);
  }
  
  .validation-item.validation-warning {
    background: var(--background-modifier-warning);
    border-left-color: var(--text-warning);
  }
  
  .validation-item.validation-info {
    background: var(--background-modifier-info);
    border-left-color: var(--text-muted);
  }
  
  .validation-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  
  .severity-icon {
    font-size: 0.9em;
  }
  
  .rule-name {
    font-weight: 500;
    font-size: 0.9em;
  }
  
  .validation-message {
    font-size: 0.9em;
    color: var(--text-normal);
    margin-bottom: 6px;
  }
  
  .validation-suggestions {
    font-size: 0.85em;
    color: var(--text-muted);
  }
  
  .validation-suggestions ul {
    margin: 4px 0 0 16px;
    padding: 0;
  }
  
  .validation-suggestions li {
    margin-bottom: 2px;
  }
  
  /* 深色主题适配 */
  .theme-dark .validation-item.validation-error {
    background: rgba(255, 82, 82, 0.1);
  }
  
  .theme-dark .validation-item.validation-warning {
    background: rgba(255, 165, 0, 0.1);
  }
  
  .theme-dark .validation-item.validation-info {
    background: rgba(100, 149, 237, 0.1);
  }
</style>
