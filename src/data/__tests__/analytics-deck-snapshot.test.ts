import { afterEach, describe, expect, it } from 'vitest';
import { AnalyticsService } from '../analytics';
import { CardState, Rating } from '../types';

function createDeck(id: string, name: string) {
  return {
    id,
    name,
    description: '',
    category: '',
    path: id,
    level: 0,
    order: 0,
    inheritSettings: false,
    settings: {},
    stats: {},
    includeSubdecks: false,
    created: '2026-04-01T00:00:00.000Z',
    modified: '2026-04-01T00:00:00.000Z',
    tags: [],
    metadata: {}
  } as any;
}

function createCard(input: {
  uuid: string;
  deckId: string;
  created?: string;
  due?: string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  retrievability?: number;
  state?: number;
  tags?: string[];
  reviewHistory?: Array<{
    review: string;
    due: string;
    elapsedDays: number;
    rating?: number;
  }>;
}) {
  return {
    uuid: input.uuid,
    deckId: input.deckId,
    created: input.created ?? '2026-04-01T00:00:00.000Z',
    content: '',
    tags: input.tags ?? ['tag-a'],
    fsrs: {
      due: input.due ?? '2026-04-20T00:00:00.000Z',
      stability: input.stability ?? 15,
      difficulty: input.difficulty ?? 5,
      elapsedDays: input.elapsedDays ?? 2,
      scheduledDays: 3,
      reps: 1,
      lapses: 0,
      state: input.state ?? CardState.Review,
      retrievability: input.retrievability ?? 0.92
    },
    reviewHistory: (input.reviewHistory ?? []).map((review) => ({
      rating: review.rating ?? Rating.Good,
      state: CardState.Review,
      due: review.due,
      stability: input.stability ?? 15,
      difficulty: input.difficulty ?? 5,
      elapsedDays: review.elapsedDays,
      lastElapsedDays: Math.max(0, review.elapsedDays - 1),
      scheduledDays: Math.max(1, review.elapsedDays),
      review: review.review
    }))
  } as any;
}

function createStorage(cards: any[], decks: any[]) {
  return {
    getDecks: async () => decks,
    getDeckCards: async (deckId: string) => cards.filter((card) => card.deckId === deckId),
    getCards: async () => cards
  } as any;
}

const services: AnalyticsService[] = [];

afterEach(() => {
  while (services.length > 0) {
    services.pop()?.destroy();
  }
});

describe('AnalyticsService.getDeckAnalyticsSnapshot', () => {
  it('supports multi-deck snapshots and emits comparison series for each selected deck', async () => {
    const decks = [createDeck('deck-a', '牌组 A'), createDeck('deck-b', '牌组 B')];
    const cards = [
      createCard({ uuid: 'card-a', deckId: 'deck-a', reviewHistory: [{ review: '2026-04-10T09:00:00.000Z', due: '2026-04-10T09:00:00.000Z', elapsedDays: 3 }] }),
      createCard({ uuid: 'card-b', deckId: 'deck-b', reviewHistory: [{ review: '2026-04-11T09:00:00.000Z', due: '2026-04-11T09:00:00.000Z', elapsedDays: 4 }] })
    ];
    const service = new AnalyticsService(createStorage(cards, decks));
    services.push(service);

    const snapshot = await service.getDeckAnalyticsSnapshot({
      deckIds: ['deck-a', 'deck-b'],
      days: 7
    });

    expect(snapshot.summary.selectedDeckIds).toEqual(['deck-a', 'deck-b']);
    expect(snapshot.summary.selectedDeckNames).toEqual(['牌组 A', '牌组 B']);
    expect(snapshot.retention.comparisonSeries).toHaveLength(2);
    expect(snapshot.summary.totalCards).toBe(2);
  });

  it('returns an empty snapshot for unknown decks instead of throwing', async () => {
    const service = new AnalyticsService(createStorage([], [createDeck('deck-a', '牌组 A')]));
    services.push(service);

    const snapshot = await service.getDeckAnalyticsSnapshot({
      deckIds: ['missing-deck'],
      days: 7
    });

    expect(snapshot.summary.totalCards).toBe(0);
    expect(snapshot.summary.reviewedCards).toBe(0);
    expect(snapshot.summary.hasReviewData).toBe(false);
    expect(snapshot.retention.comparisonSeries).toEqual([]);
  });

  it('filters review history by the requested time range', async () => {
    const decks = [createDeck('deck-a', '牌组 A')];
    const cards = [
      createCard({
        uuid: 'card-a',
        deckId: 'deck-a',
        reviewHistory: [
          { review: '2026-04-09T09:00:00.000Z', due: '2026-04-09T09:00:00.000Z', elapsedDays: 2 },
          { review: '2026-04-10T09:00:00.000Z', due: '2026-04-10T09:00:00.000Z', elapsedDays: 3 }
        ]
      })
    ];
    const service = new AnalyticsService(createStorage(cards, decks));
    services.push(service);

    const snapshot = await service.getDeckAnalyticsSnapshot({
      deckIds: ['deck-a'],
      since: '2026-04-10T00:00:00.000Z',
      until: '2026-04-10T23:59:59.999Z',
      days: 3
    });

    expect(snapshot.summary.reviewedCards).toBe(1);
    expect(snapshot.timing.ontime.some((value) => value === 100)).toBe(true);
    expect(snapshot.timing.late.every((value) => value === 0)).toBe(true);
  });

  it('can switch forecast data to global load without changing the selected deck scope', async () => {
    const decks = [createDeck('deck-a', '牌组 A'), createDeck('deck-b', '牌组 B')];
    const cards = [
      createCard({ uuid: 'card-a', deckId: 'deck-a', due: '2026-04-30T00:00:00.000Z', reviewHistory: [] }),
      createCard({ uuid: 'card-b', deckId: 'deck-b', due: new Date().toISOString(), reviewHistory: [] })
    ];
    const service = new AnalyticsService(createStorage(cards, decks));
    services.push(service);

    const localSnapshot = await service.getDeckAnalyticsSnapshot({
      deckIds: ['deck-a'],
      days: 3,
      dailyCapacity: 10,
      useGlobalLoad: false
    });
    const globalSnapshot = await service.getDeckAnalyticsSnapshot({
      deckIds: ['deck-a'],
      days: 3,
      dailyCapacity: 10,
      useGlobalLoad: true
    });

    expect(localSnapshot.forecast[0]?.total).toBe(0);
    expect(globalSnapshot.forecast[0]?.total).toBe(1);
  });

  it('keeps retention actual values empty when no review history exists', async () => {
    const decks = [createDeck('deck-a', '牌组 A')];
    const cards = [
      createCard({
        uuid: 'card-a',
        deckId: 'deck-a',
        reviewHistory: []
      })
    ];
    const service = new AnalyticsService(createStorage(cards, decks));
    services.push(service);

    const snapshot = await service.getDeckAnalyticsSnapshot({
      deckIds: ['deck-a'],
      days: 5
    });

    expect(snapshot.summary.hasReviewData).toBe(false);
    expect(snapshot.retention.points.every((point) => point.actualRetention === null)).toBe(true);
  });
});
