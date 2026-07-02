/**
 * 编辑器初始化竞态条件测试
 */
import { getEditorInitializationManager, InitializationState } from '../utils/editor-initialization-manager';

describe('编辑器初始化竞态条件测试', () => {
  let initManager: ReturnType<typeof getEditorInitializationManager>;

  beforeEach(() => {
    initManager = getEditorInitializationManager();
    initManager.cleanup();
  });

  afterEach(() => {
    initManager.cleanup();
  });

  test('应该阻止同一编辑器重复初始化', async () => {
    const editorId = 'test-editor-1';
    let initCallCount = 0;

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      initCallCount++;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      if (signal.aborted) {
        throw new Error('初始化被中止');
      }
    });

    const promises = [
      initManager.safeInitialize(editorId, mockInitFn),
      initManager.safeInitialize(editorId, mockInitFn),
      initManager.safeInitialize(editorId, mockInitFn)
    ];

    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.success)).toBe(true);
    expect(initCallCount).toBe(1);
  });

  test('应该在重试后成功初始化', async () => {
    const editorId = 'test-editor-2';
    let attemptCount = 0;

    const mockInitFn = vi.fn(async (_signal: AbortSignal) => {
      attemptCount++;

      if (attemptCount < 2) {
        throw new Error('模拟初始化失败');
      }

      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });

    const result = await initManager.safeInitialize(editorId, mockInitFn, {
      maxRetries: 2
    });

    expect(result.success).toBe(true);
    expect(attemptCount).toBe(2);
    expect(result.retryCount).toBe(1);
  });

  test('应该正确处理中止流程', async () => {
    const editorId = 'test-editor-3';
    let initStarted = false;

    const mockInitFn = vi.fn(async (signal: AbortSignal) => {
      initStarted = true;

      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(resolve, 1000);

        signal.addEventListener('abort', () => {
          window.clearTimeout(timer);
          reject(new Error('初始化被中止'));
        });
      });
    });

    const initPromise = initManager.safeInitialize(editorId, mockInitFn);

    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(initStarted).toBe(true);

    const aborted = initManager.abortInitialization(editorId);
    expect(aborted).toBe(true);

    const result = await initPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('中止');
  });

  test('应该限制并发初始化数量', async () => {
    const maxConcurrent = 3;
    const editorIds = Array.from({ length: 5 }, (_, index) => `test-editor-${index}`);
    let concurrentCount = 0;
    let maxConcurrentReached = 0;

    const mockInitFn = vi.fn(async (_signal: AbortSignal) => {
      concurrentCount++;
      maxConcurrentReached = Math.max(maxConcurrentReached, concurrentCount);

      await new Promise((resolve) => window.setTimeout(resolve, 100));

      concurrentCount--;
    });

    const promises = editorIds.map((id) => initManager.safeInitialize(id, mockInitFn));
    const results = await Promise.all(promises);

    expect(maxConcurrentReached).toBeLessThanOrEqual(maxConcurrent);

    const successCount = results.filter((result) => result.success).length;
    const failedCount = results.filter((result) => !result.success).length;

    expect(successCount).toBeLessThanOrEqual(maxConcurrent);
    expect(failedCount).toBeGreaterThan(0);
  });

  test('应该正确维护初始化状态', async () => {
    const editorId = 'test-editor-4';

    expect(initManager.getInitializationState(editorId)).toBe(InitializationState.IDLE);

    const mockInitFn = vi.fn(async (_signal: AbortSignal) => {
      expect(initManager.getInitializationState(editorId)).toBe(InitializationState.INITIALIZING);
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    });

    const resultPromise = initManager.safeInitialize(editorId, mockInitFn);

    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(initManager.getInitializationState(editorId)).toBe(InitializationState.INITIALIZING);

    const result = await resultPromise;
    expect(result.success).toBe(true);

    await new Promise((resolve) => window.setTimeout(resolve, 1100));
    expect(initManager.getInitializationState(editorId)).toBe(InitializationState.IDLE);
  });

  test('应该处理初始化超时', async () => {
    const editorId = 'test-editor-5';

    const mockInitFn = vi.fn(async (_signal: AbortSignal) => {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    });

    const result = await initManager.safeInitialize(editorId, mockInitFn, {
      timeout: 500
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('超时');
  });
});

describe('编辑器初始化集成场景', () => {
  test('应该处理快速打开和关闭的切换场景', async () => {
    const initManager = getEditorInitializationManager();
    const editorId = 'modal-editor';

    let initCount = 0;
    const mockInitFn = async (signal: AbortSignal) => {
      initCount++;
      await new Promise((resolve) => window.setTimeout(resolve, 200));

      if (signal.aborted) {
        throw new Error('初始化被中止');
      }
    };

    const init1 = initManager.safeInitialize(editorId, mockInitFn);

    window.setTimeout(() => {
      initManager.abortInitialization(editorId);
    }, 50);

    window.setTimeout(() => {
      void initManager.safeInitialize(editorId, mockInitFn);
    }, 100);

    const result1 = await init1;

    expect(result1.success).toBe(false);

    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(initCount).toBeLessThanOrEqual(2);
  });
});
