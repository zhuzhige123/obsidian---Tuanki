<script lang="ts">
  import type { FieldTemplate, TriadTemplate } from '../../data/template-types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { createEventDispatcher } from 'svelte';
  import { showNotification } from '../../utils/notifications';
  import {
    generateMappingSuggestions,
    FORMAT_TRANSFORMS,
    validateMappingConfig,
    type FieldMappingConfig
  } from '../../utils/template-content-mapping';
  import {
    applyMarkdownFormatConversion,
    generateFormatRulesFromTemplates,
    MARKDOWN_FORMAT_RULES,
    type MarkdownFormatConfig
  } from '../../utils/markdown-format-converter';

  interface Props {
    isOpen: boolean;
    mode: 'fields' | 'markdown';
    fromTemplate: FieldTemplate | TriadTemplate;
    toTemplate: FieldTemplate | TriadTemplate;
    currentData: {
      fields?: Record<string, string>;
      markdownContent?: string;
    };
  }

  let { isOpen, mode, fromTemplate, toTemplate, currentData }: Props = $props();

  const dispatch = createEventDispatcher<{
    confirm: { 
      mappings: Record<string, string | string[]>; 
      formatTransforms?: Record<string, string>;
    };
    cancel: void;
  }>();

  // 字段映射状态
  let fieldMappings = $state<Record<string, string | string[]>>({});
  let formatTransforms = $state<Record<string, string>>({});

  // MD格式转换预览
  let showPreview = $state(false);
  let previewContent = $state('');

  // 获取源字段和目标字段
  let sourceFields = $derived(() => {
    if (mode === 'fields') {
      const template = fromTemplate as FieldTemplate;
      return template.fields?.filter(f => f.type === 'field').map(f => (f as any).key) || [];
    } else {
      // MD模式下，从当前数据中提取字段
      return Object.keys(currentData.fields || {});
    }
  });

  let targetFields = $derived(() => {
    if (mode === 'fields') {
      const template = toTemplate as FieldTemplate;
      return template.fields?.filter(f => f.type === 'field').map(f => (f as any).key) || [];
    } else {
      const template = toTemplate as TriadTemplate;
      return template.fieldTemplate.fields?.filter(f => f.type === 'field').map(f => (f as any).key) || [];
    }
  });

  // 初始化映射
  $effect(() => {
    if (isOpen && fromTemplate && toTemplate) {
      // 使用智能映射建议
      const suggestions = generateMappingSuggestions(fromTemplate, toTemplate, mode);
      fieldMappings = suggestions;
      formatTransforms = {};

      console.log('智能映射建议:', suggestions);
    }
  });

  function addFieldMapping(sourceField: string) {
    if (!fieldMappings[sourceField]) {
      fieldMappings[sourceField] = '';
      // 触发响应式更新
      fieldMappings = { ...fieldMappings };
    }
  }

  function removeFieldMapping(sourceField: string) {
    delete fieldMappings[sourceField];
    fieldMappings = { ...fieldMappings };
  }

  function setMappingTarget(sourceField: string, target: string) {
    fieldMappings[sourceField] = target;
  }

  function toggleMultipleMapping(sourceField: string, targetField: string) {
    const current = fieldMappings[sourceField];
    if (Array.isArray(current)) {
      const index = current.indexOf(targetField);
      if (index > -1) {
        current.splice(index, 1);
      } else {
        current.push(targetField);
      }
    } else {
      fieldMappings[sourceField] = [targetField];
    }
    fieldMappings = { ...fieldMappings };
  }

  function setFormatTransform(field: string, transform: string) {
    formatTransforms[field] = transform;
  }

  function handleConfirm() {
    // 验证映射配置
    const config: FieldMappingConfig = {
      mappings: fieldMappings,
      formatTransforms: Object.keys(formatTransforms).length > 0 ? formatTransforms : undefined,
      mergeSeparator: '\n\n'
    };

    const validation = validateMappingConfig(config);
    if (!validation.valid) {
      showNotification(`映射配置错误: ${validation.errors.join(', ')}`, 'error');
      return;
    }

    dispatch('confirm', {
      mappings: fieldMappings,
      formatTransforms: Object.keys(formatTransforms).length > 0 ? formatTransforms : undefined,
      config
    });
  }

  function handleCancel() {
    dispatch('cancel');
  }

  // 根据字段名判断字段类型，用于颜色区分
  function getFieldType(fieldName: string): string {
    const lowerName = fieldName.toLowerCase();

    // 正面字段
    if (lowerName.includes('question') || lowerName.includes('front') || lowerName.includes('问题') || lowerName.includes('正面')) {
      return 'front';
    }

    // 背面字段
    if (lowerName.includes('answer') || lowerName.includes('back') || lowerName.includes('答案') || lowerName.includes('背面')) {
      return 'back';
    }

    // 笔记字段
    if (lowerName.includes('note') || lowerName.includes('笔记') || lowerName.includes('备注')) {
      return 'note';
    }

    // 链接字段
    if (lowerName.includes('link') || lowerName.includes('url') || lowerName.includes('链接')) {
      return 'link';
    }

    // 默认为通用字段
    return 'general';
  }

  function generatePreview() {
    if (mode === 'markdown' && fromTemplate && toTemplate) {
      try {
        // 生成格式转换规则
        const formatRules = generateFormatRulesFromTemplates(
          fromTemplate as TriadTemplate,
          toTemplate as TriadTemplate
        );

        // 添加用户选择的格式转换
        Object.entries(formatTransforms).forEach(([field, transform]) => {
          if (transform && MARKDOWN_FORMAT_RULES[transform]) {
            formatRules.push(MARKDOWN_FORMAT_RULES[transform]);
          }
        });

        // 应用格式转换
        const config: MarkdownFormatConfig = {
          fromTemplate: fromTemplate as TriadTemplate,
          toTemplate: toTemplate as TriadTemplate,
          fieldMappings,
          formatRules,
          options: {
            preserveContent: true,
            mergeFields: true,
            splitFields: false,
            mergeSeparator: '\n\n',
            splitSeparator: '\n\n---\n\n'
          }
        };

        const result = applyMarkdownFormatConversion(
          currentData.markdownContent || '',
          config
        );

        previewContent = result.content;
        showPreview = true;

        if (result.warnings.length > 0) {
          console.warn('格式转换警告:', result.warnings);
        }

      } catch (error) {
        console.error('生成预览失败:', error);
        showNotification('生成预览失败', 'error');
      }
    }
  }

  // 预设的格式转换选项
  const formatTransformOptions = [
    { label: '保持原样', value: '' },
    ...Object.entries(FORMAT_TRANSFORMS).map(([key, transform]) => ({
      label: transform.name,
      value: key
    }))
  ];
</script>

{#if isOpen}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    onclick={handleCancel}
    onkeydown={(e) => e.key === 'Escape' && handleCancel()}
    tabindex="-1"
  >
    <div
      class="modal-content field-mapping-modal"
      role="document"
    >
      <div class="modal-header">
        <h2>
          <EnhancedIcon name="arrowRight" size={16} />
          模板切换 - 字段映射
        </h2>
        <button class="modal-close" onclick={handleCancel}>
          <EnhancedIcon name="x" size={16} />
        </button>
      </div>

      <div class="modal-body">
        <div class="template-info">
          <div class="template-card">
            <h4>源模板</h4>
            <p>{fromTemplate.name}</p>
            <span class="template-type">{mode === 'fields' ? '字段模板' : 'MD格式模板'}</span>
          </div>
          <div class="arrow">
            <EnhancedIcon name="arrowRight" size={24} />
          </div>
          <div class="template-card">
            <h4>目标模板</h4>
            <p>{toTemplate.name}</p>
            <span class="template-type">{mode === 'fields' ? '字段模板' : 'MD格式模板'}</span>
          </div>
        </div>

        <div class="mapping-section">
          <h3>字段映射配置</h3>
          <p class="mapping-hint">
            配置如何将源模板的字段映射到目标模板。支持一对一、多对一映射。
          </p>

          <div class="mapping-list">
            {#each sourceFields() as sourceField}
              <div class="mapping-item">
                <div class="source-field">
                  <div class="field-label-with-indicator">
                    <div class="field-color-indicator" data-field-type={getFieldType(sourceField)}></div>
                    <span class="field-label">{sourceField}</span>
                  </div>
                </div>

                <div class="mapping-arrow">
                  <EnhancedIcon name="arrowRight" size={16} />
                </div>

                <div class="target-field">
                  {#if fieldMappings[sourceField]}
                    <select
                      value={Array.isArray(fieldMappings[sourceField]) ? '' : fieldMappings[sourceField]}
                      onchange={(e) => setMappingTarget(sourceField, (e.target as HTMLSelectElement).value)}
                    >
                      <option value="">选择目标字段</option>
                      {#each targetFields() as targetField}
                        <option value={targetField}>{targetField}</option>
                      {/each}
                      <option value="__MERGE__">合并到其他字段</option>
                    </select>

                    {#if mode === 'markdown'}
                      <div class="format-transform">
                        <span class="transform-label">格式转换:</span>
                        <select
                          value={formatTransforms[sourceField] || ''}
                          onchange={(e) => setFormatTransform(sourceField, (e.target as HTMLSelectElement).value)}
                        >
                          {#each formatTransformOptions as option}
                            <option value={option.value}>{option.label}</option>
                          {/each}
                        </select>
                      </div>
                    {/if}
                  {:else}
                    <button 
                      class="btn-add-mapping" 
                      onclick={() => addFieldMapping(sourceField)}
                    >
                      添加映射
                    </button>
                  {/if}

                  {#if fieldMappings[sourceField]}
                    <button 
                      class="btn-remove-mapping" 
                      onclick={() => removeFieldMapping(sourceField)}
                    >
                      <EnhancedIcon name="x" size={12} />
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        {#if mode === 'markdown'}
          <div class="preview-section">
            <div class="preview-header">
              <h3>格式转换预览</h3>
              <button class="btn btn-secondary" onclick={generatePreview}>
                生成预览
              </button>
            </div>

            {#if showPreview}
              <div class="preview-content">
                <div class="preview-before">
                  <h4>转换前</h4>
                  <pre>{currentData.markdownContent || '(无内容)'}</pre>
                </div>
                <div class="preview-arrow">
                  <EnhancedIcon name="arrowRight" size={24} />
                </div>
                <div class="preview-after">
                  <h4>转换后</h4>
                  <pre>{previewContent}</pre>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <div class="footer-buttons">
          <button class="btn btn-secondary" onclick={handleCancel}>
            取消
          </button>
          <button class="btn btn-primary" onclick={handleConfirm}>
            确认映射
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100002; /* Higher than card edit modal */
    animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .modal-content {
    background: var(--background-primary);
    border-radius: 16px;
    border: 1px solid var(--background-modifier-border);
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04),
      0 0 0 1px rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    animation: slideUpFade 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .field-mapping-modal {
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
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

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 2rem 1rem 2rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    border-radius: 12px 12px 0 0;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .modal-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-body {
    padding: 1.5rem 2rem 2rem 2rem;
    background: var(--background-primary);
    border-radius: 0 0 12px 12px;
    flex: 1;
    overflow-y: auto;
  }

  .template-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  .template-card {
    flex: 1;
    text-align: center;
  }

  .template-card h4 {
    margin: 0 0 0.5rem 0;
    color: var(--text-muted);
  }

  .template-card p {
    margin: 0 0 0.5rem 0;
    font-weight: 600;
  }

  .template-type {
    font-size: 0.8rem;
    color: var(--text-muted);
    background: var(--background-modifier-border);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .mapping-section h3 {
    margin: 0 0 0.5rem 0;
  }

  .mapping-hint {
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .mapping-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    margin-bottom: 1rem;
    background: var(--background-primary);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    justify-content: flex-start;
  }

  .mapping-item:hover {
    border-color: var(--background-modifier-border-hover);
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .source-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    min-width: 0;
  }

  .field-label-with-indicator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    justify-content: flex-start;
  }

  .field-color-indicator {
    width: 4px;
    height: 20px;
    border-radius: 2px;
    flex-shrink: 0;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* 现代化彩色渐变 - 不同字段类型 */
  .field-color-indicator[data-field-type="front"] {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .field-color-indicator[data-field-type="back"] {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .field-color-indicator[data-field-type="note"] {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .field-color-indicator[data-field-type="link"] {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  }

  .field-color-indicator[data-field-type="general"] {
    background: linear-gradient(135deg, #6b7280, #4b5563);
  }

  .mapping-item:hover .field-color-indicator {
    transform: scaleX(1.3) scaleY(1.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .field-label {
    font-weight: 500;
    color: var(--text-normal);
    font-size: 0.875rem;
    line-height: 1.4;
    flex: 1;
    cursor: default;
    transition: color 0.2s ease;
    text-align: left;
    letter-spacing: 0.01em;
    margin: 0;
    padding: 0;
    display: block;
    width: 100%;
    text-align: left !important;
  }

  .target-field {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .format-transform {
    margin-top: 0.5rem;
  }

  .transform-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .btn-add-mapping, .btn-remove-mapping {
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    cursor: pointer;
  }

  .btn-remove-mapping {
    background: var(--background-modifier-error);
    color: var(--text-on-accent);
  }

  .preview-section {
    margin-top: 2rem;
    border-top: 1px solid var(--background-modifier-border);
    padding-top: 1rem;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .preview-header h3 {
    margin: 0;
  }

  .preview-content {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .preview-before, .preview-after {
    flex: 1;
  }

  .preview-before h4, .preview-after h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .preview-before pre, .preview-after pre {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 1rem;
    font-size: 0.8rem;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .preview-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 0;
    color: var(--text-muted);
  }

  /* 现代化底部按钮样式 */
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    border-radius: 0 0 12px 12px;
  }

  .footer-buttons {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  /* 现代化按钮样式 */
  .btn {
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 80px;
    letter-spacing: 0.01em;
  }

  .btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .btn-secondary {
    background: var(--background-primary);
    color: var(--text-normal);
    border-color: var(--background-modifier-border);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .btn-primary {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;
    border-color: transparent;
    box-shadow: 0 1px 3px rgba(59, 130, 246, 0.3);
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, #2563eb, #1e40af);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-primary:active {
    background: linear-gradient(135deg, #1d4ed8, #1e3a8a);
  }

  /* 现代化动画效果 */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
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

  /* 深色模式优化 */
  @media (prefers-color-scheme: dark) {
    .modal-content {
      box-shadow:
        0 20px 25px -5px rgba(0, 0, 0, 0.3),
        0 10px 10px -5px rgba(0, 0, 0, 0.2),
        0 0 0 1px rgba(255, 255, 255, 0.1);
    }

    .field-color-indicator {
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .mapping-item:hover .field-color-indicator {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .modal-content {
      border-radius: 12px;
      margin: 1rem;
    }

    .field-mapping-modal {
      width: 100%;
      max-width: none;
    }

    .footer-buttons {
      gap: 0.5rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      font-size: 0.8rem;
      min-width: 70px;
    }
  }
</style>
