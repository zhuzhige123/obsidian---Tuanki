import { logger } from '../utils/logger';
/**
 * Vitest测试环境配置
 *
 * 提供全局测试工具和DOM匹配器
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

type TestWindow = Window &
  typeof globalThis & {
    app?: Record<string, unknown>;
    __weaveThemeManagerCleanup?: (() => void) | null;
  };

Object.defineProperty(globalThis, 'vi', {
  configurable: true,
  value: vi,
  writable: true
});

if (typeof window !== 'undefined') {
  const testWindow = window as TestWindow;
  testWindow.app ??= {};
}

logger.debug('✓ Vitest测试环境已初始化');
