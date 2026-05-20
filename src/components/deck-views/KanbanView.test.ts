import { render, waitFor } from '@testing-library/svelte';

import type { Deck, DeckStats } from '../../data/types';
import KanbanView from './KanbanView.svelte';

const groupDecksMock = vi.hoisted(() => vi.fn(async (decks: Deck[]) => ({ completed: decks })));
const updateDeckStatsMock = vi.hoisted(() => vi.fn());

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<typeof import('../../tests/mocks/obsidian')>('../../tests/mocks/obsidian');

  class Menu {
    addItem(callback: (item: any) => void) {
      callback({
        setTitle: () => this,
        setIcon: () => this,
        setChecked: () => this,
        setIsLabel: () => this,
        setDisabled: () => this,
        onClick: () => this,
        setSubmenu: () => new Menu(),
        setWarning: () => this
      });
      return this;
    }

    addSeparator() {
      return this;
    }

    showAtMouseEvent() {
      return this;
    }

    showAtPosition() {
      return this;
    }

    setUseNativeMenu() {
      return this;
    }

    onHide() {
      return this;
    }

    hide() {
      return this;
    }
  }

  return {
    ...actual,
    Menu,
    Notice: class Notice {},
  };
});

vi.mock('../../utils/i18n', () => ({
  tr: {
    subscribe(callback: (value: (key: string, vars?: Record<string, string>) => string) => void) {
      callback((key: string) => key);
      return () => {};
    }
  }
}));

vi.mock('../../utils/vault-local-storage', () => ({
  vaultStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
}));

vi.mock('../../services/premium/PremiumFeatureGuard', () => ({
  PREMIUM_FEATURES: {
    DECK_ANALYTICS: 'deck_analytics',
    QUESTION_BANK: 'question_bank'
  },
  PremiumFeatureGuard: {
    getInstance() {
      return {
        isPremiumActive: {
          subscribe(callback: (value: boolean) => void) {
            callback(false);
            return () => {};
          }
        },
        premiumFeaturesPreviewEnabled: {
          subscribe(callback: (value: boolean) => void) {
            callback(false);
            return () => {};
          }
        },
        shouldShowFeatureEntry: () => false,
        canUseFeature: () => false
      };
    }
  }
}));

vi.mock('../modals/QuestionBankAnalyticsModalObsidian', () => ({
  QuestionBankAnalyticsModalObsidian: class QuestionBankAnalyticsModalObsidian {
    open() {}
    close() {}
  }
}));

vi.mock('../../utils/obsidian-confirm', () => ({
  showObsidianConfirm: vi.fn(async () => false)
}));

vi.mock('../../services/deck/DeckAggregationService', () => ({
  DeckAggregationService: class DeckAggregationService {
    constructor(_storage: unknown, _deckStats?: Record<string, DeckStats>) {}

    updateDeckStats(deckStats: Record<string, DeckStats>) {
      updateDeckStatsMock(deckStats);
    }

    clearCache() {}

    async groupDecks(decks: Deck[]) {
      return groupDecksMock(decks);
    }
  }
}));

function createDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: '测试牌组',
    description: '',
    category: '',
    path: '测试牌组',
    level: 0,
    order: 0,
    inheritSettings: false,
    settings: {} as Deck['settings'],
    stats: {} as DeckStats,
    includeSubdecks: false,
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    tags: [],
    metadata: {},
    ...overrides
  } as Deck;
}

function createStats(newCards: number): DeckStats {
  return {
    totalCards: 21,
    newCards,
    learningCards: 0,
    reviewCards: 0,
    todayNew: 0,
    todayReview: 0,
    todayTime: 0,
    totalReviews: 0,
    totalTime: 0,
    memoryRate: 0,
    averageEase: 0,
    forecastDays: {}
  };
}

describe('KanbanView', () => {
  beforeEach(() => {
    groupDecksMock.mockClear();
    updateDeckStatsMock.mockClear();
  });

  it('updates visible deck card stats after deckStats props change without remounting the view', async () => {
    const deck = createDeck();
    const deckTree = [{ deck, children: [] }] as any;
    const baseProps = {
      deckTree,
      deckStats: {
        [deck.id]: createStats(0)
      },
      dataStorage: {} as any,
      plugin: {
        settings: {
          deckCardStyle: 'default',
          deckTagGroups: []
        },
        saveSettings: vi.fn(async () => {})
      } as any,
      groupBy: 'completion' as const,
      deckMode: 'memory' as const,
      onStartStudy: vi.fn()
    };

    const rendered = render(KanbanView, {
      props: baseProps
    });

    await waitFor(() => {
      const statNumbers = Array.from(rendered.container.querySelectorAll('.deck-card-stat-num')).map((node) => node.textContent?.trim());
      expect(statNumbers).toEqual(['0', '0', '0']);
    });

    await rendered.rerender({
      ...baseProps,
      deckStats: {
        [deck.id]: createStats(21)
      }
    });

    await waitFor(() => {
      const statNumbers = Array.from(rendered.container.querySelectorAll('.deck-card-stat-num')).map((node) => node.textContent?.trim());
      expect(statNumbers).toEqual(['21', '0', '0']);
    });
  });

	it('uses emergent deck views instead of formal deck tree when memory deck display mode is emergent', async () => {
		const formalDeck = createDeck({ id: 'formal-deck', name: '正式牌组' });
		const deckTree = [{ deck: formalDeck, children: [] }] as any;
		const plugin = {
			settings: {
				deckCardStyle: 'default',
				deckTagGroups: []
			},
			saveSettings: vi.fn(async () => {})
		} as any;

		render(KanbanView, {
			props: {
				deckTree,
				deckStats: {},
				dataStorage: {} as any,
				plugin,
				deckMode: 'memory' as const,
				memoryDeckDisplayMode: 'emergent' as const,
				emergentDeckViews: [
					{
						id: 'emergent-deck',
						name: '涌现牌组',
						kind: 'emergent' as const,
						statusBadge: '自动聚合',
						cardUUIDs: ['card-1'],
						score: 1,
						sourceTags: ['anatomy']
					}
				],
				onStartStudy: vi.fn(),
				onStartEmergentStudy: vi.fn()
			}
		});

		await waitFor(() => {
			expect(groupDecksMock).toHaveBeenCalled();
		});

		const groupedDecksArg = groupDecksMock.mock.calls.at(-1)?.[0] as Deck[];
		expect(groupedDecksArg.map((deck) => deck.id)).toEqual(['emergent-deck']);
		expect(groupedDecksArg[0]?.cardUUIDs).toEqual(['card-1']);
	});
});
