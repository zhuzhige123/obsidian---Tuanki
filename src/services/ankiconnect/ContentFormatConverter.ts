/**
 * 格式转换器基础类
 * 负责协调多个转换层，将 Obsidian 格式转换为 Anki 格式
 */

import type { ConversionContext, FormatConversionResult } from '../../types/ankiconnect-types';
import type { IConversionLayer } from './layers/ConversionLayer';

/**
 * 分层格式转换器
 */
export class ContentFormatConverter {
  private layers: IConversionLayer[] = [];

  constructor() {
    // 转换层将在后续步骤中添加
  }

  /**
   * 注册转换层
   */
  registerLayer(layer: IConversionLayer): void {
    this.layers.push(layer);
    // 按优先级排序
    this.layers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 执行格式转换
   */
  convert(content: string, context: ConversionContext): FormatConversionResult {
    let convertedContent = content;
    const appliedLayers: string[] = [];
    const warnings: string[] = [];
    const conversionDetails: Record<string, any> = {};

    console.log('[ContentFormatConverter] 开始格式转换');
    console.log('[ContentFormatConverter] 原始内容长度:', content.length);

    // 依次通过每个启用的转换层
    for (const layer of this.layers) {
      if (!layer.enabled) {
        console.log(`[ContentFormatConverter] 跳过禁用的层: ${layer.name}`);
        continue;
      }

      try {
        const before = convertedContent;
        const result = layer.convert(convertedContent, context);
        
        convertedContent = result.content;
        appliedLayers.push(layer.name);
        conversionDetails[layer.name] = {
          changed: before !== convertedContent,
          changeCount: result.changeCount || 0,
          warnings: result.warnings || []
        };

        if (result.warnings && result.warnings.length > 0) {
          warnings.push(...result.warnings.map(w => `[${layer.name}] ${w}`));
        }

        console.log(`[ContentFormatConverter] ✓ 应用层: ${layer.name}`, {
          changed: before !== convertedContent,
          changeCount: result.changeCount || 0
        });
      } catch (error) {
        console.error(`[ContentFormatConverter] ✗ 转换层失败: ${layer.name}`, error);
        warnings.push(`转换层 ${layer.name} 处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    console.log('[ContentFormatConverter] 转换完成:', {
      原始长度: content.length,
      转换后长度: convertedContent.length,
      应用层数: appliedLayers.length,
      警告数: warnings.length
    });

    return {
      content: convertedContent,
      appliedLayers,
      warnings,
      conversionDetails
    };
  }

  /**
   * 获取所有注册的转换层
   */
  getLayers(): IConversionLayer[] {
    return [...this.layers];
  }

  /**
   * 启用指定转换层
   */
  enableLayer(layerName: string): void {
    const layer = this.layers.find(l => l.name === layerName);
    if (layer) {
      layer.enabled = true;
    }
  }

  /**
   * 禁用指定转换层
   */
  disableLayer(layerName: string): void {
    const layer = this.layers.find(l => l.name === layerName);
    if (layer) {
      layer.enabled = false;
    }
  }
}


