<!--
  自定义下拉菜单组件
  职责：提供完全可控的下拉选择器，解决原生 select 的 z-index 和 stacking context 问题
  特性：
  - 绝对定位，超高 z-index，确保显示在最上层
  - 支持键盘导航（ArrowUp, ArrowDown, Enter, Escape）
  - 点击外部自动关闭
  - 符合 Obsidian 主题样式
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Option {
    id: string;
    name: string;
  }

  interface Props {
    /** 标签文本 */
    label: string;

    /** 当前选中的值 - ✅ 使用双向绑定 */
    value: string;

    /** 选项列表 */
    options: Option[];

    /** 值变化回调 */
    onchange: (value: string) => void;

    /** 自定义类名 */
    className?: string;
  }

  let {
    label,
    value = $bindable(),
    options,
    onchange,
    className = ''
  }: Props = $props();

  // 下拉面板状态
  let isOpen = $state(false);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let panelRef = $state<HTMLDivElement | null>(null);
  let selectedIndex = $state(0);
  let panelPosition = $state({ top: 0, left: 0, width: 0 });

  // 计算当前选中的选项
  let selectedOption = $derived(
    options.find(opt => opt.id === value) || options[0]
  );

  // ✅ 监听 value 变化，同步更新 selectedIndex
  $effect(() => {
    const index = options.findIndex(opt => opt.id === value);
    if (index !== -1) {
      selectedIndex = index;
    }
  });

  // 计算面板位置
  function calculatePanelPosition() {
    if (!buttonRef) return;
    
    const rect = buttonRef.getBoundingClientRect();
    panelPosition = {
      top: rect.bottom + 4, // 按钮下方 4px
      left: rect.left,
      width: rect.width
    };
  }

  // 切换下拉面板
  function toggleDropdown(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
    
    if (isOpen) {
      // 更新选中索引
      selectedIndex = options.findIndex(opt => opt.id === value);
      if (selectedIndex === -1) selectedIndex = 0;
      
      // 计算面板位置
      calculatePanelPosition();
      
      // 下一帧聚焦到面板
      requestAnimationFrame(() => {
        panelRef?.focus();
      });
    }
  }

  // 选择选项
  function selectOption(option: Option) {
    // ✅ 双向绑定：同时更新本地状态和通知父组件
    value = option.id;
    onchange(option.id);
    isOpen = false;
    buttonRef?.focus();
  }

  // 键盘导航
  function handlePanelKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, options.length - 1);
        scrollToSelected();
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        scrollToSelected();
        break;
      
      case 'Enter':
        e.preventDefault();
        if (options[selectedIndex]) {
          selectOption(options[selectedIndex]);
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        isOpen = false;
        buttonRef?.focus();
        break;
    }
  }

  // 滚动到选中项
  function scrollToSelected() {
    if (!panelRef) return;
    const items = panelRef.querySelectorAll('.dropdown-item');
    const selectedItem = items[selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  // 处理模态窗拖拽开始
  function handleModalDragStart() {
    if (isOpen) {
      console.log('[CustomDropdown] 检测到模态窗拖拽，关闭下拉面板');
      isOpen = false;
    }
  }

  // 点击外部关闭
  function handleClickOutside(e: MouseEvent) {
    if (!isOpen) return;
    
    const target = e.target as Node;
    if (buttonRef && buttonRef.contains(target)) return;
    if (panelRef && panelRef.contains(target)) return;
    
    isOpen = false;
  }

  // 挂载和卸载事件监听
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    
    // ✅ 新增：监听模态窗拖拽事件，自动关闭下拉列表
    document.addEventListener('modal-drag-start', handleModalDragStart as EventListener);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('modal-drag-start', handleModalDragStart as EventListener);
    };
  });
</script>

<div class="custom-dropdown {className}">
  <!-- 标签 -->
  {#if label}
    <span class="dropdown-label">{label}</span>
  {/if}

  <!-- 触发按钮 -->
  <button
    bind:this={buttonRef}
    class="dropdown-button"
    class:open={isOpen}
    onclick={toggleDropdown}
    type="button"
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
  >
    <span class="dropdown-button-text">{selectedOption?.name || '请选择'}</span>
    <span class="dropdown-button-arrow" class:open={isOpen}>▼</span>
  </button>

  <!-- 下拉面板 -->
  {#if isOpen}
    <div
      bind:this={panelRef}
      class="dropdown-panel"
      style:top="{panelPosition.top}px"
      style:left="{panelPosition.left}px"
      style:min-width="{panelPosition.width}px"
      role="listbox"
      tabindex="-1"
      onkeydown={handlePanelKeydown}
      onmousedown={(e) => {
        // ✅ 阻止面板本身的 mousedown 冒泡
        e.stopPropagation();
      }}
    >
      {#each options as option, index}
        <div
          class="dropdown-item"
          class:selected={option.id === value}
          class:highlighted={index === selectedIndex}
          role="option"
          tabindex="-1"
          aria-selected={option.id === value}
          onmousedown={(e) => {
            // ✅ 阻止 mousedown 冒泡，防止触发模态窗拖拽
            e.stopPropagation();
            e.preventDefault();
          }}
          onclick={(e) => {
            e.stopPropagation();
            selectOption(option);
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectOption(option);
            }
          }}
          onmouseenter={() => { selectedIndex = index; }}
        >
          {option.name}
          {#if option.id === value}
            <span class="dropdown-item-check">✓</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .custom-dropdown {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    position: relative;
  }

  .dropdown-label {
    color: var(--text-muted);
    font-size: 0.875rem;
    white-space: nowrap;
    margin: 0;
  }

  .dropdown-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 120px;
    padding: 0.375rem 0.75rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .dropdown-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .dropdown-button.open {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .dropdown-button-text {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-button-arrow {
    font-size: 0.7rem;
    color: var(--text-muted);
    transition: transform 0.15s ease;
  }

  .dropdown-button-arrow.open {
    transform: rotate(180deg);
  }

  .dropdown-panel {
    position: fixed;
    /* ✅ 超高 z-index 确保显示在所有内容之上 */
    z-index: 99999999;
    min-width: 150px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    padding: 0.25rem;
    margin-top: 0.25rem;
  }

  .dropdown-panel:focus {
    outline: none;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-normal);
    font-size: 0.875rem;
    transition: background 0.1s ease;
  }

  .dropdown-item:hover,
  .dropdown-item.highlighted {
    background: var(--background-modifier-hover);
  }

  .dropdown-item.selected {
    background: var(--background-modifier-active-hover);
    color: var(--interactive-accent);
  }

  .dropdown-item-check {
    margin-left: 0.5rem;
    color: var(--interactive-accent);
    font-size: 0.875rem;
  }

  /* 滚动条样式 */
  .dropdown-panel::-webkit-scrollbar {
    width: 8px;
  }

  .dropdown-panel::-webkit-scrollbar-track {
    background: transparent;
  }

  .dropdown-panel::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .dropdown-panel::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
</style>

