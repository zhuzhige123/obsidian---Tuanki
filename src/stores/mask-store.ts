/**
 * 遮罩数据中心化Store
 * 
 * 功能：
 * - 管理所有遮罩数据（单一数据源）
 * - 处理遮罩CRUD操作
 * - 管理选中状态
 * - 支持撤销/重做功能
 * - 使用Svelte 5 Runes实现响应式
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import { generateMaskId } from '../services/image-mask/MaskDataParser';
import type { Mask } from '../types/image-mask-types';

/**
 * 历史记录类型
 */
interface MaskHistory {
  past: Mask[][];
  future: Mask[][];
}

/**
 * 遮罩Store类
 * 使用Svelte 5 Runes管理状态
 */
export class MaskStore {
  // ===== 核心状态 =====
  
  /** 所有遮罩数据（单一数据源） */
  masks = $state<Mask[]>([]);
  
  /** 当前选中的遮罩ID */
  selectedId = $state<string | null>(null);
  
  /** 正在绘制的临时遮罩 */
  activeDrawing = $state<Partial<Mask> | null>(null);
  
  /** 历史记录（用于撤销/重做） */
  private history = $state<MaskHistory>({
    past: [],
    future: []
  });
  
  // ===== 派生状态 =====
  
  /** 当前选中的遮罩对象 */
  selectedMask = $derived(
    this.masks.find(m => m.id === this.selectedId) ?? null
  );
  
  /** 遮罩总数 */
  maskCount = $derived(this.masks.length);
  
  /** 是否有选中的遮罩 */
  hasSelection = $derived(this.selectedId !== null);
  
  /** 是否可以撤销 */
  canUndo = $derived(this.history.past.length > 0);
  
  /** 是否可以重做 */
  canRedo = $derived(this.history.future.length > 0);
  
  // ===== 构造函数 =====
  
  constructor(initialMasks: Mask[] = []) {
    this.masks = [...initialMasks];
  }
  
  // ===== CRUD 操作 =====
  
  /**
   * 添加遮罩
   */
  addMask(mask: Mask): void {
    this.saveHistory();
    this.masks = [...this.masks, mask];
    this.selectedId = mask.id;
    console.log('[MaskStore] 添加遮罩:', mask.id);
  }
  
  /**
   * 批量添加遮罩
   */
  addMasks(masks: Mask[]): void {
    if (masks.length === 0) return;
    this.saveHistory();
    this.masks = [...this.masks, ...masks];
    console.log('[MaskStore] 批量添加遮罩:', masks.length);
  }
  
  /**
   * 更新遮罩
   */
  updateMask(id: string, updates: Partial<Mask>): void {
    const index = this.masks.findIndex(m => m.id === id);
    if (index === -1) {
      console.warn('[MaskStore] 未找到遮罩:', id);
      return;
    }
    
    this.saveHistory();
    const updatedMasks = [...this.masks];
    updatedMasks[index] = {
      ...updatedMasks[index],
      ...updates
    };
    this.masks = updatedMasks;
    console.log('[MaskStore] 更新遮罩:', id);
  }
  
  /**
   * 删除遮罩
   */
  deleteMask(id: string): void {
    const index = this.masks.findIndex(m => m.id === id);
    if (index === -1) {
      console.warn('[MaskStore] 未找到遮罩:', id);
      return;
    }
    
    this.saveHistory();
    this.masks = this.masks.filter(m => m.id !== id);
    
    // 如果删除的是选中的遮罩，清除选中状态
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    
    console.log('[MaskStore] 删除遮罩:', id);
  }
  
  /**
   * 删除所有遮罩
   */
  clearAll(): void {
    if (this.masks.length === 0) return;
    
    this.saveHistory();
    this.masks = [];
    this.selectedId = null;
    console.log('[MaskStore] 清空所有遮罩');
  }
  
  /**
   * 获取遮罩
   */
  getMask(id: string): Mask | null {
    return this.masks.find(m => m.id === id) ?? null;
  }
  
  /**
   * 替换所有遮罩
   */
  setMasks(masks: Mask[]): void {
    this.masks = [...masks];
    this.selectedId = null;
    // 不记录历史，用于加载初始数据
  }
  
  // ===== 选择操作 =====
  
  /**
   * 选中遮罩
   */
  selectMask(id: string | null): void {
    this.selectedId = id;
    console.log('[MaskStore] 选中遮罩:', id);
  }
  
  /**
   * 取消选中
   */
  clearSelection(): void {
    this.selectedId = null;
    console.log('[MaskStore] 取消选中');
  }
  
  /**
   * 选择下一个遮罩
   */
  selectNext(): void {
    if (this.masks.length === 0) return;
    
    const currentIndex = this.masks.findIndex(m => m.id === this.selectedId);
    const nextIndex = (currentIndex + 1) % this.masks.length;
    this.selectedId = this.masks[nextIndex].id;
  }
  
  /**
   * 选择上一个遮罩
   */
  selectPrevious(): void {
    if (this.masks.length === 0) return;
    
    const currentIndex = this.masks.findIndex(m => m.id === this.selectedId);
    const prevIndex = currentIndex <= 0 ? this.masks.length - 1 : currentIndex - 1;
    this.selectedId = this.masks[prevIndex].id;
  }
  
  // ===== 历史记录操作 =====
  
  /**
   * 保存当前状态到历史记录
   */
  private saveHistory(): void {
    // 保存当前状态到过去
    this.history.past = [...this.history.past, [...this.masks]];
    
    // 清空未来（新操作会覆盖重做历史）
    this.history.future = [];
    
    // 限制历史记录数量（最多50步）
    if (this.history.past.length > 50) {
      this.history.past = this.history.past.slice(-50);
    }
  }
  
  /**
   * 撤销操作
   */
  undo(): void {
    if (!this.canUndo) return;
    
    // 保存当前状态到未来
    this.history.future = [[...this.masks], ...this.history.future];
    
    // 恢复过去的状态
    const past = [...this.history.past];
    const previousState = past.pop();
    this.history.past = past;
    
    if (previousState) {
      this.masks = [...previousState];
      this.selectedId = null;
      console.log('[MaskStore] 撤销操作');
    }
  }
  
  /**
   * 重做操作
   */
  redo(): void {
    if (!this.canRedo) return;
    
    // 保存当前状态到过去
    this.history.past = [...this.history.past, [...this.masks]];
    
    // 恢复未来的状态
    const future = [...this.history.future];
    const nextState = future.shift();
    this.history.future = future;
    
    if (nextState) {
      this.masks = [...nextState];
      this.selectedId = null;
      console.log('[MaskStore] 重做操作');
    }
  }
  
  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.history = {
      past: [],
      future: []
    };
  }
  
  // ===== 高级操作 =====
  
  /**
   * 复制选中的遮罩
   */
  duplicateSelected(): Mask | null {
    if (!this.selectedMask) return null;
    
    const duplicated: Mask = {
      ...this.selectedMask,
      id: generateMaskId(),
      // 稍微偏移位置，避免完全重叠
      x: Math.min(this.selectedMask.x + 0.02, 0.98),
      y: Math.min(this.selectedMask.y + 0.02, 0.98)
    };
    
    this.addMask(duplicated);
    return duplicated;
  }
  
  /**
   * 移动遮罩到指定位置（在列表中）
   */
  moveMask(id: string, newIndex: number): void {
    const currentIndex = this.masks.findIndex(m => m.id === id);
    if (currentIndex === -1) return;
    
    this.saveHistory();
    const mask = this.masks[currentIndex];
    const newMasks = this.masks.filter(m => m.id !== id);
    newMasks.splice(newIndex, 0, mask);
    this.masks = newMasks;
  }
  
  /**
   * 获取遮罩在列表中的索引
   */
  getMaskIndex(id: string): number {
    return this.masks.findIndex(m => m.id === id);
  }
  
  /**
   * 导出为JSON
   */
  toJSON(): Mask[] {
    return [...this.masks];
  }
  
  /**
   * 从JSON导入
   */
  fromJSON(data: Mask[]): void {
    this.setMasks(data);
    this.clearHistory();
  }
}

/**
 * 创建MaskStore实例的便捷函数
 */
export function createMaskStore(initialMasks: Mask[] = []): MaskStore {
  return new MaskStore(initialMasks);
}


