/**
 * 内存泄漏防护演示
 * 展示资源管理器如何防止编辑器内存泄漏
 */

import { getGlobalResourceManager } from '../utils/resource-manager';

/**
 * 模拟旧版本的内存泄漏问题
 */
class OldEditorWithLeaks {
  private editorId: string;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private eventListeners: { target: EventTarget, type: string, listener: EventListener }[] = [];
  private components: any[] = [];

  constructor(editorId: string) {
    this.editorId = editorId;
  }

  // 模拟编辑器初始化，创建各种资源但不正确清理
  initialize() {
    console.log(`[旧版本] 初始化编辑器: ${this.editorId}`);

    // 创建定时器但不记录引用
    setTimeout(() => {
      console.log(`[旧版本] 定时器执行: ${this.editorId}`);
    }, 1000);

    setInterval(() => {
      console.log(`[旧版本] 间隔定时器执行: ${this.editorId}`);
    }, 5000);

    // 添加事件监听器但不记录引用
    const listener = () => console.log(`[旧版本] 事件触发: ${this.editorId}`);
    window.addEventListener('resize', listener);

    // 创建组件但不正确清理
    const mockComponent = {
      name: `Component-${this.editorId}`,
      cleanup: () => console.log(`[旧版本] 组件清理: ${this.editorId}`)
    };
    this.components.push(mockComponent);
  }

  // 模拟不完整的销毁
  destroy() {
    console.log(`[旧版本] 销毁编辑器: ${this.editorId} (不完整清理)`);
    
    // 只清理了部分资源，遗漏了定时器和事件监听器
    this.components.forEach(comp => {
      try {
        comp.cleanup();
      } catch (error) {
        console.error(`[旧版本] 组件清理失败:`, error);
      }
    });
    this.components = [];
    
    // 定时器和事件监听器没有被清理！
    console.log(`[旧版本] ⚠️ 定时器和事件监听器可能泄漏`);
  }
}

/**
 * 新版本使用资源管理器的编辑器
 */
class NewEditorWithResourceManager {
  private editorId: string;
  private resourceManager: ReturnType<typeof getGlobalResourceManager>['getEditorManager'];

  constructor(editorId: string) {
    this.editorId = editorId;
    this.resourceManager = getGlobalResourceManager().getEditorManager(editorId);
  }

  // 使用资源管理器正确管理资源
  initialize() {
    console.log(`[新版本] 初始化编辑器: ${this.editorId}`);

    // 创建定时器并注册到资源管理器
    const timer1 = setTimeout(() => {
      console.log(`[新版本] 定时器执行: ${this.editorId}`);
    }, 1000);
    this.resourceManager.registerTimer(timer1, 'timeout', '主定时器');

    const timer2 = setInterval(() => {
      console.log(`[新版本] 间隔定时器执行: ${this.editorId}`);
    }, 5000);
    this.resourceManager.registerTimer(timer2, 'interval', '间隔定时器');

    // 添加事件监听器并注册到资源管理器
    const listener = () => console.log(`[新版本] 事件触发: ${this.editorId}`);
    this.resourceManager.registerEventListener(
      window,
      'resize',
      listener,
      false,
      '窗口大小变化监听器'
    );

    // 创建组件并注册到资源管理器
    const mockComponent = {
      name: `Component-${this.editorId}`,
      cleanup: () => console.log(`[新版本] 组件清理: ${this.editorId}`)
    };
    
    this.resourceManager.registerComponent(
      mockComponent,
      () => mockComponent.cleanup(),
      '模拟组件'
    );

    // 创建Promise并注册
    const asyncTask = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log(`[新版本] 异步任务完成: ${this.editorId}`);
        resolve();
      }, 2000);
    });
    
    this.resourceManager.registerPromise(asyncTask, undefined, '异步初始化任务');
  }

  // 使用资源管理器完整销毁
  destroy() {
    console.log(`[新版本] 销毁编辑器: ${this.editorId}`);
    
    // 获取销毁前的资源统计
    const stats = this.resourceManager.getResourceStats();
    console.log(`[新版本] 销毁前资源统计:`, stats);
    
    // 检查资源泄漏
    const leaks = this.resourceManager.checkForLeaks();
    if (leaks.length > 0) {
      console.warn(`[新版本] 检测到潜在泄漏:`, leaks);
    }
    
    // 统一销毁所有资源
    getGlobalResourceManager().destroyEditorManager(this.editorId);
    
    console.log(`[新版本] ✅ 所有资源已安全清理`);
  }

  // 获取资源统计
  getResourceStats() {
    return this.resourceManager.getResourceStats();
  }
}

/**
 * 演示内存泄漏防护效果
 */
export async function demonstrateMemoryLeakPrevention() {
  console.log('\n=== 内存泄漏防护演示 ===\n');

  // 1. 演示旧版本的内存泄漏问题
  console.log('1. 旧版本编辑器（存在内存泄漏）:');
  const oldEditor1 = new OldEditorWithLeaks('old-editor-1');
  const oldEditor2 = new OldEditorWithLeaks('old-editor-2');
  
  oldEditor1.initialize();
  oldEditor2.initialize();
  
  console.log('等待2秒后销毁旧版本编辑器...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  oldEditor1.destroy();
  oldEditor2.destroy();
  
  console.log('⚠️ 旧版本：定时器和事件监听器可能仍在运行，造成内存泄漏\n');

  // 2. 演示新版本的资源管理
  console.log('2. 新版本编辑器（使用资源管理器）:');
  const newEditor1 = new NewEditorWithResourceManager('new-editor-1');
  const newEditor2 = new NewEditorWithResourceManager('new-editor-2');
  
  newEditor1.initialize();
  newEditor2.initialize();
  
  // 显示资源统计
  console.log('编辑器1资源统计:', newEditor1.getResourceStats());
  console.log('编辑器2资源统计:', newEditor2.getResourceStats());
  
  console.log('等待2秒后销毁新版本编辑器...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  newEditor1.destroy();
  newEditor2.destroy();
  
  console.log('✅ 新版本：所有资源已安全清理，无内存泄漏\n');
}

/**
 * 演示资源泄漏检测
 */
export function demonstrateLeakDetection() {
  console.log('\n=== 资源泄漏检测演示 ===\n');

  const globalManager = getGlobalResourceManager();
  
  // 创建一个编辑器并故意创建大量资源
  const editorId = 'leak-test-editor';
  const resourceManager = globalManager.getEditorManager(editorId);
  
  console.log('创建大量资源（模拟泄漏）...');
  
  // 创建过多的定时器
  for (let i = 0; i < 15; i++) {
    const timer = setTimeout(() => {}, 10000);
    resourceManager.registerTimer(timer, 'timeout', `泄漏定时器${i}`);
  }
  
  // 创建过多的事件监听器
  for (let i = 0; i < 25; i++) {
    const mockTarget = {
      addEventListener: () => {},
      removeEventListener: () => {}
    } as any;
    
    resourceManager.registerEventListener(
      mockTarget,
      'click',
      () => {},
      false,
      `泄漏监听器${i}`
    );
  }
  
  // 创建过多的Promise
  for (let i = 0; i < 8; i++) {
    const promise = new Promise(() => {}); // 永不resolve的Promise
    resourceManager.registerPromise(promise, undefined, `泄漏Promise${i}`);
  }
  
  // 检查资源统计
  const stats = resourceManager.getResourceStats();
  console.log('资源统计:', stats);
  
  // 检查泄漏
  const leaks = resourceManager.checkForLeaks();
  console.log('检测到的泄漏:', leaks);
  
  if (leaks.length > 0) {
    console.log('🚨 检测到资源泄漏！建议检查代码');
  } else {
    console.log('✅ 未检测到资源泄漏');
  }
  
  // 清理资源
  console.log('清理所有资源...');
  globalManager.destroyEditorManager(editorId);
  console.log('✅ 资源清理完成');
}

/**
 * 演示全局资源管理
 */
export function demonstrateGlobalResourceManagement() {
  console.log('\n=== 全局资源管理演示 ===\n');

  const globalManager = getGlobalResourceManager();
  
  // 创建多个编辑器
  const editors = ['editor-A', 'editor-B', 'editor-C'];
  
  console.log('创建多个编辑器实例...');
  editors.forEach(editorId => {
    const resourceManager = globalManager.getEditorManager(editorId);
    
    // 为每个编辑器创建不同数量的资源
    const resourceCount = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < resourceCount; i++) {
      const timer = setTimeout(() => {}, 5000);
      resourceManager.registerTimer(timer, 'timeout', `${editorId}-定时器${i}`);
    }
    
    console.log(`${editorId}: 创建了 ${resourceCount} 个定时器`);
  });
  
  // 显示全局统计
  console.log('\n全局资源统计:');
  const globalStats = globalManager.getGlobalStats();
  Object.entries(globalStats).forEach(([editorId, stats]) => {
    console.log(`${editorId}:`, stats);
  });
  
  // 检查全局泄漏
  console.log('\n检查全局资源泄漏:');
  const globalLeaks = globalManager.checkGlobalLeaks();
  if (Object.keys(globalLeaks).length > 0) {
    console.log('发现泄漏:', globalLeaks);
  } else {
    console.log('✅ 未发现全局资源泄漏');
  }
  
  // 销毁特定编辑器
  console.log('\n销毁编辑器 editor-B...');
  globalManager.destroyEditorManager('editor-B');
  
  // 显示更新后的统计
  console.log('更新后的全局统计:');
  const updatedStats = globalManager.getGlobalStats();
  Object.entries(updatedStats).forEach(([editorId, stats]) => {
    console.log(`${editorId}:`, stats);
  });
  
  // 全局清理
  console.log('\n执行全局清理...');
  globalManager.cleanup();
  
  const finalStats = globalManager.getGlobalStats();
  console.log('清理后的全局统计:', finalStats);
  console.log('✅ 全局资源管理演示完成');
}

// 如果直接运行此文件，执行所有演示
// 注意：在构建过程中不应该执行演示代码
if (typeof window === 'undefined' && typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('memory-leak-prevention-demo')) {
  demonstrateMemoryLeakPrevention()
    .then(() => demonstrateLeakDetection())
    .then(() => demonstrateGlobalResourceManagement())
    .catch(console.error);
}
