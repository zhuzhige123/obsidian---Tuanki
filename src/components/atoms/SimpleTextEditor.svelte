<script lang="ts">
  import type AnkiPlugin from '../../main';

  let {
    value = $bindable(""),
    placeholder = "",
    readOnly = false,
    onValueChange,
    plugin,
    minHeight = 80
  } = $props();

  let textareaElement: HTMLTextAreaElement;

  // 自动调整高度
  function autoResize() {
    if (textareaElement) {
      textareaElement.style.height = 'auto';
      textareaElement.style.height = Math.max(minHeight, textareaElement.scrollHeight) + 'px';
    }
  }

  // 处理输入变化
  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    value = target.value;
    
    if (onValueChange) {
      onValueChange(target.value);
    }
    
    autoResize();
  }

  // 当值从外部更新时，调整高度
  $effect(() => {
    if (textareaElement && value !== undefined) {
      textareaElement.value = value;
      autoResize();
    }
  });

  // 组件挂载后初始化高度
  $effect(() => {
    if (textareaElement) {
      autoResize();
    }
  });
</script>

<div class="simple-editor-wrapper">
  <textarea
    bind:this={textareaElement}
    {value}
    {placeholder}
    {readOnly}
    oninput={handleInput}
    class="simple-editor"
    style="min-height: {minHeight}px;"
  ></textarea>
</div>

<style>
  .simple-editor-wrapper {
    position: relative;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    overflow: hidden;
  }

  .simple-editor {
    width: 100%;
    border: none;
    outline: none;
    resize: none;
    padding: 12px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-text, var(--font-default));
    font-size: 15px;
    line-height: 1.6;
    overflow: hidden;
    box-sizing: border-box;
  }

  .simple-editor:focus {
    outline: none;
  }

  .simple-editor-wrapper:focus-within {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-accent) 20%, transparent);
  }

  .simple-editor::placeholder {
    color: var(--text-muted);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .simple-editor {
      font-size: 14px;
      padding: 10px;
    }
  }
</style>
