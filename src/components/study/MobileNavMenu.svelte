<script lang="ts">
  /**
   * 移动端导航菜单组件
   * 
   * Part A: 牌组学习界面的底部弹出导航菜单
   * 包含三个分类：功能切换、视图切换、设置
   * 
   * @module components/study/MobileNavMenu
   * @version 1.2.0
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
    currentView?: string;
    memoryDeckDisplayMode?: 'formal' | 'emergent';
    onClose: () => void;
    onMenuItemClick: (itemId: string) => void;
  }

  let {
    isOpen = false,
    currentView = 'deck-study',
    memoryDeckDisplayMode = 'formal',
    onClose,
    onMenuItemClick
  }: Props = $props();

  let t = $derived($tr);

  // 菜单分类配置
  const menuSections: MenuSection[] = $derived([
    {
      title: t('study.mobileMenu.functionSwitch'),
      items: [
        { id: 'deck-study', icon: 'graduation-cap', label: t('study.mobileMenu.deckStudy') },
        { id: 'card-management', icon: 'list', label: t('study.mobileMenu.cardManagement') },
        { id: 'ai-assistant', icon: 'bot', label: t('study.mobileMenu.aiAssistant') }
      ]
    },
    {
      title: t('study.mobileMenu.viewSwitch'),
      items: [
        { id: 'toggle-view', icon: 'refresh-cw', label: t('study.mobileMenu.toggleView') },
        {
          id: 'toggle-deck-mode',
          icon: memoryDeckDisplayMode === 'formal' ? 'folder' : 'sparkles',
          label: memoryDeckDisplayMode === 'formal' ? t('study.mobileMenu.showEmergentDecks') : t('study.mobileMenu.showFormalDecks'),
          active: false
        },
        { id: 'new-deck', icon: 'plus', label: t('study.mobileMenu.newDeck') },
        { id: 'more-actions', icon: 'more-horizontal', label: t('study.mobileMenu.moreActions') }
      ]
    },
    {
      title: t('study.mobileMenu.settingsSection'),
      items: [
        { id: 'note-type-config', icon: 'file-cog', label: t('study.mobileMenu.noteTypeConfig') }
      ]
    }
  ]);

  function handleItemClick(itemId: string) {
    onMenuItemClick(itemId);
    onClose();
  }
</script>

<BottomSheetModal {isOpen} {onClose} height="auto">
  <div class="mobile-nav-menu">
    {#each menuSections as section}
      <div class="menu-section">
        <div class="menu-section-title">{section.title}</div>
        <div class="menu-items">
          {#each section.items as item}
            <button
              class="menu-item"
              class:active={item.id === currentView}
              onclick={() => handleItemClick(item.id)}
            >
              <span class="menu-item-icon">
                <ObsidianIcon name={item.icon} size={16} />
              </span>
              <span class="menu-item-text">{item.label}</span>
              {#if item.id === currentView}
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
  .mobile-nav-menu {
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
