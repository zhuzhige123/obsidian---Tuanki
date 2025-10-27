<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { MarkdownRenderer, Component } from 'obsidian';
  import type AnkiPlugin from "../../main";

  interface Props {
    plugin: AnkiPlugin;
    source: string;
    sourcePath?: string;
  }
  let { plugin, source, sourcePath = '' }: Props = $props();

  let container: HTMLDivElement;
  let component: Component | null = null;

  async function renderMarkdown() {
    if (!container) return;

    // 清理之前的渲染
    if (component) {
      component.unload();
    }
    container.innerHTML = '';

    component = new Component();
    await MarkdownRenderer.render(
      plugin.app,
      source || '*空内容*', // 显示占位符
      container,
      sourcePath,
      component
    );
    component.load();
  }

  onMount(() => {
    renderMarkdown();
  });

  $effect(() => {
    // 当source内容变化时自动重新渲染
    if (container) {
      renderMarkdown();
    }
  });

  onDestroy(() => {
    if (component) {
      component.unload();
    }
  });
</script>

<div bind:this={container} class="markdown-preview-helper markdown-reading-view">
</div>

<style>
  .markdown-preview-helper {
    width: 100%;
    min-height: 40px; /* 给予一个最小高度 */
    padding: 10px;
    border: 1px dashed transparent;
    border-radius: 6px;
    transition: all 0.2s ease;
    pointer-events: none; /* 允许点击穿透到父元素 */
  }
</style>
