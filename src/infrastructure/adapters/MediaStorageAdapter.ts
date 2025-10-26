/**
 * 媒体存储适配器
 * 
 * 抽象媒体文件存储操作
 * 
 * @module infrastructure/adapters
 */

import type { MediaManifest, MediaFileEntry } from '../../domain/apkg/types';
import type { IFileSystemAdapter } from './FileSystemAdapter';

/**
 * 媒体存储适配器接口
 */
export interface IMediaStorageAdapter {
  /**
   * 创建牌组媒体文件夹
   */
  createDeckMediaFolder(deckName: string): Promise<string>;

  /**
   * 保存媒体文件
   */
  saveMediaFile(
    filename: string,
    data: Uint8Array,
    basePath: string
  ): Promise<string>;

  /**
   * 检查媒体文件是否存在
   */
  mediaFileExists(path: string): Promise<boolean>;

  /**
   * 删除媒体文件
   */
  deleteMediaFile(path: string): Promise<void>;

  /**
   * 保存媒体清单
   */
  saveManifest(manifest: MediaManifest): Promise<void>;

  /**
   * 读取媒体清单
   */
  loadManifest(basePath: string): Promise<MediaManifest | null>;

  /**
   * 生成Obsidian路径
   */
  generateObsidianPath(originalName: string, basePath: string): string;

  /**
   * 计算文件哈希
   */
  calculateHash(data: Uint8Array): Promise<string>;
}

/**
 * 基于FileSystem的媒体存储适配器实现
 */
export class FileSystemMediaStorageAdapter implements IMediaStorageAdapter {
  /** 媒体基础路径 */
  private readonly MEDIA_BASE_PATH = 'tuanki/media';

  constructor(private fileSystem: IFileSystemAdapter) {}

  async createDeckMediaFolder(deckName: string): Promise<string> {
    const sanitizedName = this.sanitizeDeckName(deckName);
    const folderPath = `${this.MEDIA_BASE_PATH}/[APKG] ${sanitizedName}`;
    
    await this.fileSystem.createFolder(this.MEDIA_BASE_PATH);
    await this.fileSystem.createFolder(folderPath);
    
    return folderPath;
  }

  async saveMediaFile(
    filename: string,
    data: Uint8Array,
    basePath: string
  ): Promise<string> {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const filePath = `${basePath}/${sanitizedFilename}`;
    
    // 转换Uint8Array为ArrayBuffer
    const buffer = data.buffer;
    
    await this.fileSystem.writeBinary(filePath, buffer);
    
    return filePath;
  }

  async mediaFileExists(path: string): Promise<boolean> {
    return await this.fileSystem.fileExists(path);
  }

  async deleteMediaFile(path: string): Promise<void> {
    await this.fileSystem.deleteFile(path);
  }

  async saveManifest(manifest: MediaManifest): Promise<void> {
    const manifestPath = `${manifest.basePath}/manifest.json`;
    const content = JSON.stringify(manifest, null, 2);
    await this.fileSystem.writeText(manifestPath, content);
  }

  async loadManifest(basePath: string): Promise<MediaManifest | null> {
    const manifestPath = `${basePath}/manifest.json`;
    
    try {
      const exists = await this.fileSystem.fileExists(manifestPath);
      if (!exists) {
        return null;
      }
      
      const content = await this.fileSystem.readText(manifestPath);
      return JSON.parse(content);
    } catch (error) {
      console.error('[MediaStorageAdapter] Failed to load manifest:', error);
      return null;
    }
  }

  generateObsidianPath(originalName: string, basePath: string): string {
    const sanitizedFilename = this.sanitizeFilename(originalName);
    return `${basePath}/${sanitizedFilename}`;
  }

  async calculateHash(data: Uint8Array): Promise<string> {
    // 使用Web Crypto API计算SHA-256哈希
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * 清理牌组名称（移除非法字符）
   */
  private sanitizeDeckName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')  // 替换非法字符
      .replace(/\s+/g, ' ')            // 合并多个空格
      .trim()
      .substring(0, 100);              // 限制长度
  }

  /**
   * 清理文件名（移除非法字符）
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .trim();
  }
}




