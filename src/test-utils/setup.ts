/**
 * 测试环境设置工具
 * 提供统一的测试环境配置和工具函数
 */

import { vi } from 'vitest';
import { cardEditStore } from '../stores/CardEditStore';
import { templateStore } from '../stores/TemplateStore';
import { cardEditEventBus } from '../events/CardEditEventBus';
import type { Card, Deck } from '../data/types';
import type { FieldTemplate, TriadTemplate } from '../data/template-types';

// Mock数据工厂
export const createMockCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'test-card-1',
  templateId: 'basic-template',
  fields: {
    question: '什么是TypeScript？',
    answer: 'TypeScript是JavaScript的超集，添加了静态类型检查。',
    notes: '# 什么是TypeScript？\n\nTypeScript是JavaScript的超集，添加了静态类型检查。'
  },
  tags: ['编程', 'TypeScript'],
  deckId: 'deck-1',
  created: '2024-01-01T00:00:00.000Z',
  modified: '2024-01-01T00:00:00.000Z',
  ...overrides
});

export const createMockDecks = (): Deck[] => [
  {
    id: 'deck-1',
    name: '编程学习',
    stats: { totalCards: 10, newCards: 2, reviewCards: 8 }
  },
  {
    id: 'deck-2',
    name: '语言学习',
    stats: { totalCards: 5, newCards: 1, reviewCards: 4 }
  }
];

export const createMockFieldTemplate = (overrides: Partial<FieldTemplate> = {}): FieldTemplate => ({
  id: 'field-template-1',
  name: '基础字段模板',
  description: '基础的问答卡片模板',
  fields: [
    {
      key: 'question',
      name: '问题',
      type: 'field',
      required: true,
      placeholder: '输入问题...'
    },
    {
      key: 'answer',
      name: '答案',
      type: 'field',
      required: true,
      placeholder: '输入答案...'
    }
  ],
  ...overrides
});

export const createMockTriadTemplate = (overrides: Partial<TriadTemplate> = {}): TriadTemplate => ({
  id: 'triad-template-1',
  name: '三位一体模板',
  description: 'Markdown + 字段 + 预览的三位一体模板',
  fieldTemplate: createMockFieldTemplate(),
  markdownTemplate: '# {{question}}\n\n{{answer}}',
  previewTemplate: '<h1>{{question}}</h1><p>{{answer}}</p>',
  ...overrides
});

export const createMockPlugin = () => ({
  app: {
    workspace: {
      getActiveFile: vi.fn(),
      getActiveViewOfType: vi.fn()
    },
    vault: {
      read: vi.fn(),
      modify: vi.fn(),
      create: vi.fn()
    }
  },
  settings: {
    defaultDeck: 'deck-1',
    enablePreview: true,
    autoSave: true
  },
  loadData: vi.fn(),
  saveData: vi.fn()
});

export const createMockDataStorage = () => ({
  saveCard: vi.fn().mockResolvedValue({ success: true }),
  loadCard: vi.fn().mockResolvedValue({ success: true }),
  deleteCard: vi.fn().mockResolvedValue({ success: true }),
  loadDecks: vi.fn().mockResolvedValue({ success: true, decks: createMockDecks() }),
  loadTemplates: vi.fn().mockResolvedValue({ 
    success: true, 
    fieldTemplates: [createMockFieldTemplate()],
    triadTemplates: [createMockTriadTemplate()]
  })
});

/**
 * 测试环境设置类
 */
export class TestEnvironment {
  private cleanupFunctions: (() => void)[] = [];

  /**
   * 设置测试环境
   */
  setup(): void {
    // 重置所有状态管理器
    cardEditStore.reset();
    templateStore.reset();
    
    // 清除事件总线
    cardEditEventBus.removeAllListeners();
    
    // 清除所有mock
    vi.clearAllMocks();
    
    // 设置全局mock
    this.setupGlobalMocks();
  }

  /**
   * 清理测试环境
   */
  cleanup(): void {
    // 执行所有清理函数
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
    
    // 重置状态
    cardEditStore.reset();
    templateStore.reset();
    cardEditEventBus.removeAllListeners();
    
    // 清除mock
    vi.clearAllMocks();
  }

  /**
   * 添加清理函数
   */
  addCleanup(fn: () => void): void {
    this.cleanupFunctions.push(fn);
  }

  /**
   * 设置全局mock
   */
  private setupGlobalMocks(): void {
    // Mock console方法以减少测试输出噪音
    const originalConsole = { ...console };
    
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    
    this.addCleanup(() => {
      Object.assign(console, originalConsole);
    });

    // Mock setTimeout和clearTimeout
    vi.useFakeTimers();
    this.addCleanup(() => {
      vi.useRealTimers();
    });

    // Mock DOM APIs
    Object.defineProperty(window, 'requestAnimationFrame', {
      writable: true,
      value: vi.fn((cb) => setTimeout(cb, 16))
    });

    Object.defineProperty(window, 'cancelAnimationFrame', {
      writable: true,
      value: vi.fn()
    });
  }

  /**
   * 等待异步操作完成
   */
  async waitForAsync(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
    vi.runAllTimers();
  }

  /**
   * 模拟用户输入
   */
  async simulateUserInput(element: HTMLElement, value: string): Promise<void> {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await this.waitForAsync();
  }

  /**
   * 模拟用户点击
   */
  async simulateClick(element: HTMLElement): Promise<void> {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await this.waitForAsync();
  }

  /**
   * 模拟键盘事件
   */
  async simulateKeyboard(element: HTMLElement, key: string, options: KeyboardEventInit = {}): Promise<void> {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ...options }));
    await this.waitForAsync();
  }

  /**
   * 等待事件发射
   */
  async waitForEvent<K extends keyof any>(
    eventBus: any,
    eventName: K,
    timeout: number = 1000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event ${String(eventName)} not emitted within ${timeout}ms`));
      }, timeout);

      const unsubscribe = eventBus.on(eventName, (data: any) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(data);
      });
    });
  }

  /**
   * 创建测试用的卡片编辑环境
   */
  createCardEditEnvironment() {
    const card = createMockCard();
    const decks = createMockDecks();
    const plugin = createMockPlugin();
    const dataStorage = createMockDataStorage();

    return {
      card,
      decks,
      plugin,
      dataStorage,
      mockSave: dataStorage.saveCard,
      mockLoad: dataStorage.loadCard
    };
  }

  /**
   * 创建测试用的模板环境
   */
  createTemplateEnvironment() {
    const fieldTemplate = createMockFieldTemplate();
    const triadTemplate = createMockTriadTemplate();
    const plugin = createMockPlugin();

    return {
      fieldTemplate,
      triadTemplate,
      plugin,
      templates: {
        field: [fieldTemplate],
        triad: [triadTemplate]
      }
    };
  }
}

// 导出全局测试环境实例
export const testEnv = new TestEnvironment();

/**
 * 测试工具函数
 */
export const testUtils = {
  /**
   * 等待状态变更
   */
  async waitForStateChange<T>(
    getState: () => T,
    predicate: (state: T) => boolean,
    timeout: number = 1000
  ): Promise<T> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const state = getState();
      if (predicate(state)) {
        return state;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    throw new Error(`State change not detected within ${timeout}ms`);
  },

  /**
   * 创建事件监听器spy
   */
  createEventSpy<T = any>(eventBus: any, eventName: string) {
    const spy = vi.fn();
    const unsubscribe = eventBus.on(eventName, spy);
    
    return {
      spy,
      unsubscribe,
      getCallCount: () => spy.mock.calls.length,
      getLastCall: () => spy.mock.calls[spy.mock.calls.length - 1],
      getAllCalls: () => spy.mock.calls
    };
  },

  /**
   * 验证错误处理
   */
  async expectError(fn: () => Promise<any> | any, expectedMessage?: string): Promise<Error> {
    try {
      await fn();
      throw new Error('Expected function to throw an error');
    } catch (error) {
      if (expectedMessage && !(error as Error).message.includes(expectedMessage)) {
        throw new Error(`Expected error message to contain "${expectedMessage}", got "${(error as Error).message}"`);
      }
      return error as Error;
    }
  }
};

// 全局测试钩子
export const setupTest = () => testEnv.setup();
export const cleanupTest = () => testEnv.cleanup();
