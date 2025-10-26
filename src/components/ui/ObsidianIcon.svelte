<!--
  Obsidian 原生图标组件
  封装 Obsidian 的图标系统供 Svelte 组件使用
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { setIcon } from 'obsidian';

  let {
    name,
    size = 16,
    class: className = ''
  }: {
    name: string;
    size?: number;
    class?: string;
  } = $props();

  let iconElement: HTMLSpanElement;

  onMount(() => {
    if (iconElement) {
      setIcon(iconElement, name);
    }
  });

  // 当图标名称变化时更新图标
  $effect(() => {
    if (iconElement && name) {
      setIcon(iconElement, name);
    }
  });
</script>

<span
  bind:this={iconElement}
  class="obsidian-icon {className}"
  style="width: {size}px; height: {size}px; display: inline-block;"
  role="img"
  aria-label={name}
></span>

<style>
  .obsidian-icon {
    vertical-align: middle;
    line-height: 1;
  }

  .obsidian-icon :global(svg) {
    width: 100%;
    height: 100%;
    vertical-align: top;
  }
</style>


