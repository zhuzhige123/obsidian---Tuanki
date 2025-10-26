import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentPreviewEngine, CardType } from '../ContentPreviewEngine';
import { PreviewRenderer } from '../PreviewRenderer';
import { AnimationController } from '../AnimationController';
import type { Card } from '../../../data/types';
import type AnkiPlugin from '../../../main';

// Mock dependencies for performance testing
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

describe('Preview System Performance Tests', () => {
  let engine: ContentPreviewEngine;
  let renderer: PreviewRenderer;
  let animationController: AnimationController;
  let mockPlugin: AnkiPlugin;

  beforeEach(() => {
    mockPlugin = {
      settings: {
        enableDebugMode: false
      }
    } as AnkiPlugin;

    engine = new ContentPreviewEngine(mockPlugin);
    renderer = new PreviewRenderer(mockPlugin);
    animationController = new AnimationController({
      enableAnimations: true,
      reducedMotion: false,
      performanceMode: 'performance'
    });
  });

  const createMockCard = (id: string, size: 'small' | 'medium' | 'large' = 'small'): Card => {
    const contentSizes = {
      small: { question: 'Short question?', answer: 'Short answer.' },
      medium: { 
        question: 'Medium length question with more details and context?'.repeat(5),
        answer: 'Medium length answer with comprehensive explanation.'.repeat(10)
      },
      large: {
        question: 'Very long question with extensive details, context, and background information.'.repeat(50),
        answer: 'Very long answer with comprehensive explanation, examples, and detailed analysis.'.repeat(100)
      }
    };

    return {
      id,
      deckId: 'test-deck',
      templateId: 'basic',
      fields: contentSizes[size],
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
  };

  describe('ContentPreviewEngine Performance', () => {
    it('should parse small cards within 50ms', async () => {
      const card = createMockCard('small-card', 'small');
      
      const startTime = performance.now();
      const result = await engine.parseCardContent(card);
      const endTime = performance.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should parse medium cards within 100ms', async () => {
      const card = createMockCard('medium-card', 'medium');
      
      const startTime = performance.now();
      const result = await engine.parseCardContent(card);
      const endTime = performance.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should parse large cards within 200ms', async () => {
      const card = createMockCard('large-card', 'large');
      
      const startTime = performance.now();
      const result = await engine.parseCardContent(card);
      const endTime = performance.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(200);
    });

    it('should demonstrate cache performance improvement', async () => {
      const card = createMockCard('cache-test', 'medium');
      
      // First parse (cold cache)
      const startTime1 = performance.now();
      await engine.parseCardContent(card);
      const endTime1 = performance.now();
      const coldTime = endTime1 - startTime1;

      // Second parse (warm cache)
      const startTime2 = performance.now();
      await engine.parseCardContent(card);
      const endTime2 = performance.now();
      const warmTime = endTime2 - startTime2;

      // Cache should provide significant speedup
      expect(warmTime).toBeLessThan(coldTime * 0.1); // At least 10x faster
      expect(warmTime).toBeLessThan(10); // Should be very fast
    });

    it('should handle batch processing efficiently', async () => {
      const cards = Array.from({ length: 100 }, (_, i) => 
        createMockCard(`batch-card-${i}`, 'small')
      );

      const startTime = performance.now();
      const promises = cards.map(card => engine.parseCardContent(card));
      const results = await Promise.all(promises);
      const endTime = performance.now();

      expect(results).toHaveLength(100);
      expect(results.every(r => r !== undefined)).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000); // 100 cards in under 2 seconds
    });
  });

  describe('PreviewRenderer Performance', () => {
    it('should render small previews within 30ms', async () => {
      const card = createMockCard('render-small', 'small');
      const previewData = await engine.parseCardContent(card);
      
      const options = {
        showAnswer: true,
        enableAnimations: false, // Disable for pure render performance
        themeMode: 'auto' as const,
        renderingMode: 'performance' as const
      };

      const startTime = performance.now();
      const result = await renderer.renderPreview(previewData, options);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(30);
    });

    it('should render medium previews within 50ms', async () => {
      const card = createMockCard('render-medium', 'medium');
      const previewData = await engine.parseCardContent(card);
      
      const options = {
        showAnswer: true,
        enableAnimations: false,
        themeMode: 'auto' as const,
        renderingMode: 'performance' as const
      };

      const startTime = performance.now();
      const result = await renderer.renderPreview(previewData, options);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should demonstrate render cache effectiveness', async () => {
      const card = createMockCard('render-cache', 'medium');
      const previewData = await engine.parseCardContent(card);
      
      const options = {
        showAnswer: true,
        enableAnimations: false,
        themeMode: 'auto' as const,
        renderingMode: 'performance' as const
      };

      // First render (cold cache)
      const startTime1 = performance.now();
      const result1 = await renderer.renderPreview(previewData, options);
      const endTime1 = performance.now();

      // Second render (warm cache)
      const startTime2 = performance.now();
      const result2 = await renderer.renderPreview(previewData, options);
      const endTime2 = performance.now();

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.cacheHit).toBe(true);
      expect(endTime2 - startTime2).toBeLessThan((endTime1 - startTime1) * 0.2); // 5x faster
    });

    it('should handle concurrent rendering efficiently', async () => {
      const cards = Array.from({ length: 50 }, (_, i) => 
        createMockCard(`concurrent-render-${i}`, 'small')
      );

      const previewDataPromises = cards.map(card => engine.parseCardContent(card));
      const previewDataArray = await Promise.all(previewDataPromises);

      const options = {
        showAnswer: true,
        enableAnimations: false,
        themeMode: 'auto' as const,
        renderingMode: 'performance' as const
      };

      const startTime = performance.now();
      const renderPromises = previewDataArray.map(data => 
        renderer.renderPreview(data, options)
      );
      const results = await Promise.all(renderPromises);
      const endTime = performance.now();

      expect(results).toHaveLength(50);
      expect(results.every(r => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(1500); // 50 renders in under 1.5 seconds
    });
  });

  describe('AnimationController Performance', () => {
    it('should complete content reveal animation within 350ms', async () => {
      const element = document.createElement('div');
      
      const startTime = performance.now();
      await animationController.animateContentReveal(element);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(350); // Standard animation duration + buffer
    });

    it('should handle multiple simultaneous animations efficiently', async () => {
      const elements = Array.from({ length: 10 }, () => document.createElement('div'));
      
      const startTime = performance.now();
      const promises = elements.map(el => animationController.animateContentReveal(el));
      await Promise.all(promises);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(500); // Should not significantly increase with count
    });

    it('should perform well in performance mode', async () => {
      const performanceController = new AnimationController({
        enableAnimations: true,
        reducedMotion: false,
        performanceMode: 'performance'
      });

      const element = document.createElement('div');
      
      const startTime = performance.now();
      await performanceController.animateContentReveal(element);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(200); // Faster in performance mode
    });
  });

  describe('Memory Performance', () => {
    it('should not leak memory with repeated operations', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        const card = createMockCard(`memory-test-${i}`, 'small');
        const previewData = await engine.parseCardContent(card);
        await renderer.renderPreview(previewData, {
          showAnswer: true,
          enableAnimations: false,
          themeMode: 'auto',
          renderingMode: 'performance'
        });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Memory should not grow excessively (allowing for some growth)
      if (initialMemory > 0 && finalMemory > 0) {
        const memoryGrowth = finalMemory - initialMemory;
        const maxAllowedGrowth = 10 * 1024 * 1024; // 10MB
        expect(memoryGrowth).toBeLessThan(maxAllowedGrowth);
      }
    });

    it('should cleanup resources properly', () => {
      const initialCacheSize = engine.getCacheStats().size;
      
      // Generate some cached data
      const promises = Array.from({ length: 20 }, (_, i) => {
        const card = createMockCard(`cleanup-test-${i}`, 'small');
        return engine.parseCardContent(card);
      });

      Promise.all(promises).then(() => {
        const populatedCacheSize = engine.getCacheStats().size;
        expect(populatedCacheSize).toBeGreaterThan(initialCacheSize);

        // Cleanup
        engine.clearCache();
        renderer.cleanup();
        animationController.cleanup();

        const finalCacheSize = engine.getCacheStats().size;
        expect(finalCacheSize).toBe(0);
      });
    });
  });

  describe('Scalability Tests', () => {
    it('should maintain performance with large cache sizes', async () => {
      // Fill cache with many entries
      const cards = Array.from({ length: 200 }, (_, i) => 
        createMockCard(`scale-test-${i}`, 'small')
      );

      // Populate cache
      await Promise.all(cards.map(card => engine.parseCardContent(card)));

      // Test performance with full cache
      const testCard = createMockCard('scale-test-new', 'small');
      
      const startTime = performance.now();
      await engine.parseCardContent(testCard);
      const endTime = performance.now();

      // Performance should not degrade significantly with large cache
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle varying content sizes efficiently', async () => {
      const mixedCards = [
        ...Array.from({ length: 50 }, (_, i) => createMockCard(`mixed-small-${i}`, 'small')),
        ...Array.from({ length: 30 }, (_, i) => createMockCard(`mixed-medium-${i}`, 'medium')),
        ...Array.from({ length: 10 }, (_, i) => createMockCard(`mixed-large-${i}`, 'large'))
      ];

      const startTime = performance.now();
      const results = await Promise.all(
        mixedCards.map(card => engine.parseCardContent(card))
      );
      const endTime = performance.now();

      expect(results).toHaveLength(90);
      expect(results.every(r => r !== undefined)).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Mixed content in under 5 seconds
    });
  });

  describe('Performance Regression Detection', () => {
    it('should maintain baseline performance metrics', async () => {
      const baselineMetrics = {
        smallCardParse: 50,    // ms
        mediumCardParse: 100,  // ms
        smallCardRender: 30,   // ms
        mediumCardRender: 50,  // ms
        animationComplete: 350 // ms
      };

      // Test small card parsing
      const smallCard = createMockCard('baseline-small', 'small');
      const parseStart = performance.now();
      await engine.parseCardContent(smallCard);
      const parseEnd = performance.now();
      expect(parseEnd - parseStart).toBeLessThan(baselineMetrics.smallCardParse);

      // Test medium card parsing
      const mediumCard = createMockCard('baseline-medium', 'medium');
      const mediumParseStart = performance.now();
      const previewData = await engine.parseCardContent(mediumCard);
      const mediumParseEnd = performance.now();
      expect(mediumParseEnd - mediumParseStart).toBeLessThan(baselineMetrics.mediumCardParse);

      // Test rendering
      const renderStart = performance.now();
      await renderer.renderPreview(previewData, {
        showAnswer: true,
        enableAnimations: false,
        themeMode: 'auto',
        renderingMode: 'performance'
      });
      const renderEnd = performance.now();
      expect(renderEnd - renderStart).toBeLessThan(baselineMetrics.mediumCardRender);

      // Test animation
      const element = document.createElement('div');
      const animStart = performance.now();
      await animationController.animateContentReveal(element);
      const animEnd = performance.now();
      expect(animEnd - animStart).toBeLessThan(baselineMetrics.animationComplete);
    });
  });
});
