<script lang="ts">
  import type AnkiPlugin from "../../../../main";
  import type { PromptTemplate, GenerationConfig } from "../../../../types/ai-types";
  import ObsidianIcon from "../../../ui/ObsidianIcon.svelte";
  import PromptDetailModal from "../../../ai-assistant/PromptDetailModal.svelte";

  interface Props {
    plugin: AnkiPlugin;
    promptTemplates: {
      official: PromptTemplate[];
      custom: PromptTemplate[];
    };
  }

  let { plugin, promptTemplates = $bindable() }: Props = $props();

  // 当前编辑的模板
  let editingTemplate = $state<PromptTemplate | null>(null);
  let isCreating = $state(false);
  let showTemplateModal = $state(false);
  
  // 🆕 查看详情
  let viewingTemplate = $state<PromptTemplate | null>(null);
  let showDetailModal = $state(false);
  
  // 用于预览的示例配置
  const sampleConfig: GenerationConfig = {
    templateId: 'standard-qa',
    promptTemplate: '',
    cardCount: 10,
    difficulty: 'medium',
    typeDistribution: {
      qa: 50,
      cloze: 30,
      choice: 20
    },
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2000,
    imageGeneration: {
      enabled: false,
      strategy: 'none',
      imagesPerCard: 0,
      placement: 'question'
    },
    templates: {
      qa: 'official-qa',
      choice: 'official-choice',
      cloze: 'official-cloze'
    },
    autoTags: [],
    enableHints: true
  };

  // 新建模板
  function createNewTemplate() {
    editingTemplate = {
      id: `custom-${Date.now()}`,
      name: '',
      prompt: '',
      variables: [],
      useBuiltinSystemPrompt: true,
      category: 'custom' as const,
      createdAt: new Date().toISOString()
    } as PromptTemplate;
    isCreating = true;
    showTemplateModal = true;
  }

  // 编辑模板
  function editTemplate(template: PromptTemplate) {
    editingTemplate = { ...template };
    isCreating = false;
    showTemplateModal = true;
  }

  // 保存模板
  function saveTemplate() {
    if (!editingTemplate || !editingTemplate.name.trim() || !editingTemplate.prompt.trim()) {
      return;
    }

    const templateToSave = editingTemplate;

    if (isCreating) {
      promptTemplates.custom = [...promptTemplates.custom, templateToSave];
    } else {
      const index = promptTemplates.custom.findIndex(t => t.id === templateToSave.id);
      if (index !== -1) {
        templateToSave.updatedAt = new Date().toISOString();
        promptTemplates.custom[index] = templateToSave;
        promptTemplates.custom = [...promptTemplates.custom];
      }
    }

    closeModal();
  }

  // 删除模板
  function deleteTemplate(templateId: string) {
    if (confirm('确定要删除这个模板吗？')) {
      promptTemplates.custom = promptTemplates.custom.filter(t => t.id !== templateId);
    }
  }

  // 关闭模态窗口
  function closeModal() {
    showTemplateModal = false;
    editingTemplate = null;
    isCreating = false;
  }
  
  // 🆕 查看模板详情
  function viewTemplateDetail(template: PromptTemplate) {
    viewingTemplate = template;
    showDetailModal = true;
  }
  
  // 关闭详情模态窗
  function closeDetailModal() {
    showDetailModal = false;
    viewingTemplate = null;
  }

  // 提取变量
  function extractVariables(prompt: string): string[] {
    const regex = /\{(\w+)\}/g;
    const matches = [...prompt.matchAll(regex)];
    return [...new Set(matches.map(m => m[1]))];
  }

  // 监听prompt变化自动提取变量
  $effect(() => {
    if (editingTemplate && editingTemplate.prompt) {
      editingTemplate.variables = extractVariables(editingTemplate.prompt);
    }
  });
</script>

<div class="prompt-template-manager">
  <!-- 官方模板 -->
  <div class="template-section">
    <div class="section-header">
      <h4>官方模板</h4>
      <span class="template-count">{promptTemplates.official.length} 个</span>
    </div>
    <div class="template-list">
      {#each promptTemplates.official as template}
        <div class="template-card official">
          <div class="template-header">
            <span class="template-name">{template.name}</span>
            <div class="template-actions">
              <span class="badge badge-official">官方</span>
              <button 
                class="btn-icon" 
                onclick={() => viewTemplateDetail(template)}
                title="查看详情"
              >
                <ObsidianIcon name="eye" size={14} />
              </button>
            </div>
          </div>
          {#if template.description}
            <div class="template-description">{template.description}</div>
          {/if}
          <div class="template-preview">{template.prompt}</div>
          {#if template.variables.length > 0}
            <div class="template-variables">
              <span class="variables-label">变量：</span>
              {#each template.variables as variable}
                <span class="variable-tag">{variable}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- 自定义模板 -->
  <div class="template-section">
    <div class="section-header">
      <h4>自定义模板</h4>
      <div class="section-actions">
        <span class="template-count">{promptTemplates.custom.length} 个</span>
        <button class="btn btn-primary" onclick={createNewTemplate}>
          <ObsidianIcon name="plus" size={14} />
          <span>新建模板</span>
        </button>
      </div>
    </div>

    {#if promptTemplates.custom.length > 0}
      <div class="template-list">
        {#each promptTemplates.custom as template}
          <div class="template-card">
            <div class="template-header">
              <span class="template-name">{template.name}</span>
              <div class="template-actions">
                <button 
                  class="btn-icon" 
                  onclick={() => editTemplate(template)}
                  title="编辑"
                >
                  <ObsidianIcon name="pencil" size={14} />
                </button>
                <button 
                  class="btn-icon" 
                  onclick={() => deleteTemplate(template.id)}
                  title="删除"
                >
                  <ObsidianIcon name="trash-2" size={14} />
                </button>
              </div>
            </div>
            <div class="template-preview">{template.prompt}</div>
            {#if template.variables.length > 0}
              <div class="template-variables">
                <span class="variables-label">变量：</span>
                {#each template.variables as variable}
                  <span class="variable-tag">{variable}</span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- 模板编辑模态窗口 -->
{#if showTemplateModal && editingTemplate}
  <div class="modal-overlay" onclick={closeModal}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>{isCreating ? '新建模板' : '编辑模板'}</h3>
        <button class="btn-icon" onclick={closeModal}>
          <ObsidianIcon name="x" size={20} />
        </button>
      </div>

      <div class="modal-content">
        <div class="form-group">
          <label>模板名称</label>
          <input
            type="text"
            bind:value={editingTemplate.name}
            placeholder="例如：标准问答生成"
            class="text-input"
          />
        </div>

        <div class="form-group">
          <label>提示词内容</label>
          <div class="helper-text">
            使用 &#123;变量名&#125; 来定义可替换的变量，例如：&#123;count&#125;, &#123;difficulty&#125;
          </div>
          <textarea
            bind:value={editingTemplate.prompt}
            placeholder="请根据以下内容生成&#123;count&#125;张问答卡片..."
            class="textarea-input"
            rows="8"
          ></textarea>
        </div>

        {#if editingTemplate.variables.length > 0}
          <div class="form-group">
            <label>检测到的变量</label>
            <div class="detected-variables">
              {#each editingTemplate.variables as variable}
                <span class="variable-tag">{variable}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn" onclick={closeModal}>取消</button>
        <button 
          class="btn btn-primary" 
          onclick={saveTemplate}
          disabled={!editingTemplate.name.trim() || !editingTemplate.prompt.trim()}
        >
          保存
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .prompt-template-manager {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .template-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .section-header h4 {
    margin: 0;
    font-size: 1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .template-count {
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .template-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .template-card {
    padding: 12px;
    background: var(--background-primary);
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    transition: all 0.2s ease;
  }

  .template-card:hover {
    border-color: var(--interactive-accent);
  }

  .template-card.official {
    background: rgba(139, 92, 246, 0.05);
  }

  .template-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .template-name {
    font-size: 0.95em;
    font-weight: 500;
    color: var(--text-normal);
  }

  .template-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .template-description {
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
    margin-bottom: 8px;
    font-style: italic;
  }

  .template-preview {
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.5;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .template-variables {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .variables-label {
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .variable-tag {
    padding: 2px 8px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    font-size: 0.75em;
    font-family: var(--font-monospace);
    color: var(--text-accent);
  }

  .badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: 500;
  }

  .badge-official {
    background: rgba(139, 92, 246, 0.2);
    color: rgb(139, 92, 246);
  }

  /* 按钮样式 */
  .btn,
  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    background: var(--interactive-normal);
    color: var(--text-normal);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-icon {
    padding: 6px;
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: white;
  }

  .btn:hover,
  .btn-icon:hover {
    background: var(--interactive-hover);
  }

  .btn-primary:hover {
    background: var(--interactive-accent-hover);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 模态窗口样式 */
  .modal-overlay {
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
  }

  .modal {
    width: 90%;
    max-width: 600px;
    background: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .modal-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 20px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.95em;
    font-weight: 500;
    color: var(--text-normal);
  }

  .helper-text {
    margin-bottom: 8px;
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .text-input,
  .textarea-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
    font-family: inherit;
  }

  .textarea-input {
    resize: vertical;
    font-family: var(--font-monospace);
    line-height: 1.5;
  }

  .text-input:focus,
  .textarea-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .detected-variables {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>

