/**
 * Tuanki筛选器视图
 * 显示在Obsidian全局侧边栏中的筛选面板
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type AnkiPlugin from '../main';
import GlobalFilterPanel from '../components/filters/GlobalFilterPanel.svelte';

export const VIEW_TYPE_FILTER = "tuanki-filter-view";

export class FilterView extends ItemView {
  private component: GlobalFilterPanel | null = null;
  private plugin: AnkiPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: AnkiPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  /**
   * 获取视图类型标识
   */
  getViewType(): string {
    return VIEW_TYPE_FILTER;
  }

  /**
   * 获取视图显示名称
   */
  getDisplayText(): string {
    return "Tuanki 筛选器";
  }

  /**
   * 获取视图图标
   */
  getIcon(): string {
    return "filter";
  }

  /**
   * 视图打开时调用
   */
  async onOpen(): Promise<void> {
    console.log('[FilterView] Opening filter view');
    
    // 清空容器
    const { contentEl } = this;
    contentEl.empty();
    
    // 添加容器样式类
    contentEl.addClass('tuanki-filter-view');
    
    // 渲染Svelte组件
    try {
      this.component = new GlobalFilterPanel({
        target: contentEl,
        props: {
          plugin: this.plugin
        }
      });
      
      console.log('[FilterView] Filter panel component mounted');
    } catch (error) {
      console.error('[FilterView] Failed to mount filter panel:', error);
    }
  }

  /**
   * 视图关闭时调用
   */
  async onClose(): Promise<void> {
    console.log('[FilterView] Closing filter view');
    
    // 销毁Svelte组件
    if (this.component) {
      this.component.$destroy();
      this.component = null;
    }
  }

  /**
   * 获取筛选状态摘要（显示在视图标题中）
   */
  getDisplayTextExtra(): string {
    if (!this.plugin.filterStateService) {
      return '';
    }
    
    const hasFilters = this.plugin.filterStateService.hasActiveFilters();
    return hasFilters ? '●' : '';
  }
}


