<script lang="ts">
  /**
   * FieldEditorContainer - 字段编辑器容器组件
   * 
   * 设计目标：
   * 1. 管理多个字段的编辑状态
   * 2. 使用OptimizedFieldEditor实现性能优化
   * 3. 提供统一的字段操作接口
   * 4. 支持字段间的平滑切换
   */

  import { onMount, onDestroy } from "svelte";
  import OptimizedFieldEditor from "./OptimizedFieldEditor.svelte";
  import { FieldEditorManager, type FieldConfig } from "../../utils/FieldEditorManager";
  import type AnkiPlugin from "../../main";

  // 组件属性接口
  interface Props {
    /** 字段配置列表 */
    fields: FieldConfig[];
    
    /** 插件实例 */
    plugin: AnkiPlugin;
    
    /** 是否只读 */
    readOnly?: boolean;
    
    /** 字段内容变更回调 */
    onFieldContentChange?: (fieldKey: string, content: string) => void;
    
    /** 字段激活回调 */
    onFieldActivate?: (fieldKey: string) => void;
    
    /** 字段失活回调 */
    onFieldDeactivate?: (fieldKey: string) => void;
    
    /** 所有字段内容变更回调 */
    onAllFieldsChange?: (contents: Record<string, string>) => void;
  }

  let {
    fields,
    plugin,
    readOnly = false,
    onFieldContentChange,
    onFieldActivate,
    onFieldDeactivate,
    onAllFieldsChange
  }: Props = $props();

  // 组件状态
  let fieldEditorManager: FieldEditorManager;
  let activeFieldKey = $state<string | null>(null);
  let fieldContents = $state<Record<string, string>>({});
  let isInitialized = $state(false);

  // 监听字段配置变化
  $effect(() => {
    if (isInitialized && fieldEditorManager) {
      updateFieldsConfiguration(fields);
    }
  });

  onMount(() => {
    initializeManager();
  });

  onDestroy(() => {
    if (fieldEditorManager) {
      fieldEditorManager.destroy();
    }
  });

  /**
   * 初始化字段编辑器管理器
   */
  function initializeManager() {
    console.log('FieldEditorContainer: 初始化管理器', { fieldsCount: fields.length });
    
    try {
      // 初始化字段内容
      const initialContents: Record<string, string> = {};
      fields.forEach(field => {
        initialContents[field.key] = field.content || '';
      });
      fieldContents = initialContents;

      // 创建管理器
      fieldEditorManager = new FieldEditorManager(plugin, fields);

      // 监听字段状态变更
      fieldEditorManager.on('fieldActivated', (data) => {
        console.log('FieldEditorContainer: 字段激活', data);
        activeFieldKey = data.fieldKey;
        onFieldActivate?.(data.fieldKey);
      });

      fieldEditorManager.on('fieldDeactivated', (data) => {
        console.log('FieldEditorContainer: 字段失活', data);
        if (activeFieldKey === data.fieldKey) {
          activeFieldKey = null;
        }
        onFieldDeactivate?.(data.fieldKey);
      });

      // 监听字段内容变更
      fieldEditorManager.on('fieldContentChanged', (data) => {
        console.log('FieldEditorContainer: 字段内容变更', { 
          fieldKey: data.fieldKey, 
          contentLength: data.content.length 
        });
        
        fieldContents[data.fieldKey] = data.content;
        fieldContents = { ...fieldContents }; // 触发响应式更新
        
        onFieldContentChange?.(data.fieldKey, data.content);
        onAllFieldsChange?.(fieldContents);
      });

      isInitialized = true;
      console.log('FieldEditorContainer: 管理器初始化完成');

    } catch (error) {
      console.error('FieldEditorContainer: 管理器初始化失败', error);
    }
  }

  /**
   * 更新字段配置
   */
  function updateFieldsConfiguration(newFields: FieldConfig[]) {
    if (!fieldEditorManager) return;

    console.log('FieldEditorContainer: 更新字段配置', { 
      oldCount: fieldEditorManager.getAllFieldConfigs().length,
      newCount: newFields.length 
    });

    // 移除不存在的字段
    const newFieldKeys = new Set(newFields.map(f => f.key));
    const currentFieldKeys = fieldEditorManager.getAllFieldConfigs().map(f => f.key);
    
    currentFieldKeys.forEach(key => {
      if (!newFieldKeys.has(key)) {
        fieldEditorManager.removeField(key);
        delete fieldContents[key];
      }
    });

    // 添加或更新字段
    newFields.forEach(field => {
      const existingField = fieldEditorManager.getFieldConfig(field.key);
      if (existingField) {
        // 更新现有字段（如果需要的话）
        if (JSON.stringify(existingField) !== JSON.stringify(field)) {
          fieldEditorManager.removeField(field.key);
          fieldEditorManager.addField(field);
        }
      } else {
        // 添加新字段
        fieldEditorManager.addField(field);
      }
      
      fieldContents[field.key] = field.content || '';
    });

    fieldContents = { ...fieldContents }; // 触发响应式更新
  }

  /**
   * 激活指定字段
   */
  async function activateField(fieldKey: string) {
    if (!fieldEditorManager) return;

    console.log('FieldEditorContainer: 激活字段', fieldKey);
    
    try {
      const success = await fieldEditorManager.activateField(fieldKey);
      if (!success) {
        console.warn('FieldEditorContainer: 字段激活失败', fieldKey);
      }
    } catch (error) {
      console.error('FieldEditorContainer: 字段激活异常', fieldKey, error);
    }
  }

  /**
   * 失活指定字段
   */
  async function deactivateField(fieldKey: string) {
    if (!fieldEditorManager) return;

    console.log('FieldEditorContainer: 失活字段', fieldKey);
    
    try {
      const success = await fieldEditorManager.deactivateField(fieldKey);
      if (!success) {
        console.warn('FieldEditorContainer: 字段失活失败', fieldKey);
      }
    } catch (error) {
      console.error('FieldEditorContainer: 字段失活异常', fieldKey, error);
    }
  }

  /**
   * 处理字段内容变更
   */
  function handleFieldContentChange(fieldKey: string, content: string) {
    if (!fieldEditorManager) return;

    fieldEditorManager.updateFieldContent(fieldKey, content);
  }

  /**
   * 处理字段激活
   */
  function handleFieldActivate(fieldKey: string) {
    activateField(fieldKey);
  }

  /**
   * 处理字段失活
   */
  function handleFieldDeactivate(fieldKey: string) {
    // 字段失活通常由管理器自动处理，这里主要是记录日志
    console.log('FieldEditorContainer: 处理字段失活', fieldKey);
  }

  /**
   * 获取统计信息
   */
  function getStats() {
    if (!fieldEditorManager) {
      return {
        totalFields: fields.length,
        activeField: null,
        editingFields: [],
        initialized: false
      };
    }

    return {
      ...fieldEditorManager.getStats(),
      initialized: isInitialized
    };
  }

  /**
   * 验证所有字段
   */
  function validateAllFields() {
    if (!fieldEditorManager) {
      return { isValid: true, errors: {} };
    }

    return fieldEditorManager.validateAllFields();
  }

  // 导出公共方法
  export function getFieldContents() {
    return fieldContents;
  }

  export function setFieldContent(fieldKey: string, content: string) {
    if (fieldEditorManager) {
      fieldEditorManager.updateFieldContent(fieldKey, content);
    }
  }

  export function getActiveField() {
    return activeFieldKey;
  }

  export function activateNextField() {
    return fieldEditorManager?.activateNextField();
  }

  export function activatePreviousField() {
    return fieldEditorManager?.activatePreviousField();
  }

  export function deactivateAllFields() {
    return fieldEditorManager?.deactivateAllFields();
  }
</script>

<!-- 字段编辑器容器 -->
<div class="field-editor-container">
  {#if isInitialized && fields.length > 0}
    {#each fields as field (field.key)}
      <OptimizedFieldEditor
        fieldKey={field.key}
        fieldName={field.name}
        content={fieldContents[field.key] || ''}
        isActive={activeFieldKey === field.key}
        placeholder={field.placeholder}
        {plugin}
        minHeight={field.minHeight}
        maxHeight={field.maxHeight}
        readOnly={readOnly || field.readOnly}
        onContentChange={handleFieldContentChange}
        onActivate={handleFieldActivate}
        onDeactivate={handleFieldDeactivate}
      />
    {/each}
  {:else if !isInitialized}
    <div class="field-editor-loading">
      <div class="loading-spinner"></div>
      <span>字段编辑器初始化中...</span>
    </div>
  {:else}
    <div class="field-editor-empty">
      <span>没有可编辑的字段</span>
    </div>
  {/if}

  <!-- 调试信息（开发模式） -->
  {#if import.meta.env.DEV}
    <div class="field-editor-debug">
      <details>
        <summary>调试信息</summary>
        <pre>{JSON.stringify(getStats(), null, 2)}</pre>
      </details>
    </div>
  {/if}
</div>

<style>
  .field-editor-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .field-editor-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--background-modifier-border);
    border-top: 2px solid var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .field-editor-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--text-muted);
    font-style: italic;
    font-size: 14px;
  }

  .field-editor-debug {
    margin-top: 16px;
    padding: 8px;
    background: var(--background-secondary);
    border-radius: 4px;
    font-size: 11px;
    opacity: 0.7;
  }

  .field-editor-debug summary {
    cursor: pointer;
    color: var(--text-muted);
    font-weight: 500;
  }

  .field-editor-debug pre {
    margin: 8px 0 0 0;
    color: var(--text-normal);
    font-family: var(--font-monospace);
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .field-editor-container {
      gap: 6px;
    }

    .field-editor-loading,
    .field-editor-empty {
      padding: 24px;
      font-size: 13px;
    }
  }
</style>
