const { processBatchMock, processNewCardMock, processContentChangeMock } = vi.hoisted(() => ({
  processBatchMock: vi.fn(async (cards: any[]) => cards),
  processNewCardMock: vi.fn(async (card: any) => ({ converted: false, cards: [card] })),
  processContentChangeMock: vi.fn()
}));

vi.mock('obsidian', () => ({
  Notice: class Notice {},
  TFile: class TFile {
    path: string;
    stat?: { mtime: number };

    constructor(path = '', mtime?: number) {
      this.path = path;
      if (mtime !== undefined) {
        this.stat = { mtime };
      }
    }
  }
}));

vi.mock('../../services/progressive-cloze/ProgressiveClozeGateway', () => ({
  getProgressiveClozeGateway: () => ({
    processNewCard: processNewCardMock,
    processContentChange: processContentChangeMock,
    processBatch: processBatchMock
  })
}));

import { WeaveDataStorage } from '../storage';
import { TFile } from 'obsidian';
import { MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE } from '../../services/DataSyncService';
import { parseYAMLFromContent } from '../../utils/yaml-utils';

function createMockTFile(path: string, mtime?: number): TFile {
  return Object.assign(new TFile(), {
    path,
    stat: mtime === undefined ? undefined : { mtime }
  }) as TFile;
}

describe('WeaveDataStorage deck query', () => {
  it('rejects duplicate deck names when saving a different deck id', async () => {
    const plugin = {
      settings: {},
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      {
        id: 'deck-existing',
        name: '重复牌组',
        description: '',
        category: '默认',
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any
    ]);
    const writeDecksFileSpy = vi.spyOn(storage as any, 'writeDecksFile').mockResolvedValue(undefined);

    const result = await storage.saveDeck({
      id: 'deck-new',
      name: '  重复牌组  ',
      description: '',
      category: '默认',
      tags: [],
      metadata: {},
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z'
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('牌组名称「重复牌组」已存在');
    expect(writeDecksFileSpy).not.toHaveBeenCalled();
  });

  it('saves memory decks directly into .wdeck definitions without writing legacy deck JSON', async () => {
    const saveDeckDefinition = vi.fn(async (deck: any) => ({
      runtimeDeckId: 'wdeck:deck-1',
      logicalDeckId: 'deck-1',
      logicalDeckName: deck.name,
      files: [{ path: 'vault/study/renamed-deck_01.wdeck' }],
      segmentIndices: [1],
      cards: [],
      deck: {
        id: 'deck-1',
        name: deck.name,
        category: deck.category,
        tags: deck.tags,
        created: deck.created,
        modified: deck.modified,
        metadata: {}
      }
    }));
    const plugin = {
      settings: {},
      wdeckService: {
        getAllDeckAggregates: vi.fn(async () => []),
        getDeckAggregateByAnyDeckId: vi.fn(async () => null),
        saveDeckDefinition
      },
      app: {
        vault: {
          adapter: {
            exists: vi.fn(async () => false),
            read: vi.fn(async () => {
              throw new Error('missing');
            }),
            write: vi.fn(async () => undefined),
            mkdir: vi.fn(async () => undefined)
          },
          configDir: '.obsidian',
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const writeDecksFileSpy = vi.spyOn(storage as any, 'writeDecksFile').mockResolvedValue(undefined);

    const result = await storage.saveDeck({
      id: 'deck-1',
      name: 'Renamed Deck',
      description: '',
      category: 'memory',
      cardUUIDs: [],
      tags: [],
      metadata: {},
      created: '2026-04-15T00:00:00.000Z',
      modified: '2026-04-15T00:00:00.000Z'
    } as any);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: 'wdeck:deck-1',
      name: 'Renamed Deck',
      metadata: expect.objectContaining({
        fileType: 'wdeck',
        logicalDeckId: 'deck-1'
      })
    });
    expect(saveDeckDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'deck-1',
        name: 'Renamed Deck',
        purpose: 'memory'
      })
    );
    expect(writeDecksFileSpy).not.toHaveBeenCalled();
  });

  it('skips deck stats persistence when persisted values are unchanged', async () => {
    const plugin = {
      settings: {},
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      {
        id: 'deck-1',
        name: 'Deck 1',
        description: '',
        category: '默认',
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: {
          totalCards: 10,
          newCards: 2,
          learningCards: 3,
          reviewCards: 5,
          memoryRate: 0.75
        }
      } as any
    ]);
    const saveDeckSpy = vi.spyOn(storage, 'saveDeck').mockResolvedValue({
      success: true,
      data: null,
      timestamp: '2026-03-15T00:00:00.000Z'
    } as any);

    await storage.persistAllDeckStats({
      'deck-1': {
        totalCards: 10,
        newCards: 2,
        learningCards: 3,
        reviewCards: 5,
        memoryRate: 0.75
      }
    });

    expect(saveDeckSpy).not.toHaveBeenCalled();
  });

  it('suppresses deck notifications while persisting changed deck stats', async () => {
    const previousDataChangeContext = {
      source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
      deckIds: ['deck-origin']
    };
    const plugin = {
      settings: {},
      __weaveDataChangeContext: previousDataChangeContext,
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      {
        id: 'deck-1',
        name: 'Deck 1',
        description: '',
        category: '默认',
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: {
          totalCards: 10,
          newCards: 2,
          learningCards: 3,
          reviewCards: 5,
          memoryRate: 0.75
        }
      } as any,
      {
        id: 'deck-2',
        name: 'Deck 2',
        description: '',
        category: '默认',
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: {
          totalCards: 4,
          newCards: 1,
          learningCards: 1,
          reviewCards: 2,
          memoryRate: 0.5
        }
      } as any
    ]);

    const seenDataChangeContexts: any[] = [];
    const saveDeckSpy = vi.spyOn(storage, 'saveDeck').mockImplementation(async (deck: any) => {
      seenDataChangeContexts.push((plugin as any).__weaveDataChangeContext);
      return {
        success: true,
        data: deck,
        timestamp: '2026-03-15T00:00:00.000Z'
      } as any;
    });

    await storage.persistAllDeckStats({
      'deck-1': {
        totalCards: 10,
        newCards: 2,
        learningCards: 3,
        reviewCards: 5,
        memoryRate: 0.75
      },
      'deck-2': {
        totalCards: 6,
        reviewCards: 4,
        memoryRate: 0.66
      }
    });

    expect(saveDeckSpy).toHaveBeenCalledTimes(1);
    expect(saveDeckSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'deck-2',
        stats: expect.objectContaining({
          totalCards: 6,
          newCards: 1,
          learningCards: 1,
          reviewCards: 4,
          memoryRate: 0.66
        })
      })
    );
    expect(seenDataChangeContexts).toEqual([
      expect.objectContaining({
        source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
        suppressDeckNotifications: true,
        deckIds: ['deck-2']
      })
    ]);
    expect((plugin as any).__weaveDataChangeContext).toBe(previousDataChangeContext);
  });

  it('returns YAML-linked deck cards when querying by deckId', async () => {
    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-1',
            content: '---\nwe_decks:\n  - 引用式牌组\nwe_source: [[notes/source-one]]\n---\nA',
            tags: ['alpha'],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          },
          {
            uuid: 'card-2',
            content: '---\nwe_decks:\n  - 引用式牌组\nwe_source: [[notes/source-two]]\n---\nB',
            tags: ['beta'],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ])
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      {
        id: 'deck-uuid-ref',
        name: '引用式牌组'
      } as any
    ]);
    vi.spyOn(storage, 'getDeck').mockResolvedValue({
      id: 'deck-uuid-ref',
      name: '引用式牌组',
      description: '',
      category: '',
      cardUUIDs: ['card-1', 'card-2'],
      tags: [],
      metadata: {},
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z'
    } as any);

    const cards = await storage.getCards({ deckId: 'deck-uuid-ref' });

    expect(cards.map(card => card.uuid)).toEqual(['card-1', 'card-2']);
    expect(cards.every(card => card.sourceFile?.startsWith('notes/source-'))).toBe(true);
  });

  it('uses card content as the source of truth when deck UUID index conflicts with YAML', async () => {
    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-stale',
            content: '---\nwe_source: [[notes/source-stale]]\n---\nA',
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          },
          {
            uuid: 'card-other',
            content: '---\nwe_decks:\n  - 其他牌组\nwe_source: [[notes/source-other]]\n---\nB',
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          },
          {
            uuid: 'card-yaml',
            content: '---\nwe_decks:\n  - 目标牌组\nwe_source: [[notes/source-yaml]]\n---\nC',
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ])
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      { id: 'deck-target', name: '目标牌组' } as any,
      { id: 'deck-other', name: '其他牌组' } as any
    ]);
    vi.spyOn(storage, 'getDeck').mockResolvedValue({
      id: 'deck-target',
      name: '目标牌组',
      description: '',
      category: '',
      cardUUIDs: ['card-stale', 'card-other'],
      tags: [],
      metadata: {},
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z'
    } as any);

    const cards = await storage.getCards({ deckId: 'deck-target' });

    expect(cards.map(card => card.uuid)).toEqual(['card-yaml']);
  });

  it('prefers plugin cache deck membership index before scanning all cards', async () => {
    const indexService = {
      getDeckState: vi.fn(async () => ({
        hasSnapshot: true,
        initialized: true,
        fullRebuildRequired: false,
        isDeckDirty: false,
        cardUUIDs: ['card-1', 'card-2']
      })),
      markDecksDirty: vi.fn(),
      rebuildFromCards: vi.fn(),
      updateCards: vi.fn(),
      removeCards: vi.fn(),
      removeDeck: vi.fn(),
      markFullRebuildRequired: vi.fn()
    };

    const plugin = {
      settings: {},
      deckMembershipIndexService: indexService,
      cardFileService: {
        getAllCards: vi.fn(async () => {
          throw new Error('should not scan all cards');
        }),
        getCardsByUUIDsBatch: vi.fn(async () => ({
          found: [
            {
              uuid: 'card-1',
              content: '---\nwe_decks:\n  - 目标牌组\n---\nA',
              tags: [],
              created: '2026-03-15T00:00:00.000Z',
              modified: '2026-03-15T00:00:00.000Z',
              stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
            },
            {
              uuid: 'card-2',
              content: '---\nwe_decks:\n  - 目标牌组\n---\nB',
              tags: [],
              created: '2026-03-15T00:00:00.000Z',
              modified: '2026-03-15T00:00:00.000Z',
              stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
            }
          ],
          notFound: []
        }))
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      { id: 'deck-target', name: '目标牌组' } as any
    ]);

    const cards = await storage.getCards({ deckId: 'deck-target' });

    expect(cards.map(card => card.uuid)).toEqual(['card-1', 'card-2']);
    expect(plugin.cardFileService.getCardsByUUIDsBatch).toHaveBeenCalledWith(['card-1', 'card-2']);
    expect(plugin.cardFileService.getAllCards).not.toHaveBeenCalled();
    expect(indexService.rebuildFromCards).not.toHaveBeenCalled();
  });

  it('rebuilds the plugin cache deck membership index when cached UUIDs conflict with YAML truth', async () => {
    const indexService = {
      getDeckState: vi.fn(async () => ({
        hasSnapshot: true,
        initialized: true,
        fullRebuildRequired: false,
        isDeckDirty: false,
        cardUUIDs: ['card-stale', 'card-yaml']
      })),
      markDecksDirty: vi.fn(),
      rebuildFromCards: vi.fn(async () => undefined),
      updateCards: vi.fn(),
      removeCards: vi.fn(),
      removeDeck: vi.fn(),
      markFullRebuildRequired: vi.fn()
    };

    const allCards = [
      {
        uuid: 'card-stale',
        content: '---\nwe_source: [[notes/source-stale]]\n---\nA',
        tags: [],
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
      },
      {
        uuid: 'card-yaml',
        content: '---\nwe_decks:\n  - 目标牌组\nwe_source: [[notes/source-yaml]]\n---\nB',
        tags: [],
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
      }
    ];

    const plugin = {
      settings: {},
      deckMembershipIndexService: indexService,
      cardFileService: {
        getAllCards: vi.fn(async () => allCards),
        getCardsByUUIDsBatch: vi.fn(async () => ({
          found: allCards,
          notFound: []
        }))
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      { id: 'deck-target', name: '目标牌组' } as any
    ]);

    const cards = await storage.getCards({ deckId: 'deck-target' });

    expect(cards.map(card => card.uuid)).toEqual(['card-yaml']);
    expect(indexService.markDecksDirty).toHaveBeenCalledWith(['deck-target']);
    expect(plugin.cardFileService.getAllCards).toHaveBeenCalledTimes(1);
    expect(indexService.rebuildFromCards).toHaveBeenCalledWith(
      [
        expect.objectContaining({ uuid: 'card-stale' }),
        expect.objectContaining({ uuid: 'card-yaml' })
      ],
      [{ id: 'deck-target', name: '目标牌组' }]
    );
  });

  it('updates traced source paths after a source file rename', async () => {
    processBatchMock.mockClear();

    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-1',
            content: '---\nwe_source: ![[notes/source.md#^block-1]]\n---\nA',
            tags: ['alpha'],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          },
          {
            uuid: 'card-2',
            content: '---\nwe_source: [[notes/other.md]]\n---\nB',
            tags: ['beta'],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ]),
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const updated = await storage.updateSourceFileReferences('notes/source.md', 'archive/source.md');

    expect(updated).toEqual({
      updatedCards: 1,
      updatedLinks: 1,
      affectedSourceFiles: 1
    });
    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledTimes(1);
    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        uuid: 'card-1',
        sourceFile: 'archive/source.md',
        content: expect.stringContaining('![[archive/source.md#^block-1]]')
      })
    ]);
  });

  it('updates traced source paths when an entire folder path changes', async () => {
    processBatchMock.mockClear();

    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-1',
            content: '---\nwe_source: [[notes/topic/one.md]]\n---\nA',
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          },
          {
            uuid: 'card-2',
            content: '---\nwe_source: ![[notes/topic/sub/two.md#^b2]]\n---\nB',
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ]),
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const updated = await storage.updateSourceFileReferences('notes/topic', 'archive/topic');

    expect(updated).toEqual({
      updatedCards: 2,
      updatedLinks: 2,
      affectedSourceFiles: 2
    });
    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        uuid: 'card-1',
        sourceFile: 'archive/topic/one.md',
        content: expect.stringContaining('[[archive/topic/one.md]]')
      }),
      expect.objectContaining({
        uuid: 'card-2',
        sourceFile: 'archive/topic/sub/two.md',
        content: expect.stringContaining('![[archive/topic/sub/two.md#^b2]]')
      })
    ]);
  });

  it('refreshes source existence and modified time for existing source files', async () => {
    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-1',
            content: '---\nwe_source: [[notes/source.md]]\n---\nA',
            sourceExists: false,
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ]),
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: (path: string) => path === 'notes/source.md' ? createMockTFile('notes/source.md', 123456) : null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const result = await storage.refreshSourceFileStatuses();

    expect(result).toEqual({ updated: 1, missing: 0 });
    expect(plugin.cardFileService.saveCardsBatch).not.toHaveBeenCalled();
  });

  it('marks cards as missing when the source file no longer exists', async () => {
    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-1',
            content: '---\nwe_source: [[notes/missing.md]]\n---\nA',
            sourceExists: true,
            sourceFileMtime: 999,
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ]),
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const result = await storage.refreshSourceFileStatuses('notes/missing.md');

    expect(result).toEqual({ updated: 1, missing: 1 });
    expect(plugin.cardFileService.saveCardsBatch).not.toHaveBeenCalled();
  });

  it('adds we_decks when saving a new card with only deckId', async () => {
    processNewCardMock.mockReset();
    processNewCardMock.mockImplementation(async (card: any) => ({ converted: false, cards: [card] }));
    const notifyChange = vi.fn(async () => {});

    const plugin = {
      settings: {},
      __weaveDataChangeContext: {
        source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE
      },
      dataSyncService: {
        notifyChange
      },
      cardFileService: {
        getAllCards: vi.fn(async () => []),
        saveCard: vi.fn(async (_card: any) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      { id: 'deck-target', name: '目标牌组' } as any
    ]);

    const result = await storage.saveCard({
      uuid: '33333333-3333-4333-8333-333333333333',
      deckId: 'deck-target',
      content: '正面',
      tags: [],
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z',
      stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
    } as any);

    expect(result.success).toBe(true);
    expect(plugin.cardFileService.saveCard).toHaveBeenCalledTimes(1);

    const savedCard = plugin.cardFileService.saveCard.mock.calls[0][0];
    const yaml = parseYAMLFromContent(savedCard.content);
    expect(yaml.we_decks).toEqual(['目标牌组']);
    expect(savedCard.deckId).toBe('deck-target');
    expect(savedCard.referencedByDecks).toEqual(['deck-target']);
    expect(notifyChange).toHaveBeenCalledWith({
      type: 'cards',
      action: 'create',
      ids: ['33333333-3333-4333-8333-333333333333'],
      metadata: {
        source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
        deckId: 'deck-target',
        deckIds: ['deck-target']
      }
    });
  });

  it('propagates memory study source metadata when saving study sessions', async () => {
    const notifyChange = vi.fn(async () => {});
    const plugin = {
      settings: {},
      __weaveDataChangeContext: {
        source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE
      },
      dataSyncService: {
        notifyChange
      },
      externalSyncWatcher: {
        markInternalWrite: vi.fn()
      },
      app: {
        vault: {
          adapter: {
            exists: vi.fn(async () => false),
            read: vi.fn(async () => JSON.stringify({})),
            write: vi.fn(async () => undefined),
            mkdir: vi.fn(async () => undefined)
          },
          configDir: '.obsidian',
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage as any, 'ensureFolder').mockResolvedValue(undefined);
    vi.spyOn(storage as any, 'readJsonFile').mockRejectedValue(new Error('missing'));
    vi.spyOn(storage as any, 'writeJsonFile').mockResolvedValue(undefined);

    const result = await storage.saveStudySession({
      id: 'session-1',
      deckId: 'deck-target',
      startTime: new Date('2026-04-26T01:00:00.000Z'),
      cardsReviewed: 1,
      newCardsLearned: 1,
      correctAnswers: 1,
      totalTime: 30,
      cardReviews: []
    } as any);

    expect(result.success).toBe(true);
    expect(notifyChange).toHaveBeenCalledWith({
      type: 'sessions',
      action: 'create',
      ids: ['session-1'],
      metadata: {
        source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
        deckId: 'deck-target',
        deckIds: ['deck-target']
      }
    });
  });

  it('does not re-add we_decks when an existing card save intentionally removes it', async () => {
    processNewCardMock.mockReset();
    processNewCardMock.mockImplementation(async (card: any) => ({ converted: false, cards: [card] }));

    const existingCard = {
      uuid: '44444444-4444-4444-8444-444444444444',
      deckId: 'deck-target',
      referencedByDecks: ['deck-target'],
      content: '---\nwe_decks:\n  - 目标牌组\n---\n旧内容',
      tags: [],
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z',
      stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
    };

    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [existingCard]),
        saveCard: vi.fn(async (_card: any) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const result = await storage.saveCard({
      uuid: '44444444-4444-4444-8444-444444444444',
      deckId: 'deck-target',
      referencedByDecks: [],
      content: '新内容',
      tags: [],
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z',
      stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
    } as any);

    expect(result.success).toBe(true);
    const savedCard = plugin.cardFileService.saveCard.mock.calls[0][0];
    const yaml = parseYAMLFromContent(savedCard.content);
    expect(yaml.we_decks).toBeUndefined();
  });

  it('suppresses deck notifications during deferred deck cardUUID flush after saveCard', async () => {
    vi.useFakeTimers();
    try {
      processNewCardMock.mockReset();
      processNewCardMock.mockImplementation(async (card: any) => ({ converted: false, cards: [card] }));

      const previousDataChangeContext = {
        source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
        deckIds: ['deck-origin']
      };
      const plugin = {
        settings: {},
        __weaveDataChangeContext: previousDataChangeContext,
        cardFileService: {
          getAllCards: vi.fn(async () => []),
          saveCard: vi.fn(async (_card: any) => true)
        },
        app: {
          vault: {
            getMarkdownFiles: () => [],
            getAbstractFileByPath: () => null,
            cachedRead: vi.fn()
          },
          workspace: {
            trigger: vi.fn()
          }
        }
      } as any;

      const storage = new WeaveDataStorage(plugin);
      vi.spyOn(storage, 'getDecks').mockResolvedValue([
        { id: 'deck-target', name: '目标牌组' } as any
      ]);

      const flushedDeck = {
        id: 'deck-target',
        name: '目标牌组',
        cardUUIDs: [],
        description: '',
        category: '',
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any;
      vi.spyOn(storage, 'getDeck').mockResolvedValue(flushedDeck);

      const seenDataChangeContexts: any[] = [];
      const saveDeckSpy = vi.spyOn(storage, 'saveDeck').mockImplementation(async (deck: any) => {
        seenDataChangeContexts.push((plugin as any).__weaveDataChangeContext);
        return {
          success: true,
          data: deck,
          timestamp: '2026-03-15T00:00:00.000Z'
        } as any;
      });

      const result = await storage.saveCard({
        uuid: '77777777-7777-4777-8777-777777777777',
        deckId: 'deck-target',
        content: '正面',
        tags: [],
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
      } as any);

      expect(result.success).toBe(true);
      expect(saveDeckSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(300);

      expect(saveDeckSpy).toHaveBeenCalledTimes(1);
      expect(saveDeckSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'deck-target',
        cardUUIDs: ['77777777-7777-4777-8777-777777777777']
      }));
      expect(seenDataChangeContexts).toEqual([
        expect.objectContaining({
          source: MEMORY_STUDY_SESSION_DATA_CHANGE_SOURCE,
          suppressDeckNotifications: true,
          deckIds: ['deck-target']
        })
      ]);
      expect((plugin as any).__weaveDataChangeContext).toBe(previousDataChangeContext);
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds we_decks for new cards saved through saveCardsBatch', async () => {
    processBatchMock.mockReset();
    processBatchMock.mockImplementation(async (cards: any[]) => cards);

    const plugin = {
      settings: {},
      cardFileService: {
        getCardsByUUIDsBatch: vi.fn(async () => ({ found: [], notFound: ['55555555-5555-4555-8555-555555555555'] })),
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      { id: 'deck-target', name: '目标牌组' } as any
    ]);
    vi.spyOn(storage, 'getDeck').mockResolvedValue(undefined as any);

    await storage.saveCardsBatch([
      {
        uuid: '55555555-5555-4555-8555-555555555555',
        deckId: 'deck-target',
        content: '批量正面',
        tags: [],
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
      } as any
    ]);

    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledTimes(1);
    const savedCard = plugin.cardFileService.saveCardsBatch.mock.calls[0][0][0];
    const yaml = parseYAMLFromContent(savedCard.content);
    expect(yaml.we_decks).toEqual(['目标牌组']);
    expect(savedCard.referencedByDecks).toEqual(['deck-target']);
  });

  it('uses WDeck getCardsByUUIDs for batch existence checks before falling back to legacy storage', async () => {
    processBatchMock.mockReset();
    processBatchMock.mockImplementation(async (cards: any[]) => cards);

    const plugin = {
      settings: {},
      wdeckService: {
        getCardsByUUIDs: vi.fn(async () => [
          {
            uuid: '66666666-6666-4666-8666-666666666666',
            deckId: 'wdeck:deck-target',
            content: 'existing',
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ]),
        getAllCards: vi.fn(async () => {
          throw new Error('should not scan all WDeck cards');
        }),
        saveCardsToDeck: vi.fn(async (_deck: any, cards: any[]) => cards),
        hasRuntimeCardMeta: vi.fn(() => false),
        isWDeckCard: vi.fn(() => false),
        isWDeckDeckId: vi.fn(() => false)
      },
      cardFileService: {
        getCardsByUUIDsBatch: vi.fn(async () => ({ found: [], notFound: [] })),
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDeck').mockResolvedValue(undefined as any);

    await storage.saveCardsBatch([
      {
        uuid: '66666666-6666-4666-8666-666666666666',
        deckId: 'deck-target',
        content: '批量正面',
        tags: [],
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
      } as any
    ]);

    expect(plugin.wdeckService.getCardsByUUIDs).toHaveBeenCalledWith([
      '66666666-6666-4666-8666-666666666666'
    ]);
    expect(plugin.wdeckService.getAllCards).not.toHaveBeenCalled();
  });

  it('writes target deck membership into card YAML when saving deck cards', async () => {
    processBatchMock.mockReset();
    processBatchMock.mockImplementation(async (cards: any[]) => cards);

    const plugin = {
      settings: {},
      cardFileService: {
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const targetDeck = {
      id: 'deck-target',
      name: '目标牌组',
      cardUUIDs: [],
      description: '',
      category: '',
      tags: [],
      metadata: {},
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z'
    } as any;

    vi.spyOn(storage, 'getDecks').mockResolvedValue([targetDeck]);
    vi.spyOn(storage, 'getDeck').mockResolvedValue(targetDeck);
    vi.spyOn(storage, 'getCards').mockResolvedValue([]);
    const saveDeckSpy = vi.spyOn(storage, 'saveDeck').mockResolvedValue({
      success: true,
      data: targetDeck,
      timestamp: '2026-03-15T00:00:00.000Z'
    } as any);

    await storage.saveDeckCards('deck-target', [
      {
        uuid: '11111111-1111-4111-8111-111111111111',
        deckId: 'deck-target',
        content: '正面',
        tags: [],
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z',
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
      } as any
    ]);

    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledTimes(1);

    const savedCard = plugin.cardFileService.saveCardsBatch.mock.calls[0][0][0];
    const yaml = parseYAMLFromContent(savedCard.content);
    expect(yaml.we_decks).toEqual(['目标牌组']);
    expect(savedCard.deckId).toBe('deck-target');
    expect(savedCard.referencedByDecks).toEqual(['deck-target']);

    expect(saveDeckSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: 'deck-target',
      cardUUIDs: ['11111111-1111-4111-8111-111111111111'],
      stats: expect.objectContaining({ totalCards: 1 })
    }));
  });

  it('clears omitted cards to unassigned when removing their唯一正式牌组', async () => {
    processBatchMock.mockReset();
    processBatchMock.mockImplementation(async (cards: any[]) => cards);

    const plugin = {
      settings: {},
      cardFileService: {
        saveCardsBatch: vi.fn(async (_cards: any[]) => true)
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        },
        workspace: {
          trigger: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const targetDeck = {
      id: 'deck-target',
      name: '目标牌组',
      cardUUIDs: ['22222222-2222-4222-8222-222222222222'],
      description: '',
      category: '',
      tags: [],
      metadata: {},
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z'
    } as any;
    const otherDeck = {
      id: 'deck-other',
      name: '其他牌组'
    } as any;
    const existingCard = {
      uuid: '22222222-2222-4222-8222-222222222222',
      deckId: 'deck-target',
      referencedByDecks: ['deck-target', 'deck-other'],
      content: '---\nwe_decks:\n  - 目标牌组\n  - 其他牌组\n---\n正面',
      tags: [],
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z',
      stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
    } as any;

    vi.spyOn(storage, 'getDecks').mockResolvedValue([targetDeck, otherDeck]);
    vi.spyOn(storage, 'getDeck').mockResolvedValue(targetDeck);
    vi.spyOn(storage, 'getCards').mockImplementation(async (query?: any) => query?.deckId === 'deck-target' ? [existingCard] : []);
    const saveDeckSpy = vi.spyOn(storage, 'saveDeck').mockResolvedValue({
      success: true,
      data: targetDeck,
      timestamp: '2026-03-15T00:00:00.000Z'
    } as any);

    await storage.saveDeckCards('deck-target', []);

    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledTimes(1);

    const savedCard = plugin.cardFileService.saveCardsBatch.mock.calls[0][0][0];
    const yaml = parseYAMLFromContent(savedCard.content);
    expect(yaml.we_decks).toBeUndefined();
    expect(savedCard.deckId).toBeUndefined();
    expect(savedCard.referencedByDecks).toEqual([]);

    expect(saveDeckSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: 'deck-target',
      cardUUIDs: [],
      stats: expect.objectContaining({ totalCards: 0 })
    }));
  });

  it('syncs we_decks when moving a card between decks', async () => {
    const plugin = {
      settings: {},
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const movedCard = {
      uuid: 'card-1',
      deckId: 'deck-target',
      referencedByDecks: ['deck-target'],
      content: '---\nwe_decks:\n  - 目标牌组\n---\n正面',
      tags: [],
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z',
      stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
    } as any;
    const moveCardsToDeckSpy = vi.spyOn(storage, 'moveCardsToDeck').mockResolvedValue({
      moved: [movedCard],
      failed: []
    });

    const result = await storage.moveCardToDeck('card-1', 'deck-source', 'deck-target');

    expect(result.success).toBe(true);
    expect(moveCardsToDeckSpy).toHaveBeenCalledWith(['card-1'], 'deck-target');
    expect(result.data?.deckId).toBe('deck-target');
    expect(result.data?.referencedByDecks).toEqual(['deck-target']);

    const yaml = parseYAMLFromContent(result.data?.content || '');
    expect(yaml.we_decks).toEqual(['目标牌组']);
  });

  it('prefers .wdeck cards when the same UUID exists in both storage sources', async () => {
    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-1',
            deckId: 'legacy-deck',
            content: 'legacy',
            created: '2026-04-14T00:00:00.000Z',
            modified: '2026-04-14T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
          }
        ])
      },
      wdeckService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'card-1',
            deckId: 'wdeck:deck-1',
            content: 'wdeck',
            created: '2026-04-14T00:00:00.000Z',
            modified: '2026-04-14T00:00:00.000Z',
            stats: { totalReviews: 1, totalTime: 10, averageTime: 10 }
          }
        ])
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const cards = await (storage as any).readAllCardsIncludingWDeck();

    expect(cards).toHaveLength(1);
    expect(cards[0].content).toBe('wdeck');
  });

  it('prefers targeted UUID readers before any full card scan', async () => {
    const plugin = {
      settings: {},
      cardFileService: {
        getCardsByUUIDsBatch: vi.fn(async () => ({
          found: [
            {
              uuid: 'card-2',
              content: 'legacy-card-2',
              created: '2026-04-14T00:00:00.000Z',
              modified: '2026-04-14T00:00:00.000Z',
              stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
            }
          ],
          notFound: []
        })),
        getAllCards: vi.fn(async () => {
          throw new Error('should not scan legacy cards');
        })
      },
      wdeckService: {
        getCardsByUUIDs: vi.fn(async () => [
          {
            uuid: 'card-1',
            deckId: 'wdeck:deck-1',
            content: 'wdeck-card-1',
            created: '2026-04-14T00:00:00.000Z',
            modified: '2026-04-14T00:00:00.000Z',
            stats: { totalReviews: 1, totalTime: 10, averageTime: 10 }
          }
        ]),
        getAllCards: vi.fn(async () => {
          throw new Error('should not scan wdeck cards');
        })
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const cards = await storage.getCardsByUUIDs(['card-2', 'card-1']);

    expect(cards.map(card => card.uuid)).toEqual(['card-2', 'card-1']);
    expect(plugin.wdeckService.getCardsByUUIDs).toHaveBeenCalledWith(['card-2', 'card-1']);
    expect(plugin.cardFileService.getCardsByUUIDsBatch).toHaveBeenCalledWith(['card-2']);
    expect(plugin.wdeckService.getAllCards).not.toHaveBeenCalled();
    expect(plugin.cardFileService.getAllCards).not.toHaveBeenCalled();
  });

  it('hides migrated legacy decks and exposes aggregated .wdeck decks', async () => {
    const files = new Map<string, string>([
      [
        'weave/memory/decks.json',
        JSON.stringify({
          decks: [
            {
              id: 'legacy-visible',
              name: 'legacy-visible',
              metadata: {},
              created: '2026-04-14T00:00:00.000Z',
              modified: '2026-04-14T00:00:00.000Z'
            },
            {
              id: 'legacy-migrated',
              name: 'circulation',
              metadata: {
                wdeckMigration: {
                  status: 'migrated',
                  filePath: 'weave/memory/deck-files/circulation_01.wdeck'
                }
              },
              created: '2026-04-14T00:00:00.000Z',
              modified: '2026-04-14T00:00:00.000Z'
            }
          ]
        })
      ]
    ]);

    const adapter = {
      exists: vi.fn(async (path: string) => files.has(path)),
      read: vi.fn(async (path: string) => {
        const value = files.get(path);
        if (value === undefined) throw new Error(`Missing file: ${path}`);
        return value;
      }),
      write: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
      mkdir: vi.fn(async () => undefined)
    };

    const plugin = {
      settings: {},
      wdeckService: {
        getAllDeckSummaries: vi.fn(async () => [
          {
            runtimeDeckId: 'wdeck:legacy-migrated',
            logicalDeckId: 'legacy-migrated',
            logicalDeckName: 'circulation',
            filePaths: ['weave/memory/deck-files/circulation_01.wdeck'],
            segmentIndices: [1],
            cardUUIDs: ['card-1', 'card-2'],
            deck: {
              id: 'legacy-migrated',
              name: 'circulation'
            }
          }
        ]),
        getAllDeckAggregates: vi.fn(async () => {
          throw new Error('getAllDeckAggregates should not be used when getAllDeckSummaries exists');
        })
      },
      app: {
        vault: {
          adapter,
          configDir: '.obsidian',
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const decks = await storage.getDecks();

    expect(decks.map((deck) => deck.id)).toEqual(['legacy-visible', 'wdeck:legacy-migrated']);
    expect(plugin.wdeckService.getAllDeckSummaries).toHaveBeenCalledTimes(1);
    expect(plugin.wdeckService.getAllDeckAggregates).not.toHaveBeenCalled();
    expect(decks[1]).toMatchObject({
      name: 'circulation',
      cardUUIDs: ['card-1', 'card-2'],
      metadata: expect.objectContaining({
        fileType: 'wdeck',
        logicalDeckId: 'legacy-migrated'
      })
    });
  });

  it('removes legacy memory deck JSON entries after saving the deck into .wdeck', async () => {
    const files = new Map<string, string>([
      [
        'weave/memory/decks.json',
        JSON.stringify({
          decks: [
            {
              id: 'legacy-visible',
              name: 'legacy-visible',
              metadata: {},
              created: '2026-04-14T00:00:00.000Z',
              modified: '2026-04-14T00:00:00.000Z'
            }
          ]
        })
      ]
    ]);

    const adapter = {
      exists: vi.fn(async (path: string) => files.has(path)),
      read: vi.fn(async (path: string) => {
        const value = files.get(path);
        if (value === undefined) throw new Error(`Missing file: ${path}`);
        return value;
      }),
      write: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
      mkdir: vi.fn(async () => undefined)
    };

    const plugin = {
      settings: {},
      wdeckService: {
        getAllDeckAggregates: vi.fn(async () => []),
        getDeckAggregateByAnyDeckId: vi.fn(async () => null),
        saveDeckDefinition: vi.fn(async (deck: any) => ({
          runtimeDeckId: 'wdeck:legacy-visible',
          logicalDeckId: 'legacy-visible',
          logicalDeckName: deck.name,
          files: [{ path: 'weave/memory/deck-files/legacy-visible_01.wdeck' }],
          segmentIndices: [1],
          cards: [{ uuid: 'legacy-card-1' }],
          deck: {
            id: 'legacy-visible',
            name: deck.name,
            created: deck.created,
            modified: deck.modified,
            metadata: {}
          }
        }))
      },
      app: {
        vault: {
          adapter,
          configDir: '.obsidian',
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const result = await storage.saveDeck({
      id: 'legacy-visible',
      name: 'legacy-visible-updated',
      description: '',
      category: 'legacy',
      cardUUIDs: ['legacy-card-1'],
      tags: [],
      metadata: {},
      created: '2026-04-14T00:00:00.000Z',
      modified: '2026-04-14T00:00:00.000Z'
    } as any);

    expect(result.success).toBe(true);

    const persisted = JSON.parse(files.get('weave/memory/decks.json') || '{"decks":[]}');
    expect(persisted.decks).toEqual([]);
    expect(result.data?.id).toBe('wdeck:legacy-visible');
  });

  it('delegates deleting virtual .wdeck runtime decks to WDeckService', async () => {
    const deleteDeckByDeckId = vi.fn(async () => ({
      deletedFiles: ['weave/memory/deck-files/circulation_01.wdeck'],
      deletedCards: 2
    }));
    const plugin = {
      settings: {},
      wdeckService: {
        isWDeckDeckId: vi.fn((deckId: string) => deckId.startsWith('wdeck:')),
        deleteDeckByDeckId
      },
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const writeDecksFileSpy = vi.spyOn(storage as any, 'writeDecksFile').mockResolvedValue(undefined);

    const result = await storage.deleteDeck('wdeck:legacy-migrated');

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(deleteDeckByDeckId).toHaveBeenCalledWith('wdeck:legacy-migrated');
    expect(writeDecksFileSpy).not.toHaveBeenCalled();
  });
});
