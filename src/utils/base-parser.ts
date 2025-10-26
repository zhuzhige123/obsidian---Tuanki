/**
 * 基础解析器类 - 提供所有解析器的公共功能
 */

import type { RegexParseTemplate } from '../data/template-types';
import type { ParsedCardData } from './parsing';
import { parseTextWithTemplate, parseTextWithBestTemplate } from './parsing';
import type AnkiPlugin from '../main';

/**
 * 基础解析选项
 */
export interface BaseParseOptions {
  /** 指定使用的模板ID，如果不指定则自动选择最佳模板 */
  templateId?: string;
  /** 是否启用智能模板选择 */
  enableSmartTemplateSelection?: boolean;
}

/**
 * 基础解析结果
 */
export interface BaseParseResult {
  success: boolean;
  data?: ParsedCardData;
  error?: string;
  template?: RegexParseTemplate;
}

/**
 * 模板获取函数类型
 */
export type TemplateGetter = (
  primaryTemplatesJson?: string,
  fallbackTemplatesJson?: string
) => RegexParseTemplate[];

/**
 * 基础解析器抽象类
 */
export abstract class BaseParser {
  protected templates: RegexParseTemplate[] = [];
  protected plugin?: AnkiPlugin;
  protected parserName: string;
  private templateGetter: TemplateGetter;

  constructor(
    parserName: string,
    templateGetter: TemplateGetter,
    triadTemplatesJson?: string,
    plugin?: AnkiPlugin
  ) {
    this.parserName = parserName;
    this.templateGetter = templateGetter;
    this.plugin = plugin;
    this.initializeTemplates(triadTemplatesJson);
  }

  /**
   * 初始化模板
   */
  private initializeTemplates(triadTemplatesJson?: string): void {
    this.templates = this.templateGetter(
      this.getPrimaryTemplatesJson(),
      triadTemplatesJson
    );

    console.log(`🔧 [${this.parserName}] 构造函数完成`);
    console.log(`📄 [${this.parserName}] 模板数量:`, this.templates.length);
    console.log(`🔍 [${this.parserName}] 可用模板:`, this.templates.map(t => `${t.name} (${t.id})`));
  }

  /**
   * 获取主要模板配置JSON - 子类需要实现
   */
  protected abstract getPrimaryTemplatesJson(): string | undefined;

  /**
   * 解析单个内容
   */
  protected parseContent(content: string, options: BaseParseOptions = {}): BaseParseResult {
    console.log(`🚀 [${this.parserName}] 开始解析内容`);
    console.log(`📝 [${this.parserName}] 内容长度:`, content.length);
    console.log(`📝 [${this.parserName}] 内容预览:`, content.substring(0, 100) + '...');
    console.log(`🔧 [${this.parserName}] 解析选项:`, options);

    try {
      let result: ParsedCardData | null = null;
      let usedTemplate: RegexParseTemplate | undefined;

      if (options.templateId) {
        // 使用指定的模板
        console.log(`🎯 [${this.parserName}] 使用指定模板: ${options.templateId}`);
        usedTemplate = this.templates.find(t => t.id === options.templateId);
        if (!usedTemplate) {
          const error = `找不到指定的模板: ${options.templateId}`;
          console.error(`❌ [${this.parserName}] ${error}`);
          return { success: false, error };
        }
        result = parseTextWithTemplate(content, usedTemplate);
      } else {
        // 自动选择最佳模板
        console.log(`🤖 [${this.parserName}] 自动选择最佳模板`);
        result = parseTextWithBestTemplate(content, this.templates);
        if (result && result.templateId) {
          usedTemplate = this.templates.find(t => t.id === result!.templateId);
        }
      }

      if (result) {
        console.log(`✅ [${this.parserName}] 解析成功:`, {
          front: result.front.substring(0, 50) + '...',
          back: result.back.substring(0, 50) + '...',
          templateId: result.templateId,
          templateName: result.templateName
        });
        
        return {
          success: true,
          data: result,
          template: usedTemplate
        };
      } else {
        const error = '没有模板能够解析此内容';
        console.log(`❌ [${this.parserName}] ${error}`);
        console.log(`📝 [${this.parserName}] 内容样本:`, content.substring(0, 300) + '...');
        
        return {
          success: false,
          error,
          template: usedTemplate
        };
      }
    } catch (error) {
      const errorMsg = `解析错误: ${error}`;
      console.error(`❌ [${this.parserName}] ${errorMsg}`, error);
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * 预览解析结果（不抛出异常）
   */
  previewParse(content: string, templateId?: string): BaseParseResult {
    return this.parseContent(content, { templateId });
  }

  /**
   * 更新模板列表
   */
  updateTemplates(triadTemplatesJson?: string): void {
    this.templates = this.templateGetter(
      this.getPrimaryTemplatesJson(),
      triadTemplatesJson
    );

    console.log(`🔄 [${this.parserName}] 模板已更新`);
    console.log(`📄 [${this.parserName}] 新的模板数量:`, this.templates.length);
  }

  /**
   * 获取可用的模板列表
   */
  getAvailableTemplates(): RegexParseTemplate[] {
    return [...this.templates];
  }

  /**
   * 测试模板匹配
   */
  testTemplate(content: string, templateId: string): {
    success: boolean;
    result?: ParsedCardData;
    error?: string;
  } {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) {
      return { success: false, error: `找不到模板: ${templateId}` };
    }

    const result = parseTextWithTemplate(content, template);
    if (result) {
      return { success: true, result };
    } else {
      return { success: false, error: '模板不匹配此内容' };
    }
  }

  /**
   * 获取解析器名称
   */
  getParserName(): string {
    return this.parserName;
  }

  /**
   * 获取模板数量
   */
  getTemplateCount(): number {
    return this.templates.length;
  }

  /**
   * 检查是否有可用模板
   */
  hasTemplates(): boolean {
    return this.templates.length > 0;
  }
}
