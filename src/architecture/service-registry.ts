/**
 * 服务注册表
 * 注册所有核心服务到IoC容器，建立完整的依赖管理
 */

import {
  registerService,
  ServiceLifetime,
  SERVICE_TOKENS,
  type ServiceDescriptor
} from './dependency-injection';
import { ArchitectureLayer, ComponentType } from './layered-architecture';
import { UnifiedStateManager } from './unified-state-management';
import { UnifiedErrorHandler } from './unified-error-handler';
import { PerformanceMonitor } from './performance-monitor';
import { DataManagementService } from '../services/data-management-service';
import { BackupManagementService } from '../services/backup-management-service';

// ============================================================================
// 服务注册配置
// ============================================================================

/**
 * 注册所有核心服务
 */
export function registerCoreServices(): void {
  console.log('🔧 开始注册核心服务...');

  // 注册架构核心服务
  registerArchitectureServices();
  
  // 注册数据层服务
  registerDataServices();
  
  // 注册算法层服务
  registerAlgorithmServices();
  
  // 注册应用层服务
  registerApplicationServices();
  
  // 注册基础设施服务
  registerInfrastructureServices();
  
  // 注册UI服务
  registerUIServices();

  console.log('✅ 核心服务注册完成');
}

/**
 * 注册架构核心服务
 */
function registerArchitectureServices(): void {
  // 状态管理器
  registerService({
    token: SERVICE_TOKENS.STATE_MANAGER,
    factory: () => UnifiedStateManager.getInstance(),
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.INFRASTRUCTURE,
    type: ComponentType.INFRASTRUCTURE_SERVICE
  });

  // 错误处理器
  registerService({
    token: SERVICE_TOKENS.ERROR_HANDLER,
    factory: () => UnifiedErrorHandler.getInstance(),
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.INFRASTRUCTURE,
    type: ComponentType.INFRASTRUCTURE_SERVICE
  });

  // 性能监控器
  registerService({
    token: SERVICE_TOKENS.PERFORMANCE_MONITOR,
    factory: () => PerformanceMonitor.getInstance(),
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.INFRASTRUCTURE,
    type: ComponentType.INFRASTRUCTURE_SERVICE
  });
}

/**
 * 注册数据层服务
 */
function registerDataServices(): void {
  // 数据存储服务 - 延迟注册，需要在插件初始化后设置
  registerService({
    token: SERVICE_TOKENS.DATA_STORAGE,
    factory: () => {
      // 这里需要从全局获取已初始化的数据存储实例
      const plugin = (window as any).tuankiPlugin;
      if (!plugin?.dataStorage) {
        throw new Error('DataStorage not initialized. Please ensure plugin is loaded first.');
      }
      return plugin.dataStorage;
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.INFRASTRUCTURE,
    type: ComponentType.DATA_REPOSITORY
  });

  // 分析服务
  registerService({
    token: SERVICE_TOKENS.ANALYTICS_SERVICE,
    factory: () => {
      const plugin = (window as any).tuankiPlugin;
      if (!plugin?.analyticsService) {
        throw new Error('AnalyticsService not initialized. Please ensure plugin is loaded first.');
      }
      return plugin.analyticsService;
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.INFRASTRUCTURE,
    type: ComponentType.INFRASTRUCTURE_SERVICE
  });
}

/**
 * 注册算法层服务
 */
function registerAlgorithmServices(): void {
  // FSRS服务
  registerService({
    token: SERVICE_TOKENS.FSRS_SERVICE,
    factory: () => {
      const plugin = (window as any).tuankiPlugin;
      if (!plugin?.fsrs) {
        throw new Error('FSRS not initialized. Please ensure plugin is loaded first.');
      }
      return plugin.fsrs;
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.DOMAIN,
    type: ComponentType.DOMAIN_SERVICE
  });

  // 增强FSRS服务
  registerService({
    token: SERVICE_TOKENS.ENHANCED_FSRS,
    factory: () => {
      const plugin = (window as any).tuankiPlugin;
      if (!plugin?.enhancedFSRS) {
        throw new Error('EnhancedFSRS not initialized. Please ensure plugin is loaded first.');
      }
      return plugin.enhancedFSRS;
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.DOMAIN,
    type: ComponentType.DOMAIN_SERVICE
  });
}

/**
 * 注册应用层服务
 */
function registerApplicationServices(): void {
  // 卡片服务
  registerService({
    token: SERVICE_TOKENS.CARD_SERVICE,
    factory: (container) => {
      const dataStorage = container.resolve(SERVICE_TOKENS.DATA_STORAGE);
      const fsrs = container.resolve(SERVICE_TOKENS.FSRS_SERVICE);
      
      // 创建卡片服务实例
      return new CardService(dataStorage, fsrs);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.APPLICATION,
    type: ComponentType.APPLICATION_SERVICE,
    dependencies: [SERVICE_TOKENS.DATA_STORAGE, SERVICE_TOKENS.FSRS_SERVICE]
  });

  // 牌组服务
  registerService({
    token: SERVICE_TOKENS.DECK_SERVICE,
    factory: (container) => {
      const dataStorage = container.resolve(SERVICE_TOKENS.DATA_STORAGE);
      
      return new DeckService(dataStorage);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.APPLICATION,
    type: ComponentType.APPLICATION_SERVICE,
    dependencies: [SERVICE_TOKENS.DATA_STORAGE]
  });

  // 模板服务
  registerService({
    token: SERVICE_TOKENS.TEMPLATE_SERVICE,
    factory: (container) => {
      const dataStorage = container.resolve(SERVICE_TOKENS.DATA_STORAGE);
      
      return new TemplateService(dataStorage);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.APPLICATION,
    type: ComponentType.APPLICATION_SERVICE,
    dependencies: [SERVICE_TOKENS.DATA_STORAGE]
  });

  // 同步服务
  registerService({
    token: SERVICE_TOKENS.SYNC_SERVICE,
    factory: (container) => {
      const dataStorage = container.resolve(SERVICE_TOKENS.DATA_STORAGE);
      const errorHandler = container.resolve(SERVICE_TOKENS.ERROR_HANDLER);

      return new SyncService(dataStorage, errorHandler);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.APPLICATION,
    type: ComponentType.APPLICATION_SERVICE,
    dependencies: [SERVICE_TOKENS.DATA_STORAGE, SERVICE_TOKENS.ERROR_HANDLER]
  });

  // 数据管理服务
  registerService({
    token: SERVICE_TOKENS.DATA_MANAGEMENT_SERVICE,
    factory: (container) => {
      const dataStorage = container.resolve(SERVICE_TOKENS.DATA_STORAGE);

      // 尝试从多个来源获取plugin实例
      let plugin = (window as any).tuankiPlugin;

      if (!plugin) {
        // 尝试从全局app获取
        const app = (window as any).app;
        if (app?.plugins?.plugins?.tuanki) {
          plugin = app.plugins.plugins.tuanki;
        }
      }

      if (!plugin) {
        console.warn('Plugin instance not found, creating mock service');
        // 创建一个模拟的plugin对象用于开发/测试
        plugin = {
          settings: {
            dataFolder: 'tuanki',
            dataBackupIntervalHours: 24,
            backupRetentionCount: 3,
            autoBackup: true
          },
          app: {
            vault: {
              adapter: {
                exists: async () => false,
                list: async () => ({ files: [], folders: [] }),
                stat: async () => ({ size: 0 }),
                read: async () => '{}',
                write: async () => {}
              }
            }
          }
        };
      }

      return new DataManagementService(dataStorage, plugin);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.APPLICATION,
    type: ComponentType.APPLICATION_SERVICE,
    dependencies: [SERVICE_TOKENS.DATA_STORAGE]
  });

  // 备份管理服务
  registerService({
    token: SERVICE_TOKENS.BACKUP_MANAGEMENT_SERVICE,
    factory: (container) => {
      const dataStorage = container.resolve(SERVICE_TOKENS.DATA_STORAGE);

      // 尝试从多个来源获取plugin实例
      let plugin = (window as any).tuankiPlugin;

      if (!plugin) {
        // 尝试从全局app获取
        const app = (window as any).app;
        if (app?.plugins?.plugins?.tuanki) {
          plugin = app.plugins.plugins.tuanki;
        }
      }

      if (!plugin) {
        console.warn('Plugin instance not found for backup service, creating mock service');
        // 创建一个模拟的plugin对象用于开发/测试
        plugin = {
          settings: {
            dataFolder: 'tuanki',
            dataBackupIntervalHours: 24,
            backupRetentionCount: 3,
            autoBackup: true
          },
          app: {
            vault: {
              adapter: {
                exists: async () => false,
                list: async () => ({ files: [], folders: [] }),
                stat: async () => ({ size: 0 }),
                read: async () => '{}',
                write: async () => {}
              }
            }
          }
        };
      }

      return new BackupManagementService(dataStorage, plugin);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.APPLICATION,
    type: ComponentType.APPLICATION_SERVICE,
    dependencies: [SERVICE_TOKENS.DATA_STORAGE]
  });
}

/**
 * 注册基础设施服务
 */
function registerInfrastructureServices(): void {
  // 许可证管理器
  registerService({
    token: SERVICE_TOKENS.LICENSE_MANAGER,
    factory: async () => {
      // 使用动态导入
      const { LicenseManager } = await import('../utils/licenseManager');
      return new LicenseManager();
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.INFRASTRUCTURE,
    type: ComponentType.INFRASTRUCTURE_SERVICE
  });
}

/**
 * 注册UI服务
 */
function registerUIServices(): void {
  // 通知服务
  registerService({
    token: SERVICE_TOKENS.NOTIFICATION_SERVICE,
    factory: (container) => {
      const stateManager = container.resolve(SERVICE_TOKENS.STATE_MANAGER);
      
      return new NotificationService(stateManager);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.PRESENTATION,
    type: ComponentType.VIEW_COMPONENT,
    dependencies: [SERVICE_TOKENS.STATE_MANAGER]
  });

  // 模态框服务
  registerService({
    token: SERVICE_TOKENS.MODAL_SERVICE,
    factory: (container) => {
      const stateManager = container.resolve(SERVICE_TOKENS.STATE_MANAGER);
      
      return new ModalService(stateManager);
    },
    lifetime: ServiceLifetime.SINGLETON,
    layer: ArchitectureLayer.PRESENTATION,
    type: ComponentType.VIEW_COMPONENT,
    dependencies: [SERVICE_TOKENS.STATE_MANAGER]
  });
}

// ============================================================================
// 服务实现类（简化版本）
// ============================================================================

/**
 * 卡片服务
 */
class CardService {
  constructor(
    private dataStorage: any,
    private fsrs: any
  ) {}

  async createCard(cardData: any): Promise<any> {
    // 实现卡片创建逻辑
    return this.dataStorage.createCard(cardData);
  }

  async updateCard(cardId: string, updates: any): Promise<any> {
    // 实现卡片更新逻辑
    return this.dataStorage.updateCard(cardId, updates);
  }

  async deleteCard(cardId: string): Promise<void> {
    // 实现卡片删除逻辑
    return this.dataStorage.deleteCard(cardId);
  }

  async getCard(cardId: string): Promise<any> {
    // 实现卡片获取逻辑
    return this.dataStorage.getCard(cardId);
  }

  async scheduleCard(cardId: string, rating: number): Promise<any> {
    // 使用FSRS算法调度卡片
    const card = await this.getCard(cardId);
    const scheduledCard = this.fsrs.schedule(card, rating);
    return this.updateCard(cardId, scheduledCard);
  }
}

/**
 * 牌组服务
 */
class DeckService {
  constructor(private dataStorage: any) {}

  async createDeck(deckData: any): Promise<any> {
    return this.dataStorage.createDeck(deckData);
  }

  async updateDeck(deckId: string, updates: any): Promise<any> {
    return this.dataStorage.updateDeck(deckId, updates);
  }

  async deleteDeck(deckId: string): Promise<void> {
    return this.dataStorage.deleteDeck(deckId);
  }

  async getDeck(deckId: string): Promise<any> {
    return this.dataStorage.getDeck(deckId);
  }

  async getDecks(): Promise<any[]> {
    return this.dataStorage.getDecks();
  }
}

/**
 * 模板服务
 */
class TemplateService {
  constructor(private dataStorage: any) {}

  async createTemplate(templateData: any): Promise<any> {
    return this.dataStorage.createTemplate(templateData);
  }

  async updateTemplate(templateId: string, updates: any): Promise<any> {
    return this.dataStorage.updateTemplate(templateId, updates);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    return this.dataStorage.deleteTemplate(templateId);
  }

  async getTemplate(templateId: string): Promise<any> {
    return this.dataStorage.getTemplate(templateId);
  }

  async getTemplates(): Promise<any[]> {
    return this.dataStorage.getTemplates();
  }
}

/**
 * 同步服务
 */
class SyncService {
  constructor(
    private dataStorage: any,
    private errorHandler: any
  ) {}

  async syncToAnki(): Promise<boolean> {
    try {
      // 实现同步到Anki的逻辑
      return true;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'SyncService',
        operation: 'syncToAnki'
      });
      return false;
    }
  }

  async syncFromAnki(): Promise<boolean> {
    try {
      // 实现从Anki同步的逻辑
      return true;
    } catch (error) {
      await this.errorHandler.handleError(error, {
        component: 'SyncService',
        operation: 'syncFromAnki'
      });
      return false;
    }
  }
}

/**
 * 通知服务
 */
class NotificationService {
  constructor(private stateManager: any) {}

  showNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3000): void {
    this.stateManager.dispatch({
      type: 'ui/ADD_NOTIFICATION',
      payload: {
        id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        message,
        duration,
        timestamp: Date.now()
      },
      timestamp: Date.now(),
      source: 'NotificationService'
    });
  }

  showSuccess(message: string, duration = 3000): void {
    this.showNotification(message, 'success', duration);
  }

  showError(message: string, duration = 5000): void {
    this.showNotification(message, 'error', duration);
  }

  showWarning(message: string, duration = 4000): void {
    this.showNotification(message, 'warning', duration);
  }

  showInfo(message: string, duration = 3000): void {
    this.showNotification(message, 'info', duration);
  }
}

/**
 * 模态框服务
 */
class ModalService {
  constructor(private stateManager: any) {}

  openModal(modalId: string, props?: any): void {
    this.stateManager.dispatch({
      type: 'ui/SET_ACTIVE_MODAL',
      payload: { modalId, props },
      timestamp: Date.now(),
      source: 'ModalService'
    });
  }

  closeModal(): void {
    this.stateManager.dispatch({
      type: 'ui/SET_ACTIVE_MODAL',
      payload: null,
      timestamp: Date.now(),
      source: 'ModalService'
    });
  }
}

// ============================================================================
// 服务初始化
// ============================================================================

/**
 * 初始化服务注册表
 */
export function initializeServiceRegistry(): void {
  try {
    registerCoreServices();
    console.log('🎯 服务注册表初始化完成');
  } catch (error) {
    console.error('❌ 服务注册表初始化失败:', error);
    throw error;
  }
}

/**
 * 设置插件引用（用于延迟注册）
 */
export function setPluginReference(plugin: any): void {
  (window as any).tuankiPlugin = plugin;
  console.log('🔗 插件引用已设置');
}
