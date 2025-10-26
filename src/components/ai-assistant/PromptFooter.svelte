<script lang="ts">
  import type AnkiPlugin from '../../main';
  import type { PromptTemplate } from '../../types/ai-types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { Menu } from 'obsidian';

  interface Props {
    plugin: AnkiPlugin;
    selectedPrompt: PromptTemplate | null;
    customPrompt: string;
    onPromptSelect: (prompt: PromptTemplate | null) => void;
    onCustomPromptChange: (prompt: string) => void;
    onGenerate: () => void;
    onViewSystemPrompt: () => void;
    isGenerating: boolean;
    disabled: boolean;
  }

  let {
    plugin,
    selectedPrompt = $bindable(),
    customPrompt = $bindable(),
    onPromptSelect,
    onCustomPromptChange,
    onGenerate,
    onViewSystemPrompt,
    isGenerating,
    disabled
  }: Props = $props();

  // 输入框引用
  let textareaElement = $state<HTMLTextAreaElement | undefined>(undefined);

  // 获取提示词模板
  let officialPrompts = $derived<PromptTemplate[]>((plugin.settings.aiConfig?.promptTemplates.official || []).map(p => ({
    ...p,
    category: 'official' as const,
    useBuiltinSystemPrompt: true
  })));
  
  let customPrompts = $derived<PromptTemplate[]>((plugin.settings.aiConfig?.promptTemplates.custom || []).map(p => ({
    ...p,
    category: 'custom' as const,
    useBuiltinSystemPrompt: true
  })));

  // 打开提示词选择菜单（使用 Obsidian Menu API）
  function openPromptMenu(event: MouseEvent) {
    const menu = new Menu();
    const target = event.target as HTMLElement;

    // 官方模板分组
    if (officialPrompts.length > 0) {
      officialPrompts.forEach(prompt => {
        menu.addItem((item) => {
          item
            .setTitle(prompt.name)
            .setIcon('message-square')
            .setChecked(selectedPrompt?.id === prompt.id)
            .onClick(() => {
              selectedPrompt = prompt;
              onPromptSelect(prompt);
            });
        });
      });
    }

    // 分隔线
    if (officialPrompts.length > 0 && customPrompts.length > 0) {
      menu.addSeparator();
    }

    // 自定义模板分组
    if (customPrompts.length > 0) {
      customPrompts.forEach(prompt => {
        menu.addItem((item) => {
          item
            .setTitle(prompt.name)
            .setIcon('file-text')
            .setChecked(selectedPrompt?.id === prompt.id)
            .onClick(() => {
              selectedPrompt = prompt;
              onPromptSelect(prompt);
            });
        });
      });
    }

    // 如果没有模板，显示提示
    if (officialPrompts.length === 0 && customPrompts.length === 0) {
      menu.addItem((item) => {
        item
          .setTitle('暂无可用模板')
          .setDisabled(true);
      });
    }

    menu.showAtMouseEvent(event);
  }

  // 处理自定义提示词输入
  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    customPrompt = target.value;
    onCustomPromptChange(target.value);
    
    // 清除选中的模板
    if (target.value && selectedPrompt) {
      selectedPrompt = null;
      onPromptSelect(null);
    }
    
    // 自动调整高度
    adjustTextareaHeight();
  }

  // 自动调整 textarea 高度
  function adjustTextareaHeight() {
    if (!textareaElement) return;
    
    // 重置高度以获取正确的 scrollHeight
    textareaElement.style.height = '36px';
    
    // 计算新高度（最小 36px，最大 120px）
    const newHeight = Math.min(Math.max(textareaElement.scrollHeight, 36), 120);
    textareaElement.style.height = `${newHeight}px`;
  }

  // 处理键盘事件
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      // Enter 键提交（不按 Shift）
      event.preventDefault();
      if (!disabled && !isGenerating) {
        onGenerate();
      }
    }
    // Shift + Enter 允许换行（默认行为）
  }

  // 监听 customPrompt 变化，调整高度
  $effect(() => {
    if (customPrompt !== undefined) {
      adjustTextareaHeight();
    }
  });
</script>

<div class="prompt-footer">
  <!-- 提示词选择按钮 -->
  <button
    class="prompt-selector-btn"
    onclick={openPromptMenu}
    title="选择提示词模板"
  >
    <ObsidianIcon name="message-square" size={14} />
    <span class="prompt-selector-text">
      {selectedPrompt ? selectedPrompt.name : '选择提示词'}
    </span>
    <ObsidianIcon name="chevron-down" size={12} />
  </button>

  <!-- 自定义提示词输入框 -->
  <textarea
    bind:this={textareaElement}
    class="prompt-textarea"
    placeholder="或输入自定义提示词..."
    value={customPrompt}
    oninput={handleInput}
    onkeydown={handleKeyDown}
  ></textarea>

  <!-- 查看系统提示词按钮 -->
  <button
    class="view-prompt-btn"
    onclick={onViewSystemPrompt}
    title="查看系统提示词"
    aria-label="查看系统提示词"
  >
    <ObsidianIcon name="eye" size={16} />
  </button>

  <!-- 生成按钮 -->
  <button
    class="generate-btn"
    onclick={onGenerate}
    disabled={disabled || isGenerating}
    title={disabled ? '请先输入内容' : '生成AI卡片'}
  >
    {#if isGenerating}
      <ObsidianIcon name="loader" size={16} />
      <span>生成中...</span>
    {:else}
      <ObsidianIcon name="sparkles" size={16} />
      <span>点击生成</span>
    {/if}
  </button>
</div>

<style>
  /* ===== CSS 变量定义 ===== */
  :root {
    --prompt-footer-height: 36px;
    --prompt-footer-gap: 8px;
    --prompt-footer-padding: 12px;
    --prompt-footer-radius: 6px;
  }

  /* ===== 主容器 ===== */
  .prompt-footer {
    display: flex;
    align-items: flex-start; /* 改为 flex-start 以支持 textarea 动态高度 */
    gap: var(--prompt-footer-gap);
    padding: var(--prompt-footer-padding);
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
  }

  /* ===== 提示词选择按钮 ===== */
  .prompt-selector-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--prompt-footer-height);
    padding: 0 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--prompt-footer-radius);
    color: var(--text-normal);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .prompt-selector-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .prompt-selector-text {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== 自定义提示词输入框 ===== */
  .prompt-textarea {
    flex: 1;
    min-width: 0;
    min-height: var(--prompt-footer-height);
    max-height: 120px;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--prompt-footer-radius);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    font-family: inherit;
    line-height: 1.5;
    resize: none;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    overflow-y: auto;
  }

  .prompt-textarea:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1);
  }

  .prompt-textarea::placeholder {
    color: var(--text-muted);
  }

  /* ===== 查看系统提示词按钮 ===== */
  .view-prompt-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--prompt-footer-height);
    min-height: var(--prompt-footer-height);
    padding: 0;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--prompt-footer-radius);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .view-prompt-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
  }

  /* ===== 生成按钮 ===== */
  .generate-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--prompt-footer-height);
    padding: 0 20px;
    background: var(--interactive-accent);
    border: none;
    border-radius: var(--prompt-footer-radius);
    color: var(--text-on-accent);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .generate-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .generate-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* ===== 加载动画 ===== */
  .generate-btn :global(.lucide-loader) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* ===== 响应式设计 ===== */
  @media (max-width: 768px) {
    .prompt-footer {
      flex-wrap: wrap;
    }

    .prompt-selector-btn {
      order: 1;
    }

    .prompt-textarea {
      order: 2;
      flex: 1 1 100%;
    }

    .view-prompt-btn {
      order: 3;
    }

    .generate-btn {
      order: 4;
      flex: 1;
    }
  }
</style>
