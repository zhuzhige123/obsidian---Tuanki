// Anki Plugin Data Storage
// 使用Obsidian的API进行数据持久化存储

import { TFile } from "obsidian";
import type { Card, Deck, UserProfile, AnkiExportData, DataQuery, ApiResponse } from "./types";
import type { StudySession } from "./study-types";
import type { TriadTemplate } from "./template-types";

export class AnkiDataStorage {
  private plugin: import("obsidian").Plugin;
  private dataFolder = "tuanki";
  
  constructor(plugin: import("obsidian").Plugin) {
    this.plugin = plugin;
  }

  // 初始化数据存储
  async initialize(): Promise<void> {
    try {
      console.log("Initializing Anki data storage...");
      
      // 从插件设置初始化数据目录（向后兼容）
      try {
        const settingsFolder = (this.plugin as any)?.settings?.dataFolder;
        if (typeof settingsFolder === "string" && settingsFolder.trim().length > 0) {
          this.dataFolder = settingsFolder.trim();
        }
      } catch {}

      // 确保数据文件夹存在
      await this.ensureDataFolder();
      
      // 初始化必要的数据文件
      await this.ensureDataFiles();

      // 如无任何牌组，则自动创建一个默认牌组，避免新建卡片时无 deckId
      await this.ensureDefaultDeck();
      
      console.log("✅ Anki data storage initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize data storage:", error);
      // 不再抛出错误，允许插件继续运行
      console.warn("Plugin will continue running with default data...");
    }
  }

  // 确保数据文件夹存在
  private async ensureDataFolder(): Promise<void> {
    try {
      const folder = this.plugin.app.vault.getAbstractFileByPath(this.dataFolder);
      if (!folder) {
        await this.plugin.app.vault.createFolder(this.dataFolder);
        console.log(`Created data folder: ${this.dataFolder}`);
      } else {
        console.log(`Data folder already exists: ${this.dataFolder}`);
      }
    } catch (error) {
      // 如果文件夹已存在，忽略错误并继续
      if (error && (
        (error as any).message?.includes("already exists") || 
        (error as any).message?.includes("Folder already exists") ||
        error.toString().includes("already exists")
      )) {
        console.log(`Data folder creation skipped (already exists): ${this.dataFolder}`);
        return;
      }
      // 其他错误记录但不抛出，避免插件启动失败
      console.warn("Data folder creation warning:", error);
    }
  }

  // 确保必要的数据文件存在
  private async ensureDataFiles(): Promise<void> {
    // 新的目录结构
    const folders = [
      `${this.dataFolder}/decks`,
      `${this.dataFolder}/learning`,
      `${this.dataFolder}/learning/sessions`,
      `${this.dataFolder}/profile`,
      `${this.dataFolder}/backups`
    ];
    
    for (const dir of folders) {
      try { await this.plugin.app.vault.createFolder(dir); } catch {}
    }

    const fileEntries: Array<{ path: string; key: string }> = [
      { path: `${this.dataFolder}/decks/decks.json`, key: "decks.json" },
      { path: `${this.dataFolder}/profile/user-profile.json`, key: "user-profile.json" },
    ];

    for (const { path: filePath, key } of fileEntries) {
      try {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        
        if (!file) {
          const defaultData = this.getDefaultData(key);
          await this.plugin.app.vault.create(filePath, JSON.stringify(defaultData, null, 2));
          console.log(`Created data file: ${filePath}`);
        } else {
          console.log(`Data file already exists: ${filePath}`);
        }
      } catch (error) {
        // 如果文件已存在，忽略错误并继续
        if (error && (
          (error as any).message?.includes("already exists") || 
          (error as any).message?.includes("File already exists") ||
          error.toString().includes("already exists")
        )) {
          console.log(`Data file creation skipped (already exists): ${filePath}`);
          continue;
        }
        // 其他错误记录但不抛出，避免插件启动失败
        console.warn(`Data file creation warning for ${filePath}:`, error);
      }
    }
  }

  // 获取默认数据
  private getDefaultData(fileName: string): any {
    switch (fileName) {
      case "decks.json":
        return { decks: [] };
      case "user-profile.json":
        return this.createDefaultUserProfile();
      default:
        return {};
    }
  }

  // 确保至少存在一个默认牌组，避免首次使用时无法创建卡片
  private async ensureDefaultDeck(): Promise<void> {
    try {
      const decks = await this.getDecks();
      if (Array.isArray(decks) && decks.length > 0) {
        console.log(`✅ Default deck check passed: ${decks.length} deck(s) found`);
        return;
      }

      console.log("🔄 Creating default deck for first-time use...");
      const now = new Date();
      const defaultName = ((this.plugin as any)?.settings?.defaultDeck as string) || "默认牌组";
      const profile = this.createDefaultUserProfile().profile;
      const defaultSettings = profile.globalSettings.defaultDeckSettings;
      const defaultDeck: Deck = {
        id: `deck_${Date.now().toString(36)}`,
        name: defaultName,
        description: "",
        category: "默认",
        created: now.toISOString(),
        modified: now.toISOString(),
        settings: defaultSettings,
        stats: {
          totalCards: 0,
          newCards: 0,
          learningCards: 0,
          reviewCards: 0,
          todayNew: 0,
          todayReview: 0,
          todayTime: 0,
          totalReviews: 0,
          totalTime: 0,
          memoryRate: 0,
          averageEase: 0,
          forecastDays: {}
        },
        tags: [],
        metadata: {}
      } as Deck;

      // 🔧 修复：使用常规文件写入方法
      await this.writeJsonFile("decks/decks.json", { decks: [defaultDeck] });
      console.log("✅ Successfully created default deck:", defaultName);

      // 为默认牌组添加一张示例卡片
      const fsrs = (this.plugin as any).fsrs;
      if (fsrs) {
        // 🆕 v0.8: 导入新ID生成器
        const { generateUUID } = await import('../utils/helpers');
        
        const sampleCard: Card = {
          id: `card_${Date.now().toString(36)}`,
          uuid: generateUUID(), // 🆕 使用新格式UUID
          deckId: defaultDeck.id,
          templateId: 'official_basic', // 使用官方基础模板
          fields: {
            // 🔥 简化示例卡片，展示统一的 ---div--- 分隔符格式
            front: 'Obsidian 是什么？',
            back: 'Obsidian 是一款强大的知识管理和笔记软件，支持双向链接和插件扩展。',
            question: 'Obsidian 是什么？',
            answer: 'Obsidian 是一款强大的知识管理和笔记软件，支持双向链接和插件扩展。',
            uuid: generateUUID(), // 🆕 使用新格式UUID
            obsidian_block_link: '',
            source_document: ''
          },
          type: "basic" as any,
          tags: ['入门'],
          created: now.toISOString(),
          modified: now.toISOString(),
          fsrs: fsrs.createCard(),
          reviewHistory: [],
          stats: { totalReviews: 0, totalTime: 0, averageTime: 0, memoryRate: 0 }
        };
        await this.saveDeckCards(defaultDeck.id, [sampleCard]);
        console.log("✅ Added a sample card to the default deck.");
      }
    } catch (e) {
      // 更详细的错误处理
      if (e && (
        (e as any).message?.includes("already exists") || 
        (e as any).message?.includes("File already exists") ||
        e.toString().includes("already exists")
      )) {
        console.log("ℹ️ Default deck file already exists, checking content...");
        try {
          // 尝试验证文件内容是否有效
          const existingDecks = await this.getDecks();
          if (Array.isArray(existingDecks) && existingDecks.length > 0) {
            console.log("✅ Existing deck file is valid with", existingDecks.length, "deck(s)");
          } else {
            console.warn("⚠️ Existing deck file is empty or invalid, updating content...");

            // 🔧 修复：直接更新已存在但内容无效的文件，而不是"修复"
            try {
              const now = new Date();
              const defaultName = ((this.plugin as any)?.settings?.defaultDeck as string) || "默认牌组";
              const profile = this.createDefaultUserProfile().profile;
              const defaultSettings = profile.globalSettings.defaultDeckSettings;
              const defaultDeck: Deck = {
                id: `deck_${Date.now().toString(36)}`,
                name: defaultName,
                description: "自动创建的默认牌组",
                category: "默认",
                created: now.toISOString(),
                modified: now.toISOString(),
                settings: defaultSettings,
                stats: {
                  totalCards: 0,
                  newCards: 0,
                  learningCards: 0,
                  reviewCards: 0,
                  todayNew: 0,
                  todayReview: 0,
                  todayTime: 0,
                  totalReviews: 0,
                  totalTime: 0,
                  memoryRate: 0,
                  averageEase: 0,
                  forecastDays: {}
                },
                tags: [],
                metadata: { autoCreated: true }
              } as Deck;

              // 🔧 修复：直接更新文件内容，而不是尝试创建新文件
              await this.updateExistingDeckFile("decks/decks.json", { decks: [defaultDeck] });
              console.log("✅ Successfully updated deck file with default deck");
            } catch (updateError) {
              console.error("❌ Failed to update deck file:", updateError);
              console.log("ℹ️ Continuing with plugin initialization despite deck file issue");
            }
          }
        } catch (readError) {
          console.warn("⚠️ Could not validate existing deck file:", readError);
        }
      } else {
        console.warn("⚠️ ensureDefaultDeck failed:", e);
      }
    }
  }

  // 创建默认用户配置
  private createDefaultUserProfile(): { profile: UserProfile } {
    return {
      profile: {
        id: "default-user",
        name: "Default User",
        created: new Date().toISOString(),
        globalSettings: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: "zh-CN",
          theme: "auto",
          defaultDeckSettings: {
            newCardsPerDay: 20,
            maxReviewsPerDay: 100,
            enableAutoAdvance: true,
            showAnswerTime: 0,
            fsrsParams: {
              // 使用标准FSRS6默认权重参数 (21个参数)
              w: [
                0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
                0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
                0.5425, 0.0912, 0.0658, 0.1542
              ],
              requestRetention: 0.9, // 修正为标准值
              maximumInterval: 36500,
              enableFuzz: true
            },
            learningSteps: [1, 10],
            relearningSteps: [10],
            graduatingInterval: 1,
            easyInterval: 4
          },
          enableNotifications: true,
          enableSounds: false,
          enableDebugMode: false,
          dataBackupInterval: 24
        },
        overallStats: {
          totalDecks: 0,
          totalCards: 0,
          totalStudyTime: 0,
          streakDays: 0
        }
      }
    };
  }

  // 牌组操作
  async getDecks(): Promise<Deck[]> {
    try {
      const rel = "decks/decks.json";
      const exists = await this.exists(`${this.dataFolder}/${rel}`);
      if (!exists) return [];
      const data = await this.readJsonFile(rel);
      return data.decks || [];
    } catch (error) {
      // 保守降噪：首次运行可能未创建，直接返回空数组
      return [];
    }
  }

  async getDeck(deckId: string): Promise<Deck | null> {
    try {
      const decks = await this.getDecks();
      return decks.find(deck => deck.id === deckId) || null;
    } catch (error) {
      console.error("Failed to get deck:", error);
      return null;
    }
  }

  async getAllDecks(): Promise<Deck[]> {
    return this.getDecks();
  }

  async getCardsByDeck(deckId: string): Promise<Card[]> {
    return this.getDeckCards(deckId);
  }

  async saveDeck(deck: Deck): Promise<ApiResponse<Deck>> {
    try {
      const decks = await this.getDecks();
      const existingIndex = decks.findIndex(d => d.id === deck.id);
      const isNew = existingIndex < 0;
      
      if (existingIndex >= 0) {
        decks[existingIndex] = { ...deck, modified: new Date().toISOString() };
      } else {
        decks.push({ ...deck, created: new Date().toISOString(), modified: new Date().toISOString() });
      }
      
      await this.writeJsonFile("decks/decks.json", { decks });
      
      // 🆕 确保数据写入完成后通知变更
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 🆕 通知数据同步服务
      if ((this.plugin as any).dataSyncService) {
        await (this.plugin as any).dataSyncService.notifyChange({
          type: 'decks',
          action: isNew ? 'create' : 'update',
          ids: [deck.id]
        });
      }
      
      return {
        success: true,
        data: deck,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Failed to save deck:", error);
      return {
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async deleteDeck(deckId: string): Promise<ApiResponse<boolean>> {
    try {
      console.log(`🗑️ 开始删除牌组: ${deckId}`);

      const decks = await this.getDecks();
      const filteredDecks = decks.filter(d => d.id !== deckId);

      // 1. 删除牌组索引
      await this.writeJsonFile("decks/decks.json", { decks: filteredDecks });
      console.log(`✅ 已从牌组索引中移除: ${deckId}`);

      // 2. 删除该牌组的所有卡片与媒体目录
      await this.deleteCardsByDeck(deckId);
      try {
        await (this.plugin.app.vault.adapter as any).rmdir?.(`${this.dataFolder}/decks/${deckId}/media`, true);
        console.log(`✅ 已删除媒体目录: ${deckId}`);
      } catch {}
      try {
        await (this.plugin.app.vault.adapter as any).rmdir?.(`${this.dataFolder}/decks/${deckId}`, true);
        console.log(`✅ 已删除牌组目录: ${deckId}`);
      } catch {}

      // 3. 清理相关的学习会话数据
      await this.cleanupStudySessionsByDeck(deckId);

      // 4. 清理媒体文件
      await this.cleanupDeckMediaFiles(deckId);

      // 5. 通知分析服务清理缓存
      await this.notifyDeckDeletion(deckId);

      console.log(`🎉 牌组删除完成: ${deckId}`);
      
      // 🆕 确保数据写入完成后通知变更
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 🆕 通知数据同步服务
      if ((this.plugin as any).dataSyncService) {
        await (this.plugin as any).dataSyncService.notifyChange({
          type: 'decks',
          action: 'delete',
          ids: [deckId]
        });
      }

      return {
        success: true,
        data: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Failed to delete deck:", error);
      return {
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // 卡片操作
  async getCards(query?: DataQuery): Promise<Card[]> {
    try {
      // 若指定了 deckId，优先走分片
      if (query?.deckId) {
        const cards = await this.getDeckCards(query.deckId);
        return query ? this.filterCards(cards, query) : cards;
      }
      // 未指定 deckId：优先遍历 decks.json 聚合所有分片
      const decks = await this.getDecks();
      let all: Card[] = [];
      for (const d of decks) {
        try {
          const part = await this.getDeckCards(d.id);
          all = all.concat(part);
        } catch {}
      }
      return query ? this.filterCards(all, query) : all;
    } catch (error) {
      console.error("Failed to get cards:", error);
      return [];
    }
  }

  async saveCard(card: Card): Promise<ApiResponse<Card>> {
    try {
      // 优先写入到对应牌组分片
      const deckId = card.deckId;
      if (deckId) {
        const cards = await this.getDeckCards(deckId);
        const idx = cards.findIndex((c) => c.id === card.id);
        const now = new Date();
        const isNew = idx < 0;
        if (idx >= 0) cards[idx] = { ...card, modified: now.toISOString() };
        else cards.push({ ...card, created: now.toISOString(), modified: now.toISOString() });
        await this.saveDeckCards(deckId, cards);
        
        // 🆕 确保数据写入完成后通知变更
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // 🆕 通知数据同步服务
        if ((this.plugin as any).dataSyncService) {
          await (this.plugin as any).dataSyncService.notifyChange({
            type: 'cards',
            action: isNew ? 'create' : 'update',
            ids: [card.id],
            metadata: { deckId: card.deckId }
          });
        }
      } else {
        // 必须指定 deckId
        throw new Error("saveCard requires deckId");
      }
      // 触发卡片变更时的自动同步
      if ((this.plugin as any).autoSyncManager) {
        (this.plugin as any).autoSyncManager.onCardChange(card.deckId);
      }

      return { success: true, data: card, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error("Failed to save card:", error);
      return { success: false, error: (error as any).message, timestamp: new Date().toISOString() } as any;
    }
  }

  async deleteCard(cardId: string): Promise<ApiResponse<boolean>> {
    try {
      // 找到卡片所在牌组
      const allDecks = await this.getDecks();
      let deletedDeckId: string | undefined;
      
      for (const d of allDecks) {
        const cards = await this.getDeckCards(d.id);
        const before = cards.length;
        const next = cards.filter((c) => c.id !== cardId);
        if (next.length !== before) {
          await this.saveDeckCards(d.id, next);
          deletedDeckId = d.id;
          break;
        }
      }
      
      if (deletedDeckId) {
        // 🆕 确保数据写入完成后通知变更
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // 🆕 通知数据同步服务
        if ((this.plugin as any).dataSyncService) {
          await (this.plugin as any).dataSyncService.notifyChange({
            type: 'cards',
            action: 'delete',
            ids: [cardId],
            metadata: { deckId: deletedDeckId }
          });
        }
        
        return { success: true, data: true, timestamp: new Date().toISOString() };
      }
      
      // 取消旧全量文件的回退写入
      return { success: true, data: false, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error("Failed to delete card:", error);
      return { success: false, error: (error as any).message, timestamp: new Date().toISOString() } as any;
    }
  }

  private async deleteCardsByDeck(deckId: string): Promise<void> {
    // 删除该牌组分片文件
    try {
      const p = `${this.dataFolder}/decks/${deckId}/cards.json`;
      if (await this.exists(p)) await (this.plugin.app.vault.adapter as any).remove(p);
    } catch {}
  }

  /**
   * 清理指定牌组的学习会话数据
   */
  private async cleanupStudySessionsByDeck(deckId: string): Promise<void> {
    try {
      console.log(`🧹 开始清理牌组学习会话数据: ${deckId}`);

      const sessionsDir = `${this.dataFolder}/learning/sessions`;
      const listing = await (this.plugin.app.vault.adapter as any).list(sessionsDir);
      const files: string[] = listing?.files || [];
      const jsonFiles = files.filter((p) => /learning\/sessions\/\d{4}-\d{2}\.json$/.test(p));

      let totalCleaned = 0;

      for (const filePath of jsonFiles) {
        try {
          const raw = await this.plugin.app.vault.adapter.read(filePath);
          const data = JSON.parse(raw);
          const sessions: StudySession[] = data?.sessions || [];

          // 过滤掉属于被删除牌组的会话
          const beforeCount = sessions.length;
          const filteredSessions = sessions.filter(session => session.deckId !== deckId);
          const cleanedCount = beforeCount - filteredSessions.length;

          if (cleanedCount > 0) {
            // 更新文件
            const updatedData = {
              ...data,
              sessions: filteredSessions
            };
            await this.plugin.app.vault.adapter.write(filePath, JSON.stringify(updatedData, null, 2));
            totalCleaned += cleanedCount;
            console.log(`✅ 从 ${filePath} 清理了 ${cleanedCount} 个会话记录`);
          }
        } catch (error) {
          console.warn(`⚠️ 清理会话文件失败: ${filePath}`, error);
        }
      }

      console.log(`🎉 学习会话数据清理完成，共清理 ${totalCleaned} 个记录`);
    } catch (error) {
      console.error(`❌ 清理学习会话数据失败: ${deckId}`, error);
    }
  }

  /**
   * 清理指定牌组的媒体文件
   */
  private async cleanupDeckMediaFiles(deckId: string): Promise<void> {
    try {
      // 使用媒体文件处理器清理
      const mediaHandler = (this.plugin as any).mediaFileHandler;
      if (mediaHandler && typeof mediaHandler.cleanupDeckMedia === 'function') {
        await mediaHandler.cleanupDeckMedia(deckId);
        console.log(`✅ 媒体文件清理完成: ${deckId}`);
      }
    } catch (error) {
      console.warn(`⚠️ 媒体文件清理失败: ${deckId}`, error);
    }
  }

  /**
   * 通知相关服务牌组已删除
   */
  private async notifyDeckDeletion(deckId: string): Promise<void> {
    try {
      // 通知分析服务清理缓存
      const analyticsService = (this.plugin as any).analyticsService;
      if (analyticsService && typeof analyticsService.onDeckDeleted === 'function') {
        analyticsService.onDeckDeleted(deckId);
        console.log(`✅ 已通知分析服务清理缓存: ${deckId}`);
      }

      // 通知自动同步管理器
      const autoSyncManager = (this.plugin as any).autoSyncManager;
      if (autoSyncManager && typeof autoSyncManager.onDeckDeleted === 'function') {
        autoSyncManager.onDeckDeleted(deckId);
        console.log(`✅ 已通知同步管理器: ${deckId}`);
      }
    } catch (error) {
      console.warn(`⚠️ 通知服务失败: ${deckId}`, error);
    }
  }

  // 学习会话操作
  async saveStudySession(session: StudySession): Promise<ApiResponse<StudySession>> {
    try {
      // 写入月分片 learning/sessions/YYYY-MM.json
      const d = new Date(session.startTime || new Date().toISOString());
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const rel = `learning/sessions/${ym}.json`;
      // 确保目录存在
      try { await this.ensureFolder(`${this.dataFolder}/learning`); } catch {}
      try { await this.ensureFolder(`${this.dataFolder}/learning/sessions`); } catch {}
      // 读现有分片（若不存在则新建）
      let chunk: any = { _schemaVersion: "1.0.0", yearMonth: ym, sessions: [] };
      try { chunk = await this.readJsonFile(rel); } catch {}
      const arr: StudySession[] = Array.isArray(chunk.sessions) ? chunk.sessions : [];
      const idx = arr.findIndex((s) => s.id === session.id);
      const isNew = idx < 0;
      if (idx >= 0) arr[idx] = session; else arr.push(session);
      await this.writeJsonFile(rel, { _schemaVersion: "1.0.0", yearMonth: ym, sessions: arr });
      
      // 🆕 确保数据写入完成后通知变更
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 🆕 通知数据同步服务
      if ((this.plugin as any).dataSyncService) {
        await (this.plugin as any).dataSyncService.notifyChange({
          type: 'sessions',
          action: isNew ? 'create' : 'update',
          ids: [session.id],
          metadata: { deckId: session.deckId }
        });
      }
      
      return { success: true, data: session, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error("Failed to save study session:", error);
      return { success: false, error: (error as any).message, timestamp: new Date().toISOString() } as any;
    }
  }

  // 用户配置操作
  async getUserProfile(): Promise<UserProfile> {
    try {
      const data = await this.readJsonFile("profile/user-profile.json");
      return data.profile;
    } catch (error) {
      console.error("Failed to get user profile:", error);
      return this.createDefaultUserProfile().profile;
    }
  }

  async saveUserProfile(profile: UserProfile): Promise<ApiResponse<UserProfile>> {
    try {
      await this.writeJsonFile("profile/user-profile.json", { profile });
      
      return {
        success: true,
        data: profile,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Failed to save user profile:", error);
      return {
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // 数据导入/导出
  async exportData(): Promise<AnkiExportData> {
    const [decks, cards, userProfile] = await Promise.all([
      this.getDecks(),
      this.getCards(),
      this.getUserProfile()
    ]);

    return {
      version: "1.0.0",
      exportDate: new Date().toISOString(),
      decks,
      cards,
      userProfile
    };
  }

  async importData(data: AnkiExportData): Promise<ApiResponse<boolean>> {
    try {
      // 备份当前数据
      await this.createBackup();
      
      // 导入新数据
      await this.writeJsonFile("decks/decks.json", { decks: data.decks });
      // 将导入的卡片按牌组落入分片
      const byDeck = new Map<string, Card[]>();
      for (const c of (data.cards || [])) {
        const list = byDeck.get(c.deckId) || []; list.push(c); byDeck.set(c.deckId, list);
      }
      for (const [deckId, list] of byDeck.entries()) await this.saveDeckCards(deckId, list);
      // 仅写入分片结构
      await this.writeJsonFile("profile/user-profile.json", { profile: data.userProfile });
      
      return {
        success: true,
        data: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Failed to import data:", error);
      return {
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // 数据备份
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolder = `${this.dataFolder}/backups/${timestamp}`;
    
    await this.plugin.app.vault.createFolder(backupFolder);
    
    // 使用正确的扁平文件结构
    const fileMapping = [
      { source: "decks/decks.json", target: "decks.json" },
      { source: "cards/cards.json", target: "cards.json" },
      { source: "profile/user-profile.json", target: "profile.json" }
    ];
    
    for (const { source, target } of fileMapping) {
      try {
        const sourceContent = await this.readFileContent(source);
        await this.plugin.app.vault.create(`${backupFolder}/${target}`, sourceContent);
      } catch (error) {
        console.warn(`备份文件失败: ${source}`, error);
        // 如果文件不存在，创建空数组
        await this.plugin.app.vault.create(`${backupFolder}/${target}`, '[]');
      }
    }
    
    // 备份保留策略
    await this.pruneBackups();
    
    return backupFolder;
  }

  // 导出为 Anki revlog 风格的 JSON（基本映射）
  async exportAsAnkiRevlog(): Promise<any[]> {
    const cards = await this.getCards();
    const rows: any[] = [];
    for (const c of cards) {
      for (const log of (c.reviewHistory || [])) {
        rows.push({
          id: new Date(log.review).getTime(), // 近似映射
          cid: c.id,
          button: log.rating, // 1..4
          ivl: Math.round(log.scheduledDays || 0),
          lastIvl: Math.round(log.lastElapsedDays || 0),
          time: 0,
          type: ((): number => {
            switch (log.state) {
              case 0: return 0; // learn
              case 1: return 0; // learn
              case 2: return 1; // review
              case 3: return 2; // relearn
              default: return 1;
            }
          })()
        });
      }
    }
    return rows;
  }

  // 扫描日志重建状态（当前基于卡片内 reviewHistory）
  async rebuildStatesFromLogs(): Promise<void> {
    const cards = await this.getCards();
    for (const c of cards) {
      // 以日志的最后一次为准回填基本指标（简单实现，可替换为严格重放）
      if (c.reviewHistory && c.reviewHistory.length > 0) {
        const last = c.reviewHistory[c.reviewHistory.length - 1];
        c.fsrs.elapsedDays = last.lastElapsedDays;
        c.fsrs.scheduledDays = last.scheduledDays;
        c.fsrs.lastReview = last.review;
        // due 根据 scheduledDays 推算
        const d = new Date(last.review);
        d.setDate(d.getDate() + Math.max(0, Math.round(last.scheduledDays || 0)));
        c.fsrs.due = d.toISOString();
      }
      await this.saveCard(c);
    }
  }

  // 修剪备份：保留最近 N 个
  private async pruneBackups(): Promise<void> {
    const retention: number = (this.plugin as any)?.settings?.backupRetentionCount ?? 10;
    const parent = `${this.dataFolder}/backups`;
    try {
      const listing = await (this.plugin.app.vault.adapter as any).list(parent);
      const folders: string[] = listing?.folders ?? [];
      if (!Array.isArray(folders) || folders.length <= retention) return;
      const sorted = folders.slice().sort(); // 时间戳名称，字典序即时间序
      const toDelete = sorted.slice(0, Math.max(0, folders.length - retention));
      for (const folder of toDelete) {
        // 删除该备份文件夹内已知文件
        const files = [
          "decks/decks.json",
          "profile/user-profile.json"
        ];
        for (const f of files) {
          const p = `${folder}/${f}`;
          if (await this.exists(p)) {
            await this.plugin.app.vault.adapter.remove(p);
          }
        }
        // 删除空文件夹
        if ((this.plugin.app.vault.adapter as any).rmdir) {
          await (this.plugin.app.vault.adapter as any).rmdir(folder, true);
        } else {
          // 尝试删除文件夹同名文件（容错）
          try { await this.plugin.app.vault.adapter.remove(folder); } catch {}
        }
      }
    } catch (e) {
      console.warn("Backup pruning skipped:", e);
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      // adapter.stat(path) 存在则返回信息
      const stat = await (this.plugin.app.vault.adapter as any).stat(path);
      return !!stat;
    } catch {
      return false;
    }
  }


  // 变更数据目录（平移现有文件）
  async migrateDataFolder(newFolder: string): Promise<boolean> {
    const oldFolder = this.dataFolder;
    if (newFolder === oldFolder) return true;
    try {
      await this.plugin.app.vault.createFolder(newFolder);
    } catch {}
    const files = [
      "decks/decks.json",
      "profile/user-profile.json"
    ];
    for (const fileName of files) {
      const oldPath = `${oldFolder}/${fileName}`;
      const newPath = `${newFolder}/${fileName}`;
      try {
        const content = await this.plugin.app.vault.adapter.read(oldPath);
        const existsNew = await this.exists(newPath);
        if (!existsNew) {
          await this.plugin.app.vault.adapter.write(newPath, content);
        } else {
          // 覆盖策略：以旧为准覆盖新
          await this.plugin.app.vault.adapter.write(newPath, content);
        }
      } catch (e) {
        console.warn(`Skip migrating missing file: ${oldPath}`, e);
      }
    }

    // 更新当前数据目录与插件设置
    this.dataFolder = newFolder;
    try {
      (this.plugin as any).settings.dataFolder = newFolder;
      await (this.plugin as any).saveSettings?.();
    } catch {}
    return true;
  }

  // 工具方法
  private async readJsonFile(fileName: string): Promise<any> {
    const content = await this.readFileContent(fileName);
    return JSON.parse(content);
  }

  private async writeJsonFile(fileName: string, data: any): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    const filePath = `${this.dataFolder}/${fileName}`;
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    
    if (file instanceof TFile) {
      await this.plugin.app.vault.modify(file, content);
    } else {
      try {
        await this.plugin.app.vault.create(filePath, content);
      } catch (error) {
        // 如果文件在创建过程中已经被其他进程创建，尝试修改现有文件
        if (error && (
          (error as any).message?.includes("already exists") || 
          (error as any).message?.includes("File already exists") ||
          error.toString().includes("already exists")
        )) {
          const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
          if (existingFile instanceof TFile) {
            await this.plugin.app.vault.modify(existingFile, content);
          } else {
            // 如果仍然无法找到文件，重新抛出错误
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * 🔧 新增：直接更新已存在文件的内容
   */
  private async updateExistingDeckFile(fileName: string, data: any): Promise<void> {
    const filePath = `${this.dataFolder}/${fileName}`;
    const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);

    if (existingFile instanceof TFile) {
      // 文件存在，直接更新内容
      const content = JSON.stringify(data, null, 2);
      await this.plugin.app.vault.modify(existingFile, content);
      console.log(`✅ 成功更新文件内容: ${fileName}`);
    } else {
      // 文件不存在，使用常规创建方法
      console.log(`ℹ️ 文件不存在，使用常规创建: ${fileName}`);
      await this.writeJsonFile(fileName, data);
    }
  }


  // ===== 新增：公开读取学习会话（按时间窗口 + 月分片） =====
  async getStudySessions(range?: { since?: string; until?: string }): Promise<StudySession[]> {
    const sessionsDir = `${this.dataFolder}/learning/sessions`;
    let items: StudySession[] = [];
    try {
      const listing = await (this.plugin.app.vault.adapter as any).list(sessionsDir);
      const files: string[] = listing?.files || [];
      const jsonFiles = files.filter((p) => /learning\/sessions\/\d{4}-\d{2}\.json$/.test(p));
      for (const p of jsonFiles) {
        try {
          const raw = await this.plugin.app.vault.adapter.read(p);
          const data = JSON.parse(raw);
          const chunk: StudySession[] = data?.sessions || [];
          items.push(...chunk);
        } catch {}
      }
    } catch {}
    if (range?.since || range?.until) {
      items = items.filter((s) => {
        const t = new Date(s.startTime).getTime();
        if (range?.since && t < new Date(range.since).getTime()) return false;
        if (range?.until && t > new Date(range.until).getTime()) return false;
        return true;
      });
    }
    return items;
  }

  // ===== 新增：牌组级卡片读写（分片） =====
  async getDeckCards(deckId: string): Promise<Card[]> {
    try {
      const data = await this.readJsonFile(`decks/${deckId}/cards.json`);
      return (data.cards || []).map((c: Card) => c);
    } catch { return []; }
  }

  private async ensureFolder(path: string): Promise<void> {
    try {
      await this.plugin.app.vault.createFolder(path);
    } catch {}
  }

  private deckWriteQueue = new Map<string, Promise<void>>();
  
  private async enqueueDeckWrite(deckId: string, task: () => Promise<void>): Promise<void> {
    const prev = this.deckWriteQueue.get(deckId) || Promise.resolve();
    const next = prev.then(task).catch((e) => console.error("Deck write failed", e));
    this.deckWriteQueue.set(deckId, next);
    await next;
  }

  private async updateDeckIndexStats(deckId: string, cardCount: number): Promise<void> {
    try {
      const data = await this.readJsonFile("decks/decks.json");
      const decks = data.decks || [];
      const idx = decks.findIndex((d: any) => d.id === deckId);
      if (idx >= 0) {
        decks[idx].stats = decks[idx].stats || {};
        decks[idx].stats.cardCount = cardCount;
        decks[idx].modified = new Date().toISOString();
      }
      await this.writeJsonFile("decks/decks.json", { decks });
    } catch (e) {
      console.warn("updateDeckIndexStats failed", e);
    }
  }

  async saveDeckCards(deckId: string, cards: Card[]): Promise<void> {
    await this.ensureFolder(`${this.dataFolder}/decks/${deckId}`);
    await this.enqueueDeckWrite(deckId, async () => {
      const payload = { _schemaVersion: "1.0.0", deckId, cards };
      const content = JSON.stringify(payload, null, 2);
      const filePath = `${this.dataFolder}/decks/${deckId}/cards.json`;
      const tmp = `${filePath}.tmp`;
      const existing = this.plugin.app.vault.getAbstractFileByPath(filePath);
      await this.plugin.app.vault.adapter.write(tmp, content);
      if (existing instanceof TFile) {
        await this.plugin.app.vault.adapter.remove(filePath);
      }
      await this.plugin.app.vault.adapter.rename(tmp, filePath);
      await this.updateDeckIndexStats(deckId, cards.length);
    });
  }

  // 开发阶段：移除旧结构迁移实现

  private async readFileContent(fileName: string): Promise<string> {
    const filePath = `${this.dataFolder}/${fileName}`;
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      return await this.plugin.app.vault.read(file);
    }
    throw new Error(`File not found: ${filePath}`);
  }

  private filterCards(cards: Card[], query: DataQuery): Card[] {
    return cards.filter(card => {
      if (query.deckId && card.deckId !== query.deckId) return false;
      if (query.cardIds && !query.cardIds.includes(card.id)) return false;
      if (query.state !== undefined && card.fsrs.state !== query.state) return false;
      if (query.tags && (!card.tags || !query.tags.some(tag => card.tags?.includes(tag)))) return false;
      
      if (query.dueDate) {
        // 健壮的日期检查：确保 due 是一个有效的日期字符串
        if (!card.fsrs.due || Number.isNaN(Date.parse(card.fsrs.due))) {
          // 如果卡片没有到期日或者格式无效，则不符合任何日期范围查询
          return false;
        }
        const due = new Date(card.fsrs.due);
        if (query.dueDate.from && due < new Date(query.dueDate.from)) return false;
        if (query.dueDate.to && due > new Date(query.dueDate.to)) return false;
      }
      
      return true;
    });
  }

  // ===================================================================
  // 三位一体模板存储方法已迁移到 TriadTemplateService
  // ===================================================================



  // ===== 卡片查询方法 =====

  /**
   * 根据源文件获取卡片
   */
  async getCardsBySourceFile(filePath: string): Promise<Card[]> {
    try {
      const allCards = await this.getCards();
      return allCards.filter(card => card.sourceFile === filePath);
    } catch (error) {
      console.error("Failed to get cards by source file:", error);
      return [];
    }
  }

  /**
   * 获取所有卡片（别名方法）
   */
  async getAllCards(): Promise<Card[]> {
    return this.getCards();
  }

  /**
   * 🆕 通过UUID查找卡片（用于双向同步）
   */
  async getCardByUUID(uuid: string): Promise<Card | null> {
    try {
      const allCards = await this.getCards();
      const card = allCards.find(card => card.uuid === uuid);
      return card || null;
    } catch (error) {
      console.error("Failed to get card by UUID:", error);
      return null;
    }
  }

  /**
   * 根据模板ID获取卡片
   */
  async getCardsByTemplate(templateId: string): Promise<Card[]> {
    try {
      const allCards = await this.getCards();
      return allCards.filter(card => card.templateId === templateId);
    } catch (error) {
      console.error("Failed to get cards by template:", error);
      return [];
    }
  }


}
