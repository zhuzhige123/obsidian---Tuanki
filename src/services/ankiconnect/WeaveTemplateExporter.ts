import { logger } from "../../utils/logger";
/**
 * Weave 模板导出器
 * 负责将 Weave 的 ParseTemplate 导出为 Anki 模板
 */

import type { WeavePlugin } from "../../main";
import type { AnkiModelInfo } from "../../types/ankiconnect-types";
import { AnkiConnectClient } from "./AnkiConnectClient";
import { type WeaveNativeTemplate, getNativeTemplateByCardType } from "./WeaveNativeTemplates";

export interface ExportResult {
	success: boolean;
	modelInfo?: AnkiModelInfo;
	error?: string;
}

export class WeaveTemplateExporter {
	private plugin: WeavePlugin;
	private ankiConnect: AnkiConnectClient;

	// Weave 现代化卡片样式
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
  border: 1px solid #e2e8f0;
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
  background: #ecfdf3;
  color: #14532d;
  font-weight: 500;
  border: 1px solid #d1fae5;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.1);
}

/*  标记样式 */
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 0;
  color: #475569;
  background: #f8fafc;
  border-radius: 999px;
  text-decoration: none;
  transition: all 0.2s;
  border: 1px solid #d8dee9;
  box-sizing: border-box;
}

.obsidian-link:hover {
  background: #eef2f7;
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

	constructor(plugin: WeavePlugin, ankiConnect: AnkiConnectClient) {
		this.plugin = plugin;
		this.ankiConnect = ankiConnect;
	}

	/**
	 * 🆕 创建原生模板
	 */
	async createNativeModel(nativeTemplate: WeaveNativeTemplate): Promise<ExportResult> {
		try {
			const modelName = nativeTemplate.name;

			// 检查模型是否已存在
			const exists = await this.checkModelExists(modelName);
			if (exists) {
				logger.debug(`原生模板 ${modelName} 已存在，跳过创建`);
				return {
					success: true,
					modelInfo: await this.ankiConnect.getModelInfo(modelName),
				};
			}

			// 调用 AnkiConnect API 创建模型
			const modelData = {
				modelName: modelName,
				inOrderFields: nativeTemplate.fields,
				css: nativeTemplate.css,
				isCloze: nativeTemplate.cardType === "cloze",
				cardTemplates: [
					{
						Name: "Card 1",
						Front: nativeTemplate.frontTemplate,
						Back: nativeTemplate.backTemplate,
					},
				],
			};

			logger.debug("创建原生 Anki 模板:", modelData);

			// 使用AnkiConnect API创建模型
			await this.ankiConnect.createModel(modelData);

			// 获取创建后的模型信息
			const modelInfo = await this.ankiConnect.getModelInfo(modelName);

			logger.debug(`✅ 原生模板创建成功: ${modelName}`);

			return {
				success: true,
				modelInfo: modelInfo,
			};
		} catch (error) {
			logger.error("创建原生 Anki 模板失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
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
			logger.error("检查模型是否存在失败:", error);
			return false;
		}
	}

	/**
	 * 🆕 基于卡片类型确保原生模板存在
	 */
	async ensureNativeModelByCardType(cardType: string): Promise<AnkiModelInfo> {
		// 获取对应的原生模板定义
		const nativeTemplate = getNativeTemplateByCardType(cardType);
		if (!nativeTemplate) {
			throw new Error(`未找到卡片类型 ${cardType} 对应的原生模板`);
		}

		// 检查模板是否已存在
		try {
			const existingModel = await this.ankiConnect.getModelInfo(nativeTemplate.name);
			const updatedModel = await this.syncExistingNativeModel(existingModel, nativeTemplate);
			logger.debug(`✅ 使用现有原生模板: ${nativeTemplate.name}`);
			return updatedModel;
		} catch {
			logger.debug(`📦 创建原生模板: ${nativeTemplate.name}`);
		}

		// 创建新的原生模板
		const result = await this.createNativeModel(nativeTemplate);
		if (!result.success || !result.modelInfo) {
			throw new Error(`创建原生模板失败: ${result.error}`);
		}

		return result.modelInfo;
	}

	private async syncExistingNativeModel(
		existingModel: AnkiModelInfo,
		nativeTemplate: WeaveNativeTemplate
	): Promise<AnkiModelInfo> {
		const primaryTemplateName = existingModel.templates[0]?.Name || "Card 1";
		const existingFront = existingModel.templates[0]?.Front || "";
		const existingBack = existingModel.templates[0]?.Back || "";
		const hasTemplateChanges =
			existingFront !== nativeTemplate.frontTemplate ||
			existingBack !== nativeTemplate.backTemplate;
		const hasStylingChanges = (existingModel.css || "") !== nativeTemplate.css;

		if (hasTemplateChanges) {
			logger.debug(`🔄 更新原生模板卡面: ${nativeTemplate.name}`);
			await this.ankiConnect.updateModelTemplates(nativeTemplate.name, {
				[primaryTemplateName]: {
					Front: nativeTemplate.frontTemplate,
					Back: nativeTemplate.backTemplate,
				},
			});
		}

		if (hasStylingChanges) {
			logger.debug(`🎨 更新原生模板样式: ${nativeTemplate.name}`);
			await this.ankiConnect.updateModelStyling(nativeTemplate.name, nativeTemplate.css);
		}

		if (!hasTemplateChanges && !hasStylingChanges) {
			return existingModel;
		}

		return this.ankiConnect.getModelInfo(nativeTemplate.name);
	}
}
