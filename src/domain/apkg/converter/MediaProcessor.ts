/**
 * 媒体文件处理器
 * 
 * 负责处理APKG中的媒体文件，包括保存、去重、生成清单等
 * 
 * @module domain/apkg/converter
 */

import type {
  MediaProcessingResult,
  MediaManifest,
  MediaFileEntry,
  MediaError,
  MediaProcessingStats
} from '../types';
import type { IMediaStorageAdapter } from '../../../infrastructure/adapters/MediaStorageAdapter';
import { APKGLogger } from '../../../infrastructure/logger/APKGLogger';
import { generateId } from '../../../utils/helpers';

/**
 * 媒体文件处理器
 */
export class MediaProcessor {
  private logger: APKGLogger;
  private storage: IMediaStorageAdapter;

  constructor(storage: IMediaStorageAdapter) {
    this.logger = new APKGLogger({ prefix: '[MediaProcessor]' });
    this.storage = storage;
  }

  /**
   * 处理媒体文件
   * 
   * @param mediaMap - 媒体文件映射 (文件名 → 二进制数据)
   * @param deckName - 牌组名称
   * @returns 处理结果
   */
  async process(
    mediaMap: Map<string, Uint8Array>,
    deckName: string
  ): Promise<MediaProcessingResult> {
    this.logger.info(`开始处理 ${mediaMap.size} 个媒体文件`);
    
    const errors: MediaError[] = [];
    const savedFiles = new Map<string, string>();
    const entries: MediaFileEntry[] = [];
    
    let savedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let totalSize = 0;
    
    try {
      // 1. 创建牌组媒体文件夹
      const basePath = await this.storage.createDeckMediaFolder(deckName);
      this.logger.debug(`媒体文件夹创建: ${basePath}`);
      
      // 2. 处理每个媒体文件
      for (const [filename, data] of mediaMap.entries()) {
        try {
          totalSize += data.length;
          
          // 计算哈希
          const hash = await this.storage.calculateHash(data);
          
          // 检查是否已存在（去重）
          const obsidianPath = this.storage.generateObsidianPath(filename, basePath);
          const exists = await this.storage.mediaFileExists(obsidianPath);
          
          if (exists) {
            this.logger.debug(`文件已存在，跳过: ${filename}`);
            savedFiles.set(filename, obsidianPath);
            skippedCount++;
            continue;
          }
          
          // 保存文件
          const savedPath = await this.storage.saveMediaFile(filename, data, basePath);
          savedFiles.set(filename, savedPath);
          
          // 创建条目
          const entry: MediaFileEntry = {
            id: generateId(),
            originalName: filename,
            savedPath,
            type: this.detectMediaType(filename),
            size: data.length,
            hash,
            usedByCards: [],  // 稍后由CardBuilder填充
            created: new Date().toISOString()
          };
          entries.push(entry);
          
          savedCount++;
          this.logger.debug(`保存成功: ${filename} → ${savedPath}`);
          
        } catch (error) {
          failedCount++;
          const errorMsg = `保存失败: ${filename}`;
          this.logger.error(errorMsg, error);
          errors.push({
            file: filename,
            error: error instanceof Error ? error.message : String(error),
            severity: 'error',
            code: 'SAVE_FAILED'
          });
        }
      }
      
      // 3. 创建清单
      const manifest: MediaManifest = {
        deckName,
        basePath,
        files: entries,
        created: new Date().toISOString(),
        version: 1
      };
      
      await this.storage.saveManifest(manifest);
      
      // 4. 统计
      const stats: MediaProcessingStats = {
        totalFiles: mediaMap.size,
        savedFiles: savedCount,
        skippedFiles: skippedCount,
        failedFiles: failedCount,
        totalSize
      };
      
      this.logger.info(`媒体处理完成: 保存${savedCount}, 跳过${skippedCount}, 失败${failedCount}`);
      
      return {
        success: failedCount === 0,
        savedFiles,
        manifest,
        errors,
        stats
      };
      
    } catch (error) {
      this.logger.error('媒体处理失败', error);
      
      return {
        success: false,
        savedFiles,
        manifest: {
          deckName,
          basePath: '',
          files: [],
          created: new Date().toISOString(),
          version: 1
        },
        errors: [{
          file: 'all',
          error: error instanceof Error ? error.message : String(error),
          severity: 'error',
          code: 'PROCESS_FAILED'
        }],
        stats: {
          totalFiles: mediaMap.size,
          savedFiles: savedCount,
          skippedFiles: skippedCount,
          failedFiles: failedCount,
          totalSize
        }
      };
    }
  }

  /**
   * 检测媒体类型
   */
  private detectMediaType(filename: string): 'image' | 'audio' | 'video' {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    
    // 图片
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    if (imageExts.includes(ext)) return 'image';
    
    // 音频
    const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];
    if (audioExts.includes(ext)) return 'audio';
    
    // 视频
    const videoExts = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'];
    if (videoExts.includes(ext)) return 'video';
    
    // 默认图片
    return 'image';
  }
}




