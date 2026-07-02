import { DataConsistencyService } from '../reference-deck/DataConsistencyService';

describe('DataConsistencyService', () => {
  it('repairs deck caches from YAML truth without rewriting compatibility back references', async () => {
    const decks = [
      {
        id: 'deck-a',
        name: '牌组A',
        cardUUIDs: ['card-stale'],
        modified: '2026-03-30T00:00:00.000Z',
      },
      {
        id: 'deck-b',
        name: '牌组B',
        cardUUIDs: [],
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];

    const cards = [
      {
        uuid: 'card-1',
        content: '---\nwe_decks:\n  - 牌组A\n---\nA',
        referencedByDecks: [],
        modified: '2026-03-30T00:00:00.000Z',
      },
      {
        uuid: 'card-2',
        content: '---\nwe_decks:\n  - 牌组B\n---\nB',
        referencedByDecks: ['deck-a'],
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];

    const saveDeck = vi.fn(async () => ({
      success: true,
      timestamp: '2026-03-30T00:00:00.000Z',
    }));
    const saveCardsBatch = vi.fn(async () => undefined);
    const rebuildFromCards = vi.fn(async () => undefined);

    const plugin = {
      dataStorage: {
        getDecks: vi.fn(async () => decks),
        getCards: vi.fn(async () => cards),
        saveDeck,
        saveCardsBatch,
      },
      deckMembershipIndexService: {
        rebuildFromCards,
      },
    } as any;

    const service = new DataConsistencyService(plugin);

    const checkResult = await service.checkConsistency();
    expect(checkResult.isConsistent).toBe(false);
    expect(checkResult.invalidReferences).toEqual([
      expect.objectContaining({
        deckId: 'deck-a',
        invalidCardUUIDs: expect.arrayContaining(['card-stale', 'card-1']),
      }),
      expect.objectContaining({
        deckId: 'deck-b',
        invalidCardUUIDs: expect.arrayContaining(['card-2']),
      }),
    ]);
    expect(checkResult.inconsistentBackReferences).toEqual([]);

    const repairResult = await service.repairConsistency();

    expect(repairResult).toEqual({
      success: true,
      repairedCards: 0,
      cleanedInvalidRefs: 3,
    });
    expect(saveDeck).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'deck-a',
      cardUUIDs: ['card-1'],
    }));
    expect(saveDeck).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'deck-b',
      cardUUIDs: ['card-2'],
    }));
    expect(saveCardsBatch).not.toHaveBeenCalled();
    expect(rebuildFromCards).toHaveBeenCalledWith(
      [
        expect.objectContaining({ uuid: 'card-1', referencedByDecks: [] }),
        expect.objectContaining({ uuid: 'card-2', referencedByDecks: ['deck-a'] }),
      ],
      decks,
    );
  });

  it('uses YAML we_decks instead of stale deckId when checking membership', async () => {
    const decks = [
      {
        id: 'deck-a',
        name: '牌组A',
        cardUUIDs: ['card-1'],
        modified: '2026-03-30T00:00:00.000Z',
      },
      {
        id: 'deck-b',
        name: '牌组B',
        cardUUIDs: [],
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];
    const cards = [
      {
        uuid: 'card-1',
        deckId: 'deck-a',
        content: '---\nwe_decks:\n  - 牌组B\n---\nA',
        referencedByDecks: ['deck-a'],
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];

    const plugin = {
      dataStorage: {
        getDecks: vi.fn(async () => decks),
        getCards: vi.fn(async () => cards),
        saveDeck: vi.fn(async () => ({ success: true, timestamp: '2026-03-30T00:00:00.000Z' })),
      },
    } as any;

    const service = new DataConsistencyService(plugin);
    const checkResult = await service.checkConsistency();

    expect(checkResult.invalidReferences).toEqual([
      expect.objectContaining({
        deckId: 'deck-a',
        invalidCardUUIDs: ['card-1'],
      }),
      expect.objectContaining({
        deckId: 'deck-b',
        invalidCardUUIDs: ['card-1'],
      }),
    ]);
  });

  it('rewrites .wdeck placement from YAML we_decks during repair', async () => {
    const decks = [
      {
        id: 'deck-b',
        name: '牌组B',
        purpose: 'memory',
        cardUUIDs: [],
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];
    const cards = [
      {
        uuid: 'card-1',
        deckId: 'deck-a',
        content: '---\nwe_decks:\n  - 牌组B\n---\nA',
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];
    const replaceDeckCardsForDeck = vi.fn(async () => []);

    const plugin = {
      dataStorage: {
        getDecks: vi.fn(async () => decks),
        getCards: vi.fn(async () => cards),
        saveDeck: vi.fn(async () => ({ success: true, timestamp: '2026-03-30T00:00:00.000Z' })),
      },
      wdeckService: {
        replaceDeckCardsForDeck,
      },
    } as any;

    const service = new DataConsistencyService(plugin);
    await service.repairConsistency();

    expect(replaceDeckCardsForDeck).toHaveBeenCalledWith(
      { id: 'deck-b', name: '牌组B' },
      [expect.objectContaining({ uuid: 'card-1' })]
    );
  });

  it('backfills missing we_decks from physical WDeck placement before repairing caches', async () => {
    const decks = [
      {
        id: 'wdeck:未归组卡片',
        name: '未归组卡片',
        purpose: 'memory',
        cardUUIDs: ['card-orphan'],
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];
    const cardsBefore = [
      {
        uuid: 'card-orphan',
        content: '---\nwe_type: basic\ncreated: "2026-01-01"\n---\n正文',
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];
    const cardsAfter = [
      {
        uuid: 'card-orphan',
        content:
          '---\nwe_type: basic\ncreated: "2026-01-01"\nwe_decks:\n  - 未归组卡片\n---\n正文',
        modified: '2026-03-30T00:00:00.000Z',
      },
    ];

    const saveCardsBatch = vi.fn(async () => undefined);
    let cardReads = 0;
    const replaceDeckCardsForDeck = vi.fn(async () => []);

    const plugin = {
      dataStorage: {
        getDecks: vi.fn(async () => decks),
        getCards: vi.fn(async () => {
          cardReads += 1;
          return cardReads === 1 ? cardsBefore : cardsAfter;
        }),
        saveDeck: vi.fn(async () => ({ success: true, timestamp: '2026-03-30T00:00:00.000Z' })),
        saveCardsBatch,
      },
      wdeckService: {
        getAllDeckSummaries: vi.fn(async () => [
          {
            logicalDeckName: '未归组卡片',
            cardUUIDs: ['card-orphan'],
          },
        ]),
        replaceDeckCardsForDeck,
      },
    } as any;

    const service = new DataConsistencyService(plugin);
    const repairResult = await service.repairConsistency();

    expect(saveCardsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        uuid: 'card-orphan',
        content: expect.stringContaining('we_decks'),
      }),
    ]);
    expect(repairResult).toMatchObject({
      success: true,
      repairedCards: 1,
    });
    expect(replaceDeckCardsForDeck).toHaveBeenCalledWith(
      { id: 'wdeck:未归组卡片', name: '未归组卡片' },
      [expect.objectContaining({ uuid: 'card-orphan' })]
    );
  });

  it('repairs we_decks that mistakenly store deck IDs instead of names', async () => {
    const decks = [
      {
        id: 'deck_a',
        name: '牌组A',
        cardUUIDs: ['card-id-mistake'],
        modified: '2026-06-15T00:00:00.000Z',
      },
    ];

    const cards = [
      {
        uuid: 'card-id-mistake',
        content: '---\nwe_decks:\n  - deck_a\n---\n正文',
        referencedByDecks: [],
        modified: '2026-06-15T00:00:00.000Z',
      },
    ];

    const saveCardsBatch = vi.fn(async () => undefined);
    const saveDeck = vi.fn(async () => ({
      success: true,
      timestamp: '2026-06-15T00:00:00.000Z',
    }));

    const plugin = {
      dataStorage: {
        getDecks: vi.fn(async () => decks),
        getCards: vi.fn(async () => cards),
        saveDeck,
        saveCardsBatch,
      },
    } as any;

    const service = new DataConsistencyService(plugin);
    const repairResult = await service.repairConsistency();

    expect(saveCardsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        uuid: 'card-id-mistake',
        content: expect.stringContaining('牌组A'),
      }),
    ]);
    expect(repairResult).toMatchObject({
      success: true,
      repairedCards: 1,
    });
  });
});
