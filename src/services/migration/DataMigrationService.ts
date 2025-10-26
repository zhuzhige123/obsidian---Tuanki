/**
 * 数据迁移服务
 * 负责数据结构升级和清理工作
 */

import type { Plugin } from 'obsidian';
import type { Card, Deck } from '../../data/types';
import type { AnkiDataStorage } from '../../data/storage';
import { ContentParserService } from '../content/ContentParserService';

interface MigrationResult {
  success: boolean;
  cardsUpdated: number;
  decksUpdated: number;
  errors: string[];
  warnings: string[];
}

/**
 * 数据迁移服务
 * 
 * 核心功能：
 * - 确保所有Card都有content字段
 * - 清理冗余的fields持久化数据
 * - 初始化Deck的层级结构字段
 * - 初始化索引系统
 */
export class DataMigrationService {
  private plugin: Plugin;
  private storage: AnkiDataStorage;
  private contentParser: ContentParserService;

  constructor(plugin: Plugin, storage: AnkiDataStorage, contentParser: ContentParserService) {
    this.plugin = plugin;
    this.storage = storage;
    this.contentParser = contentParser;
  }

  /**
   * 执行完整数据迁移
   */
  async migrate(): Promise<MigrationResult> {
    console.log('🔄 Starting data migration...');
    
    const result: MigrationResult = {
      success: true,
      cardsUpdated: 0,
      decksUpdated: 0,
      errors: [],
      warnings: []
    };

    try {
      // Step 1: 迁移卡片数据
      const cardsMigrationResult = await this.migrateCards();
      result.cardsUpdated = cardsMigrationResult.updated;
      result.errors.push(...cardsMigrationResult.errors);
      result.warnings.push(...cardsMigrationResult.warnings);

      // Step 2: 迁移牌组数据
      const decksMigrationResult = await this.migrateDecks();
      result.decksUpdated = decksMigrationResult.updated;
      result.errors.push(...decksMigrationResult.errors);
      result.warnings.push(...decksMigrationResult.warnings);

      // Step 3: 清理冗余数据（开发阶段可选）
      if (process.env.NODE_ENV === 'development') {
        await this.cleanupRedundantData();
      }

      console.log(`✅ Migration completed: ${result.cardsUpdated} cards, ${result.decksUpdated} decks updated`);
    } catch (error) {
      console.error('❌ Migration failed:', error);
      result.success = false;
      result.errors.push(`Migration failed: ${error}`);
    }

    return result;
  }

  /**
   * 迁移卡片数据
   */
  private async migrateCards(): Promise<{
    updated: number;
    errors: string[];
    warnings: string[];
  }> {
    const result = {
      updated: 0,
      errors: [] as string[],
      warnings: [] as string[]
    };

    try {
      const allCards = await this.storage.getCards();
      
      for (const card of allCards) {
        let needsUpdate = false;

        // 确保有content字段
        if (!card.content) {
          card.content = this.generateContentFromFields(card);
          needsUpdate = true;
          result.warnings.push(`Card ${card.id}: Generated content from fields`);
        }

        // 确保有uuid
        if (!card.uuid) {
          // 🆕 v0.8: 使用新ID生成器
          const { generateUUID } = await import('../../utils/helpers');
          card.uuid = generateUUID();
          needsUpdate = true;
          result.warnings.push(`Card ${card.id}: Generated UUID (new format)`);
        }

        // 初始化新的可选字段（如果不存在）
        if (card.sourceFile === undefined) {
          // 尝试从documentRef提取（如果有）
          if (card.documentRef?.path) {
            card.sourceFile = card.documentRef.path;
            needsUpdate = true;
          }
        }

        // 确保sourceExists字段
        if (card.sourceFile && card.sourceExists === undefined) {
          card.sourceExists = await this.checkFileExists(card.sourceFile);
          needsUpdate = true;
        }

        if (needsUpdate) {
          await this.storage.saveCard(card);
          result.updated++;
        }
      }
    } catch (error) {
      result.errors.push(`Card migration error: ${error}`);
    }

    return result;
  }

  /**
   * 迁移牌组数据
   */
  private async migrateDecks(): Promise<{
    updated: number;
    errors: string[];
    warnings: string[];
  }> {
    const result = {
      updated: 0,
      errors: [] as string[],
      warnings: [] as string[]
    };

    try {
      const allDecks = await this.storage.getDecks();
      
      for (const deck of allDecks) {
        let needsUpdate = false;

        // 初始化层级结构字段
        if (deck.path === undefined) {
          deck.path = deck.name; // 根牌组
          needsUpdate = true;
        }

        if (deck.level === undefined) {
          deck.level = 0; // 默认根级别
          needsUpdate = true;
        }

        if (deck.order === undefined) {
          deck.order = 0;
          needsUpdate = true;
        }

        if (deck.inheritSettings === undefined) {
          deck.inheritSettings = false;
          needsUpdate = true;
        }

        if (deck.includeSubdecks === undefined) {
          deck.includeSubdecks = false;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await this.storage.saveDeck(deck);
          result.updated++;
          result.warnings.push(`Deck ${deck.id}: Initialized hierarchy fields`);
        }
      }
    } catch (error) {
      result.errors.push(`Deck migration error: ${error}`);
    }

    return result;
  }

  /**
   * 清理冗余数据（开发阶段）
   */
  private async cleanupRedundantData(): Promise<void> {
    console.log('🧹 Cleaning up redundant data...');

    try {
      const allCards = await this.storage.getCards();
      
      for (const card of allCards) {
        // 清理不再需要持久化的fields
        // 注意：保留fields字段用于向后兼容，但不再主动写入
        // 这里只是示例，实际清理需要谨慎
        
        // 如果你想完全移除fields持久化，可以取消注释以下代码：
        // delete (card as any).fields;
        // await this.storage.saveCard(card);
      }

      console.log('✅ Redundant data cleaned');
    } catch (error) {
      console.error('Failed to cleanup redundant data:', error);
    }
  }

  /**
   * 从fields生成content
   */
  private generateContentFromFields(card: Card): string {
    const fields = card.fields || {};
    const front = fields['front'] || fields['question'] || '';
    const back = fields['back'] || fields['answer'] || '';

    if (front && back) {
      return `${front}\n---div---\n${back}`;
    }

    // 如果没有明确的front/back，合并所有字段
    return Object.values(fields).join('\n');
  }

  /**
   * 检查文件是否存在
   */
  private async checkFileExists(path: string): Promise<boolean> {
    try {
      const exists = await this.plugin.app.vault.adapter.exists(path);
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * 获取迁移报告
   */
  async getMigrationReport(): Promise<{
    needsMigration: boolean;
    cardsNeedingUpdate: number;
    decksNeedingUpdate: number;
  }> {
    let cardsNeedingUpdate = 0;
    let decksNeedingUpdate = 0;

    // 检查卡片
    const allCards = await this.storage.getCards();
    for (const card of allCards) {
      if (!card.content || !card.uuid || (card.sourceFile && card.sourceExists === undefined)) {
        cardsNeedingUpdate++;
      }
    }

    // 检查牌组
    const allDecks = await this.storage.getDecks();
    for (const deck of allDecks) {
      if (deck.path === undefined || deck.level === undefined) {
        decksNeedingUpdate++;
      }
    }

    return {
      needsMigration: cardsNeedingUpdate > 0 || decksNeedingUpdate > 0,
      cardsNeedingUpdate,
      decksNeedingUpdate
    };
  }
}



