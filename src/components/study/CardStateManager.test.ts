import type { Card, Deck } from '../../data/types';
import { i18n } from '../../utils/i18n';
import { CardStateManager } from './CardStateManager';

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

describe('CardStateManager deck grouping', () => {
  beforeEach(() => {
    i18n.setLanguage('zh-CN');
  });

  it('会把属于多个牌组的卡片同时分配到多个牌组列', () => {
    const manager = new CardStateManager({} as any);
    const decks: Deck[] = [
      { id: 'deck-a', name: '牌组 A' } as Deck,
      { id: 'deck-b', name: '牌组 B' } as Deck
    ];
    manager.setDecks(decks);

    const card = createCard({
      content: `---
we_decks:
  - 牌组 A
  - 牌组 B
---
Front
---div---
Back`
    });

    const grouped = manager.groupCards([card], 'deck');

    expect(grouped['deck-a']).toHaveLength(1);
    expect(grouped['deck-b']).toHaveLength(1);
    expect(grouped['_none']).toHaveLength(0);
  });

  it('题库卡片存在 questionBankDeckIds 时应按题库归属分列，而不是误用 YAML 中的记忆牌组', () => {
    const manager = new CardStateManager({} as any);
    const decks: Deck[] = [
      { id: 'bank-a', name: '题库 A' } as Deck,
      { id: 'bank-b', name: '题库 B' } as Deck
    ];
    manager.setDecks(decks);
    manager.setDataSourceType('questionBank');

    const card = createCard({
      content: `---
we_decks:
  - 记忆牌组 A
---
Front
---div---
Back`,
      metadata: {
        questionBankDeckIds: ['bank-a', 'bank-b']
      } as any,
      referencedByDecks: ['bank-a', 'bank-b']
    });

    const grouped = manager.groupCards([card], 'deck');

    expect(grouped['bank-a']).toHaveLength(1);
    expect(grouped['bank-b']).toHaveLength(1);
    expect(grouped['_none']).toHaveLength(0);
    expect(grouped['记忆牌组 A']).toBeUndefined();
  });

  it('动态分组列名应随语言切换而切换，不应固定为单一语言', () => {
    const manager = new CardStateManager({} as any);

    i18n.setLanguage('en-US');
    const deckGroupsEn = manager.getDeckGroups([]);
    const tagGroupsEn = manager.getTagGroups([]);
    const irTagGroupsEn = manager.getIRTagGroupGroups([]);
    const selectedTagGroupGroupsEn = manager.getSelectedTagGroupGroups({
      id: 'tg-1',
      name: 'Systems',
      tags: ['Cardiology']
    });

    expect(deckGroupsEn.at(-1)?.label).toBe('No deck');
    expect(tagGroupsEn.at(-1)?.label).toBe('No tag');
    expect(irTagGroupsEn.find((group) => group.key === '_default')?.label).toBe('Default');
    expect(selectedTagGroupGroupsEn.at(-1)?.label).toBe('Other');

    i18n.setLanguage('zh-CN');
    const deckGroupsZh = manager.getDeckGroups([]);
    const tagGroupsZh = manager.getTagGroups([]);
    const irTagGroupsZh = manager.getIRTagGroupGroups([]);
    const selectedTagGroupGroupsZh = manager.getSelectedTagGroupGroups({
      id: 'tg-1',
      name: '系统',
      tags: ['心脏']
    });

    expect(deckGroupsZh.at(-1)?.label).toBe('无牌组');
    expect(tagGroupsZh.at(-1)?.label).toBe('无标签');
    expect(irTagGroupsZh.find((group) => group.key === '_default')?.label).toBe('默认');
    expect(selectedTagGroupGroupsZh.at(-1)?.label).toBe('其他');
  });
});

describe('CardStateManager incremental reading tag grouping', () => {
  it('IR 看板按标签分组时应优先读取 ir_tags，而不是退化成普通 tags 为空', () => {
    const manager = new CardStateManager({} as any);
    manager.setDataSourceType('incremental-reading');

    const card = createCard({
      uuid: 'ir-card-1',
      tags: [],
      ir_tags: ['哲学/认识论', '摘录']
    } as any);

    const groups = manager.getTagGroups([card]);
    const grouped = manager.groupCards([card], 'tag');

    expect(groups.some((group) => group.key === '哲学/认识论')).toBe(true);
    expect(grouped['哲学/认识论']).toHaveLength(1);
    expect(grouped['_noTag']).toHaveLength(0);
  });

  it('IR 同时存在 ir_tags 与普通 tags 时，应以 ir_tags 的首项作为主分组口径', () => {
    const manager = new CardStateManager({} as any);
    manager.setDataSourceType('incremental-reading');

    const card = createCard({
      uuid: 'ir-card-2',
      tags: ['旧标签'],
      ir_tags: ['专题/主标签', '专题/次标签']
    } as any);

    const grouped = manager.groupCards([card], 'tag');

    expect(grouped['专题/主标签']).toHaveLength(1);
    expect(grouped['_noTag']).toHaveLength(0);
  });

  it('记忆卡按标签分组时应支持读取正文中的井号标签，而不是只依赖 legacy tags 字段', () => {
    const manager = new CardStateManager({} as any);

    const card = createCard({
      uuid: 'memory-card-content-tag-1',
      tags: [],
      content: `---
tags:
  - YAML标签
---
Front #循环系统
---div---
Back`
    });

    const groups = manager.getTagGroups([card]);
    const grouped = manager.groupCards([card], 'tag');

    expect(groups.some((group) => group.key === 'YAML标签')).toBe(true);
    expect(grouped['YAML标签']).toHaveLength(1);
    expect(grouped['_noTag']).toHaveLength(0);
  });
});

describe('CardStateManager selected tag group grouping', () => {
  it('显式传入已选标签组时，应稳定生成标签组列并将卡片分到正确列中', () => {
    const manager = new CardStateManager({} as any);

    const card = createCard({
      uuid: 'tag-group-card-1',
      tags: ['循环系统', '心脏']
    });

    const selectedTagGroup = {
      id: 'tg-circulatory',
      name: '循环专题',
      tags: ['循环系统', '呼吸系统']
    };

    const groups = manager.getSelectedTagGroupGroups(selectedTagGroup);
    const grouped = manager.groupCards([card], 'tagGroup', selectedTagGroup);

    expect(groups.map((group) => group.key)).toEqual([
      '__weave_tag__:循环系统',
      '__weave_tag__:呼吸系统',
      '__weave_internal__other-tag-group'
    ]);
    expect(grouped['__weave_tag__:循环系统']).toHaveLength(1);
    expect(grouped['__weave_tag__:呼吸系统']).toHaveLength(0);
    expect(grouped['__weave_internal__other-tag-group']).toHaveLength(0);
  });

  it('标签组分列时应支持匹配正文中的井号标签，而不是只依赖 legacy tags 字段', () => {
    const manager = new CardStateManager({} as any);

    const card = createCard({
      uuid: 'tag-group-card-content-tag-1',
      tags: [],
      content: `Front #呼吸系统
---div---
Back`
    });

    const selectedTagGroup = {
      id: 'tg-respiratory',
      name: '系统专题',
      tags: ['循环系统', '呼吸系统']
    };

    const grouped = manager.groupCards([card], 'tagGroup', selectedTagGroup);

    expect(grouped['__weave_tag__:循环系统']).toHaveLength(0);
    expect(grouped['__weave_tag__:呼吸系统']).toHaveLength(1);
    expect(grouped['__weave_internal__other-tag-group']).toHaveLength(0);
  });
});
