/**
 * APKG 文件解析器
 * 
 * 负责解析APKG文件，提取所有原始数据
 * 
 * @module domain/apkg/parser
 */

import JSZip from 'jszip';
import type {
  APKGData,
  APKGFormat,
  APKGMetadata,
  AnkiModel,
  AnkiDeck,
  AnkiNote
} from '../types';
import { APKGLogger } from '../../../infrastructure/logger/APKGLogger';
import { SQLiteReader } from './SQLiteReader';

/**
 * APKG 解析器
 */
export class APKGParser {
  private logger: APKGLogger;
  private sqlReader: SQLiteReader;

  constructor() {
    this.logger = new APKGLogger({ prefix: '[APKGParser]' });
    this.sqlReader = new SQLiteReader();
  }

  /**
   * 解析APKG文件
   * 
   * @param file - APKG文件
   * @returns 解析后的数据
   */
  async parse(file: File): Promise<APKGData> {
    this.logger.info(`开始解析APKG文件: ${file.name}`);
    
    try {
      // 1. 解压ZIP
      const zip = await this.extractZip(file);
      
      // 2. 检测格式
      const format = this.detectFormat(zip);
      this.logger.info(`检测到APKG格式: ${format.description}`);
      
      if (!format.supported) {
        throw new Error(`不支持的APKG格式: ${format.description}`);
      }
      
      // 3. 读取数据库
      const dbData = await zip.file(format.dbFileName)?.async('uint8array');
      if (!dbData) {
        throw new Error(`未找到数据库文件: ${format.dbFileName}`);
      }
      
      // 4. 解析数据库
      const { models, decks, notes, metadata } = await this.sqlReader.read(dbData, format);
      
      // 5. 提取媒体文件
      const media = await this.extractMedia(zip);
      
      this.logger.info(`解析完成: ${notes.length} 个笔记, ${media.size} 个媒体文件`);
      
      return {
        models,
        decks,
        notes,
        media,
        metadata
      };
    } catch (error) {
      this.logger.error('APKG解析失败', error);
      throw error;
    }
  }

  /**
   * 解压ZIP文件
   */
  private async extractZip(file: File): Promise<JSZip> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      this.logger.debug(`ZIP解压成功，包含 ${Object.keys(zip.files).length} 个文件`);
      return zip;
    } catch (error) {
      throw new Error(`ZIP解压失败: ${error.message}`);
    }
  }

  /**
   * 检测APKG格式
   */
  private detectFormat(zip: JSZip): APKGFormat {
    // 检查最新格式 (Anki 2.1.50+)
    if (zip.file('collection.anki21b')) {
      return {
        version: 'anki21b',
        dbFileName: 'collection.anki21b',
        supported: false,  // 新版格式已弃用
        description: 'Anki 2.1.50+ 最新格式 (已弃用，请使用旧版格式)',
        mediaFormat: 'protobuf',
        compression: 'zstd'
      };
    }
    
    // 检查Legacy 2格式 (Anki 2.1.x)
    if (zip.file('collection.anki21')) {
      return {
        version: 'anki21',
        dbFileName: 'collection.anki21',
        supported: true,
        description: 'Anki 2.1.x Legacy 2 格式 (deflate压缩 + JSON)',
        mediaFormat: 'json',
        compression: 'deflate'
      };
    }
    
    // 检查Legacy 1格式 (Anki 2.0.x)
    if (zip.file('collection.anki2')) {
      return {
        version: 'anki2',
        dbFileName: 'collection.anki2',
        supported: true,
        description: 'Anki 2.0.x Legacy 1 格式 (deflate压缩 + JSON)',
        mediaFormat: 'json',
        compression: 'deflate'
      };
    }
    
    throw new Error('无法识别的APKG格式：未找到有效的数据库文件');
  }

  /**
   * 提取媒体文件
   */
  private async extractMedia(zip: JSZip): Promise<Map<string, Uint8Array>> {
    const media = new Map<string, Uint8Array>();
    
    // 读取媒体映射文件
    const mediaFile = zip.file('media');
    if (!mediaFile) {
      this.logger.warn('未找到媒体映射文件');
      return media;
    }
    
    const mediaJsonText = await mediaFile.async('text');
    const mediaMapping: Record<string, string> = JSON.parse(mediaJsonText);
    
    // 提取每个媒体文件
    for (const [index, filename] of Object.entries(mediaMapping)) {
      const file = zip.file(index);
      if (file) {
        const data = await file.async('uint8array');
        media.set(filename, data);
        this.logger.debug(`提取媒体文件: ${filename} (${data.length} bytes)`);
      } else {
        this.logger.warn(`媒体文件缺失: ${filename} (索引: ${index})`);
      }
    }
    
    return media;
  }
}




