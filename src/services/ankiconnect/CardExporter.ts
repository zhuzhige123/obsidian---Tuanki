/**
 * 卡片导出器
 * 负责将 Tuanki 卡片导出到 Anki
 */

import type { AnkiNoteInfo, AnkiModelInfo, ExportResult, ExportError } from '../../types/ankiconnect-types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type { Card } from '../../data/types';
import type AnkiPlugin from '../../main';
import { AnkiConnectClient } from './AnkiConnectClient';
import { TuankiTemplateExporter } from './TuankiTemplateExporter';
import { ObsidianToAnkiConverter } from './ObsidianToAnkiConverter';
import type { ObsidianToAnkiOptions } from '../../types/ankiconnect-types';
import { OFFICIAL_TEMPLATES } from '../../constants/official-templates';

/**
 * 字段别名映射表
 * 用于智能匹配卡片字段名与模板字段名
 */
const FIELD_ALIASES: Record<string, string[]> = {
  'front': ['question', 'Front', 'Q', '问题', '题目', 'Question'],
  'back': ['answer', 'Back', 'A', '答案', '解答', 'Answer'],
  'options': ['choices', 'Choices', 'Options', '选项'],
  'correctAnswers': ['correctanswers', 'CorrectAnswers', '正确答案'],
  'text': ['content', 'Content', '内容', 'Text'],
  'cloze': ['Cloze', '挖空'],
  'hint': ['Hint', 'Extra', '提示', '额外']
};

export class CardExporter {
  private plugin: AnkiPlugin;
  private ankiConnect: AnkiConnectClient;
  private templateExporter: TuankiTemplateExporter;
  private converter: ObsidianToAnkiConverter;

  constructor(
    plugin: AnkiPlugin,
    ankiConnect: AnkiConnectClient,
    templateExporter: TuankiTemplateExporter
  ) {
    this.plugin = plugin;
    this.ankiConnect = ankiConnect;
    this.templateExporter = templateExporter;
    this.converter = new ObsidianToAnkiConverter(plugin.app, ankiConnect);
  }

  /**
   * 导出整个牌组
   */
  async exportDeck(
    tuankiDeckId: string,
    ankiDeckName: string,
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<ExportResult> {
    console.log('📤 开始导出牌组:', tuankiDeckId, '→', ankiDeckName);

    const errors: ExportError[] = [];
    let exportedCards = 0;
    let skippedCards = 0;
    let createdModels = 0;

    try {
      // 1. 获取 Tuanki 牌组的所有卡片
      onProgress?.(0, 100, '正在读取 Tuanki 牌组...');
      const cards = await this.getTuankiDeckCards(tuankiDeckId);

      console.log('📊 找到', cards.length, '张卡片');

      if (cards.length === 0) {
        console.log('✅ 牌组为空，无需导出');
        return {
          success: true,
          exportedCards: 0,
          createdModels: 0,
          skippedCards: 0,
          errors: []
        };
      }

      onProgress?.(10, 100, `找到 ${cards.length} 张卡片`);

      // 2. 按模板分组
      const cardsByTemplate = this.groupCardsByTemplate(cards);
      const templates = Array.from(cardsByTemplate.keys());

      console.log('📋 卡片分属', templates.length, '个模板');

      onProgress?.(20, 100, '正在准备 Anki 模板...');

      // 3. 确保所有模板在 Anki 中存在
      const templateModelMap = new Map<string, AnkiModelInfo>();
      
      for (let i = 0; i < templates.length; i++) {
        const templateId = templates[i];
        console.log('🔧 准备模板', i + 1, '/', templates.length, ':', templateId);

        const template = this.getTemplateById(templateId);
        
        if (!template) {
          errors.push({
            type: 'model_creation',
            message: `找不到模板 ID: ${templateId}`,
            templateId
          });
          continue;
        }

        try {
          const modelInfo = await this.ensureAnkiModel(template);
          templateModelMap.set(templateId, modelInfo);
          
          console.log('✓ 模板就绪:', modelInfo.name);

          // 如果是新创建的模型
          if (modelInfo && !template.syncCapability?.ankiModelMapping) {
            createdModels++;
          }

          onProgress?.(
            20 + (i + 1) / templates.length * 20,
            100,
            `已准备模板 ${i + 1}/${templates.length}`
          );
        } catch (error: any) {
          errors.push({
            type: 'model_creation',
            message: `创建/获取模板失败: ${error.message}`,
            templateId
          });
        }
      }

      onProgress?.(40, 100, '正在导出卡片...');

      // 4. 转换并上传卡片
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];

        // 每10张卡片输出一次进度
        if (i % 10 === 0 || i === cards.length - 1) {
          console.log('📤 上传进度:', i + 1, '/', cards.length);
        }

        try {
          const template = this.getTemplateById(card.templateId || '');
          if (!template) {
            skippedCards++;
            errors.push({
              type: 'note_creation',
              message: `卡片 ${card.id} 的模板不可用`,
              cardId: card.id
            });
            continue;
          }

          const modelInfo = templateModelMap.get(card.templateId || '');
          if (!modelInfo) {
            skippedCards++;
            errors.push({
              type: 'note_creation',
              message: `卡片 ${card.id} 的 Anki 模型不可用`,
              cardId: card.id
            });
            continue;
          }

          await this.convertAndUploadCard(card, template, modelInfo, ankiDeckName);
          exportedCards++;

          if ((i + 1) % 10 === 0 || i === cards.length - 1) {
            onProgress?.(
              40 + (i + 1) / cards.length * 60,
              100,
              `已导出 ${exportedCards}/${cards.length} 张卡片`
            );
          }
        } catch (error: any) {
          skippedCards++;
          errors.push({
            type: 'upload',
            message: `上传卡片失败: ${error.message}`,
            cardId: card.id
          });
        }
      }

      onProgress?.(100, 100, '导出完成！');

      console.log('✅ 导出完成 ━', '成功:', exportedCards, '跳过:', skippedCards, '错误:', errors.length);

      return {
        success: true,
        exportedCards,
        createdModels,
        skippedCards,
        errors
      };
    } catch (error: any) {
      console.error('导出牌组失败:', error);
      return {
        success: false,
        exportedCards,
        createdModels,
        skippedCards,
        errors: [
          ...errors,
          {
            type: 'upload',
            message: `导出失败: ${error.message}`
          }
        ]
      };
    }
  }

  /**
   * 确保模板在 Anki 中存在
   */
  async ensureAnkiModel(template: ParseTemplate): Promise<AnkiModelInfo> {
    return await this.templateExporter.ensureAnkiModel(template);
  }

  /**
   * 转换并上传单张卡片
   */
  private async convertAndUploadCard(
    card: Card,
    template: ParseTemplate,
    modelInfo: AnkiModelInfo,
    deckName: string
  ): Promise<void> {
    // 转换为 Anki Note
    const ankiNote = await this.convertCardToAnkiNote(card, template, modelInfo);

    // 上传到 Anki
    await this.uploadNoteToAnki(ankiNote, deckName);
  }

  /**
   * 转换 Tuanki Card 为 Anki Note
   */
  async convertCardToAnkiNote(
    card: Card,
    template: ParseTemplate,
    modelInfo: AnkiModelInfo
  ): Promise<Partial<AnkiNoteInfo>> {
    console.log('🔍 转换卡片', card.id, '使用模板', template.name);

    // 🆕 准备转换选项
    const conversionOptions: ObsidianToAnkiOptions = {
      vaultName: this.plugin.app.vault.getName(),
      uploadMedia: true,
      generateBacklinks: true,
      backlinkPosition: 'append',  // 追加到字段末尾
      mediaPosition: 'inline',
      formatConversion: {
        enabled: true,
        mathConversion: {
          enabled: true,
          targetFormat: 'latex-parens',  // 转换为 \(...\) 格式
          detectCurrencySymbol: true
        },
        wikiLinkConversion: {
          enabled: true,
          mode: 'obsidian-link'  // 转换为 Obsidian 协议链接
        },
        calloutConversion: {
          enabled: true,
          injectStyles: false  // 使用内联样式，无需注入
        },
        highlightConversion: {
          enabled: true
        }
      }
    };

    const fields: Record<string, string> = {};

    // 填充字段
    const templateFields = template.fields || [];
    
    for (const templateField of templateFields) {
      const fieldName = templateField.pattern || templateField.name;
      let fieldValue = '';
      let matchedKey = '';

      // 生成可能的字段名列表
      const possibleKeys: string[] = [];
      
      // 1. 添加基本字段名
      if (templateField.name) possibleKeys.push(templateField.name);
      if (templateField.pattern) possibleKeys.push(templateField.pattern);
      if (fieldName) possibleKeys.push(fieldName);
      
      // 2. 添加首字母大写形式
      if (templateField.name) {
        const capitalized = templateField.name.charAt(0).toUpperCase() + templateField.name.slice(1);
        possibleKeys.push(capitalized);
      }
      
      // 3. 添加别名
      if (FIELD_ALIASES[templateField.name]) {
        possibleKeys.push(...FIELD_ALIASES[templateField.name]);
      }
      
      // 去重
      const uniqueKeys = [...new Set(possibleKeys)];

      // 在 card.fields 中查找匹配的字段
      if (card.fields) {
        for (const key of uniqueKeys) {
          if (card.fields[key] && card.fields[key].trim() !== '') {
            fieldValue = card.fields[key];
            matchedKey = key;
            console.log(`  ✓ 字段匹配: "${fieldName}" ← "${matchedKey}" = "${fieldValue.slice(0, 30)}${fieldValue.length > 30 ? '...' : ''}"`);
            break;
          }
        }
      }

      // 如果未找到匹配，输出警告
      if (!fieldValue) {
        console.warn(`  ⚠️ 字段未匹配: "${fieldName}"`);
        console.warn(`     尝试了: ${uniqueKeys.join(', ')}`);
        console.warn(`     可用字段: ${Object.keys(card.fields || {}).join(', ')}`);
      }

      // 🆕 转换内容（媒体文件 + 回链）
      if (fieldValue && fieldValue.trim()) {
        try {
          // 🔥 特殊处理：options字段转换为HTML
          if (templateField.name === 'options') {
            fieldValue = this.formatOptionsToHTML(fieldValue);
          } else {
            // 🔥 只在back字段添加回链，其他字段不添加
            const isBackField = ['back', 'Back', 'answer', 'Answer'].includes(templateField.name);
            const fieldConversionOptions = {
              ...conversionOptions,
              generateBacklinks: isBackField  // 只有back字段才生成回链
            };
            
            const conversionResult = await this.converter.convertContent(
              fieldValue,
              card,
              fieldConversionOptions
            );
            
            fieldValue = conversionResult.convertedContent;
            
            // 输出转换信息
            if (conversionResult.mediaFiles.length > 0 || conversionResult.backlinks.length > 0) {
              console.log(`  🔄 转换字段 "${fieldName}":`, {
                媒体文件: conversionResult.mediaFiles.length,
                回链: conversionResult.backlinks.length,
                警告: conversionResult.warnings.length
              });
            }
          }
        } catch (error) {
          console.error(`  ❌ 转换字段失败 "${fieldName}":`, error);
          // 转换失败时保留原始内容
        }
      }

      fields[fieldName] = fieldValue;
    }

    // 填充追踪字段
    if (modelInfo.fields.includes('tuanki_template_id')) {
      fields['tuanki_template_id'] = template.id;
    }
    if (modelInfo.fields.includes('tuanki_card_id')) {
      fields['tuanki_card_id'] = card.id;
    }

    return {
      modelName: modelInfo.name,
      fields: fields,
      tags: card.tags || []
    };
  }

  /**
   * 上传 Note 到 Anki
   */
  async uploadNoteToAnki(
    note: Partial<AnkiNoteInfo>,
    deckName: string
  ): Promise<number> {
    try {
      const ankiNote = {
        deckName: deckName,
        modelName: note.modelName || '',
        fields: note.fields || {},
        tags: note.tags || [],
        options: {
          allowDuplicate: false,
          duplicateScope: 'deck'
        }
      };
      
      const noteId = await this.ankiConnect.addNote(ankiNote);

      return noteId;
    } catch (error: any) {
      // 检查是否是重复卡片错误
      if (error.message?.includes('duplicate')) {
        console.warn('⚠️ 卡片已存在于 Anki，跳过重复卡片:', {
          modelName: note.modelName,
          fields: note.fields,
          tags: note.tags
        });
        return -1; // 返回特殊值表示跳过
      }
      
      // 其他错误需要详细记录
      console.error('❌ 上传卡片到 Anki 失败:', {
        error: error.message,
        modelName: note.modelName,
        fields: note.fields
      });
      throw error;
    }
  }

  /**
   * 获取 Tuanki 牌组的所有卡片
   */
  private async getTuankiDeckCards(deckId: string): Promise<Card[]> {
    const dataStorage = this.plugin.dataStorage;
    if (!dataStorage) {
      throw new Error('DataStorage 未初始化');
    }

    return await dataStorage.getCardsByDeck(deckId);
  }

  /**
   * 按模板分组卡片
   */
  private groupCardsByTemplate(cards: Card[]): Map<string, Card[]> {
    const groups = new Map<string, Card[]>();

    for (const card of cards) {
      const templateId = card.templateId || 'default';
      if (!groups.has(templateId)) {
        groups.set(templateId, []);
      }
      groups.get(templateId)!.push(card);
    }

    return groups;
  }

  /**
   * 将options字段格式化为HTML（用于Anki显示）
   */
  private formatOptionsToHTML(optionsText: string): string {
    const lines = optionsText.split('\n').filter(line => line.trim());
    const htmlLines = lines.map(line => {
      const hasCorrectMark = line.includes('{✓}') || line.includes('{√}');
      const cleanLine = line.replace(/\{[✓√]\}/g, '').trim();
      
      if (hasCorrectMark) {
        // 正确答案：清新田园风格
        return `<div class="option-item option-correct"><span class="check-mark">✓</span>${cleanLine}</div>`;
      } else {
        // 普通选项：柔和米白色
        return `<div class="option-item">${cleanLine}</div>`;
      }
    });
    
    return htmlLines.join('\n');
  }

  /**
   * 根据 ID 获取模板
   * 先在官方模板中查找，再在用户模板中查找
   * 如果找不到，使用降级机制返回默认问答题模板
   */
  private getTemplateById(templateId: string): ParseTemplate | null {
    console.log('🔍 查找模板:', templateId);

    // 参数验证：如果模板ID为空，使用默认问答题模板
    if (!templateId || templateId.trim() === '') {
      console.warn('⚠️ 模板ID为空，降级使用官方问答题模板');
      const defaultTemplate = OFFICIAL_TEMPLATES.find(t => t.id === 'official-qa');
      return defaultTemplate ? { ...defaultTemplate } : null;
    }

    // 1. 先在官方模板中查找
    const officialTemplate = OFFICIAL_TEMPLATES.find(t => t.id === templateId);
    if (officialTemplate) {
      console.log('✓ 找到官方模板:', officialTemplate.name, `(${officialTemplate.id})`);
      // 返回深拷贝，避免修改原始定义
      return { ...officialTemplate };
    }

    // 2. 再在用户模板中查找（外部导入的模板）
    const settings = this.plugin.settings.simplifiedParsing;
    if (settings) {
      const userTemplate = settings.templates.find(t => t.id === templateId);
      if (userTemplate) {
        console.log('✓ 找到用户模板:', userTemplate.name, `(${userTemplate.id})`);
        return userTemplate;
      }
    }

    // 3. 降级机制：找不到时使用官方问答题模板
    const availableOfficial = OFFICIAL_TEMPLATES.map(t => t.id);
    const availableUser = settings?.templates.map(t => t.id) || [];
    
    console.warn('⚠️ 模板不存在:', templateId);
    console.warn('   可用的官方模板:', availableOfficial.join(', '));
    if (availableUser.length > 0) {
      console.warn('   可用的用户模板:', availableUser.join(', '));
    }
    console.warn('   降级使用官方问答题模板 (official-qa)');

    // 返回默认问答题模板
    const defaultTemplate = OFFICIAL_TEMPLATES.find(t => t.id === 'official-qa');
    return defaultTemplate ? { ...defaultTemplate } : null;
  }
}


