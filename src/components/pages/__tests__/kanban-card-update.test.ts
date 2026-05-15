import type { Card, Deck } from '../../../data/types';
import {
  applyDeckDragToCard,
  applyPriorityUpdateToCard,
  applyQuestionBankDeckDragToCard,
  getQuestionBankDeckIdsForCard,
  resolveKanbanCardUpdate
} from '../kanban-card-update';

const NOW = '2026-03-31T00:00:00.000Z';

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    uuid: overrides.uuid || 'card-1',
    content: overrides.content || 'Front\n---div---\nBack',
    stats: overrides.stats || {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    },
    created: overrides.created || NOW,
    modified: overrides.modified || NOW,
    tags: overrides.tags || [],
    ...overrides
  } as Card;
}

const decks: Deck[] = [
  { id: 'deck-a', name: '牌组 A' } as Deck,
  { id: 'deck-b', name: '牌组 B' } as Deck
];

describe('resolveKanbanCardUpdate', () => {
  it('更新优先级时会同时写回 YAML 中的 we_priority', () => {
    const existingCard = createCard({
      content: `---
we_decks:
  - 牌组 A
---
Front
---div---
Back`,
      priority: 1
    });

    const updatedCard = applyPriorityUpdateToCard(existingCard, 4, NOW);

    expect(updatedCard.priority).toBe(4);
    expect(updatedCard.modified).toBe(NOW);
    expect(updatedCard.content).toContain('we_priority: 4');
    expect(updatedCard.content).toContain('- 牌组 A');
  });

  it('把按优先级分组的拖拽识别为普通保存，而不是跨牌组移动', () => {
    const existingCard = createCard({
      content: `---
we_decks:
  - 牌组 A
---
Front
---div---
Back`,
      priority: 1
    });

    const updatedCard = createCard({
      ...existingCard,
      priority: 4,
      deckId: undefined
    });

    expect(resolveKanbanCardUpdate(existingCard, updatedCard, decks)).toEqual({
      oldDeckId: 'deck-a',
      newDeckId: 'deck-a',
      effectiveDeckId: 'deck-a',
      isMove: false
    });
  });

  it('在主牌组变更时识别为跨牌组移动', () => {
    const existingCard = createCard({
      content: `---
we_decks:
  - 牌组 A
---
Front
---div---
Back`
    });

    const updatedCard = createCard({
      ...existingCard,
      deckId: 'deck-b',
      content: `---
we_decks:
  - 牌组 B
---
Front
---div---
Back`
    });

    expect(resolveKanbanCardUpdate(existingCard, updatedCard, decks)).toEqual({
      oldDeckId: 'deck-a',
      newDeckId: 'deck-b',
      effectiveDeckId: 'deck-b',
      isMove: true
    });
  });

  it('在旧字段卡片上保留有效牌组，避免普通属性更新被误判为无牌组', () => {
    const existingCard = createCard({
      deckId: 'deck-a',
      content: 'Front\n---div---\nBack',
      priority: 2
    });

    const updatedCard = createCard({
      ...existingCard,
      priority: 3,
      deckId: undefined
    });

    expect(resolveKanbanCardUpdate(existingCard, updatedCard, decks)).toEqual({
      oldDeckId: 'deck-a',
      newDeckId: undefined,
      effectiveDeckId: 'deck-a',
      isMove: false
    });
  });

  it('记忆卡拖拽到新牌组时会直接替换为单正式牌组', () => {
    const existingCard = createCard({
      content: `---
we_decks:
  - 牌组 A
---
Front
---div---
Back`,
      referencedByDecks: ['deck-a']
    });

    const updatedCard = applyDeckDragToCard(existingCard, decks, 'deck-b', 'add', 'deck-a', NOW);

    expect(updatedCard.content).toContain('- 牌组 B');
    expect(updatedCard.content).not.toContain('- 牌组 A');
    expect(updatedCard.deckId).toBe('deck-b');
    expect(updatedCard.referencedByDecks).toEqual(['deck-b']);
    expect(updatedCard.modified).toBe(NOW);
  });

  it('记忆卡拖拽时不会保留旧的多牌组残留', () => {
    const existingCard = createCard({
      content: `---
we_decks:
  - 牌组 A
  - 牌组 C
---
Front
---div---
Back`,
      referencedByDecks: ['deck-a', 'deck-c']
    });
    const extendedDecks: Deck[] = [
      ...decks,
      { id: 'deck-c', name: '牌组 C' } as Deck
    ];

    const updatedCard = applyDeckDragToCard(
      existingCard,
      extendedDecks,
      'deck-b',
      'replace-source',
      'deck-a',
      NOW
    );

    expect(updatedCard.content).not.toContain('- 牌组 A');
    expect(updatedCard.content).toContain('- 牌组 B');
    expect(updatedCard.content).not.toContain('- 牌组 C');
    expect(updatedCard.referencedByDecks).toEqual(['deck-b']);
  });

  it('题库拖拽选择新增时保留原题库并加入目标题库', () => {
    const existingCard = createCard({
      deckId: 'bank-a',
      referencedByDecks: ['bank-a'],
      metadata: {
        questionBankDeckIds: ['bank-a']
      } as any
    });

    const updatedCard = applyQuestionBankDeckDragToCard(
      existingCard,
      'bank-b',
      'add',
      'bank-a',
      NOW
    );

    expect(getQuestionBankDeckIdsForCard(updatedCard)).toEqual(['bank-a', 'bank-b']);
    expect(updatedCard.content).toBe(existingCard.content);
    expect(updatedCard.modified).toBe(NOW);
  });

  it('题库拖拽选择替换当前列时只移除来源题库', () => {
    const existingCard = createCard({
      deckId: 'bank-a',
      referencedByDecks: ['bank-a', 'bank-c'],
      metadata: {
        questionBankDeckIds: ['bank-a', 'bank-c']
      } as any
    });

    const updatedCard = applyQuestionBankDeckDragToCard(
      existingCard,
      'bank-b',
      'replace-source',
      'bank-a',
      NOW
    );

    expect(getQuestionBankDeckIdsForCard(updatedCard)).toEqual(['bank-c', 'bank-b']);
    expect(updatedCard.referencedByDecks).not.toContain('bank-a');
    expect(updatedCard.content).toBe(existingCard.content);
  });
});
