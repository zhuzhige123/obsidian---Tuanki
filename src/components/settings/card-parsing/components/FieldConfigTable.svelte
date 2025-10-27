<!--
  字段配置表格组件
  职责：管理模板的字段配置（字段名、正则表达式、标志位）
-->
<script lang="ts">
  import type { TemplateField } from '../../../../types/newCardParsingTypes';

  interface Props {
    fields: TemplateField[];
    onFieldsChange: (fields: TemplateField[]) => void;
    disabled?: boolean;
  }

  let { fields, onFieldsChange, disabled = false }: Props = $props();

  // 添加字段
  function addField() {
    const newFields = [
      ...fields,
      { name: '', pattern: '', isRegex: false, flags: 'ms', required: false }
    ];
    onFieldsChange(newFields);
  }

  // 删除字段
  function removeField(index: number) {
    const newFields = fields.filter((_, i) => i !== index);
    onFieldsChange(newFields);
  }

  // 更新字段
  function updateField(index: number, key: keyof TemplateField, value: any) {
    const newFields = [...fields];
    (newFields[index] as any)[key] = value;
    onFieldsChange(newFields);
  }
</script>

<div class="field-config-container">
  <h4>字段配置</h4>

  <!-- 字段配置表格 -->
  <div class="fields-table">
    <div class="fields-table-header">
      <div class="field-col-name">字段名</div>
      <div class="field-col-flag">正则标志</div>
      <div class="field-col-regex">正则表达式</div>
      <div class="field-col-action">操作</div>
    </div>

    <div class="fields-table-body">
      {#each fields as field, index}
        <div class="field-row">
          <div class="field-col-name">
            <input
              type="text"
              bind:value={field.name}
              placeholder="例如：Front"
              class="field-input"
              {disabled}
            />
          </div>
          <div class="field-col-flag">
            <input
              type="text"
              bind:value={field.flags}
              placeholder="ms"
              class="field-input"
              {disabled}
            />
          </div>
          <div class="field-col-regex">
            <input
              type="text"
              bind:value={field.pattern}
              placeholder="^(.+?)(?=---div---|$)"
              class="field-input regex-input"
              {disabled}
            />
          </div>
          <div class="field-col-action">
            <button
              type="button"
              class="btn-remove"
              onclick={() => removeField(index)}
              title="删除字段"
              disabled={disabled}
            >
              删除
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <button 
    type="button" 
    class="btn btn-secondary" 
    onclick={addField}
    disabled={disabled}
  >
    + 添加字段
  </button>
</div>

<style>
  .field-config-container h4 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 字段配置表格样式 */
  .fields-table {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .fields-table-header {
    display: grid;
    grid-template-columns: 1fr 100px 2fr 80px;
    gap: 1px;
    background: var(--background-secondary);
    font-weight: 600;
    font-size: 13px;
    color: var(--text-normal);
  }

  .fields-table-header > div {
    padding: 12px 8px;
    background: var(--background-secondary);
    border-right: 1px solid var(--background-modifier-border);
  }

  .fields-table-header > div:last-child {
    border-right: none;
  }

  .fields-table-body {
    background: var(--background-primary);
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 100px 2fr 80px;
    gap: 1px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .field-row:last-child {
    border-bottom: none;
  }

  .field-row > div {
    padding: 8px;
    background: var(--background-primary);
    display: flex;
    align-items: center;
  }

  .field-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  .field-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-remove {
    padding: 4px 8px;
    background: var(--background-modifier-error);
    color: var(--text-error);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-remove:hover:not(:disabled) {
    background: var(--background-modifier-error-hover);
  }

  .btn-remove:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .fields-table-header,
    .field-row {
      grid-template-columns: 1fr 80px 1.5fr 60px;
      font-size: 12px;
    }

    .field-input {
      font-size: 12px;
      padding: 4px 6px;
    }

    .btn-remove {
      font-size: 11px;
      padding: 3px 6px;
    }
  }
</style>


