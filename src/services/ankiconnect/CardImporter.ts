/**
 * 卡片导入器
 * 负责从 Anki 导入卡片到 Tuanki
 */

import type { AnkiNoteInfo, ImportResult, ImportError, AnkiModelInfo } from '../../types/ankiconnect-types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type { Card } from '../../data/types';
import type AnkiPlugin from '../../main';
import { AnkiConnectClient } from './AnkiConnectClient';
import { AnkiTemplateConverter } from './AnkiTemplateConverter';

// 🆕 集成APKG系统的字段处理组件（已由AnkiImportAdapter封装）
import type { AnkiModel, AnkiNote } from '../../domain/apkg/types';

// 🆕 Anki导入适配器（新架构）
import { AnkiImportAdapter } from './AnkiImportAdapter';

// 🆕 导入映射管理器（替代SyncMetadataManager）
import { ImportMappingManager } from './ImportMappingManager';

// 🆕 备份管理组件
import { BackupManager } from './BackupManager';

export class CardImporter {
  private plugin: AnkiPlugin;
  private ankiConnect: AnkiConnectClient;
  private templateConverter: AnkiTemplateConverter;
  
  // 🆕 导入映射管理器（新架构）
  private mappingManager: ImportMappingManager;
  
  // 🆕 Anki导入适配器（新架构）
  private importAdapter: AnkiImportAdapter;
  
  // 🆕 备份管理组件
  private backupManager: BackupManager;

  constructor(
    plugin: AnkiPlugin,
    ankiConnect: AnkiConnectClient,
    templateConverter: AnkiTemplateConverter
  ) {
    this.plugin = plugin;
    this.ankiConnect = ankiConnect;
    this.templateConverter = templateConverter;
    
    // 🆕 初始化导入映射管理器
    this.mappingManager = new ImportMappingManager(plugin);
    
    // 🆕 初始化Anki导入适配器
    this.importAdapter = new AnkiImportAdapter(
      this.mappingManager,
      this.ankiConnect,
      this.plugin
    );
    
    // 🆕 初始化备份管理器
    this.backupManager = new BackupManager(plugin);
  }

  /**
   * 导入整个牌组
   */
  async importDeck(
    deckName: string,
    targetTuankiDeckId: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<ImportResult> {
    const errors: ImportError[] = [];
    const importedTemplates: ParseTemplate[] = [];
    const importedCards: Card[] = [];
    let skippedCards = 0;
    let backupId: string | null = null;

    // 获取dataStorage引用（用于整个导入流程）
    const dataStorage = this.plugin.dataStorage;

    try {
      // 🆕 0. 导入前备份
      onProgress?.(0, 100, '正在创建备份...');
      if (dataStorage) {
        try {
          // 获取现有牌组和卡片用于备份
          const allDecks = await dataStorage.getAllDecks();
          const existingDeck = allDecks.find((d: any) => d.id === targetTuankiDeckId);
          
          if (existingDeck) {
            const existingCards = await dataStorage.getCardsByDeck(targetTuankiDeckId);
            if (existingCards && existingCards.length > 0) {
              backupId = await this.backupManager.createBackup(
                targetTuankiDeckId,
                existingDeck.name,
                existingCards,
                'import'
              );
              console.log(`✓ 已创建导入前备份: ${backupId}，包含 ${existingCards.length} 张卡片`);
            }
          }
        } catch (backupError: any) {
          console.warn('备份失败，但继续导入:', backupError);
          errors.push({
            type: 'storage',
            message: `备份失败: ${backupError.message}`
          });
        }
      }

      // 1. 获取牌组中的所有 Note
      onProgress?.(5, 100, '正在获取 Anki 牌组数据...');
      const noteIds = await this.ankiConnect.findNotesByDeck(deckName);

      if (noteIds.length === 0) {
        return {
          success: true,
          importedCards: 0,
          importedTemplates: 0,
          skippedCards: 0,
          errors: [],
          templates: [],
          cards: []
        };
      }

      onProgress?.(10, 100, `找到 ${noteIds.length} 张卡片`);

      // 2. 获取 Note 详细信息
      const notes = await this.ankiConnect.getNotesInfo(noteIds);

      onProgress?.(20, 100, '正在分析模板...');

      // 3. 获取所有使用的模型（去重）
      const modelNames = [...new Set(notes.map(note => note.modelName))];
      const templateMap = new Map<string, ParseTemplate>();

      // 4. 转换模板
      for (let i = 0; i < modelNames.length; i++) {
        const modelName = modelNames[i];
        try {
          const modelInfo = await this.ankiConnect.getModelInfo(modelName);
          
          // 检查是否已导入
          if (this.templateConverter.isTemplateAlreadyImported(modelInfo.id)) {
            const existingTemplate = this.templateConverter.findImportedTemplate(modelInfo.id);
            if (existingTemplate) {
              templateMap.set(modelName, existingTemplate);
              console.log(`模板 ${modelName} 已存在，跳过创建`);
              continue;
            }
          }

          const { template, warnings } = this.templateConverter.convertModelToTemplate(modelInfo);
          
          // 保存模板到设置
          await this.saveTemplate(template);
          templateMap.set(modelName, template);
          importedTemplates.push(template);

          if (warnings.length > 0) {
            errors.push({
              type: 'template_conversion',
              message: `模板 ${modelName} 转换警告: ${warnings.join(', ')}`,
              templateName: modelName
            });
          }

          onProgress?.(
            20 + (i + 1) / modelNames.length * 20,
            100,
            `已转换模板 ${i + 1}/${modelNames.length}`
          );
        } catch (error: any) {
          errors.push({
            type: 'template_conversion',
            message: `无法转换模板 ${modelName}: ${error.message}`,
            templateName: modelName
          });
        }
      }

      onProgress?.(40, 100, '正在转换卡片...');

      // 5. 转换卡片
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        try {
          const template = templateMap.get(note.modelName);
          if (!template) {
            skippedCards++;
            errors.push({
              type: 'card_conversion',
              message: `卡片 ${note.noteId} 的模板不可用`,
              ankiNoteId: note.noteId
            });
            continue;
          }

          // 🆕 获取模型信息
          const modelInfo = await this.ankiConnect.getModelInfo(note.modelName);
          
          // 🆕 使用AnkiImportAdapter进行转换（新架构）
          const card = await this.importAdapter.adaptAnkiNote(
            note,
            template,
            modelInfo,
            targetTuankiDeckId
          );
          
          importedCards.push(card);

          if ((i + 1) % 10 === 0 || i === notes.length - 1) {
            onProgress?.(
              40 + (i + 1) / notes.length * 40,
              100,
              `已转换 ${i + 1}/${notes.length} 张卡片`
            );
          }
        } catch (error: any) {
          skippedCards++;
          errors.push({
            type: 'card_conversion',
            message: `转换卡片失败: ${error.message}`,
            ankiNoteId: note.noteId
          });
        }
      }

      onProgress?.(80, 100, '正在保存到 Tuanki...');

      // 6. 批量保存卡片到 Tuanki
      if (importedCards.length > 0) {
        await this.saveCardsToTuanki(importedCards, targetTuankiDeckId);
      }

      // 🆕 7. 记录导入映射（新架构）
      onProgress?.(90, 100, '正在记录导入映射...');
      for (const card of importedCards) {
        const ankiOriginal = card.customFields?.ankiOriginal as any;
        if (ankiOriginal && ankiOriginal.noteId && card.uuid) {
          const contentHash = this.importAdapter.calculateContentHash(card.content || '');
          await this.mappingManager.recordMapping(
            card.id,
            ankiOriginal.noteId,
            card.uuid,
            contentHash,
            ankiOriginal.modelId,
            ankiOriginal.modelName
          );
        }
      }

      // 8. 生成并记录导入报告
      const importReport = {
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          totalCards: notes.length,
          importedCards: importedCards.length,
          skippedCards,
          importedTemplates: importedTemplates.length,
          errorCount: errors.length,
          backupId: backupId || undefined
        },
        details: {
          deckName,
          targetDeckId: targetTuankiDeckId,
          templates: importedTemplates.map(t => ({
            id: t.id,
            name: t.name,
            fields: t.fields?.length || 0
          })),
          errors: errors.map(e => ({
            type: e.type,
            message: e.message,
            cardId: e.ankiNoteId || e.templateName
          }))
        }
      };

      onProgress?.(100, 100, '导入完成！');

      console.log('📊 导入报告:', importReport);

      return {
        success: true,
        importedCards: importedCards.length,
        importedTemplates: importedTemplates.length,
        skippedCards,
        errors,
        templates: importedTemplates,
        cards: importedCards
      };
    } catch (error: any) {
      console.error('❌ 导入牌组失败:', error);
      
      // 🆕 导入失败，尝试回滚到最近的备份
      onProgress?.(0, 100, '导入失败，正在回滚...');
      if (backupId) {
        try {
          const restoredCards = await this.backupManager.restoreBackup(backupId);
          
          // 恢复卡片到牌组
          if (dataStorage) {
            await dataStorage.saveDeckCards(targetTuankiDeckId, restoredCards);
            console.log(`✓ 已回滚到备份: ${backupId}，恢复 ${restoredCards.length} 张卡片`);
          }
        } catch (rollbackError: any) {
          console.error('❌ 回滚失败:', rollbackError);
          errors.push({
            type: 'storage',
            message: `回滚失败: ${rollbackError.message}`
          });
        }
      }
      
      return {
        success: false,
        importedCards: importedCards.length,
        importedTemplates: importedTemplates.length,
        skippedCards,
        errors: [
          ...errors,
          {
            type: 'storage',
            message: `导入失败: ${error.message}`
          }
        ],
        templates: importedTemplates,
        cards: importedCards
      };
    }
  }

  /**
   * @deprecated 该方法已由AnkiImportAdapter.adaptAnkiNote替代
   * 保留仅用于兼容性，实际调用已被移除
   */
  async convertAnkiNoteToCard(
    ankiNote: AnkiNoteInfo,
    template: ParseTemplate,
    modelInfo: AnkiModelInfo,
    targetDeckId: string
  ): Promise<Card> {
    // 重定向到新的适配器
    return this.importAdapter.adaptAnkiNote(ankiNote, template, modelInfo, targetDeckId);
  }

  /**
   * 批量保存卡片到 Tuanki
   */
  async saveCardsToTuanki(cards: Card[], deckId: string): Promise<void> {
    const dataStorage = this.plugin.dataStorage;
    if (!dataStorage) {
      throw new Error('DataStorage 未初始化');
    }

    try {
      // ✅ 使用批量保存方法
      await dataStorage.saveDeckCards(deckId, cards);
      console.log(`✅ 成功保存 ${cards.length} 张卡片到牌组 ${deckId}`);
    } catch (error) {
      console.error(`❌ 保存卡片失败:`, error);
      throw error;
    }
  }

  /**
   * 保存模板到设置
   */
  private async saveTemplate(template: ParseTemplate): Promise<void> {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) {
      throw new Error('SimplifiedParsing 设置未初始化');
    }

    // 检查是否已存在
    const existingIndex = settings.templates.findIndex(t => t.id === template.id);
    
    if (existingIndex >= 0) {
      // 更新现有模板
      settings.templates[existingIndex] = template;
    } else {
      // 添加新模板
      settings.templates.push(template);
    }

    // 保存设置
    await this.plugin.saveSettings();
  }
}




