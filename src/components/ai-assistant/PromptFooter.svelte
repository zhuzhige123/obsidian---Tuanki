<script lang="ts">
  import { AbstractInputSuggest, Menu, type App } from 'obsidian';
  import { onMount } from 'svelte';
  import type { WeavePlugin } from '../../main';
  import type { PromptTemplate, AIProvider } from '../../types/ai-types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { AI_PROVIDER_LABELS } from '../settings/constants/settings-constants';
  import { addWeaveNavigationItems, type WeavePageId } from '../../utils/weave-navigation-menu';
  import { applyStyleProps } from '../../utils/style-props';
  import { i18n, tr } from '../../utils/i18n';
  import { addMenuRadioChoices } from '../../utils/obsidian-menu';
  import { showProviderModelMenuAt, type ProviderModelMenuSelect } from '../../utils/provider-model-menu';

  type PromptSuggestionItem = PromptTemplate & {
    category: 'official' | 'custom';
    useBuiltinSystemPrompt: true;
  };

  class PromptInputSuggest extends AbstractInputSuggest<PromptSuggestionItem> {
    private getItems: () => PromptSuggestionItem[];
    private applyItem: (prompt: PromptSuggestionItem) => void;

    constructor(
      app: App,
      inputEl: HTMLTextAreaElement,
      getItems: () => PromptSuggestionItem[],
      applyItem: (prompt: PromptSuggestionItem) => void
    ) {
      super(app, inputEl as unknown as HTMLInputElement);
      this.getItems = getItems;
      this.applyItem = applyItem;
      this.limit = 8;
    }

    getSuggestions(query: string): PromptSuggestionItem[] {
      const normalized = query.trim().toLowerCase();
      const items = this.getItems();
      if (!normalized) return items.slice(0, 8);
      return items.filter((prompt) => {
        const text = `${prompt.name} ${prompt.description ?? ''}`.toLowerCase();
        return text.includes(normalized);
      }).slice(0, 8);
    }

    renderSuggestion(prompt: PromptSuggestionItem, el: HTMLElement): void {
      el.addClass('weave-ai-prompt-suggest-item');

      const row = el.createDiv({ cls: 'weave-ai-prompt-suggest-row' });
      row.createDiv({ text: prompt.name, cls: 'weave-ai-prompt-suggest-title' });
      row.createDiv({
        text: prompt.category === 'official' ? i18n.t('aiAssistant.promptFooter.builtin') : i18n.t('aiAssistant.promptFooter.custom'),
        cls: 'weave-ai-prompt-suggest-badge'
      });

      if (prompt.description) {
        el.createDiv({ text: prompt.description, cls: 'weave-ai-prompt-suggest-desc' });
      }
    }

    selectSuggestion(prompt: PromptSuggestionItem, evt: MouseEvent | KeyboardEvent): void {
      this.applyItem(prompt);
      super.selectSuggestion(prompt, evt);
    }
  }

  interface Props {
    plugin: WeavePlugin;
    selectedPrompt: PromptTemplate | null;
    customPrompt: string;
    currentPage?: string;
    onNavigate?: (page: string) => void;
    selectedProvider: AIProvider;
    selectedModel: string;
    onPromptSelect: (prompt: PromptTemplate | null) => void;
    onCustomPromptChange: (prompt: string) => void;
    onProviderModelChange: (provider: AIProvider, model: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    disabled: boolean;
    showPromptSelector?: boolean;
    showProviderSelector?: boolean;
    showTextarea?: boolean;
    showGenerateButton?: boolean;
    showPluginMenuButton?: boolean;
    compact?: boolean;
    refreshKey?: number; // 刷新键，用于强制刷新提示词列表
  }

  let {
    plugin,
    selectedPrompt = $bindable(),
    customPrompt = $bindable(),
    currentPage = 'ai-assistant',
    onNavigate,
    selectedProvider,
    selectedModel,
    onPromptSelect,
    onCustomPromptChange,
    onProviderModelChange,
    onGenerate,
    isGenerating,
    disabled,
    showPromptSelector = true,
    showProviderSelector = true,
    showTextarea = true,
    showGenerateButton = true,
    showPluginMenuButton = false,
    compact = false,
    refreshKey = 0
  }: Props = $props();
  let t = $derived($tr);

  // 输入框引用
  let textareaElement = $state<HTMLTextAreaElement | undefined>(undefined);
  let promptSuggest: PromptInputSuggest | null = null;
  const promptTemplates = $derived(
    plugin.settings.aiConfig?.promptTemplates ?? { official: [], custom: [] }
  );

  // 获取提示词模板（依赖refreshKey以触发刷新）
  let officialPrompts = $derived<PromptTemplate[]>((() => {
    refreshKey; // 使refreshKey成为依赖项
    return promptTemplates.official.map(p => ({
      ...p,
      category: 'official' as const,
      useBuiltinSystemPrompt: true
    }));
  })());
  
  let customPrompts = $derived<PromptTemplate[]>((() => {
    refreshKey; // 使refreshKey成为依赖项
    return promptTemplates.custom.map(p => ({
      ...p,
      category: 'custom' as const,
      useBuiltinSystemPrompt: true
    }));
  })());

  const allPromptSuggestions = $derived.by<PromptSuggestionItem[]>(() => [
    ...officialPrompts,
    ...customPrompts
  ] as PromptSuggestionItem[]);

  // 打开提示词选择菜单（使用 Obsidian Menu API）
  function openPromptMenu(event: MouseEvent) {
    const menu = new Menu();
    const promptChoices = [
      ...officialPrompts.map((prompt) => ({
        title: prompt.name,
        icon: 'message-square' as const,
        value: prompt,
      })),
      ...customPrompts.map((prompt) => ({
        title: prompt.name,
        icon: 'file-text' as const,
        value: prompt,
      })),
    ];

    if (promptChoices.length === 0) {
      menu.addItem((item) => {
        item
          .setTitle(i18n.t('aiAssistant.toolbar.noTemplates'))
          .setDisabled(true);
      });
    } else {
      addMenuRadioChoices(
        menu,
        selectedPrompt?.id ?? '',
        promptChoices.map((choice) => ({
          title: choice.title,
          icon: choice.icon,
          value: choice.value.id,
        })),
        (promptId) => {
          const prompt = promptChoices.find((choice) => choice.value.id === promptId)?.value ?? null;
          selectedPrompt = prompt;
          onPromptSelect(prompt);
        }
      );
    }

    menu.showAtMouseEvent(event);
  }

  // 打开AI服务商/模型选择菜单（悬停展开子菜单）
  function openProviderMenu(event: MouseEvent) {
    const aiConfig = plugin.settings.aiConfig;
    const apiKeys = (aiConfig?.apiKeys || {}) as Record<string, { model?: string } | undefined>;

    showProviderModelMenuAt(event, {
      apiKeys,
      selection: {
        provider: selectedProvider,
        model: selectedModel,
      },
      preferredProvider: selectedProvider,
      onSelect: (next: ProviderModelMenuSelect) => {
        if (!next.provider || !next.model) {
          return;
        }
        onProviderModelChange(next.provider, next.model);
      },
    });
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

  function openPluginMenu(event: MouseEvent) {
    const menu = new Menu();

    if (currentPage === 'ai-assistant') {
      menu.addItem((item) => {
        item
          .setTitle(i18n.t('mainMenu.aiAssistant.history'))
          .setIcon('history')
          .onClick(() => {
            window.dispatchEvent(
              new CustomEvent('Weave:ai-toolbar-action', {
                detail: { action: 'history' }
              })
            );
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(i18n.t('mainMenu.aiAssistant.selectModel'))
          .setIcon('cpu')
          .onClick(() => {
            window.dispatchEvent(
              new CustomEvent('Weave:ai-toolbar-action', {
                detail: { action: 'model' }
              })
            );
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(i18n.t('mainMenu.aiAssistant.config'))
          .setIcon('settings')
          .onClick(() => {
            window.dispatchEvent(
              new CustomEvent('Weave:ai-toolbar-action', {
                detail: { action: 'config' }
              })
            );
          });
      });

      menu.addSeparator();
    }

    addWeaveNavigationItems(menu, currentPage, (pageId: WeavePageId) => {
      onNavigate?.(pageId);
    });

    menu.showAtMouseEvent(event);
  }

  function applyPromptSuggestion(prompt: PromptSuggestionItem) {
    selectedPrompt = prompt;
    onPromptSelect(prompt);
    if (textareaElement) {
      textareaElement.focus();
    }
  }

  function syncPromptSuggestPopover() {
    if (!textareaElement) return;
    const currentTextarea = textareaElement;
    window.requestAnimationFrame(() => {
      const popovers = Array.from(document.querySelectorAll('.suggestion-container')) as HTMLElement[];
      const activePopover = popovers.at(-1);
      if (!activePopover) return;
      document
        .querySelectorAll('.weave-ai-prompt-suggest-popover')
        .forEach((el) => el.classList.remove('weave-ai-prompt-suggest-popover'));
      activePopover.classList.add('weave-ai-prompt-suggest-popover');
      const inputRect = currentTextarea.getBoundingClientRect();
      const width = Math.min(
        Math.max(Math.round(inputRect.width), 320),
        Math.max(280, window.innerWidth - 24)
      );
      applyStyleProps(activePopover, {
        width: `${width}px`,
        maxWidth: `${width}px`,
        minWidth: `${width}px`,
        zIndex: 40
      });
    });
  }

  function showPromptSuggestions() {
    if (!textareaElement || !promptSuggest) return;
    promptSuggest.setValue(textareaElement.value);
    textareaElement.dispatchEvent(new Event('input', { bubbles: true }));
    syncPromptSuggestPopover();
  }

  // 自动调整 textarea 高度
  function adjustTextareaHeight() {
    if (!textareaElement) return;
    
    // 重置高度以获取正确的 scrollHeight
    applyStyleProps(textareaElement, { height: '36px' });
    
    // 计算新高度（最小 36px，最大 120px）
    const newHeight = Math.min(Math.max(textareaElement.scrollHeight, 36), 120);
    applyStyleProps(textareaElement, { height: `${newHeight}px` });
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

  $effect(() => {
    refreshKey;
    if (!textareaElement || !promptSuggest) return;
    window.requestAnimationFrame(() => {
      syncPromptSuggestPopover();
    });
  });

  onMount(() => {
    if (!textareaElement) return;
    promptSuggest = new PromptInputSuggest(
      plugin.app,
      textareaElement,
      () => allPromptSuggestions,
      applyPromptSuggestion
    );

    const handleTemplatesUpdated = () => {
      window.requestAnimationFrame(() => {
        if (document.activeElement === textareaElement) {
          showPromptSuggestions();
        }
      });
    };

    const handleViewportChange = () => {
      syncPromptSuggestPopover();
    };

    window.addEventListener('Weave:ai-prompt-templates-updated', handleTemplatesUpdated as EventListener);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('Weave:ai-prompt-templates-updated', handleTemplatesUpdated as EventListener);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      promptSuggest = null;
    };
  });
</script>

<div class="prompt-footer" class:compact>
  <!-- 提示词选择按钮 -->
  {#if showPromptSelector}
    <button
      class="prompt-selector-btn"
      onclick={openPromptMenu}
      title={t('aiAssistant.toolbar.selectPromptTemplate')}
    >
      <ObsidianIcon name="message-square" size={14} />
      <span class="prompt-selector-text">
        {selectedPrompt ? selectedPrompt.name : t('aiAssistant.promptFooter.selectPrompt')}
      </span>
      <ObsidianIcon name="chevron-down" size={12} />
    </button>
  {/if}

  <!-- AI服务商/模型选择按钮 -->
  {#if showProviderSelector}
    <button
      class="ai-provider-selector-btn"
      onclick={openProviderMenu}
      title={t('aiAssistant.toolbar.selectProviderModel')}
    >
      <ObsidianIcon name="cpu" size={14} />
      <span class="provider-text">
        {AI_PROVIDER_LABELS[selectedProvider]} · {selectedModel}
      </span>
      <ObsidianIcon name="chevron-down" size={12} />
    </button>
  {/if}

  <!-- 自定义提示词输入框 -->
  {#if showTextarea}
    <div class="prompt-input-shell">
      {#if showPluginMenuButton}
        <button
          class="plugin-menu-btn"
          onclick={openPluginMenu}
          aria-label={t('aiAssistant.promptFooter.openPluginMenu')}
          title={t('aiAssistant.promptFooter.openPluginMenu')}
        >
          <ObsidianIcon name="menu" size={18} />
        </button>
      {/if}

      <textarea
        bind:this={textareaElement}
        class="prompt-textarea"
        placeholder={t('aiAssistant.promptFooter.customPromptPlaceholder')}
        value={customPrompt}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        onclick={showPromptSuggestions}
        onfocus={showPromptSuggestions}
      ></textarea>
    </div>
  {/if}

  <!-- 生成按钮 -->
  {#if showGenerateButton}
    <button
      class="generate-btn"
      onclick={onGenerate}
      disabled={disabled || isGenerating}
      title={disabled ? t('aiAssistant.promptFooter.inputContentFirst') : t('aiAssistant.toolbar.generateCards')}
    >
      {#if isGenerating}
        <ObsidianIcon name="loader" size={16} />
        <span>{t('mainMenu.aiAssistant.generating')}</span>
      {:else}
        <ObsidianIcon name="sparkles" size={16} />
        <span>{t('aiAssistant.promptFooter.clickToGenerate')}</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  :root {
    --prompt-footer-height: 36px;
    --prompt-footer-gap: 8px;
    --prompt-footer-padding: 12px;
    --prompt-footer-radius: 6px;
  }

  .prompt-footer {
    display: flex;
    align-items: flex-start;
    gap: var(--prompt-footer-gap);
    padding: var(--prompt-footer-padding);
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    background: var(--background-primary);
    border-top: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
    z-index: 5;
  }

  .prompt-footer.compact {
    padding: 0;
    border-top: none;
    background: transparent;
    gap: 10px;
  }

  .prompt-selector-btn,
  .ai-provider-selector-btn {
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

  .prompt-selector-btn:hover,
  .ai-provider-selector-btn:hover {
    background: var(--background-primary-alt);
    border-color: var(--interactive-accent);
  }

  .prompt-selector-btn:active,
  .ai-provider-selector-btn:active {
    transform: scale(0.98);
  }

  .prompt-selector-text,
  .provider-text {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .prompt-textarea { 
    flex: 1; 
    min-width: 0; 
    min-height: var(--prompt-footer-height); 
    max-height: 120px; 
    padding: 8px 12px; 
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 88%, var(--text-faint)); 
    border-radius: var(--prompt-footer-radius); 
    background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary)); 
    color: var(--text-normal); 
    font-size: 0.875rem; 
    font-family: inherit; 
    line-height: 1.5; 
    resize: none; 
    outline: none; 
    transition: border-color 0.2s ease, box-shadow 0.2s ease; 
    overflow-y: auto; 
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 72%, transparent);
  } 

  .prompt-input-shell {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 8px;
  }

  .plugin-menu-btn {
    flex: 0 0 auto;
    width: 36px;
    min-height: var(--prompt-footer-height);
    border-radius: var(--prompt-footer-radius);
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary));
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 72%, transparent);
  }

  .plugin-menu-btn:hover {
    color: var(--text-normal);
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
    background: var(--background-primary-alt);
  }

  .plugin-menu-btn:active {
    transform: scale(0.98);
  }

  .prompt-textarea:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
  }
 
  .prompt-textarea:focus { 
    border-color: var(--interactive-accent); 
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 16%, transparent); 
  } 

  .prompt-textarea::placeholder {
    color: var(--text-muted);
  }

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

  .compact .prompt-selector-btn,
  .compact .ai-provider-selector-btn,
  .compact .generate-btn {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 8px;
    box-shadow: none;
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

  @media (max-width: 768px) {
    .prompt-footer {
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 10px calc(12px + env(safe-area-inset-bottom, 0px));
    }

    .prompt-textarea {
      flex: 1 1 auto;
    }

    .prompt-input-shell {
      order: 1;
      flex: 1 1 100%;
    }

    .ai-provider-selector-btn {
      order: 2;
      flex: 1;
      min-width: 0;
      justify-content: center;
    }

    .prompt-selector-btn {
      order: 3;
      flex: 1;
      min-width: 0;
      justify-content: center;
    }

    .generate-btn {
      order: 4;
      flex: 1;
    }

    .prompt-selector-text,
    .provider-text {
      max-width: 80px;
    }
  }

  :global(.suggestion-container.weave-ai-prompt-suggest-popover) {
    padding: 8px;
    border-radius: 14px;
  }

  @media (max-width: 768px) {
    :global(.suggestion-container.weave-ai-prompt-suggest-popover) {
      border-radius: 18px;
      padding: 10px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
    }

    :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion-item) {
      padding: 12px 14px;
      border-radius: 12px;
      margin: 3px 0;
    }
  }

  :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion) {
    padding: 0;
  }

  :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion-item) {
    padding: 10px 12px;
    border-radius: 10px;
    margin: 2px 0;
  }

  :global(.suggestion-container.weave-ai-prompt-suggest-popover .suggestion-item.is-selected) {
    background: var(--background-modifier-hover);
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-item) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0;
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-title) {
    min-width: 0;
    font-size: 0.88rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-normal);
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-badge) {
    flex: 0 0 auto;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
    color: var(--text-muted);
    font-size: 0.7rem;
    line-height: 1.2;
  }

  :global(.suggestion-container .weave-ai-prompt-suggest-desc) {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.45;
    white-space: normal;
    overflow: hidden;
    line-clamp: 2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
</style>
