/**
 * Vitest 测试设置文件
 */

import { vi } from 'vitest';

// Mock Obsidian API
global.window = global.window || {};

// Mock DOM APIs
Object.defineProperty(window, 'AbortController', {
  writable: true,
  value: class AbortController {
    signal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    
    abort() {
      this.signal.aborted = true;
    }
  }
});

// Store original timer functions
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

// Mock setTimeout and clearTimeout without recursion
global.setTimeout = vi.fn((fn, delay) => {
  if (typeof fn === 'function') {
    return originalSetTimeout(fn, delay);
  }
  return 0;
});

global.clearTimeout = vi.fn((id) => {
  originalClearTimeout(id);
});

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

// Mock performance API
global.performance = {
  ...performance,
  now: vi.fn(() => Date.now())
};

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((callback) => {
  return setTimeout(callback, 16);
});

global.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id);
});
