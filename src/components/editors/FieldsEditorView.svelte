<script lang="ts">
  import type { FieldTemplate } from '../../data/template-types';
  import type AnkiPlugin from '../../main';
  import SimpleFieldsEditor from './SimpleFieldsEditor.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import MarkdownRenderer from '../atoms/MarkdownRenderer.svelte';
  import SimpleTextEditor from '../atoms/SimpleTextEditor.svelte';
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  interface Props {
    appliedFieldTemplate: FieldTemplate | null;
    fields: Record<string, string>;
    plugin: AnkiPlugin;
  }

  let { appliedFieldTemplate, fields, plugin }: Props = $props();

  const dispatch = createEventDispatcher<{
    change: { fieldKey: string; value: string };
  }>();

  // 处理字段变更
  function handleFieldChange(event: CustomEvent<{ fieldKey: string; value: string }>) {
    dispatch('change', event.detail);
  }

  // 直接处理字段变更
  function handleDirectFieldChange(fieldKey: string, value: string) {
    dispatch('change', { fieldKey, value });
  }

  // 字段折叠状态管理
  let collapsedFields = $state<Set<string>>(new Set());

  // 🔥 新增：预览模式状态管理
  let isPreviewMode = $state(false);
  let fieldPreviewStates = $state<Set<string>>(new Set()); // 单独字段的预览状态

  // 初始化空字段为折叠状态
  function initializeFieldStates() {
    const newCollapsedFields = new Set<string>();

    if (appliedFieldTemplate) {
      // 基于模板的字段
      const allFields = (appliedFieldTemplate.fields || []).filter(f => f.type === 'field');
      allFields.forEach(f => {
        const field = f as import('../../data/template-types').FieldTemplateField;
        if (isFieldEmpty(field.key)) {
          newCollapsedFields.add(field.key);
        }
      });
    } else {
      // 非模板字段
      const safeFields = fields || {};
      Object.keys(safeFields).forEach(key => {
        if (!['notes', 'templateid', 'templatename', 'learningstepindex'].includes(key.toLowerCase())) {
          if (isFieldEmpty(key)) {
            newCollapsedFields.add(key);
          }
        }
      });
    }

    collapsedFields = newCollapsedFields;
  }

  // 监听字段变化，自动初始化折叠状态
  $effect(() => {
    if (appliedFieldTemplate || fields) {
      initializeFieldStates();
    }
  });

  // 切换字段折叠状态
  function toggleFieldCollapse(fieldKey: string) {
    if (collapsedFields.has(fieldKey)) {
      collapsedFields.delete(fieldKey);
    } else {
      collapsedFields.add(fieldKey);
    }
    collapsedFields = new Set(collapsedFields); // 触发响应式更新
  }

  // 🔥 新增：预览模式切换函数
  function toggleGlobalPreview() {
    isPreviewMode = !isPreviewMode;
  }

  function toggleFieldPreview(fieldKey: string) {
    if (fieldPreviewStates.has(fieldKey)) {
      fieldPreviewStates.delete(fieldKey);
    } else {
      fieldPreviewStates.add(fieldKey);
    }
    fieldPreviewStates = new Set(fieldPreviewStates);
  }

  function isFieldInPreview(fieldKey: string): boolean {
    return isPreviewMode || fieldPreviewStates.has(fieldKey);
  }

  // 检查字段是否为空
  function isFieldEmpty(fieldKey: string): boolean {
    const value = fields[fieldKey] || '';
    return value.trim() === '';
  }

  // 检查字段是否应该显示 - 现在始终显示所有字段
  function shouldShowField(fieldKey: string): boolean {
    return true; // 显示所有字段
  }

  function getFieldDisplayName(fieldKey: string): string {
    const k = String(fieldKey || '').toLowerCase();
    if (k === 'front' || k === 'question') return '正面';
    if (k === 'back' || k === 'answer') return '背面';
    if (k === 'tags' || k === '标签') return '标签';
    return `${fieldKey}`;
  }


</script>

<div class="ce-tab fields-editor">
  <!-- 🔥 新增：字段预览工具栏 -->
  <div class="ce-fields-toolbar">
    <div class="ce-toolbar-group">
      <span class="ce-toolbar-label">字段编辑</span>
    </div>
    <div class="ce-toolbar-actions">
      <button
        class="ce-preview-toggle"
        class:active={isPreviewMode}
        onclick={toggleGlobalPreview}
        title={isPreviewMode ? '切换到编辑模式' : '切换到预览模式'}
      >
        <EnhancedIcon name={isPreviewMode ? "edit" : "eye"} size="16" />
        {isPreviewMode ? '编辑' : '预览'}
      </button>
    </div>
  </div>

  <div class="ce-fields">
    {#if appliedFieldTemplate}
      <!-- Template-based field rendering with smart deduplication -->
      {@const allFields = (appliedFieldTemplate.fields || []).filter(f => f.type === 'field')}
      {@const frontOnlyFields = allFields.filter(f => f.side === 'front')}
      {@const backOnlyFields = allFields.filter(f => f.side === 'back')}
      {@const bothSideFields = allFields.filter(f => f.side === 'both')}

      <!-- 正面字段组 -->
      {#if frontOnlyFields.length > 0 || bothSideFields.length > 0}
        <div class="ce-field-group">
          <!-- 仅正面字段 -->
          {#each frontOnlyFields as f}
            {@const field = f as import('../../data/template-types').FieldTemplateField}
            {#if shouldShowField(field.key)}
              {@const isCollapsed = collapsedFields.has(field.key)}
              {@const isEmpty = isFieldEmpty(field.key)}
              <div class="field-editor-row" class:collapsed={isCollapsed} class:empty={isEmpty}>
                <div class="ce-field-header">
                  <div class="ce-field-label-with-indicator">
                    <div class="ce-field-color-indicator"></div>
                    <label for={`field-${field.key}`} class="ce-field-label" title={field.name || field.key}>
                      {field.name || field.key}
                    </label>
                  </div>
                  <div class="ce-field-actions">
                    {#if !isPreviewMode}
                      <button
                        class="field-preview-btn"
                        class:active={fieldPreviewStates.has(field.key)}
                        onclick={() => toggleFieldPreview(field.key)}
                        title={fieldPreviewStates.has(field.key) ? "切换到编辑" : "预览字段"}
                      >
                        <EnhancedIcon name={fieldPreviewStates.has(field.key) ? "edit" : "eye"} size="12" />
                      </button>
                    {/if}
                    <button
                      class="field-toggle-btn"
                      onclick={() => toggleFieldCollapse(field.key)}
                      title={isCollapsed ? "展开字段" : "折叠字段"}
                    >
                      <EnhancedIcon name={isCollapsed ? "chevron-down" : "chevron-up"} size="14" />
                    </button>
                  </div>
                </div>
                {#if !isCollapsed}
                  <div class="ce-field-content" transition:slide={{ duration: 300, easing: quintOut }}>
                    <!-- 选择题选项字段的帮助文本 -->
                    {#if field.key === 'options'}
                      <div class="field-help-text">
                        <div class="help-title">选择题选项格式说明：</div>
                        <div class="help-examples">
                          <div class="help-example">
                            <strong>格式1 (推荐)：</strong><br>
                            A. 选项内容1<br>
                            B. 选项内容2<br>
                            C. 选项内容3
                          </div>
                          <div class="help-example">
                            <strong>格式2：</strong><br>
                            选项内容1<br>
                            选项内容2<br>
                            选项内容3<br>
                            <small>(自动添加A、B、C标签)</small>
                          </div>
                        </div>
                      </div>
                    {/if}

                    <div class="field-editor-wrapper">
                      {#if isFieldInPreview(field.key)}
                        <!-- 预览模式 -->
                        <div class="field-preview-content">
                          {#if fields[field.key] && fields[field.key].trim()}
                            <MarkdownRenderer
                              {plugin}
                              source={fields[field.key]}
                              sourcePath=""
                            />
                          {:else}
                            <div class="field-preview-empty">
                              <EnhancedIcon name="eye-off" size="16" />
                              <span>无内容可预览</span>
                            </div>
                          {/if}
                        </div>
                      {:else}
                        <!-- 编辑模式 -->
                        <SimpleTextEditor
                          value={fields[field.key] || ''}
                          onValueChange={(newValue: string) => handleDirectFieldChange(field.key, newValue)}
                          plugin={plugin}
                          minHeight={field.key === 'options' ? 120 : 80}
                        />
                        {#if isEmpty}
                          <div class="field-empty-indicator">空字段</div>
                        {/if}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          {/each}

          <!-- 正面和背面都显示的字段 - 只显示一次，带提示 -->
          {#each bothSideFields as f}
            {@const field = f as import('../../data/template-types').FieldTemplateField}
            {#if shouldShowField(field.key)}
              {@const isCollapsed = collapsedFields.has(field.key)}
              {@const isEmpty = isFieldEmpty(field.key)}
              <div class="field-editor-row" class:collapsed={isCollapsed} class:empty={isEmpty}>
                <div class="ce-field-header">
                  <div class="ce-field-label-with-indicator">
                    <div class="ce-field-color-indicator"></div>
                    <label for={`field-${field.key}`} class="ce-field-label" title={field.name || field.key}>
                      {field.name || field.key}
                      <span class="both-sides-indicator" title="此字段在正面和背面都会显示">
                        <EnhancedIcon name="eye" size="12" />
                        正面&背面
                      </span>
                    </label>
                  </div>
                  <div class="ce-field-actions">
                    {#if !isPreviewMode}
                      <button
                        class="field-preview-btn"
                        class:active={fieldPreviewStates.has(field.key)}
                        onclick={() => toggleFieldPreview(field.key)}
                        title={fieldPreviewStates.has(field.key) ? "切换到编辑" : "预览字段"}
                      >
                        <EnhancedIcon name={fieldPreviewStates.has(field.key) ? "edit" : "eye"} size="12" />
                      </button>
                    {/if}
                    <button
                      class="field-toggle-btn"
                      onclick={() => toggleFieldCollapse(field.key)}
                      title={isCollapsed ? "展开字段" : "折叠字段"}
                    >
                      <EnhancedIcon name={isCollapsed ? "chevron-down" : "chevron-up"} size="14" />
                    </button>
                  </div>
                </div>
                {#if !isCollapsed}
                  <div class="ce-field-content" transition:slide={{ duration: 300, easing: quintOut }}>
                    <div class="field-editor-wrapper">
                      {#if isFieldInPreview(field.key)}
                        <!-- 预览模式 -->
                        <div class="field-preview-content">
                          {#if fields[field.key] && fields[field.key].trim()}
                            <MarkdownRenderer
                              {plugin}
                              source={fields[field.key]}
                              sourcePath=""
                            />
                          {:else}
                            <div class="field-preview-empty">
                              <EnhancedIcon name="eye-off" size="16" />
                              <span>无内容可预览</span>
                            </div>
                          {/if}
                        </div>
                      {:else}
                        <!-- 编辑模式 -->
                        <SimpleTextEditor
                          value={fields[field.key] || ''}
                          onValueChange={(newValue: string) => handleDirectFieldChange(field.key, newValue)}
                          plugin={plugin}
                          minHeight={80}
                        />
                        {#if isEmpty}
                          <div class="field-empty-indicator">空字段</div>
                        {/if}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      <!-- 背面字段组 - 只显示仅背面的字段 -->
      {#if backOnlyFields.length > 0}
        <div class="ce-field-group" class:with-top-spacing={frontOnlyFields.length > 0 || bothSideFields.length > 0}>
          {#each backOnlyFields as f}
            {@const field = f as import('../../data/template-types').FieldTemplateField}
            {#if shouldShowField(field.key)}
              {@const isCollapsed = collapsedFields.has(field.key)}
              {@const isEmpty = isFieldEmpty(field.key)}
              <div class="field-editor-row" class:collapsed={isCollapsed} class:empty={isEmpty}>
                <div class="ce-field-header">
                  <div class="ce-field-label-with-indicator">
                    <div class="ce-field-color-indicator"></div>
                    <label for={`field-${field.key}`} class="ce-field-label" title={field.name || field.key}>
                      {field.name || field.key}
                    </label>
                  </div>
                  <div class="ce-field-actions">
                    {#if !isPreviewMode}
                      <button
                        class="field-preview-btn"
                        class:active={fieldPreviewStates.has(field.key)}
                        onclick={() => toggleFieldPreview(field.key)}
                        title={fieldPreviewStates.has(field.key) ? "切换到编辑" : "预览字段"}
                      >
                        <EnhancedIcon name={fieldPreviewStates.has(field.key) ? "edit" : "eye"} size="12" />
                      </button>
                    {/if}
                    <button
                      class="field-toggle-btn"
                      onclick={() => toggleFieldCollapse(field.key)}
                      title={isCollapsed ? "展开字段" : "折叠字段"}
                    >
                      <EnhancedIcon name={isCollapsed ? "chevron-down" : "chevron-up"} size="14" />
                    </button>
                  </div>
                </div>
                {#if !isCollapsed}
                  <div class="ce-field-content" transition:slide={{ duration: 300, easing: quintOut }}>
                    <div class="field-editor-wrapper">
                      {#if isFieldInPreview(field.key)}
                        <!-- 预览模式 -->
                        <div class="field-preview-content">
                          {#if fields[field.key] && fields[field.key].trim()}
                            <MarkdownRenderer
                              {plugin}
                              source={fields[field.key]}
                              sourcePath=""
                            />
                          {:else}
                            <div class="field-preview-empty">
                              <EnhancedIcon name="eye-off" size="16" />
                              <span>无内容可预览</span>
                            </div>
                          {/if}
                        </div>
                      {:else}
                        <!-- 编辑模式 -->
                        <SimpleTextEditor
                          value={fields[field.key] || ''}
                          onValueChange={(newValue: string) => handleDirectFieldChange(field.key, newValue)}
                          plugin={plugin}
                          minHeight={80}
                        />
                        {#if isEmpty}
                          <div class="field-empty-indicator">空字段</div>
                        {/if}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}

    {:else}
      <!-- Non-template-based rendering -->
      {@const safeFields = fields || {}}
      {@const fieldEntries = Object.entries(safeFields).filter(([key]) => !['notes', 'templateid', 'templatename', 'learningstepindex'].includes(key.toLowerCase()))}
      {#if fieldEntries.length > 0}
        <div class="ce-field-group">
          {#each fieldEntries as [key, value], index}
            {#if shouldShowField(key)}
              {@const isCollapsed = collapsedFields.has(key)}
              {@const isEmpty = isFieldEmpty(key)}
              <div class="field-editor-row" class:collapsed={isCollapsed} class:empty={isEmpty}>
                <div class="ce-field-header">
                  <div class="ce-field-label-with-indicator">
                    <div class="ce-field-color-indicator"></div>
                    <label for={`field-${index}`} class="ce-field-label" title={getFieldDisplayName(key)}>
                      {getFieldDisplayName(key)}
                    </label>
                  </div>
                  <div class="ce-field-actions">
                    {#if !isPreviewMode}
                      <button
                        class="field-preview-btn"
                        class:active={fieldPreviewStates.has(key)}
                        onclick={() => toggleFieldPreview(key)}
                        title={fieldPreviewStates.has(key) ? "切换到编辑" : "预览字段"}
                      >
                        <EnhancedIcon name={fieldPreviewStates.has(key) ? "edit" : "eye"} size="12" />
                      </button>
                    {/if}
                    <button
                      class="field-toggle-btn"
                      onclick={() => toggleFieldCollapse(key)}
                      title={isCollapsed ? "展开字段" : "折叠字段"}
                    >
                      <EnhancedIcon name={isCollapsed ? "chevron-down" : "chevron-up"} size="14" />
                    </button>
                  </div>
                </div>
                {#if !isCollapsed}
                  <div class="ce-field-content" transition:slide={{ duration: 300, easing: quintOut }}>
                    <div class="field-editor-wrapper">
                      {#if isFieldInPreview(key)}
                        <!-- 预览模式 -->
                        <div class="field-preview-content">
                          {#if fields[key] && fields[key].trim()}
                            <MarkdownRenderer
                              {plugin}
                              source={fields[key]}
                              sourcePath=""
                            />
                          {:else}
                            <div class="field-preview-empty">
                              <EnhancedIcon name="eye-off" size="16" />
                              <span>无内容可预览</span>
                            </div>
                          {/if}
                        </div>
                      {:else}
                        <!-- 编辑模式 -->
                        <SimpleTextEditor
                          value={fields[key] || ''}
                          onValueChange={(newValue: string) => handleDirectFieldChange(key, newValue)}
                          plugin={plugin}
                          minHeight={80}
                        />
                        {#if isEmpty}
                          <div class="field-empty-indicator">空字段</div>
                        {/if}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
              {#if index < fieldEntries.length - 1}
                <div class="ce-field-divider" aria-hidden="true"></div>
              {/if}
            {/if}
          {/each}
        </div>
      {:else}
        <!-- Default fields if empty -->
        <div class="ce-field-group">
          <div class="field-editor-row">
            <div class="ce-field-header">
              <div class="ce-field-label-with-indicator">
                <div class="ce-field-color-indicator"></div>
                <label for="front-field" class="ce-field-label">正面</label>
              </div>
              <div class="ce-field-actions">
                <!-- 移除了HTML转MD转换按钮 -->
              </div>
            </div>
            <div class="ce-field-content">
              <SimpleTextEditor
                value={fields['question'] || ''}
                onValueChange={(newValue: string) => handleDirectFieldChange('question', newValue)}
                plugin={plugin}
                placeholder="输入卡片正面内容..."
                minHeight={80}
              />
            </div>
          </div>

          <div class="field-editor-row">
            <div class="ce-field-header">
              <div class="ce-field-label-with-indicator">
                <div class="ce-field-color-indicator"></div>
                <label for="back-field" class="ce-field-label">背面</label>
              </div>
              <div class="ce-field-actions">
                <!-- 移除了HTML转MD转换按钮 -->
              </div>
            </div>
            <div class="ce-field-content">
              <SimpleTextEditor
                value={fields['answer'] || ''}
                onValueChange={(newValue: string) => handleDirectFieldChange('answer', newValue)}
                plugin={plugin}
                placeholder="输入卡片背面内容..."
                minHeight={80}
              />
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>

/* 🔥 新增：字段预览工具栏样式 */
.ce-fields-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.ce-toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ce-toolbar-label {
  font-weight: 600;
  color: var(--text-normal);
  font-size: 0.875rem;
}

.ce-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ce-preview-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ce-preview-toggle:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
  border-color: var(--background-modifier-border-hover);
}

.ce-preview-toggle.active {
  background: var(--text-accent);
  color: var(--text-on-accent);
  border-color: var(--text-accent);
}

.ce-preview-toggle.active:hover {
  background: color-mix(in srgb, var(--text-accent) 90%, black);
}

/* 字段预览按钮样式 */
.field-preview-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 3px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-right: 0.25rem;
}

.field-preview-btn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
  border-color: var(--background-modifier-border-hover);
}

.field-preview-btn.active {
  background: var(--text-accent);
  color: var(--text-on-accent);
  border-color: var(--text-accent);
}

.field-preview-btn.active:hover {
  background: color-mix(in srgb, var(--text-accent) 90%, black);
}

/* 字段预览内容样式 */
.field-preview-content {
  min-height: 80px;
  padding: 0.75rem;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  color: var(--text-normal);
  line-height: 1.6;
}

.field-preview-content :global(p) {
  margin: 0 0 0.75rem 0;
}

.field-preview-content :global(p:last-child) {
  margin-bottom: 0;
}

.field-preview-content :global(h1),
.field-preview-content :global(h2),
.field-preview-content :global(h3),
.field-preview-content :global(h4),
.field-preview-content :global(h5),
.field-preview-content :global(h6) {
  margin: 0 0 0.5rem 0;
  color: var(--text-normal);
}

.field-preview-content :global(ul),
.field-preview-content :global(ol) {
  margin: 0 0 0.75rem 0;
  padding-left: 1.5rem;
}

.field-preview-content :global(li) {
  margin-bottom: 0.25rem;
}

.field-preview-content :global(code) {
  background: var(--background-secondary);
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  font-size: 0.875em;
}

.field-preview-content :global(pre) {
  background: var(--background-secondary);
  padding: 0.75rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0 0 0.75rem 0;
}

.field-preview-content :global(blockquote) {
  border-left: 3px solid var(--text-accent);
  padding-left: 0.75rem;
  margin: 0 0 0.75rem 0;
  color: var(--text-muted);
  font-style: italic;
}

.field-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 80px;
  color: var(--text-faint);
  font-style: italic;
  font-size: 0.875rem;
}

/* 🔥 优化：字段编辑器根容器，彻底解决底部灰色区域 */
.ce-tab.fields-editor {
  /* 确保容器高度完全由内容决定 */
  height: auto !important;
  min-height: auto !important;
  /* 移除可能产生空白的属性 */
  flex: none !important;
  /* 确保内容紧贴 */
  align-items: stretch;
  justify-content: flex-start;
}

.ce-tab.fields-editor .ce-fields {
  /* 字段容器不产生额外空白 */
  margin-bottom: 0;
  padding-bottom: 0;
}

/* 字段组容器 - 移除边框，采用更简洁的设计 */
.ce-field-group {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem 0;
  position: relative;
}

/* 🔥 新增：字段组顶部间距，替代 ce-divider */
.ce-field-group.with-top-spacing {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--background-modifier-border);
  opacity: 0.6;
}

/* 🔥 新增：最后一个字段组移除底部padding */
.ce-field-group:last-child {
  padding-bottom: 0;
  margin-bottom: 0;
}

/* 字段组标题 - 移除顶部分割线以避免视觉干扰 */
.ce-field-group::before {
  /* 暂时移除以解决虚点线问题 */
  display: none;
}

/* 字段编辑行 */
.field-editor-row {
  display: flex;
  flex-direction: column;
  width: 100%;
  transition: all 0.2s ease;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--background-modifier-border);
  margin-bottom: 1rem;
  background: var(--background-primary);
}

.field-editor-row:hover {
  border-color: var(--background-modifier-border-hover);
}

/* 字段头部容器 */
.ce-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  /* 移除边框以解决虚点线问题 */
  /* border-bottom: 1px solid var(--background-modifier-border); */
}

/* 字段操作按钮容器 */
.ce-field-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* 移除了字段操作按钮样式 - HTML转MD转换器已移除 */

/* 字段标签带颜色指示条 */
.ce-field-label-with-indicator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  position: relative;
}

/* 颜色指示条 - 简洁干净的设计 */
.ce-field-color-indicator {
  width: 3px;
  height: 20px;
  border-radius: 1.5px;
  flex-shrink: 0;
  transition: all 0.15s ease;
  position: relative;
  background: var(--text-muted);
  opacity: 0.6;
}

/* 悬停时增强显示 */
.field-editor-row:hover .ce-field-color-indicator {
  opacity: 1;
  transform: scaleX(1.2);
}

/* 简洁的颜色方案 - 适配深色模式，所有类型使用统一样式 */

/* 字段标签 */
.ce-field-label {
  font-weight: 600;
  color: var(--text-normal);
  font-size: 0.875rem;
  line-height: 1.4;
  flex: 1;
  /* 防止字段名截断 */
  word-break: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  cursor: default;
  transition: color 0.2s ease;
  letter-spacing: 0.01em;
}

.field-editor-row:hover .ce-field-label {
  color: var(--text-normal);
}

/* 正面&背面指示器 */
.both-sides-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
  padding: 0.125rem 0.375rem;
  background: linear-gradient(135deg, var(--tuanki-accent-color), #7c3aed);
  color: white;
  font-size: 0.6875rem;
  font-weight: 600;
  border-radius: 0.375rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  box-shadow: 0 1px 3px rgba(139, 92, 246, 0.3);
  transition: all 0.2s ease;
}

.both-sides-indicator:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(139, 92, 246, 0.4);
}

/* 字段帮助文本样式 */
.field-help-text {
  background: linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.05), rgba(var(--color-accent-rgb), 0.02));
  border: 1px solid rgba(var(--color-accent-rgb), 0.2);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.help-title {
  font-weight: 600;
  color: var(--text-accent);
  margin-bottom: 0.5rem;
}

.help-examples {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.help-example {
  background: var(--background-primary);
  border-radius: 6px;
  padding: 0.5rem;
  border-left: 3px solid var(--tuanki-accent-color);
}

.help-example strong {
  color: var(--text-normal);
}

.help-example small {
  color: var(--text-muted);
  font-style: italic;
}

@media (max-width: 768px) {
  .field-help-text {
    padding: 0.5rem;
    font-size: 0.75rem;
  }

  .help-examples {
    gap: 0.375rem;
  }

  .help-example {
    padding: 0.375rem;
  }
}

/* 字段折叠展开一体化功能键 */
.field-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.field-toggle-btn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
  border-color: var(--background-modifier-border-hover);
}

.field-toggle-btn:focus {
  outline: 2px solid var(--text-accent);
  outline-offset: 2px;
}

.field-toggle-btn:focus:not(:focus-visible) {
  outline: none;
}

/* 字段编辑器包装器 */
.field-editor-wrapper {
  position: relative;
}

/* 新的空字段指示器 */
.field-empty-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 0.7rem;
  color: var(--text-faint);
  background: var(--background-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  opacity: 0.7;
  pointer-events: none;
  user-select: none;
}


/* 折叠状态的字段行 */
.field-editor-row.collapsed {
  opacity: 0.8;
  padding: 0.5rem 0.75rem; /* 减少上下padding，保持左右padding */
  margin-bottom: 0.5rem; /* 减少底部margin */
  background: var(--background-primary); /* 确保与内容编辑器背景一致 */
}

/* 折叠状态下优化布局，减少多余空白 */
.field-editor-row.collapsed .ce-field-header {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.field-editor-row.collapsed .ce-field-label-with-indicator {
  padding-bottom: 0;
}

/* 空字段的特殊样式 */
.field-editor-row.empty .ce-field-label {
  color: var(--text-muted);
  font-style: italic;
}

.field-editor-row.empty {
  opacity: 0.8;
  transition: opacity 0.2s ease;
}

.field-editor-row.empty:hover {
  opacity: 1;
}

/* 字段内容 */
.ce-field-content {
  flex: 1;
  min-width: 0;
  transition: all 0.2s ease;
}

/* 🔥 修复：移除字段分隔线，避免额外空白 */
.ce-field-divider {
  display: none; /* 完全隐藏，避免产生空白区域 */
}

/* 字段内容 */
.ce-field-content {
  width: 100%;
  transition: all 0.2s ease;
}

/* 编辑器样式增强 - 移除边框 */
.ce-field-content :global(.cm-md-wrapper) {
  border: none;
  border-radius: 6px;
  transition: all 0.2s ease;
  background: var(--background-secondary);
  min-height: auto;
}

.field-editor-row:hover .ce-field-content :global(.cm-md-wrapper) {
  background: var(--background-modifier-hover);
}

.ce-field-content :global(.cm-md-wrapper:focus-within) {
  background: var(--background-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-accent) 20%, transparent);
}

.ce-field-content :global(.cm-editor) {
  background: var(--background-primary) !important;
  /* 🔥 彻底修复：强制移除固定高度，让内容决定高度 */
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
}

.ce-field-content :global(.cm-content) {
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  padding: 12px !important;
  min-height: auto !important;
}

/* 自适应高度模式下的样式调整 */
.ce-field-content :global(.cm-md-wrapper.auto-height) {
  min-height: auto;
}

.ce-field-content :global(.cm-md-wrapper.auto-height .cm-content) {
  min-height: auto !important;
  overflow-y: visible;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .field-editor-row {
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .ce-field-header {
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
  }

  .ce-field-label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .ce-field-color-indicator {
    width: 3px;
    height: 18px;
  }
}

/* 🔥 字段编辑器特定修复：解决CodeMirror容器高度问题 */
.fields-editor :global(.cm-editor) {
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

.fields-editor :global(.cm-scroller) {
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

.fields-editor :global(.cm-content) {
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

/* 🔥 强制移除所有可能的固定高度设置 */
:global(.cm-md-wrapper) {
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
}

:global(.cm-md-wrapper.auto-height) {
  height: auto !important;
  min-height: auto !important;
  max-height: none !important;
}

/* 暗色主题优化 */
@media (prefers-color-scheme: dark) {
  .field-editor-row:hover {
    background: var(--background-modifier-hover);
  }

  .field-editor-row:hover .ce-field-content :global(.cm-md-wrapper) {
    box-shadow: 0 2px 8px color-mix(in srgb, var(--text-normal) 5%, transparent);
  }
}

/* 动画效果 */
@keyframes fieldSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.field-editor-row {
  animation: fieldSlideIn 0.3s ease-out;
}
</style>
