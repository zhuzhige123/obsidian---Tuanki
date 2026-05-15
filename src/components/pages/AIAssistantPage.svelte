<script lang="ts">
  import { onMount } from 'svelte';
  import { Menu, Notice, TFile } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { WeaveDataStorage } from '../../data/storage';
  import type { FSRS } from '../../algorithms/fsrs';
  import type { AIAssistantSubView } from '../../services/plugin-state/PluginLocalStateService';
  import type {
    AICardPreviewItem,
    AIPreviewImportOptions,
    AIPreviewImportResult,
    AIParsePreviewItem,
    AIProvider,
    GeneratedCard,
    GenerationConfig,
    GenerationProgress,
    ObsidianFileInfo
  } from '../../types/ai-types';
  import type { ParsedCard, RegexParsingConfig } from '../../types/newCardParsingTypes';
  import { logger } from '../../utils/logger';
  import { fileToInfo, sortFilesByModified } from '../../utils/file-utils';
  import { AICardGenerationService } from '../../services/ai/AICardGenerationService';
  import {
    listUserPromptFiles,
    resolveUserPromptFile
  } from '../../services/ai/UserPromptFileService';
  import { RegexCardParser } from '../../services/batch-parsing/RegexCardParser';
  import { MarkdownFileSuggestModal } from '../../modals/MarkdownFileSuggestModal';
  import { AI_MODEL_OPTIONS, AI_PROVIDER_LABELS, getDefaultAIModel } from '../settings/constants/settings-constants';
  import { weaveMainInterfaceStore } from '../../stores/weave-main-interface-store';
  import AICardPreviewWorkspace from '../ai-assistant/AICardPreviewWorkspace.svelte';
  import AIParsePreviewWorkspace from '../ai-assistant/AIParsePreviewWorkspace.svelte';
  import AIGenerationConfigPopover from '../ai-assistant/AIGenerationConfigPopover.svelte';
  import { AIConfigModalObsidian } from '../ai-assistant/AIConfigModalObsidian';

  interface Props {
    plugin: WeavePlugin;
    dataStorage: WeaveDataStorage;
    fsrs: FSRS;
    onNavigate?: (pageId: string) => void;
  }

  interface AnchorRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }

  interface HistoryEntry {
    id: string;
    createdAt: string;
    sourceFile: { path: string; name: string; size: number; extension: string } | null;
    promptFile?: { path: string; name: string } | null;
    sourceContent: string;
    cards: GeneratedCard[];
    config: GenerationConfig;
    selectedPrompt: null;
    customPrompt: string;
  }

  interface AIToolbarStateDetail {
    subView: AIAssistantSubView;
    selectedFileName: string;
    selectedFilePath: string;
    promptFileName: string;
    promptFilePath: string;
    modelLabel: string;
    modelTitle: string;
    parsePresetName: string;
    parsePresetId: string;
    historyCount: number;
    canGenerate: boolean;
    canParse: boolean;
    isGenerating: boolean;
    isParsing: boolean;
  }

  let { plugin, dataStorage, fsrs }: Props = $props();

  let pageEl = $state<HTMLDivElement | null>(null);
  let historyEl = $state<HTMLDivElement | null>(null);

  let selectedFile = $state<ObsidianFileInfo | null>(null);
  let selectedPromptFile = $state<ObsidianFileInfo | null>(null);
  let selectedParsePreset = $state<RegexParsingConfig | null>(null);
  let subView = $state<AIAssistantSubView>('generate');
  let content = $state('');
  let promptContent = $state('');
  let generatedItems = $state<AICardPreviewItem[]>([]);
  let parseItems = $state<AIParsePreviewItem[]>([]);
  let generationHistory = $state<HistoryEntry[]>([]);
  let isGenerating = $state(false);
  let isParsing = $state(false);
  let generationProgress = $state<GenerationProgress | null>(null);

  let historyOpen = $state(false);
  let historyAnchor = $state<AnchorRect | null>(null);
  let configOpen = $state(false);
  let configAnchor = $state<AnchorRect | null>(null);
  let systemPromptModal: AIConfigModalObsidian | null = null;
  let lastToolbarStateSignature = '';
  let lastGenerationHistorySignature = '';

  function isValidProvider(value: string | null | undefined): value is AIProvider {
    if (!value) return false;
    return Object.prototype.hasOwnProperty.call(AI_MODEL_OPTIONS, value);
  }

  function resolveProvider(value: string | null | undefined): AIProvider {
    if (isValidProvider(value)) return value;

    const defaultProvider = plugin.settings.aiConfig?.defaultProvider;
    if (isValidProvider(defaultProvider)) {
      return defaultProvider;
    }

    return 'openai';
  }

  function getDefaultModelForProvider(provider: AIProvider): string {
    const configuredModel = (plugin.settings.aiConfig?.apiKeys as Record<string, { model?: string } | undefined> | undefined)?.[provider]?.model?.trim();
    if (configuredModel) return configuredModel;
    return getDefaultAIModel(provider);
  }

  function normalizeGenerationConfig(config: GenerationConfig): GenerationConfig {
    const provider = resolveProvider(config.provider);
    const fallbackModel = getDefaultModelForProvider(provider).trim();
    const model = config.model?.trim() || fallbackModel;

    return {
      ...config,
      provider,
      model
    };
  }

  function getModelDisplayLabel(): string {
    return generationConfig.model?.trim() || getDefaultModelForProvider(generationConfig.provider) || '\u672a\u9009\u62e9\u6a21\u578b';
  }

  function normalizeTagList(tags: string[] | undefined): string[] {
    return Array.from(new Set((tags ?? []).map((tag) => String(tag || '').trim().replace(/^#+/, '')).filter(Boolean)));
  }

  function mergeTagLists(baseTags: string[] | undefined, importTags: string[] | undefined): string[] {
    return normalizeTagList([...(baseTags ?? []), ...(importTags ?? [])]);
  }

  function createInitialGenerationConfig(): GenerationConfig {
    const preferences = plugin.getAIAssistantPreferences();
    const saved = preferences.savedGenerationConfig;
    const limit = saved?.maxGenerationLimit ?? saved?.cardCount ?? 20;
    const provider = resolveProvider(preferences.lastUsedProvider || plugin.settings.aiConfig?.defaultProvider);
    const defaultMaxTokens = saved?.maxTokens ?? plugin.settings.aiConfig?.globalParams?.maxTokens ?? 2000;

    return normalizeGenerationConfig({
      templateId: '',
      promptTemplate: '',
      cardCount: limit,
      difficulty: saved?.difficulty ?? 'medium',
      typeDistribution: { ...(saved?.typeDistribution ?? { qa: 50, cloze: 30, choice: 20 }) },
      provider,
      model: '',
      temperature: saved?.temperature ?? 0.7,
      maxTokens: defaultMaxTokens,
      templates: { qa: 'official-qa', choice: 'official-choice', cloze: 'official-cloze' },
      enableHints: saved?.enableHints ?? true,
      maxGenerationLimit: limit,
      prioritizePromptRequirements: saved?.prioritizePromptRequirements ?? true
    });
  }

  let generationConfig = $state<GenerationConfig>(createInitialGenerationConfig());

  const historyStyle = $derived.by(() => panelStyle(historyAnchor, 340, 360));
  const configStyle = $derived.by(() => panelStyle(configAnchor, 520, 760, true));

  function createGenerationService(): AICardGenerationService {
    return new AICardGenerationService(plugin);
  }

  function createRegexParser(): RegexCardParser {
    return new RegexCardParser(plugin.app, plugin);
  }

  function panelStyle(anchor: AnchorRect | null, width: number, height: number, alignRight = false): string {
    if (!anchor) return '';

    const box = pageEl?.getBoundingClientRect();
    const maxWidth = box?.width ?? window.innerWidth;
    const maxHeight = box?.height ?? window.innerHeight;
    const left0 = box
      ? alignRight
        ? anchor.right - box.left - width
        : anchor.left - box.left
      : anchor.left;
    const top0 = box ? anchor.bottom - box.top + 8 : anchor.bottom + 8;
    const left = Math.max(8, Math.min(left0, maxWidth - width - 8));
    const top = Math.max(8, Math.min(top0, maxHeight - height));

    return `left:${left}px;top:${top}px;width:${Math.min(width, maxWidth - 16)}px;`;
  }

  function normalizeAnchor(detail?: { x?: number; y?: number; rect?: AnchorRect }): AnchorRect | null {
    if (detail?.rect) return detail.rect;
    if (typeof detail?.x !== 'number' || typeof detail?.y !== 'number') return null;

    return {
      left: detail.x - 24,
      top: detail.y - 32,
      right: detail.x + 24,
      bottom: detail.y,
      width: 48,
      height: 32
    };
  }

  function showMenuAtAnchor(
    menu: Menu,
    detail: { x?: number; y?: number; rect?: AnchorRect } | undefined,
    fallback: { x: number; y: number }
  ) {
    const anchor = normalizeAnchor(detail);
    menu.showAtPosition(anchor ? { x: Math.round(anchor.left), y: Math.round(anchor.bottom + 6) } : fallback);
  }

  async function openSourceFileMenu(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    const allFiles = sortFilesByModified(plugin.app.vault.getMarkdownFiles());
    const selected = await new MarkdownFileSuggestModal(plugin.app, {
      files: allFiles,
      placeholder: '搜索并选择源 Markdown 文件...',
      anchorRect: normalizeAnchor(detail) ?? undefined,
      preferredWidth: 560,
      showPath: false,
      showIcon: false,
    }).openAndSelect();

    if (!selected) {
      return;
    }

    await selectSourceFile(fileToInfo(selected));
  }

  function splitContent(value: string): { front: string; back: string } {
    const match = value.split(/(?:\n\n|\n)?---div---(?:\n\n|\n)?/);
    return { front: (match[0] ?? '').trim(), back: match.slice(1).join('---div---').trim() };
  }

  function toPreviewItem(card: GeneratedCard): AICardPreviewItem {
    const { front, back } = splitContent(card.content || '');

    return {
      id: `history-${card.uuid}`,
      draft: card.type === 'choice'
        ? { type: 'choice', question: front, options: [], answers: [], back: back || undefined, tags: [...(card.tags || [])] }
        : card.type === 'cloze'
          ? { type: 'cloze', text: front, back: back || undefined, tags: [...(card.tags || [])] }
          : { type: 'qa', front, back, tags: [...(card.tags || [])] },
      status: 'valid',
      issues: [],
      generatedContent: card.content || '',
      generatedCard: { ...card, tags: [...(card.tags || [])], metadata: { ...card.metadata } }
    };
  }

  async function findFile(path?: string): Promise<ObsidianFileInfo | null> {
    if (!path) return null;
    const file = plugin.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? fileToInfo(file) : null;
  }

  function findUserPromptFile(path?: string): ObsidianFileInfo | null {
    const file = resolveUserPromptFile(plugin.app, path);
    return file ? fileToInfo(file) : null;
  }

  async function persistPreferences() {
    const normalizedConfig = normalizeGenerationConfig(generationConfig);

    await plugin.saveAIAssistantPreferences({
      ...plugin.getAIAssistantPreferences(),
      lastUsedProvider: normalizedConfig.provider,
      lastUsedModel: normalizedConfig.model,
      subView,
      lastSelectedSourceFilePath: selectedFile?.path,
      lastSelectedPromptFilePath: selectedPromptFile?.path,
      lastSelectedParsePresetId: selectedParsePreset?.id || selectedParsePreset?.name,
      savedGenerationConfig: {
        cardCount: normalizedConfig.cardCount,
        difficulty: normalizedConfig.difficulty,
        typeDistribution: { ...normalizedConfig.typeDistribution },
        enableHints: normalizedConfig.enableHints,
        temperature: normalizedConfig.temperature,
        maxTokens: normalizedConfig.maxTokens,
        maxGenerationLimit: normalizedConfig.maxGenerationLimit ?? normalizedConfig.cardCount,
        prioritizePromptRequirements: normalizedConfig.prioritizePromptRequirements ?? true
      }
    });
  }

  function syncToolbarState(force = false) {
    const detail = createAIToolbarStateDetail();
    const signature = JSON.stringify(detail);

    if (!force && signature === lastToolbarStateSignature) {
      return;
    }

    lastToolbarStateSignature = signature;
    weaveMainInterfaceStore.setAIToolbarState(detail);
  }

  async function persistGenerationHistoryIfNeeded() {
    const signature = JSON.stringify(generationHistory);
    if (signature === lastGenerationHistorySignature) {
      return;
    }

    lastGenerationHistorySignature = signature;
    await plugin.saveAIGenerationHistory(generationHistory);
  }

  async function selectSourceFile(file: ObsidianFileInfo) {
    selectedFile = file;
    content = await plugin.app.vault.read(file.file);
    await persistPreferences();
    syncToolbarState();
  }

  async function selectPromptFile(file: ObsidianFileInfo | null) {
    selectedPromptFile = file;
    promptContent = file ? await plugin.app.vault.read(file.file) : '';
    await persistPreferences();
    syncToolbarState();
  }

  async function openPromptFileMenu(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    try {
      const promptFiles = await listUserPromptFiles(plugin.app);
      const selected = await new MarkdownFileSuggestModal(plugin.app, {
        files: promptFiles,
        placeholder: '搜索并选择提示词文件...',
        anchorRect: normalizeAnchor(detail) ?? undefined,
        preferredWidth: 560,
        allowEmptySelection: true,
        emptySelectionLabel: '不使用提示词文件',
        emptySelectionDescription: undefined,
        showPath: false,
        showIcon: false,
      }).openAndSelectItem();

      if (!selected) {
        return;
      }

      if (selected.kind === 'empty') {
        await selectPromptFile(null);
        return;
      }

      await selectPromptFile(fileToInfo(selected.file));
    } catch (error) {
      logger.error('Failed to open user prompt file menu:', error);
      new Notice('\u63d0\u793a\u8bcd\u6587\u4ef6\u5217\u8868\u52a0\u8f7d\u5931\u8d25');
    }
  }

  async function openFileSuggest(mode: 'source' | 'prompt', detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    historyOpen = false;
    configOpen = false;

    if (mode === 'source') {
      await openSourceFileMenu(detail);
      return;
    }

    await openPromptFileMenu(detail);
  }

  function openHistory(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    historyAnchor = normalizeAnchor(detail);
    historyOpen = !historyOpen;
    configOpen = false;
  }

  function openConfig(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    configAnchor = normalizeAnchor(detail);
    configOpen = true;
    historyOpen = false;
  }

  function openSystemPromptModal() {
    systemPromptModal?.close();
    systemPromptModal = new AIConfigModalObsidian(plugin.app, {
      plugin,
      config: generationConfig,
      onSave: async (nextConfig) => {
        generationConfig = normalizeGenerationConfig({ ...nextConfig });
        await persistPreferences();
        syncToolbarState();
      },
      onClose: () => {
        systemPromptModal = null;
      }
    });
    systemPromptModal.open();
  }

  function openModelMenu(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    const menu = new Menu();
    const apiKeys = (plugin.settings.aiConfig?.apiKeys || {}) as Record<string, { model?: string } | undefined>;

    Object.entries(AI_MODEL_OPTIONS).forEach(([providerKey, models]) => {
      const provider = providerKey as AIProvider;
      menu.addItem((item) => {
        item
          .setTitle(AI_PROVIDER_LABELS[provider])
          .setIcon(generationConfig.provider === provider ? 'check' : '');

        const submenu = (item as any).setSubmenu();
        const configuredModel = apiKeys[provider]?.model?.trim();
        const staticModelIds: string[] = models.map((model) => model.id as string);

        if (configuredModel && !staticModelIds.includes(configuredModel)) {
          submenu.addItem((modelItem: any) => {
            modelItem
              .setTitle(configuredModel)
              .setIcon(generationConfig.provider === provider && generationConfig.model === configuredModel ? 'check' : '')
              .onClick(() => {
                generationConfig = normalizeGenerationConfig({ ...generationConfig, provider, model: configuredModel });
                void persistPreferences();
                syncToolbarState();
              });
          });
          submenu.addSeparator();
        }

        models.forEach((model) => {
          submenu.addItem((modelItem: any) => {
            modelItem
              .setTitle(model.label)
              .setIcon(generationConfig.provider === provider && generationConfig.model === model.id ? 'check' : '')
              .onClick(() => {
                generationConfig = normalizeGenerationConfig({ ...generationConfig, provider, model: model.id });
                void persistPreferences();
                syncToolbarState();
              });
          });
        });
      });
    });

    showMenuAtAnchor(menu, detail, { x: 120, y: 80 });
  }

  function openParsePresetMenu(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    const menu = new Menu();
    const presets = plugin.settings.simplifiedParsing?.regexPresets ?? [];

    if (presets.length === 0) {
      menu.addItem((item) => item.setTitle('\u6682\u65e0\u89e3\u6790\u6a21\u677f').setDisabled(true));
    } else {
      presets.forEach((preset) => {
        const id = preset.id || preset.name;
        menu.addItem((item) =>
          item
            .setTitle(preset.name)
            .setIcon((selectedParsePreset?.id || selectedParsePreset?.name) === id ? 'check' : 'file-search')
            .onClick(() => {
              selectedParsePreset = preset;
              void persistPreferences();
              syncToolbarState();
            })
        );
      });
    }

    showMenuAtAnchor(menu, detail, { x: 80, y: 80 });
  }

  async function handleGenerate() {
    if (!content.trim()) {
      new Notice('\u8bf7\u5148\u9009\u62e9\u6e90\u6587\u4ef6');
      return;
    }

    try {
      isGenerating = true;
      syncToolbarState();
      generationProgress = { status: 'preparing', progress: 0, message: '\u6b63\u5728\u51c6\u5907\u751f\u6210\u5361\u7247' };

      const config = {
        ...generationConfig,
        cardCount: generationConfig.maxGenerationLimit ?? generationConfig.cardCount,
        promptTemplate: promptContent
      };

      const result = await createGenerationService().generatePreviewItems(content, config, null, promptContent, {
        onProgress: (progress) => generationProgress = progress,
        onItemsUpdate: (items) => generatedItems = items
      });

      generatedItems = result;
      generationHistory = [{
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        sourceFile: selectedFile ? { path: selectedFile.path, name: selectedFile.name, size: selectedFile.size, extension: selectedFile.extension } : null,
        promptFile: selectedPromptFile ? { path: selectedPromptFile.path, name: selectedPromptFile.name } : null,
        sourceContent: content,
        cards: result.map((item) => item.generatedCard),
        config,
        selectedPrompt: null,
        customPrompt: promptContent
      }, ...generationHistory].slice(0, 5);
      syncToolbarState();
      await persistGenerationHistoryIfNeeded();

      generationProgress = { status: 'completed', progress: 100, message: '\u5df2\u751f\u6210 ' + result.length + ' \u5f20\u5361\u7247' };
    } catch (error) {
      logger.error('AI generate failed:', error);
      new Notice(error instanceof Error ? error.message : 'AI \u751f\u6210\u5931\u8d25');
      generationProgress = { status: 'failed', progress: 0, message: 'AI \u751f\u6210\u5931\u8d25' };
    } finally {
      isGenerating = false;
      syncToolbarState();
    }
  }

  async function handleParse() {
    if (!selectedFile) {
      new Notice('\u8bf7\u5148\u9009\u62e9\u6e90\u6587\u4ef6');
      return;
    }

    if (!selectedParsePreset) {
      new Notice('\u8bf7\u5148\u9009\u62e9\u89e3\u6790\u6a21\u677f');
      return;
    }

    try {
      isParsing = true;
      syncToolbarState();
      const preset = selectedParsePreset;
      const result = await createRegexParser().parseFile(selectedFile.file, preset, 'preview');
      if (!result.success) throw new Error(result.errors[0] || '\u89e3\u6790\u5931\u8d25');

      parseItems = result.cards.map((card, index) => {
        const { front, back } = splitContent(card.content || '');
        return {
          id: `${index + 1}`,
          index: index + 1,
          front,
          back,
          tags: [...(card.tags || [])],
          source: preset.mode + ' \u00b7 ' + preset.name,
          rawContent: result.positions?.[index]?.rawContent || card.content || '',
          parsedCard: {
            ...card,
            tags: [...(card.tags || [])],
            metadata: card.metadata ? { ...card.metadata } : undefined
          }
        };
      });

      subView = 'parse-preview';
      await persistPreferences();
      syncToolbarState();
    } catch (error) {
      logger.error('Parse preview failed:', error);
      new Notice(error instanceof Error ? error.message : '\u89e3\u6790\u9884\u89c8\u5931\u8d25');
      parseItems = [];
    } finally {
      isParsing = false;
      syncToolbarState();
    }
  }

  async function restoreHistory(entry: HistoryEntry) {
    selectedFile = await findFile(entry.sourceFile?.path);
    selectedPromptFile = findUserPromptFile(entry.promptFile?.path);
    content = entry.sourceContent;
    promptContent = entry.customPrompt;
    generationConfig = normalizeGenerationConfig({ ...entry.config });
    generatedItems = entry.cards.map(toPreviewItem);
    subView = 'generate';
    historyOpen = false;
    await persistPreferences();
    syncToolbarState();
  }

  async function importCards(
    selectedItems: AICardPreviewItem[],
    importOptions: AIPreviewImportOptions
  ): Promise<AIPreviewImportResult> {
    const { CardConverter } = await import('../../services/ai/CardConverter');
    const { targetDeckId, autoTags } = importOptions;
    const targetDeck = await dataStorage.getDeck(targetDeckId);
    if (!targetDeck) {
      throw new Error('目标牌组不存在，请重新选择');
    }

    const converted = CardConverter.convertBatch(
      selectedItems.map((item) => ({
        ...item.generatedCard,
        tags: mergeTagLists(item.generatedCard.tags, autoTags),
        metadata: { ...item.generatedCard.metadata }
      })),
      targetDeckId,
      selectedFile?.path,
      generationConfig.templates,
      fsrs,
      targetDeck.name
    );

    let importedCount = 0;
    for (const card of converted.cards) {
      await dataStorage.saveCard(card);
      importedCount += 1;
    }

    return {
      importedCount,
      failedCount: converted.errors.length,
      selectedCount: selectedItems.length,
      targetDeckId,
      targetDeckName: targetDeck.name,
      importedItemIds: importedCount === selectedItems.length && converted.errors.length === 0
        ? selectedItems.map((item) => item.id)
        : undefined
    };
  }

  async function importParsedCards(
    selectedItems: AIParsePreviewItem[],
    importOptions: AIPreviewImportOptions
  ): Promise<AIPreviewImportResult> {
    const { targetDeckId, autoTags } = importOptions;
    const targetDeck = await dataStorage.getDeck(targetDeckId);
    if (!targetDeck) {
      throw new Error('目标牌组不存在，请重新选择');
    }

    const parsedCards: ParsedCard[] = selectedItems.map((item) => ({
      ...item.parsedCard,
      tags: mergeTagLists(item.parsedCard.tags || [], autoTags),
      metadata: {
        ...(item.parsedCard.metadata || {}),
        targetDeckId,
        sourceFile: item.parsedCard.metadata?.sourceFile || selectedFile?.path || item.parsedCard.sourceFile
      }
    }));

    await plugin.addCardsToDB(parsedCards);

    return {
      importedCount: parsedCards.length,
      failedCount: 0,
      selectedCount: selectedItems.length,
      targetDeckId,
      targetDeckName: targetDeck.name,
      importedItemIds: selectedItems.map((item) => item.id)
    };
  }

  function createAIToolbarStateDetail(): AIToolbarStateDetail {
    const modelLabel = getModelDisplayLabel();

    return {
      subView,
      selectedFileName: selectedFile?.name ?? '',
      selectedFilePath: selectedFile?.path ?? '',
      promptFileName: selectedPromptFile?.name ?? '',
      promptFilePath: selectedPromptFile?.path ?? '',
      modelLabel,
      modelTitle: modelLabel,
      parsePresetName: selectedParsePreset?.name ?? '',
      parsePresetId: selectedParsePreset?.id || selectedParsePreset?.name || '',
      historyCount: generationHistory.length,
      canGenerate: !!content.trim() && !isGenerating,
      canParse: !!selectedFile && !!selectedParsePreset && !isParsing,
      isGenerating,
      isParsing
    };
  }

  $effect(() => {
    if (!historyOpen) return;

    const handleDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && historyEl?.contains(target)) return;
      historyOpen = false;
    };

    document.addEventListener('pointerdown', handleDown, true);
    return () => document.removeEventListener('pointerdown', handleDown, true);
  });

  onMount(() => {
    const handleToolbarAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action: string; value?: AIAssistantSubView; x?: number; y?: number; rect?: AnchorRect }>).detail;
      if (!detail) return;

      if (detail.action === 'file') void openFileSuggest('source', detail);
      if (detail.action === 'prompt-file') void openFileSuggest('prompt', detail);
      if (detail.action === 'model') openModelMenu(detail);
      if (detail.action === 'system-prompt') openSystemPromptModal();
      if (detail.action === 'history') openHistory(detail);
      if (detail.action === 'config') openConfig(detail);
      if (detail.action === 'parse-template') openParsePresetMenu(detail);
      if (detail.action === 'generate' && !isGenerating) void handleGenerate();
      if (detail.action === 'parse' && !isParsing) void handleParse();
      if (detail.action === 'sub-view') {
        const nextSubView = detail.value === 'parse-preview' ? 'parse-preview' : 'generate';
        if (subView !== nextSubView) {
          subView = nextSubView;
          void persistPreferences();
          syncToolbarState();
        }
      }
    };

    const handleUserPromptFilesChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string | null }>).detail;
      const changedPath = detail?.path;

      if (selectedPromptFile?.path && changedPath && changedPath !== selectedPromptFile.path) {
        return;
      }

      if (!selectedPromptFile?.path) {
        return;
      }

      const latestFile = resolveUserPromptFile(plugin.app, selectedPromptFile.path);
      if (!latestFile) {
        selectedPromptFile = null;
        promptContent = '';
        void persistPreferences();
        syncToolbarState();
        return;
      }

      selectedPromptFile = fileToInfo(latestFile);
      void plugin.app.vault.read(latestFile).then((text) => {
        promptContent = text;
        syncToolbarState();
      });
    };

    window.addEventListener('Weave:ai-toolbar-action', handleToolbarAction as EventListener);
    window.addEventListener('Weave:ai-user-prompt-files-changed', handleUserPromptFilesChanged as EventListener);

    void (async () => {
      generationHistory = plugin.getAIGenerationHistory().slice(0, 5) as HistoryEntry[];
      lastGenerationHistorySignature = JSON.stringify(generationHistory);
      const preferences = plugin.getAIAssistantPreferences();
      subView = preferences.subView ?? 'generate';
      selectedFile = await findFile(preferences.lastSelectedSourceFilePath);
      selectedPromptFile = findUserPromptFile(preferences.lastSelectedPromptFilePath);

      if (preferences.lastSelectedSourceFilePath && !selectedFile) {
        new Notice('\u6700\u8fd1\u9009\u62e9\u7684\u6e90\u6587\u4ef6\u4e0d\u5b58\u5728\uff0c\u5df2\u6e05\u7a7a');
      }

      if (preferences.lastSelectedPromptFilePath && !selectedPromptFile) {
        new Notice('\u6700\u8fd1\u9009\u62e9\u7684\u63d0\u793a\u8bcd\u6587\u4ef6\u4e0d\u5b58\u5728\uff0c\u5df2\u6e05\u7a7a');
      }

      if (selectedFile) {
        content = await plugin.app.vault.read(selectedFile.file);
      }

      if (selectedPromptFile) {
        promptContent = await plugin.app.vault.read(selectedPromptFile.file);
      }

      const presetId = preferences.lastSelectedParsePresetId?.trim();
      if (presetId) {
        selectedParsePreset =
          (plugin.settings.simplifiedParsing?.regexPresets ?? []).find((preset) => (preset.id || preset.name) === presetId) ?? null;
      }

      syncToolbarState(true);
    })();

    return () => {
      window.removeEventListener('Weave:ai-toolbar-action', handleToolbarAction as EventListener);
      window.removeEventListener('Weave:ai-user-prompt-files-changed', handleUserPromptFilesChanged as EventListener);
    };
  });
</script>

<div class="ai-page" bind:this={pageEl}>
  {#if historyOpen}
    <div class="panel" style={historyStyle} bind:this={historyEl}>
      <div class="panel-head"><div>{'\u6700\u8fd1 5 \u6b21\u751f\u6210\u8bb0\u5f55'}</div></div>
      <div class="panel-list">
        {#each generationHistory as entry}
          <button class="list-item" onclick={() => restoreHistory(entry)}>
            <span class="list-item-main">
              <span class="list-item-title" title={entry.sourceFile?.name || '\u672a\u547d\u540d\u5185\u5bb9'}>{entry.sourceFile?.name || '\u672a\u547d\u540d\u5185\u5bb9'}</span>
              <span class="list-item-count">{entry.cards.length} 张</span>
            </span>
            <small class="list-item-subtitle" title={entry.promptFile?.name || '\u65e0\u63d0\u793a\u8bcd\u6587\u4ef6'}>{entry.promptFile?.name || '\u65e0\u63d0\u793a\u8bcd\u6587\u4ef6'}</small>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <AIGenerationConfigPopover
    isOpen={configOpen}
    config={generationConfig}
    style={configStyle}
    onClose={() => configOpen = false}
    onSave={async (config) => {
      generationConfig = config;
      configOpen = false;
      await persistPreferences();
      syncToolbarState();
    }}
  />

  {#if subView === 'generate'}
    <AICardPreviewWorkspace
      {plugin}
      items={generatedItems}
      config={generationConfig}
      isGenerating={isGenerating}
      progress={generationProgress}
      totalCards={generationConfig.maxGenerationLimit ?? generationConfig.cardCount}
      mode="split"
      onImport={importCards}
    />
  {:else}
    <AIParsePreviewWorkspace
      {plugin}
      items={parseItems}
      config={generationConfig}
      isParsing={isParsing}
      sourceFileName={selectedFile?.name}
      templateName={selectedParsePreset?.name}
      onImport={importParsedCards}
    />
  {/if}
</div>

<style>
  .ai-page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .ai-page {
    --weave-ai-page-bg: var(--weave-surface-background, var(--background-primary));
    --weave-ai-surface-bg: var(--weave-ai-page-bg);
    --weave-ai-card-bg: var(--weave-elevated-background, var(--background-secondary));
    position: relative;
    overflow: hidden;
    background: var(--weave-ai-page-bg);
  }

  .panel {
    position: absolute;
    z-index: 30;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }

  .panel-head {
    padding: 12px 14px;
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .panel-list {
    max-height: 360px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 6px 0;
  }

  .list-item {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
    min-width: 0;
    width: 100%;
    padding: 10px 14px;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    appearance: none;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .list-item:hover,
  .list-item:focus-visible {
    background: color-mix(in srgb, var(--background-modifier-hover) 70%, transparent);
    outline: none;
  }

  .list-item-main {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    min-width: 0;
    width: 100%;
  }

  .list-item-title {
    flex: 0 1 auto;
    min-width: 0;
    max-width: calc(100% - 48px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-item-count {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
  }

  .list-item-subtitle {
    display: block;
    width: 100%;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
