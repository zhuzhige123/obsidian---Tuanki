/**
 * 遮罩数据解析器
 * 
 * 功能：
 * - 解析 HTML 注释中的遮罩数据
 * - 序列化遮罩数据为 HTML 注释
 * - 查找图片对应的遮罩注释
 * - 解析图片路径（支持 Wiki 链接和 Markdown 链接）
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import type { App, TFile } from 'obsidian';
import type { 
  MaskData, 
  ParseResult, 
  CommentLocation,
  Mask
} from '../../types/image-mask-types';
import { MASK_CONSTANTS } from '../../types/image-mask-types';

export class MaskDataParser {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * 解析 HTML 注释为遮罩数据
   * 
   * @param comment HTML 注释内容（完整格式）
   * @returns 解析结果
   */
  parseCommentToMaskData(comment: string): ParseResult {
    try {
      // 提取 JSON 部分
      const jsonContent = this.extractJSONFromComment(comment);
      if (!jsonContent) {
        return {
          success: false,
          error: '无法从注释中提取 JSON 数据'
        };
      }

      // 解析 JSON
      const data = JSON.parse(jsonContent) as MaskData;

      // 验证数据结构
      const validation = this.validateMaskData(data);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error
        };
      }

      return {
        success: true,
        data
      };

    } catch (error) {
      console.error('[MaskDataParser] 解析注释失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 序列化遮罩数据为 HTML 注释
   * 
   * @param maskData 遮罩数据
   * @returns HTML 注释字符串
   */
  maskDataToComment(maskData: MaskData): string {
    // 压缩 JSON（无空格）
    const json = JSON.stringify(maskData);
    
    return `${MASK_CONSTANTS.COMMENT_PREFIX} ${json} ${MASK_CONSTANTS.COMMENT_SUFFIX}`;
  }

  /**
   * 在内容中查找图片对应的遮罩注释
   * 
   * @param content Markdown 内容
   * @param imageLineIndex 图片所在行索引（从0开始）
   * @returns 注释位置信息
   */
  findMaskCommentForImage(
    content: string,
    imageLineIndex: number
  ): CommentLocation {
    const lines = content.split('\n');
    
    // 检查图片行是否存在
    if (imageLineIndex >= lines.length) {
      return { found: false };
    }

    // 检查下一行是否为遮罩注释
    const nextLineIndex = imageLineIndex + 1;
    if (nextLineIndex >= lines.length) {
      return { found: false };
    }

    const nextLine = lines[nextLineIndex].trim();
    
    // 检查是否为 tuanki-mask 注释
    if (this.isMaskComment(nextLine)) {
      return {
        found: true,
        line: nextLineIndex,
        content: nextLine
      };
    }

    return { found: false };
  }

  /**
   * 解析图片路径为 TFile
   * 支持 Wiki 链接 ![[filename]] 和 Markdown 链接 ![](path)
   * 
   * @param imageLink 图片链接字符串
   * @param sourceFilePath 源文件路径（用于相对路径解析）
   * @returns TFile 对象或 null
   */
  resolveImagePath(
    imageLink: string,
    sourceFilePath: string
  ): TFile | null {
    try {
      // 提取文件名/路径
      const filename = this.extractImageFilename(imageLink);
      if (!filename) {
        console.warn('[MaskDataParser] 无法从链接中提取文件名:', imageLink);
        return null;
      }

      // 使用 Obsidian API 解析路径
      const file = this.app.metadataCache.getFirstLinkpathDest(
        filename,
        sourceFilePath
      );

      if (!file) {
        console.warn('[MaskDataParser] 无法找到图片文件:', filename);
        return null;
      }

      return file;

    } catch (error) {
      console.error('[MaskDataParser] 解析图片路径失败:', error);
      return null;
    }
  }

  /**
   * 检测文本行中是否包含图片链接
   * 
   * @param line 文本行
   * @returns 是否包含图片链接
   */
  hasImageLink(line: string): boolean {
    const wikiPattern = /!\[\[.*?\]\]/;
    const mdPattern = /!\[.*?\]\(.*?\)/;
    
    return wikiPattern.test(line) || mdPattern.test(line);
  }

  /**
   * 提取文本行中的图片链接
   * 
   * @param line 文本行
   * @returns 图片链接字符串或 null
   */
  extractImageLink(line: string): string | null {
    const wikiMatch = line.match(/!\[\[.*?\]\]/);
    if (wikiMatch) {
      return wikiMatch[0];
    }

    const mdMatch = line.match(/!\[.*?\]\(.*?\)/);
    if (mdMatch) {
      return mdMatch[0];
    }

    return null;
  }

  // ===== 私有辅助方法 =====

  /**
   * 从注释中提取 JSON 内容
   */
  private extractJSONFromComment(comment: string): string | null {
    const trimmed = comment.trim();
    
    // 检查格式
    if (!trimmed.startsWith(MASK_CONSTANTS.COMMENT_PREFIX)) {
      return null;
    }
    if (!trimmed.endsWith(MASK_CONSTANTS.COMMENT_SUFFIX)) {
      return null;
    }

    // 提取中间的 JSON 部分
    const start = MASK_CONSTANTS.COMMENT_PREFIX.length;
    const end = trimmed.length - MASK_CONSTANTS.COMMENT_SUFFIX.length;
    
    return trimmed.substring(start, end).trim();
  }

  /**
   * 验证遮罩数据结构
   */
  private validateMaskData(data: any): ParseResult {
    // 检查基本结构
    if (!data || typeof data !== 'object') {
      return {
        success: false,
        error: '遮罩数据格式错误'
      };
    }

    // 检查版本
    if (!data.version || data.version !== MASK_CONSTANTS.CURRENT_VERSION) {
      return {
        success: false,
        error: `不支持的数据版本: ${data.version}`
      };
    }

    // 检查 masks 数组
    if (!Array.isArray(data.masks)) {
      return {
        success: false,
        error: 'masks 必须是数组'
      };
    }

    // 验证每个遮罩
    for (let i = 0; i < data.masks.length; i++) {
      const mask = data.masks[i];
      const maskValidation = this.validateMask(mask, i);
      
      if (!maskValidation.success) {
        return maskValidation;
      }
    }

    return { success: true };
  }

  /**
   * 验证单个遮罩数据
   */
  private validateMask(mask: any, index: number): ParseResult {
    // 必需字段
    if (!mask.id || typeof mask.id !== 'string') {
      return {
        success: false,
        error: `遮罩 #${index}: 缺少 id 字段`
      };
    }

    if (!mask.type || !['rect', 'circle'].includes(mask.type)) {
      return {
        success: false,
        error: `遮罩 #${index}: type 必须是 'rect' 或 'circle'`
      };
    }

    if (typeof mask.x !== 'number' || mask.x < 0 || mask.x > 1) {
      return {
        success: false,
        error: `遮罩 #${index}: x 必须是 0-1 之间的数字`
      };
    }

    if (typeof mask.y !== 'number' || mask.y < 0 || mask.y > 1) {
      return {
        success: false,
        error: `遮罩 #${index}: y 必须是 0-1 之间的数字`
      };
    }

    // 根据类型验证额外字段
    if (mask.type === 'rect') {
      if (typeof mask.width !== 'number' || mask.width <= 0 || mask.width > 1) {
        return {
          success: false,
          error: `遮罩 #${index}: width 必须是 0-1 之间的正数`
        };
      }

      if (typeof mask.height !== 'number' || mask.height <= 0 || mask.height > 1) {
        return {
          success: false,
          error: `遮罩 #${index}: height 必须是 0-1 之间的正数`
        };
      }
    }

    if (mask.type === 'circle') {
      if (typeof mask.radius !== 'number' || mask.radius <= 0 || mask.radius > 1) {
        return {
          success: false,
          error: `遮罩 #${index}: radius 必须是 0-1 之间的正数`
        };
      }
    }

    return { success: true };
  }

  /**
   * 检查是否为遮罩注释
   */
  private isMaskComment(line: string): boolean {
    return line.startsWith(MASK_CONSTANTS.COMMENT_PREFIX) &&
           line.endsWith(MASK_CONSTANTS.COMMENT_SUFFIX);
  }

  /**
   * 从图片链接中提取文件名/路径
   */
  private extractImageFilename(link: string): string | null {
    // Wiki 链接格式: ![[filename]]
    const wikiMatch = link.match(/!\[\[(.*?)\]\]/);
    if (wikiMatch) {
      return wikiMatch[1];
    }

    // Markdown 链接格式: ![alt](path)
    const mdMatch = link.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch) {
      return mdMatch[1];
    }

    return null;
  }
}

/**
 * 生成唯一遮罩 ID
 */
export function generateMaskId(): string {
  return `mask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建默认遮罩数据结构
 */
export function createDefaultMaskData(): MaskData {
  return {
    version: MASK_CONSTANTS.CURRENT_VERSION,
    masks: []
  };
}

/**
 * 创建默认矩形遮罩
 */
export function createDefaultRectMask(): Mask {
  return {
    id: generateMaskId(),
    type: 'rect',
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
    style: MASK_CONSTANTS.DEFAULT_STYLE,
    fill: MASK_CONSTANTS.DEFAULT_FILL
  };
}

/**
 * 创建默认圆形遮罩
 */
export function createDefaultCircleMask(): Mask {
  return {
    id: generateMaskId(),
    type: 'circle',
    x: 0.5,
    y: 0.5,
    radius: 0.25,
    style: MASK_CONSTANTS.DEFAULT_STYLE,
    fill: MASK_CONSTANTS.DEFAULT_FILL
  };
}



