import { getPluginPaths, getV2Paths } from '../../../config/paths';
import {
  DEFAULT_BATCH_FIX_TYPES,
  DataManagementService,
} from '../DataManagementService';
import { parseYAMLFromContent } from '../../../utils/yaml-utils';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function createMemoryPlugin(initialFiles: Record<string, string> = {}, initialDirs: string[] = []) {
  const files = new Map<string, string>();
  const folders = new Set<string>(['', '.obsidian', '.obsidian/plugins', '.obsidian/plugins/weave']);

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

  for (const dir of initialDirs) {
    ensureDir(dir);
  }

  const adapter = {
    basePath: 'C:/vault',
    exists: async (path: string) => {
      const normalized = normalizeTestPath(path);
      return files.has(normalized) || folders.has(normalized);
    },
    mkdir: async (path: string) => {
      ensureDir(path);
    },
    list: async (dir: string) => {
      const normalized = normalizeTestPath(dir);
      const prefix = normalized ? `${normalized}/` : '';
      const childFolders = new Set<string>();
      const childFiles: string[] = [];

      for (const folder of folders) {
        if (!folder || folder === normalized || !folder.startsWith(prefix)) continue;
        const rest = folder.slice(prefix.length);
        if (!rest || rest.includes('/')) continue;
        childFolders.add(folder);
      }

      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        if (!rest || rest.includes('/')) continue;
        childFiles.push(file);
      }

      return {
        files: childFiles.sort(),
        folders: Array.from(childFolders).sort(),
      };
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
    remove: async (path: string) => {
      const normalized = normalizeTestPath(path);
      if (files.has(normalized)) {
        files.delete(normalized);
        return;
      }
      folders.delete(normalized);
    },
    rmdir: async (dir: string, recursive = false) => {
      const normalized = normalizeTestPath(dir);
      if (recursive) {
        for (const file of Array.from(files.keys())) {
          if (file === normalized || file.startsWith(`${normalized}/`)) {
            files.delete(file);
          }
        }
        for (const folder of Array.from(folders)) {
          if (folder === normalized || folder.startsWith(`${normalized}/`)) {
            folders.delete(folder);
          }
        }
        return;
      }

      const listing = await adapter.list(normalized);
      if (listing.files.length === 0 && listing.folders.length === 0) {
        folders.delete(normalized);
      }
    },
  };

  const clearCache = vi.fn();
  const plugin = {
    app: {
      vault: {
        configDir: '.obsidian',
        adapter,
        getAbstractFileByPath: (path: string) => {
          const normalized = normalizeTestPath(path);
          return files.has(normalized) || folders.has(normalized)
            ? { path: normalized }
            : null;
        },
      },
    },
    settings: {
      weaveParentFolder: '',
      incrementalReading: {},
    },
    dataStorage: {
      getCards: vi.fn().mockResolvedValue([]),
      getDecks: vi.fn().mockResolvedValue([]),
      saveCard: vi.fn().mockResolvedValue({ success: true }),
    },
    cardFileService: {
      clearCache,
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as any;

  return {
    plugin,
    files,
    folders,
    clearCache,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DataManagementService', () => {
  it('fixAll only executes the default safe fix set', async () => {
    const { plugin, clearCache } = createMemoryPlugin();
    const service = new DataManagementService(plugin);
    const fixSpy = vi
      .spyOn(service, 'fix')
      .mockImplementation(async (type: any) => ({
        type,
        success: 1,
        failed: 0,
        errors: [],
      }));

    vi.useFakeTimers();
    const promise = service.fixAll();
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(fixSpy.mock.calls.map(([type]) => type)).toEqual(DEFAULT_BATCH_FIX_TYPES);
    expect(results.map((result) => result.type)).toEqual(DEFAULT_BATCH_FIX_TYPES);
    expect(clearCache).toHaveBeenCalledTimes(DEFAULT_BATCH_FIX_TYPES.length);
  });

  it('blocks legacy cleanup when no verified migration report exists', async () => {
    const { plugin } = createMemoryPlugin();
    const service = new DataManagementService(plugin);
    const recoverSpy = vi.spyOn(service, 'recoverMigrationConflictData');
    vi.spyOn(service, 'getLatestMigrationReport').mockResolvedValue(null);

    const result = await service.cleanupLegacyDirectories({ allowHighRisk: true });

    expect(result.type).toBe('legacy_cleanup');
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.error).toContain('迁移报告');
    expect(recoverSpy).not.toHaveBeenCalled();
  });

  it('includes empty legacy cards and deck-cards directories in legacy cleanup check', async () => {
    const v2Paths = getV2Paths('');
    const { plugin } = createMemoryPlugin({}, [v2Paths.memory.cards, v2Paths.memory.deckCards]);
    const service = new DataManagementService(plugin);

    const result = await service.checkLegacyDirectories();

    expect(result.type).toBe('legacy_cleanup');
    expect(result.items).toEqual(
      expect.arrayContaining([v2Paths.memory.cards, v2Paths.memory.deckCards])
    );
  });

  it('merges IR monitoring conflict files and removes empty legacy helper directories during legacy cleanup', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const monitoringPath = `${v2Paths.ir.root}/monitoring.json`;
    const { plugin, files, folders } = createMemoryPlugin(
      {
        [monitoringPath]: JSON.stringify({
          version: '3.0.0',
          dailyStats: [{ date: '2026-04-15', dueCount: 1 }],
          priorityChanges: [],
          groupParamChanges: [],
          decisionEvents: [],
          decisionOutcomes: [],
          lastUpdated: '2026-04-15T00:00:00.000Z',
        }),
        [`${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`]: JSON.stringify({
          version: '3.0.0',
          dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
          priorityChanges: [],
          groupParamChanges: [],
          decisionEvents: [
            {
              itemId: 'chunk-1',
              action: 'schedule_normal',
              timestamp: '2026-04-16T09:00:00.000Z',
            },
          ],
          decisionOutcomes: [],
          lastUpdated: '2026-04-16T09:00:00.000Z',
        }),
      },
      [v2Paths.memory.cards, v2Paths.memory.deckCards]
    );
    const service = new DataManagementService(plugin);
    vi.spyOn(service, 'getLatestMigrationReport').mockResolvedValue({
      status: 'completed',
      verification: { ok: true },
      plan: { targetRoot: v2Paths.root },
    } as any);

    const result = await service.cleanupLegacyDirectories({ allowHighRisk: true });

    expect(result.type).toBe('legacy_cleanup');
    expect(result.failed).toBe(0);
    expect(files.has(`${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`)).toBe(false);
    expect(folders.has(conflictDir)).toBe(false);
    expect(folders.has(v2Paths.memory.cards)).toBe(false);
    expect(folders.has(v2Paths.memory.deckCards)).toBe(false);

    const monitoring = JSON.parse(files.get(monitoringPath) || '{}');
    expect(monitoring.dailyStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-04-15', dueCount: 1 }),
        expect.objectContaining({ date: '2026-04-16', dueCount: 2 }),
      ])
    );
    expect(monitoring.decisionEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'chunk-1' })])
    );
  });

  it('detects auto-recoverable migration conflict files as a standalone check item', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const { plugin } = createMemoryPlugin({
      [`${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.check('migration_conflict_files');

    expect(result).toMatchObject({
      type: 'migration_conflict_files',
      status: 'warning',
      count: 1,
    });
    expect(result.items[0]).toContain('[可自动处理]');
    expect(result.items[0]).toContain('weave_incremental-reading_monitoring.json-1775964650413');
  });

  it('recovers auto-recoverable migration conflict files without leaving them behind', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const monitoringPath = `${v2Paths.ir.root}/monitoring.json`;
    const conflictPath = `${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`;
    const { plugin, files } = createMemoryPlugin({
      [monitoringPath]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-15', dueCount: 1 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-15T00:00:00.000Z',
      }),
      [conflictPath]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [
          {
            itemId: 'chunk-1',
            action: 'schedule_normal',
            timestamp: '2026-04-16T09:00:00.000Z',
          },
        ],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(result).toEqual({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(files.has(conflictPath)).toBe(false);

    const monitoring = JSON.parse(files.get(monitoringPath) || '{}');
    expect(monitoring.dailyStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-04-15', dueCount: 1 }),
        expect.objectContaining({ date: '2026-04-16', dueCount: 2 }),
      ])
    );
    expect(monitoring.decisionEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'chunk-1' })])
    );
  });

  it('recovers nested question-bank migration conflict JSON back into the canonical file', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const targetPath = `${v2Paths.questionBank.banksDir}/bank-1/questions.json`;
    const conflictPath =
      `${conflictDir}/Archive_weave_question-bank_banks_bank-1_questions.json-1775964650413`;
    const { plugin, files } = createMemoryPlugin({
      [targetPath]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-1',
        refs: [{ cardUuid: 'card-1', addedAt: '2026-04-15T00:00:00.000Z' }],
      }),
      [conflictPath]: JSON.stringify({
        _schemaVersion: '2.0.0',
        bankId: 'bank-1',
        refs: [{ cardUuid: 'card-2', addedAt: '2026-04-16T00:00:00.000Z' }],
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('migration_conflict_files');
    const fixResult = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(checkResult).toMatchObject({
      type: 'migration_conflict_files',
      status: 'warning',
      count: 1,
    });
    expect(checkResult.items[0]).toContain('[可自动处理]');
    expect(fixResult).toEqual({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(files.has(conflictPath)).toBe(false);

    const parsed = JSON.parse(files.get(targetPath) || '{}');
    expect(parsed.refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardUuid: 'card-1' }),
        expect.objectContaining({ cardUuid: 'card-2' }),
      ])
    );
  });

  it('rebuilds merged question stats after recovering question-bank migration conflicts', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const targetPath = v2Paths.questionBank.questionStats;
    const conflictPath = `${conflictDir}/weave_question-bank_question-stats.json-1775964650413`;
    const { plugin, files } = createMemoryPlugin({
      [targetPath]: JSON.stringify({
        _schemaVersion: '1.0.0',
        statsByUuid: {
          'card-1': {
            totalAttempts: 1,
            correctAttempts: 1,
            incorrectAttempts: 0,
            accuracy: 1,
            bestScore: 100,
            averageScore: 100,
            lastScore: 100,
            averageResponseTime: 1000,
            fastestTime: 1000,
            lastTestDate: '2026-04-15T09:00:00.000Z',
            isInErrorBook: false,
            consecutiveCorrect: 1,
            attempts: [
              {
                isCorrect: true,
                mode: 'exam',
                timestamp: '2026-04-15T09:00:00.000Z',
                score: 100,
                timeSpent: 1000,
              },
            ],
          },
        },
      }),
      [conflictPath]: JSON.stringify({
        _schemaVersion: '1.0.0',
        statsByUuid: {
          'card-1': {
            totalAttempts: 1,
            correctAttempts: 0,
            incorrectAttempts: 1,
            accuracy: 0,
            bestScore: 0,
            averageScore: 0,
            lastScore: 0,
            averageResponseTime: 2000,
            fastestTime: 2000,
            lastTestDate: '2026-04-16T09:00:00.000Z',
            isInErrorBook: true,
            consecutiveCorrect: 0,
            lastIncorrectDate: '2026-04-16T09:00:00.000Z',
            attempts: [
              {
                isCorrect: false,
                mode: 'exam',
                timestamp: '2026-04-16T09:00:00.000Z',
                score: 0,
                timeSpent: 2000,
              },
            ],
          },
        },
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.fix('migration_conflict_files', { allowHighRisk: true });

    expect(result).toEqual({
      type: 'migration_conflict_files',
      success: 1,
      failed: 0,
      errors: [],
    });

    const parsed = JSON.parse(files.get(targetPath) || '{}');
    const stats = parsed.statsByUuid?.['card-1'];
    expect(stats.totalAttempts).toBe(2);
    expect(stats.correctAttempts).toBe(1);
    expect(stats.incorrectAttempts).toBe(1);
    expect(stats.accuracy).toBe(0.5);
    expect(stats.attempts).toHaveLength(2);
    expect(stats.lastTestDate).toBe('2026-04-16T09:00:00.000Z');
    expect(stats.isInErrorBook).toBe(true);
    expect(stats.consecutiveCorrect).toBe(0);
    expect(files.has(conflictPath)).toBe(false);
  });

  it('includes .wdeck migration in the unified check list', async () => {
    const { plugin } = createMemoryPlugin();
    const service = new DataManagementService(plugin);
    const checkSpy = vi
      .spyOn(service, 'check')
      .mockImplementation(async (type: any) => ({
        type,
        status: 'ok',
        count: 0,
        items: [],
        message: `${type} ok`,
      }));

    const results = await service.checkAll();

    expect(checkSpy.mock.calls.map(([type]) => type)).toContain('wdeck_migration');
    expect(results.some((result) => result.type === 'wdeck_migration')).toBe(true);
  });

  it('restores a sync conflict copy as the canonical file when the original is missing', async () => {
    const v2Paths = getV2Paths('');
    const conflictPath = `${v2Paths.memory.cards}/default 2.json`;
    const content = JSON.stringify({
      cards: [{ uuid: 'card-1', content: 'restored' }],
    });
    const { plugin, files } = createMemoryPlugin({
      [conflictPath]: content,
    });
    const service = new DataManagementService(plugin);

    const result = await (service as any).fixSyncConflictFiles();

    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(files.get(`${v2Paths.memory.cards}/default.json`)).toBe(content);
    expect(files.has(conflictPath)).toBe(false);
  });

  it('archives unmergeable sync conflicts instead of deleting them', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({
      vault: { configDir: '.obsidian' },
    } as any);
    const originalPath = `${v2Paths.ir.root}/sources.json`;
    const conflictPath = `${v2Paths.ir.root}/sources 2.json`;
    const originalContent = '{"sources":[{"id":"current"}]}';
    const conflictContent = '{"sources":[{"id":"conflict"}]}';
    const { plugin, files } = createMemoryPlugin({
      [originalPath]: originalContent,
      [conflictPath]: conflictContent,
    });
    const service = new DataManagementService(plugin);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T00:00:00.000Z'));

    const result = await (service as any).fixSyncConflictFiles();
    const expectedArchivePath =
      `${pluginPaths.backups}/sync-conflicts/2026-03-24T00-00-00-000Z/` +
      `${conflictPath.replace(/[\\/:]/g, '__')}`;

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.error).toContain(expectedArchivePath);
    expect(files.get(originalPath)).toBe(originalContent);
    expect(files.get(expectedArchivePath)).toBe(conflictContent);
    expect(files.has(conflictPath)).toBe(false);
  });

  it('imports migration conflicts through dataStorage.saveCardsBatch and marks the deck index for rebuild', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const importedAt = '2026-03-30T00:00:00.000Z';
    const importedDeck = {
      id: 'deck-import',
      name: 'Imported Deck',
      description: '',
      category: '',
      path: 'Imported Deck',
      level: 0,
      order: 0,
      inheritSettings: false,
      created: importedAt,
      modified: importedAt,
      includeSubdecks: false,
      stats: {
        totalCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        todayNew: 0,
        todayReview: 0,
        todayTime: 0,
        totalReviews: 0,
        totalTime: 0,
        memoryRate: 0,
        averageEase: 0,
        forecastDays: {},
      },
      tags: [],
      metadata: {},
      cardUUIDs: ['card-1'],
    };

    const { plugin, files } = createMemoryPlugin({
      [`${conflictDir}/weave_memory_decks.json-1`]: JSON.stringify({ decks: [importedDeck] }),
      [`${conflictDir}/weave_memory_cards_default.json-1`]: JSON.stringify({
        cards: [
          {
            uuid: 'card-1',
            content: 'Imported content',
            deckId: 'deck-import',
          },
        ],
      }),
    });
    const saveCardsBatch = vi.fn().mockResolvedValue(undefined);
    const fallbackSaveCardsBatch = vi.fn().mockResolvedValue(true);
    const markFullRebuildRequired = vi.fn().mockResolvedValue(undefined);
    plugin.dataStorage.saveCardsBatch = saveCardsBatch;
    plugin.cardFileService.saveCardsBatch = fallbackSaveCardsBatch;
    plugin.deckMembershipIndexService = { markFullRebuildRequired };

    const service = new DataManagementService(plugin);

    const result = await (service as any).importMigrationConflicts(v2Paths);

    expect(result.importedCards).toBe(1);
    expect(result.importedDecks).toBe(1);
    expect(saveCardsBatch).toHaveBeenCalledTimes(1);
    expect(fallbackSaveCardsBatch).not.toHaveBeenCalled();
    expect(markFullRebuildRequired).toHaveBeenCalledTimes(1);
    expect(saveCardsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        uuid: 'card-1',
        deckId: 'deck-import',
        content: expect.stringContaining('Imported Deck'),
      }),
    ]);
    expect(files.has(`${conflictDir}/weave_memory_decks.json-1`)).toBe(false);
    expect(files.has(`${conflictDir}/weave_memory_cards_default.json-1`)).toBe(false);
  });

  it('keeps non-memory migration conflict files when importing legacy memory conflicts', async () => {
    const v2Paths = getV2Paths('');
    const conflictDir = `${v2Paths.root}/_migration_conflicts`;
    const monitoringConflictPath =
      `${conflictDir}/weave_incremental-reading_monitoring.json-1775964650413`;
    const importedDeck = {
      id: 'deck-import',
      name: 'Imported Deck',
      description: '',
      category: '',
      path: 'Imported Deck',
      level: 0,
      order: 0,
      inheritSettings: false,
      created: '2026-03-30T00:00:00.000Z',
      modified: '2026-03-30T00:00:00.000Z',
      includeSubdecks: false,
      stats: {
        totalCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        todayNew: 0,
        todayReview: 0,
        todayTime: 0,
        totalReviews: 0,
        totalTime: 0,
        memoryRate: 0,
        averageEase: 0,
        forecastDays: {},
      },
      tags: [],
      metadata: {},
      cardUUIDs: ['card-1'],
    };

    const { plugin, files } = createMemoryPlugin({
      [`${conflictDir}/weave_memory_decks.json-1`]: JSON.stringify({ decks: [importedDeck] }),
      [`${conflictDir}/weave_memory_cards_default.json-1`]: JSON.stringify({
        cards: [
          {
            uuid: 'card-1',
            content: 'Imported content',
            deckId: 'deck-import',
          },
        ],
      }),
      [monitoringConflictPath]: JSON.stringify({
        version: '3.0.0',
        dailyStats: [{ date: '2026-04-16', dueCount: 2 }],
        priorityChanges: [],
        groupParamChanges: [],
        decisionEvents: [],
        decisionOutcomes: [],
        lastUpdated: '2026-04-16T09:00:00.000Z',
      }),
    });
    plugin.dataStorage.saveCardsBatch = vi.fn().mockResolvedValue(undefined);
    plugin.deckMembershipIndexService = { markFullRebuildRequired: vi.fn().mockResolvedValue(undefined) };
    const service = new DataManagementService(plugin);

    await (service as any).importMigrationConflicts(v2Paths);

    expect(files.has(`${conflictDir}/weave_memory_decks.json-1`)).toBe(false);
    expect(files.has(`${conflictDir}/weave_memory_cards_default.json-1`)).toBe(false);
    expect(files.has(monitoringConflictPath)).toBe(true);
  });

  it('detects cards that still use legacy epub source link formats', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        content: '[[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|Old]]',
      },
      {
        uuid: 'card-2',
        content: '[[Books/demo.epub#weave-cfi=readium:xyz|demo]]',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.check('epub_source_link_migration');

    expect(result).toMatchObject({
      type: 'epub_source_link_migration',
      status: 'warning',
      count: 1,
      items: ['card-1'],
    });
  });

  it('migrates legacy epub source links to the new cfi-only format', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        content:
          '鍓嶆枃 [[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|Old]] 鍚庢枃',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.fix('epub_source_link_migration');

    expect(result).toEqual({
      type: 'epub_source_link_migration',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(plugin.dataStorage.saveCard).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'card-1',
        content: '鍓嶆枃 [[Books/demo.epub#weave-cfi=readium:abc|demo]] 鍚庢枃',
        modified: expect.any(String),
      })
    );
  });

  it('detects memory decks that can be migrated to .wdeck files', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-1',
        name: '寰幆绯荤粺',
        purpose: 'memory',
        cardUUIDs: ['card-1'],
      },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-1',
        content: '心脏的作用',
        created: '2026-04-14T00:00:00.000Z',
        modified: '2026-04-14T00:00:00.000Z',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.checkWDeckMigration();

    expect(result).toMatchObject({
      type: 'wdeck_migration',
      status: 'warning',
      count: 1,
    });
    expect(result.items[0]).toContain('寰幆绯荤粺_01.wdeck');
  });

  it('exports memory decks to .wdeck files', async () => {
    const { plugin, files } = createMemoryPlugin({
      'weave/memory/decks.json': JSON.stringify({
        decks: [
          {
            id: 'deck-1',
            name: '寰幆绯荤粺',
            purpose: 'memory',
            metadata: {},
          },
        ],
      }),
    });
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-1',
        name: '寰幆绯荤粺',
        purpose: 'memory',
        cardUUIDs: ['card-1'],
      },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-1',
        content: '心脏的作用',
        created: '2026-04-14T00:00:00.000Z',
        modified: '2026-04-14T00:00:00.000Z',
        customFields: {
          wdeck: {
            runtimeDeckId: 'wdeck:deck-1',
          },
          tag: 'keep',
        },
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.executeWDeckMigration({ confirmed: true });
    const outputPath = Array.from(files.keys()).find((path) => path.endsWith('.wdeck'));

    expect(result).toEqual({
      type: 'wdeck_migration',
      success: 1,
      failed: 0,
      errors: [],
    });
    expect(outputPath).toBe('weave/memory/deck-files/寰幆绯荤粺_01.wdeck');

    const parsed = JSON.parse(files.get(outputPath!) || '{}');
    expect(parsed).toMatchObject({
      fileType: 'wdeck',
      logicalDeckId: 'deck-1',
      logicalDeckName: '寰幆绯荤粺',
      segmentIndex: 1,
      segmentLabel: '01',
      segmentId: '寰幆绯荤粺_01',
    });
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]).toMatchObject({
      uuid: 'card-1',
      content: '心脏的作用',
      customFields: {
        tag: 'keep',
      },
    });
    expect(parsed.cards[0].customFields.wdeck).toBeUndefined();

    const decksData = JSON.parse(files.get('weave/memory/decks.json') || '{}');
    expect(decksData.decks[0].metadata.wdeckMigration).toMatchObject({
      status: 'migrated',
      logicalDeckId: 'deck-1',
      filePath: 'weave/memory/deck-files/寰幆绯荤粺_01.wdeck',
    });
  });
  it('moves orphan legacy cards into 未归组卡片_01.wdeck and removes old JSON residues', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [`${v2Paths.memory.cards}/default.json`]: JSON.stringify({
        cards: [{ uuid: 'orphan-card', content: 'orphan' }],
      }),
      [`${v2Paths.memory.cards}/card-files-index.json`]: JSON.stringify({ files: [] }),
      [`${v2Paths.memory.deckCards}/deck-1.json`]: JSON.stringify({ cardUUIDs: ['card-1'] }),
    });
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-1',
        name: '正常牌组',
        purpose: 'memory',
        cardUUIDs: ['card-1'],
      },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-1',
        content: 'in deck',
      },
      {
        uuid: 'orphan-card',
        content: 'orphan',
      },
    ]);

    const service = new DataManagementService(plugin);
    const result = await service.executeWDeckMigration({ confirmed: true });

    expect(result.success).toBe(2);
    expect(files.has('weave/memory/deck-files/未归组卡片_01.wdeck')).toBe(true);
    expect(files.has(`${v2Paths.memory.cards}/default.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.cards}/card-files-index.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.deckCards}/deck-1.json`)).toBe(false);

    const orphanDeck = JSON.parse(files.get('weave/memory/deck-files/未归组卡片_01.wdeck') || '{}');
    expect(orphanDeck.cards).toEqual(
      expect.arrayContaining([expect.objectContaining({ uuid: 'orphan-card', content: 'orphan' })])
    );
  });

  it('cleans legacy memory JSON residues after verifying all legacy cards are already covered by .wdeck', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [`${v2Paths.memory.cards}/cards-0.json`]: JSON.stringify({
        cards: [{ uuid: 'card-1', content: 'covered' }],
      }),
      [`${v2Paths.memory.cards}/card-files-index.json`]: JSON.stringify({ files: [] }),
      [`${v2Paths.memory.deckCards}/deck-1.json`]: JSON.stringify({ cardUUIDs: ['card-1'] }),
      [`${v2Paths.memory.root}/deck-files/已迁移_01.wdeck`]: JSON.stringify({
        fileType: 'wdeck',
        logicalDeckId: '已迁移',
        logicalDeckName: '已迁移',
        segmentIndex: 1,
        cards: [{ uuid: 'card-1', content: 'covered' }],
      }),
    });
    const service = new DataManagementService(plugin);

    const result = await service.fix('legacy_memory_files', { allowHighRisk: true });

    expect(result).toEqual({
      type: 'legacy_memory_files',
      success: 3,
      failed: 0,
      errors: [],
    });
    expect(files.has(`${v2Paths.memory.cards}/cards-0.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.cards}/card-files-index.json`)).toBe(false);
    expect(files.has(`${v2Paths.memory.deckCards}/deck-1.json`)).toBe(false);
    await expect(plugin.app.vault.adapter.exists(v2Paths.memory.cards)).resolves.toBe(false);
    await expect(plugin.app.vault.adapter.exists(v2Paths.memory.deckCards)).resolves.toBe(false);
    expect(plugin.cardFileService).toBeUndefined();
  });

  it('does not treat runtime deck relation fields as deprecated persisted fields', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-1',
        referencedByDecks: ['deck-1'],
        content: 'runtime-only relation fields',
        created: '2026-04-14T00:00:00.000Z',
        modified: '2026-04-14T00:00:00.000Z',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.check('deprecated_fields');

    expect(result).toMatchObject({
      type: 'deprecated_fields',
      status: 'ok',
      count: 0,
    });
  });

  it('removes empty invalid .wdeck files during wdeck conflict repair', async () => {
    const v2Paths = getV2Paths('');
    const invalidPath = `${v2Paths.memory.root}/deck-files/坏文件_01.wdeck`;
    const { plugin, files } = createMemoryPlugin({
      [invalidPath]: '',
    });
    let scanCount = 0;
    plugin.wdeckService = {
      getConflictReport: vi.fn(async () => {
        scanCount += 1;
        return scanCount === 1
          ? {
              scannedFiles: 1,
              issues: [
                {
                  type: 'invalid_file',
                  message: `无法解析 .wdeck 文件: ${invalidPath}`,
                  filePaths: [invalidPath],
                },
              ],
            }
          : {
              scannedFiles: 0,
              issues: [],
            };
      }),
    };
    const service = new DataManagementService(plugin);

    const result = await service.fix('wdeck_conflicts');

    expect(result.type).toBe('wdeck_conflicts');
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(files.has(invalidPath)).toBe(false);
  });

  it('fixes .wdeck uuid_conflict issues by rewriting cards into their canonical formal deck or ungrouped file', async () => {
    const { plugin } = createMemoryPlugin();
    const saveCardsToDeck = vi.fn(async () => []);
    let conflictScan = 0;
    plugin.wdeckService = {
      getConflictReport: vi.fn(async () => {
        conflictScan += 1;
        return conflictScan === 1
          ? {
              scannedFiles: 2,
              issues: [
                {
                  type: 'uuid_conflict',
                  cardUUID: 'card-formal',
                  message: '卡片 UUID card-formal 同时存在于多个 .wdeck 文件中。',
                  filePaths: ['formal.wdeck', '未归组卡片_01.wdeck'],
                },
                {
                  type: 'uuid_conflict',
                  cardUUID: 'card-ungrouped',
                  message: '卡片 UUID card-ungrouped 同时存在于多个 .wdeck 文件中。',
                  filePaths: ['other.wdeck', '未归组卡片_01.wdeck'],
                },
              ],
            }
          : {
              scannedFiles: 2,
              issues: [],
            };
      }),
      saveCardsToDeck,
    };
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-formal',
        content: '---\nwe_decks:\n  - 正式牌组\n---\nA',
      },
      {
        uuid: 'card-ungrouped',
        content: '---\n---\nB',
      },
    ]);
    plugin.dataStorage.getDecks.mockResolvedValue([
      {
        id: 'deck-formal',
        name: '正式牌组',
        purpose: 'memory',
      },
    ]);
    const service = new DataManagementService(plugin);

    const result = await service.fix('wdeck_conflicts');

    expect(result.type).toBe('wdeck_conflicts');
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(saveCardsToDeck).toHaveBeenCalledTimes(2);
    expect(saveCardsToDeck).toHaveBeenCalledWith(
      { id: 'deck-formal', name: '正式牌组' },
      [expect.objectContaining({ uuid: 'card-formal' })]
    );
    expect(saveCardsToDeck).toHaveBeenCalledWith(
      { id: '未归组卡片', name: '未归组卡片' },
      [expect.objectContaining({ uuid: 'card-ungrouped' })]
    );
  });

  it('detects and fixes cards that still belong to multiple formal memory decks', async () => {
    const { plugin } = createMemoryPlugin();
    plugin.dataStorage.getDecks.mockResolvedValue([
      { id: 'deck-a', name: '牌组A', purpose: 'memory' },
      { id: 'deck-b', name: '牌组B', purpose: 'memory' },
    ]);
    plugin.dataStorage.getCards.mockResolvedValue([
      {
        uuid: 'card-1',
        deckId: 'deck-b',
        referencedByDecks: ['deck-b', 'deck-a'],
        content: '---\nwe_decks:\n  - 牌组A\n  - 牌组B\n---\n内容',
        created: '2026-04-14T00:00:00.000Z',
        modified: '2026-04-14T00:00:00.000Z',
      },
    ]);
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('memory_single_membership');
    const fixResult = await service.fix('memory_single_membership');

    expect(checkResult).toMatchObject({
      type: 'memory_single_membership',
      status: 'warning',
      count: 1,
      items: ['card-1'],
    });
    expect(fixResult).toEqual({
      type: 'memory_single_membership',
      success: 1,
      failed: 0,
      errors: [],
    });

    const savedCard = plugin.dataStorage.saveCard.mock.calls[0][0];
    const yaml = parseYAMLFromContent(savedCard.content);
    expect(yaml.we_decks).toEqual(['牌组A']);
    expect(savedCard.deckId).toBe('deck-a');
    expect(savedCard.referencedByDecks).toEqual(['deck-a']);
  });

  it('keeps file-based checks lazy and does not trigger full card/deck reads', async () => {
    const v2Paths = getV2Paths('');
    const { plugin } = createMemoryPlugin({
      [`${v2Paths.memory.cards}/cards-0.json`]: JSON.stringify({ cards: [] }),
    });
    plugin.wdeckService = {
      getConflictReport: vi.fn().mockResolvedValue({ scannedFiles: 0, issues: [] }),
      getCacheStatus: vi.fn().mockResolvedValue({ needsRebuild: false, fileCount: 0, issueCount: 0 }),
    };
    const service = new DataManagementService(plugin);

    await service.check('legacy_memory_files');
    await service.check('wdeck_conflicts');
    await service.check('wdeck_cache');

    expect(plugin.dataStorage.getCards).not.toHaveBeenCalled();
    expect(plugin.dataStorage.getDecks).not.toHaveBeenCalled();
  });

  it('detects and executes IR point storage migration through data management', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, files } = createMemoryPlugin({
      [v2Paths.ir.topics]: JSON.stringify({
        topics: {
          'topic-1': { name: 'Topic One' },
        },
      }),
      [v2Paths.ir.pdfBookmarkTasks]: JSON.stringify({
        version: 1,
        tasks: {
          'pdfbm-1': {
            id: 'pdfbm-1',
            topicId: 'topic-1',
            pdfPath: 'Docs/Test.pdf',
            title: 'Selection 1',
            link: 'obsidian://pdf',
            status: 'new',
          },
        },
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_point_storage_migration');
    const fixResult = await service.fix('ir_point_storage_migration', { allowHighRisk: true });

    expect(checkResult).toMatchObject({
      type: 'ir_point_storage_migration',
      status: 'warning',
      count: 1,
    });
    expect(fixResult.type).toBe('ir_point_storage_migration');
    expect(fixResult.failed).toBe(0);
    expect(fixResult.success).toBeGreaterThan(0);
    expect(files.has(`${v2Paths.ir.root}/points/Topic One.points-001.json`)).toBe(true);
  });

  it('detects and relocates legacy reader state through data management', async () => {
    const v2Paths = getV2Paths('');
    const pluginPaths = getPluginPaths({ vault: { configDir: '.obsidian' } } as any);
    const { plugin, files } = createMemoryPlugin({
      [`${v2Paths.ir.epub}/book-1/state.json`]: JSON.stringify({
        currentPosition: { chapterIndex: 1, cfi: '/6/6', percent: 42 },
      }),
      [`${v2Paths.ir.epub}/reader-settings.desktop.json`]: JSON.stringify({
        lineHeight: 1.8,
        theme: 'default',
        widthMode: 'standard',
        layoutMode: 'paginated',
        flowMode: 'paginated',
        showScrolledSideNav: true,
      }),
    });
    const service = new DataManagementService(plugin);

    const checkResult = await service.check('ir_local_state_relocation');
    const fixResult = await service.fix('ir_local_state_relocation');

    expect(checkResult).toMatchObject({
      type: 'ir_local_state_relocation',
      status: 'warning',
      count: 2,
    });
    expect(fixResult).toMatchObject({
      type: 'ir_local_state_relocation',
      failed: 0,
      success: 2,
    });
    expect(
      files.has(`${pluginPaths.state.incrementalReading.readerState}/epub/book-1/state.json`)
    ).toBe(true);
    expect(
      files.has(`${pluginPaths.state.incrementalReading.readerState}/epub/reader-settings.desktop.json`)
    ).toBe(true);
  });
});

