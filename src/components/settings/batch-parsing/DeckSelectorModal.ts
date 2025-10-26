/**
 * 牌组选择模态框
 * 使用 Obsidian 原生 SuggestModal 实现
 */

import { SuggestModal, App } from 'obsidian';
import type { Deck } from '../../../data/types';

/**
 * 牌组选择模态框
 * 提供搜索和选择牌组的功能
 */
export class DeckSelectorModal extends SuggestModal<Deck> {
  private decks: Deck[];
  private onSelect: (deck: Deck) => void;

  constructor(app: App, decks: Deck[], onSelect: (deck: Deck) => void) {
    super(app);
    this.decks = decks;
    this.onSelect = onSelect;
    this.setPlaceholder('搜索牌组名称或路径...');
    
    // 设置模态框标题
    this.setInstructions([
      { command: '↑↓', purpose: '导航' },
      { command: '↵', purpose: '选择' },
      { command: 'esc', purpose: '关闭' }
    ]);
  }

  /**
   * 获取建议列表（搜索过滤）
   */
  getSuggestions(query: string): Deck[] {
    if (!query) {
      return this.decks;
    }

    const lowerQuery = query.toLowerCase();
    return this.decks.filter(deck =>
      deck.name.toLowerCase().includes(lowerQuery) ||
      deck.path.toLowerCase().includes(lowerQuery) ||
      deck.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 渲染建议项
   */
  renderSuggestion(deck: Deck, el: HTMLElement) {
    el.addClass('deck-suggestion-item');
    
    // 创建容器
    const container = el.createDiv({ cls: 'deck-suggestion-container' });
    
    // 牌组图标和名称行
    const headerRow = container.createDiv({ cls: 'deck-suggestion-header' });
    
    // 牌组图标
    const iconSpan = headerRow.createSpan({ cls: 'deck-suggestion-icon' });
    if (deck.icon) {
      iconSpan.setText(deck.icon);
    } else {
      iconSpan.setText('📚');
    }
    
    // 牌组名称
    const nameSpan = headerRow.createSpan({ 
      text: deck.name, 
      cls: 'deck-suggestion-name' 
    });
    
    // 层级路径（如果与名称不同）
    if (deck.path && deck.path !== deck.name) {
      const pathRow = container.createDiv({ cls: 'deck-suggestion-footer' });
      pathRow.createSpan({ 
        text: deck.path, 
        cls: 'deck-suggestion-path' 
      });
    }
    
    // 牌组描述（可选）
    if (deck.description) {
      const descRow = container.createDiv({ cls: 'deck-suggestion-footer' });
      descRow.createSpan({ 
        text: deck.description, 
        cls: 'deck-suggestion-desc' 
      });
    }
    
    // 卡片数量统计
    if (deck.stats) {
      const statsRow = container.createDiv({ cls: 'deck-suggestion-stats' });
      const totalCards = deck.stats.totalCards || 0;
      const newCards = deck.stats.newCount || 0;
      const reviewCards = deck.stats.reviewCount || 0;
      
      statsRow.createSpan({ 
        text: `${totalCards} 张卡片`, 
        cls: 'deck-stat-total' 
      });
      
      if (newCards > 0) {
        statsRow.createSpan({ 
          text: `${newCards} 新`, 
          cls: 'deck-stat-new' 
        });
      }
      
      if (reviewCards > 0) {
        statsRow.createSpan({ 
          text: `${reviewCards} 待复习`, 
          cls: 'deck-stat-review' 
        });
      }
    }
  }

  /**
   * 选择建议项
   */
  onChooseSuggestion(deck: Deck, evt: MouseEvent | KeyboardEvent) {
    this.onSelect(deck);
  }
}

