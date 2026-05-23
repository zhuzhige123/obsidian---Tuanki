<script lang="ts">
  import { Menu } from "obsidian";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import {
    getRatingLabelStyleLabel,
    getRatingLabelStyleOptions,
    normalizeRatingLabelStyle,
    type RatingLabelStyle,
  } from "./rating-label-style";

  interface Props {
    style: RatingLabelStyle;
    className?: string;
    translate: (key: string, params?: Record<string, string | number>) => string;
    onStyleChange?: (style: RatingLabelStyle) => void;
  }

  let { style, className = "", translate: t, onStyleChange }: Props = $props();

  let styleOptions = $derived(getRatingLabelStyleOptions(t));
  let normalizedStyle = $derived(normalizeRatingLabelStyle(style));
  let displayLabel = $derived(getRatingLabelStyleLabel(normalizedStyle, t));

  function showMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const menu = new Menu();
    menu.setUseNativeMenu?.(false);

    for (const option of styleOptions) {
      menu.addItem((item) => {
        item
          .setTitle(option.label)
          .setChecked(option.id === normalizedStyle)
          .onClick(() => {
            onStyleChange?.(option.id);
          });
      });
    }

    menu.showAtMouseEvent(event);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      showMenu(event as unknown as MouseEvent);
    }
  }
</script>

<button
  type="button"
  class="rating-label-style-setting-trigger {className}"
  onclick={showMenu}
  onkeydown={handleKeydown}
  aria-haspopup="menu"
  aria-label={t("study.menu.settings.ratingLabelStyle")}
>
  <span class="dropdown-text">{displayLabel}</span>
  <ObsidianIcon name="chevron-down" size={14} class="dropdown-icon" />
</button>

<style>
  .rating-label-style-setting-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--background-modifier-form-field);
    border: 1px dashed color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
    border-radius: var(--input-radius);
    color: var(--text-normal);
    font-family: var(--font-interface);
    font-size: var(--font-ui-small);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .rating-label-style-setting-trigger:hover {
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, var(--background-modifier-border));
    background: var(--background-modifier-hover);
  }

  .rating-label-style-setting-trigger:focus-visible {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .dropdown-text {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
