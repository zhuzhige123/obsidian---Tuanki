/**
 * 单张卡片解析器 - 专门用于单张卡片的解析
 */

import type { RegexParseTemplate } from '../data/template-types';
import type { ParsedCardData } from './parsing';
import { getSingleCardParseTemplates } from './parsing';
import type AnkiPlugin from '../main';
import { BaseParser, type BaseParseOptions, type BaseParseResult } from './base-parser';

export interface SingleCardParseOptions extends BaseParseOptions {
  // 单张卡片解析器特有的选项可以在这里添加
}

export interface SingleCardParseResult extends BaseParseResult {
  // 单张卡片解析器特有的结果可以在这里添加
}

/**
 * 单张卡片解析器
 */
export class SingleCardParser extends BaseParser {
  constructor(triadTemplatesJson?: string, plugin?: AnkiPlugin) {
    super(
      'SingleCardParser',
      getSingleCardParseTemplates,
      triadTemplatesJson,
      plugin
    );
  }

  /**
   * 获取主要模板配置JSON
   */
  protected getPrimaryTemplatesJson(): string | undefined {
    // 使用三位一体模板系统
    return this.plugin?.settings?.triadTemplatesJson;
  }

  /**
   * 解析单张卡片内容
   */
  parse(content: string, options: SingleCardParseOptions = {}): SingleCardParseResult {
    return this.parseContent(content, options);
  }

  // 所有其他方法都继承自 BaseParser
}

/**
 * 创建单张卡片解析器实例
 */
export function createSingleCardParser(plugin?: AnkiPlugin): SingleCardParser {
  return new SingleCardParser(plugin?.settings?.triadTemplatesJson, plugin);
}
