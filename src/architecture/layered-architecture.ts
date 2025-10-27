/**
 * 分层架构设计
 * 解决根本问题：职责混乱、依赖关系复杂、状态管理失控
 */

import { TIME_CONSTANTS } from '../constants/app-constants';

// ============================================================================
// 架构层次定义
// ============================================================================

/**
 * 架构层次枚举
 */
export enum ArchitectureLayer {
  PRESENTATION = 'presentation',     // 表现层：UI组件、用户交互
  APPLICATION = 'application',       // 应用层：业务流程、用例协调
  DOMAIN = 'domain',                 // 领域层：业务逻辑、领域模型
  INFRASTRUCTURE = 'infrastructure'  // 基础设施层：数据存储、外部服务
}

/**
 * 组件类型定义
 */
export enum ComponentType {
  // 表现层组件
  VIEW_COMPONENT = 'view_component',
  MODAL_COMPONENT = 'modal_component',
  UI_WIDGET = 'ui_widget',
  
  // 应用层组件
  APPLICATION_SERVICE = 'application_service',
  USE_CASE_HANDLER = 'use_case_handler',
  WORKFLOW_ORCHESTRATOR = 'workflow_orchestrator',
  
  // 领域层组件
  DOMAIN_SERVICE = 'domain_service',
  DOMAIN_MODEL = 'domain_model',
  REPOSITORY_INTERFACE = 'repository_interface',
  
  // 基础设施层组件
  DATA_REPOSITORY = 'data_repository',
  EXTERNAL_SERVICE = 'external_service',
  INFRASTRUCTURE_SERVICE = 'infrastructure_service'
}

// ============================================================================
// 依赖规则和验证
// ============================================================================

/**
 * 依赖规则定义
 * 确保依赖关系只能向下，不能向上或跨层
 */
export class DependencyRules {
  private static readonly ALLOWED_DEPENDENCIES = new Map<ArchitectureLayer, ArchitectureLayer[]>([
    [ArchitectureLayer.PRESENTATION, [ArchitectureLayer.APPLICATION]],
    [ArchitectureLayer.APPLICATION, [ArchitectureLayer.DOMAIN, ArchitectureLayer.INFRASTRUCTURE]],
    [ArchitectureLayer.DOMAIN, []],
    [ArchitectureLayer.INFRASTRUCTURE, [ArchitectureLayer.DOMAIN]]
  ]);

  /**
   * 验证依赖关系是否合法
   */
  static validateDependency(from: ArchitectureLayer, to: ArchitectureLayer): boolean {
    const allowedDeps = this.ALLOWED_DEPENDENCIES.get(from) || [];
    return allowedDeps.includes(to);
  }

  /**
   * 获取层次的依赖规则描述
   */
  static getDependencyDescription(layer: ArchitectureLayer): string {
    const allowedDeps = this.ALLOWED_DEPENDENCIES.get(layer) || [];
    if (allowedDeps.length === 0) {
      return `${layer} 层不依赖任何其他层`;
    }
    return `${layer} 层只能依赖: ${allowedDeps.join(', ')}`;
  }
}

// ============================================================================
// 组件注册和管理
// ============================================================================

/**
 * 组件元数据
 */
export interface ComponentMetadata {
  id: string;
  name: string;
  layer: ArchitectureLayer;
  type: ComponentType;
  dependencies: string[];
  description?: string;
  version?: string;
}

/**
 * 架构注册表
 * 管理所有组件的注册和依赖关系
 */
export class ArchitectureRegistry {
  private static instance: ArchitectureRegistry;
  private components = new Map<string, ComponentMetadata>();
  private dependencyGraph = new Map<string, Set<string>>();

  static getInstance(): ArchitectureRegistry {
    if (!ArchitectureRegistry.instance) {
      ArchitectureRegistry.instance = new ArchitectureRegistry();
    }
    return ArchitectureRegistry.instance;
  }

  /**
   * 注册组件
   */
  registerComponent(metadata: ComponentMetadata): void {
    // 验证依赖关系
    this.validateComponentDependencies(metadata);
    
    this.components.set(metadata.id, metadata);
    this.dependencyGraph.set(metadata.id, new Set(metadata.dependencies));
    
    console.log(`✅ 组件已注册: ${metadata.name} (${metadata.layer}/${metadata.type})`);
  }

  /**
   * 获取组件信息
   */
  getComponent(id: string): ComponentMetadata | undefined {
    return this.components.get(id);
  }

  /**
   * 获取层次中的所有组件
   */
  getComponentsByLayer(layer: ArchitectureLayer): ComponentMetadata[] {
    return Array.from(this.components.values())
      .filter(component => component.layer === layer);
  }

  /**
   * 验证组件依赖关系
   */
  private validateComponentDependencies(metadata: ComponentMetadata): void {
    for (const depId of metadata.dependencies) {
      const dependency = this.components.get(depId);
      if (!dependency) {
        console.warn(`⚠️ 依赖组件未找到: ${depId}`);
        continue;
      }

      // 验证层次依赖规则
      if (!DependencyRules.validateDependency(metadata.layer, dependency.layer)) {
        throw new Error(
          `❌ 非法依赖关系: ${metadata.name}(${metadata.layer}) -> ${dependency.name}(${dependency.layer})\n` +
          `规则: ${DependencyRules.getDependencyDescription(metadata.layer)}`
        );
      }
    }
  }

  /**
   * 检测循环依赖
   */
  detectCircularDependencies(): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[] = [];

    const dfs = (componentId: string, path: string[]): void => {
      if (recursionStack.has(componentId)) {
        const cycleStart = path.indexOf(componentId);
        const cycle = path.slice(cycleStart).concat(componentId);
        cycles.push(cycle.join(' -> '));
        return;
      }

      if (visited.has(componentId)) {
        return;
      }

      visited.add(componentId);
      recursionStack.add(componentId);

      const dependencies = this.dependencyGraph.get(componentId) || new Set();
      for (const depId of dependencies) {
        dfs(depId, [...path, componentId]);
      }

      recursionStack.delete(componentId);
    };

    for (const componentId of this.components.keys()) {
      if (!visited.has(componentId)) {
        dfs(componentId, []);
      }
    }

    return cycles;
  }

  /**
   * 生成架构报告
   */
  generateArchitectureReport(): ArchitectureReport {
    const componentsByLayer = new Map<ArchitectureLayer, ComponentMetadata[]>();
    
    // 按层次分组组件
    for (const layer of Object.values(ArchitectureLayer)) {
      componentsByLayer.set(layer, this.getComponentsByLayer(layer));
    }

    // 检测问题
    const circularDependencies = this.detectCircularDependencies();
    const orphanedComponents = this.findOrphanedComponents();

    return {
      totalComponents: this.components.size,
      componentsByLayer,
      circularDependencies,
      orphanedComponents,
      dependencyViolations: this.findDependencyViolations(),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 查找孤立组件（没有被任何组件依赖）
   */
  private findOrphanedComponents(): string[] {
    const referenced = new Set<string>();
    
    for (const dependencies of this.dependencyGraph.values()) {
      for (const depId of dependencies) {
        referenced.add(depId);
      }
    }

    return Array.from(this.components.keys())
      .filter(id => !referenced.has(id));
  }

  /**
   * 查找依赖违规
   */
  private findDependencyViolations(): DependencyViolation[] {
    const violations: DependencyViolation[] = [];

    for (const [componentId, metadata] of this.components) {
      for (const depId of metadata.dependencies) {
        const dependency = this.components.get(depId);
        if (!dependency) continue;

        if (!DependencyRules.validateDependency(metadata.layer, dependency.layer)) {
          violations.push({
            from: componentId,
            to: depId,
            fromLayer: metadata.layer,
            toLayer: dependency.layer,
            description: `${metadata.name} 不应该依赖 ${dependency.name}`
          });
        }
      }
    }

    return violations;
  }
}

// ============================================================================
// 类型定义
// ============================================================================

export interface ArchitectureReport {
  totalComponents: number;
  componentsByLayer: Map<ArchitectureLayer, ComponentMetadata[]>;
  circularDependencies: string[];
  orphanedComponents: string[];
  dependencyViolations: DependencyViolation[];
  generatedAt: string;
}

export interface DependencyViolation {
  from: string;
  to: string;
  fromLayer: ArchitectureLayer;
  toLayer: ArchitectureLayer;
  description: string;
}

// ============================================================================
// 装饰器和工具
// ============================================================================

/**
 * 组件注册装饰器
 */
export function RegisterComponent(metadata: Omit<ComponentMetadata, 'id'>) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    const componentId = `${metadata.layer}.${metadata.type}.${metadata.name}`;
    
    ArchitectureRegistry.getInstance().registerComponent({
      id: componentId,
      ...metadata
    });

    return constructor;
  };
}

/**
 * 依赖验证装饰器
 */
export function ValidateDependencies(dependencies: string[]) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(...args: any[]) {
      // 在方法执行前验证依赖
      const registry = ArchitectureRegistry.getInstance();
      for (const depId of dependencies) {
        if (!registry.getComponent(depId)) {
          throw new Error(`❌ 依赖组件未注册: ${depId}`);
        }
      }
      
      return originalMethod.apply(this, args);
    };
  };
}

// ============================================================================
// 架构健康检查
// ============================================================================

/**
 * 架构健康检查器
 */
export class ArchitectureHealthChecker {
  private registry = ArchitectureRegistry.getInstance();

  /**
   * 执行完整的架构健康检查
   */
  async performHealthCheck(): Promise<ArchitectureHealthReport> {
    const startTime = Date.now();
    
    const report = this.registry.generateArchitectureReport();
    const issues: ArchitectureIssue[] = [];

    // 检查循环依赖
    if (report.circularDependencies.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'circular_dependency',
        description: `发现 ${report.circularDependencies.length} 个循环依赖`,
        details: report.circularDependencies
      });
    }

    // 检查依赖违规
    if (report.dependencyViolations.length > 0) {
      issues.push({
        severity: 'error',
        type: 'dependency_violation',
        description: `发现 ${report.dependencyViolations.length} 个依赖违规`,
        details: report.dependencyViolations.map(v => v.description)
      });
    }

    // 检查孤立组件
    if (report.orphanedComponents.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'orphaned_component',
        description: `发现 ${report.orphanedComponents.length} 个孤立组件`,
        details: report.orphanedComponents
      });
    }

    const endTime = Date.now();
    
    return {
      status: issues.some(i => i.severity === 'critical') ? 'critical' :
              issues.some(i => i.severity === 'error') ? 'error' :
              issues.some(i => i.severity === 'warning') ? 'warning' : 'healthy',
      issues,
      report,
      checkDuration: endTime - startTime,
      checkedAt: new Date().toISOString()
    };
  }
}

export interface ArchitectureHealthReport {
  status: 'healthy' | 'warning' | 'error' | 'critical';
  issues: ArchitectureIssue[];
  report: ArchitectureReport;
  checkDuration: number;
  checkedAt: string;
}

export interface ArchitectureIssue {
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: string;
  description: string;
  details?: any[];
}
