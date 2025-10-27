<!--
  模板编辑器模态窗组件
  职责：模板的创建和编辑（不含测试功能）
-->
<script lang="ts">
  import type { ParseTemplate, TemplateField } from '../../../../types/newCardParsingTypes';
  import FieldConfigTable from './FieldConfigTable.svelte';

  interface Props {
    isOpen: boolean;
    editingTemplate: ParseTemplate | null;
    onClose: () => void;
    onSave: (template: ParseTemplate) => void;
  }

  let { isOpen, editingTemplate, onClose, onSave }: Props = $props();

  // 模板表单状态
  let templateForm = $state({
    name: '',
    description: '',
    cardType: 'basic-qa' as 'basic-qa' | 'multiple-choice' | 'cloze-deletion' | 'other',
    type: 'single-field' as 'single-field' | 'complete-regex',
    fields: [] as TemplateField[],
    regex: '',
    flags: 'ms',
    scenarios: [] as string[]
  });

  // 监听editingTemplate变化，更新表单
  $effect(() => {
    if (editingTemplate) {
      templateForm = {
        name: editingTemplate.name,
        description: editingTemplate.description || '',
        cardType: (editingTemplate as any).cardType || 'basic-qa',
        type: editingTemplate.type,
        fields: editingTemplate.fields ? [...editingTemplate.fields] : [],
        regex: editingTemplate.regex || '',
        flags: editingTemplate.flags || 'ms',
        scenarios: [...editingTemplate.scenarios]
      };
    } else {
      resetTemplateForm();
    }
  });

  function resetTemplateForm() {
    templateForm = {
      name: '',
      description: '',
      cardType: 'basic-qa',
      type: 'single-field',
      fields: [
        { name: 'Front', pattern: '^(.+?)(?=---div---|$)', isRegex: true, flags: 'ms', required: true },
        { name: 'Back', pattern: '(?<=---div---)(.+)$', isRegex: true, flags: 'ms', required: false }
      ],
      regex: '',
      flags: 'ms',
      scenarios: ['newCard']
    };
  }

  function handleModalClick(e: MouseEvent) {
    // 阻止事件冒泡到 overlay，防止模态窗误关闭
    e.stopPropagation();
  }

  function saveTemplate() {
    const template: ParseTemplate = {
      id: editingTemplate?.id || `template_${Date.now()}`,
      name: templateForm.name,
      description: templateForm.description,
      cardType: templateForm.cardType,
      type: templateForm.type,
      scenarios: templateForm.scenarios as any[],
      isDefault: editingTemplate?.isDefault || false,
      isOfficial: editingTemplate?.isOfficial || false,
      createdAt: editingTemplate?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any;

    if (templateForm.type === 'single-field') {
      template.fields = [...templateForm.fields];
    } else {
      template.regex = templateForm.regex;
      template.flags = templateForm.flags;
    }

    onSave(template);
    onClose();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div 
    class="modal-overlay" 
    onclick={onClose} 
    onkeydown={(e) => e.key === 'Escape' && onClose()} 
    role="dialog" 
    aria-modal="true" 
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal" onclick={handleModalClick} role="document" tabindex="-1">
      <div class="modal-header">
        <h3>
          {#if editingTemplate}
            {editingTemplate.isOfficial ? '查看官方模板' : '编辑模板'}
          {:else}
            新建模板
          {/if}
        </h3>
        <button class="modal-close" onclick={onClose}>×</button>
      </div>
      
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label for="templateName">模板名称</label>
            <input
              type="text"
              id="templateName"
              bind:value={templateForm.name}
              placeholder="例如：基础问答卡"
              disabled={editingTemplate?.isOfficial}
            />
          </div>
          <div class="form-group">
            <label for="templateDescription">模板描述</label>
            <input
              type="text"
              id="templateDescription"
              bind:value={templateForm.description}
              placeholder="模板用途说明"
              disabled={editingTemplate?.isOfficial}
            />
          </div>
        </div>

        <!-- 题型选择 -->
        <div class="form-group">
          <label for="cardType">题型分类</label>
          <select
            id="cardType"
            bind:value={templateForm.cardType}
            disabled={editingTemplate?.isOfficial}
          >
            <option value="basic-qa">问答题</option>
            <option value="multiple-choice">选择题</option>
            <option value="cloze-deletion">挖空题</option>
            <option value="other">其他</option>
          </select>
          <small class="help-text">选择此模板主要用于哪种题型，便于在学习界面中使用准确的解析预览</small>
        </div>

        <div class="form-group">
          <h4>解析模式</h4>
          <div class="template-mode-selector">
            <button
              class="mode-button"
              class:active={templateForm.type === 'single-field'}
              onclick={() => {
                if (!editingTemplate?.isOfficial) {
                  templateForm.type = 'single-field';
                }
              }}
              disabled={editingTemplate?.isOfficial}
            >
              <strong>单字段解析</strong><br>
              <small>适用于单卡解析、新建卡片</small>
            </button>
            <button
              class="mode-button"
              class:active={templateForm.type === 'complete-regex'}
              onclick={() => {
                if (!editingTemplate?.isOfficial) {
                  templateForm.type = 'complete-regex';
                }
              }}
              disabled={editingTemplate?.isOfficial}
            >
              <strong>完整正则解析</strong><br>
              <small>适用于批量卡片扫描</small>
            </button>
          </div>
        </div>

        <!-- 单字段解析配置 -->
        {#if templateForm.type === 'single-field'}
          <div class="form-group">
            <FieldConfigTable
              fields={templateForm.fields}
              onFieldsChange={(newFields) => templateForm.fields = newFields}
              disabled={editingTemplate?.isOfficial}
            />
          </div>
        {/if}

        <!-- 完整正则解析配置 -->
        {#if templateForm.type === 'complete-regex'}
          <div class="form-group">
            <label for="completeRegex">完整正则表达式</label>
            <textarea
              id="completeRegex"
              class="regex-input"
              rows="4"
              bind:value={templateForm.regex}
              placeholder="例如：^(?<front>.+?)(?:---div---(?<back>.+?))?(?<tags>#[\\w\\u4e00-\\u9fa5]+.*)?$"
              disabled={editingTemplate?.isOfficial}
            ></textarea>
            <small class="help-text">使用命名捕获组：(?&lt;front&gt;...)、(?&lt;back&gt;...)、(?&lt;tags&gt;...)</small>
          </div>
          <div class="form-group">
            <label for="regexFlags">正则标志</label>
            <input 
              type="text" 
              id="regexFlags" 
              bind:value={templateForm.flags} 
              placeholder="例如：gims"
              disabled={editingTemplate?.isOfficial}
            />
            <small class="help-text">常用标志：g(全局)、i(忽略大小写)、m(多行)、s(单行)</small>
          </div>
        {/if}
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={onClose}>
          {editingTemplate?.isOfficial ? '关闭' : '取消'}
        </button>
        {#if !editingTemplate?.isOfficial}
          <button class="btn btn-primary" onclick={saveTemplate}>保存模板</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* 模态窗样式 */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--background-primary);
    border-radius: 12px;
    width: 95%;
    max-width: 1200px;
    max-height: 95vh;
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
  }

  .modal-header {
    background: var(--background-secondary);
    padding: 20px;
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 {
    color: var(--text-normal);
    margin: 0;
    font-size: 18px;
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 20px;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-body {
    padding: 25px;
    max-height: calc(90vh - 140px);
    overflow-y: auto;
  }

  .modal-footer {
    background: var(--background-secondary);
    padding: 15px 20px;
    border-top: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .form-group input[type="text"],
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 14px;
    transition: border-color 0.2s;
  }

  .form-group input[type="text"]:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  .form-group h4 {
    margin: 0 0 12px 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .template-mode-selector {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }

  .mode-button {
    flex: 1;
    padding: 12px;
    background: var(--background-modifier-border);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    cursor: pointer;
    text-align: center;
    transition: all 0.2s;
  }

  .mode-button.active {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .mode-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .regex-input {
    font-family: var(--font-monospace);
    font-size: 13px;
  }

  .help-text {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
    line-height: 1.3;
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

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: var(--interactive-accent-hover);
  }

  .btn-secondary {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .form-row {
      grid-template-columns: 1fr;
      gap: var(--tuanki-space-sm);
    }

    .modal {
      width: 95%;
      margin: 10px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-body {
      padding: var(--tuanki-space-md);
    }

    .template-mode-selector {
      flex-direction: column;
      gap: var(--tuanki-space-sm);
    }

    .mode-button {
      padding: var(--tuanki-space-md);
    }
  }
</style>

