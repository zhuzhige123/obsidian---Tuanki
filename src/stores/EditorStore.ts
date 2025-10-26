/**
 * 编辑器状态管理
 * 
 * 管理内嵌编辑器的全局状态，提供统一的编辑器控制接口
 */

import type { Card } from '../data/types';
import type { LoadingState, SaveState } from '../types/editor-types';

interface EditorState {
  /** 当前编辑的卡片ID */
  currentCardId: string | null;
  
  /** 编辑模式 */
  mode: 'create' | 'edit' | null;
  
  /** 加载状态 */
  loadingState: LoadingState;
  
  /** 保存状态 */
  saveState: SaveState;
  
  /** 是否显示编辑器 */
  isVisible: boolean;
  
  /** 显示模式 */
  displayMode: 'inline' | 'fullscreen';
  
  /** 错误信息 */
  error: string | null;
}

class EditorStoreManager {
  private state: EditorState = $state({
    currentCardId: null,
    mode: null,
    loadingState: 'idle',
    saveState: 'idle',
    isVisible: false,
    displayMode: 'fullscreen',
    error: null
  });

  /**
   * 获取当前状态（只读）
   */
  getState(): Readonly<EditorState> {
    return this.state;
  }

  /**
   * 打开编辑器
   */
  openEditor(cardId: string, mode: 'create' | 'edit', displayMode: 'inline' | 'fullscreen' = 'fullscreen'): void {
    console.log('[EditorStore] 打开编辑器:', { cardId, mode, displayMode });
    
    this.state.currentCardId = cardId;
    this.state.mode = mode;
    this.state.displayMode = displayMode;
    this.state.isVisible = true;
    this.state.loadingState = 'idle';
    this.state.saveState = 'idle';
    this.state.error = null;
  }

  /**
   * 关闭编辑器
   */
  closeEditor(): void {
    console.log('[EditorStore] 关闭编辑器');
    
    this.state.currentCardId = null;
    this.state.mode = null;
    this.state.isVisible = false;
    this.state.loadingState = 'idle';
    this.state.saveState = 'idle';
    this.state.error = null;
  }

  /**
   * 设置加载状态
   */
  setLoadingState(state: LoadingState): void {
    this.state.loadingState = state;
  }

  /**
   * 设置保存状态
   */
  setSaveState(state: SaveState): void {
    this.state.saveState = state;
  }

  /**
   * 设置错误
   */
  setError(error: string | null): void {
    this.state.error = error;
    if (error) {
      this.state.loadingState = 'error';
    }
  }

  /**
   * 检查是否有卡片正在编辑
   */
  isEditing(): boolean {
    return this.state.isVisible && this.state.currentCardId !== null;
  }

  /**
   * 获取当前编辑的卡片ID
   */
  getCurrentCardId(): string | null {
    return this.state.currentCardId;
  }

  /**
   * 重置状态
   */
  reset(): void {
    console.log('[EditorStore] 重置状态');
    this.closeEditor();
  }
}

/**
 * 编辑器状态管理单例
 */
export const editorStore = new EditorStoreManager();

/**
 * 类型导出
 */
export type { EditorState };







