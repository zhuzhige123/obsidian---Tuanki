import { describe, it, expect, beforeEach } from 'vitest';
import { FSRS } from '../src/algorithms/fsrs';
import { Rating, CardState, type FSRSCard } from '../src/data/types';

function create(): FSRSCard {
  const fsrs = new FSRS({ enableFuzz: false });
  return fsrs.createCard();
}

describe('FSRS core scheduling', () => {
  let fsrs: FSRS;
  beforeEach(() => { fsrs = new FSRS({ enableFuzz: false, requestRetention: 0.9, maximumInterval: 365 }); });

  it('initializes card with New state', () => {
    const c = fsrs.createCard();
    expect(c.state).toBe(CardState.New);
  });

  it('good on new moves to learning and sets due', () => {
    const c = create();
    const base = new Date('2025-01-01T00:00:00Z');
    const { card, log } = fsrs.review(c, Rating.Good, base.toISOString());
    expect(card.state === CardState.Learning || card.state === CardState.Review).toBeTruthy();
    // 允许同日（学习阶段可能保持同日），至少不早于当次复习
    const dueTime = new Date(card.due);
    expect(dueTime.getTime()).toBeGreaterThanOrEqual(base.getTime());
    expect(log.rating).toBe(Rating.Good);
  });

  it('recall increases stability more than hard', () => {
    let c = create();
    c.lastReview = new Date('2025-01-01T00:00:00Z');
    c.state = CardState.Review; c.stability = 3; c.difficulty = 3; c.elapsedDays = 3;
    const g = fsrs.review(c, Rating.Good, new Date('2025-01-04T00:00:00Z')).card;
    c.stability = 3; c.elapsedDays = 3;
    const h = fsrs.review(c, Rating.Hard, new Date('2025-01-04T00:00:00Z')).card;
    expect(g.stability).toBeGreaterThan(h.stability);
  });

  it('requestRetention affects interval scaling', () => {
    const c = create();
    let a = new FSRS({ enableFuzz: false, requestRetention: 0.95 }).review(c, Rating.Easy).card.scheduledDays;
    let b = new FSRS({ enableFuzz: false, requestRetention: 0.80 }).review(c, Rating.Easy).card.scheduledDays;
    expect(a).toBeLessThanOrEqual(b);
  });
});
