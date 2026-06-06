import { LEGACY_PATHS } from '../../config/paths';
import type { Deck } from '../../data/types';
import { ReferenceMigrationService } from '../reference-deck/ReferenceMigrationService';
import { getCardMetadata } from '../../utils/yaml-utils';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function createMemoryPlugin(initialFiles: Record<string, string> = {}) {
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

  const adapter = {
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
  };

  const plugin = {
    app: {
      vault: {
        configDir: '.obsidian',
        adapter,
      },
    },
    settings: {
      weaveParentFolder: '',
      incrementalReading: {},
    },
    dataStorage: {
      getDecks: vi.fn(),
      saveDeck: vi.fn(),
      saveCardsBatch: vi.fn(),
    },
  } as any;

  return {
    plugin,
    files,
  };
}

describe('ReferenceMigrationService', () => {
  it('migrates legacy deck cards into YAML we_decks and removes legacy deckId', async () => {
    const migratedAt = '2026-03-30T00:00:00.000Z';
    const deck: Deck = {
      id: 'deck-import',
      name: 'Imported Deck',
      description: '',
      category: '',
      cardUUIDs: [],
      path: 'Imported Deck',
      level: 0,
      order: 0,
      inheritSettings: false,
      created: migratedAt,
      modified: migratedAt,
      includeSubdecks: false,
      settings: {
        newCardsPerDay: 20,
        maxReviewsPerDay: 100,
        enableAutoAdvance: true,
        showAnswerTime: 0,
        fsrsParams: {
          w: [
            0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
            0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912,
            0.0658, 0.1542
          ],
          requestRetention: 0.9,
          maximumInterval: 36500,
          enableFuzz: true,
        },
        learningSteps: [1, 10],
        relearningSteps: [10],
        graduatingInterval: 1,
        easyInterval: 4,
      },
      stats: {
        totalCards: 0,
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
    };

    const legacyCardsPath = `${LEGACY_PATHS.decks}/${deck.id}/cards.json`;
    const { plugin, files } = createMemoryPlugin({
      [legacyCardsPath]: JSON.stringify({
        cards: [
          {
            uuid: 'card-1',
            content: 'Imported content',
            deckId: deck.id,
          },
        ],
      }),
    });

    plugin.dataStorage.getDecks.mockResolvedValue([deck]);
    plugin.dataStorage.saveDeck.mockResolvedValue({
      success: true,
      timestamp: migratedAt,
    });
    plugin.dataStorage.saveCardsBatch.mockResolvedValue(undefined);

    const service = new ReferenceMigrationService(plugin);
    const result = await service.migrate({
      createBackup: false,
      validate: false,
    });

    expect(result.success).toBe(true);
    expect(result.migratedCards).toBe(1);
    expect(result.migratedDecks).toBe(1);
    expect(plugin.dataStorage.saveCardsBatch).toHaveBeenCalledTimes(1);
    expect(plugin.dataStorage.saveDeck).toHaveBeenCalledTimes(1);

    const savedCards = plugin.dataStorage.saveCardsBatch.mock.calls[0][0];
    expect(savedCards).toHaveLength(1);
    expect(savedCards[0]).toEqual(expect.objectContaining({
      uuid: 'card-1',
    }));
    expect(savedCards[0].deckId).toBeUndefined();
    expect(savedCards[0].referencedByDecks).toBeUndefined();
    expect(getCardMetadata(savedCards[0].content).we_decks).toEqual([deck.name]);

    expect(plugin.dataStorage.saveDeck).toHaveBeenCalledWith(expect.objectContaining({
      id: deck.id,
      cardUUIDs: ['card-1'],
    }));

    const cleanedLegacyFile = JSON.parse(files.get(normalizeTestPath(legacyCardsPath)) || '{}');
    expect(cleanedLegacyFile).toMatchObject({
      _migrated: true,
      cards: [],
    });
  });
});
