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
});
