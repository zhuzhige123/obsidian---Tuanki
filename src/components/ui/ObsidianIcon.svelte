<!--
  Obsidian 原生图标组件
  封装 Obsidian 的图标系统供 Svelte 组件使用
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { setIcon } from 'obsidian';
  import { resolveObsidianIconName } from '../../icons/obsidian-icon-resolver';

  let {
    name,
    size = 16,
    class: className = ''
  }: {
    name: string;
    size?: number | string;
    class?: string;
  } = $props();

  let iconElement: HTMLSpanElement;

  const normalizedSize = $derived.by(() => {
    if (typeof size === 'number' && Number.isFinite(size)) {
      return size;
    }
    if (typeof size === 'string') {
      const parsed = Number.parseInt(size, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 16;
  });

  onMount(() => {
    if (iconElement) {
      setIcon(iconElement, resolveObsidianIconName(name));
      // 确保 SVG 尺寸正确
      const svg = iconElement.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', String(normalizedSize));
        svg.setAttribute('height', String(normalizedSize));
        svg.style.width = `${normalizedSize}px`;
        svg.style.height = `${normalizedSize}px`;
      }
    }
  });

  // 当图标名称或尺寸变化时更新图标
  $effect(() => {
    if (iconElement && name) {
      setIcon(iconElement, resolveObsidianIconName(name));
      // 确保 SVG 尺寸正确
      const svg = iconElement.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', String(normalizedSize));
        svg.setAttribute('height', String(normalizedSize));
        svg.style.width = `${normalizedSize}px`;
        svg.style.height = `${normalizedSize}px`;
      }
    }
  });
</script>

<span
  bind:this={iconElement}
  class="obsidian-icon {className}"
  style="width: {normalizedSize}px; height: {normalizedSize}px; min-width: {normalizedSize}px; min-height: {normalizedSize}px; display: inline-flex; align-items: center; justify-content: center;"
  role="img"
  aria-label={name}
></span>

<style>
  .obsidian-icon {
    vertical-align: middle;
    line-height: 1;
    flex-shrink: 0;
  }

  .obsidian-icon :global(svg) {
    width: 100% !important;
    height: 100% !important;
    vertical-align: top;
    flex-shrink: 0;
  }
</style>


