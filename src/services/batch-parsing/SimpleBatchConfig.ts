/**
 * 简化批量解析配置管理
 * 提供默认配置和配置验证
 * 🔄 重构后：使用统一的文件夹牌组映射
 */

import {
  FileSelectorConfig,
  DeckMappingConfig,
  UUIDConfig,
  SimpleBatchParsingConfig,
  FolderDeckMapping
} from './index';
import { SimplifiedParsingSettings } from '../../types/newCardParsingTypes';

/**
 * 默认文件选择器配置
 * ⚠️ 已废弃：保留用于向后兼容
 * @deprecated 使用 folderDeckMappings 替代
 */
export const DEFAULT_FILE_SELECTOR_CONFIG: FileSelectorConfig = {
  includeFolders: [],
  excludeFolders: [],
  recursive: true,  // 默认递归扫描子文件夹
  onlyMarkedFiles: true,
  rangeStartMarker: '---start---',
  rangeEndMarker: '---end---'
};

/**
 * 默认牌组映射配置
 * ⚠️ 已废弃：保留用于向后兼容
 * @deprecated 使用 folderDeckMappings 替代
 */
export const DEFAULT_DECK_MAPPING_CONFIG: DeckMappingConfig = {
  enabled: false,
  rules: [],
  defaultDeckId: undefined,
  deckNamePrefix: '',
  deckNameSuffix: '',
  hierarchySeparator: '::'
};

/**
 * 默认UUID配置
 * 注意：批量解析时自动启用UUID，避免重复导入
 */
export const DEFAULT_UUID_CONFIG: UUIDConfig = {
  enabled: true,  // 批量解析自动启用
  insertPosition: 'before-card',
  format: 'comment',
  prefix: 'tuanki-uuid-',
  duplicateStrategy: 'skip',
  autoFixMissing: true  // 自动修复缺失的UUID
};

/**
 * 🆕 创建默认批量解析配置（重构后）
 */
export function createDefaultBatchConfig(
  parsingSettings: SimplifiedParsingSettings
): SimpleBatchParsingConfig {
  return {
    // ✅ 新结构：空的映射列表
    folderDeckMappings: [],
    
    uuid: DEFAULT_UUID_CONFIG,
    parsingSettings,
    maxFilesPerBatch: 100,  // 默认值提高到100
    showProgressNotice: true,
    autoSaveAfterParsing: true,  // Obsidian 本身支持自动保存，默认启用
    deckNamePrefix: '',
    hierarchySeparator: '::',
    
    // ⚠️ 向后兼容字段（可选）
    fileSelector: undefined,
    deckMapping: undefined
  };
}

/**
 * 配置验证器
 */
export class BatchConfigValidator {
  /**
   * 验证文件选择器配置
   */
  static validateFileSelectorConfig(config: FileSelectorConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.rangeStartMarker) {
      errors.push('rangeStartMarker 不能为空');
    }

    if (!config.rangeEndMarker) {
      errors.push('rangeEndMarker 不能为空');
    }

    if (config.rangeStartMarker === config.rangeEndMarker) {
      errors.push('rangeStartMarker 和 rangeEndMarker 不能相同');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证牌组映射配置
   */
  static validateDeckMappingConfig(config: DeckMappingConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (config.enabled && config.rules.length === 0 && !config.defaultDeckId) {
      errors.push('启用牌组映射时，必须配置映射规则或默认牌组');
    }

    // 验证每个规则
    for (const rule of config.rules) {
      if (!rule.folderPath) {
        errors.push('映射规则的 folderPath 不能为空');
      }

      if (rule.namingStrategy === 'custom' && !rule.customName) {
        errors.push(`文件夹 ${rule.folderPath} 的自定义命名策略需要提供 customName`);
      }

      if (!rule.autoCreate && !rule.targetDeckId) {
        errors.push(`文件夹 ${rule.folderPath} 未启用自动创建且未指定目标牌组`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证UUID配置
   */
  static validateUUIDConfig(config: UUIDConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (config.enabled && !config.prefix) {
      errors.push('启用UUID时，prefix 不能为空');
    }

    const validFormats = ['comment', 'frontmatter', 'inline-code'];
    if (!validFormats.includes(config.format)) {
      errors.push(`UUID format 必须是以下之一: ${validFormats.join(', ')}`);
    }

    const validPositions = ['before-card', 'after-card', 'in-metadata'];
    if (!validPositions.includes(config.insertPosition)) {
      errors.push(`UUID insertPosition 必须是以下之一: ${validPositions.join(', ')}`);
    }

    const validStrategies = ['skip', 'update', 'create-new'];
    if (!validStrategies.includes(config.duplicateStrategy)) {
      errors.push(`UUID duplicateStrategy 必须是以下之一: ${validStrategies.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 🆕 验证文件夹牌组映射
   */
  static validateFolderDeckMappings(mappings: FolderDeckMapping[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const mapping of mappings) {
      if (!mapping.folderPath) {
        errors.push('映射的 folderPath 不能为空');
      }

      if (!mapping.targetDeckId) {
        errors.push(`文件夹 ${mapping.folderPath} 未指定目标牌组`);
      }

      if (!mapping.id) {
        errors.push(`文件夹 ${mapping.folderPath} 缺少唯一ID`);
      }
    }

    // 检查是否有启用的映射
    const enabledCount = mappings.filter(m => m.enabled).length;
    if (mappings.length > 0 && enabledCount === 0) {
      warnings.push('所有映射都已禁用，批量解析将不会处理任何文件');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证完整批量解析配置（🔄 重构后）
   */
  static validateBatchConfig(config: SimpleBatchParsingConfig): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证新的映射结构
    const mappingsResult = this.validateFolderDeckMappings(config.folderDeckMappings || []);
    errors.push(...mappingsResult.errors);
    warnings.push(...mappingsResult.warnings);

    // 验证UUID配置
    const uuidResult = this.validateUUIDConfig(config.uuid);
    errors.push(...uuidResult.errors);

    // 验证批处理限制
    if (config.maxFilesPerBatch < 1) {
      errors.push('maxFilesPerBatch 必须大于 0');
    }

    if (config.maxFilesPerBatch > 500) {
      warnings.push('maxFilesPerBatch 过大可能导致性能问题，建议不超过 500');
    }

    // 验证解析设置
    if (!config.parsingSettings) {
      errors.push('parsingSettings 不能为空');
    }

    // ⚠️ 向后兼容：检查旧配置
    if (config.fileSelector && config.fileSelector.includeFolders.length > 0) {
      warnings.push('检测到旧版 fileSelector 配置，建议迁移到 folderDeckMappings');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * 配置合并工具（🔄 重构后）
 */
export class BatchConfigMerger {
  /**
   * 合并配置（深度合并）
   */
  static merge(
    base: SimpleBatchParsingConfig,
    override: Partial<SimpleBatchParsingConfig>
  ): SimpleBatchParsingConfig {
    return {
      folderDeckMappings: override.folderDeckMappings ?? base.folderDeckMappings,
      uuid: {
        ...base.uuid,
        ...(override.uuid || {})
      },
      parsingSettings: override.parsingSettings || base.parsingSettings,
      maxFilesPerBatch: override.maxFilesPerBatch ?? base.maxFilesPerBatch,
      showProgressNotice: override.showProgressNotice ?? base.showProgressNotice,
      autoSaveAfterParsing: override.autoSaveAfterParsing ?? base.autoSaveAfterParsing,
      deckNamePrefix: override.deckNamePrefix ?? base.deckNamePrefix,
      hierarchySeparator: override.hierarchySeparator ?? base.hierarchySeparator,
      // 向后兼容字段
      fileSelector: override.fileSelector ?? base.fileSelector,
      deckMapping: override.deckMapping ?? base.deckMapping
    };
  }

  /**
   * 从插件设置迁移到新配置格式
   */
  static migrateFromLegacySettings(
    legacySettings: any,
    parsingSettings: SimplifiedParsingSettings
  ): SimpleBatchParsingConfig {
    const config = createDefaultBatchConfig(parsingSettings);

    // 迁移文件夹设置
    if (legacySettings?.batchParsing) {
      config.fileSelector.includeFolders = 
        legacySettings.batchParsing.includeFolders || [];
      config.fileSelector.excludeFolders = 
        legacySettings.batchParsing.excludeFolders || [];
      config.maxFilesPerBatch = 
        legacySettings.batchParsing.maxFilesPerBatch || 50;
    }

    return config;
  }
}

/**
 * 配置序列化工具
 */
export class BatchConfigSerializer {
  /**
   * 序列化配置为JSON
   */
  static serialize(config: SimpleBatchParsingConfig): string {
    return JSON.stringify(config, null, 2);
  }

  /**
   * 从JSON反序列化配置
   */
  static deserialize(json: string): SimpleBatchParsingConfig | null {
    try {
      const parsed = JSON.parse(json);
      
      // 验证配置
      const validation = BatchConfigValidator.validateBatchConfig(parsed);
      
      if (!validation.valid) {
        console.error('[BatchConfigSerializer] 配置验证失败:', validation.errors);
        return null;
      }

      return parsed;
    } catch (error) {
      console.error('[BatchConfigSerializer] 反序列化失败:', error);
      return null;
    }
  }

  /**
   * 导出配置为文件内容
   */
  static exportToFile(config: SimpleBatchParsingConfig): string {
    return `# Tuanki 批量解析配置
# 导出时间: ${new Date().toISOString()}

${this.serialize(config)}
`;
  }

  /**
   * 从文件内容导入配置
   */
  static importFromFile(content: string): SimpleBatchParsingConfig | null {
    // 移除注释行
    const lines = content.split('\n').filter(line => !line.trim().startsWith('#'));
    const jsonContent = lines.join('\n');
    
    return this.deserialize(jsonContent);
  }
}



