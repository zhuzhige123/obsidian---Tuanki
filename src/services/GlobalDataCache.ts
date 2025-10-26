/**
 * 全局数据缓存管理器
 * 
 * 职责：预加载和缓存插件常用数据，避免组件重复加载
 * 优化目标：消除 CreateCardModal 和 InlineCardEditor 的重复数据加载（~700ms）
 * 
 * @author Tuanki Team
 * @date 2025-01-06
 */

import type AnkiPlugin from '../main';
import type { Deck } from '../data/types';
import type { FieldTemplate } from '../data/template-types';
import { templateStore } from '../stores/TemplateStore';

/**
 * 缓存状态
 */
interface CacheState {
  /** 牌组缓存 */
  decks: Deck[] | null;
  /** 模板缓存 */
  templates: FieldTemplate[] | null;
  /** 缓存时间戳 */
  timestamp: number;
  /** 是否正在加载 */
  isLoading: boolean;
}

/**
 * 全局数据缓存管理器（单例）
 */
export class GlobalDataCache {
  private static instance: GlobalDataCache;
  
  // 缓存状态
  private state: CacheState = {
    decks: null,
    templates: null,
    timestamp: 0,
    isLoading: false
  };
  
  // 加载 Promise（用于避免并发重复加载）
  private loadPromise: Promise<void> | null = null;
  
  // 缓存配置
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存有效期
  
  /**
   * 获取单例实例
   */
  static getInstance(): GlobalDataCache {
    if (!GlobalDataCache.instance) {
      GlobalDataCache.instance = new GlobalDataCache();
    }
    return GlobalDataCache.instance;
  }
  
  /**
   * 私有构造函数（单例模式）
   */
  private constructor() {
    console.log('[GlobalDataCache] 初始化全局数据缓存管理器');
  }
  
  /**
   * 应用启动时预加载数据
   * 
   * @param plugin 插件实例
   */
  async preload(plugin: AnkiPlugin): Promise<void> {
    // 如果正在加载，返回现有的 Promise
    if (this.loadPromise) {
      console.log('[GlobalDataCache] 数据预加载已在进行中，等待完成...');
      return this.loadPromise;
    }
    
    // 如果缓存有效，直接返回
    if (this.isCacheValid()) {
      console.log('[GlobalDataCache] 缓存仍然有效，跳过预加载');
      return;
    }
    
    console.log('[GlobalDataCache] 开始预加载数据...');
    const startTime = Date.now();
    
    this.state.isLoading = true;
    
    this.loadPromise = (async () => {
      try {
        // 并行加载牌组和模板数据
        const [decks, templates] = await Promise.all([
          this.loadDecks(plugin),
          this.loadTemplates(plugin)
        ]);
        
        // 更新缓存
        this.state.decks = decks;
        this.state.templates = templates;
        this.state.timestamp = Date.now();
        
        const duration = Date.now() - startTime;
        console.log(`[GlobalDataCache] 数据预加载完成: ${duration}ms`, {
          decks: decks.length,
          templates: templates.length
        });
        
      } catch (error) {
        console.error('[GlobalDataCache] 数据预加载失败:', error);
        // 预加载失败不影响应用启动，组件会降级到直接加载
      } finally {
        this.state.isLoading = false;
        this.loadPromise = null;
      }
    })();
    
    return this.loadPromise;
  }
  
  /**
   * 获取牌组列表（带缓存）
   * 
   * @param plugin 插件实例
   * @param forceRefresh 是否强制刷新缓存
   * @returns 牌组列表
   */
  async getDecks(plugin: AnkiPlugin, forceRefresh = false): Promise<Deck[]> {
    // 如果强制刷新或缓存无效，重新加载
    if (forceRefresh || !this.isCacheValid() || !this.state.decks) {
      console.log('[GlobalDataCache] 牌组缓存无效，重新加载...');
      
      // 如果正在预加载，等待完成
      if (this.loadPromise) {
        await this.loadPromise;
      } else {
        const decks = await this.loadDecks(plugin);
        this.state.decks = decks;
        this.state.timestamp = Date.now();
      }
    }
    
    return this.state.decks || [];
  }
  
  /**
   * 获取模板列表（带缓存）
   * 
   * @param forceRefresh 是否强制刷新缓存
   * @returns 模板列表
   */
  async getTemplates(forceRefresh = false): Promise<FieldTemplate[]> {
    // 如果强制刷新或缓存无效，重新加载
    if (forceRefresh || !this.isCacheValid() || !this.state.templates) {
      console.log('[GlobalDataCache] 模板缓存无效，重新加载...');
      
      // 如果正在预加载，等待完成
      if (this.loadPromise) {
        await this.loadPromise;
      } else {
        // 直接从 templateStore 获取
        const state = templateStore.getCurrentState();
        this.state.templates = state.fieldTemplates || [];
        this.state.timestamp = Date.now();
      }
    }
    
    return this.state.templates || [];
  }
  
  /**
   * 手动刷新缓存
   * 
   * @param plugin 插件实例
   */
  async refresh(plugin: AnkiPlugin): Promise<void> {
    console.log('[GlobalDataCache] 手动刷新缓存...');
    this.clear();
    await this.preload(plugin);
  }
  
  /**
   * 清除缓存
   */
  clear(): void {
    console.log('[GlobalDataCache] 清除缓存');
    this.state.decks = null;
    this.state.templates = null;
    this.state.timestamp = 0;
    this.loadPromise = null;
  }
  
  /**
   * 检查缓存是否有效
   */
  private isCacheValid(): boolean {
    if (this.state.timestamp === 0) {
      return false;
    }
    
    const age = Date.now() - this.state.timestamp;
    return age < this.CACHE_TTL;
  }
  
  /**
   * 加载牌组数据
   */
  private async loadDecks(plugin: AnkiPlugin): Promise<Deck[]> {
    try {
      const decks = await plugin.dataStorage.getAllDecks();
      console.log(`[GlobalDataCache] 牌组数据加载完成: ${decks.length} 个牌组`);
      return decks;
    } catch (error) {
      console.error('[GlobalDataCache] 加载牌组失败:', error);
      return [];
    }
  }
  
  /**
   * 加载模板数据
   */
  private async loadTemplates(plugin: AnkiPlugin): Promise<FieldTemplate[]> {
    try {
      // 强制加载模板（确保最新数据）
      await templateStore.loadTemplates(plugin, true);
      
      // 从 store 获取模板列表
      const state = templateStore.getCurrentState();
      const templates = state.fieldTemplates || [];
      
      console.log(`[GlobalDataCache] 模板数据加载完成: ${templates.length} 个模板`);
      return templates;
    } catch (error) {
      console.error('[GlobalDataCache] 加载模板失败:', error);
      return [];
    }
  }
}

/**
 * 导出单例实例的便捷访问方法
 */
export const globalDataCache = GlobalDataCache.getInstance();


