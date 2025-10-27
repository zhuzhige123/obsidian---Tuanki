import type { DeckCategory } from './types';
import { DEFAULT_CATEGORIES } from './types';

/**
 * 牌组分类存储服务
 * 负责管理用户自定义的牌组分类
 */
export class CategoryStorage {
  private categories: DeckCategory[] = [];
  private storageKey = 'tuanki-deck-categories';
  private initialized = false;
  
  /**
   * 初始化分类数据
   * 首次使用时自动创建默认分类
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.categories = JSON.parse(stored);
        console.log('[CategoryStorage] 已加载分类数据:', this.categories.length);
      } else {
        // 首次使用，初始化默认分类
        this.categories = [...DEFAULT_CATEGORIES];
        await this.save();
        console.log('[CategoryStorage] 已初始化默认分类');
      }
      this.initialized = true;
    } catch (error) {
      console.error('[CategoryStorage] 初始化失败:', error);
      // 发生错误时使用默认分类
      this.categories = [...DEFAULT_CATEGORIES];
      this.initialized = true;
    }
  }
  
  /**
   * 获取所有分类（按order排序）
   */
  async getCategories(): Promise<DeckCategory[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return [...this.categories].sort((a, b) => a.order - b.order);
  }
  
  /**
   * 根据ID获取分类
   */
  async getCategoryById(id: string): Promise<DeckCategory | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.categories.find(c => c.id === id) || null;
  }
  
  /**
   * 创建新分类
   */
  async createCategory(
    category: Omit<DeckCategory, 'id' | 'created' | 'modified'>
  ): Promise<DeckCategory> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const newCategory: DeckCategory = {
      ...category,
      id: `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    };
    
    this.categories.push(newCategory);
    await this.save();
    console.log('[CategoryStorage] 已创建分类:', newCategory.name);
    return newCategory;
  }
  
  /**
   * 更新分类
   */
  async updateCategory(
    id: string,
    updates: Partial<Omit<DeckCategory, 'id' | 'created'>>
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error(`Category not found: ${id}`);
    }
    
    this.categories[index] = {
      ...this.categories[index],
      ...updates,
      modified: new Date().toISOString()
    };
    
    await this.save();
    console.log('[CategoryStorage] 已更新分类:', this.categories[index].name);
  }
  
  /**
   * 删除分类
   * 注意：默认分类不可删除
   */
  async deleteCategory(id: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const category = this.categories.find(c => c.id === id);
    if (!category) {
      throw new Error(`Category not found: ${id}`);
    }
    
    if (category.isDefault) {
      throw new Error('Cannot delete default category');
    }
    
    this.categories = this.categories.filter(c => c.id !== id);
    await this.save();
    console.log('[CategoryStorage] 已删除分类:', category.name);
  }
  
  /**
   * 重新排序分类
   */
  async reorderCategories(categoryIds: string[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 更新order字段
    categoryIds.forEach((id, index) => {
      const category = this.categories.find(c => c.id === id);
      if (category) {
        category.order = index;
        category.modified = new Date().toISOString();
      }
    });
    
    await this.save();
    console.log('[CategoryStorage] 已重新排序分类');
  }
  
  /**
   * 保存到 localStorage
   */
  private async save(): Promise<void> {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.categories));
    } catch (error) {
      console.error('[CategoryStorage] 保存失败:', error);
      throw error;
    }
  }
  
  /**
   * 重置为默认分类
   */
  async reset(): Promise<void> {
    this.categories = [...DEFAULT_CATEGORIES];
    await this.save();
    console.log('[CategoryStorage] 已重置为默认分类');
  }
}

// 单例实例
let instance: CategoryStorage | null = null;

/**
 * 获取分类存储服务的单例实例
 */
export function getCategoryStorage(): CategoryStorage {
  if (!instance) {
    instance = new CategoryStorage();
  }
  return instance;
}




