/**
 * Callout 标注框转换层
 * 负责将 Obsidian Callouts 转换为带样式的 HTML
 * 
 * 转换规则：
 * > [!note] Title
 * > Content
 * 
 * →
 * 
 * <div class="obsidian-callout callout-note">
 *   <div class="callout-title">📘 Title</div>
 *   <div class="callout-content">Content</div>
 * </div>
 */

import { BaseConversionLayer } from './ConversionLayer';
import type { ConversionContext, LayerConversionResult } from '../../../types/ankiconnect-types';
import {
  CONVERSION_REGEX,
  CALLOUT_TYPES,
  HtmlGenerator,
  StringUtils
} from '../utils/conversion-utils';

export class CalloutLayer extends BaseConversionLayer {
  name = 'CalloutLayer';
  priority = 70; // 中高优先级
  description = 'Callout 标注框转换（> [!type] → styled div）';

  convert(content: string, context: ConversionContext): LayerConversionResult {
    const options = context.options.calloutConversion;
    
    if (!options.enabled) {
      this.debug('Callout 转换已禁用');
      return this.createResult(content, 0);
    }

    this.debug('开始 Callout 转换');

    const warnings: string[] = [];
    let convertedContent = content;
    let totalChanges = 0;

    // 转换 Callouts
    const result = this.convertCallouts(convertedContent);
    convertedContent = result.content;
    totalChanges = result.count;
    warnings.push(...result.warnings);

    this.debug('Callout 转换完成', { changeCount: totalChanges });

    return this.createResult(convertedContent, totalChanges, warnings);
  }

  /**
   * 转换 Callouts
   */
  private convertCallouts(content: string): {
    content: string;
    count: number;
    warnings: string[];
  } {
    let count = 0;
    const warnings: string[] = [];

    const result = content.replace(CONVERSION_REGEX.CALLOUT_BLOCK, (match, type, title, contentLines) => {
      try {
        count++;
        
        // 获取 callout 类型配置
        const calloutConfig = CALLOUT_TYPES[type.toLowerCase() as keyof typeof CALLOUT_TYPES] || {
          icon: '📝',
          color: '#6B7280',
          label: type
        };

        // 解析标题
        const trimmedTitle = title.trim() || calloutConfig.label;

        // 解析内容（移除每行的 > 前缀）
        const parsedContent = this.parseCalloutContent(contentLines);

        // 生成 HTML
        const html = this.generateCalloutHtml(type, calloutConfig, trimmedTitle, parsedContent);

        return html;
      } catch (error) {
        warnings.push(`转换 Callout 失败: ${type}`);
        return match;
      }
    });

    return { content: result, count, warnings };
  }

  /**
   * 解析 Callout 内容
   * 移除每行的 > 前缀
   */
  private parseCalloutContent(contentLines: string): string {
    const lines = contentLines.split('\n');
    const parsedLines = lines.map(line => {
      // 移除 > 前缀和前导空格
      return line.replace(/^>\s?/, '');
    });

    return parsedLines
      .filter(line => !StringUtils.isBlank(line)) // 移除空行
      .join('<br>'); // 使用 <br> 连接行
  }

  /**
   * 生成 Callout HTML
   */
  private generateCalloutHtml(
    type: string,
    config: { icon: string; color: string; label: string },
    title: string,
    content: string
  ): string {
    // 容器样式
    const containerStyles = {
      padding: '12px 16px',
      margin: '8px 0',
      'border-left': `4px solid ${config.color}`,
      background: this.hexToRgba(config.color, 0.1),
      'border-radius': '4px'
    };

    // 标题样式
    const titleStyles = {
      'font-weight': '600',
      'margin-bottom': '4px',
      color: config.color
    };

    // 生成标题 HTML
    const titleHtml = HtmlGenerator.createDiv(
      `${config.icon} ${StringUtils.escapeHtml(title)}`,
      'callout-title',
      titleStyles
    );

    // 生成内容 HTML
    const contentHtml = HtmlGenerator.createDiv(
      content,
      'callout-content'
    );

    // 组合完整 HTML
    return HtmlGenerator.createDiv(
      titleHtml + contentHtml,
      `obsidian-callout callout-${type.toLowerCase()}`,
      containerStyles
    );
  }

  /**
   * 将十六进制颜色转换为 RGBA
   */
  private hexToRgba(hex: string, alpha: number): string {
    // 移除 # 前缀
    hex = hex.replace(/^#/, '');

    // 解析 RGB 值
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * 统计 Callouts 数量（调试用）
   */
  private countCallouts(content: string): {
    total: number;
    byType: Record<string, number>;
  } {
    const matches = content.matchAll(CONVERSION_REGEX.CALLOUT_BLOCK);
    const byType: Record<string, number> = {};
    let total = 0;

    for (const match of matches) {
      total++;
      const type = match[1].toLowerCase();
      byType[type] = (byType[type] || 0) + 1;
    }

    return { total, byType };
  }
}


