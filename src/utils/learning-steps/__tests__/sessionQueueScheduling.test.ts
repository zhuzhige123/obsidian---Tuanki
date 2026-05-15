import { CardState, CardType, type Card } from '../../../data/types';
import { requeueFutureDueCards } from '../sessionQueueScheduling';

function createReviewCard(uuid: string, due: string): Card {
  return {
    uuid,
    deckId: 'deck-target',
    type: CardType.Basic,
    content: uuid,
    fsrs: {
      due,
      stability: 3,
      difficulty: 5,
      elapsedDays: 1,
      scheduledDays: 3,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      retrievability: 0.9
    },
    tags: [],
    created: '2026-03-31T08:00:00.000Z',
    modified: '2026-03-31T08:00:00.000Z',
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    }
  } as Card;
}

describe('sessionQueueScheduling', () => {
  it('requeues future-due cards in normal study mode', () => {
    const nowMs = Date.parse('2026-03-31T12:00:00.000Z');
    const queue = [
      createReviewCard('current', '2026-03-31T11:00:00.000Z'),
      createReviewCard('future', '2026-03-31T21:00:00.000Z'),
      createReviewCard('due-now', '2026-03-31T11:30:00.000Z')
    ];

    const result = requeueFutureDueCards(queue, 0, nowMs);

    expect(result).toEqual({
      nextIndex: 1,
      movedCount: 1,
      nextPendingDueAt: '2026-03-31T21:00:00.000Z'
    });
    expect(queue.map(card => card.uuid)).toEqual(['current', 'due-now', 'future']);
  });

  it('keeps future-due cards available in advance study mode', () => {
    const nowMs = Date.parse('2026-03-31T12:00:00.000Z');
    const queue = [
      createReviewCard('current', '2026-03-31T11:00:00.000Z'),
      createReviewCard('future', '2026-03-31T21:00:00.000Z'),
      createReviewCard('later', '2026-04-01T09:00:00.000Z')
    ];

    const result = requeueFutureDueCards(queue, 0, nowMs, {
      allowFutureDueCards: true
    });

    expect(result).toEqual({
      nextIndex: 1,
      movedCount: 0,
      nextPendingDueAt: null
    });
    expect(queue.map(card => card.uuid)).toEqual(['current', 'future', 'later']);
  });

  it('continues within the current fixed queue when only pending cards remain', () => {
    const nowMs = Date.parse('2026-03-31T12:00:00.000Z');
    const queue = [
      createReviewCard('current', '2026-03-31T11:00:00.000Z'),
      createReviewCard('future', '2026-03-31T21:00:00.000Z')
    ];

    const result = requeueFutureDueCards(queue, 0, nowMs, {
      continueWithPendingCards: true
    });

    expect(result).toEqual({
      nextIndex: 1,
      movedCount: 1,
      nextPendingDueAt: '2026-03-31T21:00:00.000Z'
    });
    expect(queue.map(card => card.uuid)).toEqual(['current', 'future']);
  });
});
