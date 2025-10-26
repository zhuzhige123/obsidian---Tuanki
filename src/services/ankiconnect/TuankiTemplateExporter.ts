/**
 * Tuanki 模板导出器
 * 负责将 Tuanki 的 ParseTemplate 导出为 Anki 模板
 */

import type { AnkiModelInfo } from '../../types/ankiconnect-types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type AnkiPlugin from '../../main';
import { AnkiConnectClient } from './AnkiConnectClient';

export interface ExportResult {
  success: boolean;
  modelInfo?: AnkiModelInfo;
  error?: string;
}

export class TuankiTemplateExporter {
  private plugin: AnkiPlugin;
  private ankiConnect: AnkiConnectClient;

  // Tuanki 现代化卡片样式
  private readonly DEFAULT_CARD_CSS = `
/* === 基础样式 === */
.card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 18px;
  color: #2c3e50;
  background: #ffffff;
  padding: 30px 20px;
  line-height: 1.8;
  max-width: 700px;
  margin: 0 auto;
}

/* === 问题区域 === */
.question {
  font-size: 20px;
  font-weight: 600;
  color: #1a202c;
  margin-bottom: 24px;
  text-align: left;
  line-height: 1.6;
}

/* === 答案区域 === */
.answer {
  font-size: 17px;
  color: #374151;
  text-align: left;
  margin-top: 20px;
  padding: 20px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 4px solid #3b82f6;
}

/* === 选择题样式 - 现代扁平化田园风 === */
.options {
  margin: 24px 0;
  text-align: left;
  white-space: pre-line;
}

/* 普通选项 - 柔和米白色 */
.option-item {
  display: block;
  padding: 16px 20px;
  margin: 12px 0;
  background: #fafaf9;
  border-radius: 12px;
  font-size: 16px;
  line-height: 1.7;
  color: #57534e;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

/* 正确答案 - 清新绿色田园风 */
.option-correct {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  color: #14532d;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.15);
}

/* ✓ 标记样式 */
.check-mark {
  display: inline-block;
  margin-right: 10px;
  color: #22c55e;
  font-weight: 600;
  font-size: 18px;
}

/* === 挖空样式 === */
.cloze {
  color: #2563eb;
  font-weight: 600;
  background: #dbeafe;
  padding: 2px 6px;
  border-radius: 4px;
}

/* === 回链样式 === */
.obsidian-link {
  display: inline-block;
  margin-top: 20px;
  padding: 8px 16px;
  font-size: 13px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.2s;
  border: 1px solid #e2e8f0;
}

.obsidian-link:hover {
  background: #e2e8f0;
  color: #475569;
  transform: translateY(-1px);
}

.obsidian-link::before {
  content: "📝 ";
}

/* === 提示和额外信息 === */
.hint {
  margin: 16px 0;
  padding: 12px 16px;
  background: #fef3c7;
  border-left: 3px solid #f59e0b;
  border-radius: 6px;
  font-size: 15px;
  color: #92400e;
}

.hint::before {
  content: "💡 提示: ";
  font-weight: 600;
}

/* === 移除多余分隔线 === */
hr {
  display: none;
}

/* === 夜间模式适配 === */
.night_mode .card {
  background: #1e293b;
  color: #e2e8f0;
}

.night_mode .question {
  color: #f1f5f9;
}

.night_mode .answer {
  background: #334155;
  border-left-color: #60a5fa;
  color: #e2e8f0;
}

.night_mode .option-item {
  background: #334155;
  color: #e2e8f0;
}

.night_mode .option-item:hover {
  background: #475569;
}

.night_mode .option-correct {
  background: #064e3b;
  border-color: #10b981;
}
`.trim();

  constructor(plugin: AnkiPlugin, ankiConnect: AnkiConnectClient) {
    this.plugin = plugin;
    this.ankiConnect = ankiConnect;
  }

  /**
   * 在 Anki 中创建模板（如果不存在）
   */
  async createAnkiModel(template: ParseTemplate): Promise<ExportResult> {
    try {
      // 生成 Anki 模型名称
      const modelName = this.generateAnkiModelName(template);

      // 检查模型是否已存在
      const exists = await this.checkModelExists(modelName);
      if (exists) {
        console.log(`模型 ${modelName} 已存在，跳过创建`);
        return {
          success: true,
          modelInfo: await this.ankiConnect.getModelInfo(modelName)
        };
      }

      // 生成字段列表
      const fields = this.generateModelFields(template);

      // 生成卡片模板
      const cardTemplates = this.generateCardTemplates(template);

      // 调用 AnkiConnect API 创建模型
      const modelData = {
        modelName: modelName,
        inOrderFields: fields,
        css: this.DEFAULT_CARD_CSS,
        cardTemplates: cardTemplates
      };

      console.log('创建 Anki 模型:', modelData);

      // 使用AnkiConnect API创建模型
      await (this.ankiConnect as any).invoke('createModel', modelData);

      // 获取创建后的模型信息
      const modelInfo = await this.ankiConnect.getModelInfo(modelName);

      return {
        success: true,
        modelInfo: modelInfo
      };
    } catch (error: any) {
      console.error('创建 Anki 模型失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 检查模型是否存在
   */
  async checkModelExists(modelName: string): Promise<boolean> {
    try {
      const modelNames = await this.ankiConnect.getModelNames();
      return modelNames.includes(modelName);
    } catch (error) {
      console.error('检查模型是否存在失败:', error);
      return false;
    }
  }

  /**
   * 检查模板是否已有对应的 Anki 模型
   */
  async ensureAnkiModel(template: ParseTemplate): Promise<AnkiModelInfo> {
    // 如果已经有映射，尝试使用现有模型
    if (template.syncCapability?.ankiModelMapping) {
      const modelName = template.syncCapability.ankiModelMapping.modelName;
      try {
        return await this.ankiConnect.getModelInfo(modelName);
      } catch (error) {
        console.warn(`无法找到映射的模型 ${modelName}，将创建新模型`);
      }
    }

    // 创建新模型
    const result = await this.createAnkiModel(template);
    if (!result.success || !result.modelInfo) {
      throw new Error(`创建 Anki 模型失败: ${result.error}`);
    }

    return result.modelInfo;
  }

  /**
   * 生成 Anki 模型名称
   */
  generateAnkiModelName(template: ParseTemplate): string {
    // 移除 "[来自Anki]" 前缀（如果存在）
    let baseName = template.name.replace(/^\[来自Anki\]\s*/, '');
    
    // 添加 Tuanki 前缀
    return `[Tuanki] ${baseName}`;
  }

  /**
   * 生成模型字段列表
   */
  generateModelFields(template: ParseTemplate): string[] {
    const fields: string[] = [];

    // 从模板字段生成
    if (template.fields && template.fields.length > 0) {
      for (const field of template.fields) {
        // 使用字段的模式（pattern）作为 Anki 字段名
        // 如果模式是 Anki 字段名，直接使用；否则使用字段名
        const fieldName = field.pattern || field.name;
        if (!fields.includes(fieldName)) {
          fields.push(fieldName);
        }
      }
    } else {
      // 默认字段
      fields.push('question', 'answer');
    }

    // 添加额外字段用于追踪
    fields.push('tuanki_template_id');
    fields.push('tuanki_card_id');

    return fields;
  }

  /**
   * 生成卡片模板
   */
  generateCardTemplates(template: ParseTemplate): Array<{
    Name: string;
    Front: string;
    Back: string;
  }> {
    const fields = template.fields || [];
    const cardType = (template as any).cardType || 'basic-qa';

    let frontTemplate = '';
    let backTemplate = '';

    if (cardType === 'cloze-deletion') {
      // 挖空卡片
      const textField = this.findFieldByType(fields, 'text') || 'text';
      
      frontTemplate = `<div class="cloze">{{cloze:${textField}}}</div>`;
      backTemplate = `<div class="cloze">{{cloze:${textField}}}</div>`;
      
    } else if (cardType === 'multiple-choice') {
      // 选择题 - options字段已在导出时转换为HTML
      const frontField = this.findFieldByType(fields, 'front') || 'front';
      const optionsField = this.findFieldByType(fields, 'options') || 'options';
      const backField = this.findFieldByType(fields, 'back') || 'back';

      // 正面：问题 + 选项（HTML格式）
      frontTemplate = `
<div class="question">{{${frontField}}}</div>
<div class="options">{{${optionsField}}}</div>
      `.trim();

      // 背面：问题 + 选项 + 解析
      backTemplate = `
<div class="question">{{${frontField}}}</div>
<div class="options">{{${optionsField}}}</div>
<div class="answer">{{${backField}}}</div>
      `.trim();
      
    } else {
      // 基础问答题 - 简洁设计
      const frontField = this.findFieldByType(fields, 'front') || fields[0]?.pattern || 'front';
      const backField = this.findFieldByType(fields, 'back') || fields[1]?.pattern || 'back';

      frontTemplate = `<div class="question">{{${frontField}}}</div>`;
      backTemplate = `
<div class="question">{{${frontField}}}</div>
<div class="answer">{{${backField}}}</div>
      `.trim();
    }

    return [
      {
        Name: 'Card 1',
        Front: frontTemplate,
        Back: backTemplate
      }
    ];
  }

  /**
   * 根据类型查找字段
   */
  private findFieldByType(
    fields: Array<{ name: string; pattern: string }>,
    type: string
  ): string | null {
    const field = fields.find(f => f.name.toLowerCase() === type.toLowerCase());
    return field ? (field.pattern || field.name) : null;
  }

  /**
   * 获取或创建 Anki 模型 ID
   */
  async getOrCreateModelId(template: ParseTemplate): Promise<number> {
    const modelInfo = await this.ensureAnkiModel(template);
    return modelInfo.id;
  }
}




