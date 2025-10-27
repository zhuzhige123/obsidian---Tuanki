<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { isDarkMode as detectDarkMode, createThemeListener } from '../../utils/theme-detection';
  import { fly, fade, scale } from 'svelte/transition';
  import { quintOut, elasticOut } from 'svelte/easing';
  
  interface Props {
    selected: string[];
    options: string[];
    placeholder?: string;
    readonly?: boolean;
    size?: 'sm' | 'md' | 'lg';
    maxTags?: number;
    allowCreate?: boolean;
    searchPlaceholder?: string;
  }
  
  let { 
    selected, 
    options, 
    placeholder = "Select or create tags...", 
    readonly = false, 
    size = 'md',
    maxTags = undefined,
    allowCreate = true,
    searchPlaceholder = "Search tags..."
  }: Props = $props();

  const dispatch = createEventDispatcher<{ 
    change: string[]; 
    create: string;
    remove: string;
  }>();

  let currentSelected = $state(selected || []);
  let searchValue = $state("");
  let containerEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);

  $effect(() => {
    const newSelected = selected || [];
    if (JSON.stringify(newSelected) !== JSON.stringify(currentSelected)) {
      currentSelected = newSelected;
    }
  });

  // Notion-inspired color palette with enhanced accessibility
  const tagColors = [
    { 
      name: 'blue', 
      light: { bg: 'rgba(211, 229, 239, 0.9)', text: 'rgba(24, 51, 71, 0.95)' },
      dark: { bg: 'rgba(24, 51, 71, 0.85)', text: 'rgba(211, 229, 239, 0.95)' }
    },
    { 
      name: 'purple', 
      light: { bg: 'rgba(232, 222, 238, 0.9)', text: 'rgba(65, 36, 84, 0.95)' },
      dark: { bg: 'rgba(65, 36, 84, 0.85)', text: 'rgba(232, 222, 238, 0.95)' }
    },
    { 
      name: 'pink', 
      light: { bg: 'rgba(245, 224, 233, 0.9)', text: 'rgba(76, 35, 55, 0.95)' },
      dark: { bg: 'rgba(76, 35, 55, 0.85)', text: 'rgba(245, 224, 233, 0.95)' }
    },
    { 
      name: 'red', 
      light: { bg: 'rgba(255, 226, 221, 0.9)', text: 'rgba(93, 23, 21, 0.95)' },
      dark: { bg: 'rgba(93, 23, 21, 0.85)', text: 'rgba(255, 226, 221, 0.95)' }
    },
    { 
      name: 'orange', 
      light: { bg: 'rgba(251, 236, 221, 0.9)', text: 'rgba(73, 41, 14, 0.95)' },
      dark: { bg: 'rgba(73, 41, 14, 0.85)', text: 'rgba(251, 236, 221, 0.95)' }
    },
    { 
      name: 'yellow', 
      light: { bg: 'rgba(251, 243, 219, 0.9)', text: 'rgba(64, 44, 27, 0.95)' },
      dark: { bg: 'rgba(64, 44, 27, 0.85)', text: 'rgba(251, 243, 219, 0.95)' }
    },
    { 
      name: 'green', 
      light: { bg: 'rgba(219, 237, 219, 0.9)', text: 'rgba(28, 56, 41, 0.95)' },
      dark: { bg: 'rgba(28, 56, 41, 0.85)', text: 'rgba(219, 237, 219, 0.95)' }
    },
    { 
      name: 'gray', 
      light: { bg: 'rgba(227, 226, 224, 0.9)', text: 'rgba(50, 48, 44, 0.95)' },
      dark: { bg: 'rgba(50, 48, 44, 0.85)', text: 'rgba(227, 226, 224, 0.95)' }
    },
  ];

  // Enhanced hash function for consistent color assignment
  function getTagColorIndex(tag: string): number {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      const char = tag.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % tagColors.length;
  }

  // Reactive theme detection
  let isDarkMode = $state(detectDarkMode());

  onMount(() => {
    const cleanup = createThemeListener((isDark) => {
      isDarkMode = isDark;
    });

    return cleanup;
  });

  function getTagStyle(tag: string) {
    const colorIndex = getTagColorIndex(tag);
    const color = tagColors[colorIndex];
    const theme = isDarkMode ? color.dark : color.light;
    return {
      backgroundColor: theme.bg,
      color: theme.text,
      borderColor: `color-mix(in srgb, ${theme.text} 20%, transparent)`
    };
  }

  // Computed values
  let isMaxReached = $derived(maxTags !== undefined && currentSelected.length >= maxTags);


  function addTag(tag: string) {
    if (!tag || readonly || isMaxReached) return;
    
    const trimmedTag = tag.trim();
    if (!trimmedTag || currentSelected.includes(trimmedTag)) return;
    
    currentSelected = [...currentSelected, trimmedTag];
    dispatch('change', currentSelected);
    
    if (!options.includes(trimmedTag)) {
      dispatch('create', trimmedTag);
    }
    
    searchValue = "";
    
    // Keep focus for multi-selection
    if (!isMaxReached) {
      setTimeout(() => inputEl?.focus(), 50);
    }
  }

  function removeTag(tag: string) {
    if (readonly) return;
    currentSelected = currentSelected.filter(t => t !== tag);
    dispatch('change', currentSelected);
    dispatch('remove', tag);
  }

  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        const trimmedValue = searchValue.trim();
        if (trimmedValue && allowCreate) {
          addTag(trimmedValue);
        }
        break;
        
      case 'Backspace':
        if (!searchValue && currentSelected.length > 0) {
          removeTag(currentSelected[currentSelected.length - 1]);
        }
        break;
    }
  }

  function handleBlur() {
    const trimmedValue = searchValue.trim();
    if (trimmedValue && allowCreate) {
      addTag(trimmedValue);
    }
  }


</script>

<div 
  class="modern-tag-select"
  class:readonly
  class:size-sm={size === 'sm'}
  class:size-lg={size === 'lg'}
  class:max-reached={isMaxReached}
  bind:this={containerEl}
>
  <div class="tag-container">
    <!-- Selected tags -->
    {#if currentSelected?.length}
      <div class="selected-tags">
        {#each currentSelected as tag, index (tag)}
          {@const tagStyle = getTagStyle(tag)}
          <div 
            class="tag"
            style="background-color: {tagStyle.backgroundColor}; color: {tagStyle.color}; border-color: {tagStyle.borderColor};"
            transition:scale={{ duration: 200, easing: elasticOut }}
          >
            <span class="tag-text" title={tag}>{tag}</span>
            {#if !readonly}
              <button 
                class="tag-remove"
                type="button"
                aria-label="Remove {tag}"
                onclick={(e) => { e.stopPropagation(); removeTag(tag); }}
                transition:scale={{ duration: 150 }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    
    <!-- Input field -->
    {#if !readonly && !isMaxReached}
      <input 
        class="tag-input"
        bind:this={inputEl}
        bind:value={searchValue}
        placeholder={currentSelected.length === 0 ? placeholder : "Type to add tags..."}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        autocomplete="off"
        spellcheck="false"
        aria-label="Tag input"
      />
    {/if}
    

  </div>
</div>


<style>
  .modern-tag-select {
    position: relative;
    display: flex;
    align-items: stretch;
    min-height: 26px;
    max-height: 48px;
    width: 100%;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 2px 6px;
    cursor: text;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-sizing: border-box;
  }

  .modern-tag-select:hover {
    border-color: var(--text-accent);
  }

  .modern-tag-select:focus-within {
    border-color: var(--text-accent);
    box-shadow: inset 0 0 0 1px var(--text-accent);
  }

  .modern-tag-select.readonly {
    cursor: default;
    background: transparent;
    border: none;
    padding: 4px 8px;
  }

  .modern-tag-select.readonly:hover {
    border-color: transparent;
    box-shadow: none;
  }

  .modern-tag-select.max-reached {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .modern-tag-select.size-sm {
    min-height: 22px;
    max-height: 44px;
    padding: 2px 4px;
  }

  .modern-tag-select.size-lg {
    min-height: 26px;
    max-height: 46px;
    padding: 3px 6px;
  }

  .tag-container {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
    min-height: 20px;
  }

  .selected-tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border-radius: 11px;
    border: 1px solid;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(8px);
  }

  .tag:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .size-sm .tag {
    height: 20px;
    padding: 0 6px;
    font-size: 11px;
  }

  .size-lg .tag {
    height: 24px;
    padding: 0 10px;
    font-size: 13px;
  }

  .tag-text {
    max-width: 150px;
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
    opacity: 0.7;
    transition: all 0.15s ease;
  }

  .tag-remove:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
    transform: scale(1.1);
  }

  .tag-input {
    flex: 1;
    min-width: 60px;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 12px;
    font-family: inherit;
    padding: 0;
    margin: 0;
    height: 22px;
  }

  .size-sm .tag-input {
    font-size: 11px;
    height: 20px;
    min-width: 50px;
  }

  .size-lg .tag-input {
    font-size: 13px;
    height: 24px;
    min-width: 70px;
  }

  .tag-input::placeholder {
    color: var(--text-muted);
    font-weight: 400;
  }


  /* Focus styles for accessibility */
  .tag-remove:focus {
    outline: 2px solid var(--text-accent);
    outline-offset: 2px;
  }

  /* Animation enhancements */
  .tag {
    animation: tagAppear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes tagAppear {
    0% {
      opacity: 0;
      transform: scale(0.8) translateY(4px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* Dark mode enhancements - 使用 Obsidian 主题类 */
  :global(body.theme-dark) .tag:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  :global(body.theme-dark) .tag-remove:hover {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
