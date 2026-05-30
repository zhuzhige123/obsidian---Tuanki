import { App } from 'obsidian';

import { AnkiConnectService } from './AnkiConnectService';
import type { Card } from '../../data/types';
import type { ExportResult, SyncItemResult } from '../../types/ankiconnect-types';

function createCard(uuid: string): Card {
  return {
    uuid,
    content: 'Q: 2 + 2 = ?（B）\n\nA. 3\nB. 4\nC. 5',
    type: 'multiple' as Card['type'],
    created: '2026-04-01T00:00:00.000Z',
    modified: '2026-04-01T00:00:00.000Z',
    tags: [],
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    }
  };
}

function createExportResult(item: SyncItemResult): ExportResult {
  return {
    success: true,
    totalCards: 1,
    exportedCards: 1,
    createdModels: 0,
    createdCards: item.outcome === 'created' ? 1 : 0,
    updatedCards: item.outcome === 'updated' ? 1 : 0,
    unchangedCards: item.outcome === 'unchanged' ? 1 : 0,
    duplicateCards: 0,
    skippedCards: item.outcome === 'unchanged' ? 1 : 0,
    failedCards: 0,
    warningCards: 0,
    errors: [],
    items: [item],
    summary: {
      totalCards: 1,
      exportedCards: 1,
      skippedCards: item.outcome === 'unchanged' ? 1 : 0,
      createdCards: item.outcome === 'created' ? 1 : 0,
      updatedCards: item.outcome === 'updated' ? 1 : 0,
      unchangedCards: item.outcome === 'unchanged' ? 1 : 0,
      duplicateCards: 0,
      failedCards: 0,
      warningCards: 0,
      failureReasons: {},
      warningReasons: {}
    }
  };
}

function createService() {
  const app = new App();
  const plugin = {
    app,
    settings: {
      ankiConnect: {
        mediaSync: {
          enabled: true,
          createBacklinks: false
        }
      }
    },
    dataStorage: {
      getCards: vi.fn()
    }
  } as any;

  const settings = {
    endpoint: 'http://localhost:8765',
    mediaSync: {
      enabled: true,
      createBacklinks: false
    },
    autoSync: {
      enabled: false,
      intervalMinutes: 5,
      syncOnStartup: false,
      onlyWhenAnkiRunning: false,
      enableFileWatcher: false
    },
    deckMappings: {}
  } as any;

  return {
    plugin,
    service: new AnkiConnectService(plugin, app, settings)
  };
}

describe('AnkiConnectService.repairModelMismatchNotes', () => {
  it('archives the mismatched note and recreates the correct model note', async () => {
    const { plugin, service } = createService();
    const card = createCard('card-choice-1');

    plugin.dataStorage.getCards.mockResolvedValue([card]);

    const client = {
      getDeckNames: vi.fn().mockResolvedValue([]),
      createDeck: vi.fn().mockResolvedValue(1),
      getNotesInfo: vi.fn().mockResolvedValue([
        {
          noteId: 101,
          modelName: '【Weave】问答题',
          tags: ['legacy-tag'],
          fields: {
            question: '2 + 2 = ?',
            answer: '4',
            weave_card_id: 'card-choice-1',
            weave_template_id: 'official-qa'
          },
          cards: [201],
          mod: 1
        }
      ]),
      updateNoteFields: vi.fn().mockResolvedValue(undefined),
      updateNoteTags: vi.fn().mockResolvedValue(undefined),
      changeDeck: vi.fn().mockResolvedValue(undefined),
      suspendCards: vi.fn().mockResolvedValue(undefined)
    };

    const cardExporter = {
      exportCardsIncremental: vi.fn().mockResolvedValue(
        createExportResult({
          cardId: 'card-choice-1',
          preview: '2 + 2 = ?',
          deckName: 'Target Deck',
          noteId: 202,
          modelName: '【Weave】选择题',
          outcome: 'created'
        })
      )
    };

    const incrementalTracker = {
      persist: vi.fn().mockResolvedValue(undefined)
    };

    (service as any).client = client;
    (service as any).cardExporter = cardExporter;
    (service as any).incrementalTracker = incrementalTracker;

    const result = await service.repairModelMismatchNotes([
      {
        cardId: 'card-choice-1',
        preview: '2 + 2 = ?',
        deckName: 'Target Deck',
        noteId: 101,
        modelName: '【Weave】选择题',
        existingModelName: '【Weave】问答题',
        targetModelName: '【Weave】选择题',
        outcome: 'failed',
        reason: 'model_mismatch',
        message: 'Anki 中已存在不同模型的同步记录：问答题 → 选择题'
      }
    ]);

    expect(client.createDeck).toHaveBeenCalledWith('Weave::模型迁移存档');
    expect(client.updateNoteFields).toHaveBeenCalledWith(101, {
      weave_card_id: '',
      weave_template_id: ''
    });
    expect(client.updateNoteTags).toHaveBeenCalledWith(
      101,
      expect.arrayContaining(['legacy-tag', 'weave-model-mismatch-archive'])
    );
    expect(client.changeDeck).toHaveBeenCalledWith([201], 'Weave::模型迁移存档');
    expect(client.suspendCards).toHaveBeenCalledWith([201]);
    expect(cardExporter.exportCardsIncremental).toHaveBeenCalledWith([card], 'Target Deck');
    expect(incrementalTracker.persist).toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.archivedCards).toBe(1);
    expect(result.fixedCards).toBe(1);
    expect(result.archivedOnlyCards).toBe(0);
    expect(result.failedCards).toBe(0);
    expect(result.items[0]).toMatchObject({
      cardId: 'card-choice-1',
      archivedNoteId: 101,
      recreatedNoteId: 202,
      outcome: 'fixed'
    });
  });
});
