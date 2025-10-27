/**
 * Wikilink 双链转换层
 * 负责将 Obsidian 双链转换为 Anki 兼容格式
 * 
 * 转换规则：
 * - [[link]] → Obsidian 协议链接或纯文本
 * - [[link|text]] → 使用显示文本
 * - [[link#heading]] → 包含标题锚点
 * - ![[media]] → 跳过（已在媒体层处理）
 */

import { BaseConversionLayer } from './ConversionLayer';
import type { ConversionContext, LayerConversionResult } from '../../../types/ankiconnect-types';
import {
  CONVERSION_REGEX,
  BoundaryDetector,
  UrlEncoder,
  HtmlGenerator
} from '../utils/conversion-utils';

export class WikiLinkLayer extends BaseConversionLayer {
  name = 'WikiLinkLayer';
  priority = 80; // 高优先级，在公式之后
  description = 'Wikilink 双链转换（[[link]] → 链接或文本）';

  convert(content: string, context: ConversionContext): LayerConversionResult {
    const options = context.options.wikiLinkConversion;
    
    if (!options.enabled) {
      this.debug('Wikilink 转换已禁用');
      return this.createResult(content, 0);
    }

    this.debug('开始 Wikilink 转换', { mode: options.mode });

    const warnings: string[] = [];
    let convertedContent = content;
    let totalChanges = 0;

    // 先排除媒体嵌入 ![[...]]
    convertedContent = this.excludeMediaEmbeds(convertedContent);

    // 根据模式执行不同的转换
    if (options.mode === 'text-only') {
      const result = this.convertToText(convertedContent);
      convertedContent = result.content;
      totalChanges = result.count;
    } else {
      const result = this.convertToObsidianLink(convertedContent, context.vaultName);
      convertedContent = result.content;
      totalChanges = result.count;
      warnings.push(...result.warnings);
    }

    this.debug('Wikilink 转换完成', { changeCount: totalChanges });

    return this.createResult(convertedContent, totalChanges, warnings);
  }

  /**
   * 排除媒体嵌入（临时标记）
   */
  private excludeMediaEmbeds(content: string): string {
    // 将 ![[...]] 临时替换为占位符
    const mediaEmbeds: string[] = [];
    const placeholder = '___MEDIA_EMBED___';
    
    let result = content.replace(CONVERSION_REGEX.MEDIA_EMBED, (match) => {
      mediaEmbeds.push(match);
      return `${placeholder}${mediaEmbeds.length - 1}${placeholder}`;
    });

    // 存储到内部状态（实际实现中可能需要更好的机制）
    (this as any)._mediaEmbeds = mediaEmbeds;
    
    return result;
  }

  /**
   * 恢复媒体嵌入
   */
  private restoreMediaEmbeds(content: string): string {
    const mediaEmbeds = (this as any)._mediaEmbeds as string[] || [];
    const placeholder = '___MEDIA_EMBED___';
    
    return content.replace(new RegExp(`${placeholder}(\\d+)${placeholder}`, 'g'), (_, index) => {
      return mediaEmbeds[parseInt(index)] || '';
    });
  }

  /**
   * 转换为纯文本模式
   * [[link]] → link
   * [[link|text]] → text
   */
  private convertToText(content: string): { content: string; count: number } {
    let count = 0;

    // 处理所有双链格式
    const result = content.replace(/\[\[([^\]]+)\]\]/g, (match, inner, offset) => {
      // 检查是否在代码块中
      if (BoundaryDetector.shouldSkipMatch(content, offset)) {
        return match;
      }

      count++;
      const parsed = UrlEncoder.parseWikiLink(match);
      
      // 优先使用显示文本，否则使用路径
      return parsed.text || parsed.path;
    });

    return { content: this.restoreMediaEmbeds(result), count };
  }

  /**
   * 转换为 Obsidian 协议链接
   * [[link]] → <a href="obsidian://...">link</a>
   */
  private convertToObsidianLink(content: string, vaultName: string): {
    content: string;
    count: number;
    warnings: string[];
  } {
    let count = 0;
    const warnings: string[] = [];

    const result = content.replace(/\[\[([^\]]+)\]\]/g, (match, inner, offset) => {
      // 检查是否在代码块中
      if (BoundaryDetector.shouldSkipMatch(content, offset)) {
        return match;
      }

      try {
        count++;
        const parsed = UrlEncoder.parseWikiLink(match);
        
        // 生成 Obsidian 协议 URL
        const url = UrlEncoder.createObsidianUrl(
          vaultName,
          parsed.path,
          parsed.heading
        );
        
        // 显示文本：优先使用自定义文本，否则使用路径
        const displayText = parsed.text || (parsed.heading ? `${parsed.path}#${parsed.heading}` : parsed.path);
        
        // 生成链接 HTML
        return HtmlGenerator.createLink(url, displayText, {
          color: '#667eea',
          'text-decoration': 'none'
        });
      } catch (error) {
        warnings.push(`无法转换双链: ${match}`);
        return match;
      }
    });

    return {
      content: this.restoreMediaEmbeds(result),
      count,
      warnings
    };
  }

  /**
   * 统计双链数量（调试用）
   */
  private countWikilinks(content: string): {
    total: number;
    withText: number;
    withHeading: number;
  } {
    const all = content.match(/\[\[([^\]]+)\]\]/g) || [];
    const withText = all.filter(link => link.includes('|'));
    const withHeading = all.filter(link => link.includes('#') && !link.includes('|'));
    
    return {
      total: all.length,
      withText: withText.length,
      withHeading: withHeading.length
    };
  }
}


