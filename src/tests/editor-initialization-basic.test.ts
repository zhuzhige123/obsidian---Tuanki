/**
 * 编辑器初始化管理器基础测试
 */
import { getEditorInitializationManager, InitializationState } from '../utils/editor-initialization-manager';

describe('编辑器初始化管理器基础测试', () => {
  let initManager: ReturnType<typeof getEditorInitializationManager>;

  beforeEach(() => {
    initManager = getEditorInitializationManager();
    initManager.cleanup();
  });

  test('应该创建初始化管理器实例', () => {
    expect(initManager).toBeDefined();
    expect(typeof initManager.safeInitialize).toBe('function');
    expect(typeof initManager.abortInitialization).toBe('function');
    expect(typeof initManager.getInitializationState).toBe('function');
  });

  test('应该返回空闲初始状态', () => {
    const editorId = 'test-editor';
    const state = initManager.getInitializationState(editorId);
    expect(state).toBe(InitializationState.IDLE);
  });

  test('应该成功完成初始化', async () => {
    const editorId = 'test-editor';
    let initCalled = false;

    const mockInitFn = async (_signal: AbortSignal) => {
      initCalled = true;
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    };

    const result = await initManager.safeInitialize(editorId, mockInitFn);

    expect(result.success).toBe(true);
    expect(initCalled).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
  });

  test('应该处理初始化失败', async () => {
    const editorId = 'test-editor';

    const mockInitFn = async (_signal: AbortSignal) => {
      throw new Error('模拟初始化失败');
    };

    const result = await initManager.safeInitialize(editorId, mockInitFn, {
      maxRetries: 0
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('模拟初始化失败');
  });

  test('应该支持中止初始化', async () => {
    const editorId = 'test-editor';
    let initStarted = false;

    const mockInitFn = async (signal: AbortSignal) => {
      initStarted = true;

      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(resolve, 1000);

        signal.addEventListener('abort', () => {
          window.clearTimeout(timer);
          reject(new Error('初始化被中止'));
        });
      });
    };

    const initPromise = initManager.safeInitialize(editorId, mockInitFn);

    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(initStarted).toBe(true);

    const aborted = initManager.abortInitialization(editorId);
    expect(aborted).toBe(true);

    const result = await initPromise;
    expect(result.success).toBe(false);
  });
});
