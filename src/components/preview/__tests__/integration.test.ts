import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentPreviewEngine, CardType } from '../ContentPreviewEngine';
import { PreviewRenderer } from '../PreviewRenderer';
import { AnimationController } from '../AnimationController';
import { ExtensiblePreviewManager } from '../types/ExtensiblePreview';
import type { Card } from '../../../data/types';
import type AnkiPlugin from '../../../main';

// Mock dependencies
vi.mock('../../../services/triad-template-service');
vi.mock('../../../utils/cardParser/CardParsingEngine');
vi.mock('../../../utils/cardParser/PresetManager');
vi.mock('../../../utils/multiple-choice-parser');
vi.mock('obsidian', () => ({
  MarkdownRenderer: {
    renderMarkdown: vi.fn().mockResolvedValue(undefined)
  },
  Component: vi.fn()
}));

describe('Preview System Integration Tests', () => {
  let engine: ContentPreviewEngine;
  let renderer: PreviewRenderer;
  let animationController: AnimationController;
  let mockPlugin: AnkiPlugin;

  beforeEach(() => {
    // Mock plugin
    mockPlugin = {
      settings: {
        enableDebugMode: false
      }
    } as AnkiPlugin;

    // Initialize components
    engine = new ContentPreviewEngine(mockPlugin);
    renderer = new PreviewRenderer(mockPlugin);
    animationController = new AnimationController({
      enableAnimations: true,
      reducedMotion: false,
      performanceMode: 'quality'
    });
  });

  describe('End-to-End Preview Generation', () => {
    it('should generate complete preview for basic Q&A card', async () => {
      const card: Card = {
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

      // Step 1: Parse card content
      const previewData = await engine.parseCardContent(card);
      expect(previewData.cardType).toBe(CardType.BASIC_QA);
      expect(previewData.sections).toHaveLength(2);

      // Step 2: Render preview
      const renderResult = await renderer.renderPreview(previewData, {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'quality'
      });

      expect(renderResult.success).toBe(true);
      expect(renderResult.element).toBeInstanceOf(HTMLElement);

      // Step 3: Apply animations
      if (renderResult.element) {
        await animationController.animateContentReveal(renderResult.element);
        expect(renderResult.element.style.opacity).toBe('1');
      }
    });

    it('should handle multiple choice cards end-to-end', async () => {
      // Mock multiple choice detection
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

      const multipleChoiceCard: Card = {
        id: 'mc-card-1',
        deckId: 'test-deck',
        templateId: 'multiple-choice',
        fields: {
          question: 'What is 2 + 2?',
          options: 'A) 3\nB) 4\nC) 5\nD) 6',
          correct_answer: 'B'
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

      // Parse and render
      const previewData = await engine.parseCardContent(multipleChoiceCard);
      expect(previewData.cardType).toBe(CardType.MULTIPLE_CHOICE);

      const renderResult = await renderer.renderPreview(previewData, {
        showAnswer: false,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'quality'
      });

      expect(renderResult.success).toBe(true);
      expect(renderResult.element?.classList.contains('tuanki-preview--multiple-choice')).toBe(true);
    });

    it('should handle cloze deletion cards end-to-end', async () => {
      const clozeCard: Card = {
        id: 'cloze-card-1',
        deckId: 'test-deck',
        templateId: 'cloze',
        fields: {
          content: 'The capital of ==France== is ==Paris==.'
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

      // Parse and render
      const previewData = await engine.parseCardContent(clozeCard);
      expect(previewData.cardType).toBe(CardType.CLOZE_DELETION);

      const renderResult = await renderer.renderPreview(previewData, {
        showAnswer: false,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'quality'
      });

      expect(renderResult.success).toBe(true);
      expect(renderResult.element?.classList.contains('tuanki-preview--cloze-deletion')).toBe(true);

      // Test cloze reveal animation
      if (renderResult.element) {
        const clozeElements = renderResult.element.querySelectorAll('.cloze-hidden');
        if (clozeElements.length > 0) {
          await animationController.animateClozeReveal(Array.from(clozeElements) as HTMLElement[]);
          clozeElements.forEach(el => {
            expect((el as HTMLElement).style.opacity).toBe('1');
          });
        }
      }
    });
  });

  describe('Performance Integration', () => {
    it('should complete full pipeline within performance threshold', async () => {
      const card: Card = {
        id: 'perf-test-card',
        deckId: 'test-deck',
        templateId: 'basic',
        fields: {
          question: 'Performance test question',
          answer: 'Performance test answer'
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

      const startTime = performance.now();

      // Full pipeline
      const previewData = await engine.parseCardContent(card);
      const renderResult = await renderer.renderPreview(previewData, {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'performance'
      });

      if (renderResult.element) {
        await animationController.animateContentReveal(renderResult.element);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(200); // Full pipeline should complete within 200ms
      expect(renderResult.success).toBe(true);
    });

    it('should handle concurrent preview generation efficiently', async () => {
      const cards: Card[] = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-card-${i}`,
        deckId: 'test-deck',
        templateId: 'basic',
        fields: {
          question: `Question ${i}`,
          answer: `Answer ${i}`
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
      })) as Card[];

      const startTime = performance.now();

      // Process all cards concurrently
      const promises = cards.map(async (card) => {
        const previewData = await engine.parseCardContent(card);
        return renderer.renderPreview(previewData, {
          showAnswer: true,
          enableAnimations: false, // Disable animations for performance
          themeMode: 'auto',
          renderingMode: 'performance'
        });
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should handle 10 cards within 1 second
    });
  });

  describe('Cache Integration', () => {
    it('should demonstrate cache effectiveness across components', async () => {
      const card: Card = {
        id: 'cache-test-card',
        deckId: 'test-deck',
        templateId: 'basic',
        fields: {
          question: 'Cache test question',
          answer: 'Cache test answer'
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

      // First run - populate caches
      const startTime1 = performance.now();
      const previewData1 = await engine.parseCardContent(card);
      const renderResult1 = await renderer.renderPreview(previewData1, {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'quality'
      });
      const endTime1 = performance.now();

      // Second run - should use caches
      const startTime2 = performance.now();
      const previewData2 = await engine.parseCardContent(card);
      const renderResult2 = await renderer.renderPreview(previewData2, {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'quality'
      });
      const endTime2 = performance.now();

      // Cache should make second run faster
      expect(endTime2 - startTime2).toBeLessThan(endTime1 - startTime1);
      expect(renderResult1.success).toBe(true);
      expect(renderResult2.success).toBe(true);
      expect(renderResult2.cacheHit).toBe(true);
    });
  });

  describe('Extensible Preview Integration', () => {
    it('should support custom card type registration and detection', async () => {
      const extensibleManager = engine.getExtensibleManager();

      // Register custom card type
      extensibleManager.registerCardType({
        id: 'custom-flashcard',
        name: 'Custom Flashcard',
        description: 'A custom flashcard type for testing',
        version: '1.0.0',
        author: 'Test Suite'
      });

      // Register custom detector
      extensibleManager.registerDetector({
        id: 'custom-detector',
        name: 'Custom Detector',
        supportedTypes: ['custom-flashcard'],
        priority: 200,
        detect: (card: Card) => ({
          matches: card.fields.type === 'custom',
          cardTypeId: 'custom-flashcard',
          confidence: 0.95,
          features: ['custom-marker']
        })
      });

      const customCard: Card = {
        id: 'custom-card-1',
        deckId: 'test-deck',
        templateId: 'custom',
        fields: {
          type: 'custom',
          question: 'Custom question',
          answer: 'Custom answer'
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

      // Test detection
      const detectionResult = await extensibleManager.detectCardType(customCard);
      expect(detectionResult?.matches).toBe(true);
      expect(detectionResult?.cardTypeId).toBe('custom-flashcard');
      expect(detectionResult?.confidence).toBe(0.95);

      // Test integration with main engine
      const cardType = await engine.detectCardType(customCard);
      expect(cardType).toBe('custom-flashcard');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors gracefully throughout the pipeline', async () => {
      const invalidCard = {
        id: 'invalid-card',
        fields: null, // Invalid fields
        state: 'new'
      } as any;

      // Engine should handle invalid card gracefully
      try {
        await engine.parseCardContent(invalidCard);
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Renderer should handle invalid preview data gracefully
      const invalidPreviewData = {
        cardType: 'invalid',
        sections: null,
        metadata: null
      } as any;

      const renderResult = await renderer.renderPreview(invalidPreviewData, {
        showAnswer: true,
        enableAnimations: true,
        themeMode: 'auto',
        renderingMode: 'quality'
      });

      expect(renderResult.success).toBe(false);
      expect(renderResult.error).toBeDefined();
    });
  });
});
