/**
 * 媒体管理服务
 * 按牌组路径组织媒体文件，支持引用计数和去重
 */

import type { Plugin } from 'obsidian';
import type { MediaFile, MediaIndex } from '../../data/types';
import type { AnkiDataStorage } from '../../data/storage';

/**
 * 媒体管理服务
 * 
 * 核心功能：
 * - 按牌组层级路径组织媒体文件
 * - 基于SHA256哈希的文件去重
 * - 引用计数管理
 * - 孤立文件自动清理
 */
export class MediaManagementService {
  private plugin: Plugin;
  private storage: AnkiDataStorage;
  private hashCache: Map<string, MediaFile>;
  private mediaBasePath = 'tuanki/media';

  constructor(plugin: Plugin, storage: AnkiDataStorage) {
    this.plugin = plugin;
    this.storage = storage;
    this.hashCache = new Map();
  }

  /**
   * 初始化媒体管理系统
   */
  async initialize(): Promise<void> {
    console.log('Initializing media management system...');
    
    // 确保媒体根目录存在
    await this.ensureDir(this.mediaBasePath);
    await this.ensureDir(`${this.mediaBasePath}/_orphaned`);

    // 加载哈希索引
    await this.loadHashIndex();
    
    console.log('✅ Media management system initialized');
  }

  /**
   * 添加媒体文件
   * 
   * @param file - 文件对象
   * @param deckId - 牌组ID
   * @param cardId - 卡片ID
   * @returns 媒体文件对象
   */
  async addMedia(
    file: File,
    deckId: string,
    cardId: string
  ): Promise<MediaFile> {
    const hash = await this.calculateHash(file);

    // 检查是否已存在（跨牌组去重）
    const existing = this.hashCache.get(hash);
    if (existing) {
      console.log(`Media file already exists (hash: ${hash.substring(0, 8)}), adding reference`);
      
      // 添加引用
      if (!existing.usedByCards.includes(cardId)) {
        existing.usedByCards.push(cardId);
        existing.lastAccessed = new Date().toISOString();
        await this.updateMediaIndex(existing);
        await this.saveHashIndex();
      }
      
      return existing;
    }

    // 新文件，获取牌组路径
    const deck = await this.storage.getDeck(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    const deckPathDir = deck.path.replace(/::/g, '/');
    const storagePath = `${deckPathDir}/${file.name}`;
    const fullPath = `${this.mediaBasePath}/${storagePath}`;

    // 确保目录存在
    await this.ensureDirForFile(fullPath);

    // 保存文件
    const buffer = await file.arrayBuffer();
    await this.plugin.app.vault.adapter.writeBinary(
      fullPath,
      new Uint8Array(buffer)
    );

    // 创建媒体记录
    const media: MediaFile = {
      id: this.generateMediaId(),
      filename: file.name,
      deckPath: deck.path,
      storagePath,
      hash,
      size: file.size,
      mimeType: file.type,
      usedByCards: [cardId],
      created: new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    };

    // 更新索引
    this.hashCache.set(hash, media);
    await this.updateMediaIndex(media);
    await this.saveHashIndex();

    console.log(`✅ Added media file: ${storagePath}`);
    return media;
  }

  /**
   * 获取卡片使用的媒体
   */
  async getMediaByCard(cardId: string): Promise<MediaFile[]> {
    const allMedia = await this.getAllMedia();
    return allMedia.filter(m => m.usedByCards.includes(cardId));
  }

  /**
   * 获取牌组的所有媒体
   */
  async getMediaByDeck(deckPath: string): Promise<MediaFile[]> {
    const index = await this.getMediaIndex(deckPath);
    return index.files;
  }

  /**
   * 卡片删除时清理媒体引用
   */
  async onCardDeleted(cardId: string): Promise<void> {
    const mediaFiles = await this.getMediaByCard(cardId);

    for (const media of mediaFiles) {
      // 移除引用
      media.usedByCards = media.usedByCards.filter(id => id !== cardId);

      if (media.usedByCards.length === 0) {
        // 无引用，移至孤立文件夹
        console.log(`Moving orphaned media: ${media.filename}`);
        await this.moveToOrphaned(media);
      } else {
        // 仍有引用，更新索引
        await this.updateMediaIndex(media);
      }
    }

    await this.saveHashIndex();
  }

  /**
   * 牌组删除时清理媒体
   */
  async onDeckDeleted(deckId: string): Promise<void> {
    const deck = await this.storage.getDeck(deckId);
    if (!deck) return;

    const mediaIndex = await this.getMediaIndex(deck.path);

    for (const media of mediaIndex.files) {
      if (media.usedByCards.length === 0) {
        // 物理删除
        await this.deleteMedia(media);
      } else {
        // 移至孤立文件夹
        await this.moveToOrphaned(media);
      }
    }

    console.log(`✅ Cleaned up media for deleted deck: ${deck.path}`);
  }

  /**
   * 清理孤立媒体
   * 
   * @param daysThreshold - 天数阈值
   * @returns 清理的文件数量
   */
  async cleanupOrphaned(daysThreshold: number = 30): Promise<number> {
    const orphanedPath = `${this.mediaBasePath}/_orphaned`;
    const cutoff = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    try {
      const listing = await this.plugin.app.vault.adapter.list(orphanedPath);
      const files = listing.files || [];

      for (const filePath of files) {
        if (filePath.endsWith('.json')) continue; // 跳过索引文件

        try {
          const stat = await this.plugin.app.vault.adapter.stat(filePath);
          if (stat && stat.mtime < cutoff) {
            await this.plugin.app.vault.adapter.remove(filePath);
            cleaned++;
          }
        } catch (error) {
          console.warn(`Failed to check/delete orphaned file: ${filePath}`, error);
        }
      }

      console.log(`✅ Cleaned up ${cleaned} orphaned media files`);
    } catch (error) {
      console.error('Orphaned cleanup failed:', error);
    }

    return cleaned;
  }

  /**
   * 获取媒体统计信息
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    orphanedCount: number;
  }> {
    const allMedia = await this.getAllMedia();
    const totalSize = allMedia.reduce((sum, m) => sum + m.size, 0);
    
    // 统计孤立文件
    let orphanedCount = 0;
    try {
      const listing = await this.plugin.app.vault.adapter.list(
        `${this.mediaBasePath}/_orphaned`
      );
      orphanedCount = (listing.files || []).filter(f => !f.endsWith('.json')).length;
    } catch {
      orphanedCount = 0;
    }

    return {
      totalFiles: allMedia.length,
      totalSize,
      orphanedCount
    };
  }

  // ===== 私有辅助方法 =====

  /**
   * 计算文件哈希
   */
  private async calculateHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 移动到孤立文件夹
   */
  private async moveToOrphaned(media: MediaFile): Promise<void> {
    const oldPath = `${this.mediaBasePath}/${media.storagePath}`;
    const newPath = `${this.mediaBasePath}/_orphaned/${media.filename}`;

    try {
      const exists = await this.plugin.app.vault.adapter.exists(oldPath);
      if (exists) {
        // 使用文件内容复制+删除的方式
        const content = await this.plugin.app.vault.adapter.readBinary(oldPath);
        await this.plugin.app.vault.adapter.writeBinary(newPath, content);
        await this.plugin.app.vault.adapter.remove(oldPath);
        
        media.storagePath = `_orphaned/${media.filename}`;
        media.deckPath = '_orphaned';
        await this.updateMediaIndex(media);
        
        console.log(`Moved to orphaned: ${media.filename}`);
      }
    } catch (error) {
      console.error('Failed to move media to orphaned:', error);
    }
  }

  /**
   * 删除媒体文件
   */
  private async deleteMedia(media: MediaFile): Promise<void> {
    const path = `${this.mediaBasePath}/${media.storagePath}`;
    
    try {
      await this.plugin.app.vault.adapter.remove(path);
      this.hashCache.delete(media.hash);
      console.log(`Deleted media: ${media.filename}`);
    } catch (error) {
      console.error('Failed to delete media:', error);
    }
  }

  /**
   * 获取媒体索引
   */
  private async getMediaIndex(deckPath: string): Promise<MediaIndex> {
    const indexPath = `${this.mediaBasePath}/${deckPath.replace(/::/g, '/')}/.media-index.json`;

    try {
      const content = await this.plugin.app.vault.adapter.read(indexPath);
      return JSON.parse(content);
    } catch {
      return {
        deckPath,
        files: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * 更新媒体索引
   */
  private async updateMediaIndex(media: MediaFile): Promise<void> {
    const index = await this.getMediaIndex(media.deckPath);
    
    const existingIndex = index.files.findIndex(f => f.id === media.id);
    if (existingIndex >= 0) {
      index.files[existingIndex] = media;
    } else {
      index.files.push(media);
    }

    // 清理已删除的媒体
    index.files = index.files.filter(f => f.usedByCards.length > 0 || f.id === media.id);
    
    index.lastUpdated = new Date().toISOString();

    const indexPath = `${this.mediaBasePath}/${media.deckPath.replace(/::/g, '/')}/.media-index.json`;
    await this.ensureDirForFile(indexPath);
    await this.plugin.app.vault.adapter.write(
      indexPath,
      JSON.stringify(index, null, 2)
    );
  }

  /**
   * 获取所有媒体
   */
  private async getAllMedia(): Promise<MediaFile[]> {
    const allMedia: MediaFile[] = [];
    
    // 遍历所有牌组的媒体索引
    const decks = await this.storage.getDecks();
    for (const deck of decks) {
      const index = await this.getMediaIndex(deck.path);
      allMedia.push(...index.files);
    }

    return allMedia;
  }

  /**
   * 加载哈希索引
   */
  private async loadHashIndex(): Promise<void> {
    const indexPath = `${this.mediaBasePath}/.hash-index.json`;
    
    try {
      const content = await this.plugin.app.vault.adapter.read(indexPath);
      const data = JSON.parse(content);
      this.hashCache = new Map(Object.entries(data));
      console.log(`Loaded ${this.hashCache.size} media file hashes`);
    } catch {
      this.hashCache = new Map();
      console.log('No existing hash index found, starting fresh');
    }
  }

  /**
   * 保存哈希索引
   */
  private async saveHashIndex(): Promise<void> {
    const indexPath = `${this.mediaBasePath}/.hash-index.json`;
    const data = Object.fromEntries(this.hashCache);
    await this.plugin.app.vault.adapter.write(
      indexPath,
      JSON.stringify(data, null, 2)
    );
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(path: string): Promise<void> {
    try {
      await this.plugin.app.vault.createFolder(path);
    } catch {
      // 目录已存在
    }
  }

  /**
   * 确保文件所在目录存在
   */
  private async ensureDirForFile(filePath: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await this.ensureDir(dir);
  }

  /**
   * 生成媒体ID
   */
  private generateMediaId(): string {
    return `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}



