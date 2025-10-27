/**
 * 架构测试套件
 * 验证新架构的正确性和稳定性
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// 架构组件
import { 
  ArchitectureRegistry, 
  ArchitectureHealthChecker,
  ArchitectureLayer,
  ComponentType,
  DependencyRules
} from '../layered-architecture';

import { 
  UnifiedStateManager,
  dispatchUI,
  dispatchData,
  getCurrentState
} from '../unified-state-management';

import {
  DIContainer,
  ServiceLifetime,
  registerService,
  resolveService,
  createServiceToken,
  GlobalContainer
} from '../dependency-injection';

import {
  UnifiedErrorHandler,
  ErrorCategory,
  ErrorSeverity,
  handleError,
  createErrorContext
} from '../unified-error-handler';

import {
  PerformanceMonitor,
  PerformanceWarningType
} from '../performance-monitor';

import {
  CacheManager,
  CacheStrategy,
  CachePriority,
  setCache,
  getCache,
  clearCache
} from '../cache-manager';

// ============================================================================
// 分层架构测试
// ============================================================================

describe('分层架构系统', () => {
  let registry: ArchitectureRegistry;
  let healthChecker: ArchitectureHealthChecker;

  beforeEach(() => {
    registry = ArchitectureRegistry.getInstance();
    healthChecker = new ArchitectureHealthChecker();
  });

  describe('依赖规则验证', () => {
    it('应该允许合法的依赖关系', () => {
      // 表现层 -> 应用层
      expect(DependencyRules.validateDependency(
        ArchitectureLayer.PRESENTATION, 
        ArchitectureLayer.APPLICATION
      )).toBe(true);

      // 应用层 -> 领域层
      expect(DependencyRules.validateDependency(
        ArchitectureLayer.APPLICATION, 
        ArchitectureLayer.DOMAIN
      )).toBe(true);

      // 应用层 -> 基础设施层
      expect(DependencyRules.validateDependency(
        ArchitectureLayer.APPLICATION, 
        ArchitectureLayer.INFRASTRUCTURE
      )).toBe(true);
    });

    it('应该拒绝非法的依赖关系', () => {
      // 领域层 -> 应用层 (向上依赖)
      expect(DependencyRules.validateDependency(
        ArchitectureLayer.DOMAIN, 
        ArchitectureLayer.APPLICATION
      )).toBe(false);

      // 基础设施层 -> 表现层 (跨层依赖)
      expect(DependencyRules.validateDependency(
        ArchitectureLayer.INFRASTRUCTURE, 
        ArchitectureLayer.PRESENTATION
      )).toBe(false);
    });
  });

  describe('组件注册', () => {
    it('应该成功注册合法组件', () => {
      const metadata = {
        id: 'test.component.example',
        name: 'TestComponent',
        layer: ArchitectureLayer.PRESENTATION,
        type: ComponentType.VIEW_COMPONENT,
        dependencies: [],
        description: '测试组件'
      };

      expect(() => {
        registry.registerComponent(metadata);
      }).not.toThrow();

      const component = registry.getComponent(metadata.id);
      expect(component).toEqual(metadata);
    });

    it('应该拒绝非法依赖的组件', () => {
      const metadata = {
        id: 'test.component.invalid',
        name: 'InvalidComponent',
        layer: ArchitectureLayer.DOMAIN,
        type: ComponentType.DOMAIN_SERVICE,
        dependencies: ['presentation.component.ui'], // 非法向上依赖
        description: '非法组件'
      };

      // 先注册被依赖的组件
      registry.registerComponent({
        id: 'presentation.component.ui',
        name: 'UIComponent',
        layer: ArchitectureLayer.PRESENTATION,
        type: ComponentType.VIEW_COMPONENT,
        dependencies: [],
        description: 'UI组件'
      });

      expect(() => {
        registry.registerComponent(metadata);
      }).toThrow();
    });
  });

  describe('循环依赖检测', () => {
    it('应该检测到循环依赖', () => {
      // 创建循环依赖
      registry.registerComponent({
        id: 'service.a',
        name: 'ServiceA',
        layer: ArchitectureLayer.APPLICATION,
        type: ComponentType.APPLICATION_SERVICE,
        dependencies: ['service.b'],
        description: '服务A'
      });

      registry.registerComponent({
        id: 'service.b',
        name: 'ServiceB',
        layer: ArchitectureLayer.APPLICATION,
        type: ComponentType.APPLICATION_SERVICE,
        dependencies: ['service.a'], // 循环依赖
        description: '服务B'
      });

      const cycles = registry.detectCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('service.a');
      expect(cycles[0]).toContain('service.b');
    });
  });

  describe('架构健康检查', () => {
    it('应该生成健康报告', async () => {
      const report = await healthChecker.performHealthCheck();
      
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('issues');
      expect(report).toHaveProperty('report');
      expect(report).toHaveProperty('checkDuration');
      expect(report).toHaveProperty('checkedAt');
      
      expect(typeof report.checkDuration).toBe('number');
      expect(Array.isArray(report.issues)).toBe(true);
    });
  });
});

// ============================================================================
// 统一状态管理测试
// ============================================================================

describe('统一状态管理系统', () => {
  let stateManager: UnifiedStateManager;

  beforeEach(() => {
    stateManager = UnifiedStateManager.getInstance();
  });

  describe('状态变更', () => {
    it('应该正确分发UI事件', () => {
      const initialState = getCurrentState();
      
      dispatchUI('SET_CURRENT_PAGE', 'test-page');
      
      const newState = getCurrentState();
      expect(newState.ui.currentPage).toBe('test-page');
      expect(newState.ui.currentPage).not.toBe(initialState.ui.currentPage);
    });

    it('应该正确分发数据事件', () => {
      const testDeck = { id: 'test-deck', name: 'Test Deck' };
      
      dispatchData('ADD_DECK', testDeck);
      
      const state = getCurrentState();
      expect(state.data.decks.has(testDeck.id)).toBe(true);
      expect(state.data.decks.get(testDeck.id)).toEqual(testDeck);
    });

    it('应该正确处理通知', () => {
      const notification = {
        id: 'test-notification',
        type: 'success' as const,
        message: 'Test message',
        duration: 3000,
        timestamp: Date.now()
      };
      
      dispatchUI('ADD_NOTIFICATION', notification);
      
      const state = getCurrentState();
      expect(state.ui.notifications).toContainEqual(notification);
    });
  });

  describe('状态订阅', () => {
    it('应该正确通知订阅者', () => {
      const mockListener = jest.fn();
      
      const unsubscribe = stateManager.subscribe(mockListener);
      
      // 初始调用
      expect(mockListener).toHaveBeenCalledTimes(1);
      
      dispatchUI('SET_LOADING', true);
      
      // 状态变更后的调用
      expect(mockListener).toHaveBeenCalledTimes(2);
      
      unsubscribe();
    });
  });
});

// ============================================================================
// 依赖注入测试
// ============================================================================

describe('依赖注入系统', () => {
  let container: DIContainer;

  beforeEach(() => {
    container = new DIContainer();
  });

  afterEach(() => {
    container.dispose();
    GlobalContainer.reset();
  });

  describe('服务注册和解析', () => {
    it('应该正确注册和解析单例服务', () => {
      const testToken = createServiceToken<TestService>('TestService');
      
      class TestService {
        getValue() { return 'test-value'; }
      }

      container.register({
        token: testToken,
        implementation: TestService,
        lifetime: ServiceLifetime.SINGLETON
      });

      const service1 = container.resolve(testToken);
      const service2 = container.resolve(testToken);

      expect(service1).toBe(service2); // 单例
      expect(service1.getValue()).toBe('test-value');
    });

    it('应该正确注册和解析瞬态服务', () => {
      const testToken = createServiceToken<TestService>('TestService');
      
      class TestService {
        id = Math.random();
      }

      container.register({
        token: testToken,
        implementation: TestService,
        lifetime: ServiceLifetime.TRANSIENT
      });

      const service1 = container.resolve(testToken);
      const service2 = container.resolve(testToken);

      expect(service1).not.toBe(service2); // 不同实例
      expect(service1.id).not.toBe(service2.id);
    });

    it('应该正确处理依赖注入', () => {
      const depToken = createServiceToken<DependencyService>('DependencyService');
      const mainToken = createServiceToken<MainService>('MainService');

      class DependencyService {
        getValue() { return 'dependency-value'; }
      }

      class MainService {
        constructor(private dep: DependencyService) {}
        getDepValue() { return this.dep.getValue(); }
      }

      container.register({
        token: depToken,
        implementation: DependencyService,
        lifetime: ServiceLifetime.SINGLETON
      });

      container.register({
        token: mainToken,
        implementation: MainService,
        lifetime: ServiceLifetime.SINGLETON,
        dependencies: [depToken]
      });

      const mainService = container.resolve(mainToken);
      expect(mainService.getDepValue()).toBe('dependency-value');
    });
  });

  describe('作用域管理', () => {
    it('应该正确创建和管理作用域', () => {
      const testToken = createServiceToken<TestService>('TestService');
      
      class TestService {
        id = Math.random();
      }

      container.register({
        token: testToken,
        implementation: TestService,
        lifetime: ServiceLifetime.SCOPED
      });

      const scope1 = container.createScope();
      const scope2 = container.createScope();

      const service1a = scope1.resolve(testToken);
      const service1b = scope1.resolve(testToken);
      const service2a = scope2.resolve(testToken);

      expect(service1a).toBe(service1b); // 同一作用域内是单例
      expect(service1a).not.toBe(service2a); // 不同作用域是不同实例

      scope1.dispose();
      scope2.dispose();
    });
  });
});

// ============================================================================
// 错误处理测试
// ============================================================================

describe('统一错误处理系统', () => {
  let errorHandler: UnifiedErrorHandler;

  beforeEach(() => {
    errorHandler = UnifiedErrorHandler.getInstance();
  });

  describe('错误处理', () => {
    it('应该正确处理字符串错误', async () => {
      const result = await handleError('测试错误消息');
      
      expect(result.handled).toBe(true);
      expect(result.logged).toBe(true);
    });

    it('应该正确处理Error对象', async () => {
      const error = new Error('测试错误');
      const context = createErrorContext('TestComponent', 'testOperation');
      
      const result = await errorHandler.handleError(error, context);
      
      expect(result.handled).toBe(true);
      expect(result.logged).toBe(true);
    });

    it('应该正确分类错误', async () => {
      const networkError = '网络连接失败';
      const validationError = '数据验证失败';
      
      await handleError(networkError);
      await handleError(validationError);
      
      const history = errorHandler.getErrorHistory();
      
      expect(history.some(e => e.category === ErrorCategory.NETWORK)).toBe(true);
      expect(history.some(e => e.category === ErrorCategory.VALIDATION)).toBe(true);
    });
  });

  describe('错误恢复', () => {
    it('应该尝试错误恢复', async () => {
      const mockStrategy = {
        name: 'test-recovery',
        description: '测试恢复策略',
        execute: jest.fn().mockResolvedValue(true),
        maxAttempts: 3,
        retryDelay: 100
      };

      errorHandler.addRecoveryStrategy(mockStrategy, ErrorCategory.NETWORK);

      const result = await handleError('网络连接失败');
      
      expect(result.recovered).toBe(true);
      expect(mockStrategy.execute).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// 性能监控测试
// ============================================================================

describe('性能监控系统', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    performanceMonitor = PerformanceMonitor.getInstance();
  });

  afterEach(() => {
    performanceMonitor.stopMonitoring();
  });

  describe('性能监控', () => {
    it('应该能够启动和停止监控', () => {
      expect(() => {
        performanceMonitor.startMonitoring();
        performanceMonitor.stopMonitoring();
      }).not.toThrow();
    });

    it('应该收集性能指标', async () => {
      performanceMonitor.startMonitoring();
      
      // 等待一些指标收集
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = performanceMonitor.getMetricsHistory();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('应该生成性能警告', () => {
      const warnings = performanceMonitor.getWarnings();
      expect(Array.isArray(warnings)).toBe(true);
    });
  });
});

// ============================================================================
// 缓存系统测试
// ============================================================================

describe('多层缓存系统', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = CacheManager.getInstance();
  });

  afterEach(async () => {
    await clearCache('test');
  });

  describe('缓存操作', () => {
    it('应该正确设置和获取缓存', async () => {
      const testData = { id: 'test', value: 'test-data' };
      
      await setCache('test', 'key1', testData);
      const retrieved = await getCache('test', 'key1');
      
      expect(retrieved).toEqual(testData);
    });

    it('应该正确处理缓存未命中', async () => {
      const result = await getCache('test', 'non-existent-key');
      expect(result).toBeNull();
    });

    it('应该正确处理TTL过期', async () => {
      const testData = { value: 'expires-soon' };
      
      await setCache('test', 'ttl-key', testData, { ttl: 50 }); // 50ms TTL
      
      // 立即获取应该成功
      let result = await getCache('test', 'ttl-key');
      expect(result).toEqual(testData);
      
      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 过期后应该返回null
      result = await getCache('test', 'ttl-key');
      expect(result).toBeNull();
    });

    it('应该正确清空缓存', async () => {
      await setCache('test', 'key1', { value: 'data1' });
      await setCache('test', 'key2', { value: 'data2' });
      
      await clearCache('test');
      
      const result1 = await getCache('test', 'key1');
      const result2 = await getCache('test', 'key2');
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('缓存统计', () => {
    it('应该正确统计缓存命中率', async () => {
      // 设置一些缓存
      await setCache('test', 'key1', { value: 'data1' });
      
      // 命中
      await getCache('test', 'key1');
      await getCache('test', 'key1');
      
      // 未命中
      await getCache('test', 'non-existent');
      
      const stats = cacheManager.getStats('test');
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });
  });
});

// ============================================================================
// 集成测试
// ============================================================================

describe('架构集成测试', () => {
  it('应该能够完整初始化所有系统', () => {
    expect(() => {
      // 初始化各个系统
      const registry = ArchitectureRegistry.getInstance();
      const stateManager = UnifiedStateManager.getInstance();
      const errorHandler = UnifiedErrorHandler.getInstance();
      const performanceMonitor = PerformanceMonitor.getInstance();
      const cacheManager = CacheManager.getInstance();
      
      // 验证实例存在
      expect(registry).toBeDefined();
      expect(stateManager).toBeDefined();
      expect(errorHandler).toBeDefined();
      expect(performanceMonitor).toBeDefined();
      expect(cacheManager).toBeDefined();
    }).not.toThrow();
  });

  it('应该能够处理复杂的工作流', async () => {
    // 1. 状态变更
    dispatchUI('SET_LOADING', true);
    
    // 2. 缓存操作
    await setCache('workflow', 'step1', { completed: true });
    
    // 3. 错误处理
    const result = await handleError('工作流测试错误', 
      createErrorContext('IntegrationTest', 'complexWorkflow'));
    
    // 4. 验证结果
    const state = getCurrentState();
    const cached = await getCache('workflow', 'step1');
    
    expect(state.ui.loading).toBe(true);
    expect(cached).toEqual({ completed: true });
    expect(result.handled).toBe(true);
  });
});

// ============================================================================
// 测试工具类
// ============================================================================

class TestService {
  getValue() { return 'test-value'; }
}

class DependencyService {
  getValue() { return 'dependency-value'; }
}

class MainService {
  constructor(private dep: DependencyService) {}
  getDepValue() { return this.dep.getValue(); }
}
