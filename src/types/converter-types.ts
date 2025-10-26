/**
 * 卡片转换器类型定义
 * 用于 ParsedCard → Card 的转换过程
 */

import type { Card } from './card-types';
import type { ParsedCard } from './newCardParsingTypes';

/**
 * 转换选项
 */
export interface ConversionOptions {
  /** 目标牌组ID（必需） */
  deckId: string;
  
  /** 指定模板ID（可选，不指定则自动推断） */
  templateId?: string;
  
  /** 是否保留源文件信息（默认 true） */
  preserveSourceInfo?: boolean;
  
  /** 优先级（默认 0） */
  priority?: number;
  
  /** 是否挂起（默认 false） */
  suspended?: boolean;
  
  /** 额外标签 */
  additionalTags?: string[];
}

/**
 * 单卡转换结果
 */
export interface ConversionResult {
  /** 是否转换成功 */
  success: boolean;
  
  /** 转换后的卡片 */
  card?: Card;
  
  /** 错误信息 */
  error?: string;
  
  /** 警告信息 */
  warnings?: string[];
}

/**
 * 批量转换结果
 */
export interface BatchConversionResult {
  /** 是否全部转换成功 */
  success: boolean;
  
  /** 成功转换的卡片数量 */
  successCount: number;
  
  /** 转换失败的卡片数量 */
  failureCount: number;
  
  /** 转换后的卡片列表 */
  cards: Card[];
  
  /** 转换错误列表 */
  errors: Array<{
    /** 原始卡片索引 */
    index: number;
    /** 原始卡片ID */
    cardId?: string;
    /** 错误信息 */
    error: string;
  }>;
  
  /** 警告信息 */
  warnings?: string[];
}

/**
 * 保存选项
 */
export interface SaveOptions {
  /** 是否跳过验证 */
  skipValidation?: boolean;
  
  /** 是否允许覆盖已存在的卡片 */
  allowOverwrite?: boolean;
  
  /** 进度回调 */
  onProgress?: (current: number, total: number) => void;
  
  /** 是否在失败时继续（默认 true） */
  continueOnError?: boolean;
}

/**
 * 单卡保存结果
 */
export interface SaveResult {
  /** 是否保存成功 */
  success: boolean;
  
  /** 保存的卡片 */
  card?: Card;
  
  /** 错误信息 */
  error?: string;
}

/**
 * 批量保存结果
 */
export interface BatchSaveResult {
  /** 是否全部保存成功 */
  success: boolean;
  
  /** 成功保存的卡片数量 */
  successCount: number;
  
  /** 保存失败的卡片数量 */
  failureCount: number;
  
  /** 保存成功的卡片列表 */
  savedCards: Card[];
  
  /** 保存失败的错误列表 */
  errors: Array<{
    /** 卡片ID */
    cardId: string;
    /** 错误信息 */
    error: string;
    /** 原始错误对象 */
    originalError?: Error;
  }>;
  
  /** 总耗时（毫秒） */
  duration?: number;
}



