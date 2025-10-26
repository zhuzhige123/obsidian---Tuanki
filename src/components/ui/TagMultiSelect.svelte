<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { isDarkMode, createThemeListener } from '../../utils/theme-detection';
  
  interface Props {
    selected: string[];
    options: string[];
    placeholder?: string;
    readonly?: boolean;
    size?: 'sm' | 'md' | 'lg';
  }
  let { selected, options, placeholder = "Add a tag...", readonly = false, size = 'md' }: Props = $props();

  const dispatch = createEventDispatcher<{ change: string[] }>();

  let isOpen = $state(false);
  let inputValue = $state("");
  let highlightedIndex = $state(0);
  let containerEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);

  // Enhanced Notion-style color palette with improved contrast
  const notionColors = [
    { 
      name: 'gray', 
      bg: 'rgba(227, 226, 224, 0.85)', 
      text: 'rgba(55, 53, 47, 0.9)',
      darkBg: 'rgba(75, 75, 75, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'brown', 
      bg: 'rgba(238, 224, 218, 0.85)', 
      text: 'rgba(100, 71, 58, 0.9)',
      darkBg: 'rgba(147, 114, 100, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'orange', 
      bg: 'rgba(251, 236, 221, 0.85)', 
      text: 'rgba(217, 115, 13, 0.9)',
      darkBg: 'rgba(217, 115, 13, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'yellow', 
      bg: 'rgba(251, 243, 219, 0.85)', 
      text: 'rgba(203, 145, 47, 0.9)',
      darkBg: 'rgba(203, 145, 47, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'green', 
      bg: 'rgba(221, 237, 234, 0.85)', 
      text: 'rgba(68, 131, 97, 0.9)',
      darkBg: 'rgba(68, 131, 97, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'blue', 
      bg: 'rgba(221, 235, 241, 0.85)', 
      text: 'rgba(51, 126, 169, 0.9)',
      darkBg: 'rgba(51, 126, 169, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'purple', 
      bg: 'rgba(234, 228, 242, 0.85)', 
      text: 'rgba(144, 101, 176, 0.9)',
      darkBg: 'rgba(144, 101, 176, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'pink', 
      bg: 'rgba(244, 223, 235, 0.85)', 
      text: 'rgba(193, 76, 138, 0.9)',
      darkBg: 'rgba(193, 76, 138, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
    { 
      name: 'red', 
      bg: 'rgba(251, 228, 228, 0.85)', 
      text: 'rgba(212, 76, 71, 0.9)',
      darkBg: 'rgba(212, 76, 71, 0.8)',
      darkText: 'rgba(255, 255, 255, 0.9)'
    },
  ];

  function hashToColorIndex(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash % notionColors.length;
  }


  function open() {
    if (readonly) return;
    isOpen = true;
    queueMicrotask(() => {
      inputEl?.focus();
      positionDropdown();
    });
  }

  function positionDropdown() {
    if (!containerEl || !isOpen) return;
    
    const dropdown = containerEl.querySelector('.notion-dropdown') as HTMLElement;
    if (!dropdown) return;
    
    const containerRect = containerEl.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Calculate position
    let top = containerRect.bottom + 4;
    let left = containerRect.left;
    let width = containerRect.width;
    
    // Adjust if dropdown would go off-screen vertically
    if (top + dropdownRect.height > viewportHeight - 20) {
      top = containerRect.top - dropdownRect.height - 4;
    }
    
    // Adjust if dropdown would go off-screen horizontally
    if (left + width > viewportWidth - 20) {
      left = viewportWidth - width - 20;
    }
    if (left < 20) {
      left = 20;
      width = Math.min(width, viewportWidth - 40);
    }
    
    // Apply positioning
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${Math.max(20, top)}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.width = `${width}px`;
    dropdown.style.right = 'auto';
  }
  
  function close() { 
    isOpen = false; 
    inputValue = ""; 
    highlightedIndex = 0; 
  }

  $effect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerEl) return;
      if (!containerEl.contains(e.target as Node)) close();
    }
    
    function onResize() {
      if (isOpen) positionDropdown();
    }
    
    function onScroll() {
      if (isOpen) positionDropdown();
    }
    
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  });

  function computeFiltered(): string[] {
    const q = inputValue.trim().toLowerCase();
    const availableOptions = options.filter(opt => !selected.includes(opt));
    const base = Array.from(new Set(availableOptions)).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    return q ? base.filter(o => o.toLowerCase().includes(q)) : base;
  }
  let filtered: string[] = $derived(computeFiltered());

  function addTag(tag: string) {
    if (!tag || readonly) return;
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;
    
    const set = new Set(selected);
    if (!set.has(trimmedTag)) {
      const next = Array.from(set.add(trimmedTag));
      dispatch('change', next);
    }
    inputValue = "";
    highlightedIndex = 0;
    close();
  }

  function removeTag(tag: string) {
    if (readonly) return;
    const next = selected.filter(t => t !== tag);
    dispatch('change', next);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!isOpen || readonly) return;
    
    if (e.key === 'ArrowDown') { 
      const maxIndex = Math.max(0, filtered.length + (canCreate ? 1 : 0) - 1);
      highlightedIndex = Math.min(highlightedIndex + 1, maxIndex); 
      e.preventDefault(); 
    }
    else if (e.key === 'ArrowUp') { 
      highlightedIndex = Math.max(0, highlightedIndex - 1); 
      e.preventDefault(); 
    }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (canCreate && highlightedIndex === 0) {
        addTag(inputValue);
      } else {
        const optionIndex = canCreate ? highlightedIndex - 1 : highlightedIndex;
        const current = filtered[optionIndex];
      if (current) addTag(current);
      }
    } 
    else if (e.key === 'Escape') { 
      close(); 
    }
    else if (e.key === 'Backspace' && inputValue === '' && selected.length > 0) {
      removeTag(selected[selected.length - 1]);
    }
  }

  let canCreate = $derived(
    inputValue.trim() && 
    !options.includes(inputValue.trim()) && 
    !selected.includes(inputValue.trim())
  );

  // Create a reactive state for theme changes to trigger tag color updates
  let themeVersion = $state(0);
  let themeCleanup: (() => void) | null = null;

  // Test comment for hot reload

  // Listen for theme changes using unified theme detection
  onMount(() => {
    themeCleanup = createThemeListener(() => {
      themeVersion++;
    });
  });

  onDestroy(() => {
    if (themeCleanup) {
      themeCleanup();
    }
  });

  // Enhanced tag style function with reactive theme detection
  function getReactiveTagStyle(tag: string): { backgroundColor: string; color: string } {
    // Access themeVersion to make this reactive
    themeVersion;

    const colorIndex = hashToColorIndex(tag);
    const color = notionColors[colorIndex];

    // Use unified theme detection
    const isCurrentlyDark = isDarkMode();

    return {
      backgroundColor: isCurrentlyDark ? color.darkBg : color.bg,
      color: isCurrentlyDark ? color.darkText : color.text
    };
  }
</script>

<div 
  class="notion-tag-multi-select" 
  class:readonly
  class:size-sm={size === 'sm'}
  class:size-md={size === 'md'}
  class:size-lg={size === 'lg'}
  bind:this={containerEl} 
  role="combobox" 
  aria-expanded={isOpen} 
  aria-haspopup="listbox" 
  aria-controls="tag-ms-listbox" 
  tabindex={readonly ? -1 : 0} 
  onclick={open} 
  onkeydown={(e) => { if (!readonly && (e.key === 'Enter' || e.key === ' ')) { open(); e.preventDefault(); } }}
>
  <div class="selected-tags">
    {#if selected?.length}
      {#each selected as tag}
        {@const tagStyle = getReactiveTagStyle(tag)}
        <span 
          class="notion-tag" 
          style={`background-color: ${tagStyle.backgroundColor}; color: ${tagStyle.color};`}
          title={tag}
        >
          <span class="tag-text">{tag}</span>
          {#if !readonly}
            <button 
              class="tag-remove" 
              type="button" 
              aria-label={`Remove ${tag}`} 
              onclick={(e) => { e.stopPropagation(); removeTag(tag); }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          {/if}
        </span>
      {/each}
    {/if}
    {#if !readonly}
      <input 
        class="tag-input" 
        bind:this={inputEl} 
        bind:value={inputValue} 
        placeholder={selected.length === 0 ? placeholder : ""}
        onkeydown={onKeydown}
        onfocus={open}
      />
    {/if}
  </div>

  {#if isOpen && !readonly}
    <div class="notion-dropdown" role="listbox" id="tag-ms-listbox">
      {#if canCreate}
        <button 
          type="button" 
          class="dropdown-item create-item" 
          class:highlighted={highlightedIndex === 0}
          role="option" 
          aria-selected={highlightedIndex === 0}
          onmouseenter={() => highlightedIndex = 0}
          onclick={() => addTag(inputValue)}
        >
          <div class="create-indicator">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 3.5V10.5M3.5 7H10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <span>Create "<strong>{inputValue}</strong>"</span>
        </button>
      {/if}
      
      {#if filtered.length > 0}
        {#if canCreate}
          <div class="dropdown-divider"></div>
      {/if}
      {#each filtered as opt, i}
          {@const tagStyle = getReactiveTagStyle(opt)}
          {@const itemIndex = canCreate ? i + 1 : i}
          <button 
            type="button" 
            class="dropdown-item option-item" 
            class:highlighted={itemIndex === highlightedIndex}
            role="option" 
            aria-selected={itemIndex === highlightedIndex}
            onmouseenter={() => highlightedIndex = itemIndex}
            onclick={() => addTag(opt)}
          >
            <span 
              class="option-tag-preview" 
              style={`background-color: ${tagStyle.backgroundColor}; color: ${tagStyle.color};`}
            >
              {opt}
            </span>
        </button>
      {/each}
      {/if}
      
      {#if !filtered.length && !canCreate}
        <div class="dropdown-empty">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M8 5V8M8 11H8.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>No options found</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Base container styles */
  .notion-tag-multi-select {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 32px;
    width: 100%;
    background: var(--background-primary);
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 4px 8px;
    cursor: text;
    transition: all 0.15s ease;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
  }

  .notion-tag-multi-select:hover {
    border-color: rgba(55, 53, 47, 0.16);
    box-shadow: 0 0 0 1px rgba(55, 53, 47, 0.16);
  }

  .notion-tag-multi-select:focus-within {
    border-color: rgba(35, 131, 226, 0.57);
    box-shadow: 0 0 0 1px rgba(35, 131, 226, 0.57);
  }

  .notion-tag-multi-select.readonly {
    cursor: default;
    background: transparent;
    border: none;
    padding: 2px 4px;
  }

  .notion-tag-multi-select.readonly:hover {
    border-color: transparent;
    box-shadow: none;
  }

  /* Size variants */
  .notion-tag-multi-select.size-sm {
    min-height: 28px;
    padding: 2px 6px;
  }

  .notion-tag-multi-select.size-lg {
    min-height: 36px;
    padding: 6px 10px;
  }

  /* Selected tags container - 扁平化设计，左对齐 */
  .selected-tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
    min-height: 20px;
    justify-content: flex-start; /* 标签靠左对齐 */
  }

  /* Individual tag styles - 扁平化矩形设计 */
  .notion-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 6px;
    border-radius: 3px; /* 扁平化：小圆角 */
    font-size: 11px;
    font-weight: 500; /* 扁平化：降低字重 */
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    transition: opacity 0.15s ease; /* 扁平化：简化过渡效果 */
    border: none;
  }

  .notion-tag:hover {
    opacity: 0.85; /* 扁平化：使用透明度代替复杂效果 */
  }

  .size-sm .notion-tag {
    height: 18px;
    padding: 0 6px;
    font-size: 11px;
  }

  .size-lg .notion-tag {
    height: 26px;
    padding: 0 10px;
    font-size: 13px;
  }

  .tag-text {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border: none;
    background: transparent;
    color: currentColor;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
    opacity: 0.6;
    transition: all 0.15s ease;
  }

  .tag-remove:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.2);
  }

  .tag-remove svg {
    width: 10px;
    height: 10px;
  }

  /* Input field */
  .tag-input {
    flex: 1;
    min-width: 60px;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 14px;
    font-family: inherit;
    padding: 0;
    margin: 0;
    height: 22px;
  }

  .size-sm .tag-input {
    font-size: 13px;
    height: 18px;
  }

  .size-lg .tag-input {
    font-size: 15px;
    height: 26px;
  }

  .tag-input::placeholder {
    color: rgba(55, 53, 47, 0.5);
    font-weight: 400;
  }

  /* Dropdown styles - 扁平化设计 */
  .notion-dropdown {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px; /* 扁平化：小圆角 */
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); /* 扁平化：简化阴影 */
    z-index: 9999;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 0;
    font-size: 13px;
  }

  /* Dropdown items */
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    transition: background-color 0.15s ease;
  }

  .dropdown-item:hover,
  .dropdown-item.highlighted {
    background: rgba(55, 53, 47, 0.08);
  }

  /* Create new tag item */
  .create-item {
    color: rgba(35, 131, 226, 0.9);
    font-weight: 500;
  }

  .create-item:hover,
  .create-item.highlighted {
    background: rgba(35, 131, 226, 0.08);
  }

  .create-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: rgba(35, 131, 226, 0.1);
    color: rgba(35, 131, 226, 0.9);
  }

  /* Option tag preview - 扁平化设计 */
  .option-tag-preview {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 3px; /* 扁平化：小圆角 */
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  }

  /* Dropdown divider */
  .dropdown-divider {
    height: 1px;
    background: rgba(55, 53, 47, 0.09);
    margin: 4px 12px;
  }

  /* Empty state */
  .dropdown-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px 12px;
    color: rgba(55, 53, 47, 0.5);
    font-size: 13px;
  }

  .dropdown-empty svg {
    opacity: 0.5;
  }

  /* Scrollbar styling for dropdown */
  .notion-dropdown::-webkit-scrollbar {
    width: 8px;
  }

  .notion-dropdown::-webkit-scrollbar-track {
    background: transparent;
  }

  .notion-dropdown::-webkit-scrollbar-thumb {
    background: rgba(55, 53, 47, 0.2);
    border-radius: 4px;
  }

  .notion-dropdown::-webkit-scrollbar-thumb:hover {
    background: rgba(55, 53, 47, 0.3);
  }

  /* Dark mode adjustments with enhanced contrast - 使用 Obsidian 主题类 */
  :global(body.theme-dark) .notion-tag-multi-select:hover {
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16);
  }

  :global(body.theme-dark) .notion-tag-multi-select:focus-within {
    border-color: rgba(35, 131, 226, 0.7);
    box-shadow: 0 0 0 1px rgba(35, 131, 226, 0.7);
  }

  :global(body.theme-dark) .notion-tag:hover {
    opacity: 0.85; /* 扁平化：深色模式也使用透明度 */
  }

  :global(body.theme-dark) .tag-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  :global(body.theme-dark) .notion-dropdown {
    border-color: var(--background-modifier-border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); /* 扁平化：简化阴影 */
  }

  :global(body.theme-dark) .dropdown-item:hover,
  :global(body.theme-dark) .dropdown-item.highlighted {
    background: rgba(255, 255, 255, 0.08);
  }

  :global(body.theme-dark) .create-item:hover,
  :global(body.theme-dark) .create-item.highlighted {
    background: rgba(35, 131, 226, 0.15);
  }

  :global(body.theme-dark) .dropdown-divider {
    background: rgba(255, 255, 255, 0.09);
  }

  :global(body.theme-dark) .dropdown-empty {
    color: rgba(255, 255, 255, 0.5);
  }

  /* Note: Theme-specific styling is handled dynamically via JavaScript getReactiveTagStyle() */
</style>
