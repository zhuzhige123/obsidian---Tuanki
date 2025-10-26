/**
 * 资源管理器基础功能测试
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { EditorResourceManager, getGlobalResourceManager } from '../utils/resource-manager';

describe('资源管理器基础测试', () => {
  let resourceManager: EditorResourceManager;
  const editorId = 'test-editor';

  beforeEach(() => {
    const globalManager = getGlobalResourceManager();
    resourceManager = globalManager.getEditorManager(editorId);
  });

  test('应该能创建资源管理器实例', () => {
    expect(resourceManager).toBeDefined();
    expect(typeof resourceManager.registerTimer).toBe('function');
    expect(typeof resourceManager.registerEventListener).toBe('function');
    expect(typeof resourceManager.registerPromise).toBe('function');
    expect(typeof resourceManager.registerComponent).toBe('function');
    expect(typeof resourceManager.registerCustomCleanup).toBe('function');
  });

  test('应该能获取资源统计', () => {
    const stats = resourceManager.getResourceStats();
    expect(stats).toBeDefined();
    expect(typeof stats.timers).toBe('number');
    expect(typeof stats.eventListeners).toBe('number');
    expect(typeof stats.promises).toBe('number');
    expect(typeof stats.components).toBe('number');
    expect(typeof stats.customCleanups).toBe('number');
    expect(typeof stats.total).toBe('number');
  });

  test('应该能注册定时器', () => {
    const timerId = resourceManager.registerTimer(123 as any, 'timeout', '测试定时器');
    expect(timerId).toBeTruthy();
    expect(typeof timerId).toBe('string');

    const stats = resourceManager.getResourceStats();
    expect(stats.timers).toBe(1);
    expect(stats.total).toBe(1);
  });

  test('应该能注册自定义清理函数', () => {
    let cleanupCalled = false;
    const cleanup = () => { cleanupCalled = true; };

    const cleanupId = resourceManager.registerCustomCleanup(cleanup, '测试清理');
    expect(cleanupId).toBeTruthy();

    const stats = resourceManager.getResourceStats();
    expect(stats.customCleanups).toBe(1);

    // 销毁资源管理器
    resourceManager.destroy();

    // 验证清理函数被调用
    expect(cleanupCalled).toBe(true);
  });

  test('应该能检测资源泄漏', () => {
    // 注册大量定时器
    for (let i = 0; i < 15; i++) {
      resourceManager.registerTimer(i as any, 'timeout', `定时器${i}`);
    }

    const leaks = resourceManager.checkForLeaks();
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.some(leak => leak.includes('定时器过多'))).toBe(true);
  });

  test('应该能销毁所有资源', () => {
    // 注册一些资源
    resourceManager.registerTimer(123 as any, 'timeout', '测试定时器');
    resourceManager.registerCustomCleanup(() => {}, '测试清理');

    let stats = resourceManager.getResourceStats();
    expect(stats.total).toBeGreaterThan(0);

    // 销毁
    resourceManager.destroy();

    // 验证资源被清理
    stats = resourceManager.getResourceStats();
    expect(stats.total).toBe(0);
  });
});

describe('全局资源管理器基础测试', () => {
  test('应该能获取全局资源管理器实例', () => {
    const globalManager = getGlobalResourceManager();
    expect(globalManager).toBeDefined();
    expect(typeof globalManager.getEditorManager).toBe('function');
    expect(typeof globalManager.destroyEditorManager).toBe('function');
    expect(typeof globalManager.getGlobalStats).toBe('function');
    expect(typeof globalManager.checkGlobalLeaks).toBe('function');
    expect(typeof globalManager.cleanup).toBe('function');
  });

  test('应该能管理多个编辑器', () => {
    const globalManager = getGlobalResourceManager();
    
    const editor1 = globalManager.getEditorManager('editor-1');
    const editor2 = globalManager.getEditorManager('editor-2');

    expect(editor1).toBeDefined();
    expect(editor2).toBeDefined();
    expect(editor1).not.toBe(editor2);

    // 清理
    globalManager.destroyEditorManager('editor-1');
    globalManager.destroyEditorManager('editor-2');
  });

  test('应该能获取全局统计', () => {
    const globalManager = getGlobalResourceManager();
    
    const editor1 = globalManager.getEditorManager('test-editor-1');
    editor1.registerTimer(123 as any, 'timeout', '测试定时器');

    const globalStats = globalManager.getGlobalStats();
    expect(globalStats).toBeDefined();
    expect(globalStats['test-editor-1']).toBeDefined();
    expect(globalStats['test-editor-1'].timers).toBe(1);

    // 清理
    globalManager.destroyEditorManager('test-editor-1');
  });
});
