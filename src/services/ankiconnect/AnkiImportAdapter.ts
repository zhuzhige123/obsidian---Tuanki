/**
 * Anki导入适配器
 * 
 * 负责将Anki数据结构转换为Tuanki数据结构
 * 隔离Anki复杂性，保持Tuanki数据结构的纯净性
 * 
 * @module services/ankiconnect
 */

import type { Card } from '../../data/types';
import type { AnkiNoteInfo, AnkiModelInfo } from '../../types/ankiconnect-types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type { AnkiNote, AnkiModel } from '../../domain/apkg/types';
import type { AnkiConnectClient } from './AnkiConnectClient';
import type AnkiPlugin from '../../main';
import { CardBuilder } from '../../domain/apkg/builder/CardBuilder';
import { FieldSideResolver } from '../../domain/apkg/converter/FieldSideResolver';
import { ContentConverter } from '../../domain/apkg/converter/ContentConverter';
import { DEFAULT_CONVERSION_CONFIG } from '../../domain/apkg/types';
import { ImportMappingManager } from './ImportMappingManager';
import { generateUUID } from '../../utils/helpers'; // 🆕 v0.8: 统一ID系统

/**
 * Anki导入适配器
 */
export class AnkiImportAdapter {
  private cardBuilder: CardBuilder;
  private fieldResolver: FieldSideResolver;
  private contentConverter: ContentConverter;
  private mappingManager: ImportMappingManager;
  private client: AnkiConnectClient;
  private plugin: AnkiPlugin;

  constructor(
    mappingManager: ImportMappingManager,
    client: AnkiConnectClient,
    plugin: AnkiPlugin
  ) {
    this.cardBuilder = new CardBuilder();
    this.fieldResolver = new FieldSideResolver();
    this.contentConverter = new ContentConverter();
    this.mappingManager = mappingManager;
    this.client = client;
    this.plugin = plugin;
  }

  /**
   * 适配Anki Note为Tuanki Card
   * 
   * 核心转换流程：
   * 1. 将AnkiNoteInfo适配为APKG系统的AnkiNote格式
   * 2. 使用FieldSideResolver解析字段显示面
   * 3. 使用CardBuilder构建卡片（包含HTML到Markdown转换）
   * 4. 提取和隔离Anki原始数据
   * 5. 生成或复用UUID
   * 6. 标记卡片来源
   */
  async adaptAnkiNote(
    ankiNote: AnkiNoteInfo,
    template: ParseTemplate,
    modelInfo: AnkiModelInfo,
    targetDeckId: string
  ): Promise<Card> {
    try {
      // 1. 数据格式适配
      const adaptedNote = this.adaptAnkiNoteInfo(ankiNote);
      const adaptedModel = this.adaptAnkiModelInfo(modelInfo);
      adaptedNote.mid = adaptedModel.id;

      // 2. 解析字段显示面
      const fieldSideMap = this.fieldResolver.resolveSingle(adaptedModel);
      console.log(`[AnkiImportAdapter] 字段显示面: ${JSON.stringify(fieldSideMap)}`);

      // 🆕 3. 处理媒体文件
      const mediaFilenames = this.extractMediaFilenames(ankiNote.fields);
      const mediaPathMap = await this.downloadMediaFiles(
        mediaFilenames,
        modelInfo.name // 使用模型名作为牌组名
      );
      
      console.log(`[AnkiImportAdapter] 媒体处理:`, {
        检测到: mediaFilenames.length,
        下载成功: mediaPathMap.size,
        文件列表: mediaFilenames
      });

      // 4. 使用CardBuilder构建基础卡片
      const buildResult = this.cardBuilder.build({
        note: adaptedNote,
        model: adaptedModel,
        deckId: targetDeckId,
        templateId: template.id,
        fieldSideMap: fieldSideMap,
        mediaPathMap: mediaPathMap, // ✅ 有媒体映射
        conversionConfig: DEFAULT_CONVERSION_CONFIG
      });

      if (!buildResult.success || !buildResult.card) {
        throw new Error(`卡片构建失败: ${buildResult.warnings.join(', ')}`);
      }

      const card = buildResult.card;

      // 4. 生成或复用UUID
      const existingMapping = this.mappingManager.findByAnkiNoteId(ankiNote.noteId);
      card.uuid = existingMapping?.uuid || this.generateUUID();

      // 5. 标记卡片来源
      card.source = 'anki';

      // 6. 提取Anki原始字段（纯净内容，不包含Markdown格式）
      const ankiOriginalFields = this.extractAnkiOriginalFields(ankiNote);

      // 7. 从content提取Tuanki标准字段（去除字段名前缀）
      const tuankiFields = this.extractTuankiFieldsFromContent(card.content || '');

      // ✅ 8. 填充 card.fields 为 Tuanki 标准字段
      // 确保 PreviewEngine 和其他组件可以正常访问
      // 同时在 customFields.tuankiFields 中保留副本用于追溯
      card.fields = tuankiFields;  // 包含 front, back 等标准字段

      // 9. 保存Anki元数据到customFields
      card.customFields = {
        ...card.customFields,
        // Anki原始数据（完整保存，隔离在customFields中）
        ankiOriginal: {
          noteId: ankiNote.noteId,
          modelId: modelInfo.id,
          modelName: ankiNote.modelName,
          fields: ankiOriginalFields, // Anki原始字段（纯净HTML内容）
          tags: ankiNote.tags || [],
          mod: ankiNote.mod
        },
        // Tuanki标准字段（从content提取，已去除字段名前缀）
        tuankiFields: tuankiFields,
        // 导入信息
        importedAt: new Date().toISOString(),
        importSource: 'ankiconnect'
      };

      // 9. 保存字段映射和模型信息到metadata
      card.metadata = {
        ...card.metadata,
        fieldSideMap: fieldSideMap,
        ankiModel: {
          id: modelInfo.id,
          name: modelInfo.name,
          fields: modelInfo.fields
        }
      };

      // 10. 设置标签
      card.tags = ankiNote.tags || [];

      console.log(`[AnkiImportAdapter] 卡片转换成功:`, {
        id: card.id,
        uuid: card.uuid,
        source: card.source,
        ankiNoteId: ankiNote.noteId,
        hasContent: !!card.content,
        hasDiv: card.content?.includes('---div---'),
        ankiFieldsCount: Object.keys(ankiOriginalFields).length,
        tuankiFieldsCount: Object.keys(tuankiFields).length
      });

      return card;

    } catch (error: any) {
      console.error('[AnkiImportAdapter] 转换失败:', error);
      throw new Error(`适配Anki Note失败: ${error?.message || String(error)}`);
    }
  }

  /**
   * 将AnkiNoteInfo适配为APKG系统的AnkiNote格式
   */
  private adaptAnkiNoteInfo(noteInfo: AnkiNoteInfo): AnkiNote {
    // 提取字段值（处理AnkiConnect的对象形式字段）
    const fieldValues = Object.values(noteInfo.fields).map(field => {
      if (typeof field === 'object' && field !== null && 'value' in field) {
        return (field as any).value || '';
      }
      return String(field || '');
    });

    return {
      id: noteInfo.noteId,
      guid: '', // AnkiConnect不提供GUID
      mid: 0,   // 将在后续设置
      mod: Math.floor(noteInfo.mod / 1000),
      tags: (noteInfo.tags || []).join(' '),
      flds: fieldValues.join('\x1f'), // Anki字段分隔符
      sfld: fieldValues[0] || ''
    };
  }

  /**
   * 将AnkiModelInfo适配为APKG系统的AnkiModel格式
   */
  private adaptAnkiModelInfo(modelInfo: AnkiModelInfo): AnkiModel {
    return {
      id: modelInfo.id,
      name: modelInfo.name,
      type: 0, // 默认为普通卡片
      flds: modelInfo.fields.map((fieldName, index) => ({
        name: fieldName,
        ord: index,
        sticky: false,
        rtl: false,
        font: 'Arial',
        size: 20
      })),
      tmpls: (modelInfo.templates || []).map((tmpl, index) => ({
        name: tmpl.Name,
        ord: index,
        qfmt: tmpl.Front || '',
        afmt: tmpl.Back || '',
        bqfmt: '',
        bafmt: ''
      })),
      css: modelInfo.css || ''
    };
  }

  /**
   * 提取Anki原始字段（纯净内容）
   */
  private extractAnkiOriginalFields(noteInfo: AnkiNoteInfo): Record<string, string> {
    const fields: Record<string, string> = {};
    
    for (const [fieldName, fieldValue] of Object.entries(noteInfo.fields)) {
      let value: string;
      
      // 处理AnkiConnect的对象形式字段
      if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
        value = (fieldValue as any).value || '';
      } else {
        value = String(fieldValue || '');
      }
      
      // 只保存非空字段
      if (value.trim()) {
        fields[fieldName] = value;
      }
    }
    
    return fields;
  }

  /**
   * 从content中提取Tuanki标准字段
   * 
   * 🔥 修复：与CardBuilder逻辑保持一致
   * 1. 只保留标准字段 front 和 back
   * 2. 移除重复的 question 和 answer
   * 3. 增强分隔符处理，即使分隔符位置异常也能正确提取
   */
  private extractTuankiFieldsFromContent(content: string): Record<string, string> {
    const tuankiFields: Record<string, string> = {};
    
    // 🆕 增强的分隔符检测（与CardBuilder一致）
    const dividerIndex = content.indexOf('---div---');
    
    if (dividerIndex === -1) {
      // 没有分隔符，全部内容视为正面
      const cleanContent = this.stripFieldNamePrefix(content.trim());
      if (cleanContent) {
        tuankiFields.front = cleanContent;
      }
    } else if (dividerIndex === 0) {
      // 分隔符在开头（异常情况），后面的内容应该是正面
      const afterDivider = content.substring('---div---'.length).trim();
      const cleanContent = this.stripFieldNamePrefix(afterDivider);
      if (cleanContent) {
        tuankiFields.front = cleanContent;
      }
    } else {
      // 正常情况：正面 ---div--- 背面
      const beforeDivider = content.substring(0, dividerIndex).trim();
      const afterDivider = content.substring(dividerIndex + '---div---'.length).trim();
      
      const frontContent = this.stripFieldNamePrefix(beforeDivider);
      if (frontContent) {
        tuankiFields.front = frontContent;
      }
      
      const backContent = this.stripFieldNamePrefix(afterDivider);
      if (backContent) {
        tuankiFields.back = backContent;
      }
    }
    
    return tuankiFields;
  }

  /**
   * 去除字段名前缀
   * 
   * 将 "**FieldName**: content" 格式转换为纯净的 "content"
   */
  private stripFieldNamePrefix(text: string): string {
    if (!text || !text.trim()) {
      return '';
    }

    // 匹配模式：**字段名**: 内容
    const fieldPrefixPattern = /^\*\*([^*]+)\*\*:\s*/;
    
    // 按段落分割（双换行符）
    const paragraphs = text.split(/\n\n+/);
    
    // 处理每个段落，去除字段名前缀
    const cleanedParagraphs = paragraphs.map(paragraph => {
      const trimmed = paragraph.trim();
      if (!trimmed) return '';
      
      // 去除字段名前缀
      const cleaned = trimmed.replace(fieldPrefixPattern, '');
      return cleaned;
    }).filter(p => p.length > 0);
    
    return cleanedParagraphs.join('\n\n');
  }

  /**
   * 生成UUID（🔄 重构版）
   * 🆕 v0.8: 使用统一ID系统生成新格式UUID
   */
  private generateUUID(): string {
    return generateUUID(); // 使用新格式：tk-{12位}
  }

  // ==================== 媒体处理方法 ====================

  /**
   * 从 Anki 字段中提取媒体文件名
   */
  private extractMediaFilenames(fields: Record<string, any>): string[] {
    const filenames = new Set<string>();
    
    for (const fieldValue of Object.values(fields)) {
      // 处理 AnkiConnect 对象格式字段
      const value = typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue
        ? (fieldValue as any).value
        : String(fieldValue || '');
      
      if (!value) continue;
      
      // 提取图片：<img src="...">
      const imgMatches = value.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
      for (const match of imgMatches) {
        const filename = match[1].trim();
        if (filename && !filename.startsWith('http://') && !filename.startsWith('https://')) {
          filenames.add(filename);
        }
      }
      
      // 提取音频：[sound:filename]
      const soundMatches = value.matchAll(/\[sound:([^\]]+)\]/gi);
      for (const match of soundMatches) {
        filenames.add(match[1].trim());
      }
      
      // 提取视频：<video src="...">
      const videoMatches = value.matchAll(/<video[^>]+src=["']([^"']+)["']/gi);
      for (const match of videoMatches) {
        const filename = match[1].trim();
        if (filename && !filename.startsWith('http://') && !filename.startsWith('https://')) {
          filenames.add(filename);
        }
      }
    }
    
    return Array.from(filenames);
  }

  /**
   * 批量下载媒体文件到 Obsidian
   */
  private async downloadMediaFiles(
    filenames: string[],
    deckName: string
  ): Promise<Map<string, string>> {
    const mediaPathMap = new Map<string, string>();
    
    if (filenames.length === 0) {
      console.log('[AnkiImportAdapter] 无媒体文件需要下载');
      return mediaPathMap;
    }
    
    try {
      // 创建媒体文件夹：tuanki/media/[AnkiConnect] DeckName
      const safeDeckName = this.sanitizeFilename(deckName);
      const mediaFolder = `tuanki/media/[AnkiConnect] ${safeDeckName}`;
      await this.ensureFolder(mediaFolder);
      
      console.log(`[AnkiImportAdapter] 开始下载媒体文件:`, {
        文件夹: mediaFolder,
        数量: filenames.length
      });
      
      // 批量下载（并行）
      const downloadPromises = filenames.map(async (filename) => {
        try {
          const base64Data = await this.client.retrieveMediaFile(filename);
          
          if (!base64Data) {
            console.warn(`[AnkiImportAdapter] 媒体文件为空: ${filename}`);
            return;
          }
          
          // 转换 Base64 为 ArrayBuffer
          const arrayBuffer = this.base64ToArrayBuffer(base64Data);
          
          // 保存文件
          const filePath = `${mediaFolder}/${filename}`;
          await this.plugin.app.vault.adapter.writeBinary(filePath, arrayBuffer);
          
          // 记录映射
          mediaPathMap.set(filename, filePath);
          console.log(`[AnkiImportAdapter] ✅ 下载成功: ${filename}`);
        } catch (error) {
          console.error(`[AnkiImportAdapter] ❌ 下载失败: ${filename}`, error);
        }
      });
      
      await Promise.allSettled(downloadPromises);
      
      console.log(`[AnkiImportAdapter] 媒体下载完成: ${mediaPathMap.size}/${filenames.length}`);
      
    } catch (error) {
      console.error('[AnkiImportAdapter] 媒体处理失败:', error);
    }
    
    return mediaPathMap;
  }

  /**
   * 确保文件夹存在
   */
  private async ensureFolder(path: string): Promise<void> {
    const exists = await this.plugin.app.vault.adapter.exists(path);
    if (!exists) {
      await this.plugin.app.vault.createFolder(path);
      console.log(`[AnkiImportAdapter] 创建文件夹: ${path}`);
    }
  }

  /**
   * 清理文件名（移除不安全字符）
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 计算内容哈希
   */
  calculateContentHash(content: string): string {
    return ImportMappingManager.calculateContentHash(content);
  }
}

