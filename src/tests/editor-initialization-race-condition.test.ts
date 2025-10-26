/**
 * 编辑器初始化竞态条件测试
 * 验证修复后的UnifiedCodeMirrorEditor是否能正确处理并发初始化
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEditorInitializationManager, InitializationState } from '../utils/editor-initialization-manager';

describe('编辑器初始化竞态条件测试', () => {
  let initManager: ReturnType<typeof getEditorInitializationManager>;

  beforeEach(() => {
    initManager = getEditorInitializationManager();
    initManager.cleanup(); // 清理之前的状态
  });

  afterEach(() => {
    initManager.cleanup();
  });

  test('应该防止同一编辑器的重复初始化', async () => {
    const editorId = 'test-editor-1';
    let initCallCount = 0;

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      initCallCount++;
      await new Promise(resolve => setTimeout(resolve, 100)); // 模拟初始化延迟

      if (signal.aborted) {
        throw new Error('初始化被中止');
      }
    });

    // 同时启动多个初始化
    const promises = [
      initManager.safeInitialize(editorId, mockInitFn),
      initManager.safeInitialize(editorId, mockInitFn),
      initManager.safeInitialize(editorId, mockInitFn)
    ];

    const results = await Promise.all(promises);

    // 验证结果
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
    expect(initCallCount).toBe(1); // 只应该调用一次初始化函数
  });

  test('应该正确处理初始化失败的重试', async () => {
    const editorId = 'test-editor-2';
    let attemptCount = 0;

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      attemptCount++;

      if (attemptCount < 2) {
        throw new Error('模拟初始化失败');
      }

      // 第二次尝试成功
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const result = await initManager.safeInitialize(editorId, mockInitFn, {
      maxRetries: 2
    });

    expect(result.success).toBe(true);
    expect(attemptCount).toBe(2);
    expect(result.retryCount).toBe(1);
  });

  test('应该正确处理初始化中止', async () => {
    const editorId = 'test-editor-3';
    let initStarted = false;

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      initStarted = true;

      // 模拟长时间初始化
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);

        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('初始化被中止'));
        });
      });
    });

    // 启动初始化
    const initPromise = initManager.safeInitialize(editorId, mockInitFn);

    // 等待初始化开始
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(initStarted).toBe(true);

    // 中止初始化
    const aborted = initManager.abortInitialization(editorId);
    expect(aborted).toBe(true);

    // 等待初始化完成
    const result = await initPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('中止');
  });

  test('应该限制并发初始化数量', async () => {
    const maxConcurrent = 3;
    const editorIds = Array.from({ length: 5 }, (_, i) => `test-editor-${i}`);
    let concurrentCount = 0;
    let maxConcurrentReached = 0;

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      concurrentCount++;
      maxConcurrentReached = Math.max(maxConcurrentReached, concurrentCount);

      await new Promise(resolve => setTimeout(resolve, 100));

      concurrentCount--;
    });

    // 同时启动多个编辑器的初始化
    const promises = editorIds.map(id => 
      initManager.safeInitialize(id, mockInitFn)
    );

    const results = await Promise.all(promises);

    // 验证并发限制
    expect(maxConcurrentReached).toBeLessThanOrEqual(maxConcurrent);
    
    // 验证有些初始化被拒绝
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    expect(successCount).toBeLessThanOrEqual(maxConcurrent);
    expect(failedCount).toBeGreaterThan(0);
  });

  test('应该正确管理初始化状态', async () => {
    const editorId = 'test-editor-4';

    // 初始状态
    expect(initManager.getInitializationState(editorId)).toBe(InitializationState.IDLE);

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      // 在初始化过程中检查状态
      expect(initManager.getInitializationState(editorId)).toBe(InitializationState.INITIALIZING);

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const resultPromise = initManager.safeInitialize(editorId, mockInitFn);

    // 等待初始化开始
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(initManager.getInitializationState(editorId)).toBe(InitializationState.INITIALIZING);

    const result = await resultPromise;
    expect(result.success).toBe(true);

    // 等待状态清理
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(initManager.getInitializationState(editorId)).toBe(InitializationState.IDLE);
  });

  test('应该处理初始化超时', async () => {
    const editorId = 'test-editor-5';

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      // 模拟超时的初始化
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    const result = await initManager.safeInitialize(editorId, mockInitFn, {
      timeout: 500 // 500ms 超时
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('超时');
  });
});

/**
 * 集成测试：模拟真实的编辑器使用场景
 */
describe('编辑器初始化集成测试', () => {
  test('应该处理快速模态窗口切换场景', async () => {
    const initManager = getEditorInitializationManager();
    const editorId = 'modal-editor';
    
    let initCount = 0;
    const mockInitFn = async (signal: AbortSignal) => {
      initCount++;
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (signal.aborted) {
        throw new Error('初始化被中止');
      }
    };

    // 模拟快速打开/关闭模态窗口
    const init1 = initManager.safeInitialize(editorId, mockInitFn);
    
    // 50ms后中止（模拟快速关闭）
    setTimeout(() => {
      initManager.abortInitialization(editorId);
    }, 50);

    // 100ms后重新初始化（模拟重新打开）
    setTimeout(async () => {
      await initManager.safeInitialize(editorId, mockInitFn);
    }, 100);

    const result1 = await init1;
    
    // 第一次初始化应该被中止
    expect(result1.success).toBe(false);
    
    // 等待第二次初始化完成
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 应该只有一次成功的初始化
    expect(initCount).toBeLessThanOrEqual(2);
  });
});
