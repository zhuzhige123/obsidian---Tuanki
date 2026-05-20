<script lang="ts">
  /**
   * 移动端卡片管理导航菜单组件
   * 
   * Part B: 卡片管理界面的底部弹出导航菜单
   * 与牌组学习界面的 MobileNavMenu 保持一致的菜单结构
   * 包含：功能切换、卡片操作、批量操作、视图专用功能
   * 
   * 注意：筛选排序功能已移至全局侧边筛选栏，此处不再显示
   * 
   * @module components/study/MobileCardManagementMenu
   * @version 1.2.0
   * @requirements 13.1, 13.2, 13.3, 13.4
   */
  import BottomSheetModal from '../ui/BottomSheetModal.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { tr } from '../../utils/i18n';

  interface MenuItem {
    id: string;
    icon: string;
    label: string;
    active?: boolean;
  }

  interface MenuSection {
    title: string;
    items: MenuItem[];
  }

  interface Props {
    isOpen: boolean;
    currentFunction?: string;
    currentView?: 'table' | 'grid' | 'kanban';
    tableViewMode?: 'basic' | 'review' | 'questionBank';
    gridLayout?: 'fixed' | 'masonry' | 'timeline';
    kanbanLayoutMode?: 'compact' | 'comfortable' | 'spacious';
    enableCardLocationJump?: boolean;
    onClose: () => void;
    onMenuItemClick: (itemId: string) => void;
  }

  let {
    isOpen = false,
    currentFunction = 'card-management',
    currentView = 'table',
    tableViewMode = 'basic',
    gridLayout = 'fixed',
    kanbanLayoutMode = 'comfortable',
    enableCardLocationJump = false,
    onClose,
    onMenuItemClick
  }: Props = $props();
  let t = $derived($tr);

  // 基础菜单分类配置
  const baseMenuSections = $derived<MenuSection[]>([
    {
      title: t('cards.management.mobileMenu.sections.functionSwitch'),
      items: [
        { id: 'deck-study', icon: 'graduation-cap', label: t('cards.management.mobileMenu.items.deckStudy') },
        { id: 'card-management', icon: 'list', label: t('cards.management.mobileMenu.items.cardManagement') },
        { id: 'ai-assistant', icon: 'bot', label: t('cards.management.mobileMenu.items.aiAssistant') }
      ]
    },
    {
      title: t('cards.management.mobileMenu.sections.cardActions'),
      items: [
        { id: 'new-card', icon: 'plus', label: t('cards.management.mobileMenu.items.newCard') },
        { id: 'import-cards', icon: 'download', label: t('cards.management.mobileMenu.items.importCards') },
        { id: 'export-cards', icon: 'upload', label: t('cards.management.mobileMenu.items.exportCards') }
      ]
    },
    {
      title: t('cards.management.mobileMenu.sections.batchActions'),
      items: [
        { id: 'multi-select', icon: 'check-square', label: t('cards.management.mobileMenu.items.multiSelect') },
        { id: 'batch-delete', icon: 'trash-2', label: t('cards.management.mobileMenu.items.batchDelete') },
        { id: 'batch-move', icon: 'folder', label: t('cards.management.mobileMenu.items.batchMove') }
      ]
    }
  ]);

  // 根据当前视图动态生成菜单
  const menuSections = $derived(() => {
    const sections = [...baseMenuSections];
    
    // 表格视图专用功能
    if (currentView === 'table') {
      sections.push({
        title: t('cards.management.mobileMenu.sections.tableView'),
        items: [
          { id: 'table-basic', icon: 'table', label: t('cards.management.mobileMenu.items.tableBasic'), active: tableViewMode === 'basic' },
          { id: 'table-review', icon: 'history', label: t('cards.management.mobileMenu.items.tableReview'), active: tableViewMode === 'review' },
          { id: 'table-question-bank', icon: 'edit-3', label: t('cards.management.mobileMenu.items.tableQuestionBank'), active: tableViewMode === 'questionBank' },
          { id: 'column-manager', icon: 'columns', label: t('cards.management.mobileMenu.items.columnManager') }
        ]
      });
    }
    
    // 网格视图专用功能
    if (currentView === 'grid') {
      sections.push({
        title: t('cards.management.mobileMenu.sections.gridView'),
        items: [
          { id: 'grid-fixed', icon: 'grid', label: t('cards.management.mobileMenu.items.gridFixed'), active: gridLayout === 'fixed' },
          { id: 'grid-masonry', icon: 'layout-grid', label: t('cards.management.mobileMenu.items.gridMasonry'), active: gridLayout === 'masonry' },
          { id: 'grid-timeline', icon: 'history', label: t('cards.management.mobileMenu.items.gridTimeline'), active: gridLayout === 'timeline' },
          { id: 'card-location-jump', icon: 'external-link', label: t('cards.management.mobileMenu.items.cardLocationJump'), active: enableCardLocationJump }
        ]
      });
    }
    
    // 看板视图专用功能
    if (currentView === 'kanban') {
      sections.push({
        title: t('cards.management.mobileMenu.sections.kanbanView'),
        items: [
          { id: 'kanban-compact', icon: 'minimize-2', label: t('cards.management.mobileMenu.items.kanbanCompact'), active: kanbanLayoutMode === 'compact' },
          { id: 'kanban-comfortable', icon: 'maximize-2', label: t('cards.management.mobileMenu.items.kanbanComfortable'), active: kanbanLayoutMode === 'comfortable' },
          { id: 'kanban-spacious', icon: 'expand', label: t('cards.management.mobileMenu.items.kanbanSpacious'), active: kanbanLayoutMode === 'spacious' }
        ]
      });
    }
    
    return sections;
  });

  function handleItemClick(itemId: string) {
    onMenuItemClick(itemId);
    onClose();
  }
</script>

<BottomSheetModal {isOpen} {onClose} height="auto">
  <div class="mobile-card-management-menu">
    {#each menuSections() as section}
      <div class="menu-section">
        <div class="menu-section-title">{section.title}</div>
        <div class="menu-items">
          {#each section.items as item}
            <button
              class="menu-item"
              class:active={item.id === currentFunction || item.active}
              onclick={() => handleItemClick(item.id)}
            >
              <span class="menu-item-icon">
                <ObsidianIcon name={item.icon} size={16} />
              </span>
              <span class="menu-item-text">{item.label}</span>
              {#if item.id === currentFunction || item.active}
                <span class="menu-item-check">
                  <ObsidianIcon name="check" size={14} />
                </span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</BottomSheetModal>

<style>
  .mobile-card-management-menu {
    padding: 0;
  }

  .menu-section {
    padding: 6px 12px;
  }

  .menu-section-title {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    padding: 0 4px;
  }

  .menu-items {
    background: var(--background-secondary);
    border-radius: 10px;
    overflow: hidden;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: none;
    border-bottom: 1px solid var(--background-modifier-border);
    cursor: pointer;
    background: transparent;
    width: 100%;
    text-align: left;
  }

  .menu-item:last-child {
    border-bottom: none;
  }

  .menu-item:active {
    background: var(--background-modifier-hover);
  }

  .menu-item.active {
    background: rgba(124, 58, 237, 0.15);
  }

  .menu-item-icon {
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .menu-item.active .menu-item-icon {
    color: var(--weave-mobile-primary-color, #a78bfa);
  }

  .menu-item-text {
    flex: 1;
    font-size: 14px;
    color: var(--text-normal);
  }

  .menu-item-check {
    color: var(--weave-mobile-primary-color, #a78bfa);
  }
</style>
