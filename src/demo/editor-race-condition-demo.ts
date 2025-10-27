/**
 * 编辑器竞态条件修复演示
 * 展示修复前后的行为差异
 */

import { getEditorInitializationManager } from '../utils/editor-initialization-manager';

/**
 * 模拟旧的竞态条件问题
 */
class OldEditorManager {
  private isInitializing = false;
  private isInitialized = false;

  async initializeEditor(editorId: string): Promise<boolean> {
    console.log(`[旧版本] 开始初始化编辑器 ${editorId}`);
    
    // 旧版本的问题：没有正确处理并发初始化
    if (this.isInitializing) {
      console.log(`[旧版本] 编辑器 ${editorId} 正在初始化中，直接返回`);
      return this.isInitialized;
    }

    if (this.isInitialized) {
      console.log(`[旧版本] 编辑器 ${editorId} 已初始化`);
      return true;
    }

    this.isInitializing = true;

    try {
      // 模拟初始化延迟
      await new Promise(resolve => setTimeout(resolve, 200));
      
      this.isInitialized = true;
      console.log(`[旧版本] 编辑器 ${editorId} 初始化完成`);
      return true;
    } catch (error) {
      console.error(`[旧版本] 编辑器 ${editorId} 初始化失败:`, error);
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  reset() {
    this.isInitializing = false;
    this.isInitialized = false;
  }
}

/**
 * 演示竞态条件问题
 */
export async function demonstrateRaceCondition() {
  console.log('\n=== 编辑器竞态条件修复演示 ===\n');

  // 1. 演示旧版本的问题
  console.log('1. 旧版本行为（存在竞态条件）:');
  const oldManager = new OldEditorManager();
  
  const oldPromises = [
    oldManager.initializeEditor('editor-1'),
    oldManager.initializeEditor('editor-1'),
    oldManager.initializeEditor('editor-1')
  ];

  const oldResults = await Promise.all(oldPromises);
  console.log('旧版本结果:', oldResults);
  console.log('问题：可能出现多个初始化进程同时运行\n');

  // 2. 演示新版本的修复
  console.log('2. 新版本行为（已修复竞态条件）:');
  const newManager = getEditorInitializationManager();
  newManager.cleanup();

  let initCount = 0;
  const mockInitFn = async (signal: AbortSignal) => {
    initCount++;
    console.log(`[新版本] 实际初始化函数被调用 (第${initCount}次)`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (signal.aborted) {
      throw new Error('初始化被中止');
    }
  };

  const newPromises = [
    newManager.safeInitialize('editor-1', mockInitFn),
    newManager.safeInitialize('editor-1', mockInitFn),
    newManager.safeInitialize('editor-1', mockInitFn)
  ];

  const newResults = await Promise.all(newPromises);
  console.log('新版本结果:', newResults.map(r => ({ success: r.success, duration: r.duration })));
  console.log(`实际初始化函数调用次数: ${initCount} (应该只有1次)`);
  console.log('修复：确保只有一个初始化进程运行\n');

  // 3. 演示中止功能
  console.log('3. 演示初始化中止功能:');
  const abortPromise = newManager.safeInitialize('editor-2', async (signal) => {
    console.log('[新版本] 开始长时间初始化...');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 2000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('初始化被中止'));
      });
    });
  });

  // 100ms后中止
  setTimeout(() => {
    console.log('[新版本] 中止初始化...');
    newManager.abortInitialization('editor-2');
  }, 100);

  const abortResult = await abortPromise;
  console.log('中止结果:', { success: abortResult.success, error: abortResult.error });

  console.log('\n=== 演示完成 ===');
}

/**
 * 模拟快速模态窗口切换场景
 */
export async function demonstrateModalSwitching() {
  console.log('\n=== 快速模态窗口切换场景演示 ===\n');

  const manager = getEditorInitializationManager();
  manager.cleanup();

  let initAttempts = 0;
  const mockInitFn = async (signal: AbortSignal) => {
    initAttempts++;
    const attemptId = initAttempts;
    console.log(`[模态窗口] 初始化尝试 #${attemptId} 开始`);
    
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        console.log(`[模态窗口] 初始化尝试 #${attemptId} 完成`);
        resolve(void 0);
      }, 300);
      
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        console.log(`[模态窗口] 初始化尝试 #${attemptId} 被中止`);
        reject(new Error('初始化被中止'));
      });
    });
  };

  // 模拟快速打开/关闭模态窗口
  console.log('1. 打开模态窗口 (开始初始化)');
  const init1 = manager.safeInitialize('modal-editor', mockInitFn);

  console.log('2. 50ms后关闭模态窗口 (中止初始化)');
  setTimeout(() => {
    manager.abortInitialization('modal-editor');
  }, 50);

  console.log('3. 100ms后重新打开模态窗口 (重新初始化)');
  setTimeout(async () => {
    const init2 = await manager.safeInitialize('modal-editor', mockInitFn);
    console.log('第二次初始化结果:', { success: init2.success, duration: init2.duration });
  }, 100);

  const result1 = await init1;
  console.log('第一次初始化结果:', { success: result1.success, error: result1.error });

  // 等待第二次初始化完成
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`总初始化尝试次数: ${initAttempts}`);
  console.log('\n=== 模态窗口切换演示完成 ===');
}

// 如果直接运行此文件，执行演示
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  demonstrateRaceCondition()
    .then(() => demonstrateModalSwitching())
    .catch(console.error);
}
