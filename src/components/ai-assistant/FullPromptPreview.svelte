<script lang="ts">
  import type { GenerationConfig, PromptTemplate } from "../../types/ai-types";
  import type AnkiPlugin from "../../main";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import { PromptBuilderService } from "../../services/ai/PromptBuilderService";

  interface Props {
    plugin: AnkiPlugin;
    content: string;
    config: GenerationConfig;
    selectedPrompt: PromptTemplate | null;
    customPrompt: string;
  }

  let { plugin, content, config, selectedPrompt, customPrompt }: Props = $props();

  // 展开/折叠状态
  let isExpanded = $state(false);

  // 获取完整提示词
  let fullPrompt = $derived(() => {
    const promptTemplate = selectedPrompt 
      ? selectedPrompt.prompt 
      : customPrompt || '请根据以下内容生成学习卡片';
    
    // 获取系统提示词配置（确保类型安全）
    const aiConfig = plugin.settings.aiConfig;
    const systemConfig = aiConfig && 'systemPromptConfig' in aiConfig
      ? (aiConfig.systemPromptConfig as import('../../types/ai-types').SystemPromptConfig)
      : undefined;
    
    return PromptBuilderService.buildFullPrompt(
      content || '[请输入学习材料]',
      config,
      promptTemplate,
      systemConfig
    );
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

  function toggleExpanded() {
    isExpanded = !isExpanded;
  }
</script>

<div class="full-prompt-preview">
  <button class="preview-toggle" onclick={toggleExpanded}>
    <div class="toggle-left">
      <ObsidianIcon name="eye" size={16} />
      <span>查看完整提示词</span>
      {#if !isExpanded}
        <span class="hint-text">（查看将要发送给AI的完整内容）</span>
      {/if}
    </div>
    <ObsidianIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={16} />
  </button>

  {#if isExpanded}
    <div class="preview-content">
      <!-- 工具栏 -->
      <div class="preview-toolbar">
        <div class="toolbar-left">
          <ObsidianIcon name="info" size={14} />
          <span>此为实时预览，内容会随配置和输入自动更新</span>
        </div>
        <button
          class="btn-copy"
          onclick={() => copyToClipboard(fullPrompt().fullText)}
          title="复制完整内容"
        >
          <ObsidianIcon name="copy" size={14} />
          <span>复制</span>
        </button>
      </div>

      <!-- 系统提示词 -->
      <div class="prompt-section">
        <div class="section-header">
          <div class="section-title">
            <div class="title-badge system-badge">System</div>
            <span>系统提示词</span>
          </div>
          <button
            class="btn-copy-section"
            onclick={() => copyToClipboard(fullPrompt().systemPrompt)}
            title="复制系统提示词"
          >
            <ObsidianIcon name="copy" size={12} />
          </button>
        </div>
        <div class="section-content system-content">
          {fullPrompt().systemPrompt}
        </div>
      </div>

      <!-- 用户提示词 -->
      <div class="prompt-section">
        <div class="section-header">
          <div class="section-title">
            <div class="title-badge user-badge">User</div>
            <span>用户提示词</span>
          </div>
          <button
            class="btn-copy-section"
            onclick={() => copyToClipboard(fullPrompt().userPrompt)}
            title="复制用户提示词"
          >
            <ObsidianIcon name="copy" size={12} />
          </button>
        </div>
        <div class="section-content user-content">
          {fullPrompt().userPrompt}
        </div>
      </div>

      <!-- 内容预览 -->
      <div class="prompt-section">
        <div class="section-header">
          <div class="section-title">
            <div class="title-badge content-badge">Content</div>
            <span>学习材料</span>
          </div>
          <button
            class="btn-copy-section"
            onclick={() => copyToClipboard(content)}
            title="复制内容"
          >
            <ObsidianIcon name="copy" size={12} />
          </button>
        </div>
        <div class="section-content content-preview">
          {#if content}
            {content}
          {:else}
            <span class="placeholder-text">请在上方输入或加载学习材料</span>
          {/if}
        </div>
      </div>

      <!-- 说明 -->
      <div class="preview-footer">
        <ObsidianIcon name="info" size={14} />
        <p>
          点击生成时，这三部分将组合发送给AI。系统提示词定义输出格式，用户提示词描述生成要求，学习材料提供内容来源。
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .full-prompt-preview {
    display: flex;
    flex-direction: column;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    overflow: hidden;
  }

  .preview-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .preview-toggle:hover {
    background: var(--background-modifier-hover);
  }

  .toggle-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
    font-weight: 500;
  }

  .hint-text {
    font-size: 0.85em;
    color: var(--text-muted);
    font-weight: 400;
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .preview-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--background-secondary);
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .prompt-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .title-badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.7em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .system-badge {
    background: rgba(59, 130, 246, 0.2);
    color: rgb(59, 130, 246);
  }

  .user-badge {
    background: rgba(34, 197, 94, 0.2);
    color: rgb(34, 197, 94);
  }

  .content-badge {
    background: rgba(245, 158, 11, 0.2);
    color: rgb(245, 158, 11);
  }

  .section-content {
    padding: 14px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    font-family: var(--font-monospace);
    font-size: 0.8em;
    line-height: 1.6;
    color: var(--text-normal);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 300px;
    overflow-y: auto;
  }

  .system-content {
    font-size: 0.75em;
  }

  .content-preview {
    font-family: inherit;
    font-size: 0.85em;
  }

  .placeholder-text {
    color: var(--text-muted);
    font-style: italic;
  }

  .preview-footer {
    display: flex;
    gap: 10px;
    padding: 12px;
    background: rgba(139, 92, 246, 0.1);
    border-left: 3px solid rgb(139, 92, 246);
    border-radius: 6px;
  }

  .preview-footer p {
    margin: 0;
    font-size: 0.85em;
    color: var(--text-normal);
    line-height: 1.5;
  }

  /* 按钮 */
  .btn-copy,
  .btn-copy-section {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    font-size: 0.8em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-copy {
    background: var(--interactive-accent);
    color: white;
  }

  .btn-copy:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  .btn-copy-section {
    padding: 4px 8px;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-copy-section:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 复制提示（复用之前的样式） */
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

  /* 滚动条 */
  .section-content::-webkit-scrollbar {
    width: 6px;
  }

  .section-content::-webkit-scrollbar-track {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }

  .section-content::-webkit-scrollbar-thumb {
    background: var(--text-muted);
    border-radius: 3px;
  }

  .section-content::-webkit-scrollbar-thumb:hover {
    background: var(--text-normal);
  }
</style>

