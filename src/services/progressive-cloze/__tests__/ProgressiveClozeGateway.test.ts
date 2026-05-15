import { CardState, CardType, Rating, type Card, type FSRSCard, type ReviewLog } from '../../../data/types';
import type { ProgressiveClozeChildCard, ProgressiveClozeParentCard } from '../../../types/progressive-cloze-v2';
import { PremiumFeatureGuard } from '../../premium/PremiumFeatureGuard';
import { ProgressiveClozeGateway } from '../ProgressiveClozeGateway';

function createFsrs(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    due: '2026-03-15T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsedDays: 2,
    scheduledDays: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    retrievability: 0.9,
    ...overrides
  };
}

function createReviewLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    rating: Rating.Good,
    state: CardState.Review,
    due: '2026-03-20T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsedDays: 2,
    lastElapsedDays: 1,
    scheduledDays: 5,
    review: '2026-03-15T00:00:00.000Z',
    ...overrides
  };
}

function createParentCard(content?: string): ProgressiveClozeParentCard {
  return {
    uuid: 'parent-1',
    deckId: 'deck-1',
    type: CardType.ProgressiveParent,
    content: content ?? '---\nwe_type: progressive-parent\n---\n{{c1::Alpha}} {{c2::Beta}}',
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    },
    tags: [],
    created: '2026-03-15T00:00:00.000Z',
    modified: '2026-03-15T00:00:00.000Z',
    progressiveCloze: {
      childCardIds: ['child-1', 'child-2'],
      totalClozes: 2,
      createdAt: '2026-03-15T00:00:00.000Z'
    }
  };
}

function createChildCard(
  uuid: string,
  clozeOrd: number,
  content?: string,
  overrides: Partial<ProgressiveClozeChildCard> = {}
): ProgressiveClozeChildCard {
  return {
    uuid,
    deckId: 'deck-1',
    type: CardType.ProgressiveChild,
    parentCardId: 'parent-1',
    clozeOrd,
    content: content ?? '---\nwe_type: progressive-child\n---\n{{c1::Alpha}} {{c2::Beta}}',
    fsrs: createFsrs(),
    reviewHistory: [createReviewLog()],
    clozeSnapshot: clozeOrd === 0
      ? { text: 'Alpha', hint: undefined }
      : { text: 'Beta', hint: undefined },
    stats: {
      totalReviews: 1,
      totalTime: 30,
      averageTime: 30
    },
    tags: [],
    created: '2026-03-15T00:00:00.000Z',
    modified: '2026-03-15T00:00:00.000Z',
    ...overrides
  };
}

function createBasicCard(content: string): Card {
  return {
    uuid: 'basic-1',
    deckId: 'deck-1',
    type: CardType.Basic,
    content,
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0,
      memoryRate: 0
    },
    fsrs: createFsrs(),
    reviewHistory: [],
    tags: [],
    created: '2026-03-15T00:00:00.000Z',
    modified: '2026-03-15T00:00:00.000Z'
  };
}

describe('ProgressiveClozeGateway', () => {
  const premiumGuard = PremiumFeatureGuard.getInstance();

  beforeEach(() => {
    premiumGuard.isPremiumActive.set(true);
    premiumGuard.setPremiumFeaturesPreview(false);
  });

  afterEach(() => {
    premiumGuard.isPremiumActive.set(false);
    premiumGuard.setPremiumFeaturesPreview(false);
  });

  it('未激活时不会自动转换为渐进式挖空', async () => {
    premiumGuard.isPremiumActive.set(false);

    const gateway = new ProgressiveClozeGateway();
    const card = createBasicCard('{{c1::Alpha}} {{c2::Beta}}');

    const result = await gateway.processNewCard(card);

    expect(result.converted).toBe(false);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].type).toBe(CardType.Cloze);
    expect(result.cards[0].content).toContain('we_type: cloze');
  });

  it('退出渐进式挖空时可指定一个子卡继承历史', async () => {
    const gateway = new ProgressiveClozeGateway();
    const parent = createParentCard();
    const child1 = createChildCard('child-1', 0, undefined, {
      fsrs: createFsrs({ reps: 2, stability: 4 }),
      reviewHistory: [createReviewLog({ scheduledDays: 6 })]
    });
    const child2 = createChildCard('child-2', 1, undefined, {
      fsrs: createFsrs({ reps: 7, stability: 9, difficulty: 3 }),
      reviewHistory: [createReviewLog({ scheduledDays: 12, difficulty: 3 })]
    });

    const deleteCard = vi.fn(async (_uuid: string) => {});
    const saveCard = vi.fn(async (_card: Card) => {});
    const getDeckCards = vi.fn(async (_deckId: string) => [child1, child2]);

    const result = await gateway.processContentChange(
      parent,
      '{{c1::Alpha}} only',
      { deleteCard, saveCard, getDeckCards },
      undefined,
      async () => ({ mode: 'inherit-child', childUuid: 'child-2' })
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);

    const updatedParent = result![0];
    expect(updatedParent.type).toBe(CardType.Cloze);
    expect(updatedParent.uuid).toBe(parent.uuid);
    expect(updatedParent.content).toContain('we_type: cloze');
    expect((updatedParent as any).fsrs).toEqual(child2.fsrs);
    expect((updatedParent as any).reviewHistory).toEqual(child2.reviewHistory);
    expect((updatedParent as any).progressiveCloze).toBeUndefined();

    expect(deleteCard).toHaveBeenCalledTimes(2);
    expect(deleteCard).toHaveBeenCalledWith('child-1');
    expect(deleteCard).toHaveBeenCalledWith('child-2');
    expect(saveCard).not.toHaveBeenCalled();
  });

  it('退出渐进式挖空时全部重置会清空父卡历史', async () => {
    const gateway = new ProgressiveClozeGateway();
    const parent = createParentCard();
    const child1 = createChildCard('child-1', 0);
    const child2 = createChildCard('child-2', 1);

    const deleteCard = vi.fn(async (_uuid: string) => {});
    const saveCard = vi.fn(async (_card: Card) => {});
    const getDeckCards = vi.fn(async (_deckId: string) => [child1, child2]);

    const result = await gateway.processContentChange(
      parent,
      'plain basic content',
      { deleteCard, saveCard, getDeckCards },
      undefined,
      async () => ({ mode: 'reset-all' })
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);

    const updatedParent = result![0];
    expect(updatedParent.type).toBe(CardType.Basic);
    expect(updatedParent.content).toContain('we_type: basic');
    expect((updatedParent as any).reviewHistory).toEqual([]);
    expect((updatedParent as any).fsrs.reps).toBe(0);
    expect((updatedParent as any).progressiveCloze).toBeUndefined();

    expect(deleteCard).toHaveBeenCalledTimes(2);
    expect(deleteCard).toHaveBeenCalledWith('child-1');
    expect(deleteCard).toHaveBeenCalledWith('child-2');
    expect(saveCard).not.toHaveBeenCalled();
  });

  it('仅内容变化时父卡保持 progressive-parent 元数据并同步子卡', async () => {
    const gateway = new ProgressiveClozeGateway();
    const parent = createParentCard();
    const child1 = createChildCard('child-1', 0);
    const child2 = createChildCard('child-2', 1);

    const deleteCard = vi.fn(async (_uuid: string) => {});
    const saveCard = vi.fn(async (_card: Card) => {});
    const getDeckCards = vi.fn(async (_deckId: string) => [child1, child2]);
    const getCardsByUUIDs = vi.fn(async (_uuids: string[]) => [child1, child2]);

    const newContent = '---\nwe_type: progressive-parent\n---\n{{c1::Alpha2}} {{c2::Beta2}}';

    const result = await gateway.processContentChange(
      parent,
      newContent,
      { deleteCard, saveCard, getDeckCards, getCardsByUUIDs }
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);

    const updatedParent = result![0];
    expect(updatedParent.type).toBe(CardType.ProgressiveParent);
    expect(updatedParent.content).toContain('we_type: progressive-parent');

    const updatedChildren = result!.slice(1) as ProgressiveClozeChildCard[];
    expect(updatedChildren).toHaveLength(2);
    expect(updatedChildren[0].content).toContain('we_type: progressive-child');
    expect(updatedChildren[1].content).toContain('we_type: progressive-child');
    expect(updatedChildren[0].clozeSnapshot?.text).toBe('Alpha2');
    expect(updatedChildren[1].clozeSnapshot?.text).toBe('Beta2');

    expect(saveCard).toHaveBeenCalledTimes(2);
    expect(deleteCard).not.toHaveBeenCalled();
    expect(getCardsByUUIDs).toHaveBeenCalledWith(['child-1', 'child-2']);
    expect(getDeckCards).not.toHaveBeenCalled();
  });

  it('ord 变化时保留的子卡保持历史并更新子卡元数据与快照', async () => {
    const gateway = new ProgressiveClozeGateway();
    const parent = createParentCard();
    const child1 = createChildCard('child-1', 0, undefined, {
      fsrs: createFsrs({ reps: 4, stability: 8 }),
      reviewHistory: [createReviewLog({ scheduledDays: 9 })]
    });
    const child2 = createChildCard('child-2', 1, undefined, {
      fsrs: createFsrs({ reps: 6, stability: 10 }),
      reviewHistory: [createReviewLog({ scheduledDays: 12 })]
    });

    const deleteCard = vi.fn(async (_uuid: string) => {});
    const saveCard = vi.fn(async (_card: Card) => {});
    const getDeckCards = vi.fn(async (_deckId: string) => [child1, child2]);

    const newContent = '---\nwe_type: progressive-parent\n---\n{{c2::Beta updated}} {{c3::Gamma new}}';

    const result = await gateway.processContentChange(
      parent,
      newContent,
      { deleteCard, saveCard, getDeckCards },
      async () => true
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);

    const updatedParent = result![0] as ProgressiveClozeParentCard;
    const retainedChild = result![1] as ProgressiveClozeChildCard;
    const addedChild = result![2] as ProgressiveClozeChildCard;

    expect(updatedParent.progressiveCloze?.childCardIds).toEqual(['child-2', addedChild.uuid]);

    expect(deleteCard).toHaveBeenCalledTimes(1);
    expect(deleteCard).toHaveBeenCalledWith('child-1');

    expect(retainedChild.uuid).toBe('child-2');
    expect(retainedChild.fsrs).toEqual(child2.fsrs);
    expect(retainedChild.reviewHistory).toEqual(child2.reviewHistory);
    expect(retainedChild.content).toContain('we_type: progressive-child');
    expect(retainedChild.clozeSnapshot?.text).toBe('Beta updated');

    expect(addedChild.uuid).not.toBe('child-2');
    expect(addedChild.type).toBe(CardType.ProgressiveChild);
    expect(addedChild.content).toContain('we_type: progressive-child');
    expect(addedChild.clozeSnapshot?.text).toBe('Gamma new');

    expect(saveCard).toHaveBeenCalledTimes(2);
  });

  it('缺少定向子卡读取能力时会回退到 deck 级扫描', async () => {
    const gateway = new ProgressiveClozeGateway();
    const parent = createParentCard();
    const child1 = createChildCard('child-1', 0);
    const child2 = createChildCard('child-2', 1);

    const deleteCard = vi.fn(async (_uuid: string) => {});
    const saveCard = vi.fn(async (_card: Card) => {});
    const getDeckCards = vi.fn(async (_deckId: string) => [child1, child2]);

    const result = await gateway.processContentChange(
      parent,
      '---\nwe_type: progressive-parent\n---\n{{c1::Alpha fallback}} {{c2::Beta fallback}}',
      { deleteCard, saveCard, getDeckCards }
    );

    expect(result).not.toBeNull();
    expect(getDeckCards).toHaveBeenCalledWith('deck-1');
  });
});
