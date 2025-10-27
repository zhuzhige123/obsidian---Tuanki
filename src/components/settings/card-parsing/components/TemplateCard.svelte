<!--
  模板卡片组件
  职责：展示单个解析模板的信息和操作按钮
-->
<script lang="ts">
  import type { ParseTemplate } from '../../../../types/newCardParsingTypes';

  interface Props {
    template: ParseTemplate;
    onEdit: (template: ParseTemplate) => void;
    onDuplicate: (templateId: string) => void;
    onDelete: (templateId: string) => void;
  }

  let { template, onEdit, onDuplicate, onDelete }: Props = $props();
</script>

<div class="template-card" class:official={template.isOfficial}>
  <div class="template-card-header">
    <div class="template-info">
      <h4 class="template-name">
        {template.name}
      </h4>
      <!-- 徽章组 -->
      <div class="template-badges">
        {#if template.isOfficial}
          <span class="badge badge-official">官方</span>
        {/if}
        {#if template.tuankiMetadata?.source === 'anki_imported'}
          <span class="badge badge-anki">Anki</span>
        {:else}
          <span class="badge badge-tuanki">Tuanki</span>
        {/if}
      </div>
      <p class="template-description">{template.description || '无描述'}</p>
    </div>
    <span class="template-type-badge {template.type}">
      {template.type === 'single-field' ? '单字段' : '完整正则'}
    </span>
  </div>

  <div class="template-content">
    {#if template.fields}
      <div class="template-fields">
        <div class="fields-label">字段配置 ({template.fields.length})</div>
        <div class="fields-preview">
          {#each template.fields.slice(0, 3) as field}
            <span class="field-tag">{field.name}</span>
          {/each}
          {#if template.fields.length > 3}
            <span class="field-tag more">+{template.fields.length - 3}</span>
          {/if}
        </div>
      </div>
    {:else if template.regex}
      <div class="template-regex">
        <div class="regex-label">正则表达式</div>
        <code class="regex-preview">{template.regex.slice(0, 50)}{template.regex.length > 50 ? '...' : ''}</code>
      </div>
    {/if}
  </div>

  <div class="template-card-actions">
    <button class="btn btn-secondary btn-sm" onclick={() => onEdit(template)}>
      {template.isOfficial ? '查看' : '编辑'}
    </button>
    <button class="btn btn-secondary btn-sm" onclick={() => onDuplicate(template.id)}>
      复制
    </button>
    {#if !template.isDefault && !template.isOfficial}
      <button class="btn btn-danger btn-sm" onclick={() => onDelete(template.id)}>
        删除
      </button>
    {/if}
  </div>
</div>

<style>
  .template-card {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--tuanki-radius-lg);
    padding: var(--tuanki-space-lg);
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .template-card:hover {
    border-color: var(--interactive-accent);
    box-shadow: 0 4px 12px var(--background-modifier-box-shadow);
    transform: translateY(-2px);
  }

  .template-card.official {
    border-color: var(--color-accent);
    background: linear-gradient(135deg, var(--background-secondary) 0%, rgba(var(--color-accent-rgb), 0.05) 100%);
  }

  .template-card-header {
    margin-bottom: var(--tuanki-space-md);
  }

  .template-name {
    margin: 0 0 var(--tuanki-space-xs) 0;
    color: var(--text-normal);
    font-size: 1.1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-xs);
  }

  .template-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .template-type-badge {
    position: absolute;
    top: var(--tuanki-space-md);
    right: var(--tuanki-space-md);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .template-type-badge.single-field {
    background: var(--color-green);
    color: var(--text-on-accent);
  }

  .template-type-badge.complete-regex {
    background: var(--color-blue);
    color: var(--text-on-accent);
  }

  .template-card-actions {
    display: flex;
    gap: var(--tuanki-space-xs);
    justify-content: flex-end;
  }

  .template-content {
    margin-bottom: var(--tuanki-space-lg);
    min-height: 60px;
  }

  .template-fields {
    margin-bottom: var(--tuanki-space-sm);
  }

  .fields-label, .regex-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: var(--tuanki-space-xs);
    font-weight: 500;
  }

  .fields-preview {
    display: flex;
    flex-wrap: wrap;
    gap: var(--tuanki-space-xs);
  }

  .field-tag {
    background: var(--background-primary);
    color: var(--text-normal);
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--background-modifier-border);
  }

  .field-tag.more {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .template-regex {
    margin-bottom: var(--tuanki-space-sm);
  }

  .regex-preview {
    display: block;
    background: var(--background-primary);
    padding: var(--tuanki-space-sm);
    border-radius: var(--tuanki-radius-sm);
    font-family: var(--font-monospace);
    font-size: 0.75rem;
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    word-break: break-all;
  }

  /* 徽章样式 */
  .template-badges {
    display: flex;
    gap: 6px;
    margin: 6px 0;
  }

  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-official {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .badge-tuanki {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    color: white;
  }

  .badge-anki {
    background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
    color: white;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 0.8rem;
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

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-danger {
    background: var(--color-red);
    color: var(--text-on-accent);
  }

  .btn-danger:hover {
    background: var(--color-red);
    opacity: 0.8;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .template-card {
      padding: var(--tuanki-space-md);
    }

    .template-card-actions {
      flex-direction: column;
      gap: var(--tuanki-space-xs);
    }

    .template-card-actions button {
      width: 100%;
    }
  }
</style>


