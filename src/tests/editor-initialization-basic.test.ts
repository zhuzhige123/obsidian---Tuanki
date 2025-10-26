/**
 * 编辑器初始化基础测试
 * 验证EditorInitializationManager的基本功能
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getEditorInitializationManager, InitializationState } from '../utils/editor-initialization-manager';

describe('编辑器初始化管理器基础测试', () => {
  let initManager: ReturnType<typeof getEditorInitializationManager>;

  beforeEach(() => {
    initManager = getEditorInitializationManager();
    initManager.cleanup();
  });

  test('应该能创建初始化管理器实例', () => {
    expect(initManager).toBeDefined();
    expect(typeof initManager.safeInitialize).toBe('function');
    expect(typeof initManager.abortInitialization).toBe('function');
    expect(typeof initManager.getInitializationState).toBe('function');
  });

  test('应该返回正确的初始状态', () => {
    const editorId = 'test-editor';
    const state = initManager.getInitializationState(editorId);
    expect(state).toBe(InitializationState.IDLE);
  });

  test('应该能成功初始化编辑器', async () => {
    const editorId = 'test-editor';
    let initCalled = false;

    const mockInitFn = async (signal: AbortSignal) => {
      initCalled = true;
      // 简单的初始化逻辑
      await new Promise(resolve => setTimeout(resolve, 10));
    };

    const result = await initManager.safeInitialize(editorId, mockInitFn);

    expect(result.success).toBe(true);
    expect(initCalled).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
  });

  test('应该能处理初始化失败', async () => {
    const editorId = 'test-editor';

    const mockInitFn = async (signal: AbortSignal) => {
      throw new Error('模拟初始化失败');
    };

    const result = await initManager.safeInitialize(editorId, mockInitFn, {
      maxRetries: 0 // 不重试
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('模拟初始化失败');
  });

  test('应该能中止初始化', async () => {
    const editorId = 'test-editor';
    let initStarted = false;

    const mockInitFn = async (signal: AbortSignal) => {
      initStarted = true;
      
      // 模拟长时间初始化
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);
        
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('初始化被中止'));
        });
      });
    };

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
  });
});
