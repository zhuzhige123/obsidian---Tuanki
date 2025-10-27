<script lang="ts">
  import type { GenerationConfig } from "../../types/ai-types";
  import type AnkiPlugin from "../../main";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import { PromptBuilderService } from "../../services/ai/PromptBuilderService";
  import { Notice } from "obsidian";

  interface Props {
    plugin: AnkiPlugin;
    config: GenerationConfig;
    isOpen: boolean;
    onClose: () => void;
  }

  let { plugin, config, isOpen, onClose }: Props = $props();

  // 获取系统提示词
  let systemPrompt = $derived(() => {
    return PromptBuilderService.getBuiltinSystemPrompt(config);
  });

  // 复制到剪贴板
  function copyToClipboard() {
    const text = systemPrompt();
    navigator.clipboard.writeText(text).then(() => {
      new Notice('已复制到剪贴板');
    }).catch(() => {
      new Notice('复制失败');
    });
  }

  // 点击遮罩层关闭
  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={handleOverlayClick}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="system-prompt-modal" onclick={(e) => e.stopPropagation()}>
      <!-- 头部 -->
      <div class="modal-header">
        <h2>系统提示词</h2>
        <button class="close-btn" onclick={onClose} title="关闭">
          <ObsidianIcon name="x" size={20} />
        </button>
      </div>

      <!-- 内容 -->
      <div class="modal-content">
        <pre class="prompt-text">{systemPrompt()}</pre>
      </div>

      <!-- 底部操作栏 -->
      <div class="modal-footer">
        <button class="copy-btn" onclick={copyToClipboard}>
          <ObsidianIcon name="copy" size={16} />
          <span>复制</span>
        </button>
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
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  }

  .system-prompt-modal {
    background: var(--background-primary);
    border-radius: 12px;
    width: 100%;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    padding: 4px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .prompt-text {
    margin: 0;
    padding: 16px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.9em;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-monospace);
  }

  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: flex-end;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--interactive-accent);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.9em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .copy-btn:hover {
    background: var(--interactive-accent-hover);
  }
</style>

