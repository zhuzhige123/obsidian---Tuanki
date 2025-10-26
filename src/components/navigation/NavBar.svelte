<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { ICON_NAMES, type IconName } from "../../icons/index.js";


  interface NavItem {
    id: string;
    label: string;
    icon: IconName;
    badge?: number | string;
    description?: string;
  }

  interface PageAction {
    id: string;
    label: string;
    icon: IconName;
    onClick: (event: MouseEvent) => void;
    variant?: 'primary' | 'secondary';
  }

  interface Props {
    items: NavItem[];
    currentPage: string;
    responsive?: any; // 响应式状态
    showSettingsButton?: boolean; // 是否显示设置按钮
    pageActions?: PageAction[]; // 页面特定的操作按钮
  }

  let { items, currentPage, responsive, showSettingsButton = false, pageActions = [] }: Props = $props();

  const dispatch = createEventDispatcher<{ navigate: string; settings: void }>();


  function handleNavigate(pageId: string) {
    dispatch("navigate", pageId);
  }

  function handleSettings() {
    dispatch("settings");
  }


</script>

<nav class="anki-navbar">
  <div class="anki-nav-container">
    <!-- 左侧占位区域 -->
    <div class="nav-spacer"></div>

    <!-- 主导航菜单（居中） -->
    <div class="anki-nav-menu">
      {#each items as item}
        <button
          class="anki-nav-item"
          class:active={currentPage === item.id}
          onclick={() => handleNavigate(item.id)}
          aria-label={item.description}
        >
          <div class="anki-nav-icon">
            <EnhancedIcon name={item.icon} />
            {#if item.badge}
              <span class="anki-nav-badge">{item.badge}</span>
            {/if}
          </div>
          <span class="anki-nav-label">{item.label}</span>
        </button>
      {/each}
    </div>

    <!-- 右侧操作区域 -->
    <div class="anki-nav-actions">
      <!-- 页面特定功能键 -->
      {#each pageActions as action}
        <button
          class="anki-nav-action-item page-action"
          class:primary={action.variant === 'primary'}
          onclick={(e) => action.onClick(e)}
          aria-label={action.label}
          title={action.label}
        >
          <EnhancedIcon name={action.icon} />
        </button>
      {/each}

      {#if showSettingsButton}
        <button
          class="anki-nav-action-item"
          class:active={currentPage === "settings"}
          onclick={handleSettings}
          aria-label="打开设置"
          title="设置"
        >
          <EnhancedIcon name={ICON_NAMES.SETTINGS} />
        </button>
      {/if}
    </div>
  </div>
</nav>

<style>
  /* 导航栏主容器 - 使用统一设计令牌 */
  .anki-navbar {
    background: var(--background-primary);
    border-bottom: 1px solid var(--background-modifier-border);
    position: sticky;
    top: 0;
    z-index: 100;
    transition: all 0.2s ease;
  }

  .anki-nav-container {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0.75rem 1.5rem;
    min-height: 3.5rem;
    max-width: 1400px;
    margin: 0 auto;
    gap: 1rem;
    position: relative;
  }

  /* 主导航菜单 - 统一面板样式 */
  .anki-nav-menu {
    display: flex;
    gap: 0.25rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    padding: 0.25rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* 导航项样式 - 统一按钮设计令牌 */
  .anki-nav-item {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    min-height: 2.5rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    font-weight: 500;
    font-family: var(--font-interface);
    line-height: 1.2;
    user-select: none;
  }

  .anki-nav-item:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .anki-nav-item.active {
    background: var(--tuanki-accent-color, var(--color-accent));
    color: white;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
    transform: translateY(-1px);
  }

  /* 导航图标 - 统一图标样式 */
  .anki-nav-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  /* 徽章样式 - 统一通知样式 */
  .anki-nav-badge {
    position: absolute;
    top: -4px;
    right: -6px;
    background: var(--text-error, #ef4444);
    color: white;
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.125rem 0.25rem;
    border-radius: 0.5rem;
    line-height: 1;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    min-width: 1rem;
    text-align: center;
  }

  /* 导航标签 - 统一文本样式 */
  .anki-nav-label {
    white-space: nowrap;
    opacity: 0.9;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .anki-nav-item.active .anki-nav-label {
    opacity: 1;
    font-weight: 600;
  }

  /* 响应式设计 - 统一断点和间距 */
  @media (max-width: 768px) {
    .anki-nav-container {
      padding: 0.5rem 1rem;
      gap: 0.75rem;
    }

    .anki-nav-menu {
      gap: 0.125rem;
      padding: 0.25rem;
    }

    .anki-nav-item {
      min-width: 3rem;
      padding: 0.5rem 0.625rem;
      gap: 0.375rem;
    }

    .anki-nav-label {
      font-size: 0.75rem;
    }
  }

  /* 小屏幕优化 - 统一移动端体验 */
  @media (max-width: 480px) {
    .anki-nav-container {
      padding: 0.5rem;
    }

    .anki-nav-menu {
      padding: 0.125rem;
      gap: 0.125rem;
    }

    .anki-nav-item {
      min-height: 2.5rem;
      min-width: 2.5rem;
      padding: 0.5rem;
      justify-content: center;
    }

    .anki-nav-item .anki-nav-label {
      display: none;
    }

    .anki-nav-icon {
      width: 20px;
      height: 20px;
    }
  }

  /* 动画优化 - 统一动画控制 */
  @media (prefers-reduced-motion: reduce) {
    .anki-nav-item,
    .anki-navbar {
      transition: none;
    }
  }

  /* 右侧操作区域样式 */
  .anki-nav-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  /* 左侧占位区域 - 用于平衡布局，确保导航菜单居中 */

  .anki-nav-action-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1rem;
    user-select: none;
  }

  .anki-nav-action-item:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .anki-nav-action-item.active {
    background: var(--color-accent);
    color: var(--text-on-accent);
    border-color: var(--color-accent);
  }

  .anki-nav-action-item.active:hover {
    background: var(--color-accent-hover, var(--color-accent));
    transform: translateY(-1px);
  }

  /* 页面特定功能键样式 */
  .anki-nav-action-item.page-action {
    margin-right: 0.25rem;
  }

  .anki-nav-action-item.page-action.primary {
    background: var(--tuanki-accent-color, var(--color-accent));
    color: white;
    border-color: var(--tuanki-accent-color, var(--color-accent));
  }

  .anki-nav-action-item.page-action.primary:hover {
    background: var(--tuanki-accent-hover, var(--color-accent-hover));
    transform: translateY(-1px);
  }

  /* 深色模式优化 */
  @media (prefers-color-scheme: dark) {
    .anki-nav-menu {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .anki-nav-action-item {
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
  }
</style>
