import { CardState, CardType, type Card } from '../../../data/types';
import {
	getLatestCompletedStudySessionToday,
  isDeckCompleteForToday,
  loadCardsByIds,
  loadDeckCardsForStudy,
  selectNewCardsForStudyQueue
} from '../studyCompletionHelper';

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    uuid: `card-${Math.random().toString(36).slice(2)}`,
    deckId: 'deck-target',
    type: CardType.Basic,
    content: '正面',
    fsrs: {
      due: '2026-03-31T12:00:00.000Z',
      stability: 0,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      retrievability: 1
    },
    tags: [],
    created: '2026-03-30T08:00:00.000Z',
    modified: '2026-03-30T08:00:00.000Z',
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    },
    ...overrides
  } as Card;
}

describe('studyCompletionHelper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows freshly added new cards into today queue even when backlog quota is exhausted', () => {
    const oldNewCard = createCard({
      uuid: 'old-new',
      created: '2026-03-29T08:00:00.000Z',
      modified: '2026-03-29T08:00:00.000Z'
    });
    const freshNewCard = createCard({
      uuid: 'fresh-new',
      created: '2026-03-31T09:30:00.000Z',
      modified: '2026-03-31T09:30:00.000Z'
    });

    const queue = selectNewCardsForStudyQueue([oldNewCard, freshNewCard], 1, 1);

    expect(queue.map(card => card.uuid)).toEqual(['fresh-new']);
  });

  it('does not mark the deck complete when only a freshly added new card remains', async () => {
    const freshNewCard = createCard({
      uuid: 'fresh-new',
      created: '2026-03-31T09:30:00.000Z',
      modified: '2026-03-31T09:30:00.000Z'
    });

    const isComplete = await isDeckCompleteForToday([freshNewCard], 1, 1);

    expect(isComplete).toBe(false);
  });

  it('loads freshly added new cards for study even when today new limit is already used', async () => {
    const oldNewCard = createCard({
      uuid: 'old-new',
      created: '2026-03-29T08:00:00.000Z',
      modified: '2026-03-29T08:00:00.000Z'
    });
    const freshNewCard = createCard({
      uuid: 'fresh-new',
      created: '2026-03-31T09:30:00.000Z',
      modified: '2026-03-31T09:30:00.000Z'
    });

    const dataStorage = {
      getDeckCards: vi.fn(async () => [oldNewCard, freshNewCard]),
      getStudySessions: vi.fn(async () => [
        {
          id: 'session-1',
          deckId: 'deck-target',
          startTime: new Date('2026-03-31T08:00:00.000Z'),
          cardsReviewed: 1,
          newCardsLearned: 1,
          correctAnswers: 1,
          totalTime: 30,
          cardReviews: []
        }
      ])
    } as any;

    const queue = await loadDeckCardsForStudy(
      dataStorage,
      'deck-target',
      1,
      20,
      false
    );

    expect(queue.map(card => card.uuid)).toEqual(['fresh-new']);
  });

  it('loads cards by UUID via targeted lookup before any full scan', async () => {
    const cardA = createCard({ uuid: 'card-a' });
    const cardB = createCard({ uuid: 'card-b' });

    const dataStorage = {
      getCardsByUUIDs: vi.fn(async (ids: string[]) => ids.map(id => id === 'card-b' ? cardB : cardA)),
      getAllCards: vi.fn(async () => {
        throw new Error('should not scan all cards');
      })
    } as any;

    const loaded = await loadCardsByIds(dataStorage, ['card-b', 'card-a']);

    expect(loaded.map(card => card.uuid)).toEqual(['card-b', 'card-a']);
    expect(dataStorage.getCardsByUUIDs).toHaveBeenCalledWith(['card-b', 'card-a']);
    expect(dataStorage.getAllCards).not.toHaveBeenCalled();
  });

	it('returns the latest completed study session today for the same deck', async () => {
		const dataStorage = {
			getStudySessions: vi.fn(async () => [
				{
					id: 'session-old-today',
					deckId: 'deck-target',
					startTime: new Date('2026-03-31T08:00:00.000Z'),
					endTime: new Date('2026-03-31T08:10:00.000Z'),
					cardsReviewed: 3,
					newCardsLearned: 1,
					correctAnswers: 2,
					totalTime: 600,
					cardReviews: [],
					completionReason: 'completed'
				},
				{
					id: 'session-paused-today',
					deckId: 'deck-target',
					startTime: new Date('2026-03-31T10:00:00.000Z'),
					endTime: new Date('2026-03-31T10:10:00.000Z'),
					cardsReviewed: 9,
					newCardsLearned: 0,
					correctAnswers: 5,
					totalTime: 600,
					cardReviews: [],
					completionReason: 'paused-until-next-due'
				},
				{
					id: 'session-latest-completed',
					deckId: 'deck-target',
					startTime: new Date('2026-03-31T11:00:00.000Z'),
					endTime: new Date('2026-03-31T11:20:00.000Z'),
					cardsReviewed: 7,
					newCardsLearned: 2,
					correctAnswers: 6,
					totalTime: 1200,
					cardReviews: [],
					completionReason: 'completed'
				},
				{
					id: 'session-other-deck',
					deckId: 'deck-other',
					startTime: new Date('2026-03-31T11:30:00.000Z'),
					endTime: new Date('2026-03-31T11:40:00.000Z'),
					cardsReviewed: 12,
					newCardsLearned: 0,
					correctAnswers: 10,
					totalTime: 600,
					cardReviews: [],
					completionReason: 'completed'
				},
				{
					id: 'session-yesterday',
					deckId: 'deck-target',
					startTime: new Date('2026-03-30T23:00:00.000Z'),
					endTime: new Date('2026-03-30T23:10:00.000Z'),
					cardsReviewed: 20,
					newCardsLearned: 0,
					correctAnswers: 18,
					totalTime: 600,
					cardReviews: [],
					completionReason: 'completed'
				}
			])
		} as any;

		const session = await getLatestCompletedStudySessionToday(dataStorage, 'deck-target');

		expect(session?.id).toBe('session-latest-completed');
		expect(session?.cardsReviewed).toBe(7);
	});
});
