import { fireEvent, render } from '@testing-library/svelte';

import type { Deck, DeckStats } from '../../data/types';
import { COLOR_SCHEMES } from '../../config/card-color-schemes';
import DeckGridCard from './DeckGridCard.svelte';
import ChineseElegantDeckCard from './ChineseElegantDeckCard.svelte';

const baseDeck = {
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
  metadata: {}
} as Deck;

const baseStats = {
  totalCards: 10,
  newCards: 3,
  learningCards: 2,
  reviewCards: 1,
  todayNew: 0,
  todayReview: 0,
  todayTime: 0,
  totalReviews: 0,
  totalTime: 0,
  memoryRate: 0,
  averageEase: 0,
  forecastDays: {}
} satisfies DeckStats;

describe('deck card menu interactions', () => {
  const cases = [
    {
      name: 'DeckGridCard',
      component: DeckGridCard,
      props: {
        deck: baseDeck,
        stats: baseStats,
        colorScheme: COLOR_SCHEMES[0]
      }
    },
    {
      name: 'ChineseElegantDeckCard',
      component: ChineseElegantDeckCard,
      props: {
        deck: baseDeck,
        stats: baseStats
      }
    }
  ] as const;

  it.each(cases)('prevents menu click from opening study for $name', async ({ component, props }) => {
    const onStudy = vi.fn();
    const onMenu = vi.fn();
    const { container } = render(component, {
      props: {
        ...props,
        onStudy,
        onMenu
      }
    });

    const menuButton = container.querySelector('.menu-btn') as HTMLButtonElement | null;

    expect(menuButton).not.toBeNull();

    await fireEvent.click(menuButton!);

    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(onStudy).not.toHaveBeenCalled();
  });

  it.each(cases)('opens study when activating the card for $name', async ({ component, props }) => {
    const onStudy = vi.fn();
    const onMenu = vi.fn();
    const { container } = render(component, {
      props: {
        ...props,
        onStudy,
        onMenu
      }
    });

    const card = container.firstElementChild as HTMLElement | null;

    expect(card).not.toBeNull();

    await fireEvent.keyDown(card!, { key: 'Enter' });
    expect(onStudy).toHaveBeenCalledTimes(1);
    expect(onMenu).not.toHaveBeenCalled();
  });
});
