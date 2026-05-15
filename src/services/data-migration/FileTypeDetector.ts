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
				const deckId = content.deckId || getLegacyDeckIdFromPath();
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
						const bankId = content.bankId || "unknown";
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
		const adapter = this.app.vault.adapter;

		try {
			if (!(await adapter.exists(dirPath))) {
				return results;
			}

			const listing = await (adapter as any).list(dirPath);

			// 检测文件
			for (const file of listing.files || []) {
				if (file.endsWith(".json")) {
					const result = await this.detectFileType(file);
					results.push(result);
				}
			}

			// 递归检测子目录
			for (const folder of listing.folders || []) {
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
	private isMemoryDecksFile(content: any): boolean {
		if (!content?.decks || !Array.isArray(content.decks)) return false;
		if (content.decks.length === 0) return true; // 空数组也算

		return content.decks.some((d: any) => d.id?.startsWith("deck_"));
	}

	/**
	 * 检测记忆卡片文件
	 * 特征：{ cards: [{ uuid: "tk-*", fsrs: {...}, reviewHistory: [...] }] }
	 * 注意：不含 cardPurpose: "test" 才是记忆卡片
	 */
	private isMemoryCardsFile(content: any): boolean {
		if (!content?.cards || !Array.isArray(content.cards)) return false;
		if (content.cards.length === 0) return true;

		// 必须有 tk- 前缀的 uuid、fsrs 对象、reviewHistory 数组
		// 且不是测试卡片（无 cardPurpose: "test"）
		return content.cards.some(
			(c: any) =>
				c.uuid?.startsWith("tk-") &&
				c.fsrs &&
				typeof c.fsrs.stability === "number" &&
				Array.isArray(c.reviewHistory) &&
				c.cardPurpose !== "test"
		);
	}

	/**
	 * 检测牌组特定卡片文件（旧格式）
	 * 特征：{ _schemaVersion: "1.0.0", deckId: "deck_*", cards: [...] }
	 */
	private isMemoryDeckCardsFile(content: any): boolean {
		return !!(content?.deckId?.startsWith("deck_") && Array.isArray(content?.cards));
	}

	/**
	 * 检测学习会话文件
	 * 特征：{ yearMonth: "YYYY-MM", sessions: [{ cardReviews: [...] }] }
	 */
	private isMemorySessionFile(content: any): boolean {
		if (!content?.yearMonth || !content?.sessions) return false;
		if (!Array.isArray(content.sessions)) return false;

		// yearMonth 格式检查
		if (!/^\d{4}-\d{2}$/.test(content.yearMonth)) return false;

		// 空会话也算
		if (content.sessions.length === 0) return true;

		// 会话中必须有 cardReviews
		return content.sessions.some((s: any) => Array.isArray(s.cardReviews));
	}

	/**
	 * 检测卡片文件索引
	 * 特征：{ files: [...], cardLocations: {...}, lastUpdated: number }
	 */
	private isCardFilesIndexFile(content: any): boolean {
		return !!(
			Array.isArray(content?.files) &&
			content?.cardLocations &&
			typeof content.cardLocations === "object"
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
	private isIRDecksFile(content: any): boolean {
		if (content?.version !== "4.0") return false;
		if (!content?.decks || typeof content.decks !== "object") return false;
		if (Array.isArray(content.decks)) return false; // 必须是对象，不是数组

		// 空对象也算
		const keys = Object.keys(content.decks);
		if (keys.length === 0) return true;

		// 键必须以 deck- 开头，且有 blockIds 或 settings.splitMode
		return (
			keys.some((k) => k.startsWith("deck-")) &&
			Object.values(content.decks).some(
				(d: any) => Array.isArray(d.blockIds) || d.settings?.splitMode
			)
		);
	}

	/**
	 * 检测 IR blocks.json
	 * 特征：{ version: "4.0", blocks: {...} }
	 */
	private isIRBlocksFile(content: any): boolean {
		return (
			content?.version === "4.0" &&
			content?.blocks !== undefined &&
			typeof content.blocks === "object" &&
			!Array.isArray(content.blocks)
		);
	}

	/**
	 * 检测 IR history.json
	 * 特征：{ version: "4.0", sessions: [...] }
	 * 注意：sessions 是数组（与记忆会话不同，没有 yearMonth）
	 */
	private isIRHistoryFile(content: any): boolean {
		return content?.version === "4.0" && Array.isArray(content?.sessions) && !content?.yearMonth; // 区分记忆会话
	}

	/**
	 * 检测 IR sources.json
	 * 特征：{ version: "4.0", sources: {...} }
	 */
	private isIRSourcesFile(content: any): boolean {
		return (
			content?.version === "4.0" &&
			content?.sources !== undefined &&
			typeof content.sources === "object"
		);
	}

	/**
	 * 检测 IR chunks.json
	 * 特征：{ version: "4.0", chunks: {...} }
	 */
	private isIRChunksFile(content: any): boolean {
		return (
			content?.version === "4.0" &&
			content?.chunks !== undefined &&
			typeof content.chunks === "object"
		);
	}

	/**
	 * 检测标签组文件
	 * 特征：{ version: "4.0", groups: { "*": { matchAnyTags: [...] } } }
	 */
	private isIRTagGroupsFile(content: any): boolean {
		if (content?.version !== "4.0") return false;
		if (!content?.groups || typeof content.groups !== "object") return false;

		// 空对象也算
		const groups = Object.values(content.groups);
		if (groups.length === 0) return true;

		return groups.some((g: any) => Array.isArray(g.matchAnyTags));
	}

	/**
	 * 检测标签组配置文件
	 * 特征：{ version: "4.0", profiles: { "*": { groupId: "...", intervalFactorBase: ... } } }
	 */
	private isIRTagGroupProfilesFile(content: any): boolean {
		if (content?.version !== "4.0") return false;
		if (!content?.profiles || typeof content.profiles !== "object") return false;

		// 空对象也算
		const profiles = Object.values(content.profiles);
		if (profiles.length === 0) return true;

		return profiles.some((p: any) => p.groupId && p.intervalFactorBase !== undefined);
	}

	/**
	 * 检测阅读材料索引
	 * 特征：{ version: "1.0.0", materials: {...}, lastUpdated: "..." }
	 */
	private isIRMaterialsFile(content: any): boolean {
		return !!(content?.materials && typeof content.materials === "object" && content?.lastUpdated);
	}

	// ============================================================================
	// 题库检测
	// ============================================================================

	/**
	 * 检测题库列表
	 * 特征：顶层为数组 + deckType: "question-bank" + metadata.questionBankStats
	 */
	private isQuestionBanksFile(content: any): boolean {
		// 必须是顶层数组
		if (!Array.isArray(content)) return false;
		if (content.length === 0) return false;

		// 数组元素必须有 deckType: "question-bank"
		return content.some(
			(b: any) => b.deckType === "question-bank" && b.metadata?.questionBankStats
		);
	}

	/**
	 * 检测题目文件
	 * 特征：{ bankId: "...", questions: [{ cardPurpose: "test", stats.testStats: {...} }] }
	 */
	private isQuestionsFile(content: any): boolean {
		if (!content?.bankId) return false;
		if (!content?.questions || !Array.isArray(content.questions)) return false;
		if (content.questions.length === 0) return true;

		// 必须有 cardPurpose: "test"
		return content.questions.some((q: any) => q.cardPurpose === "test" && q.stats?.testStats);
	}

	// ============================================================================
	// 配置检测
	// ============================================================================

	/**
	 * 检测用户配置文件
	 * 特征：{ profile: { globalSettings: { defaultDeckSettings: {...} }, overallStats: {...} } }
	 */
	private isUserProfileFile(content: any): boolean {
		return !!(content.profile?.globalSettings?.defaultDeckSettings && content.profile.overallStats);
	}

	// ============================================================================
	// 辅助方法
	// ============================================================================

	/**
	 * 读取 JSON 文件
	 */
	private async readJsonFile(filePath: string): Promise<any | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(filePath))) {
				return null;
			}
			const content = await adapter.read(filePath);
			return JSON.parse(content);
		} catch (error) {
			logger.debug(`[FileTypeDetector] 读取JSON失败: ${filePath}`, error);
			return null;
		}
	}
}
