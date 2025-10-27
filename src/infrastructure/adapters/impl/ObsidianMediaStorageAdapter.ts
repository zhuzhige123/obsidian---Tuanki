/**
 * Obsidian媒体存储适配器实现
 * 
 * 实现IMediaStorageAdapter接口，提供Obsidian环境下的媒体文件存储能力
 * 
 * @module infrastructure/adapters/impl
 */

import type { Plugin, TFile } from 'obsidian';
import type { IMediaStorageAdapter } from '../MediaStorageAdapter';
import type { MediaManifest } from '../../../domain/apkg/types';
import { APKGLogger } from '../../logger/APKGLogger';

/**
 * Obsidian媒体存储适配器
 */
export class ObsidianMediaStorageAdapter implements IMediaStorageAdapter {
  private logger: APKGLogger;
  private plugin: Plugin;
  private baseMediaPath = 'tuanki/media';  // ✅ 插件专属媒体文件夹

  constructor(plugin: Plugin) {
    this.logger = new APKGLogger({ prefix: '[ObsidianMediaStorage]' });
    this.plugin = plugin;
  }

  /**
   * 创建牌组媒体文件夹
   */
  async createDeckMediaFolder(deckName: string): Promise<string> {
    // ✅ 规范路径: tuanki/media/[APKG] DeckName/
    const safeDeckName = this.sanitizeFilename(deckName);
    const folderPath = `${this.baseMediaPath}/[APKG] ${safeDeckName}`;
    
    await this.ensureFolder(folderPath);
    this.logger.debug(`创建牌组媒体文件夹: ${folderPath}`);
    
    return folderPath;
  }

  /**
   * 保存媒体文件
   */
  async saveMediaFile(
    filename: string,
    data: Uint8Array,
    basePath: string
  ): Promise<string> {
    const safeFilename = this.sanitizeFilename(filename);
    const filePath = `${basePath}/${safeFilename}`;
    
    // 如果文件已存在，生成唯一路径
    const uniquePath = await this.getUniqueFilePath(filePath);
    
    // 保存文件
    await this.plugin.app.vault.createBinary(
      uniquePath,
      data.buffer as ArrayBuffer
    );
    
    this.logger.debug(`保存媒体文件: ${filename} → ${uniquePath}`);
    
    return uniquePath;
  }

  /**
   * 计算文件哈希（SHA-256）
   */
  async calculateHash(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * 检查媒体文件是否存在
   */
  async mediaFileExists(path: string): Promise<boolean> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    return file !== null;
  }

  /**
   * 删除媒体文件
   */
  async deleteMediaFile(path: string): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (file && file instanceof this.plugin.app.vault.adapter.constructor) {
      await this.plugin.app.vault.delete(file as TFile);
      this.logger.debug(`删除媒体文件: ${path}`);
    }
  }

  /**
   * 读取媒体清单
   */
  async loadManifest(basePath: string): Promise<MediaManifest | null> {
    const manifestPath = `${basePath}/.manifest.json`;
    
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(manifestPath);
      if (!file) {
        return null;
      }
      
      const content = await this.plugin.app.vault.read(file as TFile);
      return JSON.parse(content);
    } catch (error) {
      this.logger.error('读取媒体清单失败:', error);
      return null;
    }
  }

  /**
   * 生成Obsidian路径
   */
  generateObsidianPath(filename: string, basePath: string): string {
    const safeFilename = this.sanitizeFilename(filename);
    return `${basePath}/${safeFilename}`;
  }

  /**
   * 保存媒体清单
   */
  async saveManifest(manifest: MediaManifest): Promise<void> {
    const manifestPath = `${manifest.basePath}/.manifest.json`;
    
    const manifestJson = JSON.stringify(manifest, null, 2);
    await this.plugin.app.vault.create(manifestPath, manifestJson);
    
    this.logger.debug(`保存媒体清单: ${manifestPath}`);
  }

  /**
   * 确保文件夹存在
   */
  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      const exists = this.plugin.app.vault.getAbstractFileByPath(currentPath);
      if (!exists) {
        try {
          await this.plugin.app.vault.createFolder(currentPath);
        } catch (error) {
          // 忽略"已存在"错误
          if (!(error as any).message?.includes('already exists')) {
            throw error;
          }
        }
      }
    }
  }

  /**
   * 清理文件名
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')  // 替换不安全字符
      .replace(/\s+/g, '_')            // 替换空格
      .replace(/_{2,}/g, '_')          // 合并多个下划线
      .replace(/^_+|_+$/g, '');        // 移除首尾下划线
  }

  /**
   * 获取唯一文件路径
   */
  private async getUniqueFilePath(originalPath: string): Promise<string> {
    let counter = 0;
    let testPath = originalPath;

    while (counter < 1000) {
      const exists = await this.mediaFileExists(testPath);
      if (!exists) return testPath;

      counter++;
      const dotIndex = originalPath.lastIndexOf('.');
      if (dotIndex > 0) {
        const baseName = originalPath.substring(0, dotIndex);
        const extension = originalPath.substring(dotIndex);
        testPath = `${baseName}_${counter}${extension}`;
      } else {
        testPath = `${originalPath}_${counter}`;
      }
    }

    throw new Error(`无法生成唯一文件路径: ${originalPath}`);
  }
}

