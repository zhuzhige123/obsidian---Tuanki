/**
 * Vitest 测试设置文件
 */

import { vi } from 'vitest';

type TestStyle = CSSStyleDeclaration & Record<string, string>;
type MockAbortSignal = {
  aborted: boolean;
  addEventListener: (...args: unknown[]) => void;
  removeEventListener: (...args: unknown[]) => void;
};

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false)
    }))
  });
}

class MockAbortController {
  private readonly mockSignal: MockAbortSignal = {
    aborted: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  signal = this.mockSignal as unknown as AbortSignal;

  abort() {
    this.mockSignal.aborted = true;
  }
}

Object.defineProperty(window, 'AbortController', {
  writable: true,
  value: MockAbortController as unknown as typeof AbortController
});

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

vi.spyOn(globalThis, 'setTimeout').mockImplementation(
  ((
    handler: Parameters<typeof setTimeout>[0],
    timeout?: Parameters<typeof setTimeout>[1],
    ...args: unknown[]
  ) => {
    if (typeof handler === 'function') {
      return originalSetTimeout(handler as (...callbackArgs: unknown[]) => void, timeout, ...args);
    }

    return originalSetTimeout(() => undefined, timeout);
  }) as typeof setTimeout
);

vi.spyOn(globalThis, 'clearTimeout').mockImplementation(
  ((id: Parameters<typeof clearTimeout>[0]) => {
    originalClearTimeout(id);
  }) as typeof clearTimeout
);

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'debug').mockImplementation(() => {});

vi.spyOn(performance, 'now').mockImplementation(() => Date.now());

let nextAnimationFrameId = 0;
const animationFrameTimers = new Map<number, ReturnType<typeof setTimeout>>();

Object.defineProperty(globalThis, 'requestAnimationFrame', {
  writable: true,
  value: vi.fn((callback: FrameRequestCallback) => {
    const animationFrameId = ++nextAnimationFrameId;
    const timeoutId = originalSetTimeout(() => {
      animationFrameTimers.delete(animationFrameId);
      callback(Date.now());
    }, 16);

    animationFrameTimers.set(animationFrameId, timeoutId);
    return animationFrameId;
  })
});

Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  writable: true,
  value: vi.fn((animationFrameId: number) => {
    const timeoutId = animationFrameTimers.get(animationFrameId);
    if (!timeoutId) {
      return;
    }

    originalClearTimeout(timeoutId);
    animationFrameTimers.delete(animationFrameId);
  })
});

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

class MockAnimation {
  private listeners = new Map<string, Array<() => void>>();
  private finished = false;
  private cancelled = false;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private element: HTMLElement,
    private keyframes: Keyframe[],
    private options: KeyframeAnimationOptions
  ) {
    this.applyKeyframe(this.keyframes[0]);

    const duration = typeof options.duration === 'number' ? options.duration : 0;
    const delay = typeof options.delay === 'number' ? options.delay : 0;
    this.finishTimer = originalSetTimeout(() => this.finish(), duration + delay);
  }

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  cancel() {
    if (this.finished || this.cancelled) return;
    this.cancelled = true;
    if (this.finishTimer) {
      originalClearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    this.emit('cancel');
  }

  private finish() {
    if (this.finished || this.cancelled) return;
    this.finished = true;
    this.applyKeyframe(this.keyframes[this.keyframes.length - 1]);
    this.emit('finish');
  }

  private emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  private applyKeyframe(keyframe?: Keyframe) {
    if (!keyframe) return;

    for (const [property, value] of Object.entries(keyframe)) {
      if (property === 'offset' || property === 'composite' || property === 'easing') {
        continue;
      }

      const style = this.element.style as TestStyle;
      style[property] = String(value);
    }
  }
}

if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function (
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: number | KeyframeAnimationOptions
  ) {
    const normalizedKeyframes = Array.isArray(keyframes) ? keyframes : [keyframes as unknown as Keyframe];
    const normalizedOptions = typeof options === 'number' ? { duration: options } : (options ?? {});

    return new MockAnimation(
      this as HTMLElement,
      normalizedKeyframes,
      normalizedOptions as KeyframeAnimationOptions
    ) as unknown as Animation;
  };
}
