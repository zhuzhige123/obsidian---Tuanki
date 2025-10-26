/**
 * 内存泄漏防护测试
 * 验证资源管理器能否正确防止内存泄漏
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorResourceManager, getGlobalResourceManager } from '../utils/resource-manager';

describe('资源管理器内存泄漏防护测试', () => {
  let resourceManager: EditorResourceManager;
  let globalManager: ReturnType<typeof getGlobalResourceManager>;
  const editorId = 'test-editor-memory';

  beforeEach(() => {
    globalManager = getGlobalResourceManager();
    resourceManager = globalManager.getEditorManager(editorId);
  });

  afterEach(() => {
    globalManager.destroyEditorManager(editorId);
  });

  test('应该正确注册和清理定时器', () => {
    const mockSetTimeout = vi.fn(() => 123 as any);
    const mockClearTimeout = vi.fn();
    
    // Mock setTimeout 和 clearTimeout
    global.setTimeout = mockSetTimeout;
    global.clearTimeout = mockClearTimeout;

    // 注册定时器
    const timerId = resourceManager.registerTimer(123 as any, 'timeout', '测试定时器');
    expect(timerId).toBeTruthy();

    // 检查资源统计
    const stats = resourceManager.getResourceStats();
    expect(stats.timers).toBe(1);
    expect(stats.total).toBe(1);

    // 销毁资源管理器
    resourceManager.destroy();

    // 验证定时器被清理
    expect(mockClearTimeout).toHaveBeenCalledWith(123);

    // 检查资源统计
    const finalStats = resourceManager.getResourceStats();
    expect(finalStats.timers).toBe(0);
    expect(finalStats.total).toBe(0);
  });

  test('应该正确注册和清理事件监听器', () => {
    const mockTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as any;

    const mockListener = vi.fn();

    // 注册事件监听器
    const listenerId = resourceManager.registerEventListener(
      mockTarget,
      'click',
      mockListener,
      false,
      '测试事件监听器'
    );

    expect(listenerId).toBeTruthy();
    expect(mockTarget.addEventListener).toHaveBeenCalledWith('click', mockListener, false);

    // 检查资源统计
    const stats = resourceManager.getResourceStats();
    expect(stats.eventListeners).toBe(1);

    // 销毁资源管理器
    resourceManager.destroy();

    // 验证事件监听器被移除
    expect(mockTarget.removeEventListener).toHaveBeenCalledWith('click', mockListener, false);

    // 检查资源统计
    const finalStats = resourceManager.getResourceStats();
    expect(finalStats.eventListeners).toBe(0);
  });

  test('应该正确注册和清理Promise', async () => {
    const mockController = {
      abort: vi.fn()
    } as any;

    const testPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    // 注册Promise
    const promiseId = resourceManager.registerPromise(
      testPromise,
      mockController,
      '测试Promise'
    );

    expect(promiseId).toBeTruthy();

    // 检查资源统计
    const stats = resourceManager.getResourceStats();
    expect(stats.promises).toBe(1);

    // 销毁资源管理器
    resourceManager.destroy();

    // 验证AbortController被调用
    expect(mockController.abort).toHaveBeenCalled();
  });

  test('应该正确注册和清理组件', () => {
    const mockComponent = {
      name: 'TestComponent'
    };

    const mockCleanup = vi.fn();

    // 注册组件
    const componentId = resourceManager.registerComponent(
      mockComponent,
      mockCleanup,
      '测试组件'
    );

    expect(componentId).toBeTruthy();

    // 检查资源统计
    const stats = resourceManager.getResourceStats();
    expect(stats.components).toBe(1);

    // 销毁资源管理器
    resourceManager.destroy();

    // 验证清理函数被调用
    expect(mockCleanup).toHaveBeenCalled();

    // 检查资源统计
    const finalStats = resourceManager.getResourceStats();
    expect(stats.components).toBe(0);
  });

  test('应该正确注册和执行自定义清理函数', () => {
    const mockCleanup = vi.fn();

    // 注册自定义清理函数
    const cleanupId = resourceManager.registerCustomCleanup(
      mockCleanup,
      '测试清理函数'
    );

    expect(cleanupId).toBeTruthy();

    // 检查资源统计
    const stats = resourceManager.getResourceStats();
    expect(stats.customCleanups).toBe(1);

    // 销毁资源管理器
    resourceManager.destroy();

    // 验证清理函数被调用
    expect(mockCleanup).toHaveBeenCalled();

    // 检查资源统计
    const finalStats = resourceManager.getResourceStats();
    expect(finalStats.customCleanups).toBe(0);
  });

  test('应该检测资源泄漏', () => {
    // 注册大量资源
    for (let i = 0; i < 15; i++) {
      resourceManager.registerTimer(i as any, 'timeout', `定时器${i}`);
    }

    for (let i = 0; i < 25; i++) {
      const mockTarget = { addEventListener: vi.fn(), removeEventListener: vi.fn() } as any;
      resourceManager.registerEventListener(mockTarget, 'click', vi.fn(), false, `监听器${i}`);
    }

    // 检查资源泄漏
    const leaks = resourceManager.checkForLeaks();
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.some(leak => leak.includes('定时器过多'))).toBe(true);
    expect(leaks.some(leak => leak.includes('事件监听器过多'))).toBe(true);
  });

  test('应该防止在销毁后注册新资源', () => {
    // 销毁资源管理器
    resourceManager.destroy();

    // 尝试注册新资源
    const timerId = resourceManager.registerTimer(123 as any, 'timeout', '销毁后的定时器');
    const listenerId = resourceManager.registerEventListener(
      { addEventListener: vi.fn(), removeEventListener: vi.fn() } as any,
      'click',
      vi.fn(),
      false,
      '销毁后的监听器'
    );

    // 应该返回空字符串，表示注册失败
    expect(timerId).toBe('');
    expect(listenerId).toBe('');

    // 资源统计应该为0
    const stats = resourceManager.getResourceStats();
    expect(stats.total).toBe(0);
  });

  test('应该能够单独移除特定资源', () => {
    const mockClearTimeout = vi.fn();
    global.clearTimeout = mockClearTimeout;

    // 注册多个定时器
    const timer1 = resourceManager.registerTimer(111 as any, 'timeout', '定时器1');
    const timer2 = resourceManager.registerTimer(222 as any, 'timeout', '定时器2');
    const timer3 = resourceManager.registerTimer(333 as any, 'timeout', '定时器3');

    // 检查初始统计
    let stats = resourceManager.getResourceStats();
    expect(stats.timers).toBe(3);

    // 移除特定定时器
    const removed = resourceManager.unregisterResource(timer2);
    expect(removed).toBe(true);
    expect(mockClearTimeout).toHaveBeenCalledWith(222);

    // 检查统计更新
    stats = resourceManager.getResourceStats();
    expect(stats.timers).toBe(2);

    // 尝试移除不存在的资源
    const notRemoved = resourceManager.unregisterResource('non-existent');
    expect(notRemoved).toBe(false);
  });
});

describe('全局资源管理器测试', () => {
  let globalManager: ReturnType<typeof getGlobalResourceManager>;

  beforeEach(() => {
    globalManager = getGlobalResourceManager();
  });

  afterEach(() => {
    globalManager.cleanup();
  });

  test('应该管理多个编辑器的资源', () => {
    const editor1 = globalManager.getEditorManager('editor-1');
    const editor2 = globalManager.getEditorManager('editor-2');

    expect(editor1).toBeDefined();
    expect(editor2).toBeDefined();
    expect(editor1).not.toBe(editor2);

    // 为每个编辑器注册资源
    editor1.registerTimer(111 as any, 'timeout', '编辑器1定时器');
    editor2.registerTimer(222 as any, 'timeout', '编辑器2定时器');

    // 检查全局统计
    const globalStats = globalManager.getGlobalStats();
    expect(globalStats['editor-1'].timers).toBe(1);
    expect(globalStats['editor-2'].timers).toBe(1);

    // 销毁一个编辑器
    globalManager.destroyEditorManager('editor-1');

    // 检查统计更新
    const updatedStats = globalManager.getGlobalStats();
    expect(updatedStats['editor-1']).toBeUndefined();
    expect(updatedStats['editor-2'].timers).toBe(1);
  });

  test('应该检测全局资源泄漏', () => {
    const editor1 = globalManager.getEditorManager('editor-1');
    const editor2 = globalManager.getEditorManager('editor-2');

    // 为编辑器1注册大量资源（模拟泄漏）
    for (let i = 0; i < 15; i++) {
      editor1.registerTimer(i as any, 'timeout', `泄漏定时器${i}`);
    }

    // 为编辑器2注册正常数量的资源
    editor2.registerTimer(1 as any, 'timeout', '正常定时器');

    // 检查全局泄漏
    const globalLeaks = globalManager.checkGlobalLeaks();
    expect(globalLeaks['editor-1']).toBeDefined();
    expect(globalLeaks['editor-1'].length).toBeGreaterThan(0);
    expect(globalLeaks['editor-2']).toBeUndefined(); // 没有泄漏
  });

  test('应该能够清理所有资源', () => {
    const mockClearTimeout = vi.fn();
    global.clearTimeout = mockClearTimeout;

    const editor1 = globalManager.getEditorManager('editor-1');
    const editor2 = globalManager.getEditorManager('editor-2');

    // 注册资源
    editor1.registerTimer(111 as any, 'timeout', '编辑器1定时器');
    editor2.registerTimer(222 as any, 'timeout', '编辑器2定时器');

    // 全局清理
    globalManager.cleanup();

    // 验证所有定时器被清理
    expect(mockClearTimeout).toHaveBeenCalledWith(111);
    expect(mockClearTimeout).toHaveBeenCalledWith(222);

    // 验证全局统计为空
    const globalStats = globalManager.getGlobalStats();
    expect(Object.keys(globalStats)).toHaveLength(0);
  });
});
