/**
 * 外部同步文件变更监听器
 *
 * 监听 weave 数据文件夹中的 JSON 文件变更（来自 Remotely Save 等第三方云同步插件），
 * 当检测到外部变更时：
 * 1. 重建 WDeck 缓存
 * 2. 通过 DataSyncService 通知所有 UI 组件刷新数据
 *
 * 关键设计：
 * - 使用 vault.on('modify') 监听文件变更
 * - 通过 _isInternalWrite 标记区分内部写入和外部变更
 * - 防抖合并：多个文件同时变更时合并为一次通知
 */

import { type EventRef, TFile, type Vault } from "obsidian";
import { getV2PathsFromApp } from "../config/paths";
import type { WeavePlugin } from "../main";
import { createWeaveDataChangeNotifier } from "./ui/WeaveDataChangeBridge";
import { logger } from "../utils/logger";

export class ExternalSyncWatcher {
	private plugin: WeavePlugin;
	private vault: Vault;
	private dataRoot: string;
	private eventRefs: EventRef[] = [];

	/** 防抖定时器 */
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	/** 防抖延迟（毫秒）- 云同步通常批量写入多个文件 */
	private readonly DEBOUNCE_DELAY = 2000;

	/** 内部写入标记：当插件自身写入文件时设为 true，避免重复刷新 */
	private _isInternalWrite = false;
	/** 内部写入冷却定时器 */
	private _internalWriteCooldown: ReturnType<typeof setTimeout> | null = null;

	/** 已变更的文件路径集合（防抖期间累积） */
	private pendingChangedFiles = new Set<string>();

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
		this.vault = plugin.app.vault;
		this.dataRoot = getV2PathsFromApp(plugin.app).root;
	}

	/**
	 * 启动监听
	 */
	start(): void {
		logger.info(`[ExternalSyncWatcher] 启动外部同步监听, 数据根: ${this.dataRoot}`);

		// 监听文件修改
		const modifyRef = this.vault.on("modify", (file) => {
			if (file instanceof TFile) {
				this.onFileChange(file, "modify");
			}
		});

		// 监听文件创建（云同步可能创建新的分片文件）
		const createRef = this.vault.on("create", (file) => {
			if (file instanceof TFile) {
				this.onFileChange(file, "create");
			}
		});

		// 监听文件删除
		const deleteRef = this.vault.on("delete", (file) => {
			if (file instanceof TFile) {
				this.onFileChange(file, "delete");
			}
		});

		this.eventRefs = [modifyRef, createRef, deleteRef];
	}

	/**
	 * 标记即将进行内部写入
	 * 调用后 3 秒内的文件变更事件将被视为内部操作，不触发外部同步刷新
	 */
	markInternalWrite(): void {
		this._isInternalWrite = true;

		if (this._internalWriteCooldown) {
			clearTimeout(this._internalWriteCooldown);
		}

		this._internalWriteCooldown = setTimeout(() => {
			this._isInternalWrite = false;
			this._internalWriteCooldown = null;
		}, 3000);
	}

	/**
	 * 文件变更处理
	 */
	private onFileChange(file: TFile, action: "modify" | "create" | "delete"): void {
		// 只关注 weave 数据目录下的 JSON 文件
		if (!this.isWeaveDataFile(file)) {
			return;
		}

		// 如果是内部写入，忽略
		if (this._isInternalWrite) {
			return;
		}

		logger.debug(`[ExternalSyncWatcher] 检测到外部文件${action}: ${file.path}`);
		this.pendingChangedFiles.add(file.path);

		// 防抖：合并多个文件变更为一次通知
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			void this.handleExternalChanges();
		}, this.DEBOUNCE_DELAY);
	}

	/**
	 * 处理外部变更（防抖后执行）
	 */
	private async handleExternalChanges(): Promise<void> {
		const changedFiles = new Set(this.pendingChangedFiles);
		this.pendingChangedFiles.clear();

		if (changedFiles.size === 0) return;

		logger.info(
			`[ExternalSyncWatcher] 处理外部变更: ${changedFiles.size} 个文件`,
			Array.from(changedFiles).slice(0, 5)
		);

		// 分类变更文件
		let hasCardChanges = false;
		let hasDeckChanges = false;
		let hasSessionChanges = false;
		let hasIRChanges = false;

		for (const filePath of changedFiles) {
			if (filePath.includes("/memory/cards/")) {
				hasCardChanges = true;
			}
			if (filePath.includes("/memory/decks") || filePath.includes("decks.json")) {
				hasDeckChanges = true;
			}
			if (filePath.includes("/learning/sessions")) {
				hasSessionChanges = true;
			}
			if (filePath.includes("/incremental-reading/")) {
				hasIRChanges = true;
			}
		}

		if (hasCardChanges && this.plugin.wdeckService) {
			logger.info("[ExternalSyncWatcher] 重建 WDeck 缓存");
			await this.plugin.wdeckService.rebuildCache();
		}

		if (hasCardChanges || hasDeckChanges) {
			if (this.plugin.deckMembershipIndexService) {
				await this.plugin.deckMembershipIndexService.markFullRebuildRequired();
			}
			if (this.plugin.studyDueIndexService) {
				await this.plugin.studyDueIndexService.markFullRebuildRequired();
			}
		}

		// 2. 通过 DataSyncService 通知 UI 刷新
		const dataSyncService = this.plugin.dataSyncService;
		if (!dataSyncService) return;

		if (hasCardChanges) {
			await dataSyncService.notifyChange({
				type: "cards",
				action: "batch",
				metadata: { source: "external-sync" },
			});
		}

		if (hasDeckChanges) {
			await dataSyncService.notifyChange({
				type: "decks",
				action: "batch",
				metadata: { source: "external-sync" },
			});
		}

		if (hasSessionChanges) {
			await dataSyncService.notifyChange({
				type: "sessions",
				action: "batch",
				metadata: { source: "external-sync" },
			});
		}

		const { signalLegacyDataChanged, signalLegacyCardChanged } = createWeaveDataChangeNotifier(
			this.plugin,
			"cards"
		);

		// 触发 workspace 兼容事件（备用机制）
		if (hasCardChanges || hasDeckChanges) {
			signalLegacyDataChanged();
		}

		if (hasCardChanges) {
			signalLegacyCardChanged("update", { includeDataChanged: false });
		}

		logger.info("[ExternalSyncWatcher] 外部变更通知已发送", {
			cards: hasCardChanges,
			decks: hasDeckChanges,
			sessions: hasSessionChanges,
			ir: hasIRChanges,
		});
	}

	/**
	 * 判断是否为 weave 数据文件
	 */
	private isWeaveDataFile(file: TFile): boolean {
		if (file.extension !== "json") return false;
		if (!file.path.startsWith(`${this.dataRoot}/`)) return false;

		// 排除索引文件和非数据文件
		if (file.name === "card-files-index.json") return false;

		return true;
	}

	/**
	 * 停止监听
	 */
	stop(): void {
		for (const ref of this.eventRefs) {
			this.vault.offref(ref);
		}
		this.eventRefs = [];

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (this._internalWriteCooldown) {
			clearTimeout(this._internalWriteCooldown);
			this._internalWriteCooldown = null;
		}

		this.pendingChangedFiles.clear();
		logger.info("[ExternalSyncWatcher] 已停止");
	}
}
