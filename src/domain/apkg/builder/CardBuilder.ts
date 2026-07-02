/**
 * 卡片构建器
 *
 * 负责将Anki笔记转换为Weave卡片格式
 *
 * @module domain/apkg/builder
 */

import type { Card } from "../../../data/types";
import { CardType } from "../../../data/types";
import { isImportAbortError, throwIfImportAborted, yieldImportTask } from "../ImportTaskControl";
import { APKGLogger } from "../../../infrastructure/logger/APKGLogger";
import { generateCardUUID } from "../../../services/identifier/WeaveIDGenerator";
// 导入 YAML 工具函数
import { createContentWithMetadata } from "../../../utils/yaml-utils";
import { ContentConverter } from "../converter/ContentConverter";
import type {
	AnkiModel,
	AnkiNote,
	CardBuildParams,
	CardBuildResult,
	ConversionConfig,
} from "../types";

/**
 * 卡片构建器
 */
export class CardBuilder {
	private logger: APKGLogger;
	private converter: ContentConverter;
	private currentConversionConfig?: ConversionConfig;

	constructor() {
		this.logger = new APKGLogger({ prefix: "[CardBuilder]" });
		this.converter = new ContentConverter();
	}

	/**
	 * 构建Weave卡片
	 *
	 * @param params - 构建参数
	 * @returns 构建结果
	 */
	build(params: CardBuildParams): CardBuildResult {
		const warnings: string[] = [];

		try {
			this.logger.debug(`构建卡片: 笔记${params.note.id}`);

			this.currentConversionConfig = params.conversionConfig;

			// 1. 解析字段值
			const fields = this.parseFields(params.note, params.model);

			// 2. 分类字段（按显示面）
			const { frontFields, backFields, bothFields } = this.classifyFields(
				fields,
				params.fieldSideMap
			);

			// 3. 转换内容为Markdown
			const frontContent = this.convertFields(frontFields, params.mediaPathMap);
			const backContent = this.convertFields(backFields, params.mediaPathMap);
			const bothContent = this.convertFields(bothFields, params.mediaPathMap);

			// 4. 组装卡片内容
			const content = this.assembleContent(frontContent, backContent, bothContent);

			// 5. 在 content 中写入 YAML 元数据
			// 解析标签和类型
			const tags = params.note.tags ? params.note.tags.split(" ").filter((t) => t.trim()) : [];
			const cardType = params.model.type === 1 ? "cloze" : "basic";

			const finalContent = this.buildContentWithMetadata(content, {
				deckName: params.deckName,
				cardType,
				tags,
			});

			// 6. 创建Card对象
			const card = this.createCard(
				finalContent,
				params.deckId,
				params.templateId,
				params.note,
				params.model,
				fields
			);

			this.logger.debug(`卡片构建成功: ${card.uuid}`);

			return {
				card,
				warnings,
				success: true,
			};
		} catch (error) {
			if (isImportAbortError(error)) {
				throw error;
			}
			this.logger.error("卡片构建失败", error);

			return {
				card: null,
				warnings: [`构建失败: ${(error as Error).message}`],
				success: false,
			};
		} finally {
			this.currentConversionConfig = undefined;
		}
	}

	/**
	 * 构建Weave卡片（异步、可取消）
	 *
	 * @param params - 构建参数
	 * @param options - 可选参数（信号）
	 * @returns 构建结果
	 */
	async buildAsync(
		params: CardBuildParams,
		options?: {
			signal?: AbortSignal;
		}
	): Promise<CardBuildResult> {
		const warnings: string[] = [];

		try {
			throwIfImportAborted(options?.signal);
			this.logger.debug(`构建卡片: 笔记${params.note.id}`);

			this.currentConversionConfig = params.conversionConfig;

			const fields = this.parseFields(params.note, params.model);
			const { frontFields, backFields, bothFields } = this.classifyFields(
				fields,
				params.fieldSideMap
			);

			const frontContent = await this.convertFieldsAsync(
				frontFields,
				params.mediaPathMap,
				options?.signal
			);
			const backContent = await this.convertFieldsAsync(
				backFields,
				params.mediaPathMap,
				options?.signal
			);
			const bothContent = await this.convertFieldsAsync(
				bothFields,
				params.mediaPathMap,
				options?.signal
			);

			throwIfImportAborted(options?.signal);
			const content = this.assembleContent(frontContent, backContent, bothContent);
			const tags = params.note.tags ? params.note.tags.split(" ").filter((t) => t.trim()) : [];
			const cardType = params.model.type === 1 ? "cloze" : "basic";

			const finalContent = this.buildContentWithMetadata(content, {
				deckName: params.deckName,
				cardType,
				tags,
			});
			const card = this.createCard(
				finalContent,
				params.deckId,
				params.templateId,
				params.note,
				params.model,
				fields
			);

			this.logger.debug(`卡片构建成功: ${card.uuid}`);

			return {
				card,
				warnings,
				success: true,
			};
		} catch (error) {
			if (isImportAbortError(error)) {
				throw error;
			}
			this.logger.error("卡片构建失败", error);

			return {
				card: null,
				warnings: [`构建失败: ${(error as Error).message}`],
				success: false,
			};
		} finally {
			this.currentConversionConfig = undefined;
		}
	}

	/**
	 * 解析字段值
	 */
	private parseFields(note: AnkiNote, model: AnkiModel): Record<string, string> {
		const fieldValues = note.flds.split("\x1f"); // Anki使用\x1f分隔字段
		const fields: Record<string, string> = {};

		for (const [index, field] of model.flds.entries()) {
			const value = fieldValues[index] || "";
			if (value.trim()) {
				fields[field.name] = value;
			}
		}

		return fields;
	}

	/**
	 * 分类字段
	 */
	private classifyFields(
		fields: Record<string, string>,
		sideMap: Record<string, "front" | "back" | "both">
	): {
		frontFields: Record<string, string>;
		backFields: Record<string, string>;
		bothFields: Record<string, string>;
	} {
		const frontFields: Record<string, string> = {};
		const backFields: Record<string, string> = {};
		const bothFields: Record<string, string> = {};

		for (const [name, value] of Object.entries(fields)) {
			const side = sideMap[name] || "both";

			if (side === "front") {
				frontFields[name] = value;
			} else if (side === "back") {
				backFields[name] = value;
			} else {
				bothFields[name] = value;
			}
		}

		return { frontFields, backFields, bothFields };
	}

	/**
	 * 转换字段内容
	 */
	private convertFields(
		fields: Record<string, string>,
		mediaPathMap: Map<string, string>
	): string[] {
		const converted: string[] = [];

		for (const value of Object.values(fields)) {
			if (this.currentConversionConfig?.preserveCardContentHtml) {
				converted.push(
					this.converter.convertRawHtml(value, mediaPathMap, this.currentConversionConfig)
				);
				continue;
			}

			// 转换HTML为Markdown
			const result = this.converter.convert(value, this.currentConversionConfig);

			// 替换媒体占位符
			const markdown = this.converter.replaceMediaPlaceholders(
				result.markdown,
				result.mediaRefs,
				mediaPathMap,
				this.currentConversionConfig
			);

			// 不添加字段名前缀，直接返回纯净内容
			// 字段名已保存在 customFields.ankiOriginal.fields 中
			converted.push(markdown);
		}

		return converted;
	}

	/**
	 * 转换字段内容（异步、可取消）
	 */
	private async convertFieldsAsync(
		fields: Record<string, string>,
		mediaPathMap: Map<string, string>,
		signal?: AbortSignal
	): Promise<string[]> {
		const converted: string[] = [];
		const entries = Object.entries(fields);

		for (let index = 0; index < entries.length; index++) {
			const [, value] = entries[index];
			throwIfImportAborted(signal);

			if (this.currentConversionConfig?.preserveCardContentHtml) {
				converted.push(
					await this.converter.convertRawHtmlAsync(
						value,
						mediaPathMap,
						this.currentConversionConfig,
						{ signal }
					)
				);
			} else {
				const result = await this.converter.convertAsync(value, this.currentConversionConfig, {
					signal,
				});

				const markdown = await this.converter.replaceMediaPlaceholdersAsync(
					result.markdown,
					result.mediaRefs,
					mediaPathMap,
					this.currentConversionConfig,
					{ signal }
				);

				converted.push(markdown);
			}

			if (index + 1 < entries.length) {
				await yieldImportTask(signal);
			}
		}

		return converted;
	}

	/**
	 * 构建带有 YAML 元数据的 content
	 *
	 * 将所有元数据写入 content YAML frontmatter
	 * - we_decks: 牌组名称
	 * - we_type: 卡片类型
	 * - tags: 标签列表
	 */
	private buildContentWithMetadata(
		bodyContent: string,
		options: {
			deckName?: string;
			cardType?: string;
			tags?: string[];
		}
	): string {
		const yamlMetadata: Record<string, string | string[]> = {};

		// 写入牌组名称
		if (options.deckName) {
			yamlMetadata.we_decks = [options.deckName];
		}

		// 写入卡片类型
		if (options.cardType) {
			yamlMetadata.we_type = options.cardType;
		}

		// 写入标签
		if (options.tags && options.tags.length > 0) {
			yamlMetadata.tags = options.tags;
		}

		// 如果没有任何元数据，直接返回原内容
		if (Object.keys(yamlMetadata).length === 0) {
			return bodyContent;
		}

		return createContentWithMetadata(yamlMetadata, bodyContent);
	}

	/**
	 * 组装卡片内容
	 *
	 * 只在正面和背面都有内容时添加分隔符，避免分隔符位置错误
	 */
	private assembleContent(
		frontFields: string[],
		backFields: string[],
		bothFields: string[]
	): string {
		const parts: string[] = [];

		// 收集正面内容
		const frontParts: string[] = [];
		if (frontFields.length > 0) {
			frontParts.push(frontFields.join("\n\n"));
		}
		// both字段显示在正面
		if (bothFields.length > 0) {
			frontParts.push(bothFields.join("\n\n"));
		}

		// 收集背面内容
		const backParts: string[] = [];
		if (backFields.length > 0) {
			backParts.push(backFields.join("\n\n"));
		}
		// both字段也显示在背面（如果正面没有内容）
		if (bothFields.length > 0 && frontFields.length === 0) {
			backParts.push(bothFields.join("\n\n"));
		}

		// 只在两边都有内容时添加分隔符
		if (frontParts.length > 0 && backParts.length > 0) {
			// 正常情况：正面 + 分隔符 + 背面
			parts.push(frontParts.join("\n\n"));
			parts.push("---div---");
			parts.push(backParts.join("\n\n"));
		} else if (frontParts.length > 0) {
			// 只有正面内容
			parts.push(frontParts.join("\n\n"));
		} else if (backParts.length > 0) {
			// 只有背面内容（不添加分隔符）
			parts.push(backParts.join("\n\n"));
		}
		// 如果两者都为空，返回空字符串

		return parts.join("\n\n").trim();
	}

	/**
	 * 创建Card对象
	 *
	 * 不再写入独立的 type 和 tags 字段
	 * 这些数据已经写入 content 的 YAML frontmatter
	 */
	private createCard(
		content: string,
		deckId: string,
		templateId: string | undefined,
		_note: AnkiNote,
		model: AnkiModel,
		_fields: Record<string, string>
	): Card {
		const now = Date.now();

		//  向后兼容：Card 接口仍要求 type 字段
		// 数据已写入 content YAML，此处设置是为了满足接口要求
		const cardType = model.type === 1 ? CardType.Cloze : CardType.Basic;

		// type 已写入 content YAML
		// 此处设置 type 仅为向后兼容，未来版本将移除
		return {
			uuid: generateCardUUID(),
			deckId,
			templateId: templateId || "unknown",
			content,
			type: cardType, //  向后兼容：接口必需字段，实际数据在 content YAML
			//  tags 不再写入独立字段，已迁移到 content YAML
			created: now.toString(),
			modified: now.toString(),
			// FSRS数据（初始化）
			fsrs: {
				state: 0, // New
				difficulty: 0,
				stability: 0,
				due: now.toString(),
				elapsedDays: 0,
				scheduledDays: 0,
				reps: 0,
				lapses: 0,
				lastReview: undefined, //  使用 undefined 而不是 null
				retrievability: 0,
			},
			reviewHistory: [],
			stats: {
				totalReviews: 0,
				totalTime: 0,
				averageTime: 0,
				memoryRate: 0,
			},
			// 不保留 Anki 原始数据
			// APKG 导入是一次性数据迁移，导入后完全归 Weave 管理
			customFields: {
				importedFrom: "apkg",
				importedAt: new Date().toISOString(),
			},
		};
	}
}
