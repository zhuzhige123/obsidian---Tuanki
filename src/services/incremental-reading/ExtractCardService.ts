/**
 * 摘录卡片服务
 *
 * 负责从阅读材料中提取内容创建卡片，并管理牌组层级关联
 *
 * @module services/incremental-reading/ExtractCardService
 * @version 1.0.0
 */

import type { App, Editor, TFile } from "obsidian";
import type { Card, Deck } from "../../data/types";
import type { ReadingMaterial } from "../../types/incremental-reading-types";
import type { CreateCardOptions } from "../../types/modal-types";
import { logger } from "../../utils/logger";
import { detectTraceSourceKind, normalizeTraceDocumentKey } from "./IRSourceTraceStats";
import type { ReadingMaterialManager } from "./ReadingMaterialManager";
import type { ReadingSessionManager } from "./ReadingSessionManager";

/**
 * 提取卡片选项
 */
export interface ExtractCardOptions {
	/** 选中的文本内容 */
	selectedText: string;
	/** 源文件 */
	file: TFile;
	/** 旧导入/复制兼容目录（可选） */
	importFolder?: string;
	/** 编辑器实例（用于获取光标位置） */
	editor?: Editor;
	/** 目标牌组ID（可选，默认使用材料关联的Reading Deck） */
	targetDeckId?: string;
	/** 卡片类型 */
	cardType?: "basic" | "cloze";
	/** 额外标签（预留，暂未使用） */
	tags?: string[];
}

type _AppType = App;

/**
 * 提取卡片结果
 */
export interface ExtractCardResult {
	/** 是否成功 */
	success: boolean;
	/** 创建的卡片（如果成功） */
	card?: Card;
	/** 关联的阅读材料 */
	material?: ReadingMaterial;
	/** 错误信息 */
	error?: string;
}

/**
 * 牌组层级信息
 */
export interface DeckHierarchy {
	/** Reading Deck（父牌组） */
	readingDeck: Deck;
	/** QA Deck（子牌组） */
	qaDeck?: Deck;
}

/**
 * 摘录卡片服务
 */
export class ExtractCardService {
	private app: App;
	private materialManager: ReadingMaterialManager;
	private sessionManager: ReadingSessionManager;

	/** 打开创建卡片模态窗的回调 */
	private openCreateCardModal?: (options: CreateCardOptions) => Promise<void>;

	/** 获取牌组的回调 */
	private getDeck?: (deckId: string) => Promise<Deck | null>;

	/** 创建牌组的回调 */
	private createDeck?: (deck: Partial<Deck>) => Promise<Deck>;

	/** 更新牌组的回调 */
	private updateDeck?: (deck: Deck) => Promise<void>;

	constructor(
		app: App,
		materialManager: ReadingMaterialManager,
		sessionManager: ReadingSessionManager
	) {
		this.app = app;
		this.materialManager = materialManager;
		this.sessionManager = sessionManager;
	}

	private async isIRFile(file: TFile): Promise<boolean> {
		try {
			const cache = this.app.metadataCache.getFileCache(file);
			const fmType = cache?.frontmatter?.weave_type;
			if (typeof fmType === "string" && fmType.startsWith("ir-")) {
				return true;
			}
		} catch {
			// ignore
		}

		try {
			const content = await this.app.vault.read(file);
			const match = content.match(/\bweave_type\s*:\s*([^\n\r]+)/);
			if (match?.[1]) {
				const t = match[1].trim().replace(/^['"]|['"]$/g, "");
				return t.startsWith("ir-");
			}
		} catch {
			// ignore
		}

		return false;
	}

	private hashToBase36(input: string): string {
		let hash = 5381;
		for (let i = 0; i < input.length; i++) {
			hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
		}
		return (hash >>> 0).toString(36);
	}

	async ensureReadingDeckForIR(deckPath: string, deckName: string): Promise<Deck> {
		if (!this.getDeck || !this.createDeck) {
			throw new Error("牌组管理功能未初始化");
		}

		const deckId = `ir_reading_${this.hashToBase36(deckPath)}`;
		const existing = await this.getDeck(deckId);
		if (existing) return existing;

		const name = `IR-${deckName || deckPath.split("/").pop() || deckPath}`;
		return await this.createDeck({ id: deckId, name });
	}

	/**
	 * 设置插件回调函数
	 */
	setCallbacks(callbacks: {
		openCreateCardModal: (options: CreateCardOptions) => Promise<void>;
		getDeck: (deckId: string) => Promise<Deck | null>;
		createDeck: (deck: Partial<Deck>) => Promise<Deck>;
		updateDeck: (deck: Deck) => Promise<void>;
	}): void {
		this.openCreateCardModal = callbacks.openCreateCardModal;
		this.getDeck = callbacks.getDeck;
		this.createDeck = callbacks.createDeck;
		this.updateDeck = callbacks.updateDeck;
	}

	// ===== 提取卡片 =====

	/**
	 * 从选中文本提取卡片
	 * 调用插件现有的 openCreateCardModal 方法
	 */
	async extractToCard(options: ExtractCardOptions): Promise<ExtractCardResult> {
		const { selectedText, file, importFolder, editor, targetDeckId, cardType, tags } = options;

		if (!selectedText.trim()) {
			return {
				success: false,
				error: "没有选中任何文本",
			};
		}

		if (!this.openCreateCardModal) {
			return {
				success: false,
				error: "卡片创建功能未初始化",
			};
		}

		try {
			const sourceKind = detectTraceSourceKind(file.path);
			const sourceDocumentKey = normalizeTraceDocumentKey(file.path, sourceKind) || undefined;
			if (await this.isIRFile(file)) {
				const sourceInfo = this.getSourceInfo(file, editor);
				const formattedContent = this.formatExtractContent(selectedText, cardType);
				const createOptions: CreateCardOptions = {
					initialContent: formattedContent,
					sourceInfo: {
						file: file.path,
						blockId: sourceInfo.blockId,
						blockLink: sourceInfo.blockLink,
					},
					cardMetadata: {
						content: formattedContent,
						sourceFile: file.path,
						sourceDocumentKey,
						sourceKind,
						sourceBlock: sourceInfo.blockId,
						outputKind: "extract",
						targetDeckId: targetDeckId,
						deckId: targetDeckId,
					},
					onSuccess: async (card: Card) => {
						if (this.sessionManager.hasActiveSession()) {
							this.sessionManager.addCreatedCard(card.uuid);
						}
						logger.info(`[ExtractCardService] 卡片提取成功(IR): ${card.uuid} from ${file.path}`);
					},
				};

				await this.openCreateCardModal(createOptions);
				return { success: true };
			}

			// 1. 获取或创建阅读材料
			const material = await this.materialManager.getOrCreateMaterial(file, {
				source: "auto",
				importFolder,
			});

			// 2. 确保有关联的 Reading Deck
			let deckId = targetDeckId || material.readingDeckId;
			if (!deckId) {
				// 创建 Reading Deck
				const hierarchy = await this.ensureReadingDeck(material, file.basename);
				deckId = hierarchy.readingDeck.id;

				// 更新材料的牌组关联
				await this.materialManager.setReadingDeck(material.uuid, deckId);
			}

			// 3. 获取源位置信息
			const sourceInfo = this.getSourceInfo(file, editor);

			// 4. 格式化内容
			const formattedContent = this.formatExtractContent(selectedText, cardType);

			// 5. 准备创建卡片选项
			const createOptions: CreateCardOptions = {
				initialContent: formattedContent,
				sourceInfo: {
					file: file.path,
					blockId: sourceInfo.blockId,
					blockLink: sourceInfo.blockLink,
				},
				cardMetadata: {
					content: formattedContent,
					sourceFile: file.path,
					sourceDocumentKey,
					sourceKind,
					sourceBlock: sourceInfo.blockId,
					outputKind: "extract",
					targetDeckId: deckId,
					deckId: deckId,
				},
				onSuccess: async (card: Card) => {
					// 更新材料的提取卡片列表
					await this.materialManager.addExtractedCard(material.uuid, card.uuid);

					// 如果有活跃会话，添加到会话记录
					if (this.sessionManager.hasActiveSession()) {
						this.sessionManager.addCreatedCard(card.uuid);
					}

					logger.info(`[ExtractCardService] 卡片提取成功: ${card.uuid} from ${material.uuid}`);
				},
			};

			// 6. 打开创建卡片模态窗
			await this.openCreateCardModal(createOptions);

			return {
				success: true,
				material,
			};
		} catch (error) {
			logger.error("[ExtractCardService] 提取卡片失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "提取卡片失败",
			};
		}
	}

	// ===== 牌组层级管理 =====

	/**
	 * 确保阅读材料有关联的 Reading Deck
	 */
	async ensureReadingDeck(material: ReadingMaterial, defaultName?: string): Promise<DeckHierarchy> {
		if (!this.getDeck || !this.createDeck) {
			throw new Error("牌组管理功能未初始化");
		}

		// 检查是否已有关联的 Reading Deck
		if (material.readingDeckId) {
			const existingDeck = await this.getDeck(material.readingDeckId);
			if (existingDeck) {
				return { readingDeck: existingDeck };
			}
		}

		// 创建新的 Reading Deck
		const deckName = defaultName || material.title || "阅读材料";
		const materialTags = material.tags || [];
		const readingDeck = await this.createDeck({
			name: `[阅读] ${deckName}`,
			description: `从 ${material.filePath} 提取的卡片`,
			category: "reading",
			tags: ["incremental-reading", ...materialTags],
			metadata: {
				readingMaterialId: material.uuid,
				isReadingDeck: true,
			},
		});

		logger.info(`[ExtractCardService] 创建 Reading Deck: ${readingDeck.id} for ${material.uuid}`);

		return { readingDeck };
	}

	/**
	 * 创建 QA 子牌组（用于特定主题的卡片）
	 */
	async createQASubDeck(parentDeck: Deck, name: string, material: ReadingMaterial): Promise<Deck> {
		if (!this.createDeck || !this.updateDeck) {
			throw new Error("牌组管理功能未初始化");
		}

		// 创建子牌组
		const qaDeck = await this.createDeck({
			name: name,
			description: `${parentDeck.name} 的子牌组`,
			parentId: parentDeck.id,
			path: `${parentDeck.path}::${name}`,
			level: parentDeck.level + 1,
			category: parentDeck.category,
			tags: parentDeck.tags,
			metadata: {
				parentDeckId: parentDeck.id,
				readingMaterialId: material.uuid,
				isQADeck: true,
			},
		});

		// 更新父牌组的子牌组列表
		const childDeckIds = (parentDeck.metadata?.childDeckIds as string[]) || [];
		if (!childDeckIds.includes(qaDeck.id)) {
			childDeckIds.push(qaDeck.id);
			parentDeck.metadata = {
				...parentDeck.metadata,
				childDeckIds,
			};
			await this.updateDeck(parentDeck);
		}

		logger.info(`[ExtractCardService] 创建 QA 子牌组: ${qaDeck.id} under ${parentDeck.id}`);

		return qaDeck;
	}

	/**
	 * 获取牌组层级结构
	 */
	async getDeckHierarchy(material: ReadingMaterial): Promise<DeckHierarchy | null> {
		if (!this.getDeck || !material.readingDeckId) {
			return null;
		}

		const readingDeck = await this.getDeck(material.readingDeckId);
		if (!readingDeck) {
			return null;
		}

		return { readingDeck };
	}

	/**
	 * 验证牌组层级完整性
	 */
	async validateDeckHierarchy(material: ReadingMaterial): Promise<{
		valid: boolean;
		issues: string[];
	}> {
		const issues: string[] = [];

		if (!material.readingDeckId) {
			issues.push("材料没有关联的 Reading Deck");
			return { valid: false, issues };
		}

		if (!this.getDeck) {
			issues.push("牌组管理功能未初始化");
			return { valid: false, issues };
		}

		const readingDeck = await this.getDeck(material.readingDeckId);
		if (!readingDeck) {
			issues.push(`Reading Deck 不存在: ${material.readingDeckId}`);
			return { valid: false, issues };
		}

		// 检查双向引用
		const deckMaterialId = readingDeck.metadata?.readingMaterialId as string;
		if (deckMaterialId !== material.uuid) {
			issues.push("牌组和材料的双向引用不一致");
		}

		return {
			valid: issues.length === 0,
			issues,
		};
	}

	// ===== 辅助方法 =====

	/**
	 * 获取源位置信息
	 */
	private getSourceInfo(
		file: TFile,
		editor?: Editor
	): {
		blockId?: string;
		blockLink?: string;
		lineNumber?: number;
	} {
		if (!editor) {
			return {};
		}

		const cursor = editor.getCursor();
		const lineNumber = cursor.line + 1;

		// 生成块ID
		const blockId = `extract-${Date.now()}`;
		const blockLink = `${file.path}#^${blockId}`;

		return {
			blockId,
			blockLink,
			lineNumber,
		};
	}

	/**
	 * 格式化提取的内容
	 */
	private formatExtractContent(text: string, cardType?: string): string {
		const trimmedText = text.trim();

		if (cardType === "cloze") {
			// 挖空卡片格式
			return `{{c1::${trimmedText}}}`;
		}

		// 默认问答卡片格式
		// 使用标准分隔符
		return `${trimmedText}\n\n---div---\n\n`;
	}

	/**
	 * 获取材料的所有提取卡片
	 */
	async getExtractedCards(materialId: string): Promise<string[]> {
		const materials = await this.materialManager.getAllMaterials();
		const material = materials.find((m) => m.uuid === materialId);
		return material?.extractedCards || [];
	}

	/**
	 * 获取提取卡片统计
	 */
	async getExtractStats(materialId: string): Promise<{
		totalCards: number;
		byType: Record<string, number>;
	}> {
		const cardIds = await this.getExtractedCards(materialId);

		// 简单统计，详细统计需要访问卡片数据
		return {
			totalCards: cardIds.length,
			byType: {},
		};
	}
}

/**
 * 创建摘录卡片服务实例
 */
export function createExtractCardService(
	app: App,
	materialManager: ReadingMaterialManager,
	sessionManager: ReadingSessionManager
): ExtractCardService {
	return new ExtractCardService(app, materialManager, sessionManager);
}
