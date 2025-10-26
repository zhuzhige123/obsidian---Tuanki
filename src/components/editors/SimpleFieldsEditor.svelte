<script lang="ts">
  import type { FieldTemplate } from '../../data/template-types';
  import type AnkiPlugin from '../../main';

  interface Props {
    appliedFieldTemplate: FieldTemplate | null;
    fields: Record<string, string>;
    plugin: AnkiPlugin;
  }

  let { appliedFieldTemplate, fields, plugin }: Props = $props();

  // 事件分发
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher<{
    change: { fieldKey: string; value: string };
  }>();

  // 处理字段变更
  function handleFieldChange(fieldKey: string, value: string) {
    dispatch('change', { fieldKey, value });
  }

  // 自动调整文本框高度
  function autoResize(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(80, textarea.scrollHeight) + 'px';
  }

  // 获取要显示的字段列表
  function getFieldsToShow(): Array<{ key: string; label: string; value: string }> {
    const result: Array<{ key: string; label: string; value: string }> = [];
    
    // 如果有应用的模板，显示模板字段
    if (appliedFieldTemplate?.fields) {
      for (const field of appliedFieldTemplate.fields) {
        result.push({
          key: field.key,
          label: field.label || field.key,
          value: fields[field.key] || ''
        });
      }
    }
    
    // 添加默认的问题和答案字段（如果不在模板中）
    const hasQuestion = result.some(f => f.key === 'question');
    const hasAnswer = result.some(f => f.key === 'answer');
    
    if (!hasQuestion) {
      result.unshift({
        key: 'question',
        label: '正面',
        value: fields['question'] || ''
      });
    }
    
    if (!hasAnswer) {
      result.push({
        key: 'answer',
        label: '背面',
        value: fields['answer'] || ''
      });
    }
    
    return result;
  }

  let fieldsToShow = $derived(getFieldsToShow());
</script>

<div class="简洁字段编辑器">
  <div class="字段列表">
    {#each fieldsToShow as field (field.key)}
      <div class="字段组">
        <div class="字段标签">
          <span class="标签文本">{field.label}</span>
          <span class="字段键名">({field.key})</span>
        </div>
        <div class="字段输入区">
          <textarea
            class="字段输入框"
            value={field.value}
            placeholder="请输入{field.label}内容..."
            oninput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              handleFieldChange(field.key, target.value);
              autoResize(target);
            }}
          ></textarea>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .简洁字段编辑器 {
    width: 100%;
    padding: 1rem;
    background: var(--background-primary);
  }

  .字段列表 {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .字段组 {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .字段标签 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.25rem;
  }

  .标签文本 {
    font-weight: 600;
    color: var(--text-normal);
    font-size: 0.9rem;
  }

  .字段键名 {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-monospace);
  }

  .字段输入区 {
    position: relative;
  }

  .字段输入框 {
    width: 100%;
    min-height: 80px;
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-text);
    font-size: 0.9rem;
    line-height: 1.5;
    resize: none;
    overflow: hidden;
    box-sizing: border-box;
    transition: border-color 0.2s ease;
  }

  .字段输入框:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  .字段输入框::placeholder {
    color: var(--text-muted);
    font-style: italic;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .简洁字段编辑器 {
      padding: 0.75rem;
    }

    .字段列表 {
      gap: 1rem;
    }

    .字段输入框 {
      font-size: 0.85rem;
      padding: 0.6rem;
    }
  }

  /* 暗色主题优化 */
  @media (prefers-color-scheme: dark) {
    .字段输入框 {
      background: var(--background-primary);
      border-color: var(--background-modifier-border);
    }

    .字段输入框:focus {
      border-color: var(--interactive-accent);
    }
  }
</style>
