<script lang="ts">
  import { logger } from '../../utils/logger';
  import { onDestroy, untrack } from 'svelte';

  import type { WeavePlugin } from '../../main';
  import type { WeaveDataStorage } from '../../data/storage';
  import type { FSRS } from '../../algorithms/fsrs';
  import type {
    AIProvider,
    GeneratedCard,
    GenerationConfig,
    GenerationProgress,
    ObsidianFileInfo,
    PromptTemplate
  } from '../../types/ai-types';

  import PromptFooter from '../ai-assistant/PromptFooter.svelte';
  import { AIConfigModalObsidian } from '../ai-assistant/AIConfigModalObsidian';
  import AICardPreviewWorkspace from '../ai-assistant/AICardPreviewWorkspace.svelte';
  import { AICardGenerationService } from '../../services/ai/AICardGenerationService';
  import { Menu, Notice, Platform, TFile } from 'obsidian';
  import { AI_PROVIDER_LABELS, AI_MODEL_OPTIONS } from '../settings/constants/settings-constants';
  import { fileToInfo } from '../../utils/file-utils';
  import { findWeaveViewLeafContent, hasWeaveMobileNativeHeader } from '../../utils/mobile-native-header';

  interface Props {
    plugin: WeavePlugin;
    dataStorage: WeaveDataStorage;
    fsrs: FSRS;
    onNavigate?: (page: string) => void;
  }

  interface ToolbarAnchorRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }

  interface GenerationHistoryEntry {
    id: string;
    createdAt: string;
    sourceFile: {
      path: string;
      name: string;
      size: number;
      extension: string;
    } | null;
    sourceContent: string;
    cards: GeneratedCard[];
    config: GenerationConfig;
    selectedPrompt: PromptTemplate | null;
    customPrompt: string;
  }

  let { plugin, dataStorage, fsrs, onNavigate }: Props = $props();

  let selectedFile = $state<ObsidianFileInfo | null>(null);
  let selectedFileDisplayName = $state('');
  let content = $state('');
  let selectedPrompt = $state<PromptTemplate | null>(null);
  let customPrompt = $state('');
  let fileLoadSeq = 0;

  let isGenerating = $state(false);
  let generationProgress = $state<GenerationProgress | null>(null);
  let generatedCards = $state<GeneratedCard[]>([]);
  let generationHistory = $state<GenerationHistoryEntry[]>([]);
  let generationHistoryHydrated = $state(false);
  let generationHistoryReady = $state(false);

  let aiConfigModalInstance: AIConfigModalObsidian | null = null;
  let mobileViewportCleanup: (() => void) | null = null;
  let mobileChromeSyncIntervalId: number | null = null;
  let isKeyboardVisible = $state(false);
  let keyboardFocusCleanup: (() => void) | null = null;

  let showInlineFilePicker = $state(false);
  let filePickerQuery = $state('');
  let filePickerAnchor = $state<ToolbarAnchorRect | null>(null);
  let availableMarkdownFiles = $state<ObsidianFileInfo[]>([]);
  let pageContainerEl = $state<HTMLDivElement | null>(null);
  let filePickerPanelEl = $state<HTMLDivElement | null>(null);
  let filePickerSearchInput = $state<HTMLInputElement | null>(null);
  let showInlineHistoryPanel = $state(false);
  let historyPanelAnchor = $state<ToolbarAnchorRect | null>(null);
  let historyPanelEl = $state<HTMLDivElement | null>(null);
  let promptTemplatesRefreshKey = $state(0);
  let showInlinePluginMenuButton = $state(false);

  function getPromptTemplateOptions(): PromptTemplate[] {
    const promptTemplates = plugin.settings.aiConfig?.promptTemplates ?? { official: [], custom: [] };
    return [
      ...promptTemplates.official.map((prompt) => ({
        ...prompt,
        category: 'official' as const,
        useBuiltinSystemPrompt: true
      })),
      ...promptTemplates.custom.map((prompt) => ({
        ...prompt,
        category: 'custom' as const,
        useBuiltinSystemPrompt: true
      }))
    ];
  }

  const promptTemplateOptions = $derived.by(() => {
    promptTemplatesRefreshKey;
    return getPromptTemplateOptions();
  });

  function createInitialGenerationConfig(): GenerationConfig {
    const aiAssistantPreferences = plugin.getAIAssistantPreferences();
    const saved = aiAssistantPreferences.savedGenerationConfig;

    return {
      templateId: '',
      promptTemplate: '',
      cardCount: saved?.cardCount ?? 10,
      difficulty: saved?.difficulty ?? 'medium',
      typeDistribution: { ...(saved?.typeDistribution ?? { qa: 50, cloze: 30, choice: 20 }) },
      provider: (aiAssistantPreferences.lastUsedProvider || plugin.settings.aiConfig?.defaultProvider || 'openai') as AIProvider,
      model: aiAssistantPreferences.lastUsedModel || '',
      temperature: saved?.temperature ?? 0.7,
      maxTokens: saved?.maxTokens ?? 2000,
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
      autoTags: [...(saved?.autoTags ?? [])],
      enableHints: saved?.enableHints ?? true
    };
  }

  let generationConfig = $state<GenerationConfig>(untrack(() => createInitialGenerationConfig()));

  const filteredMarkdownFiles = $derived.by(() => {
    const query = filePickerQuery.trim().toLowerCase();
    if (!query) return availableMarkdownFiles.slice(0, 80);
    return availableMarkdownFiles.filter((file) => {
      const target = `${file.name} ${file.path}`.toLowerCase();
      return target.includes(query);
    }).slice(0, 80);
  });

  const filePickerPanelStyle = $derived.by(() => {
    if (!filePickerAnchor) return '';
    const containerRect = pageContainerEl?.getBoundingClientRect();
    const isMobileLayout = Platform.isMobile
      || document.body.classList.contains('is-mobile')
      || document.body.classList.contains('is-phone');
    const panelWidth = isMobileLayout
      ? Math.min((containerRect?.width ?? window.innerWidth) - 24, 420)
      : Math.min(360, Math.max(260, filePickerAnchor.width + 24));
    const maxWidth = containerRect?.width ?? window.innerWidth;
    const maxHeight = containerRect?.height ?? window.innerHeight;
    const anchorLeft = containerRect ? filePickerAnchor.left - containerRect.left : filePickerAnchor.left;
    const anchorBottom = containerRect ? filePickerAnchor.bottom - containerRect.top : filePickerAnchor.bottom;
    const preferredLeft = isMobileLayout ? 12 : anchorLeft;
    const left = Math.max(8, Math.min(preferredLeft, maxWidth - panelWidth - 8));
    const top = Math.min(
      anchorBottom + 8,
      Math.max(12, maxHeight - (isMobileLayout ? 520 : 420))
    );
    return `left:${left}px;top:${top}px;width:${panelWidth}px;`;
  });

  const historyPanelStyle = $derived.by(() => {
    if (!historyPanelAnchor) return '';
    const containerRect = pageContainerEl?.getBoundingClientRect();
    const isMobileLayout = Platform.isMobile
      || document.body.classList.contains('is-mobile')
      || document.body.classList.contains('is-phone');
    const panelWidth = isMobileLayout
      ? Math.min((containerRect?.width ?? window.innerWidth) - 24, 420)
      : 320;
    const maxWidth = containerRect?.width ?? window.innerWidth;
    const maxHeight = containerRect?.height ?? window.innerHeight;
    const anchorLeft = containerRect ? historyPanelAnchor.left - containerRect.left : historyPanelAnchor.left;
    const anchorBottom = containerRect ? historyPanelAnchor.bottom - containerRect.top : historyPanelAnchor.bottom;
    const preferredLeft = isMobileLayout ? 12 : anchorLeft;
    const left = Math.max(8, Math.min(preferredLeft, maxWidth - panelWidth - 8));
    const top = Math.min(
      anchorBottom + 8,
      Math.max(12, maxHeight - (isMobileLayout ? 480 : 360))
    );
    return `left:${left}px;top:${top}px;width:${panelWidth}px;`;
  });

  function cloneGeneratedCards(cards: GeneratedCard[]): GeneratedCard[] {
    return cards.map((card) => ({
      ...card,
      tags: card.tags ? [...card.tags] : undefined,
      images: card.images ? [...card.images] : undefined,
      metadata: { ...card.metadata }
    }));
  }

  function cloneGenerationConfig(config: GenerationConfig): GenerationConfig {
    return {
      ...config,
      typeDistribution: { ...config.typeDistribution },
      imageGeneration: { ...config.imageGeneration },
      templates: config.templates ? { ...config.templates } : undefined,
      autoTags: [...config.autoTags]
    };
  }

  function clonePromptTemplate(prompt: PromptTemplate | null): PromptTemplate | null {
    return prompt ? { ...prompt, variables: [...prompt.variables] } : null;
  }

  function formatHistoryTime(value: string): string {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function formatFileSize(size: number): string {
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  async function handleFileSelect(file: ObsidianFileInfo) {
    const seq = ++fileLoadSeq;
    selectedFile = file;
    selectedFileDisplayName = file.name;
    showInlineFilePicker = false;

    try {
      const fileContent = await plugin.app.vault.read(file.file);
      if (seq !== fileLoadSeq) return;
      if (selectedFile?.path !== file.path) return;
      content = fileContent;
    } catch (error) {
      new Notice('读取文件失败');
      logger.error('Failed to read file:', error);
    }
  }

  function handlePromptSelect(prompt: PromptTemplate | null) {
    selectedPrompt = prompt;
    if (prompt) {
      customPrompt = '';
    }
  }

  function handleCustomPromptChange(prompt: string) {
    customPrompt = prompt;
    if (prompt.trim()) {
      selectedPrompt = null;
    }
  }

  function loadMarkdownFiles() {
    availableMarkdownFiles = plugin.app.vault.getMarkdownFiles().map((file) => fileToInfo(file));
  }

  function normalizeToolbarAnchor(detail?: { x?: number; y?: number; rect?: ToolbarAnchorRect }): ToolbarAnchorRect | null {
    if (detail?.rect) return detail.rect;
    const x = detail?.x;
    const y = detail?.y;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    return {
      left: Math.max(8, x - 24),
      top: Math.max(8, y - 36),
      right: x + 24,
      bottom: y,
      width: 48,
      height: 36
    };
  }

  function openInlineFilePicker(detail?: { x?: number; y?: number; rect?: ToolbarAnchorRect }) {
    loadMarkdownFiles();
    filePickerQuery = '';
    filePickerAnchor = normalizeToolbarAnchor(detail);
    showInlineHistoryPanel = false;
    showInlineFilePicker = true;

    requestAnimationFrame(() => {
      filePickerSearchInput?.focus();
      filePickerSearchInput?.select();
    });
  }

  function showToolbarMenu(menu: Menu, detail?: { x?: number; y?: number; rect?: ToolbarAnchorRect }) {
    const rect = detail?.rect;
    if (rect) {
      menu.showAtPosition({
        x: Math.round(rect.left),
        y: Math.round(rect.bottom + 6)
      });
      return;
    }

    if (typeof detail?.x === 'number' && typeof detail?.y === 'number') {
      menu.showAtPosition({
        x: Math.round(detail.x),
        y: Math.round(detail.y)
      });
      return;
    }

    menu.showAtPosition({
      x: Math.round(Math.max(24, window.innerWidth / 2 - 120)),
      y: 56
    });
  }

  function openPromptTemplatesMenu(detail?: { x?: number; y?: number; rect?: ToolbarAnchorRect }) {
    const menu = new Menu();

    if (promptTemplateOptions.length === 0) {
      menu.addItem((item) => {
        item.setTitle('暂无可用提示词').setIcon('message-square').setDisabled(true);
      });
    } else {
      promptTemplateOptions.forEach((prompt) => {
        menu.addItem((item) => {
          item
            .setTitle(prompt.name)
            .setIcon(selectedPrompt?.id === prompt.id ? 'check' : (prompt.category === 'official' ? 'message-square' : 'file-text'))
            .onClick(() => {
              handlePromptSelect(prompt);
            });
        });
      });
    }

    showToolbarMenu(menu, detail);
  }

  function openProviderModelMenu(detail?: { x?: number; y?: number; rect?: ToolbarAnchorRect }) {
    const menu = new Menu();
    const aiConfig = plugin.settings.aiConfig;
    const apiKeys = (aiConfig?.apiKeys || {}) as Record<string, { model?: string } | undefined>;

    Object.entries(AI_MODEL_OPTIONS).forEach(([providerKey, models]) => {
      const provider = providerKey as AIProvider;
      menu.addItem((providerItem: any) => {
        providerItem
          .setTitle(AI_PROVIDER_LABELS[provider])
          .setIcon(generationConfig.provider === provider ? 'check' : '');

        const providerSubmenu = providerItem.setSubmenu();
        const configuredModel = apiKeys[provider]?.model;
        const staticModelIds: string[] = models.map((model) => model.id);

        if (configuredModel && !staticModelIds.includes(configuredModel)) {
          providerSubmenu.addItem((modelItem: any) => {
            modelItem
              .setTitle(configuredModel)
              .setIcon(generationConfig.provider === provider && generationConfig.model === configuredModel ? 'check' : '')
              .onClick(() => {
                void handleProviderModelChange(provider, configuredModel);
              });
          });
          providerSubmenu.addSeparator();
        }

        models.forEach((model) => {
          providerSubmenu.addItem((modelItem: any) => {
            modelItem
              .setTitle(model.label)
              .setIcon(generationConfig.provider === provider && generationConfig.model === model.id ? 'check' : '')
              .onClick(() => {
                void handleProviderModelChange(provider, model.id);
              });
          });
        });
      });
    });

    showToolbarMenu(menu, detail);
  }

  function openDesktopAIToolsMenu(detail?: { x?: number; y?: number; rect?: ToolbarAnchorRect }) {
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('AI模型').setIcon('cpu');

      const submenu = (item as any).setSubmenu();
      const aiConfig = plugin.settings.aiConfig;
      const apiKeys = (aiConfig?.apiKeys || {}) as Record<string, { model?: string } | undefined>;

      Object.entries(AI_MODEL_OPTIONS).forEach(([providerKey, models]) => {
        const provider = providerKey as AIProvider;
        submenu.addItem((providerItem: any) => {
          providerItem
            .setTitle(AI_PROVIDER_LABELS[provider])
            .setIcon(generationConfig.provider === provider ? 'check' : '');

          const providerSubmenu = providerItem.setSubmenu();
          const configuredModel = apiKeys[provider]?.model;
          const staticModelIds: string[] = models.map((model) => model.id);

          if (configuredModel && !staticModelIds.includes(configuredModel)) {
            providerSubmenu.addItem((modelItem: any) => {
              modelItem
                .setTitle(configuredModel)
                .setIcon(generationConfig.provider === provider && generationConfig.model === configuredModel ? 'check' : '')
                .onClick(() => {
                  void handleProviderModelChange(provider, configuredModel);
                });
            });
            providerSubmenu.addSeparator();
          }

          models.forEach((model) => {
            providerSubmenu.addItem((modelItem: any) => {
              modelItem
                .setTitle(model.label)
                .setIcon(generationConfig.provider === provider && generationConfig.model === model.id ? 'check' : '')
                .onClick(() => {
                  void handleProviderModelChange(provider, model.id);
                });
            });
          });
        });
      });
    });

    menu.addItem((item) => {
      item.setTitle('AI配置').setIcon('settings');
      const submenu = (item as any).setSubmenu();
      submenu.addItem((subItem: any) => {
        subItem
          .setTitle('打开 AI 配置')
          .setIcon('settings')
          .onClick(() => {
            handleOpenConfig();
          });
      });
    });

    showToolbarMenu(menu, detail);
  }

  function pushGenerationHistory(cards: GeneratedCard[]) {
    const entry: GenerationHistoryEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceFile: selectedFile ? {
        path: selectedFile.path,
        name: selectedFile.name,
        size: selectedFile.size,
        extension: selectedFile.extension
      } : null,
      sourceContent: content,
      cards: cloneGeneratedCards(cards),
      config: cloneGenerationConfig(generationConfig),
      selectedPrompt: clonePromptTemplate(selectedPrompt),
      customPrompt
    };

    generationHistory = [entry, ...generationHistory].slice(0, 5);
  }

  function restoreGenerationHistory(entryId: string) {
    const entry = generationHistory.find((item) => item.id === entryId);
    if (!entry) {
      new Notice('未找到这条生成记录');
      return;
    }

    selectedFile = null;
    selectedFileDisplayName = entry.sourceFile?.name ?? '';
    content = entry.sourceContent;
    selectedPrompt = clonePromptTemplate(entry.selectedPrompt);
    customPrompt = entry.customPrompt;
    generationConfig = cloneGenerationConfig(entry.config);
    generatedCards = cloneGeneratedCards(entry.cards);
    generationProgress = null;
    isGenerating = false;
    showInlineHistoryPanel = false;

    new Notice(`已恢复 ${entry.cards.length} 张卡片预览`);
  }

  function openGenerationHistoryMenu(detail?: { x?: number; y?: number; rect?: ToolbarAnchorRect }) {
    historyPanelAnchor = normalizeToolbarAnchor(detail);
    showInlineFilePicker = false;
    showInlineHistoryPanel = !showInlineHistoryPanel;
  }

  const generationService = untrack(() => new AICardGenerationService(plugin));

  async function handleGenerate() {
    try {
      isGenerating = true;
      generationProgress = {
        status: 'preparing',
        progress: 0,
        message: '准备生成卡片'
      };
      generatedCards = [];

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
      if (result.length > 0) {
        pushGenerationHistory(result);
      }

      generationProgress = {
        status: 'completed',
        progress: 100,
        message: `已生成 ${result.length} 张卡片`
      };

      window.setTimeout(() => {
        generationProgress = null;
      }, 1000);
    } catch (error) {
      logger.error('Generation failed:', error);
      new Notice(error instanceof Error ? error.message : 'AI 生成失败');
      generationProgress = {
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'AI 生成失败'
      };
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

  function handleOpenConfig() {
    openAIConfigModalWithObsidianAPI();
  }

  async function handleSaveConfig(config: GenerationConfig) {
    generationConfig = config;

    await plugin.saveAIAssistantPreferences({
      ...plugin.getAIAssistantPreferences(),
      lastUsedProvider: config.provider,
      lastUsedModel: config.model,
      savedGenerationConfig: {
        cardCount: config.cardCount,
        difficulty: config.difficulty,
        typeDistribution: { ...config.typeDistribution },
        autoTags: config.autoTags ? [...config.autoTags] : [],
        enableHints: config.enableHints,
        temperature: config.temperature,
        maxTokens: config.maxTokens
      }
    });
    new Notice('配置已保存');
  }

  onDestroy(() => {
    aiConfigModalInstance?.close();
    aiConfigModalInstance = null;
  });

  async function handleProviderModelChange(provider: AIProvider, model: string) {
    generationConfig = {
      ...generationConfig,
      provider,
      model
    };

    await plugin.saveAIAssistantPreferences({
      ...plugin.getAIAssistantPreferences(),
      lastUsedProvider: provider,
      lastUsedModel: model
    });

    new Notice(`已切换到 ${provider} · ${model}`);
  }

  async function handleImportCards(selectedCards: GeneratedCard[], targetDeckId: string) {
    try {
      const deck = await dataStorage.getDeck(targetDeckId);
      if (!deck) {
        throw new Error('目标牌组不存在');
      }

      const { CardConverter } = await import('../../services/ai/CardConverter');
      const { cards, errors } = CardConverter.convertBatch(
        selectedCards,
        targetDeckId,
        selectedFile?.path,
        generationConfig.templates,
        fsrs
      );

      if (errors.length > 0) {
        logger.warn('Card conversion errors:', errors);
      }

      let successCount = 0;
      let failCount = 0;

      for (const card of cards) {
        try {
          await dataStorage.saveCard(card);
          successCount++;
        } catch (error) {
          failCount++;
          logger.error('Failed to save card:', card.uuid, error);
        }
      }

      if (successCount > 0) {
        new Notice(`成功导入 ${successCount} 张卡片到 ${deck.name}`);
      }

      if (failCount > 0 || errors.length > 0) {
        new Notice(`导入失败 ${failCount + errors.length} 张卡片`, 5000);
      }

      if (successCount === 0) {
        throw new Error('没有卡片成功导入');
      }
    } catch (error) {
      logger.error('Import cards failed:', error);
      throw error;
    }
  }

  async function persistGenerationHistory() {
    await plugin.saveAIGenerationHistory(generationHistory);
  }

  async function hydrateGenerationHistory() {
    generationHistory = plugin.getAIGenerationHistory().slice(0, 5);

    const lastEntry = generationHistory[0];
    if (!lastEntry) {
      generationHistoryReady = true;
      return;
    }

    selectedFileDisplayName = lastEntry.sourceFile?.name ?? '';

    if (!lastEntry.sourceFile?.path) {
      generationHistoryReady = true;
      return;
    }

    const abstractFile = plugin.app.vault.getAbstractFileByPath(lastEntry.sourceFile.path);
    if (abstractFile instanceof TFile) {
      selectedFile = fileToInfo(abstractFile);
    }
    generationHistoryReady = true;
  }

  const isEditableElement = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target instanceof HTMLInputElement) return true;
    if (target instanceof HTMLTextAreaElement) return true;
    if (target.isContentEditable) return true;
    if (target.closest('input, textarea, [contenteditable="true"], .cm-editor, .cm-content, .markdown-source-view')) {
      return true;
    }
    return false;
  };

  $effect(() => {
    if (!showInlineFilePicker && !showInlineHistoryPanel) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && filePickerPanelEl?.contains(target)) return;
      if (target && historyPanelEl?.contains(target)) return;
      showInlineFilePicker = false;
      showInlineHistoryPanel = false;
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        showInlineFilePicker = false;
        showInlineHistoryPanel = false;
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  });

  $effect(() => {
    if (!pageContainerEl) {
      showInlinePluginMenuButton = false;
      return;
    }

    const updateInlinePluginMenuButton = () => {
      showInlinePluginMenuButton = !hasWeaveMobileNativeHeader(pageContainerEl);
    };

    updateInlinePluginMenuButton();

    const host = findWeaveViewLeafContent(pageContainerEl);
    if (!(host instanceof HTMLElement)) {
      return;
    }

    const observer = new MutationObserver(() => {
      updateInlinePluginMenuButton();
    });

    observer.observe(host, {
      attributes: true,
      attributeFilter: ['data-weave-mobile-native-header']
    });

    return () => {
      observer.disconnect();
    };
  });

  $effect(() => {
    const isMobileLayout = Platform.isMobile
      || document.body.classList.contains('is-mobile')
      || document.body.classList.contains('is-phone');

    if (!isMobileLayout) {
      if (mobileViewportCleanup) {
        mobileViewportCleanup();
        mobileViewportCleanup = null;
      }
      if (mobileChromeSyncIntervalId) {
        window.clearInterval(mobileChromeSyncIntervalId);
        mobileChromeSyncIntervalId = null;
      }
      if (keyboardFocusCleanup) {
        keyboardFocusCleanup();
        keyboardFocusCleanup = null;
      }
      isKeyboardVisible = false;
      return;
    }

    const viewport = window.visualViewport;
    const updateViewportHeight = () => {
      const keyboardVisibleFromViewport = viewport
        ? Math.max(0, window.innerHeight - viewport.height) > 150
        : false;
      isKeyboardVisible = keyboardVisibleFromViewport || isEditableElement(document.activeElement);
    };

    if (!keyboardFocusCleanup) {
      const handleFocusIn = (event: FocusEvent) => {
        if (!isEditableElement(event.target)) return;
        isKeyboardVisible = true;
        updateViewportHeight();
      };

      const handleFocusOut = () => {
        window.setTimeout(() => {
          isKeyboardVisible = isEditableElement(document.activeElement);
          updateViewportHeight();
        }, 120);
      };

      document.addEventListener('focusin', handleFocusIn, true);
      document.addEventListener('focusout', handleFocusOut, true);
      keyboardFocusCleanup = () => {
        document.removeEventListener('focusin', handleFocusIn, true);
        document.removeEventListener('focusout', handleFocusOut, true);
      };
    }

    updateViewportHeight();
    if (viewport) {
      viewport.addEventListener('resize', updateViewportHeight);
      viewport.addEventListener('scroll', updateViewportHeight);
    }

    if (mobileChromeSyncIntervalId) {
      window.clearInterval(mobileChromeSyncIntervalId);
    }
    mobileChromeSyncIntervalId = window.setInterval(updateViewportHeight, 120);

    mobileViewportCleanup = () => {
      if (viewport) {
        viewport.removeEventListener('resize', updateViewportHeight);
        viewport.removeEventListener('scroll', updateViewportHeight);
      }
      if (mobileChromeSyncIntervalId) {
        window.clearInterval(mobileChromeSyncIntervalId);
        mobileChromeSyncIntervalId = null;
      }
    };

    return () => {
      if (mobileViewportCleanup) {
        mobileViewportCleanup();
        mobileViewportCleanup = null;
      }
      if (keyboardFocusCleanup) {
        keyboardFocusCleanup();
        keyboardFocusCleanup = null;
      }
    };
  });

  $effect(() => {
    window.dispatchEvent(new CustomEvent('Weave:ai-selected-file-change', {
      detail: {
        name: selectedFile?.name ?? selectedFileDisplayName ?? '',
        path: selectedFile?.path ?? ''
      }
    }));
  });

  $effect(() => {
    if (generationHistoryHydrated) return;
    generationHistoryHydrated = true;
    void hydrateGenerationHistory();
  });

  $effect(() => {
    window.dispatchEvent(new CustomEvent('Weave:ai-history-state-change', {
      detail: {
        count: generationHistory.length
      }
    }));
  });

  $effect(() => {
    window.dispatchEvent(new CustomEvent('Weave:ai-prompt-state-change', {
      detail: {
        templates: promptTemplateOptions.map((prompt) => ({
          id: prompt.id,
          name: prompt.name,
          description: prompt.description ?? '',
          category: prompt.category
        })),
        selectedPromptId: selectedPrompt?.id ?? '',
        selectedPromptName: selectedPrompt?.name ?? '',
        customPrompt
      }
    }));
  });

  $effect(() => {
    if (!generationHistoryReady) return;
    void persistGenerationHistory();
  });

  $effect(() => {
    const handleToolbarAction = (event: Event) => {
      const detail = (event as CustomEvent<{
        action: 'file' | 'tools' | 'history' | 'generate' | 'provider' | 'prompt' | 'config';
        x?: number;
        y?: number;
        rect?: ToolbarAnchorRect;
      }>).detail;
      if (!detail) return;

      switch (detail.action) {
        case 'file':
          openInlineFilePicker(detail);
          break;
        case 'tools':
          openDesktopAIToolsMenu(detail);
          break;
        case 'history':
          openGenerationHistoryMenu(detail);
          break;
        case 'provider':
          openProviderModelMenu(detail);
          break;
        case 'prompt':
          openPromptTemplatesMenu(detail);
          break;
        case 'config':
          handleOpenConfig();
          break;
        case 'generate':
          if (!isGenerating && content.trim()) {
            void handleGenerate();
          }
          break;
      }
    };

    window.addEventListener('Weave:ai-toolbar-action', handleToolbarAction as EventListener);
    return () => {
      window.removeEventListener('Weave:ai-toolbar-action', handleToolbarAction as EventListener);
    };
  });

  $effect(() => {
    const handlePromptTemplateSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const promptId = detail?.id?.trim();
      if (!promptId) return;
      const prompt = promptTemplateOptions.find((item) => item.id === promptId) ?? null;
      if (!prompt) return;
      handlePromptSelect(prompt);
    };

    window.addEventListener('Weave:ai-prompt-template-select', handlePromptTemplateSelect as EventListener);
    return () => {
      window.removeEventListener('Weave:ai-prompt-template-select', handlePromptTemplateSelect as EventListener);
    };
  });

  $effect(() => {
    const handlePromptTemplatesUpdated = () => {
      promptTemplatesRefreshKey += 1;

      const currentPromptId = selectedPrompt?.id;
      if (!currentPromptId) return;
      const latestPrompt = getPromptTemplateOptions().find((item) => item.id === currentPromptId) ?? null;
      selectedPrompt = latestPrompt;
    };

    window.addEventListener('Weave:ai-prompt-templates-updated', handlePromptTemplatesUpdated as EventListener);
    return () => {
      window.removeEventListener('Weave:ai-prompt-templates-updated', handlePromptTemplatesUpdated as EventListener);
    };
  });

  $effect(() => {
    const handleCustomPromptChangeEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ value?: string }>).detail;
      handleCustomPromptChange(detail?.value ?? '');
    };

    window.addEventListener('Weave:ai-custom-prompt-change', handleCustomPromptChangeEvent as EventListener);
    return () => {
      window.removeEventListener('Weave:ai-custom-prompt-change', handleCustomPromptChangeEvent as EventListener);
    };
  });
</script>

<div
  class="ai-assistant-page"
  class:keyboard-visible={isKeyboardVisible}
  bind:this={pageContainerEl}
>
  <div class="mobile-top-controls">
    <PromptFooter
      {plugin}
      bind:selectedPrompt
      bind:customPrompt
      currentPage="ai-assistant"
      {onNavigate}
      selectedProvider={generationConfig.provider}
      selectedModel={generationConfig.model}
      onPromptSelect={handlePromptSelect}
      onCustomPromptChange={handleCustomPromptChange}
      onProviderModelChange={handleProviderModelChange}
      onGenerate={handleGenerate}
      {isGenerating}
      disabled={!content.trim() || isGenerating}
      compact={true}
      showPromptSelector={false}
      showProviderSelector={false}
      showGenerateButton={false}
      showPluginMenuButton={showInlinePluginMenuButton}
      refreshKey={promptTemplatesRefreshKey}
    />
  </div>

  {#if showInlineFilePicker}
    <div class="inline-file-picker" style={filePickerPanelStyle} bind:this={filePickerPanelEl}>
      <div class="inline-file-picker-search">
        <input
          bind:this={filePickerSearchInput}
          type="text"
          placeholder="搜索文件名..."
          aria-label="搜索文件"
          bind:value={filePickerQuery}
        />
      </div>
      <div class="inline-file-picker-list">
        {#if filteredMarkdownFiles.length === 0}
          <div class="inline-file-picker-empty">没有找到匹配文件</div>
        {:else}
          {#each filteredMarkdownFiles as file}
            <button
              class="inline-file-picker-item"
              class:selected={selectedFile?.path === file.path}
              onclick={() => handleFileSelect(file)}
              title={file.path}
            >
              <span class="inline-file-picker-row">
                <span class="inline-file-picker-name">{file.name}</span>
                <span class="inline-file-picker-size">{formatFileSize(file.size)}</span>
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  {#if showInlineHistoryPanel}
    <div class="inline-history-panel" style={historyPanelStyle} bind:this={historyPanelEl}>
      <div class="inline-history-panel-header">
        <span>最近 5 次生成记录</span>
      </div>
      <div class="inline-history-panel-list">
        {#if generationHistory.length === 0}
          <div class="inline-history-panel-empty">暂无生成记录</div>
        {:else}
          {#each generationHistory as entry, index}
            <div class="inline-history-panel-item">
              <div class="inline-history-panel-meta">
                <span class="inline-history-panel-title">{index + 1}. {entry.sourceFile?.name || '未命名内容'}</span>
                <span class="inline-history-panel-subtitle">{formatHistoryTime(entry.createdAt)} · {entry.cards.length} 张</span>
              </div>
              <button
                class="inline-history-panel-action"
                onclick={() => restoreGenerationHistory(entry.id)}
              >
                恢复
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <main class="ai-main-content">
    <div class="workspace-wrapper">
      <div class="preview-workspace-wrapper">
        <AICardPreviewWorkspace
          {plugin}
          cards={generatedCards}
          config={generationConfig}
          isGenerating={isGenerating}
          totalCards={generationConfig.cardCount}
          mode="split"
          onImport={handleImportCards}
        />
      </div>
    </div>
  </main>
</div>

<style>
  .ai-assistant-page {
    --weave-ai-page-bg: var(--weave-surface-background, var(--weave-surface, var(--background-primary)));
    --weave-ai-surface-bg: var(--weave-ai-page-bg);
    --weave-ai-card-bg: var(--weave-elevated-background, var(--weave-surface-secondary, var(--background-secondary)));
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--weave-ai-page-bg);
    overflow: hidden;
    position: relative;
  }

  .ai-main-content {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    background: var(--weave-ai-page-bg);
    min-height: 0;
    overflow: hidden;
  }

  .workspace-wrapper {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin: 0;
    padding-top: 12px;
    background: var(--weave-ai-page-bg);
  }

  .preview-workspace-wrapper {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    background: var(--weave-ai-surface-bg);
  }

  .inline-file-picker {
    position: absolute;
    z-index: 30;
    display: flex;
    flex-direction: column;
    max-height: min(420px, calc(100vh - 32px));
    border-radius: 12px;
    background: var(--weave-ai-card-bg);
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }

  .inline-file-picker-search {
    padding: 10px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--weave-ai-card-bg) 92%, var(--weave-ai-page-bg));
  }

  .inline-file-picker-search input {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--weave-ai-card-bg);
    color: var(--text-normal);
    outline: none;
  }

  .inline-file-picker-search input:focus {
    border-color: var(--interactive-accent);
  }

  .inline-file-picker-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 4px 0;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .inline-file-picker-empty {
    padding: 18px 12px;
    color: var(--text-muted);
    text-align: center;
    font-size: 0.9rem;
  }

  .inline-file-picker-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    text-align: left;
    box-shadow: none;
  }

  .inline-file-picker-item:hover,
  .inline-file-picker-item.selected {
    background: var(--background-modifier-hover);
  }

  .inline-file-picker-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    width: 100%;
    min-width: 0;
  }

  .inline-file-picker-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline-file-picker-size {
    flex: 0 0 auto;
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.2;
    white-space: nowrap;
    text-align: right;
  }

  .inline-history-panel {
    position: absolute;
    z-index: 30;
    display: flex;
    flex-direction: column;
    max-height: min(360px, calc(100vh - 32px));
    border-radius: 12px;
    background: var(--weave-ai-card-bg);
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }

  .inline-history-panel-header {
    display: flex;
    align-items: center;
    min-height: 42px;
    padding: 0 14px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--weave-ai-card-bg) 92%, var(--weave-ai-page-bg));
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .inline-history-panel-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 6px 0;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .inline-history-panel-empty {
    padding: 18px 12px;
    color: var(--text-muted);
    text-align: center;
    font-size: 0.9rem;
  }

  .inline-history-panel-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
  }

  .inline-history-panel-item:hover {
    background: var(--background-modifier-hover);
  }

  .inline-history-panel-meta {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .inline-history-panel-title {
    color: var(--text-normal);
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline-history-panel-subtitle {
    color: var(--text-muted);
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline-history-panel-action {
    flex: 0 0 auto;
    min-width: 54px;
    height: 30px;
    padding: 0 10px;
    border-radius: 7px;
    border: 1px solid var(--background-modifier-border);
    background: var(--weave-ai-card-bg);
    color: var(--text-normal);
    cursor: pointer;
  }

  .inline-history-panel-action:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
    background: var(--background-modifier-hover);
  }

  .mobile-top-controls {
    display: none;
  }

  :global(body.is-mobile) .mobile-top-controls,
  :global(body.is-phone) .mobile-top-controls {
    display: block;
    padding: 10px 12px 8px;
    background: var(--weave-ai-page-bg);
    position: relative;
    z-index: 15;
  }

  :global(body.is-mobile) .ai-assistant-page,
  :global(body.is-phone) .ai-assistant-page {
    position: relative;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  :global(body.is-mobile) .workspace-wrapper,
  :global(body.is-phone) .workspace-wrapper {
    margin: 0;
    flex: 1 1 auto;
    min-height: 0;
    padding-top: 8px;
  }

  :global(body.is-mobile) .mobile-top-controls :global(.prompt-footer),
  :global(body.is-phone) .mobile-top-controls :global(.prompt-footer) {
    width: 100%;
  }

  :global(body.is-mobile) .inline-file-picker,
  :global(body.is-phone) .inline-file-picker,
  :global(body.is-mobile) .inline-history-panel,
  :global(body.is-phone) .inline-history-panel {
    border-radius: 18px;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.16);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  :global(body.is-mobile) .inline-file-picker,
  :global(body.is-phone) .inline-file-picker {
    max-height: min(56vh, calc(100vh - 124px));
  }

  :global(body.is-mobile) .inline-history-panel,
  :global(body.is-phone) .inline-history-panel {
    max-height: min(50vh, calc(100vh - 132px));
  }

  :global(body.is-mobile) .inline-file-picker-search,
  :global(body.is-phone) .inline-file-picker-search,
  :global(body.is-mobile) .inline-history-panel-header,
  :global(body.is-phone) .inline-history-panel-header {
    padding-left: 14px;
    padding-right: 14px;
  }

  :global(body.is-mobile) .inline-file-picker-search input,
  :global(body.is-phone) .inline-file-picker-search input {
    height: 40px;
    border-radius: 12px;
  }

  :global(body.is-mobile) .inline-file-picker-item,
  :global(body.is-phone) .inline-file-picker-item,
  :global(body.is-mobile) .inline-history-panel-item,
  :global(body.is-phone) .inline-history-panel-item {
    min-height: 46px;
    padding-top: 11px;
    padding-bottom: 11px;
  }

  :global(body.is-mobile) .ai-assistant-page.keyboard-visible .mobile-top-controls,
  :global(body.is-phone) .ai-assistant-page.keyboard-visible .mobile-top-controls {
    padding-bottom: 4px;
    box-shadow: 0 10px 24px color-mix(in srgb, black 8%, transparent);
  }

  :global(body.is-mobile) .ai-assistant-page.keyboard-visible .workspace-wrapper,
  :global(body.is-phone) .ai-assistant-page.keyboard-visible .workspace-wrapper {
    display: flex;
    opacity: 1;
    pointer-events: auto;
  }

  :global(body.is-mobile) .ai-assistant-page.keyboard-visible :global(.preview-footer),
  :global(body.is-phone) .ai-assistant-page.keyboard-visible :global(.preview-footer) {
    display: none;
  }

  :global(.workspace-split.mod-left-split) .ai-assistant-page,
  :global(.workspace-split.mod-right-split) .ai-assistant-page {
    --weave-ai-page-bg: var(--weave-surface-background, var(--weave-surface, var(--background-primary)));
    --weave-ai-surface-bg: var(--weave-ai-page-bg);
    --weave-ai-card-bg: var(--weave-elevated-background, var(--weave-surface-secondary, var(--background-secondary)));
  }
</style>
