import { getPluginPaths } from '../../../config/paths';
import {
  consumePendingPluginDataRecoveryAction,
  loadPluginDataWithRecovery,
  migrateLegacyPluginRuntimeState,
  PluginLocalStateService,
  savePluginDataWithBackup,
} from '../PluginLocalStateService';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function createMemoryHost(
  initialFiles: Record<string, string> = {},
  initialData: Record<string, unknown> = {},
) {
  const files = new Map<string, string>();
  const folders = new Set<string>(['', '.obsidian', '.obsidian/plugins', '.obsidian/plugins/weave']);
  let activeProcessCount = 0;
  let maxProcessConcurrency = 0;
  let processCalls = 0;

  const ensureDir = (dir: string) => {
    const normalized = normalizeTestPath(dir);
    if (!normalized) return;
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    }
  };

  const writeText = (path: string, content: string) => {
    const normalized = normalizeTestPath(path);
    ensureDir(parentPath(normalized));
    files.set(normalized, content);
  };

  for (const [path, content] of Object.entries(initialFiles)) {
    writeText(path, content);
  }

  const adapter = {
    exists: async (path: string) => {
      const normalized = normalizeTestPath(path);
      return files.has(normalized) || folders.has(normalized);
    },
    mkdir: async (path: string) => {
      ensureDir(path);
    },
    read: async (path: string) => {
      const normalized = normalizeTestPath(path);
      const value = files.get(normalized);
      if (value === undefined) throw new Error(`File not found: ${normalized}`);
      return value;
    },
    write: async (path: string, content: string) => {
      writeText(path, content);
    },
    process: async (path: string, fn: (data: string) => string) => {
      processCalls += 1;
      activeProcessCount += 1;
      maxProcessConcurrency = Math.max(maxProcessConcurrency, activeProcessCount);
      try {
        await Promise.resolve();
        const normalized = normalizeTestPath(path);
        const current = files.get(normalized) ?? '';
        const next = fn(current);
        writeText(path, next);
        return next;
      } finally {
        activeProcessCount -= 1;
      }
    },
    remove: async (path: string) => {
      const normalized = normalizeTestPath(path);
      files.delete(normalized);
    },
    rename: async (path: string, newPath: string) => {
      const normalized = normalizeTestPath(path);
      const normalizedNewPath = normalizeTestPath(newPath);
      const value = files.get(normalized);
      if (value === undefined) throw new Error(`File not found: ${normalized}`);
      writeText(normalizedNewPath, value);
      files.delete(normalized);
    },
  };

  const savedPayloads: unknown[] = [];
  const host = {
    app: {
      vault: {
        configDir: '.obsidian',
        adapter,
      },
    } as any,
    loadData: vi.fn().mockImplementation(async () => ({ ...initialData })),
    saveData: vi.fn().mockImplementation(async (data: unknown) => {
      savedPayloads.push(data);
    }),
  };

  return {
    host,
    files,
    savedPayloads,
    metrics: {
      get maxProcessConcurrency() {
        return maxProcessConcurrency;
      },
      get processCalls() {
        return processCalls;
      },
    },
  };
}

describe('PluginLocalStateService', () => {
  beforeEach(() => {
    vi.useRealTimers();
    consumePendingPluginDataRecoveryAction();
  });

  it('persists and clears local state files under state/', async () => {
    const { host, files } = createMemoryHost();
    const service = new PluginLocalStateService(host.app);
    const pluginPaths = getPluginPaths(host.app);

    await service.saveDeckViewPreference('kanban');
    await service.savePersistedStudySession({ deckId: 'deck-1' });
    await service.saveCardManagementViewPreferences({
      currentView: 'grid',
      gridLayout: 'masonry',
      gridCardAttribute: 'priority',
      kanbanLayoutMode: 'comfortable',
      tableViewMode: 'basic',
      enableCardLocationJump: true,
    });
    await service.saveStudyInterfaceViewPreferences({
      showSidebar: false,
      sidebarCompactModeSetting: 'fixed',
      statsCollapsed: false,
      cardOrder: 'random',
      choiceOptionOrder: 'random',
      sidebarPosition: 'bottom',
      ratingLabelStyle: 'mood',
    });
    await service.saveIRCalendarSidebarSettings({
      continuousReadingEnabled: true,
      autoStartNextTimerEnabled: true,
      showSchedulingPreview: true,
      showMaterialTimers: false,
    });
    await service.saveAIAssistantPreferences({
      lastUsedProvider: 'zhipu',
      lastUsedModel: 'glm-4-flash',
      importAutoTags: ['legacy'],
      savedGenerationConfig: {
        cardCount: 8,
        difficulty: 'mixed',
        typeDistribution: { qa: 40, cloze: 30, choice: 30 },
        enableHints: true,
        temperature: 0.6,
        maxTokens: 1600,
      },
    });
    await service.saveCreateCardPreferences({
      lastSelectedDeckId: 'deck-9',
      lastSelectedDeckNames: ['Deck 9'],
    });
    await service.saveEpubBookshelfSettings({
      lastScanAt: 123456,
    });
    await service.saveEditorModalSizeState({
      preset: 'custom',
      customWidth: 960,
      customHeight: 720,
    });
    await service.saveAIGenerationHistory([
      {
        id: 'history-1',
        createdAt: '2026-03-28T10:11:12.345Z',
        sourceFile: {
          path: 'notes/demo.md',
          name: 'demo.md',
          size: 128,
          extension: 'md',
        },
        sourceContent: '# Demo',
        cards: [],
        config: {
          templateId: '',
          promptTemplate: '',
          cardCount: 3,
          difficulty: 'medium',
          typeDistribution: { qa: 50, cloze: 30, choice: 20 },
          provider: 'zhipu',
          model: 'glm-4-flash',
          temperature: 0.7,
          maxTokens: 1500,
          imageGeneration: {
            enabled: false,
            strategy: 'none',
            imagesPerCard: 0,
            placement: 'question',
          },
          templates: {
            qa: 'official-qa',
            choice: 'official-choice',
            cloze: 'official-cloze',
          },
          enableHints: true,
        },
        selectedPrompt: null,
        customPrompt: '',
      },
    ]);

    expect(await service.loadDeckViewPreference()).toBe('kanban');
    expect(await service.loadPersistedStudySession<{ deckId: string }>()).toEqual({ deckId: 'deck-1' });
    expect(await service.loadCardManagementViewPreferences()).toEqual({
      currentView: 'grid',
      gridLayout: 'masonry',
      gridCardAttribute: 'priority',
      kanbanLayoutMode: 'comfortable',
      tableViewMode: 'basic',
      enableCardLocationJump: true,
    });
    expect(await service.loadStudyInterfaceViewPreferences()).toEqual({
      showSidebar: false,
      sidebarCompactModeSetting: 'fixed',
      statsCollapsed: false,
      cardOrder: 'random',
      choiceOptionOrder: 'random',
      sidebarPosition: 'bottom',
      ratingLabelStyle: 'mood',
    });
    expect(await service.loadIRCalendarSidebarSettings()).toEqual({
      continuousReadingEnabled: true,
      autoStartNextTimerEnabled: true,
      showSchedulingPreview: true,
      showMaterialTimers: false,
    });
    expect(await service.loadAIAssistantPreferences()).toEqual({
      lastUsedProvider: 'zhipu',
      lastUsedModel: 'glm-4-flash',
      importAutoTags: ['legacy'],
      savedGenerationConfig: {
        cardCount: 8,
        difficulty: 'mixed',
        typeDistribution: { qa: 40, cloze: 30, choice: 30 },
        enableHints: true,
        temperature: 0.6,
        maxTokens: 1600,
      },
    });
    expect(await service.loadCreateCardPreferences()).toEqual({
      lastSelectedDeckId: 'deck-9',
      lastSelectedDeckNames: ['Deck 9'],
    });
    expect(await service.loadEpubBookshelfSettings()).toEqual({
      lastScanAt: 123456,
    });
    expect(await service.loadEditorModalSizeState()).toEqual({
      preset: 'custom',
      customWidth: 960,
      customHeight: 720,
    });
    expect(await service.loadAIGenerationHistory()).toEqual([
      expect.objectContaining({
        id: 'history-1',
        sourceContent: '# Demo',
      }),
    ]);
    expect(files.has(normalizeTestPath(pluginPaths.state.localStorage))).toBe(true);
    expect(files.has(normalizeTestPath(pluginPaths.state.studySession))).toBe(true);
    expect(files.has(normalizeTestPath(`${pluginPaths.state.root}/ai-generation-history.json`))).toBe(true);

    await service.clearPersistedStudySession();

    expect(await service.loadPersistedStudySession()).toBeNull();
    expect(files.has(normalizeTestPath(pluginPaths.state.studySession))).toBe(false);
  });

  it('migrates legacy runtime fields out of data.json into state files', async () => {
    const { host, files } = createMemoryHost({}, {
      theme: 'dark',
      deckView: 'kanban',
      persistedStudySession: { deckId: 'legacy-deck' },
      cardManagementViewPreferences: {
        currentView: 'kanban',
        gridLayout: 'fixed',
        gridCardAttribute: 'uuid',
        kanbanLayoutMode: 'spacious',
        tableViewMode: 'review',
        enableCardLocationJump: true,
      },
      studyInterfaceViewPreferences: {
        showSidebar: false,
        sidebarCompactModeSetting: 'fixed',
        statsCollapsed: false,
        cardOrder: 'random',
        choiceOptionOrder: 'random',
        sidebarPosition: 'bottom',
        ratingLabelStyle: 'mood',
      },
      createCardPreferences: {
        lastSelectedDeckId: 'legacy-deck-id',
        lastSelectedDeckNames: ['Legacy Deck'],
      },
      epubBookshelf: {
        sourceMode: 'folder-only',
        sourceFolder: 'Books/Legacy',
      },
      editorModalSize: {
        preset: 'custom',
        customWidth: 1024,
        customHeight: 768,
        rememberLastSize: true,
        enableResize: false,
      },
      aiConfig: {
        defaultProvider: 'zhipu',
        lastUsedProvider: 'openai',
        lastUsedModel: 'gpt-5-mini',
        savedGenerationConfig: {
          cardCount: 5,
          difficulty: 'hard',
          typeDistribution: { qa: 60, cloze: 20, choice: 20 },
          autoTags: ['ai'],
          enableHints: false,
          temperature: 0.4,
          maxTokens: 1200,
        },
        generationHistory: [
          {
            id: 'legacy-history',
            createdAt: '2026-03-28T10:11:12.345Z',
            sourceFile: null,
            sourceContent: 'legacy content',
            cards: [],
            config: {
              templateId: '',
              promptTemplate: '',
              cardCount: 1,
              difficulty: 'easy',
              typeDistribution: { qa: 100, cloze: 0, choice: 0 },
              provider: 'openai',
              model: 'gpt-5-mini',
              temperature: 0.3,
              maxTokens: 800,
              imageGeneration: {
                enabled: false,
                strategy: 'none',
                imagesPerCard: 0,
                placement: 'question',
              },
              templates: {
                qa: 'official-qa',
                choice: 'official-choice',
                cloze: 'official-cloze',
              },
              enableHints: true,
            },
            selectedPrompt: null,
            customPrompt: '',
          },
        ],
      },
      incrementalReading: {
        dailyNewLimit: 12,
        calendarSidebar: {
          continuousReadingEnabled: true,
          autoStartNextTimerEnabled: true,
          showSchedulingPreview: false,
          showMaterialTimers: false,
        },
      },
    });
    const pluginPaths = getPluginPaths(host.app);
    const service = new PluginLocalStateService(host.app);

    await migrateLegacyPluginRuntimeState(host as any);

    const localStorageState = JSON.parse(
      files.get(normalizeTestPath(pluginPaths.state.localStorage)) ?? '{}'
    );
    expect(JSON.parse(localStorageState['weave-ai-assistant-preferences'])).toEqual({
      lastUsedProvider: 'openai',
      lastUsedModel: 'gpt-5-mini',
      importAutoTags: ['ai'],
      savedGenerationConfig: {
        cardCount: 5,
        difficulty: 'hard',
        typeDistribution: { qa: 60, cloze: 20, choice: 20 },
        enableHints: false,
        temperature: 0.4,
        maxTokens: 1200,
      },
    });
    delete localStorageState['weave-ai-assistant-preferences'];
    expect(localStorageState).toEqual({
      'weave-deck-view': 'kanban',
      'weave-card-management-view-preferences': JSON.stringify({
        currentView: 'kanban',
        gridLayout: 'fixed',
        gridCardAttribute: 'uuid',
        kanbanLayoutMode: 'spacious',
        tableViewMode: 'review',
        enableCardLocationJump: true,
      }),
      'weave-study-interface-view-preferences': JSON.stringify({
        showSidebar: false,
        sidebarCompactModeSetting: 'fixed',
        statsCollapsed: false,
        cardOrder: 'random',
        choiceOptionOrder: 'random',
        sidebarPosition: 'bottom',
        ratingLabelStyle: 'mood',
      }),
      'weave-create-card-preferences': JSON.stringify({
        lastSelectedDeckId: 'legacy-deck-id',
        lastSelectedDeckNames: ['Legacy Deck'],
      }),
      'weave-epub-bookshelf-settings': JSON.stringify({
        lastScanAt: 0,
      }),
      'weave-editor-modal-size-state': JSON.stringify({
        preset: 'custom',
        customWidth: 1024,
        customHeight: 768,
      }),
      'weave-ir-calendar-sidebar-settings': JSON.stringify({
        continuousReadingEnabled: true,
        autoStartNextTimerEnabled: true,
        showSchedulingPreview: false,
        showMaterialTimers: false,
      }),
    });
    expect(JSON.parse(files.get(normalizeTestPath(pluginPaths.state.studySession)) || '{}')).toMatchObject({
      persistedStudySession: { deckId: 'legacy-deck' },
    });
    expect(await service.loadCardManagementViewPreferences()).toEqual({
      currentView: 'kanban',
      gridLayout: 'fixed',
      gridCardAttribute: 'uuid',
      kanbanLayoutMode: 'spacious',
      tableViewMode: 'review',
      enableCardLocationJump: true,
    });
    expect(await service.loadStudyInterfaceViewPreferences()).toEqual({
      showSidebar: false,
      sidebarCompactModeSetting: 'fixed',
      statsCollapsed: false,
      cardOrder: 'random',
      choiceOptionOrder: 'random',
      sidebarPosition: 'bottom',
      ratingLabelStyle: 'mood',
    });
    expect(await service.loadIRCalendarSidebarSettings()).toEqual({
      continuousReadingEnabled: true,
      autoStartNextTimerEnabled: true,
      showSchedulingPreview: false,
      showMaterialTimers: false,
    });
    expect(await service.loadAIAssistantPreferences()).toEqual({
      lastUsedProvider: 'openai',
      lastUsedModel: 'gpt-5-mini',
      importAutoTags: ['ai'],
      savedGenerationConfig: {
        cardCount: 5,
        difficulty: 'hard',
        typeDistribution: { qa: 60, cloze: 20, choice: 20 },
        enableHints: false,
        temperature: 0.4,
        maxTokens: 1200,
      },
    });
    expect(await service.loadCreateCardPreferences()).toEqual({
      lastSelectedDeckId: 'legacy-deck-id',
      lastSelectedDeckNames: ['Legacy Deck'],
    });
    expect(await service.loadEpubBookshelfSettings()).toEqual({
      lastScanAt: 0,
    });
    expect(await service.loadEditorModalSizeState()).toEqual({
      preset: 'custom',
      customWidth: 1024,
      customHeight: 768,
    });
    expect(await service.loadAIGenerationHistory()).toEqual([
      expect.objectContaining({
        id: 'legacy-history',
        sourceContent: 'legacy content',
      }),
    ]);
    expect(JSON.parse(files.get(normalizeTestPath(`${pluginPaths.root}/data.json`)) || '{}')).toEqual({
      theme: 'dark',
      editorModalSize: {
        rememberLastSize: true,
        enableResize: false,
      },
      aiConfig: {
        defaultProvider: 'zhipu',
      },
      incrementalReading: {
        dailyNewLimit: 12,
      },
    });
  });

  it('keeps newer state files and only removes stale legacy fields from data.json', async () => {
    const { host, files } = createMemoryHost({
      '.obsidian/plugins/weave/state/local-storage.json': JSON.stringify({ 'weave-deck-view': 'grid' }),
      '.obsidian/plugins/weave/state/study-session.json': JSON.stringify({
        persistedStudySession: { deckId: 'current-deck' },
      }),
    }, {
      deckView: 'kanban',
      persistedStudySession: { deckId: 'legacy-deck' },
      language: 'zh',
    });
    const pluginPaths = getPluginPaths(host.app);

    await migrateLegacyPluginRuntimeState(host as any);

    expect(JSON.parse(files.get(normalizeTestPath(pluginPaths.state.localStorage)) || '{}')).toEqual({
      'weave-deck-view': 'grid',
    });
    expect(JSON.parse(files.get(normalizeTestPath(pluginPaths.state.studySession)) || '{}')).toEqual({
      persistedStudySession: { deckId: 'current-deck' },
    });
    expect(JSON.parse(files.get(normalizeTestPath(`${pluginPaths.root}/data.json`)) || '{}')).toEqual({
      language: 'zh',
    });
  });

  it('restores corrupt data.json from the last good backup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-28T10:11:12.345Z'));

    const { host, files } = createMemoryHost({
      '.obsidian/plugins/weave/data.json': '{"theme":"dark"',
      '.obsidian/plugins/weave/backups/config-recovery/plugin-data-last-good.json': JSON.stringify({
        theme: 'dark',
        language: 'zh',
      }, null, 2),
    });
    const pluginPaths = getPluginPaths(host.app);

    host.loadData.mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));

    const recoveredData = await loadPluginDataWithRecovery(host as any);

    expect(recoveredData).toEqual({
      theme: 'dark',
      language: 'zh',
    });
    expect(files.get(normalizeTestPath(`${pluginPaths.root}/data.json`))).toBe(JSON.stringify({
      theme: 'dark',
      language: 'zh',
    }, null, 2));
    expect(
      files.get(
        normalizeTestPath(
          `${pluginPaths.backups}/config-recovery/plugin-data-corrupt-2026-03-28T10-11-12-345Z.json`,
        ),
      ),
    ).toBe('{"theme":"dark"');
    expect(consumePendingPluginDataRecoveryAction()).toBe('restored-backup');
  });

  it('resets corrupt data.json to an empty config when no backup is available', async () => {
    const { host, files } = createMemoryHost({
      '.obsidian/plugins/weave/data.json': '{"theme":"dark"',
    });
    const pluginPaths = getPluginPaths(host.app);

    host.loadData.mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));

    const recoveredData = await loadPluginDataWithRecovery(host as any);

    expect(recoveredData).toEqual({});
    expect(files.get(normalizeTestPath(`${pluginPaths.root}/data.json`))).toBe('{}');
    expect(consumePendingPluginDataRecoveryAction()).toBe('reset-defaults');
  });

  it('writes a last-good backup after saving plugin data', async () => {
    const { host, files } = createMemoryHost();
    const pluginPaths = getPluginPaths(host.app);

    await savePluginDataWithBackup(host as any, { theme: 'light', language: 'zh' });

    expect(JSON.parse(files.get(normalizeTestPath(`${pluginPaths.root}/data.json`)) || '{}')).toEqual({
      theme: 'light',
      language: 'zh',
    });
    expect(
      files.get(normalizeTestPath(`${pluginPaths.backups}/config-recovery/plugin-data-last-good.json`)),
    ).toBe(JSON.stringify({ theme: 'light', language: 'zh' }, null, 2));
  });

  it('serializes concurrent plugin data writes to avoid overlapping data.json writes', async () => {
    const { host, files, metrics } = createMemoryHost({
      '.obsidian/plugins/weave/data.json': JSON.stringify({ theme: 'initial' }, null, 2),
    });
    const pluginPaths = getPluginPaths(host.app);

    await Promise.all([
      savePluginDataWithBackup(host as any, { theme: 'first' }),
      savePluginDataWithBackup(host as any, { theme: 'second', language: 'zh' }),
    ]);

    expect(metrics.maxProcessConcurrency).toBe(1);
    expect(metrics.processCalls).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(files.get(normalizeTestPath(`${pluginPaths.root}/data.json`)) || '{}')).toEqual({
      theme: 'second',
      language: 'zh',
    });
  });

  it('serializes concurrent managed local-storage updates so entries are not lost', async () => {
    const { host, files } = createMemoryHost();
    const pluginPaths = getPluginPaths(host.app);
    const service = new PluginLocalStateService(host.app);

    await Promise.all([
      service.saveCardManagementViewPreferences({
        currentView: 'grid',
        gridLayout: 'fixed',
        gridCardAttribute: 'uuid',
        kanbanLayoutMode: 'comfortable',
        tableViewMode: 'basic',
        enableCardLocationJump: false,
      }),
      service.saveStudyInterfaceViewPreferences({
        showSidebar: true,
        sidebarCompactModeSetting: 'auto',
        statsCollapsed: true,
        cardOrder: 'sequential',
        choiceOptionOrder: 'sequential',
        sidebarPosition: 'right',
        ratingLabelStyle: 'classic',
      }),
      service.saveCreateCardPreferences({
        lastSelectedDeckId: 'deck-race',
        lastSelectedDeckNames: ['Deck Race'],
      }),
    ]);

    expect(JSON.parse(files.get(normalizeTestPath(pluginPaths.state.localStorage)) || '{}')).toEqual({
      'weave-card-management-view-preferences': JSON.stringify({
        currentView: 'grid',
        gridLayout: 'fixed',
        gridCardAttribute: 'uuid',
        kanbanLayoutMode: 'comfortable',
        tableViewMode: 'basic',
        enableCardLocationJump: false,
      }),
      'weave-study-interface-view-preferences': JSON.stringify({
        showSidebar: true,
        sidebarCompactModeSetting: 'auto',
        statsCollapsed: true,
        cardOrder: 'sequential',
        choiceOptionOrder: 'sequential',
        sidebarPosition: 'right',
        ratingLabelStyle: 'classic',
      }),
      'weave-create-card-preferences': JSON.stringify({
        lastSelectedDeckId: 'deck-race',
        lastSelectedDeckNames: ['Deck Race'],
      }),
    });
  });
});
