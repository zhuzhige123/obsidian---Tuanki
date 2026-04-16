<script lang="ts">
  import { onMount } from 'svelte';
  import { Menu, Notice, TFile } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { WeaveDataStorage } from '../../data/storage';
  import type { FSRS } from '../../algorithms/fsrs';
  import type { AIAssistantSubView } from '../../services/plugin-state/PluginLocalStateService';
  import type {
    AICardPreviewItem,
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
    getUserPromptRelativePath,
    listUserPromptFiles,
    resolveUserPromptFile
  } from '../../services/ai/UserPromptFileService';
  import { RegexCardParser } from '../../services/batch-parsing/RegexCardParser';
  import { buildAIAssistantSourceFileMenu } from '../../services/menu/AIAssistantSourceFileMenu';
  import { AI_MODEL_OPTIONS, AI_PROVIDER_LABELS } from '../settings/constants/settings-constants';
  import AICardPreviewWorkspace from '../ai-assistant/AICardPreviewWorkspace.svelte';
  import AIParsePreviewWorkspace from '../ai-assistant/AIParsePreviewWorkspace.svelte';
  import AIGenerationConfigPopover from '../ai-assistant/AIGenerationConfigPopover.svelte';
  import { AIConfigModalObsidian } from '../ai-assistant/AIConfigModalObsidian';

  const AI_SOURCE_FILE_MENU_CLASS = 'weave-ai-source-file-menu';
  const AI_USER_PROMPT_FILE_MENU_CLASS = 'weave-ai-user-prompt-file-menu';

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

  function getDefaultModelForProvider(provider: AIProvider): string {
    const configuredModel = (plugin.settings.aiConfig?.apiKeys as Record<string, { model?: string } | undefined> | undefined)?.[provider]?.model?.trim();
    if (configuredModel) return configuredModel;
    return AI_MODEL_OPTIONS[provider]?.[0]?.id || '';
  }

  function getModelDisplayLabel(): string {
    return generationConfig.model?.trim() || getDefaultModelForProvider(generationConfig.provider) || '\u672a\u9009\u62e9\u6a21\u578b';
  }

  function createInitialGenerationConfig(): GenerationConfig {
    const preferences = plugin.getAIAssistantPreferences();
    const saved = preferences.savedGenerationConfig;
    const limit = saved?.maxGenerationLimit ?? saved?.cardCount ?? 20;

    return {
      templateId: '',
      promptTemplate: '',
      cardCount: limit,
      difficulty: saved?.difficulty ?? 'medium',
      typeDistribution: { ...(saved?.typeDistribution ?? { qa: 50, cloze: 30, choice: 20 }) },
      provider: (preferences.lastUsedProvider || plugin.settings.aiConfig?.defaultProvider || 'openai') as AIProvider,
      model: '',
      temperature: saved?.temperature ?? 0.7,
      maxTokens: saved?.maxTokens ?? 2000,
      templates: { qa: 'official-qa', choice: 'official-choice', cloze: 'official-cloze' },
      autoTags: [...(saved?.autoTags ?? [])],
      enableHints: saved?.enableHints ?? true,
      maxGenerationLimit: limit,
      prioritizePromptRequirements: saved?.prioritizePromptRequirements ?? true
    };
  }

  let generationConfig = $state<GenerationConfig>(createInitialGenerationConfig());

  $effect(() => {
    if (!generationConfig.model?.trim()) {
      generationConfig = {
        ...generationConfig,
        model: getDefaultModelForProvider(generationConfig.provider)
      };
    }
  });

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

  function attachMenuClass(menu: Menu, className: string) {
    const extendedMenu = menu as unknown as { dom?: HTMLElement };
    const applyClass = () => {
      extendedMenu.dom?.classList.add(className);
    };
    applyClass();
    requestAnimationFrame(applyClass);
    setTimeout(applyClass, 0);
  }

  async function openSourceFileMenu(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    const menu = new Menu();
    const allFiles = sortFilesByModified(plugin.app.vault.getMarkdownFiles());

    buildAIAssistantSourceFileMenu(menu, {
      files: allFiles,
      currentFilePath: selectedFile?.path ?? null,
      onSelect: async (file) => {
        await selectSourceFile(fileToInfo(file));
      },
    });

    showMenuAtAnchor(menu, detail, { x: 120, y: 80 });
    attachMenuClass(menu, AI_SOURCE_FILE_MENU_CLASS);
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
    await plugin.saveAIAssistantPreferences({
      ...plugin.getAIAssistantPreferences(),
      lastUsedProvider: generationConfig.provider,
      lastUsedModel: generationConfig.model,
      subView,
      lastSelectedSourceFilePath: selectedFile?.path,
      lastSelectedPromptFilePath: selectedPromptFile?.path,
      lastSelectedParsePresetId: selectedParsePreset?.id || selectedParsePreset?.name,
      savedGenerationConfig: {
        cardCount: generationConfig.cardCount,
        difficulty: generationConfig.difficulty,
        typeDistribution: { ...generationConfig.typeDistribution },
        autoTags: generationConfig.autoTags ? [...generationConfig.autoTags] : [],
        enableHints: generationConfig.enableHints,
        temperature: generationConfig.temperature,
        maxTokens: generationConfig.maxTokens,
        maxGenerationLimit: generationConfig.maxGenerationLimit ?? generationConfig.cardCount,
        prioritizePromptRequirements: generationConfig.prioritizePromptRequirements ?? true
      }
    });
  }

  async function selectSourceFile(file: ObsidianFileInfo) {
    selectedFile = file;
    content = await plugin.app.vault.read(file.file);
    await persistPreferences();
  }

  async function selectPromptFile(file: ObsidianFileInfo | null) {
    selectedPromptFile = file;
    promptContent = file ? await plugin.app.vault.read(file.file) : '';
    await persistPreferences();
  }

  async function openPromptFileMenu(detail?: { x?: number; y?: number; rect?: AnchorRect }) {
    try {
      const menu = new Menu();
      const promptFiles = await listUserPromptFiles(plugin.app);

      menu.addItem((item) => {
        item
          .setTitle('\u4e0d\u4f7f\u7528\u63d0\u793a\u8bcd\u6587\u4ef6')
          .setChecked(!selectedPromptFile)
          .onClick(() => {
            void selectPromptFile(null);
          });
      });

      menu.addSeparator();

      if (promptFiles.length === 0) {
        menu.addItem((item) => item.setTitle('\u56fa\u5b9a\u76ee\u5f55\u4e2d\u6682\u65e0\u7528\u6237\u63d0\u793a\u8bcd\u6587\u4ef6').setDisabled(true));
      } else {
        promptFiles.forEach((file) => {
          const label = getUserPromptRelativePath(plugin.app, file.path);
          menu.addItem((item) => {
            item
              .setTitle(label)
              .setIcon(selectedPromptFile?.path === file.path ? 'check' : 'file-text')
              .setChecked(selectedPromptFile?.path === file.path)
              .onClick(() => {
                void selectPromptFile(fileToInfo(file));
              });
          });
        });
      }

      showMenuAtAnchor(menu, detail, { x: 220, y: 80 });
      attachMenuClass(menu, AI_USER_PROMPT_FILE_MENU_CLASS);
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
        generationConfig = { ...nextConfig };
        await persistPreferences();
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
                generationConfig = { ...generationConfig, provider, model: configuredModel };
                void persistPreferences();
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
                generationConfig = { ...generationConfig, provider, model: model.id };
                void persistPreferences();
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

      generationProgress = { status: 'completed', progress: 100, message: '\u5df2\u751f\u6210 ' + result.length + ' \u5f20\u5361\u7247' };
    } catch (error) {
      logger.error('AI generate failed:', error);
      new Notice(error instanceof Error ? error.message : 'AI \u751f\u6210\u5931\u8d25');
      generationProgress = { status: 'failed', progress: 0, message: 'AI \u751f\u6210\u5931\u8d25' };
    } finally {
      isGenerating = false;
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
    } catch (error) {
      logger.error('Parse preview failed:', error);
      new Notice(error instanceof Error ? error.message : '\u89e3\u6790\u9884\u89c8\u5931\u8d25');
      parseItems = [];
    } finally {
      isParsing = false;
    }
  }

  async function restoreHistory(entry: HistoryEntry) {
    selectedFile = await findFile(entry.sourceFile?.path);
    selectedPromptFile = findUserPromptFile(entry.promptFile?.path);
    content = entry.sourceContent;
    promptContent = entry.customPrompt;
    generationConfig = { ...entry.config };
    generatedItems = entry.cards.map(toPreviewItem);
    subView = 'generate';
    historyOpen = false;
    await persistPreferences();
  }

  async function importCards(selectedItems: AICardPreviewItem[], targetDeckId: string) {
    const { CardConverter } = await import('../../services/ai/CardConverter');
    const converted = CardConverter.convertBatch(
      selectedItems.map((item) => item.generatedCard),
      targetDeckId,
      selectedFile?.path,
      generationConfig.templates,
      fsrs
    );

    for (const card of converted.cards) {
      await dataStorage.saveCard(card);
    }
  }

  async function importParsedCards(selectedItems: AIParsePreviewItem[], targetDeckId: string) {
    const parsedCards: ParsedCard[] = selectedItems.map((item) => ({
      ...item.parsedCard,
      tags: [...(item.parsedCard.tags || [])],
      metadata: {
        ...(item.parsedCard.metadata || {}),
        targetDeckId,
        sourceFile: item.parsedCard.metadata?.sourceFile || selectedFile?.path || item.parsedCard.sourceFile
      }
    }));

    await plugin.addCardsToDB(parsedCards);
  }

  $effect(() => {
    window.dispatchEvent(new CustomEvent('Weave:ai-toolbar-state-change', {
      detail: {
        subView,
        selectedFileName: selectedFile?.name ?? '',
        selectedFilePath: selectedFile?.path ?? '',
        promptFileName: selectedPromptFile?.name ?? '',
        promptFilePath: selectedPromptFile?.path ?? '',
        modelLabel: getModelDisplayLabel(),
        modelTitle: getModelDisplayLabel(),
        parsePresetName: selectedParsePreset?.name ?? '',
        parsePresetId: selectedParsePreset?.id || selectedParsePreset?.name || '',
        historyCount: generationHistory.length,
        canGenerate: !!content.trim() && !isGenerating,
        canParse: !!selectedFile && !!selectedParsePreset && !isParsing,
        isGenerating,
        isParsing
      }
    }));
  });

  $effect(() => {
    void plugin.saveAIGenerationHistory(generationHistory);
  });

  $effect(() => {
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
        subView = detail.value === 'parse-preview' ? 'parse-preview' : 'generate';
        void persistPreferences();
      }
    };

    window.addEventListener('Weave:ai-toolbar-action', handleToolbarAction as EventListener);
    return () => window.removeEventListener('Weave:ai-toolbar-action', handleToolbarAction as EventListener);
  });

  $effect(() => {
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
        return;
      }

      selectedPromptFile = fileToInfo(latestFile);
      void plugin.app.vault.read(latestFile).then((text) => {
        promptContent = text;
      });
    };

    window.addEventListener('Weave:ai-user-prompt-files-changed', handleUserPromptFilesChanged as EventListener);
    return () => window.removeEventListener('Weave:ai-user-prompt-files-changed', handleUserPromptFilesChanged as EventListener);
  });

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

  onMount(async () => {
    generationHistory = plugin.getAIGenerationHistory().slice(0, 5) as HistoryEntry[];
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
  });
</script>

<div class="ai-page" bind:this={pageEl}>
  {#if historyOpen}
    <div class="panel" style={historyStyle} bind:this={historyEl}>
      <div class="panel-head"><div>{'\u6700\u8fd1 5 \u6b21\u751f\u6210\u8bb0\u5f55'}</div></div>
      <div class="panel-list">
        {#each generationHistory as entry}
          <button class="list-item" onclick={() => restoreHistory(entry)}>
            <span>{(entry.sourceFile?.name || '\u672a\u547d\u540d\u5185\u5bb9') + ' \u00b7 ' + entry.cards.length + ' \u5f20'}</span>
            <small>{entry.promptFile?.name || '\u65e0\u63d0\u793a\u8bcd\u6587\u4ef6'}</small>
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
    gap: 8px;
    padding: 10px;
  }

  .list-item {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-secondary);
    cursor: pointer;
  }

  .list-item small {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.menu.weave-ai-source-file-menu),
  :global(.menu.weave-ai-user-prompt-file-menu) {
    max-height: min(70vh, 720px);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
  }
</style>
