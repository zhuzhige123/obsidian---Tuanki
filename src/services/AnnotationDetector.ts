/**
 * Tuanki标注检测器
 * 负责检测和识别文档中的 > [!tuanki] 标注
 */

import { EditorView, ViewPlugin, ViewUpdate, Decoration, RangeSet } from '@codemirror/view';
import { Extension, RangeSetBuilder } from '@codemirror/state';
import { TuankiAnnotation, AnnotationPosition, AnnotationMetadata, DeckTemplateInfo, ContentExtractionResult } from '../types/annotation-types';

/**
 * 标注检测器类
 */
export class AnnotationDetector {
  private static instance: AnnotationDetector;
  
  // 正则表达式模式
  private readonly TUANKI_ANNOTATION_REGEX = /^>\s*\[!tuanki\](?:\s*(.*))?$/gm;
  private readonly DECK_REGEX = /#deck\/([^\s#]+)/g;
  private readonly METADATA_REGEX = /^(uuid|created|modified|version|blockId):\s*(.+)$/gm;
  private readonly BLOCK_ID_REGEX = /\^([a-zA-Z0-9-_]+)$/gm;
  
  // 检测到的标注缓存
  private detectedAnnotations: Map<string, TuankiAnnotation> = new Map();
  
  // 事件监听器
  private eventListeners: Array<(annotations: TuankiAnnotation[]) => void> = [];

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): AnnotationDetector {
    if (!AnnotationDetector.instance) {
      AnnotationDetector.instance = new AnnotationDetector();
    }
    return AnnotationDetector.instance;
  }

  /**
   * 创建CodeMirror扩展用于标注检测
   */
  public createExtension(): Extension {
    return ViewPlugin.fromClass(class {
      decorations: RangeSet<Decoration>;
      private detector: AnnotationDetector;

      constructor(view: EditorView) {
        this.detector = AnnotationDetector.getInstance();
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
          
          // 检测标注变更
          if (update.docChanged) {
            this.detector.detectAnnotationsInView(update.view);
          }
        }
      }

      buildDecorations(view: EditorView): RangeSet<Decoration> {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const text = doc.toString();

        // 匹配Tuanki标注语法
        const regex = /^>\s*\[!tuanki\](.*)$/gm;
        let match;

        while ((match = regex.exec(text)) !== null) {
          const from = match.index;
          const to = match.index + match[0].length;
          const title = match[1].trim();

          // 检查是否在可见范围内
          if (to < view.viewport.from || from > view.viewport.to) continue;

          builder.add(
            from,
            to,
            Decoration.mark({
              class: 'cm-callout cm-callout-tuanki',
              attributes: {
                'data-callout-type': 'tuanki',
                'data-callout-title': title,
                'title': 'Tuanki 学习卡片标注',
                'role': 'button',
              },
            })
          );
        }

        return builder.finish();
      }
    }, {
      decorations: v => v.decorations,
    });
  }

  /**
   * 在编辑器视图中检测标注
   */
  public detectAnnotationsInView(view: EditorView): TuankiAnnotation[] {
    const doc = view.state.doc;
    const text = doc.toString();
    const filePath = this.getFilePathFromView(view);
    
    return this.detectAnnotationsInText(text, filePath);
  }

  /**
   * 在文本中检测标注
   */
  public detectAnnotationsInText(text: string, filePath: string): TuankiAnnotation[] {
    const annotations: TuankiAnnotation[] = [];
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^>\s*\[!tuanki\](.*)$/);
      
      if (match) {
        try {
          const annotation = this.parseAnnotationBlock(lines, i, filePath);
          if (annotation) {
            annotations.push(annotation);
            this.detectedAnnotations.set(annotation.id, annotation);
          }
        } catch (error) {
          console.error('解析标注块失败:', error);
        }
      }
    }

    // 通知监听器
    this.notifyListeners(annotations);
    
    return annotations;
  }

  /**
   * 解析标注块
   */
  private parseAnnotationBlock(lines: string[], startLine: number, filePath: string): TuankiAnnotation | null {
    const annotationId = this.generateAnnotationId(filePath, startLine);
    
    // 查找标注块的结束位置
    const { endLine, content } = this.extractAnnotationContent(lines, startLine);
    
    // 提取内容
    const extractionResult = this.extractContentFromBlock(content);
    if (!extractionResult.success) {
      console.warn('内容提取失败:', extractionResult.error);
      return null;
    }

    // 创建位置信息
    const position: AnnotationPosition = {
      filePath,
      startLine,
      endLine,
      startChar: 0,
      endChar: lines[endLine]?.length || 0,
      blockId: extractionResult.existingMetadata?.blockId
    };

    // 创建标注对象
    const annotation: TuankiAnnotation = {
      id: annotationId,
      position,
      rawContent: content,
      cardContent: extractionResult.content || '',
      deckTemplate: extractionResult.deckTemplate || {},
      metadata: extractionResult.existingMetadata || {},
      detectedAt: new Date().toISOString(),
      isProcessed: !!extractionResult.existingMetadata?.uuid,
      cardId: undefined
    };

    return annotation;
  }

  /**
   * 提取标注内容
   */
  private extractAnnotationContent(lines: string[], startLine: number): { endLine: number; content: string } {
    const contentLines: string[] = [];
    let currentLine = startLine;
    
    // 添加起始行
    contentLines.push(lines[currentLine]);
    currentLine++;
    
    // 继续读取直到遇到非引用行或文件结束
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      
      // 如果是空行，检查下一行
      if (line.trim() === '') {
        // 检查下一行是否还是引用
        if (currentLine + 1 < lines.length && lines[currentLine + 1].startsWith('>')) {
          contentLines.push(line);
          currentLine++;
          continue;
        } else {
          break;
        }
      }
      
      // 如果以 > 开头，继续添加
      if (line.startsWith('>')) {
        contentLines.push(line);
        currentLine++;
      } else {
        break;
      }
    }
    
    return {
      endLine: currentLine - 1,
      content: contentLines.join('\n')
    };
  }

  /**
   * 从标注块中提取内容信息
   */
  private extractContentFromBlock(blockContent: string): ContentExtractionResult {
    try {
      // 移除引用符号并清理内容
      const cleanContent = blockContent
        .split('\n')
        .map(line => line.replace(/^>\s?/, ''))
        .join('\n')
        .trim();

      // 提取牌组和模板信息
      const deckTemplate = this.extractDeckTemplateInfo(cleanContent);
      
      // 提取现有元数据
      const existingMetadata = this.extractExistingMetadata(cleanContent);
      
      // 提取纯内容（移除元数据和标签）
      const pureContent = this.extractPureContent(cleanContent);

      return {
        success: true,
        content: pureContent,
        deckTemplate,
        existingMetadata
      };
    } catch (error) {
      return {
        success: false,
        error: `内容提取失败: ${error.message}`
      };
    }
  }

  /**
   * 提取牌组和模板信息
   */
  private extractDeckTemplateInfo(content: string): DeckTemplateInfo {
    const deckTemplate: DeckTemplateInfo = {};
    
    // 重置正则表达式
    this.DECK_REGEX.lastIndex = 0;
    
    const match = this.DECK_REGEX.exec(content);
    if (match) {
      deckTemplate.deckName = match[1].trim();
      console.log(`🔍 [AnnotationDetector] 提取到牌组标签: "${deckTemplate.deckName}"`);
    } else {
      console.log(`⚠️ [AnnotationDetector] 未找到牌组标签，内容预览: ${content.substring(0, 50)}...`);
    }
    
    return deckTemplate;
  }

  /**
   * 提取现有元数据
   */
  private extractExistingMetadata(content: string): AnnotationMetadata {
    const metadata: AnnotationMetadata = {};
    
    // 重置正则表达式
    this.METADATA_REGEX.lastIndex = 0;
    
    let match;
    while ((match = this.METADATA_REGEX.exec(content)) !== null) {
      const key = match[1];
      const value = match[2].trim();
      
      switch (key) {
        case 'uuid':
          metadata.uuid = value;
          break;
        case 'created':
          metadata.created = value;
          break;
        case 'modified':
          metadata.modified = value;
          break;
        case 'version':
          metadata.version = parseInt(value, 10);
          break;
        case 'blockId':
          metadata.blockId = value;
          break;
      }
    }
    
    // 提取块链接ID
    this.BLOCK_ID_REGEX.lastIndex = 0;
    const blockMatch = this.BLOCK_ID_REGEX.exec(content);
    if (blockMatch) {
      metadata.blockId = blockMatch[1];
    }
    
    return metadata;
  }

  /**
   * 提取纯内容（移除元数据和标签）
   */
  private extractPureContent(content: string): string {
    let pureContent = content;
    
    // 移除第一行的 [!tuanki] 标记
    pureContent = pureContent.replace(/^\[!tuanki\].*?\n?/, '');
    
    // 移除牌组标签
    pureContent = pureContent.replace(this.DECK_REGEX, '');
    
    // 移除元数据行
    pureContent = pureContent.replace(this.METADATA_REGEX, '');
    
    // 移除块链接
    pureContent = pureContent.replace(this.BLOCK_ID_REGEX, '');
    
    // 清理多余的空行
    pureContent = pureContent.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    
    return pureContent;
  }

  /**
   * 生成标注ID
   */
  private generateAnnotationId(filePath: string, startLine: number): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(`${filePath}:${startLine}:${timestamp}`);
    return `tuanki-annotation-${hash}`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 从编辑器视图获取文件路径
   */
  private getFilePathFromView(view: EditorView): string {
    // 尝试从编辑器状态中获取文件路径
    // 这里需要根据实际的Obsidian API进行调整
    return (view.state as any)?.filePath || 'unknown';
  }

  /**
   * 添加事件监听器
   */
  public addListener(listener: (annotations: TuankiAnnotation[]) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * 移除事件监听器
   */
  public removeListener(listener: (annotations: TuankiAnnotation[]) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(annotations: TuankiAnnotation[]): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(annotations);
      } catch (error) {
        console.error('标注监听器执行失败:', error);
      }
    });
  }

  /**
   * 获取所有检测到的标注
   */
  public getDetectedAnnotations(): TuankiAnnotation[] {
    return Array.from(this.detectedAnnotations.values());
  }

  /**
   * 清除检测缓存
   */
  public clearCache(): void {
    this.detectedAnnotations.clear();
  }

  /**
   * 获取指定文件的标注
   */
  public getAnnotationsForFile(filePath: string): TuankiAnnotation[] {
    return this.getDetectedAnnotations().filter(annotation => 
      annotation.position.filePath === filePath
    );
  }
}
