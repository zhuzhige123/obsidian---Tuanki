import {
  createContentWithMetadata,
  extractAllTags,
  getCardDeckIds,
  getCardDeckIdsFromFormalSource,
  parseSourceInfo,
  setCardProperty
} from '../utils/yaml-utils';

describe('yaml-utils wikilink quoting', () => {
  test('should quote we_source wikilink in YAML output', () => {
    const content = createContentWithMetadata(
      {
        we_source: '[[《浅谈基于 Lifelong Continuous Incremental Learning 的推荐算法》]]',
        we_type: 'basic'
      },
      '正文内容'
    );

    expect(content).toContain('we_source: "[[《浅谈基于 Lifelong Continuous Incremental Learning 的推荐算法》]]"');
    expect(content).toContain('we_type: basic');
  });

  test('should still parse quoted we_source wikilink correctly', () => {
    const content = createContentWithMetadata(
      {
        we_source: '![[notes/test-note#^block123]]',
        we_type: 'basic'
      },
      '正文内容'
    );

    const sourceInfo = parseSourceInfo(content);

    expect(sourceInfo.sourceFile).toBe('notes/test-note.md');
    expect(sourceInfo.sourceBlock).toBe('block123');
  });

  test('should quote wikilink when updating existing card property', () => {
    const updated = setCardProperty('正文内容', 'we_source', '[[test-note]]');

    expect(updated).toContain('we_source: "[[test-note]]"');
    expect(parseSourceInfo(updated).sourceFile).toBe('test-note.md');
  });
  test('should extract tags from YAML scalar and markdown hashtags together', () => {
    const content = `---
tags: 单个标签
---
正文里的 #标签A 和 #标签B`;

    expect(extractAllTags(content)).toEqual(['单个标签', '标签A', '标签B']);
  });

  test('should extract tags from markdown body even without YAML frontmatter', () => {
    const content = '这张卡只有正文标签 #仅正文标签';

    expect(extractAllTags(content)).toEqual(['仅正文标签']);
  });

  test('should ignore hashtags inside html attributes while keeping real body tags', () => {
    const content = `---
tags:
  - 手工标签
---
<mark style="background: #FFF3A3A6;">高亮内容</mark> 和正文标签 #真实标签`;

    expect(extractAllTags(content)).toEqual(['手工标签', '真实标签']);
  });

  test('should allow strict formal-source parsing without legacy deck field fallback', () => {
    const decks = [{ id: 'deck-target', name: '目标牌组', purpose: 'memory' as const }];
    const card = {
      deckId: 'deck-target',
      referencedByDecks: ['deck-target'],
      content: '正文内容'
    };

    expect(getCardDeckIds(card, decks).deckIds).toEqual(['deck-target']);
    expect(getCardDeckIdsFromFormalSource(card, decks).deckIds).toEqual([]);
  });
});
