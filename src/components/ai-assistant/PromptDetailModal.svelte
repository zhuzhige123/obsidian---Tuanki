<script lang="ts">
  import type { PromptTemplate, GenerationConfig } from "../../types/ai-types";
  import type AnkiPlugin from "../../main";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import { PromptBuilderService } from "../../services/ai/PromptBuilderService";

  interface Props {
    plugin: AnkiPlugin;
    template: PromptTemplate | null;
    config: GenerationConfig;
    isOpen: boolean;
    onClose: () => void;
  }

  let { plugin, template, config, isOpen, onClose }: Props = $props();

  // 当前标签页
  let activeTab = $state<'user' | 'system' | 'preview'>('user');

  // 获取系统提示词
  let systemPrompt = $derived(() => {
    if (!template) return '';
    
    // 如果模板有自定义系统提示词且选择使用
    if (!template.useBuiltinSystemPrompt && template.systemPrompt) {
      return PromptBuilderService.replaceVariables(template.systemPrompt, config);
    }
    
    // 否则使用内置系统提示词
    return PromptBuilderService.getBuiltinSystemPrompt(config);
  });

  // 获取用户提示词
  let userPrompt = $derived(() => {
    if (!template) return '';
    return PromptBuilderService.replaceVariables(template.prompt, config);
  });

  // 获取完整预览
  let fullPreview = $derived(() => {
    if (!template) return '';
    
    const system = systemPrompt();
    const user = userPrompt();
    
    return `=== System Prompt ===\n\n${system}\n\n=== User Prompt ===\n\n${user}\n\n=== Content ===\n\n[用户输入的学习材料将在此处]`;
  });

  // 复制到剪贴板
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      // 显示提示
      const notice = document.createElement('div');
      notice.className = 'copy-notice';
      notice.textContent = '✅ 已复制到剪贴板';
      document.body.appendChild(notice);
      
      setTimeout(() => {
        notice.classList.add('fade-out');
        setTimeout(() => document.body.removeChild(notice), 300);
      }, 1500);
    });
  }

  // 点击遮罩层关闭
  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen && template}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={handleOverlayClick}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="prompt-detail-modal" onclick={(e) => e.stopPropagation()}>
      <!-- 头部 -->
      <div class="modal-header">
        <div class="header-left">
          <h3>{template.name}</h3>
          {#if template.description}
            <p class="template-description">{template.description}</p>
          {/if}
        </div>
        <button class="btn-icon" onclick={onClose} title="关闭">
          <ObsidianIcon name="x" size={20} />
        </button>
      </div>

      <!-- 标签页 -->
      <div class="modal-tabs">
        <button
          class="tab"
          class:active={activeTab === 'user'}
          onclick={() => activeTab = 'user'}
        >
          <ObsidianIcon name="message-square" size={16} />
          <span>用户提示词</span>
        </button>
        <button
          class="tab"
          class:active={activeTab === 'system'}
          onclick={() => activeTab = 'system'}
        >
          <ObsidianIcon name="settings" size={16} />
          <span>系统提示词</span>
        </button>
        <button
          class="tab"
          class:active={activeTab === 'preview'}
          onclick={() => activeTab = 'preview'}
        >
          <ObsidianIcon name="eye" size={16} />
          <span>完整预览</span>
        </button>
      </div>

      <!-- 内容区 -->
      <div class="modal-content">
        {#if activeTab === 'user'}
          <div class="content-section">
            <div class="section-header">
              <h4>用户提示词</h4>
              <button
                class="btn-copy"
                onclick={() => copyToClipboard(userPrompt())}
                title="复制"
              >
                <ObsidianIcon name="copy" size={14} />
                <span>复制</span>
              </button>
            </div>
            <div class="content-text">{userPrompt()}</div>
            
            {#if template.variables && template.variables.length > 0}
              <div class="variables-info">
                <h5>变量说明</h5>
                <div class="variable-list">
                  {#each template.variables as variable}
                    <span class="variable-tag">{variable}</span>
                  {/each}
                </div>
                <p class="hint-text">变量会在实际使用时自动替换为相应的值</p>
              </div>
            {/if}
          </div>
        {:else if activeTab === 'system'}
          <div class="content-section">
            <div class="section-header">
              <h4>系统提示词</h4>
              <div class="header-actions">
                {#if template.useBuiltinSystemPrompt}
                  <span class="badge badge-builtin">内置</span>
                {:else}
                  <span class="badge badge-custom">自定义</span>
                {/if}
                <button
                  class="btn-copy"
                  onclick={() => copyToClipboard(systemPrompt())}
                  title="复制"
                >
                  <ObsidianIcon name="copy" size={14} />
                  <span>复制</span>
                </button>
              </div>
            </div>
            
            <div class="info-box">
              <ObsidianIcon name="info" size={16} />
              <p>
                系统提示词包含详细的格式规范和生成要求，用于指导AI生成标准化的学习卡片。
                {#if template.useBuiltinSystemPrompt}
                  当前使用内置系统提示词，确保生成的卡片符合Tuanki格式要求。
                {:else}
                  当前使用自定义系统提示词，请确保包含必要的格式说明。
                {/if}
              </p>
            </div>
            
            <div class="content-text system-prompt">{systemPrompt()}</div>
          </div>
        {:else if activeTab === 'preview'}
          <div class="content-section">
            <div class="section-header">
              <h4>完整预览</h4>
              <button
                class="btn-copy"
                onclick={() => copyToClipboard(fullPreview())}
                title="复制"
              >
                <ObsidianIcon name="copy" size={14} />
                <span>复制</span>
              </button>
            </div>
            
            <div class="info-box">
              <ObsidianIcon name="info" size={16} />
              <p>
                这是将要发送给AI的完整提示词结构。实际使用时，"Content"部分会被替换为您输入的学习材料。
              </p>
            </div>
            
            <div class="content-text preview-text">{fullPreview()}</div>
          </div>
        {/if}
      </div>

      <!-- 底部 -->
      <div class="modal-footer">
        <button class="btn" onclick={onClose}>关闭</button>
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
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  }

  .prompt-detail-modal {
    width: 90%;
    max-width: 900px;
    max-height: 85vh;
    background: var(--background-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px;
    border-bottom: 1px solid var(--background-modifier-border);
    gap: 16px;
  }

  .header-left {
    flex: 1;
    min-width: 0;
  }

  .modal-header h3 {
    margin: 0 0 4px 0;
    font-size: 1.3em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .template-description {
    margin: 0;
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .modal-tabs {
    display: flex;
    gap: 4px;
    padding: 12px 24px 0 24px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 6px 6px 0 0;
    border-bottom: 2px solid transparent;
  }

  .tab:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .tab.active {
    background: var(--background-primary);
    color: var(--interactive-accent);
    border-bottom-color: var(--interactive-accent);
    font-weight: 500;
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    min-height: 0;
  }

  .content-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .section-header h4 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .info-box {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(139, 92, 246, 0.1);
    border-left: 3px solid rgb(139, 92, 246);
    border-radius: 6px;
  }

  .info-box p {
    margin: 0;
    font-size: 0.9em;
    color: var(--text-normal);
    line-height: 1.5;
  }

  .content-text {
    padding: 16px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    font-family: var(--font-monospace);
    font-size: 0.85em;
    line-height: 1.6;
    color: var(--text-normal);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 500px;
    overflow-y: auto;
  }

  .content-text.system-prompt {
    font-size: 0.8em;
  }

  .content-text.preview-text {
    font-size: 0.8em;
  }

  .variables-info {
    padding: 16px;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  .variables-info h5 {
    margin: 0 0 12px 0;
    font-size: 0.95em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .variable-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .variable-tag {
    padding: 4px 10px;
    background: var(--interactive-accent);
    color: white;
    border-radius: 4px;
    font-size: 0.8em;
    font-family: var(--font-monospace);
    font-weight: 500;
  }

  .hint-text {
    margin: 0;
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .badge {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-builtin {
    background: rgba(34, 197, 94, 0.2);
    color: rgb(34, 197, 94);
  }

  .badge-custom {
    background: rgba(139, 92, 246, 0.2);
    color: rgb(139, 92, 246);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 16px 24px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .btn,
  .btn-icon,
  .btn-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn {
    background: var(--interactive-normal);
    color: var(--text-normal);
  }

  .btn:hover {
    background: var(--interactive-hover);
  }

  .btn-icon {
    padding: 8px;
    background: transparent;
    color: var(--text-muted);
  }

  .btn-icon:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .btn-copy {
    padding: 6px 12px;
    background: var(--interactive-accent);
    color: white;
    font-size: 0.85em;
  }

  .btn-copy:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  /* 复制提示 */
  :global(.copy-notice) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 12px 24px;
    background: var(--interactive-accent);
    color: white;
    border-radius: 8px;
    font-size: 0.9em;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 10001;
    animation: slideIn 0.3s ease;
  }

  :global(.copy-notice.fade-out) {
    animation: fadeOut 0.3s ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  /* 滚动条样式 */
  .content-text::-webkit-scrollbar,
  .modal-content::-webkit-scrollbar {
    width: 8px;
  }

  .content-text::-webkit-scrollbar-track,
  .modal-content::-webkit-scrollbar-track {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .content-text::-webkit-scrollbar-thumb,
  .modal-content::-webkit-scrollbar-thumb {
    background: var(--text-muted);
    border-radius: 4px;
  }

  .content-text::-webkit-scrollbar-thumb:hover,
  .modal-content::-webkit-scrollbar-thumb:hover {
    background: var(--text-normal);
  }
</style>

