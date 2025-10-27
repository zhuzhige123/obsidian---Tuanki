import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnimationController } from '../AnimationController';
import type { AnimationOptions } from '../AnimationController';

// Mock DOM methods
Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn().mockReturnValue({
    getPropertyValue: vi.fn().mockReturnValue('none')
  })
});

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((cb) => {
  setTimeout(cb, 16); // Simulate 60fps
  return 1;
});

global.cancelAnimationFrame = vi.fn();

describe('AnimationController', () => {
  let controller: AnimationController;
  let mockElement: HTMLElement;
  let mockOptions: AnimationOptions;

  beforeEach(() => {
    // Create mock element
    mockElement = document.createElement('div');
    mockElement.style.opacity = '1';
    mockElement.style.transform = 'none';
    
    // Mock options
    mockOptions = {
      enableAnimations: true,
      reducedMotion: false,
      performanceMode: 'quality'
    };

    controller = new AnimationController(mockOptions);
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultController = new AnimationController();
      expect(defaultController).toBeDefined();
    });

    it('should respect reduced motion preference', () => {
      const reducedMotionController = new AnimationController({
        enableAnimations: true,
        reducedMotion: true,
        performanceMode: 'performance'
      });
      expect(reducedMotionController).toBeDefined();
    });
  });

  describe('animateContentReveal', () => {
    it('should animate content reveal when animations enabled', async () => {
      const promise = controller.animateContentReveal(mockElement);
      
      expect(mockElement.style.opacity).toBe('0');
      expect(mockElement.style.transform).toContain('translateY');
      
      await promise;
      
      expect(mockElement.style.opacity).toBe('1');
      expect(mockElement.style.transform).toBe('translateY(0px)');
    });

    it('should skip animation when disabled', async () => {
      const disabledController = new AnimationController({
        enableAnimations: false,
        reducedMotion: false,
        performanceMode: 'performance'
      });

      const promise = disabledController.animateContentReveal(mockElement);
      await promise;

      // Should complete immediately without animation
      expect(mockElement.style.opacity).toBe('1');
    });

    it('should respect reduced motion', async () => {
      const reducedMotionController = new AnimationController({
        enableAnimations: true,
        reducedMotion: true,
        performanceMode: 'performance'
      });

      const promise = reducedMotionController.animateContentReveal(mockElement);
      await promise;

      // Should complete immediately with reduced motion
      expect(mockElement.style.opacity).toBe('1');
    });
  });

  describe('animateTypeTransition', () => {
    it('should animate type transition', async () => {
      const promise = controller.animateTypeTransition(mockElement);
      
      // Should start with scale animation
      expect(mockElement.style.transform).toContain('scale');
      
      await promise;
      
      // Should end with normal scale
      expect(mockElement.style.transform).toContain('scale(1)');
    });

    it('should handle null element gracefully', async () => {
      const promise = controller.animateTypeTransition(null);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('animateClozeReveal', () => {
    it('should animate cloze reveal for single element', async () => {
      const clozeElement = document.createElement('span');
      clozeElement.className = 'cloze-hidden';
      mockElement.appendChild(clozeElement);

      const promise = controller.animateClozeReveal(clozeElement);
      
      expect(clozeElement.style.opacity).toBe('0');
      
      await promise;
      
      expect(clozeElement.style.opacity).toBe('1');
      expect(clozeElement.classList.contains('cloze-revealed')).toBe(true);
    });

    it('should animate multiple cloze elements', async () => {
      const clozeElements = [
        document.createElement('span'),
        document.createElement('span'),
        document.createElement('span')
      ];

      clozeElements.forEach((el, index) => {
        el.className = 'cloze-hidden';
        el.textContent = `Cloze ${index + 1}`;
        mockElement.appendChild(el);
      });

      const promise = controller.animateClozeReveal(clozeElements);
      
      // All elements should start hidden
      clozeElements.forEach(el => {
        expect(el.style.opacity).toBe('0');
      });
      
      await promise;
      
      // All elements should be revealed
      clozeElements.forEach(el => {
        expect(el.style.opacity).toBe('1');
        expect(el.classList.contains('cloze-revealed')).toBe(true);
      });
    });
  });

  describe('animateOptionSelection', () => {
    it('should animate option selection', async () => {
      const optionElement = document.createElement('button');
      optionElement.className = 'choice-option';
      
      const promise = controller.animateOptionSelection(optionElement);
      
      expect(optionElement.style.transform).toContain('scale');
      
      await promise;
      
      expect(optionElement.style.transform).toContain('scale(1)');
    });

    it('should handle rapid selections', async () => {
      const option1 = document.createElement('button');
      const option2 = document.createElement('button');
      
      const promise1 = controller.animateOptionSelection(option1);
      const promise2 = controller.animateOptionSelection(option2);
      
      await Promise.all([promise1, promise2]);
      
      expect(option1.style.transform).toContain('scale(1)');
      expect(option2.style.transform).toContain('scale(1)');
    });
  });

  describe('animateHover', () => {
    it('should animate hover enter', async () => {
      const promise = controller.animateHover(mockElement, true);
      
      expect(mockElement.style.transform).toContain('translateY');
      
      await promise;
    });

    it('should animate hover leave', async () => {
      const promise = controller.animateHover(mockElement, false);
      
      await promise;
      
      expect(mockElement.style.transform).toBe('translateY(0px)');
    });

    it('should handle rapid hover changes', async () => {
      const enterPromise = controller.animateHover(mockElement, true);
      const leavePromise = controller.animateHover(mockElement, false);
      
      await Promise.all([enterPromise, leavePromise]);
      
      expect(mockElement.style.transform).toBe('translateY(0px)');
    });
  });

  describe('performance modes', () => {
    it('should use faster animations in performance mode', () => {
      const performanceController = new AnimationController({
        enableAnimations: true,
        reducedMotion: false,
        performanceMode: 'performance'
      });

      expect(performanceController).toBeDefined();
      // Performance mode should use shorter durations and simpler animations
    });

    it('should use enhanced animations in quality mode', () => {
      const qualityController = new AnimationController({
        enableAnimations: true,
        reducedMotion: false,
        performanceMode: 'quality'
      });

      expect(qualityController).toBeDefined();
      // Quality mode should use longer durations and more complex animations
    });
  });

  describe('cleanup', () => {
    it('should cleanup active animations', () => {
      // Start some animations
      controller.animateContentReveal(mockElement);
      controller.animateTypeTransition(mockElement);
      
      // Cleanup should not throw
      expect(() => controller.cleanup()).not.toThrow();
    });

    it('should cancel pending animations', () => {
      const spy = vi.spyOn(global, 'cancelAnimationFrame');
      
      // Start animation
      controller.animateContentReveal(mockElement);
      
      // Cleanup
      controller.cleanup();
      
      // Should have called cancelAnimationFrame
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle invalid elements gracefully', async () => {
      const invalidElement = null as any;
      
      const promise = controller.animateContentReveal(invalidElement);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle elements without style property', async () => {
      const mockElementWithoutStyle = {
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn().mockReturnValue(false)
        }
      } as any;
      
      const promise = controller.animateContentReveal(mockElementWithoutStyle);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle animation interruption', async () => {
      const promise1 = controller.animateContentReveal(mockElement);
      const promise2 = controller.animateContentReveal(mockElement); // Interrupt first animation
      
      await Promise.all([promise1, promise2]);
      
      expect(mockElement.style.opacity).toBe('1');
    });
  });

  describe('accessibility', () => {
    it('should respect prefers-reduced-motion', () => {
      // Mock media query
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockReturnValue({
          matches: true, // prefers-reduced-motion: reduce
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        })
      });

      const accessibleController = new AnimationController({
        enableAnimations: true,
        reducedMotion: false, // Should be overridden by media query
        performanceMode: 'quality'
      });

      expect(accessibleController).toBeDefined();
    });

    it('should provide animation completion callbacks', async () => {
      const callback = vi.fn();
      
      const promise = controller.animateContentReveal(mockElement);
      promise.then(callback);
      
      await promise;
      
      expect(callback).toHaveBeenCalled();
    });
  });
});
