vi.mock('obsidian', () => {
  class TFile {
    path: string;

    constructor(path = '') {
      this.path = path;
    }
  }

  return {
    TFile,
    Notice: class Notice {}
  };
});

import { TFile } from 'obsidian';
import { CardState, CardType, type Card, type FSRSCard, type ReviewLog } from '../types';
import type { ProgressiveClozeChildCard, ProgressiveClozeParentCard } from '../../types/progressive-cloze-v2';
import { WeaveDataStorage } from '../storage';

const PARENT_UUID = '11111111-1111-4111-8111-111111111111';
const CHILD_UUID_1 = '22222222-2222-4222-8222-222222222222';
const CHILD_UUID_2 = '33333333-3333-4333-8333-333333333333';

const {
  processContentChangeMock,
  processNewCardMock,
  processBatchMock
} = vi.hoisted(() => ({
  processContentChangeMock: vi.fn(),
  processNewCardMock: vi.fn(async (card: Card) => ({ converted: false, cards: [card] })),
  processBatchMock: vi.fn(async (cards: Card[]) => cards)
}));

vi.mock('../../services/progressive-cloze/ProgressiveClozeGateway', () => ({
  getProgressiveClozeGateway: () => ({
    processNewCard: processNewCardMock,
    processContentChange: processContentChangeMock,
    processBatch: processBatchMock
  })
}));

function createFsrs(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    due: '2026-03-15T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsedDays: 2,
    scheduledDays: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    retrievability: 0.9,
    ...overrides
  };
}

function createReviewLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    rating: 3,
    state: CardState.Review,
    due: '2026-03-20T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsedDays: 2,
    lastElapsedDays: 1,
    scheduledDays: 5,
    review: '2026-03-15T00:00:00.000Z',
    ...overrides
  };
}

function createProgressiveParent(content?: string): ProgressiveClozeParentCard {
  return {
    uuid: PARENT_UUID,
    deckId: 'deck-1',
    type: CardType.ProgressiveParent,
    content: content ?? '---\nwe_type: progressive-parent\n---\n{{c1::Alpha}} {{c2::Beta}}',
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    },
    tags: [],
    created: '2026-03-15T00:00:00.000Z',
    modified: '2026-03-15T00:00:00.000Z',
    progressiveCloze: {
      childCardIds: [CHILD_UUID_1, CHILD_UUID_2],
      totalClozes: 2,
      createdAt: '2026-03-15T00:00:00.000Z'
    }
  };
}

function createProgressiveChild(uuid: string, clozeOrd: number): ProgressiveClozeChildCard {
  return {
    uuid,
    deckId: 'deck-1',
    type: CardType.ProgressiveChild,
    parentCardId: PARENT_UUID,
    clozeOrd,
    content: '---\nwe_type: progressive-child\n---\n{{c1::Alpha2}} {{c2::Beta2}}',
    fsrs: createFsrs({ reps: clozeOrd + 1 }),
    reviewHistory: [createReviewLog({ scheduledDays: 5 + clozeOrd })],
    clozeSnapshot: clozeOrd === 0
      ? { text: 'Alpha2', hint: undefined }
      : { text: 'Beta2', hint: undefined },
    stats: {
      totalReviews: 1,
      totalTime: 10,
      averageTime: 10
    },
    tags: [],
    created: '2026-03-15T00:00:00.000Z',
    modified: '2026-03-15T00:00:00.000Z'
  };
}

describe('WeaveDataStorage delete source resolution', () => {
  it('converts existing normal cards to progressive parent plus children before saving', async () => {
    processNewCardMock.mockReset();
    processContentChangeMock.mockReset();

    const convertedParent = createProgressiveParent();
    const convertedChild1 = createProgressiveChild(CHILD_UUID_1, 0);
    const convertedChild2 = createProgressiveChild(CHILD_UUID_2, 1);

    processNewCardMock.mockResolvedValue({
      converted: true,
      cards: [convertedParent, convertedChild1, convertedChild2]
    });

    const existingCard: Card = {
      uuid: 'parent-1',
      deckId: 'deck-1',
      type: CardType.Cloze,
      content: '---\nwe_type: cloze\n---\n{{c1::Alpha}}',
      stats: {
        totalReviews: 0,
        totalTime: 0,
        averageTime: 0
      },
      tags: [],
      created: '2026-03-15T00:00:00.000Z',
      modified: '2026-03-15T00:00:00.000Z'
    };

    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [existingCard]),
        saveCard: vi.fn(async (_card: Card) => true)
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          configDir: '.obsidian',
          adapter: {
            exists: vi.fn(async () => false),
            read: vi.fn(async () => JSON.stringify({ decks: [] })),
            write: vi.fn(async () => {})
          },
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);

    const result = await storage.saveCard({
      ...existingCard,
      content: '---\nwe_type: cloze\n---\n{{c1::Alpha}} {{c2::Beta}}'
    });

    expect(result.success).toBe(true);
    expect(processNewCardMock).toHaveBeenCalledTimes(1);
    expect(processContentChangeMock).not.toHaveBeenCalled();
    expect(plugin.cardFileService.saveCard).toHaveBeenCalledTimes(3);
    expect(plugin.cardFileService.saveCard).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ uuid: PARENT_UUID, type: CardType.ProgressiveParent })
    );
    expect(plugin.cardFileService.saveCard).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ uuid: CHILD_UUID_1, type: CardType.ProgressiveChild })
    );
    expect(plugin.cardFileService.saveCard).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ uuid: CHILD_UUID_2, type: CardType.ProgressiveChild })
    );
  });

  it('routes batch saves through progressive cloze gateway expansion', async () => {
    processBatchMock.mockReset();
    processBatchMock.mockImplementation(async (_cards: Card[]) => [
      createProgressiveParent('---\nwe_type: progressive-parent\n---\n{{c1::Alpha}} {{c2::Beta}}'),
      createProgressiveChild(CHILD_UUID_1, 0),
      createProgressiveChild(CHILD_UUID_2, 1)
    ]);

    const plugin = {
      settings: {},
      getDeck: vi.fn(),
      cardFileService: {
        saveCardsBatch: vi.fn(async (_cards: Card[]) => true)
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          configDir: '.obsidian',
          adapter: {
            exists: vi.fn(async () => false),
            read: vi.fn(async () => JSON.stringify({ decks: [] })),
            write: vi.fn(async () => {})
          },
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDeck').mockResolvedValue(undefined as any);

    await storage.saveCardsBatch([
      {
        uuid: PARENT_UUID,
        deckId: 'deck-1',
        type: CardType.Cloze,
        content: '---\nwe_type: cloze\n---\n{{c1::Alpha}} {{c2::Beta}}',
        stats: {
          totalReviews: 0,
          totalTime: 0,
          averageTime: 0
        },
        tags: [],
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as Card
    ]);

    expect(processBatchMock).toHaveBeenCalledTimes(1);
    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledTimes(1);
    expect(plugin.cardFileService.saveCardsBatch).toHaveBeenCalledWith([
      expect.objectContaining({ uuid: PARENT_UUID, type: CardType.ProgressiveParent }),
      expect.objectContaining({ uuid: CHILD_UUID_1, type: CardType.ProgressiveChild }),
      expect.objectContaining({ uuid: CHILD_UUID_2, type: CardType.ProgressiveChild })
    ]);
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

  it('backfills single-card batch cleanup metadata from source markdown frontmatter', async () => {
    const sourceFile = new TFile();
    sourceFile.path = 'notes/source.md';
    const content = [
      '---',
      'weave-uuid: tk-abc123def456',
      'tags:',
      '  - 生物',
      '---',
      '',
      '什么是突触可塑性？',
      '---div---',
      '突触连接强度可随活动发生变化。'
    ].join('\n');

    const plugin = {
      settings: {},
      app: {
        vault: {
          getMarkdownFiles: () => [sourceFile],
          getAbstractFileByPath: (path: string) => (path === sourceFile.path ? sourceFile : null),
          cachedRead: vi.fn(async () => content)
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const resolved = await (storage as any).resolveMissingDeletionSource({
      uuid: 'tk-abc123def456',
      content: '',
      tags: []
    });

    expect(resolved?.sourceFile).toBe('notes/source.md');
    expect(resolved?.isBatchScanned).toBe(true);
    expect(resolved?.metadata?.creationType).toBe('batch-parse-single');
  });

  it('skips vault-wide deletion source lookup for apkg-imported cards without source metadata', async () => {
    const getMarkdownFiles = vi.fn(() => [
      Object.assign(new TFile(), { path: 'notes/source.md' })
    ]);
    const cachedRead = vi.fn();

    const plugin = {
      settings: {},
      app: {
        vault: {
          getMarkdownFiles,
          getAbstractFileByPath: () => null,
          cachedRead
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const card = {
      uuid: 'tk-apkg-import-1',
      content: 'imported content',
      tags: [],
      customFields: {
        importedFrom: 'apkg'
      }
    } as any;

    const resolved = await (storage as any).resolveMissingDeletionSource(card);

    expect(resolved).toBe(card);
    expect(getMarkdownFiles).not.toHaveBeenCalled();
    expect(cachedRead).not.toHaveBeenCalled();
  });

  it('finds card from unified card storage before deletion so cleanup metadata can still be resolved', async () => {
    const sourceFile = new TFile();
    sourceFile.path = 'notes/source.md';
    const sourceContent = [
      '---',
      'weave-uuid: tk-abc123def456',
      'tags:',
      '  - 生物',
      '---',
      '',
      '什么是突触可塑性？',
      '---div---',
      '突触连接强度可随活动发生变化。'
    ].join('\n');

    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'tk-abc123def456',
            content: '',
            tags: []
          }
        ])
      },
      app: {
        vault: {
          getMarkdownFiles: () => [sourceFile],
          getAbstractFileByPath: (path: string) => (path === sourceFile.path ? sourceFile : null),
          cachedRead: vi.fn(async () => sourceContent)
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const card = await storage.getCardByUUID('tk-abc123def456');
    const resolved = await (storage as any).resolveMissingDeletionSource(card);

    expect(plugin.cardFileService.getAllCards).toHaveBeenCalled();
    expect(card?.uuid).toBe('tk-abc123def456');
    expect(resolved?.sourceFile).toBe('notes/source.md');
    expect(resolved?.isBatchScanned).toBe(true);
    expect(resolved?.metadata?.creationType).toBe('batch-parse-single');
  });

  it('uses targeted unified lookup and skips source cleanup for apkg cards without source metadata during batch deletion', async () => {
    const getCardsByUUIDsBatch = vi.fn(async (uuids: string[]) => ({
      found: uuids.map(uuid => ({
        uuid,
        content: 'imported content',
        tags: [],
        customFields: {
          importedFrom: 'apkg'
        },
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      })),
      notFound: []
    }));
    const getAllCards = vi.fn(async () => []);
    const deleteCardsBatch = vi.fn(async (uuids: string[]) => ({
      deleted: [...uuids],
      notFound: []
    }));
    const cleanupAfterCardDeletions = vi.fn();

    const plugin = {
      settings: {},
      cardFileService: {
        getCardsByUUIDsBatch,
        getAllCards,
        deleteCardsBatch
      },
      directFileReader: {
        removeCardIndex: vi.fn()
      },
      cardIndexService: {
        removeCardIndex: vi.fn()
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const ensureCleanupServiceSpy = vi
      .spyOn(storage as any, 'ensureCleanupService')
      .mockReturnValue({ cleanupAfterCardDeletions });
    const writePersistedDecksSpy = vi
      .spyOn(storage as any, 'writePersistedDecks')
      .mockResolvedValue(undefined);
    vi.spyOn(storage as any, 'readPersistedDecks').mockResolvedValue([
      {
        id: 'deck-to-delete',
        name: '待删牌组',
        cardUUIDs: ['apkg-1', 'apkg-2'],
        modified: '2026-03-15T00:00:00.000Z'
      },
      {
        id: 'deck-keep',
        name: '保留牌组',
        cardUUIDs: ['apkg-1', 'apkg-2', 'stay-1'],
        modified: '2026-03-15T00:00:00.000Z'
      }
    ] as any);

    const result = await storage.deleteCards(['apkg-1', 'apkg-2'], {
      skipCascadeDeckIds: ['deck-to-delete']
    });

    expect(result.deleted).toEqual(['apkg-1', 'apkg-2']);
    expect(result.failed).toEqual([]);
    expect(getCardsByUUIDsBatch).toHaveBeenCalledWith(['apkg-1', 'apkg-2']);
    expect(getAllCards).not.toHaveBeenCalled();
    expect(deleteCardsBatch).toHaveBeenCalledWith(['apkg-1', 'apkg-2']);
    expect(writePersistedDecksSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'deck-to-delete',
        cardUUIDs: ['apkg-1', 'apkg-2']
      }),
      expect.objectContaining({
        id: 'deck-keep',
        cardUUIDs: ['stay-1']
      })
    ]);
    expect(ensureCleanupServiceSpy).not.toHaveBeenCalled();
    expect(cleanupAfterCardDeletions).not.toHaveBeenCalled();
  });

  it('skips repeated deck card deletion when deck cards were already removed beforehand', async () => {
    const notifyChange = vi.fn(async () => {});
    const onDeckDeleted = vi.fn();
    const clear = vi.fn();

    const plugin = {
      settings: {},
      deckNameMapper: {
        onDeckDeleted
      },
      cardMetadataCache: {
        clear
      },
      dataSyncService: {
        notifyChange
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      {
        id: 'deck-to-delete',
        name: '待删牌组',
        description: '',
        category: '',
        cardUUIDs: ['apkg-1', 'apkg-2'],
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any,
      {
        id: 'deck-keep',
        name: '保留牌组',
        description: '',
        category: '',
        cardUUIDs: ['stay-1'],
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any
    ]);

    const writeDecksFileSpy = vi.spyOn(storage as any, 'writeDecksFile').mockResolvedValue(undefined);
    const deleteDeckCardUUIDsSpy = vi.spyOn(storage as any, 'deleteDeckCardUUIDs').mockResolvedValue(undefined);
    const deleteCardsByDeckSpy = vi.spyOn(storage as any, 'deleteCardsByDeck').mockResolvedValue(undefined);
    const cleanupStudySessionsSpy = vi.spyOn(storage as any, 'cleanupStudySessionsByDeck').mockResolvedValue(undefined);
    const cleanupDeckMediaSpy = vi.spyOn(storage as any, 'cleanupDeckMediaFiles').mockResolvedValue(undefined);
    const notifyDeckDeletionSpy = vi.spyOn(storage as any, 'notifyDeckDeletion').mockResolvedValue(undefined);

    const result = await storage.deleteDeck('deck-to-delete', {
      skipCardDeletion: true
    });

    expect(result.success).toBe(true);
    expect(writeDecksFileSpy).toHaveBeenCalledWith({
      decks: [expect.objectContaining({ id: 'deck-keep' })]
    });
    expect(deleteDeckCardUUIDsSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(deleteCardsByDeckSpy).not.toHaveBeenCalled();
    expect(cleanupStudySessionsSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(cleanupDeckMediaSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(notifyDeckDeletionSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(onDeckDeleted).toHaveBeenCalledWith('deck-to-delete');
    expect(clear).toHaveBeenCalled();
    expect(notifyChange).toHaveBeenCalledWith({
      type: 'decks',
      action: 'delete',
      ids: ['deck-to-delete'],
      metadata: {
        deckId: 'deck-to-delete',
        deckIds: ['deck-to-delete']
      }
    });
  });

  it('routes mixed legacy and .wdeck card deletions through the correct storage services', async () => {
    const deleteCardsBatch = vi.fn(async (uuids: string[]) => ({
      deleted: [...uuids],
      notFound: []
    }));
    const deleteCardsByUUIDs = vi.fn(async (uuids: string[]) => [...uuids]);

    const plugin = {
      settings: {},
      cardFileService: {
        getCardsByUUIDsBatch: vi.fn(async () => ({
          found: [
            {
              uuid: 'legacy-1',
              content: 'legacy',
              tags: [],
              created: '2026-03-15T00:00:00.000Z',
              modified: '2026-03-15T00:00:00.000Z',
              stats: { totalReviews: 0, totalTime: 0, averageTime: 0 }
            }
          ],
          notFound: ['wdeck-1']
        })),
        deleteCardsBatch
      },
      wdeckService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'wdeck-1',
            deckId: 'wdeck:deck-1',
            content: 'wdeck',
            tags: [],
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
            customFields: {
              wdeck: {
                runtimeDeckId: 'wdeck:deck-1',
                logicalDeckId: 'deck-1',
                logicalDeckName: 'deck-1',
                sourcePath: 'vault/deck-1_01.wdeck'
              }
            }
          }
        ]),
        isWDeckCard: vi.fn((card: any) => card?.deckId === 'wdeck:deck-1'),
        deleteCardsByUUIDs
      },
      directFileReader: {
        removeCardIndex: vi.fn()
      },
      cardIndexService: {
        removeCardIndex: vi.fn()
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    const writePersistedDecksSpy = vi
      .spyOn(storage as any, 'writePersistedDecks')
      .mockResolvedValue(undefined);
    vi.spyOn(storage as any, 'readPersistedDecks').mockResolvedValue([
      {
        id: 'deck-a',
        name: '牌组 A',
        cardUUIDs: ['legacy-1', 'wdeck-1', 'stay-1'],
        modified: '2026-03-15T00:00:00.000Z'
      }
    ] as any);

    const result = await storage.deleteCards(['legacy-1', 'wdeck-1']);

    expect(result.deleted).toEqual(['legacy-1', 'wdeck-1']);
    expect(result.failed).toEqual([]);
    expect(deleteCardsBatch).toHaveBeenCalledWith(['legacy-1']);
    expect(deleteCardsByUUIDs).toHaveBeenCalledWith(['wdeck-1']);
    expect(writePersistedDecksSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'deck-a',
        cardUUIDs: ['stay-1']
      })
    ]);
  });

  it('deletes progressive child cards via targeted UUID lookup before deleting the progressive parent', async () => {
    const deletedOrder: string[] = [];
    const parent = createProgressiveParent();
    const child1 = createProgressiveChild(CHILD_UUID_1, 0);
    const child2 = createProgressiveChild(CHILD_UUID_2, 1);
    const getAllCards = vi.fn(async () => {
      throw new Error('should not scan all cards');
    });

    const plugin = {
      settings: {},
      cardFileService: {
        getCardsByUUIDsBatch: vi.fn(async (uuids: string[]) => ({
          found: uuids.map(uuid => {
            if (uuid === parent.uuid) return parent;
            if (uuid === child1.uuid) return child1;
            return child2;
          }),
          notFound: []
        })),
        getAllCards,
        deleteCard: vi.fn(async (uuid: string) => {
          deletedOrder.push(uuid);
          return true;
        })
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage as any, 'ensureCleanupService').mockReturnValue({
      cleanupAfterCardDeletion: vi.fn(async () => ({ success: true, cleanedItems: [] }))
    });

    const result = await storage.deleteCard(parent.uuid);

    expect(result.success).toBe(true);
    expect(plugin.cardFileService.getCardsByUUIDsBatch).toHaveBeenCalledWith([parent.uuid]);
    expect(plugin.cardFileService.getAllCards).not.toHaveBeenCalled();
    expect(deletedOrder).toEqual([CHILD_UUID_1, CHILD_UUID_2, parent.uuid]);
  });

  it('expands progressive parent batch deletion through targeted child UUID lookups before fallback scans', async () => {
    const parent = createProgressiveParent();
    const child1 = createProgressiveChild(CHILD_UUID_1, 0);
    const child2 = createProgressiveChild(CHILD_UUID_2, 1);
    const getAllCards = vi.fn(async () => {
      throw new Error('should not scan all cards');
    });
    const deleteCardsBatch = vi.fn(async (uuids: string[]) => ({
      deleted: [...uuids],
      notFound: []
    }));

    const plugin = {
      settings: {},
      cardFileService: {
        getCardsByUUIDsBatch: vi.fn(async (uuids: string[]) => ({
          found: uuids.map(uuid => {
            if (uuid === parent.uuid) return parent;
            if (uuid === child1.uuid) return child1;
            return child2;
          }),
          notFound: []
        })),
        getAllCards,
        deleteCardsBatch
      },
      directFileReader: {
        removeCardIndex: vi.fn()
      },
      cardIndexService: {
        removeCardIndex: vi.fn()
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage as any, 'ensureCleanupService').mockReturnValue({
      cleanupAfterCardDeletions: vi.fn(async () => [])
    });
    vi.spyOn(storage as any, 'writePersistedDecks').mockResolvedValue(undefined);
    vi.spyOn(storage as any, 'readPersistedDecks').mockResolvedValue([]);

    const result = await storage.deleteCards([parent.uuid]);

    expect(result.deleted).toEqual([parent.uuid]);
    expect(result.failed).toEqual([]);
    expect(plugin.cardFileService.getCardsByUUIDsBatch).toHaveBeenCalledWith([parent.uuid]);
    expect(plugin.cardFileService.getCardsByUUIDsBatch).toHaveBeenCalledWith([CHILD_UUID_1, CHILD_UUID_2]);
    expect(plugin.cardFileService.getAllCards).not.toHaveBeenCalled();
    expect(deleteCardsBatch).toHaveBeenCalledWith([parent.uuid, CHILD_UUID_1, CHILD_UUID_2]);
  });

  it('collects we_decks-linked cards before deck index removal', async () => {
    const notifyChange = vi.fn(async () => {});
    const onDeckDeleted = vi.fn();
    const clear = vi.fn();

    const plugin = {
      settings: {},
      deckNameMapper: {
        onDeckDeleted
      },
      cardMetadataCache: {
        clear
      },
      dataSyncService: {
        notifyChange
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDecks').mockResolvedValue([
      {
        id: 'deck-to-delete',
        name: '待删牌组',
        description: '',
        category: '',
        cardUUIDs: [],
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any,
      {
        id: 'deck-keep',
        name: '保留牌组',
        description: '',
        category: '',
        cardUUIDs: ['stay-1'],
        tags: [],
        metadata: {},
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any
    ]);
    vi.spyOn(storage, 'getCards').mockResolvedValue([
      {
        uuid: 'apkg-1',
        content: '---\nwe_decks:\n  - 待删牌组\nwe_type: basic\n---\nFront A',
        tags: [],
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any,
      {
        uuid: 'apkg-2',
        content: '---\nwe_decks:\n  - 待删牌组\nwe_type: basic\n---\nFront B',
        tags: [],
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any,
      {
        uuid: 'stay-1',
        content: '---\nwe_decks:\n  - 保留牌组\nwe_type: basic\n---\nFront Keep',
        tags: [],
        stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
        created: '2026-03-15T00:00:00.000Z',
        modified: '2026-03-15T00:00:00.000Z'
      } as any
    ]);

    vi.spyOn(storage as any, 'readDeckCardUUIDs').mockResolvedValue([]);
    const writeDecksFileSpy = vi.spyOn(storage as any, 'writeDecksFile').mockResolvedValue(undefined);
    const deleteDeckCardUUIDsSpy = vi.spyOn(storage as any, 'deleteDeckCardUUIDs').mockResolvedValue(undefined);
    const deleteCardsByDeckSpy = vi.spyOn(storage as any, 'deleteCardsByDeck').mockResolvedValue(undefined);
    const cleanupStudySessionsSpy = vi.spyOn(storage as any, 'cleanupStudySessionsByDeck').mockResolvedValue(undefined);
    const cleanupDeckMediaSpy = vi.spyOn(storage as any, 'cleanupDeckMediaFiles').mockResolvedValue(undefined);
    const notifyDeckDeletionSpy = vi.spyOn(storage as any, 'notifyDeckDeletion').mockResolvedValue(undefined);

    const result = await storage.deleteDeck('deck-to-delete');

    expect(result.success).toBe(true);
    expect(writeDecksFileSpy).toHaveBeenCalledWith({
      decks: [expect.objectContaining({ id: 'deck-keep' })]
    });
    expect(deleteDeckCardUUIDsSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(deleteCardsByDeckSpy).toHaveBeenCalledTimes(1);
    const passedUUIDs = deleteCardsByDeckSpy.mock.calls[0][1] as string[];
    expect(passedUUIDs).toEqual(expect.arrayContaining(['apkg-1', 'apkg-2']));
    expect(passedUUIDs).not.toContain('stay-1');
    expect(cleanupStudySessionsSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(cleanupDeckMediaSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(notifyDeckDeletionSpy).toHaveBeenCalledWith('deck-to-delete');
    expect(onDeckDeleted).toHaveBeenCalledWith('deck-to-delete');
    expect(clear).toHaveBeenCalled();
    expect(notifyChange).toHaveBeenCalledWith({
      type: 'decks',
      action: 'delete',
      ids: ['deck-to-delete'],
      metadata: {
        deckId: 'deck-to-delete',
        deckIds: ['deck-to-delete']
      }
    });
  });

  it('deletes progressive child cards before deleting the progressive parent in unified storage', async () => {
    const deletedOrder: string[] = [];
    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [
          {
            uuid: 'parent-1',
            deckId: 'deck-1',
            type: 'progressive-parent',
            content: '---\nwe_type: progressive-parent\n---\n{{c1::Alpha}} {{c2::Beta}}',
            stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            tags: []
          },
          {
            uuid: 'child-1',
            deckId: 'deck-1',
            type: 'progressive-child',
            parentCardId: 'parent-1',
            clozeOrd: 0,
            content: '{{c1::Alpha}} {{c2::Beta}}',
            stats: { totalReviews: 1, totalTime: 10, averageTime: 10 },
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            tags: [],
            fsrs: {
              due: '2026-03-15T00:00:00.000Z',
              stability: 1,
              difficulty: 5,
              elapsedDays: 0,
              scheduledDays: 0,
              reps: 0,
              lapses: 0,
              state: 0,
              retrievability: 1
            },
            reviewHistory: []
          },
          {
            uuid: 'child-2',
            deckId: 'deck-1',
            type: 'progressive-child',
            parentCardId: 'parent-1',
            clozeOrd: 1,
            content: '{{c1::Alpha}} {{c2::Beta}}',
            stats: { totalReviews: 1, totalTime: 10, averageTime: 10 },
            created: '2026-03-15T00:00:00.000Z',
            modified: '2026-03-15T00:00:00.000Z',
            tags: [],
            fsrs: {
              due: '2026-03-15T00:00:00.000Z',
              stability: 1,
              difficulty: 5,
              elapsedDays: 0,
              scheduledDays: 0,
              reps: 0,
              lapses: 0,
              state: 0,
              retrievability: 1
            },
            reviewHistory: []
          }
        ]),
        deleteCard: vi.fn(async (uuid: string) => {
          deletedOrder.push(uuid);
          return true;
        })
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage as any, 'ensureCleanupService').mockReturnValue({
      cleanupAfterCardDeletion: vi.fn(async () => ({ success: true, cleanedItems: [] }))
    });

    const result = await storage.deleteCard('parent-1');

    expect(result.success).toBe(true);
    expect(plugin.cardFileService.deleteCard).toHaveBeenCalledTimes(3);
    expect(deletedOrder).toEqual(['child-1', 'child-2', 'parent-1']);
  });

  it('routes progressive parent edits through gateway and saves returned parent plus children', async () => {
    processContentChangeMock.mockReset();

    const existingParent = createProgressiveParent();
    const updatedParent: ProgressiveClozeParentCard = {
      ...existingParent,
      content: '---\nwe_type: progressive-parent\n---\n{{c1::Alpha2}} {{c2::Beta2}}',
      modified: '2026-03-16T00:00:00.000Z',
      progressiveCloze: {
        childCardIds: [CHILD_UUID_1, CHILD_UUID_2],
        totalClozes: 2,
        createdAt: '2026-03-15T00:00:00.000Z'
      }
    };
    const updatedChild1 = createProgressiveChild(CHILD_UUID_1, 0);
    const updatedChild2 = createProgressiveChild(CHILD_UUID_2, 1);

    processContentChangeMock.mockImplementation(async (_oldCard: Card, _newContent: string, dataStorage: any) => {
      await dataStorage.saveCard(updatedChild1);
      await dataStorage.saveCard(updatedChild2);
      return [updatedParent, updatedChild1, updatedChild2];
    });

    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [existingParent]),
        saveCard: vi.fn(async (_card: Card) => true)
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          configDir: '.obsidian',
          adapter: {
            exists: vi.fn(async () => false),
            read: vi.fn(async () => JSON.stringify({ decks: [] })),
            write: vi.fn(async () => {})
          },
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDeckCards').mockResolvedValue([updatedChild1, updatedChild2]);

    const result = await storage.saveCard({
      ...existingParent,
      content: '---\nwe_type: progressive-parent\n---\n{{c1::Alpha2}} {{c2::Beta2}}'
    });

    expect(result.success).toBe(true);
    expect(processContentChangeMock).toHaveBeenCalledTimes(1);
    expect(processContentChangeMock.mock.calls[0][0]).toMatchObject({
      uuid: existingParent.uuid,
      type: CardType.ProgressiveParent
    });
    expect(processContentChangeMock.mock.calls[0][1]).toContain('{{c1::Alpha2}}');
    expect(processContentChangeMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        getCardsByUUIDs: expect.any(Function),
        getDeckCards: expect.any(Function),
        saveCard: expect.any(Function),
        deleteCard: expect.any(Function)
      })
    );

    expect(plugin.cardFileService.saveCard).toHaveBeenCalledTimes(3);
    expect(plugin.cardFileService.saveCard).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ uuid: CHILD_UUID_1, type: CardType.ProgressiveChild })
    );
    expect(plugin.cardFileService.saveCard).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ uuid: CHILD_UUID_2, type: CardType.ProgressiveChild })
    );
    expect(plugin.cardFileService.saveCard).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ uuid: PARENT_UUID, type: CardType.ProgressiveParent })
    );
  });

  it('returns SAVE_CANCELLED when gateway cancels progressive parent save', async () => {
    processContentChangeMock.mockReset();
    processContentChangeMock.mockResolvedValue(null);

    const existingParent = createProgressiveParent();
    const plugin = {
      settings: {},
      cardFileService: {
        getAllCards: vi.fn(async () => [existingParent]),
        saveCard: vi.fn(async (_card: Card) => true)
      },
      cardMetadataCache: {
        invalidate: vi.fn()
      },
      app: {
        workspace: {
          trigger: vi.fn()
        },
        vault: {
          configDir: '.obsidian',
          adapter: {
            exists: vi.fn(async () => false),
            read: vi.fn(async () => JSON.stringify({ decks: [] })),
            write: vi.fn(async () => {})
          },
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          cachedRead: vi.fn()
        }
      }
    } as any;

    const storage = new WeaveDataStorage(plugin);
    vi.spyOn(storage, 'getDeckCards').mockResolvedValue([]);

    const result = await storage.saveCard({
      ...existingParent,
      content: 'plain basic content'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('SAVE_CANCELLED');
    expect(plugin.cardFileService.saveCard).not.toHaveBeenCalled();
  });
});
