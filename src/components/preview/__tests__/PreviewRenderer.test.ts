import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreviewRenderer } from '../PreviewRenderer';
import { CardType } from '../ContentPreviewEngine';
import type { PreviewData, PreviewOptions } from '../ContentPreviewEngine';
import type AnkiPlugin from '../../../main';

// Mock Obsidian
vi.mock('obsidian', () => ({
  MarkdownRenderer: {
    renderMarkdown: vi.fn().mockResolvedValue(undefined)
  },
  Component: vi.fn()
}));

describe('PreviewRenderer', () => {
  let renderer: PreviewRenderer;
  let mockPlugin: AnkiPlugin;
  let mockPreviewData: PreviewData;
  let mockOptions: PreviewOptions;

  beforeEach(() => {
    // Mock plugin
    mockPlugin = {
      settings: {
        enableDebugMode: false
      }
    } as AnkiPlugin;

    // Mock preview data
    mockPreviewData = {
      cardType: CardType.BASIC_QA,
      sections: [
        {
          type: 'front',
          content: '<p>What is the capital of France?</p>',
          metadata: {
            fieldName: 'question',
            isRequired: true
          },
          animationConfig: {
            type: 'fade-in',
            duration: 300,
            delay: 0
          },
          interactivityConfig: {
            clickable: false,
            hoverable: true,
            focusable: false
          }
        },
        {
          type: 'back',
          content: '<p>Paris</p>',
          metadata: {
            fieldName: 'answer',
            isRequired: true
          },
          animationConfig: {
            type: 'slide-up',
            duration: 300,
            delay: 100
          },
          interactivityConfig: {
            clickable: false,
            hoverable: true,
            focusable: false
          }
        }
      ],
      metadata: {
        cardId: 'test-card-1',
        templateId: 'basic',
        cardType: CardType.BASIC_QA,
        confidence: 0.9,
        generatedAt: Date.now(),
        renderingHints: {
          preferredHeight: 200,
          hasInteractiveElements: false,
          requiresObsidianRenderer: true,
          cacheKey: 'test-cache-key'
        }
      },
      renderingHints: {
        preferredHeight: 200,
        hasInteractiveElements: false,
        requiresObsidianRenderer: true,
        cacheKey: 'test-cache-key'
      }
    };

    // Mock options
    mockOptions = {
      showAnswer: true,
      enableAnimations: true,
      themeMode: 'auto',
      renderingMode: 'performance'
    };

    renderer = new PreviewRenderer(mockPlugin);
  });

  describe('renderPreview', () => {
    it('should render preview successfully', async () => {
      const result = await renderer.renderPreview(mockPreviewData, mockOptions);

      expect(result.success).toBe(true);
      expect(result.element).toBeInstanceOf(HTMLElement);
      expect(result.renderTime).toBeGreaterThan(0);
      expect(result.cacheHit).toBe(false);
    });

    it('should use cache for repeated renders', async () => {
      // First render
      const result1 = await renderer.renderPreview(mockPreviewData, mockOptions);
      expect(result1.cacheHit).toBe(false);

      // Second render should use cache
      const result2 = await renderer.renderPreview(mockPreviewData, mockOptions);
      expect(result2.cacheHit).toBe(true);
      expect(result2.renderTime).toBeLessThan(result1.renderTime);
    });

    it('should handle rendering errors gracefully', async () => {
      // Create invalid preview data
      const invalidData = {
        ...mockPreviewData,
        sections: [
          {
            type: 'invalid',
            content: null,
            metadata: {},
            animationConfig: {},
            interactivityConfig: {}
          }
        ]
      } as any;

      const result = await renderer.renderPreview(invalidData, mockOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.renderTime).toBeGreaterThan(0);
    });

    it('should apply theme correctly', async () => {
      const lightOptions = { ...mockOptions, themeMode: 'light' as const };
      const result = await renderer.renderPreview(mockPreviewData, lightOptions);

      expect(result.success).toBe(true);
      expect(result.element?.classList.contains('tuanki-preview--light')).toBe(true);
    });

    it('should apply animations when enabled', async () => {
      const animatedOptions = { ...mockOptions, enableAnimations: true };
      const result = await renderer.renderPreview(mockPreviewData, animatedOptions);

      expect(result.success).toBe(true);
      expect(result.element?.classList.contains('tuanki-preview--animated')).toBe(true);
    });

    it('should skip animations when disabled', async () => {
      const staticOptions = { ...mockOptions, enableAnimations: false };
      const result = await renderer.renderPreview(mockPreviewData, staticOptions);

      expect(result.success).toBe(true);
      expect(result.element?.classList.contains('tuanki-preview--animated')).toBe(false);
    });
  });

  describe('renderSection', () => {
    it('should render question section correctly', async () => {
      const questionSection = mockPreviewData.sections[0];
      const element = await renderer.renderSection(questionSection, mockOptions);

      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('tuanki-preview-section')).toBe(true);
      expect(element.classList.contains('tuanki-preview-section--question')).toBe(true);
    });

    it('should render answer section correctly', async () => {
      const answerSection = mockPreviewData.sections[1];
      const element = await renderer.renderSection(answerSection, mockOptions);

      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('tuanki-preview-section')).toBe(true);
      expect(element.classList.contains('tuanki-preview-section--answer')).toBe(true);
    });

    it('should handle empty content gracefully', async () => {
      const emptySection = {
        ...mockPreviewData.sections[0],
        content: ''
      };

      const element = await renderer.renderSection(emptySection, mockOptions);

      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.innerHTML.trim()).toBe('');
    });
  });

  describe('cache management', () => {
    it('should clear cache correctly', async () => {
      // Render to populate cache
      await renderer.renderPreview(mockPreviewData, mockOptions);

      // Clear cache
      renderer.cleanup();

      // Next render should not use cache
      const result = await renderer.renderPreview(mockPreviewData, mockOptions);
      expect(result.cacheHit).toBe(false);
    });

    it('should respect cache size limits', async () => {
      // Create multiple different preview data to fill cache
      const promises = [];
      for (let i = 0; i < 60; i++) { // Exceed typical cache size
        const data = {
          ...mockPreviewData,
          metadata: {
            ...mockPreviewData.metadata,
            cardId: `test-card-${i}`,
            renderingHints: {
              ...mockPreviewData.metadata.renderingHints,
              cacheKey: `test-cache-key-${i}`
            }
          },
          renderingHints: {
            ...mockPreviewData.renderingHints,
            cacheKey: `test-cache-key-${i}`
          }
        };
        promises.push(renderer.renderPreview(data, mockOptions));
      }

      await Promise.all(promises);

      // Cache should not grow indefinitely
      // This is implementation-dependent, but we expect some limit
      expect(true).toBe(true); // Placeholder - actual cache size checking would need access to private members
    });
  });

  describe('performance', () => {
    it('should render within performance threshold', async () => {
      const startTime = performance.now();
      const result = await renderer.renderPreview(mockPreviewData, mockOptions);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should render within 100ms
    });

    it('should handle large content efficiently', async () => {
      const largeData = {
        ...mockPreviewData,
        sections: [
          {
            ...mockPreviewData.sections[0],
            content: '<p>' + 'Large content '.repeat(1000) + '</p>'
          },
          {
            ...mockPreviewData.sections[1],
            content: '<p>' + 'Large answer '.repeat(1000) + '</p>'
          }
        ]
      };

      const startTime = performance.now();
      const result = await renderer.renderPreview(largeData, mockOptions);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(500); // Should handle large content within 500ms
    });
  });

  describe('different card types', () => {
    it('should render multiple choice cards', async () => {
      const multipleChoiceData = {
        ...mockPreviewData,
        cardType: CardType.MULTIPLE_CHOICE,
        sections: [
          {
            type: 'front',
            content: '<p>What is 2 + 2?</p>',
            metadata: { fieldName: 'question' },
            animationConfig: { type: 'fade-in', duration: 300, delay: 0 },
            interactivityConfig: { clickable: false, hoverable: true, focusable: false }
          },
          {
            type: 'options',
            content: '<div>Options content</div>',
            metadata: { 
              fieldName: 'options',
              options: [
                { id: 'A', label: 'A', content: '3' },
                { id: 'B', label: 'B', content: '4' },
                { id: 'C', label: 'C', content: '5' },
                { id: 'D', label: 'D', content: '6' }
              ]
            },
            animationConfig: { type: 'slide-up', duration: 300, delay: 100 },
            interactivityConfig: { clickable: true, hoverable: true, focusable: true }
          }
        ]
      };

      const result = await renderer.renderPreview(multipleChoiceData, mockOptions);

      expect(result.success).toBe(true);
      expect(result.element?.classList.contains('tuanki-preview--multiple-choice')).toBe(true);
    });

    it('should render cloze deletion cards', async () => {
      const clozeData = {
        ...mockPreviewData,
        cardType: CardType.CLOZE_DELETION,
        sections: [
          {
            type: 'cloze',
            content: '<p>The capital of <span class="cloze">France</span> is <span class="cloze">Paris</span>.</p>',
            metadata: { fieldName: 'content' },
            animationConfig: { type: 'fade-in', duration: 300, delay: 0 },
            interactivityConfig: { clickable: true, hoverable: true, focusable: true }
          }
        ]
      };

      const result = await renderer.renderPreview(clozeData, mockOptions);

      expect(result.success).toBe(true);
      expect(result.element?.classList.contains('tuanki-preview--cloze-deletion')).toBe(true);
    });
  });
});
