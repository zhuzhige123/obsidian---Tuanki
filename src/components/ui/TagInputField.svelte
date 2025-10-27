<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import EnhancedIcon from './EnhancedIcon.svelte';
  import { scale, fly } from 'svelte/transition';
  import { elasticOut, backOut } from 'svelte/easing';

  interface Props {
    tags?: string[] | string;
    placeholder?: string;
    readonly?: boolean;
    maxTags?: number;
  }

  let {
    tags = [],
    placeholder = "输入 #标签 或 #父标签/子标签",
    readonly = false,
    maxTags = undefined
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    change: string[];
  }>();

  let inputValue = $state('');
  let inputRef = $state<HTMLInputElement>();
  let currentTags = $state<string[]>([]);

  // 解析输入的标签（支持字符串和数组）
  function parseInputTags(input: string[] | string): string[] {
    if (Array.isArray(input)) {
      return input;
    }
    if (typeof input === 'string') {
      return input.split(',').map(tag => tag.trim()).filter(Boolean);
    }
    return [];
  }

  // 监听外部tags变化
  $effect(() => {
    currentTags = parseInputTags(tags);
  });

  // 解析标签输入，支持 #标签 和 #父标签/子标签 格式
  function parseTagInput(input: string): string[] {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // 移除开头的#号（如果有）
    const cleanInput = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    
    // 分割父标签和子标签
    const parts = cleanInput.split('/').map(part => part.trim()).filter(Boolean);
    
    if (parts.length === 1) {
      // 单个标签
      return [parts[0]];
    } else if (parts.length === 2) {
      // 父标签/子标签
      const [parent, child] = parts;
      return [parent, `${parent}/${child}`];
    }
    
    return [];
  }

  function addTags(newTags: string[]) {
    if (readonly) return;
    
    const validTags = newTags.filter(tag => 
      tag && 
      tag.trim() && 
      !currentTags.includes(tag.trim())
    ).map(tag => tag.trim());

    if (validTags.length === 0) return;

    // 检查最大标签数限制
    if (maxTags && currentTags.length + validTags.length > maxTags) {
      const remainingSlots = maxTags - currentTags.length;
      if (remainingSlots <= 0) return;
      validTags.splice(remainingSlots);
    }

    currentTags = [...currentTags, ...validTags];
    dispatch('change', currentTags);
  }

  function removeTag(tagToRemove: string) {
    if (readonly) return;
    currentTags = currentTags.filter(tag => tag !== tagToRemove);
    dispatch('change', currentTags);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && inputValue.trim()) {
      event.preventDefault();
      const newTags = parseTagInput(inputValue);
      addTags(newTags);
      inputValue = '';
    } else if (event.key === 'Backspace' && !inputValue && currentTags.length > 0) {
      // 如果输入框为空且按下退格键，删除最后一个标签
      event.preventDefault();
      removeTag(currentTags[currentTags.length - 1]);
    }
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    inputValue = target.value;
  }

  // 获取标签颜色样式
  function getTagStyle(tag: string) {
    // 简单的哈希函数来分配颜色
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash << 5) - hash + tag.charCodeAt(i)) & 0xffffffff;
    }
    
    const colors = [
      { bg: 'var(--tuanki-tag-blue-bg)', text: 'var(--tuanki-tag-blue-text)', border: 'var(--tuanki-tag-blue-border)' }, // blue
      { bg: 'var(--tuanki-tag-purple-bg)', text: 'var(--tuanki-tag-purple-text)', border: 'var(--tuanki-tag-purple-border)' }, // purple
      { bg: 'var(--tuanki-tag-pink-bg)', text: 'var(--tuanki-tag-pink-text)', border: 'var(--tuanki-tag-pink-border)' }, // pink
      { bg: 'var(--tuanki-tag-red-bg)', text: 'var(--tuanki-tag-red-text)', border: 'var(--tuanki-tag-red-border)' }, // red
      { bg: 'var(--tuanki-tag-orange-bg)', text: 'var(--tuanki-tag-orange-text)', border: 'var(--tuanki-tag-orange-border)' }, // orange
      { bg: 'var(--tuanki-tag-green-bg)', text: 'var(--tuanki-tag-green-text)', border: 'var(--tuanki-tag-green-border)' }, // green
      { bg: 'var(--tuanki-tag-cyan-bg)', text: 'var(--tuanki-tag-cyan-text)', border: 'var(--tuanki-tag-cyan-border)' }, // cyan
      { bg: 'var(--tuanki-tag-gray-bg)', text: 'var(--tuanki-tag-gray-text)', border: 'var(--tuanki-tag-gray-border)' }, // gray
    ];
    
    const colorIndex = Math.abs(hash) % colors.length;
    return colors[colorIndex];
  }
</script>

<div class="tag-input-field" class:readonly>
  <!-- 已选标签显示 -->
  {#if currentTags.length > 0}
    <div class="selected-tags">
      {#each currentTags as tag (tag)}
        {@const tagStyle = getTagStyle(tag)}
        <span
          class="tag-chip"
          style="background-color: {tagStyle.bg}; color: {tagStyle.text};"
          in:scale={{ duration: 300, easing: backOut, start: 0.8 }}
          out:fly={{ duration: 200, x: -20, opacity: 0 }}
        >
          <span class="tag-text">{tag}</span>
          {#if !readonly}
            <button
              class="tag-remove"
              type="button"
              aria-label="移除标签 {tag}"
              onclick={() => removeTag(tag)}
            >
              <EnhancedIcon name="x" size="12" />
            </button>
          {/if}
        </span>
      {/each}
    </div>
  {/if}

  <!-- 标签输入框 -->
  {#if !readonly && (!maxTags || currentTags.length < maxTags)}
    <div class="tag-input-wrapper">
      <input
        bind:this={inputRef}
        type="text"
        class="tag-input"
        bind:value={inputValue}
        {placeholder}
        onkeydown={handleKeyDown}
        oninput={handleInput}
        autocomplete="off"
      />
    </div>
  {/if}
</div>

<style>
  .tag-input-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0.875rem 0;
    background: transparent;
    border: none;
    transition: all 0.2s ease;
  }


  .tag-input-field.readonly {
    background: transparent;
  }

  .selected-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 12px;
    border: none;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1;
    transition: all 0.15s ease;
    max-width: 200px;
    white-space: nowrap;
    user-select: none;
    height: 26px;
  }

  .tag-chip:hover {
    filter: brightness(0.95);
    transform: translateY(-1px) scale(1.01);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--text-normal) 15%, transparent);
  }

  .tag-chip:active {
    transform: translateY(-1px) scale(0.98);
    transition: all 0.1s ease;
  }

  .tag-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: transparent;
    border: none;
    color: currentColor;
    opacity: 0.6;
    cursor: pointer;
    padding: 0;
    margin: 0;
    border-radius: 50%;
    transition: all 0.15s ease;
  }

  .tag-remove:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--text-normal) 15%, transparent);
    transform: scale(1.1) rotate(90deg);
  }

  .tag-remove:active {
    transform: scale(0.9) rotate(90deg);
    transition: all 0.1s ease;
  }

  .tag-input-wrapper {
    flex: 1;
    min-width: 120px;
  }

  .tag-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-normal);
    font-size: 0.875rem;
    padding: 0.375rem 0;
    font-weight: 500;
  }

  .tag-input::placeholder {
    color: var(--text-faint);
    font-style: normal;
    font-weight: 400;
  }

  /* 主题优化 */
  :global(body.theme-dark) .tag-input-field {
    background: transparent;
  }

  :global(body.theme-light) .tag-input-field {
    background: transparent;
  }
</style>
