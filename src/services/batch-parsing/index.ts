/**
 * 批量解析服务模块
 * 导出所有服务、类型和配置
 */

// 服务
export { SimpleFileSelectorService } from './SimpleFileSelectorService';
export { DeckMappingService } from './DeckMappingService';
export { UUIDManager } from './UUIDManager';
export { SimpleBatchParsingService } from './SimpleBatchParsingService';
export { BatchParsingManager } from './BatchParsingManager';

// 类型定义
export type {
  FileSelectorConfig,
  FolderInfo,
  ScanStats
} from './SimpleFileSelectorService';

export type {
  DeckMappingRule,
  DeckMappingConfig,
  DeckInfo,
  MappingResult,
  IDeckStorage
} from './DeckMappingService';

export type {
  UUIDConfig,
  UUIDRecord,
  UUIDInsertResult,
  UUIDDetectionResult,
  IUUIDStorage
} from './UUIDManager';

export type {
  FolderDeckMapping,
  SimpleBatchParsingConfig,
  ParseProgress,
  BatchParseResult,
  ICardSaver
} from './SimpleBatchParsingService';

// 配置管理
export {
  DEFAULT_FILE_SELECTOR_CONFIG,
  DEFAULT_DECK_MAPPING_CONFIG,
  DEFAULT_UUID_CONFIG,
  createDefaultBatchConfig,
  BatchConfigValidator,
  BatchConfigMerger,
  BatchConfigSerializer
} from './SimpleBatchConfig';



