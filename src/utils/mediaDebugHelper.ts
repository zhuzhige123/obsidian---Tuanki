/**
 * 媒体文件调试助手
 * 用于调试和测试媒体文件路径转换问题
 */

import { MediaFileHandler } from './mediaFileHandler';
import type { Plugin } from 'obsidian';

export class MediaDebugHelper {
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * 测试媒体路径转换功能
   */
  testMediaPathConversion(
    originalContent: string,
    savedFiles: Record<string, string>,
    deckId: string = 'test-deck'
  ): { original: string; converted: string; analysis: string[] } {
    const mediaHandler = new MediaFileHandler(this.plugin, deckId);
    const convertedContent = mediaHandler.convertMediaReferences(originalContent, savedFiles);
    
    const analysis: string[] = [];
    
    // 分析转换结果
    analysis.push(`📋 转换分析报告`);
    analysis.push(`原始内容长度: ${originalContent.length} 字符`);
    analysis.push(`转换后长度: ${convertedContent.length} 字符`);
    analysis.push(`媒体文件数量: ${Object.keys(savedFiles).length} 个`);
    
    // 检查是否有重复路径
    const duplicatePathPattern = /\[\[.*?\[\[.*?\]\].*?\]\]/g;
    const duplicateMatches = convertedContent.match(duplicatePathPattern);
    if (duplicateMatches) {
      analysis.push(`❌ 发现重复路径: ${duplicateMatches.length} 处`);
      duplicateMatches.forEach((match, index) => {
        analysis.push(`  ${index + 1}. ${match}`);
      });
    } else {
      analysis.push(`✅ 未发现重复路径问题`);
    }
    
    // 检查是否有混合格式
    const appProtocolCount = (convertedContent.match(/app:\/\/obsidian\.md\//g) || []).length;
    const obsidianLinkCount = (convertedContent.match(/\[\[.*?\]\]/g) || []).length;
    
    analysis.push(`🔗 路径格式统计:`);
    analysis.push(`  - app://协议: ${appProtocolCount} 个`);
    analysis.push(`  - Obsidian链接: ${obsidianLinkCount} 个`);
    
    // 检查每个媒体文件的转换情况
    analysis.push(`📁 文件转换详情:`);
    for (const [originalFilename, savedPath] of Object.entries(savedFiles)) {
      const isConverted = !convertedContent.includes(originalFilename);
      const status = isConverted ? '✅' : '❌';
      analysis.push(`  ${status} ${originalFilename} -> ${savedPath}`);
    }
    
    return {
      original: originalContent,
      converted: convertedContent,
      analysis
    };
  }

  /**
   * 模拟问题场景测试
   */
  testProblemScenario(): { original: string; converted: string; analysis: string[] } {
    const problemContent = `<img src="app://obsidian.md/tuanki/media/decks/memunr70y48vdku9dv/[[tuanki/media/decks/memunr70y48vdku9dv/9dbf35ab82620e32159414b58a7f71bcfd6d11b5.jpg@1192w.webp]]">`;
    
    // 模拟原始文件名和保存路径
    const savedFiles = {
      '9dbf35ab82620e32159414b58a7f71bcfd6d11b5.jpg@1192w.webp': 'tuanki/media/decks/memunr70y48vdku9dv/9dbf35ab82620e32159414b58a7f71bcfd6d11b5.jpg@1192w.webp'
    };

    return this.testMediaPathConversion(problemContent, savedFiles, 'memunr70y48vdku9dv');
  }

  /**
   * 测试正常场景
   */
  testNormalScenario(): { original: string; converted: string; analysis: string[] } {
    const normalContent = `
      <div>
        <img src="image1.jpg" alt="图片1">
        <p>一些文本内容</p>
        <audio src="audio1.mp3" controls></audio>
        <img src="image2.png" style="width: 100px;">
      </div>
    `;
    
    const savedFiles = {
      'image1.jpg': 'tuanki/media/decks/test-deck/image1.jpg',
      'audio1.mp3': 'tuanki/media/decks/test-deck/audio1.mp3',
      'image2.png': 'tuanki/media/decks/test-deck/image2.png'
    };

    return this.testMediaPathConversion(normalContent, savedFiles, 'test-deck');
  }

  /**
   * 在控制台输出调试信息
   */
  logDebugInfo(): void {
    console.group('🔍 媒体文件路径转换调试');
    
    console.group('📋 问题场景测试');
    const problemResult = this.testProblemScenario();
    console.log('原始内容:', problemResult.original);
    console.log('转换结果:', problemResult.converted);
    console.log('分析报告:', problemResult.analysis.join('\n'));
    console.groupEnd();
    
    console.group('📋 正常场景测试');
    const normalResult = this.testNormalScenario();
    console.log('原始内容:', normalResult.original);
    console.log('转换结果:', normalResult.converted);
    console.log('分析报告:', normalResult.analysis.join('\n'));
    console.groupEnd();
    
    console.groupEnd();
  }

  /**
   * 验证文件是否存在于vault中
   */
  async verifyMediaFiles(savedFiles: Record<string, string>): Promise<{ exists: string[]; missing: string[] }> {
    const exists: string[] = [];
    const missing: string[] = [];
    
    for (const [filename, savedPath] of Object.entries(savedFiles)) {
      try {
        const file = this.plugin.app.vault.getAbstractFileByPath(savedPath);
        if (file) {
          exists.push(savedPath);
        } else {
          missing.push(savedPath);
        }
      } catch (error) {
        missing.push(savedPath);
      }
    }
    
    return { exists, missing };
  }

  /**
   * 生成媒体文件状态报告
   */
  async generateMediaReport(deckId: string): Promise<string[]> {
    const report: string[] = [];
    const mediaPath = `tuanki/media/decks/${deckId}`;
    
    try {
      const folder = this.plugin.app.vault.getAbstractFileByPath(mediaPath);
      if (folder && 'children' in folder && folder.children) {
        report.push(`📁 牌组 ${deckId} 媒体文件报告`);
        report.push(`路径: ${mediaPath}`);
        report.push(`文件数量: ${(folder as any).children.length}`);
        report.push(`文件列表:`);
        
        (folder as any).children.forEach((file: any, index: number) => {
          const size = file.stat?.size || 0;
          const sizeStr = this.formatFileSize(size);
          report.push(`  ${index + 1}. ${file.name} (${sizeStr})`);
        });
      } else {
        report.push(`❌ 未找到牌组 ${deckId} 的媒体文件夹`);
        report.push(`预期路径: ${mediaPath}`);
      }
    } catch (error) {
      report.push(`❌ 生成媒体报告时出错: ${error}`);
    }
    
    return report;
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// 全局调试函数，可以在控制台中调用
declare global {
  interface Window {
    tuankiMediaDebug?: MediaDebugHelper;
  }
}

export function initMediaDebug(plugin: Plugin): void {
  const debugHelper = new MediaDebugHelper(plugin);
  
  // 将调试助手挂载到全局对象上，方便在控制台中使用
  if (typeof window !== 'undefined') {
    window.tuankiMediaDebug = debugHelper;
    console.log('🔧 媒体调试助手已初始化，使用 window.tuankiMediaDebug 访问');
  }
}
