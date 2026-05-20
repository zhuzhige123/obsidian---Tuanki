<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { WeavePlugin } from '../../main';
  import type { PromptTemplate, AIProvider, GenerationConfig, GenerationProgress, GeneratedCard } from '../../types/ai-types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { Menu, Notice } from 'obsidian';
  import { AI_PROVIDER_LABELS, AI_MODEL_OPTIONS } from '../settings/constants/settings-constants';
  import { AICardGenerationService } from '../../services/ai/AICardGenerationService';
  import { AIConfigModalObsidian } from './AIConfigModalObsidian';
  import CardPreviewModal from './CardPreviewModal.svelte';
  import { logger } from '../../utils/logger';
  import { applyStyleProps } from '../../utils/style-props';
  import { i18n, tr } from '../../utils/i18n';

  interface Props {
    plugin: WeavePlugin;
    content: string;
    sourceFilePath?: string;
    onClose: () => void;
  }

  let { plugin, content, sourceFilePath = '', onClose }: Props = $props();

  // 状态
  let selectedPrompt = $state<PromptTemplate | null>(null);
  let customPrompt = $state('');
  let isGenerating = $state(false);
  let generationProgress = $state<GenerationProgress | null>(null);
  let generatedCards = $state<GeneratedCard[]>([]);
  let aiConfigModalInstance: AIConfigModalObsidian | null = null;
  let showPreviewModal = $state(false);
  let textareaElement = $state<HTMLTextAreaElement | undefined>(undefined);
  let t = $derived($tr);

  // 从持久化设置中恢复AI制卡配置
  function createInitialGenerationConfig(): GenerationConfig {
    const aiAssistantPreferences = plugin.getAIAssistantPreferences();
    const saved = aiAssistantPreferences.savedGenerationConfig;
    const defaultMaxTokens = saved?.maxTokens ?? plugin.settings.aiConfig?.globalParams?.maxTokens ?? 2000;

    return {
      templateId: '',
      promptTemplate: '',
      cardCount: saved?.cardCount ?? 10,
      difficulty: saved?.difficulty ?? 'medium',
      typeDistribution: { ...(saved?.typeDistribution ?? { qa: 50, cloze: 30, choice: 20 }) },
      provider: (aiAssistantPreferences.lastUsedProvider || plugin.settings.aiConfig?.defaultProvider || 'openai') as AIProvider,
      model: aiAssistantPreferences.lastUsedModel || '',
      temperature: saved?.temperature ?? 0.7,
      maxTokens: defaultMaxTokens,
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
      enableHints: saved?.enableHints ?? true
    };
  }

  let generationConfig = $state<GenerationConfig>(untrack(() => createInitialGenerationConfig()));

  const generationService = untrack(() => new AICardGenerationService(plugin));

  // 提示词
  let officialPrompts = $derived<PromptTemplate[]>(
    (plugin.settings.aiConfig?.promptTemplates?.official || []).map(p => ({
      ...p,
      category: 'official' as const,
      useBuiltinSystemPrompt: true
    }))
  );

  let customPrompts = $derived<PromptTemplate[]>(
    (plugin.settings.aiConfig?.promptTemplates?.custom || []).map(p => ({
      ...p,
      category: 'custom' as const,
      useBuiltinSystemPrompt: true
    }))
  );

  function openPromptMenu(event: MouseEvent) {
    const menu = new Menu();

    if (officialPrompts.length > 0) {
      officialPrompts.forEach(prompt => {
        menu.addItem((item) => {
          item
            .setTitle(prompt.name)
            .setIcon('message-square')
            .setChecked(selectedPrompt?.id === prompt.id)
            .onClick(() => {
              selectedPrompt = prompt;
              customPrompt = '';
            });
        });
      });
    }

    if (officialPrompts.length > 0 && customPrompts.length > 0) {
      menu.addSeparator();
    }

    if (customPrompts.length > 0) {
      customPrompts.forEach(prompt => {
        menu.addItem((item) => {
          item
            .setTitle(prompt.name)
            .setIcon('file-text')
            .setChecked(selectedPrompt?.id === prompt.id)
            .onClick(() => {
              selectedPrompt = prompt;
              customPrompt = '';
            });
        });
      });
    }

    if (officialPrompts.length === 0 && customPrompts.length === 0) {
      menu.addItem((item) => {
        item.setTitle(i18n.t('aiAssistant.toolbar.noTemplates')).setDisabled(true);
      });
    }

    menu.showAtMouseEvent(event);
  }

  function openProviderMenu(event: MouseEvent) {
    const menu = new Menu();
    const aiConfig = plugin.settings.aiConfig;
    const apiKeys = (aiConfig?.apiKeys || {}) as Record<string, { model?: string } | undefined>;

    Object.entries(AI_MODEL_OPTIONS).forEach(([providerKey, models]) => {
      const provider = providerKey as AIProvider;
      menu.addItem((item) => {
        item
          .setTitle(AI_PROVIDER_LABELS[provider])
          .setIcon(generationConfig.provider === provider ? 'check' : '');

        const submenu = (item as any).setSubmenu();

        const configuredModel = apiKeys[provider]?.model;
        const staticModelIds: string[] = models.map(m => m.id);
        if (configuredModel && !staticModelIds.includes(configuredModel)) {
          submenu.addItem((modelItem: any) => {
            modelItem
              .setTitle(configuredModel)
              .setIcon(generationConfig.provider === provider && generationConfig.model === configuredModel ? 'check' : '')
              .onClick(() => {
                generationConfig.provider = provider;
                generationConfig.model = configuredModel;
              });
          });
          submenu.addSeparator();
        }

        models.forEach(model => {
          submenu.addItem((modelItem: any) => {
            modelItem
              .setTitle(model.label)
              .setIcon(generationConfig.provider === provider && generationConfig.model === model.id ? 'check' : '')
              .onClick(() => {
                generationConfig.provider = provider;
                generationConfig.model = model.id;
              });
          });
        });
      });
    });

    menu.showAtMouseEvent(event);
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    customPrompt = target.value;
    if (target.value && selectedPrompt) {
      selectedPrompt = null;
    }
    adjustTextareaHeight();
  }

  function adjustTextareaHeight() {
    if (!textareaElement) return;
    applyStyleProps(textareaElement, { height: '36px' });
    const newHeight = Math.min(Math.max(textareaElement.scrollHeight, 36), 120);
    applyStyleProps(textareaElement, { height: `${newHeight}px` });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isGenerating && content.trim()) {
        handleGenerate();
      }
    }
  }

  async function handleGenerate() {
    if (!content.trim()) {
      new Notice(t('aiAssistant.toolbar.emptyContent'));
      return;
    }

    try {
      isGenerating = true;
      generatedCards = [];
      showPreviewModal = true;

      const result = await generationService.generateCards(
        content,
        generationConfig,
        selectedPrompt,
        customPrompt,
        {
          onProgress: (progress) => {
            generationProgress = progress;
          },
          onCardsUpdate: (cards) => {
            generatedCards = cards;
          }
        }
      );

      generatedCards = result;

      setTimeout(() => {
        generationProgress = null;
      }, 1000);

    } catch (error) {
      new Notice(error instanceof Error ? error.message : t('aiAssistant.toolbar.generateFailed'));
      if (generationProgress) {
        generationProgress = {
          status: 'failed',
          progress: 0,
          message: error instanceof Error ? error.message : t('aiAssistant.toolbar.generatingFailedStatus')
        };
      }
    } finally {
      isGenerating = false;
    }
  }

  function openAIConfigModalWithObsidianAPI() {
    aiConfigModalInstance?.close();
    aiConfigModalInstance = new AIConfigModalObsidian(plugin.app, {
      plugin,
      config: generationConfig,
      onSave: handleSaveConfig,
      onClose: () => {
        aiConfigModalInstance = null;
      }
    });
    aiConfigModalInstance.open();
  }

  async function handleSaveConfig(newConfig: GenerationConfig) {
    generationConfig = newConfig;

    await plugin.saveAIAssistantPreferences({
      ...plugin.getAIAssistantPreferences(),
      lastUsedProvider: newConfig.provider,
      lastUsedModel: newConfig.model,
      savedGenerationConfig: {
        cardCount: newConfig.cardCount,
        difficulty: newConfig.difficulty,
        typeDistribution: { ...newConfig.typeDistribution },
        enableHints: newConfig.enableHints,
        temperature: newConfig.temperature,
        maxTokens: newConfig.maxTokens
      }
    });
  }

  onDestroy(() => {
    aiConfigModalInstance?.close();
    aiConfigModalInstance = null;
  });

  async function handleImportCards(selectedCards: GeneratedCard[], targetDeckId: string) {
    try {
      const deck = await plugin.dataStorage?.getDeck(targetDeckId);
      if (!deck) {
        throw new Error(t('aiAssistant.toolbar.targetDeckNotFound'));
      }

      const { CardConverter } = await import('../../services/ai/CardConverter');

      const { cards, errors } = CardConverter.convertBatch(
        selectedCards,
        targetDeckId,
        sourceFilePath || undefined,
        generationConfig.templates,
        plugin.fsrs
      );

      if (errors.length > 0) {
        logger.warn('[EditorAIToolbar] Card conversion errors:', errors);
      }

      let successCount = 0;
      let failCount = 0;

      for (const card of cards) {
        try {
          await plugin.dataStorage?.saveCard(card);
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        new Notice(t('aiAssistant.toolbar.importSuccess', { count: successCount, deck: deck.name }));
      }
      if (failCount > 0 || errors.length > 0) {
        new Notice(t('aiAssistant.toolbar.importFailedCount', { count: failCount + errors.length }), 5000);
      }
    } catch (error) {
      new Notice(error instanceof Error ? error.message : t('aiAssistant.toolbar.importFailed'));
      throw error;
    }
  }

  $effect(() => {
    if (customPrompt !== undefined) {
      adjustTextareaHeight();
    }
  });
</script>

<div class="editor-ai-toolbar">
  <div class="toolbar-row">
    <!-- 提示词选择 -->
    <button
      class="toolbar-btn prompt-btn"
      onclick={openPromptMenu}
      title={t('aiAssistant.toolbar.selectPromptTemplate')}
    >
      <ObsidianIcon name="message-square" size={14} />
      <span class="btn-text">
        {selectedPrompt ? selectedPrompt.name : t('aiAssistant.toolbar.prompt')}
      </span>
      <ObsidianIcon name="chevron-down" size={12} />
    </button>

    <!-- 模型选择 -->
    <button
      class="toolbar-btn model-btn"
      onclick={openProviderMenu}
      title={t('aiAssistant.toolbar.selectProviderModel')}
    >
      <ObsidianIcon name="cpu" size={14} />
      <span class="btn-text">
        {AI_PROVIDER_LABELS[generationConfig.provider]} · {generationConfig.model}
      </span>
      <ObsidianIcon name="chevron-down" size={12} />
    </button>

    <!-- 自定义提示词 -->
    <textarea
      bind:this={textareaElement}
      class="toolbar-textarea"
      placeholder={t('aiAssistant.toolbar.customPromptPlaceholder')}
      value={customPrompt}
      oninput={handleInput}
      onkeydown={handleKeyDown}
    ></textarea>

    <!-- 配置按钮 -->
    <button
      class="toolbar-btn config-btn"
      onclick={openAIConfigModalWithObsidianAPI}
      title={t('mainMenu.aiAssistant.config')}
    >
      <ObsidianIcon name="settings" size={14} />
    </button>

    <!-- 生成按钮 -->
    <button
      class="toolbar-btn generate-btn"
      onclick={handleGenerate}
      disabled={!content.trim() || isGenerating}
      title={!content.trim() ? t('aiAssistant.toolbar.emptyContent') : t('aiAssistant.toolbar.generateCards')}
    >
      {#if isGenerating}
        <ObsidianIcon name="loader" size={16} />
        <span>{t('mainMenu.aiAssistant.generating')}</span>
      {:else}
        <ObsidianIcon name="sparkles" size={16} />
        <span>{t('aiAssistant.toolbar.generate')}</span>
      {/if}
    </button>

    <!-- 展开预览按钮（有生成结果时显示） -->
    {#if generatedCards.length > 0 && !showPreviewModal}
      <button
        class="toolbar-btn expand-btn"
        onclick={() => showPreviewModal = true}
        title={t('aiAssistant.toolbar.expandPreview', { count: generatedCards.length })}
      >
        <ObsidianIcon name="panel-top-open" size={14} />
        <span class="card-count-badge">{generatedCards.length}</span>
      </button>
    {/if}

    <!-- 关闭按钮 -->
    <button
      class="toolbar-btn close-btn"
      onclick={onClose}
      title={t('aiAssistant.toolbar.closeToolbar')}
    >
      <ObsidianIcon name="x" size={14} />
    </button>
  </div>

</div>

<!-- 配置模态窗 -->
<!-- 卡片预览模态窗 -->
<CardPreviewModal
  {plugin}
  cards={generatedCards}
  config={generationConfig}
  isOpen={showPreviewModal}
  isGenerating={isGenerating}
  totalCards={generationConfig.cardCount}
  onClose={() => { showPreviewModal = false; }}
  onImport={handleImportCards}
/>

<style>
  .editor-ai-toolbar {
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    border-top: 2px solid var(--interactive-accent);
    padding: 8px 12px;
    gap: 6px;
    flex-shrink: 0;
  }

  .toolbar-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 36px;
    padding: 0 10px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .toolbar-btn:hover {
    background: var(--background-primary-alt);
    border-color: var(--interactive-accent);
  }

  .toolbar-btn:active {
    transform: scale(0.98);
  }

  .btn-text {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toolbar-textarea {
    flex: 1;
    min-width: 0;
    min-height: 36px;
    max-height: 120px;
    padding: 7px 10px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.8125rem;
    font-family: inherit;
    line-height: 1.5;
    resize: none;
    outline: none;
    transition: border-color 0.15s ease;
    overflow-y: auto;
  }

  .toolbar-textarea:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.1);
  }

  .toolbar-textarea::placeholder {
    color: var(--text-muted);
  }

  .generate-btn {
    background: var(--interactive-accent);
    border-color: transparent;
    color: var(--text-on-accent);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .generate-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
    border-color: transparent;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .generate-btn :global(.lucide-loader) {
    animation: spin 1s linear infinite;
  }

  .close-btn {
    color: var(--text-muted);
    padding: 0 8px;
  }

  .close-btn:hover {
    color: var(--text-normal);
  }

  .config-btn {
    color: var(--text-muted);
    padding: 0 8px;
  }

  .config-btn:hover {
    color: var(--text-normal);
  }

  .expand-btn {
    position: relative;
    color: var(--interactive-accent);
    padding: 0 8px;
  }

  .expand-btn:hover {
    color: var(--interactive-accent-hover);
  }

  .card-count-badge {
    position: absolute;
    top: -4px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* 容器全局定位（sticky 固定在编辑器底部） */
  :global(.weave-editor-ai-toolbar-container) {
    position: sticky;
    bottom: 0;
    z-index: 20;
    width: 100%;
  }

  /* 移动端适配 */
  @media (max-width: 768px) {
    .toolbar-row {
      flex-wrap: wrap;
    }

    .prompt-btn {
      order: 1;
    }

    .model-btn {
      order: 2;
    }

    .toolbar-textarea {
      order: 3;
      flex: 1 1 100%;
    }

    .generate-btn {
      order: 4;
      flex: 1;
    }

    .config-btn {
      order: 5;
    }

    .close-btn {
      order: 6;
    }
  }
</style>
