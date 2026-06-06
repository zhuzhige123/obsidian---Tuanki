/**
 * 文件类型检测器
 *
 * 基于文件内容特征识别数据文件类型，用于 Schema V2 数据迁移。
 * 不依赖路径假设，通过分析 JSON 结构特征判断文件类型。
 *
 * 识别优先级（按顺序检测）：
 * 1. 记忆牌组 - decks数组+cardUUIDs
 * 2. 卡片数据 - cards数组+fsrs+非cardPurpose:test
 * 3. IR牌组 - version:4.0+decks对象+deck-键
 * 4. IR内容块 - version:4.0+blocks
 * 5. 题库 - 顶层数组+deckType:question-bank
 * 6. 题目 - bankId+questions+cardPurpose:test
 * 7. 用户配置 - profile+globalSettings
 *
 * @module services/data-migration/FileTypeDetector
 */

import { App } from "obsidian";
import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import { logger } from "../../utils/logger";
import { getVaultAdapterWithDirOps, listVaultDirectory } from "../../utils/plugin-runtime";
import { isRecord, parseJsonUnknown } from "../../utils/typed-json";

/**
 * 数据文件类型枚举
 */
export type DataFileType =
	// 记忆牌组
	| "memory-decks" // 牌组列表 - decks数组+cardUUIDs
	| "memory-cards" // 卡片数据 - cards数组+fsrs
	| "memory-deck-cards" // 牌组特定卡片（旧格式） - deckId+cards
	| "memory-sessions" // 学习会话 - yearMonth+cardReviews
	| "card-files-index" // 卡片文件索引 - files+cardLocations
	// 增量阅读
	| "ir-decks" // IR牌组 - version:4.0+decks对象
	| "ir-blocks" // IR内容块 - version:4.0+blocks
	| "ir-history" // IR历史 - version:4.0+sessions数组
	| "ir-sources" // IR源文件 - version:4.0+sources
	| "ir-chunks" // IR块数据 - version:4.0+chunks
	| "ir-tag-groups" // 标签组 - version:4.0+groups
	| "ir-tag-group-profiles" // 标签组配置 - version:4.0+profiles+groupId
	| "ir-materials" // 阅读材料 - materials+lastUpdated
	// 题库
	| "question-banks" // 题库列表 - 顶层数组+deckType:question-bank
	| "questions" // 题目数据 - bankId+questions+cardPurpose:test
	// 配置
	| "user-profile" // 用户配置 - profile+globalSettings
	// 未知
	| "unknown";

/**
 * 文件检测结果
 */
export interface FileDetectionResult {
	path: string;
	type: DataFileType;
	confidence: "high" | "medium" | "low";
	targetPath: string; // 目标迁移路径
	details?: string;
}

/**
 * 文件类型检测器
 */
export class FileTypeDetector {
	private app: App;
	private v2Paths = getV2PathsFromApp(undefined);

	constructor(app: App) {
		this.app = app;
		this.v2Paths = getV2PathsFromApp(app);
	}

	/**
	 * 检测单个文件类型
	 */
	async detectFileType(filePath: string): Promise<FileDetectionResult> {
		const fileName = filePath.split("/").pop() || "";
		const v2Paths = this.v2Paths;

		try {
			const content = await this.readJsonFile(filePath);
			if (!content) {
				return {
					path: filePath,
					type: "unknown",
					confidence: "low",
					targetPath: "",
					details: "无法读取文件",
				};
			}

			const getLegacyDeckIdFromPath = (): string | null => {
				const m = filePath.match(/\/decks\/(deck_[^/]+)\/cards\.json$/);
				return m?.[1] ?? null;
			};

			const getLegacyDeckCardsTarget = (): string => {
				const deckId =
					(isRecord(content) && typeof content.deckId === "string" ? content.deckId : null) ||
					getLegacyDeckIdFromPath();
				if (deckId) {
					return `${v2Paths.memory.cards}/legacy-${deckId}.json`;
				}
				return `${v2Paths.memory.cards}/${fileName}`;
			};

			// 按优先级检测（顺序很重要！）
			const detectors: Array<{
				check: () => boolean;
				type: DataFileType;
				confidence: "high" | "medium";
				getTarget: () => string;
			}> = [
				// 1. 记忆牌组 - decks数组 + cardUUIDs
				{
					check: () => this.isMemoryDecksFile(content),
					type: "memory-decks",
					confidence: "high",
					getTarget: () => v2Paths.memory.decks,
				},
				// 2. 卡片数据 - cards数组 + fsrs（非测试卡片）
				{
					check: () => this.isMemoryCardsFile(content),
					type: "memory-cards",
					confidence: "high",
					getTarget: () => getLegacyDeckCardsTarget(),
				},
				// 3. 牌组特定卡片（旧格式）- deckId + cards
				{
					check: () => this.isMemoryDeckCardsFile(content),
					type: "memory-deck-cards",
					confidence: "high",
					getTarget: () => getLegacyDeckCardsTarget(),
				},
				// 4. 卡片文件索引 - files + cardLocations
				{
					check: () => this.isCardFilesIndexFile(content),
					type: "card-files-index",
					confidence: "high",
					getTarget: () => `${v2Paths.memory.cards}/card-files-index.json`,
				},
				// 5. 学习会话 - yearMonth + sessions + cardReviews
				{
					check: () => this.isMemorySessionFile(content),
					type: "memory-sessions",
					confidence: "high",
					getTarget: () => `${v2Paths.memory.learning.sessions}/${fileName}`,
				},

				// 6. IR牌组 - version:4.0 + decks对象 + deck-键
				{
					check: () => this.isIRDecksFile(content),
					type: "ir-decks",
					confidence: "high",
					getTarget: () => v2Paths.ir.legacyDecks,
				},
				// 7. IR内容块 - version:4.0 + blocks
				{
					check: () => this.isIRBlocksFile(content),
					type: "ir-blocks",
					confidence: "high",
					getTarget: () => v2Paths.ir.blocks,
				},
				// 8. IR历史 - version:4.0 + sessions数组
				{
					check: () => this.isIRHistoryFile(content),
					type: "ir-history",
					confidence: "high",
					getTarget: () => v2Paths.ir.history,
				},
				// 9. IR源文件 - version:4.0 + sources
				{
					check: () => this.isIRSourcesFile(content),
					type: "ir-sources",
					confidence: "high",
					getTarget: () => `${v2Paths.ir.root}/sources.json`,
				},
				// 10. IR块数据 - version:4.0 + chunks
				{
					check: () => this.isIRChunksFile(content),
					type: "ir-chunks",
					confidence: "high",
					getTarget: () => `${v2Paths.ir.root}/chunks.json`,
				},
				// 11. 标签组 - version:4.0 + groups
				{
					check: () => this.isIRTagGroupsFile(content),
					type: "ir-tag-groups",
					confidence: "high",
					getTarget: () => `${v2Paths.ir.root}/tag-groups.json`,
				},
				// 12. 标签组配置 - version:4.0 + profiles + groupId
				{
					check: () => this.isIRTagGroupProfilesFile(content),
					type: "ir-tag-group-profiles",
					confidence: "high",
					getTarget: () => `${v2Paths.ir.root}/tag-group-profiles.json`,
				},
				// 13. 阅读材料 - materials + lastUpdated
				{
					check: () => this.isIRMaterialsFile(content),
					type: "ir-materials",
					confidence: "high",
					getTarget: () => v2Paths.ir.materials.index,
				},

				// 14. 题库列表 - 顶层数组 + deckType:question-bank
				{
					check: () => this.isQuestionBanksFile(content),
					type: "question-banks",
					confidence: "high",
					getTarget: () => v2Paths.questionBank.banks,
				},
				// 15. 题目数据 - bankId + questions + cardPurpose:test
				{
					check: () => this.isQuestionsFile(content),
					type: "questions",
					confidence: "high",
					getTarget: () => {
						const bankId =
							isRecord(content) && typeof content.bankId === "string"
								? content.bankId
								: "unknown";
						return `${v2Paths.questionBank.root}/banks/${bankId}/questions.json`;
					},
				},

				// 16. 用户配置 - profile + globalSettings
				{
					check: () => this.isUserProfileFile(content),
					type: "user-profile",
					confidence: "high",
					getTarget: () => getPluginPaths(this.app).state.userProfile,
				},
			];

			for (const detector of detectors) {
				if (detector.check()) {
					return {
						path: filePath,
						type: detector.type,
						confidence: detector.confidence,
						targetPath: detector.getTarget(),
					};
				}
			}

			return {
				path: filePath,
				type: "unknown",
				confidence: "low",
				targetPath: "",
				details: "无法识别的文件格式",
			};
		} catch (error) {
			logger.warn(`[FileTypeDetector] 检测文件失败: ${filePath}`, error);
			return {
				path: filePath,
				type: "unknown",
				confidence: "low",
				targetPath: "",
				details: String(error),
			};
		}
	}

	/**
	 * 批量检测目录下所有 JSON 文件
	 */
	async detectDirectory(dirPath: string): Promise<FileDetectionResult[]> {
		const results: FileDetectionResult[] = [];
		const adapter = getVaultAdapterWithDirOps(this.app.vault.adapter);

		try {
			if (!(await adapter.exists(dirPath))) {
				return results;
			}

			const listing = await listVaultDirectory(adapter, dirPath);
			if (!listing) {
				return results;
			}

			// 检测文件
			for (const file of listing.files) {
				if (file.endsWith(".json")) {
					const result = await this.detectFileType(file);
					results.push(result);
				}
			}

			// 递归检测子目录
			for (const folder of listing.folders) {
				const subResults = await this.detectDirectory(folder);
				results.push(...subResults);
			}
		} catch (error) {
			logger.warn(`[FileTypeDetector] 扫描目录失败: ${dirPath}`, error);
		}

		return results;
	}

	// ============================================================================
	// 记忆牌组检测
	// ============================================================================

	/**
	 * 检测记忆牌组 decks.json
	 * 特征：{ decks: [{ id: "deck_*", cardUUIDs: [...], settings: { fsrsParams: {...} } }] }
	 */
	private isMemoryDecksFile(content: unknown): boolean {
		if (!isRecord(content)) return false;
		const decks = content.decks;
		if (!Array.isArray(decks)) return false;
		if (decks.length === 0) return true;

		return decks.some(
			(d) => isRecord(d) && typeof d.id === "string" && d.id.startsWith("deck_")
		);
	}

	/**
	 * 检测记忆卡片文件
	 * 特征：{ cards: [{ uuid: "tk-*", fsrs: {...}, reviewHistory: [...] }] }
	 * 注意：不含 cardPurpose: "test" 才是记忆卡片
	 */
	private isMemoryCardsFile(content: unknown): boolean {
		if (!isRecord(content)) return false;
		const cards = content.cards;
		if (!Array.isArray(cards)) return false;
		if (cards.length === 0) return true;

		return cards.some((c) => {
			if (!isRecord(c) || typeof c.uuid !== "string" || !c.uuid.startsWith("tk-")) {
				return false;
			}
			const fsrs = c.fsrs;
			return (
				isRecord(fsrs) &&
				typeof fsrs.stability === "number" &&
				Array.isArray(c.reviewHistory) &&
				c.cardPurpose !== "test"
			);
		});
	}

	/**
	 * 检测牌组特定卡片文件（旧格式）
	 * 特征：{ _schemaVersion: "1.0.0", deckId: "deck_*", cards: [...] }
	 */
	private isMemoryDeckCardsFile(content: unknown): boolean {
		return (
			isRecord(content) &&
			typeof content.deckId === "string" &&
			content.deckId.startsWith("deck_") &&
			Array.isArray(content.cards)
		);
	}

	/**
	 * 检测学习会话文件
	 * 特征：{ yearMonth: "YYYY-MM", sessions: [{ cardReviews: [...] }] }
	 */
	private isMemorySessionFile(content: unknown): boolean {
		if (!isRecord(content)) return false;
		if (typeof content.yearMonth !== "string" || !content.sessions) return false;
		if (!Array.isArray(content.sessions)) return false;
		if (!/^\d{4}-\d{2}$/.test(content.yearMonth)) return false;
		if (content.sessions.length === 0) return true;

		return content.sessions.some((s) => isRecord(s) && Array.isArray(s.cardReviews));
	}

	/**
	 * 检测卡片文件索引
	 * 特征：{ files: [...], cardLocations: {...}, lastUpdated: number }
	 */
	private isCardFilesIndexFile(content: unknown): boolean {
		return (
			isRecord(content) &&
			Array.isArray(content.files) &&
			isRecord(content.cardLocations)
		);
	}

	// ============================================================================
	// 增量阅读检测（version: "4.0" 是关键特征）
	// ============================================================================

	/**
	 * 检测 IR 牌组文件
	 * 特征：{ version: "4.0", decks: { "deck-*": { blockIds: [], settings: { splitMode: "..." } } } }
	 * 注意：decks 是对象（非数组），键以 deck- 开头
	 */
	private isIRDecksFile(content: unknown): boolean {
		if (!isRecord(content) || content.version !== "4.0") return false;
		const decks = content.decks;
		if (!isRecord(decks)) return false;

		const keys = Object.keys(decks);
		if (keys.length === 0) return true;

		return (
			keys.some((k) => k.startsWith("deck-")) &&
			Object.values(decks).some((d) => {
				if (!isRecord(d)) return false;
				const settings = d.settings;
				return Array.isArray(d.blockIds) || (isRecord(settings) && settings.splitMode !== undefined);
			})
		);
	}

	/**
	 * 检测 IR blocks.json
	 * 特征：{ version: "4.0", blocks: {...} }
	 */
	private isIRBlocksFile(content: unknown): boolean {
		return (
			isRecord(content) &&
			content.version === "4.0" &&
			content.blocks !== undefined &&
			isRecord(content.blocks)
		);
	}

	/**
	 * 检测 IR history.json
	 * 特征：{ version: "4.0", sessions: [...] }
	 * 注意：sessions 是数组（与记忆会话不同，没有 yearMonth）
	 */
	private isIRHistoryFile(content: unknown): boolean {
		return (
			isRecord(content) &&
			content.version === "4.0" &&
			Array.isArray(content.sessions) &&
			content.yearMonth === undefined
		);
	}

	/**
	 * 检测 IR sources.json
	 * 特征：{ version: "4.0", sources: {...} }
	 */
	private isIRSourcesFile(content: unknown): boolean {
		return isRecord(content) && content.version === "4.0" && isRecord(content.sources);
	}

	/**
	 * 检测 IR chunks.json
	 * 特征：{ version: "4.0", chunks: {...} }
	 */
	private isIRChunksFile(content: unknown): boolean {
		return isRecord(content) && content.version === "4.0" && isRecord(content.chunks);
	}

	/**
	 * 检测标签组文件
	 * 特征：{ version: "4.0", groups: { "*": { matchAnyTags: [...] } } }
	 */
	private isIRTagGroupsFile(content: unknown): boolean {
		if (!isRecord(content) || content.version !== "4.0") return false;
		const groups = content.groups;
		if (!isRecord(groups)) return false;

		const values = Object.values(groups);
		if (values.length === 0) return true;

		return values.some((g) => isRecord(g) && Array.isArray(g.matchAnyTags));
	}

	/**
	 * 检测标签组配置文件
	 * 特征：{ version: "4.0", profiles: { "*": { groupId: "...", intervalFactorBase: ... } } }
	 */
	private isIRTagGroupProfilesFile(content: unknown): boolean {
		if (!isRecord(content) || content.version !== "4.0") return false;
		const profiles = content.profiles;
		if (!isRecord(profiles)) return false;

		const values = Object.values(profiles);
		if (values.length === 0) return true;

		return values.some(
			(p) => isRecord(p) && p.groupId !== undefined && p.intervalFactorBase !== undefined
		);
	}

	/**
	 * 检测阅读材料索引
	 * 特征：{ version: "1.0.0", materials: {...}, lastUpdated: "..." }
	 */
	private isIRMaterialsFile(content: unknown): boolean {
		return isRecord(content) && isRecord(content.materials) && content.lastUpdated !== undefined;
	}

	// ============================================================================
	// 题库检测
	// ============================================================================

	/**
	 * 检测题库列表
	 * 特征：顶层为数组 + deckType: "question-bank" + metadata.questionBankStats
	 */
	private isQuestionBanksFile(content: unknown): boolean {
		// 必须是顶层数组
		if (!Array.isArray(content)) return false;
		if (content.length === 0) return false;

		// 数组元素必须有 deckType: "question-bank"
		return content.some((b) => {
			if (!isRecord(b) || b.deckType !== "question-bank") return false;
			const metadata = b.metadata;
			return isRecord(metadata) && metadata.questionBankStats !== undefined;
		});
	}

	/**
	 * 检测题目文件
	 * 特征：{ bankId: "...", questions: [{ cardPurpose: "test", stats.testStats: {...} }] }
	 */
	private isQuestionsFile(content: unknown): boolean {
		if (!isRecord(content) || !content.bankId) return false;
		const questions = content.questions;
		if (!Array.isArray(questions)) return false;
		if (questions.length === 0) return true;

		return questions.some((q) => {
			if (!isRecord(q) || q.cardPurpose !== "test") return false;
			const stats = q.stats;
			return isRecord(stats) && stats.testStats !== undefined;
		});
	}

	// ============================================================================
	// 配置检测
	// ============================================================================

	/**
	 * 检测用户配置文件
	 * 特征：{ profile: { globalSettings: { defaultDeckSettings: {...} }, overallStats: {...} } }
	 */
	private isUserProfileFile(content: unknown): boolean {
		if (!isRecord(content)) return false;
		const profile = content.profile;
		if (!isRecord(profile)) return false;
		const globalSettings = profile.globalSettings;
		return (
			isRecord(globalSettings) &&
			isRecord(globalSettings.defaultDeckSettings) &&
			isRecord(profile.overallStats)
		);
	}

	// ============================================================================
	// 辅助方法
	// ============================================================================

	/**
	 * 读取 JSON 文件
	 */
	private async readJsonFile(filePath: string): Promise<unknown> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(filePath))) {
				return undefined;
			}
			const content = await adapter.read(filePath);
			return parseJsonUnknown(content);
		} catch (error) {
			logger.debug(`[FileTypeDetector] 读取JSON失败: ${filePath}`, error);
			return undefined;
		}
	}
}
