import { ContentPreviewEngine, CardType } from '../ContentPreviewEngine';
import type { Card } from '../../../data/types';
import { UnifiedCardType } from '../../../types/unified-card-types';
import type AnkiPlugin from '../../../main';

function createCard(content: string, overrides: Partial<Card> = {}): Card {
  const timestamp = new Date().toISOString();

  return {
    uuid: overrides.uuid ?? 'test-card-1',
    content,
    templateId: overrides.templateId ?? 'basic',
    stats: overrides.stats ?? {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    },
    created: overrides.created ?? timestamp,
    modified: overrides.modified ?? timestamp,
    ...overrides
  };
}

describe('ContentPreviewEngine', () => {
  let engine: ContentPreviewEngine;
  let mockPlugin: AnkiPlugin;
  let mockCard: Card;

  beforeEach(() => {
    mockPlugin = {
      settings: {
        enableDebugMode: false
      }
    } as AnkiPlugin;

    mockCard = createCard('What is the capital of France?\n---div---\nParis');
    engine = new ContentPreviewEngine(mockPlugin);
  });

  describe('parseCardContent', () => {
    it('should parse basic Q&A card correctly', async () => {
      const result = await engine.parseCardContent(mockCard);

      expect(result.cardType).toBe(UnifiedCardType.BASIC_QA);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0]?.type).toBe('front');
      expect(result.sections[0]?.content).toContain('What is the capital of France?');
      expect(result.sections[1]?.type).toBe('back');
      expect(result.sections[1]?.content).toContain('Paris');
      expect(result.metadata.cardId).toBe(mockCard.uuid);
      expect(result.metadata.confidence).toBeGreaterThan(0);
    });

    it('should detect single choice card from content', async () => {
      const singleChoiceCard = createCard(
        'Q: What is 2 + 2?（B）\n\nA. 3\nB. 4\nC. 5'
      );

      const result = await engine.parseCardContent(singleChoiceCard);

      expect(result.cardType).toBe(UnifiedCardType.SINGLE_CHOICE);
      expect(result.sections[0]?.content).toContain('What is 2 + 2?');
    });

    it('should detect cloze deletion card', async () => {
      const clozeCard = createCard('The capital of France is ==Paris==.');

      const result = await engine.parseCardContent(clozeCard);

      expect(result.cardType).toBe(UnifiedCardType.CLOZE_DELETION);
      expect(result.sections.some((section) => section.content.includes('==Paris=='))).toBe(true);
    });

    it('should use cache for repeated calls', async () => {
      await engine.parseCardContent(mockCard);
      await engine.parseCardContent(mockCard);

      const stats = engine.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.keys[0]).toContain(mockCard.uuid);
    });
  });

  describe('detectCardType', () => {
    it('should detect basic Q&A as default', async () => {
      const cardType = await engine.detectCardType(mockCard);
      expect(cardType).toBe(UnifiedCardType.BASIC_QA);
    });

    it('should detect single choice card', async () => {
      const choiceCard = createCard('Q: Example?（A）\n\nA. one\nB. two');

      const cardType = await engine.detectCardType(choiceCard);
      expect(cardType).toBe(UnifiedCardType.SINGLE_CHOICE);
    });

    it('should detect multiple choice card', async () => {
      const multipleChoiceCard = createCard(
        'Q: Which are prime numbers?（AB）\n\nA. 2\nB. 3\nC. 4'
      );

      const cardType = await engine.detectCardType(multipleChoiceCard);
      expect(cardType).toBe(UnifiedCardType.MULTIPLE_CHOICE);
    });

    it('should detect cloze deletion card', async () => {
      const clozeCard = createCard('The capital of {{c1::France}} is {{c2::Paris}}.');

      const cardType = await engine.detectCardType(clozeCard);
      expect(cardType).toBe(UnifiedCardType.CLOZE_DELETION);
    });
  });

  describe('generatePreview', () => {
    it('should generate preview successfully', async () => {
      const previewData = await engine.parseCardContent(mockCard);
      const result = await engine.generatePreview(previewData, {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'performance'
      });

      expect(result.success).toBe(true);
      expect(result.previewData).toBeDefined();
      expect(result.renderTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle unknown card types through extensible preview path', async () => {
      const invalidPreviewData = {
        cardType: 'invalid-type' as UnifiedCardType,
        sections: [],
        metadata: {
          cardId: 'invalid',
          templateId: 'invalid',
          cardType: 'invalid-type' as UnifiedCardType,
          confidence: 0,
          generatedAt: Date.now(),
          renderingHints: {
            preferredHeight: 200,
            hasInteractiveElements: false,
            requiresObsidianRenderer: false,
            cacheKey: 'invalid'
          }
        },
        renderingHints: {
          preferredHeight: 200,
          hasInteractiveElements: false,
          requiresObsidianRenderer: false,
          cacheKey: 'invalid'
        }
      };

      const result = await engine.generatePreview(invalidPreviewData, {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'performance'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should clear cache correctly', async () => {
      await engine.parseCardContent(mockCard);

      expect(engine.getCacheStats().size).toBeGreaterThan(0);

      engine.clearCache();

      expect(engine.getCacheStats().size).toBe(0);
    });

    it('should provide cache statistics', async () => {
      await engine.parseCardContent(mockCard);

      const stats = engine.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toHaveLength(1);
      expect(stats.keys[0]).toContain(mockCard.uuid);
    });
  });

  describe('extensible preview integration', () => {
    it('should provide access to extensible manager', () => {
      const manager = engine.getExtensibleManager();
      expect(manager).toBeDefined();
      expect(typeof manager.registerCardType).toBe('function');
      expect(typeof manager.registerDetector).toBe('function');
    });

    it('should support custom card type detection', async () => {
      const manager = engine.getExtensibleManager();

      manager.registerDetector({
        id: 'test-detector',
        name: 'Test Detector',
        supportedTypes: ['extensible'],
        priority: 100,
        detect: (card: Card) => ({
          matches: card.content.includes('[CUSTOM]'),
          cardTypeId: CardType.EXTENSIBLE,
          confidence: 0.9,
          features: ['custom-marker']
        })
      });

      const testCard = createCard('[CUSTOM]\nQuestion content');
      const cardType = await engine.detectCardType(testCard);

      expect(cardType).toBe(UnifiedCardType.EXTENSIBLE);
    });
  });
});
