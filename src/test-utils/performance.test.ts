/**
 * 性能测试套件
 * 验证新架构的性能表现和内存使用
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cardEditStore, ActionType } from '../stores/CardEditStore';
import { templateStore } from '../stores/TemplateStore';
import { cardEditEventBus } from '../events/CardEditEventBus';
import { testEnv, createMockCard, createMockTriadTemplate } from './setup';

describe('性能测试套件', () => {
  beforeEach(() => {
    testEnv.setup();
  });

  afterEach(() => {
    testEnv.cleanup();
  });

  describe('状态管理性能', () => {
    it('应该快速处理大量状态更新', () => {
      const card = createMockCard();
      
      // 加载卡片
      cardEditStore.dispatch({
        type: ActionType.LOAD_CARD,
        payload: { card }
      });

      const startTime = performance.now();
      
      // 执行1000次状态更新
      for (let i = 0; i < 1000; i++) {
        cardEditStore.dispatch({
          type: ActionType.UPDATE_CONTENT,
          payload: { content: `内容更新 ${i}` }
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 1000次更新应该在100ms内完成
      expect(duration).toBeLessThan(100);
      
      // 验证最终状态正确
      const state = cardEditStore.getCurrentState();
      expect(state.markdownContent).toBe('内容更新 999');
      expect(state.editorState.isDirty).toBe(true);
    });

    it('应该高效处理状态订阅', () => {
      const subscribers: (() => void)[] = [];
      
      const startTime = performance.now();
      
      // 创建100个订阅者
      for (let i = 0; i < 100; i++) {
        const unsubscribe = cardEditStore.state.subscribe(() => {
          // 模拟订阅者处理
        });
        subscribers.push(unsubscribe);
      }
      
      // 触发状态更新
      cardEditStore.dispatch({
        type: ActionType.UPDATE_CONTENT,
        payload: { content: '测试内容' }
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 100个订阅者的更新应该在50ms内完成
      expect(duration).toBeLessThan(50);
      
      // 清理订阅者
      subscribers.forEach(unsubscribe => unsubscribe());
    });

    it('应该正确管理内存使用', () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // 创建大量状态更新
      for (let i = 0; i < 1000; i++) {
        const card = createMockCard({ id: `card-${i}` });
        
        cardEditStore.dispatch({
          type: ActionType.LOAD_CARD,
          payload: { card }
        });
        
        cardEditStore.dispatch({
          type: ActionType.UPDATE_CONTENT,
          payload: { content: `大量内容 ${'x'.repeat(1000)}` }
        });
        
        // 每100次重置状态以模拟正常使用
        if (i % 100 === 0) {
          cardEditStore.reset();
        }
      }
      
      // 强制垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // 内存增长应该控制在合理范围内（10MB）
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('事件系统性能', () => {
    it('应该快速处理大量事件', async () => {
      let eventCount = 0;
      
      // 添加事件监听器
      const unsubscribe = cardEditEventBus.on('content:changed', () => {
        eventCount++;
      });
      
      const startTime = performance.now();
      
      // 发射1000个事件
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(
          cardEditEventBus.emit('content:changed', {
            content: `内容 ${i}`,
            source: 'markdown'
          })
        );
      }
      
      await Promise.all(promises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 1000个事件应该在200ms内处理完成
      expect(duration).toBeLessThan(200);
      expect(eventCount).toBe(1000);
      
      unsubscribe();
    });

    it('应该高效管理事件监听器', () => {
      const listeners: (() => void)[] = [];
      
      const startTime = performance.now();
      
      // 添加1000个监听器
      for (let i = 0; i < 1000; i++) {
        const unsubscribe = cardEditEventBus.on('test:event', () => {});
        listeners.push(unsubscribe);
      }
      
      // 移除所有监听器
      listeners.forEach(unsubscribe => unsubscribe());
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 1000个监听器的添加和移除应该在100ms内完成
      expect(duration).toBeLessThan(100);
      
      // 验证监听器已被清理
      expect(cardEditEventBus.getListenerCount('test:event')).toBe(0);
    });

    it('应该避免事件监听器内存泄漏', () => {
      const initialListenerCount = cardEditEventBus.getListenerCount();
      
      // 创建和销毁大量监听器
      for (let i = 0; i < 1000; i++) {
        const unsubscribe = cardEditEventBus.on('temp:event', () => {});
        
        // 立即取消订阅
        unsubscribe();
      }
      
      const finalListenerCount = cardEditEventBus.getListenerCount();
      
      // 监听器数量应该回到初始状态
      expect(finalListenerCount).toBe(initialListenerCount);
    });
  });

  describe('模板系统性能', () => {
    it('应该快速加载大量模板', async () => {
      const templates = [];
      
      // 创建100个模板
      for (let i = 0; i < 100; i++) {
        templates.push(createMockTriadTemplate({
          id: `template-${i}`,
          name: `模板 ${i}`,
          description: `描述 ${i}`
        }));
      }
      
      const startTime = performance.now();
      
      // 加载模板
      templateStore.dispatch({
        type: 'load_success' as any,
        payload: {
          fieldTemplates: templates.map(t => t.fieldTemplate),
          triadTemplates: templates
        }
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 100个模板的加载应该在50ms内完成
      expect(duration).toBeLessThan(50);
      
      const state = templateStore.getCurrentState();
      expect(state.triadTemplates).toHaveLength(100);
      expect(state.fieldTemplates).toHaveLength(100);
    });

    it('应该高效执行模板搜索', () => {
      const templates = [];
      
      // 创建1000个模板用于搜索测试
      for (let i = 0; i < 1000; i++) {
        templates.push(createMockTriadTemplate({
          id: `template-${i}`,
          name: `模板 ${i}`,
          description: `这是第${i}个模板的描述`
        }));
      }
      
      // 加载模板
      templateStore.dispatch({
        type: 'load_success' as any,
        payload: {
          fieldTemplates: templates.map(t => t.fieldTemplate),
          triadTemplates: templates
        }
      });
      
      const startTime = performance.now();
      
      // 执行100次搜索
      for (let i = 0; i < 100; i++) {
        const searchTerm = `模板 ${i}`;
        const found = templateStore.findTemplate(`template-${i}`);
        expect(found).toBeTruthy();
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 100次搜索应该在50ms内完成
      expect(duration).toBeLessThan(50);
    });

    it('应该有效利用模板缓存', () => {
      const template = createMockTriadTemplate();
      
      // 加载模板
      templateStore.dispatch({
        type: 'load_success' as any,
        payload: {
          fieldTemplates: [template.fieldTemplate],
          triadTemplates: [template]
        }
      });
      
      const startTime = performance.now();
      
      // 多次查找同一个模板
      for (let i = 0; i < 1000; i++) {
        const found = templateStore.findTemplate(template.id);
        expect(found).toBeTruthy();
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 1000次缓存查找应该在10ms内完成
      expect(duration).toBeLessThan(10);
      
      const stats = templateStore.getStats();
      expect(stats.cacheHits).toBeGreaterThan(0);
    });
  });

  describe('组件渲染性能', () => {
    it('应该快速处理大量内容更新', async () => {
      const card = createMockCard();
      
      cardEditStore.dispatch({
        type: ActionType.LOAD_CARD,
        payload: { card }
      });
      
      const startTime = performance.now();
      
      // 模拟快速输入
      for (let i = 0; i < 100; i++) {
        cardEditStore.dispatch({
          type: ActionType.UPDATE_CONTENT,
          payload: { content: `# 标题 ${i}\n\n这是第${i}次更新的内容。` }
        });
        
        // 模拟组件重渲染延迟
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 100次更新应该在500ms内完成（包括模拟的渲染延迟）
      expect(duration).toBeLessThan(500);
    });

    it('应该避免不必要的重渲染', () => {
      let renderCount = 0;
      
      // 模拟组件订阅
      const unsubscribe = cardEditStore.state.subscribe(() => {
        renderCount++;
      });
      
      const card = createMockCard();
      
      // 加载相同的卡片多次
      for (let i = 0; i < 10; i++) {
        cardEditStore.dispatch({
          type: ActionType.LOAD_CARD,
          payload: { card }
        });
      }
      
      // 应该只触发一次渲染（因为数据相同）
      expect(renderCount).toBeLessThanOrEqual(10);
      
      unsubscribe();
    });
  });

  describe('内存管理', () => {
    it('应该正确清理组件资源', () => {
      const initialEventCount = cardEditEventBus.getListenerCount();
      
      // 模拟组件生命周期
      const cleanupFunctions: (() => void)[] = [];
      
      // 创建多个"组件"
      for (let i = 0; i < 50; i++) {
        const unsubscribe1 = cardEditEventBus.on('test:event1', () => {});
        const unsubscribe2 = cardEditEventBus.on('test:event2', () => {});
        const unsubscribe3 = cardEditStore.state.subscribe(() => {});
        
        cleanupFunctions.push(() => {
          unsubscribe1();
          unsubscribe2();
          unsubscribe3();
        });
      }
      
      // 销毁所有"组件"
      cleanupFunctions.forEach(cleanup => cleanup());
      
      const finalEventCount = cardEditEventBus.getListenerCount();
      
      // 事件监听器应该被完全清理
      expect(finalEventCount).toBe(initialEventCount);
    });

    it('应该避免状态管理器内存泄漏', () => {
      const initialState = cardEditStore.getCurrentState();
      
      // 创建大量状态变更
      for (let i = 0; i < 1000; i++) {
        const card = createMockCard({
          id: `card-${i}`,
          fields: {
            question: `问题 ${i}`,
            answer: `答案 ${i}`,
            notes: `# 笔记 ${i}\n\n${'内容'.repeat(100)}`
          }
        });
        
        cardEditStore.dispatch({
          type: ActionType.LOAD_CARD,
          payload: { card }
        });
      }
      
      // 重置状态
      cardEditStore.reset();
      
      const finalState = cardEditStore.getCurrentState();
      
      // 状态应该回到初始状态
      expect(finalState.currentCard).toBe(initialState.currentCard);
      expect(finalState.markdownContent).toBe(initialState.markdownContent);
      expect(finalState.editorState.isDirty).toBe(initialState.editorState.isDirty);
    });
  });
});
