import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentPreviewEngine, CardType } from '../ContentPreviewEngine';
import type { Card } from '../../../data/types';
import type AnkiPlugin from '../../../main';

// Mock dependencies
vi.mock('../../../services/triad-template-service');
vi.mock('../../../utils/cardParser/CardParsingEngine');
vi.mock('../../../utils/cardParser/PresetManager');
vi.mock('../../../utils/multiple-choice-parser');

describe('ContentPreviewEngine', () => {
  let engine: ContentPreviewEngine;
  let mockPlugin: AnkiPlugin;
  let mockCard: Card;

  beforeEach(() => {
    // Mock plugin
    mockPlugin = {
      settings: {
        enableDebugMode: false
      }
    } as AnkiPlugin;

    // Mock card
    mockCard = {
      id: 'test-card-1',
      deckId: 'test-deck',
      templateId: 'basic',
      fields: {
        question: 'What is the capital of France?',
        answer: 'Paris'
      },
      state: 'new',
      due: new Date(),
      interval: 1,
      easeFactor: 2.5,
      reps: 0,
      lapses: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      stats: {
        totalReviews: 0,
        correctAnswers: 0,
        totalTime: 0,
        averageTime: 0,
        lastReview: null
      }
    } as Card;

    engine = new ContentPreviewEngine(mockPlugin);
  });

  describe('parseCardContent', () => {
    it('should parse basic Q&A card correctly', async () => {
      const result = await engine.parseCardContent(mockCard);

      expect(result).toBeDefined();
      expect(result.cardType).toBe(CardType.BASIC_QA);
      expect(result.sections).toHaveLength(2); // question and answer sections
      expect(result.metadata.cardId).toBe(mockCard.id);
      expect(result.metadata.confidence).toBeGreaterThan(0);
    });

    it('should detect multiple choice card', async () => {
      const multipleChoiceCard = {
        ...mockCard,
        fields: {
          question: 'What is 2 + 2?',
          options: 'A) 3\nB) 4\nC) 5\nD) 6',
          correct_answer: 'B'
        }
      };

      // Mock the multiple choice detection
      vi.doMock('../../../utils/multiple-choice-parser', () => ({
        isMultipleChoiceCard: vi.fn().mockReturnValue(true),
        parseChoiceOptions: vi.fn().mockReturnValue({
          options: [
            { id: 'A', label: 'A', content: '3' },
            { id: 'B', label: 'B', content: '4' },
            { id: 'C', label: 'C', content: '5' },
            { id: 'D', label: 'D', content: '6' }
          ]
        })
      }));

      const result = await engine.parseCardContent(multipleChoiceCard);

      expect(result.cardType).toBe(CardType.MULTIPLE_CHOICE);
      expect(result.sections.some(s => s.type === 'options')).toBe(true);
    });

    it('should detect cloze deletion card', async () => {
      const clozeCard = {
        ...mockCard,
        fields: {
          content: 'The capital of France is ==Paris==.'
        }
      };

      const result = await engine.parseCardContent(clozeCard);

      expect(result.cardType).toBe(CardType.CLOZE_DELETION);
      expect(result.sections.some(s => s.type === 'cloze')).toBe(true);
    });

    it('should use cache for repeated calls', async () => {
      const spy = vi.spyOn(console, 'log');
      
      // First call
      await engine.parseCardContent(mockCard);
      
      // Second call should use cache
      await engine.parseCardContent(mockCard);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('使用缓存预览数据')
      );
    });
  });

  describe('detectCardType', () => {
    it('should detect basic Q&A as default', async () => {
      const cardType = await engine.detectCardType(mockCard);
      expect(cardType).toBe(CardType.BASIC_QA);
    });

    it('should detect multiple choice card', async () => {
      // Mock multiple choice detection
      vi.doMock('../../../utils/multiple-choice-parser', () => ({
        isMultipleChoiceCard: vi.fn().mockReturnValue(true)
      }));

      const cardType = await engine.detectCardType(mockCard);
      expect(cardType).toBe(CardType.MULTIPLE_CHOICE);
    });

    it('should detect cloze deletion card', async () => {
      const clozeCard = {
        ...mockCard,
        fields: {
          content: 'The capital of {{c1::France}} is {{c2::Paris}}.'
        }
      };

      const cardType = await engine.detectCardType(clozeCard);
      expect(cardType).toBe(CardType.CLOZE_DELETION);
    });
  });

  describe('generatePreview', () => {
    it('should generate preview successfully', async () => {
      const previewData = await engine.parseCardContent(mockCard);
      const options = {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto' as const,
        renderingMode: 'performance' as const
      };

      const result = await engine.generatePreview(previewData, options);

      expect(result.success).toBe(true);
      expect(result.previewData).toBeDefined();
      expect(result.renderTime).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const invalidPreviewData = {
        cardType: 'invalid' as CardType,
        sections: [],
        metadata: {
          cardId: 'invalid',
          templateId: 'invalid',
          cardType: 'invalid' as CardType,
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

      const options = {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto' as const,
        renderingMode: 'performance' as const
      };

      const result = await engine.generatePreview(invalidPreviewData, options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('cache management', () => {
    it('should clear cache correctly', async () => {
      // Generate some cached data
      await engine.parseCardContent(mockCard);
      
      const stats = engine.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      // Clear cache
      engine.clearCache();
      
      const statsAfterClear = engine.getCacheStats();
      expect(statsAfterClear.size).toBe(0);
    });

    it('should provide cache statistics', async () => {
      await engine.parseCardContent(mockCard);
      
      const stats = engine.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toHaveLength(1);
      expect(stats.keys[0]).toContain(mockCard.id);
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
      
      // Register a custom detector
      manager.registerDetector({
        id: 'test-detector',
        name: 'Test Detector',
        supportedTypes: ['test-type'],
        priority: 100,
        detect: (card: Card) => ({
          matches: card.fields.question?.includes('TEST'),
          cardTypeId: 'test-type',
          confidence: 0.9,
          features: ['test-marker']
        })
      });

      const testCard = {
        ...mockCard,
        fields: {
          question: 'TEST: What is this?',
          answer: 'A test question'
        }
      };

      const cardType = await engine.detectCardType(testCard);
      expect(cardType).toBe('test-type');
    });
  });

  describe('performance', () => {
    it('should complete parsing within performance threshold', async () => {
      const startTime = performance.now();
      await engine.parseCardContent(mockCard);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle large content efficiently', async () => {
      const largeCard = {
        ...mockCard,
        fields: {
          question: 'Q: ' + 'x'.repeat(10000),
          answer: 'A: ' + 'y'.repeat(10000)
        }
      };

      const startTime = performance.now();
      const result = await engine.parseCardContent(largeCard);
      const endTime = performance.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(500); // Should handle large content within 500ms
    });
  });
});
