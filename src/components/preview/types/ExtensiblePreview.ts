import type { Card } from '../../../data/types';
import type { PreviewData, PreviewOptions, PreviewSection } from '../ContentPreviewEngine';
import type AnkiPlugin from '../../../main';

/**
 * 可扩展预览接口
 * 为未来新题型提供标准化的扩展机制
 */

/**
 * 自定义题型定义接口
 */
export interface CustomCardType {
  /** 题型唯一标识符 */
  id: string;
  /** 题型显示名称 */
  name: string;
  /** 题型描述 */
  description: string;
  /** 题型版本 */
  version: string;
  /** 题型作者 */
  author?: string;
  /** 题型图标 */
  icon?: string;
  /** 题型标签 */
  tags?: string[];
}

/**
 * 题型检测器接口
 */
export interface CardTypeDetector {
  /** 检测器唯一标识符 */
  id: string;
  /** 检测器名称 */
  name: string;
  /** 支持的题型 */
  supportedTypes: string[];
  /** 检测优先级（数字越大优先级越高） */
  priority: number;
  
  /**
   * 检测卡片是否匹配此题型
   * @param card 卡片数据
   * @returns 检测结果，包含匹配度和置信度
   */
  detect(card: Card): CardTypeDetectionResult;
}

/**
 * 题型检测结果接口
 */
export interface CardTypeDetectionResult {
  /** 是否匹配 */
  matches: boolean;
  /** 匹配的题型ID */
  cardTypeId?: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 检测到的特征 */
  features?: string[];
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 预览生成器接口
 */
export interface PreviewGenerator {
  /** 生成器唯一标识符 */
  id: string;
  /** 生成器名称 */
  name: string;
  /** 支持的题型 */
  supportedTypes: string[];
  
  /**
   * 生成预览数据
   * @param card 卡片数据
   * @param options 预览选项
   * @returns 预览数据
   */
  generatePreview(card: Card, options: PreviewOptions): Promise<PreviewData>;
  
  /**
   * 生成预览节
   * @param card 卡片数据
   * @param cardType 题型
   * @param options 预览选项
   * @returns 预览节数组
   */
  generateSections(card: Card, cardType: string, options: PreviewOptions): Promise<PreviewSection[]>;
}

/**
 * 渲染器接口
 */
export interface CustomRenderer {
  /** 渲染器唯一标识符 */
  id: string;
  /** 渲染器名称 */
  name: string;
  /** 支持的题型 */
  supportedTypes: string[];
  
  /**
   * 渲染预览内容
   * @param previewData 预览数据
   * @param options 预览选项
   * @returns 渲染结果
   */
  render(previewData: PreviewData, options: PreviewOptions): Promise<HTMLElement>;
  
  /**
   * 渲染单个节
   * @param section 预览节
   * @param options 预览选项
   * @returns 渲染的HTML元素
   */
  renderSection(section: PreviewSection, options: PreviewOptions): Promise<HTMLElement>;
}

/**
 * 扩展配置接口
 */
export interface ExtensionConfig {
  /** 扩展唯一标识符 */
  id: string;
  /** 扩展名称 */
  name: string;
  /** 扩展版本 */
  version: string;
  /** 扩展描述 */
  description?: string;
  /** 扩展作者 */
  author?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 扩展设置 */
  settings?: Record<string, unknown>;
}

/**
 * 扩展注册接口
 */
export interface ExtensionRegistry {
  /**
   * 注册自定义题型
   * @param cardType 题型定义
   */
  registerCardType(cardType: CustomCardType): void;
  
  /**
   * 注册题型检测器
   * @param detector 检测器
   */
  registerDetector(detector: CardTypeDetector): void;
  
  /**
   * 注册预览生成器
   * @param generator 生成器
   */
  registerGenerator(generator: PreviewGenerator): void;
  
  /**
   * 注册自定义渲染器
   * @param renderer 渲染器
   */
  registerRenderer(renderer: CustomRenderer): void;
  
  /**
   * 获取已注册的题型
   */
  getCardTypes(): CustomCardType[];
  
  /**
   * 获取已注册的检测器
   */
  getDetectors(): CardTypeDetector[];
  
  /**
   * 获取已注册的生成器
   */
  getGenerators(): PreviewGenerator[];
  
  /**
   * 获取已注册的渲染器
   */
  getRenderers(): CustomRenderer[];
  
  /**
   * 卸载扩展
   * @param extensionId 扩展ID
   */
  unregisterExtension(extensionId: string): void;
}

/**
 * 可扩展预览管理器
 * 管理自定义题型的注册、检测和渲染
 */
export class ExtensiblePreviewManager implements ExtensionRegistry {
  private plugin: AnkiPlugin;
  private cardTypes: Map<string, CustomCardType> = new Map();
  private detectors: Map<string, CardTypeDetector> = new Map();
  private generators: Map<string, PreviewGenerator> = new Map();
  private renderers: Map<string, CustomRenderer> = new Map();
  private extensionConfigs: Map<string, ExtensionConfig> = new Map();

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    console.log('[ExtensiblePreviewManager] 可扩展预览管理器已初始化');
  }

  /**
   * 注册自定义题型
   */
  registerCardType(cardType: CustomCardType): void {
    this.cardTypes.set(cardType.id, cardType);
    console.log(`[ExtensiblePreviewManager] 注册题型: ${cardType.name} (${cardType.id})`);
  }

  /**
   * 注册题型检测器
   */
  registerDetector(detector: CardTypeDetector): void {
    this.detectors.set(detector.id, detector);
    console.log(`[ExtensiblePreviewManager] 注册检测器: ${detector.name} (${detector.id})`);
  }

  /**
   * 注册预览生成器
   */
  registerGenerator(generator: PreviewGenerator): void {
    this.generators.set(generator.id, generator);
    console.log(`[ExtensiblePreviewManager] 注册生成器: ${generator.name} (${generator.id})`);
  }

  /**
   * 注册自定义渲染器
   */
  registerRenderer(renderer: CustomRenderer): void {
    this.renderers.set(renderer.id, renderer);
    console.log(`[ExtensiblePreviewManager] 注册渲染器: ${renderer.name} (${renderer.id})`);
  }

  /**
   * 检测卡片题型（包含扩展题型）
   */
  async detectCardType(card: Card): Promise<CardTypeDetectionResult | null> {
    const detectors = Array.from(this.detectors.values())
      .sort((a, b) => b.priority - a.priority); // 按优先级排序

    for (const detector of detectors) {
      try {
        const result = detector.detect(card);
        if (result.matches && result.confidence > 0.7) {
          console.log(`[ExtensiblePreviewManager] 检测到题型: ${result.cardTypeId} (置信度: ${result.confidence})`);
          return result;
        }
      } catch (error) {
        console.error(`[ExtensiblePreviewManager] 检测器 ${detector.id} 执行失败:`, error);
      }
    }

    return null;
  }

  /**
   * 生成扩展预览
   */
  async generateExtensiblePreview(card: Card, cardTypeId: string, options: PreviewOptions): Promise<PreviewData | null> {
    const generator = Array.from(this.generators.values())
      .find(g => g.supportedTypes.includes(cardTypeId));

    if (!generator) {
      console.warn(`[ExtensiblePreviewManager] 未找到支持题型 ${cardTypeId} 的生成器`);
      return null;
    }

    try {
      const previewData = await generator.generatePreview(card, options);
      console.log(`[ExtensiblePreviewManager] 生成扩展预览: ${cardTypeId}`);
      return previewData;
    } catch (error) {
      console.error(`[ExtensiblePreviewManager] 生成器 ${generator.id} 执行失败:`, error);
      return null;
    }
  }

  /**
   * 渲染扩展预览
   */
  async renderExtensiblePreview(previewData: PreviewData, options: PreviewOptions): Promise<HTMLElement | null> {
    const cardTypeId = previewData.cardType;
    const renderer = Array.from(this.renderers.values())
      .find(r => r.supportedTypes.includes(cardTypeId));

    if (!renderer) {
      console.warn(`[ExtensiblePreviewManager] 未找到支持题型 ${cardTypeId} 的渲染器`);
      return null;
    }

    try {
      const element = await renderer.render(previewData, options);
      console.log(`[ExtensiblePreviewManager] 渲染扩展预览: ${cardTypeId}`);
      return element;
    } catch (error) {
      console.error(`[ExtensiblePreviewManager] 渲染器 ${renderer.id} 执行失败:`, error);
      return null;
    }
  }

  /**
   * 获取已注册的题型
   */
  getCardTypes(): CustomCardType[] {
    return Array.from(this.cardTypes.values());
  }

  /**
   * 获取已注册的检测器
   */
  getDetectors(): CardTypeDetector[] {
    return Array.from(this.detectors.values());
  }

  /**
   * 获取已注册的生成器
   */
  getGenerators(): PreviewGenerator[] {
    return Array.from(this.generators.values());
  }

  /**
   * 获取已注册的渲染器
   */
  getRenderers(): CustomRenderer[] {
    return Array.from(this.renderers.values());
  }

  /**
   * 卸载扩展
   */
  unregisterExtension(extensionId: string): void {
    // 移除相关的题型、检测器、生成器和渲染器
    this.cardTypes.delete(extensionId);
    this.detectors.delete(extensionId);
    this.generators.delete(extensionId);
    this.renderers.delete(extensionId);
    this.extensionConfigs.delete(extensionId);
    
    console.log(`[ExtensiblePreviewManager] 卸载扩展: ${extensionId}`);
  }

  /**
   * 加载扩展配置
   */
  loadExtensionConfig(config: ExtensionConfig): void {
    this.extensionConfigs.set(config.id, config);
    console.log(`[ExtensiblePreviewManager] 加载扩展配置: ${config.name} (${config.id})`);
  }

  /**
   * 获取扩展配置
   */
  getExtensionConfig(extensionId: string): ExtensionConfig | undefined {
    return this.extensionConfigs.get(extensionId);
  }

  /**
   * 获取所有扩展配置
   */
  getAllExtensionConfigs(): ExtensionConfig[] {
    return Array.from(this.extensionConfigs.values());
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.cardTypes.clear();
    this.detectors.clear();
    this.generators.clear();
    this.renderers.clear();
    this.extensionConfigs.clear();
    
    console.log('[ExtensiblePreviewManager] 资源已清理');
  }
}

/**
 * 示例：自定义题型扩展
 */
export class ExampleCustomExtension {
  private manager: ExtensiblePreviewManager;

  constructor(manager: ExtensiblePreviewManager) {
    this.manager = manager;
    this.registerExtension();
  }

  private registerExtension(): void {
    // 注册自定义题型
    this.manager.registerCardType({
      id: 'example-custom-type',
      name: '示例自定义题型',
      description: '这是一个示例自定义题型',
      version: '1.0.0',
      author: 'Tuanki Team',
      icon: '🎯',
      tags: ['example', 'custom']
    });

    // 注册检测器
    this.manager.registerDetector({
      id: 'example-detector',
      name: '示例检测器',
      supportedTypes: ['example-custom-type'],
      priority: 100,
      detect: (card: Card): CardTypeDetectionResult => {
        // 示例检测逻辑
        const hasCustomMarker = Object.values(card.fields).some(field => 
          field.includes('[CUSTOM]')
        );
        
        return {
          matches: hasCustomMarker,
          cardTypeId: hasCustomMarker ? 'example-custom-type' : undefined,
          confidence: hasCustomMarker ? 0.9 : 0.0,
          features: hasCustomMarker ? ['custom-marker'] : [],
          metadata: { detectedBy: 'example-detector' }
        };
      }
    });

    // 注册生成器和渲染器可以类似实现...
    console.log('[ExampleCustomExtension] 示例扩展已注册');
  }
}
