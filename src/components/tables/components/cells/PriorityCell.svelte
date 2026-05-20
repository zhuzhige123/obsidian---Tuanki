<script lang="ts">
  import { Menu, Platform } from 'obsidian';
  import { tr } from '../../../../utils/i18n';
  import type { PriorityCellProps } from "../../types/table-types";

  let { card, onPriorityUpdate }: PriorityCellProps = $props();
  let t = $derived($tr);

  const isMobile = Platform.isMobile;

  function getPriorityConfig(priority: number): { label: string; short: string; tone: string } {
    switch (priority) {
      case 1:
        return { label: t('cardManagement.table.priority.level.low'), short: 'P1', tone: 'gray' };
      case 2:
        return { label: t('cardManagement.table.priority.level.medium'), short: 'P2', tone: 'blue' };
      case 3:
        return { label: t('cardManagement.table.priority.level.high'), short: 'P3', tone: 'orange' };
      case 4:
        return { label: t('cardManagement.table.priority.level.urgent'), short: 'P4', tone: 'red' };
      default:
        return { label: t('cardManagement.table.priority.level.medium'), short: 'P2', tone: 'blue' };
    }
  }

  let currentPriority = $derived(card.priority || 2);
  let config = $derived(getPriorityConfig(currentPriority));

  function showPriorityMenu(event: MouseEvent) {
    if (!onPriorityUpdate) return;

    const menu = new Menu();
    [1, 2, 3, 4].forEach((priority) => {
      const itemConfig = getPriorityConfig(priority);
      menu.addItem((item) => {
        item
          .setTitle(`${itemConfig.short} · ${itemConfig.label}`)
          .setIcon(priority === currentPriority ? 'check' : 'circle')
          .onClick(() => onPriorityUpdate(card.uuid, priority));
      });
    });

    menu.showAtMouseEvent(event);
  }
</script>

<td class="weave-priority-column">
  <button
    class="weave-priority-badge tone-{config.tone}"
    onclick={showPriorityMenu}
    aria-label={t('cardManagement.table.priority.ariaLabel', { short: config.short, label: config.label })}
    title={isMobile ? t('cardManagement.table.priority.mobileTitle') : t('cardManagement.table.priority.desktopTitle', { label: config.label })}
    type="button"
  >
    <span class="priority-dot"></span>
    <span class="priority-text">{config.short}</span>
  </button>
</td>

<style>
  .weave-priority-column {
    width: 64px;
    min-width: 64px;
    max-width: 64px;
    text-align: center;
    padding: var(--weave-table-cell-padding-y, 6px) var(--weave-table-cell-padding-x, 16px);
    border-right: 1px solid var(--weave-table-grid-border-color, var(--background-modifier-border));
    border-bottom: 1px solid var(--weave-table-grid-border-color, var(--background-modifier-border));
    vertical-align: middle;
    box-sizing: border-box;
  }

  .weave-priority-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 48px;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: transform 0.16s ease, filter 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
  }

  .priority-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.88;
    flex-shrink: 0;
  }

  .priority-text {
    line-height: 1;
  }

  .weave-priority-badge.tone-gray {
    background: color-mix(in srgb, var(--color-gray) 12%, transparent);
    color: var(--color-gray);
    border-color: color-mix(in srgb, var(--color-gray) 20%, transparent);
  }

  .weave-priority-badge.tone-blue {
    background: color-mix(in srgb, var(--color-blue) 12%, transparent);
    color: var(--color-blue);
    border-color: color-mix(in srgb, var(--color-blue) 20%, transparent);
  }

  .weave-priority-badge.tone-orange {
    background: color-mix(in srgb, var(--color-orange) 12%, transparent);
    color: var(--color-orange);
    border-color: color-mix(in srgb, var(--color-orange) 22%, transparent);
  }

  .weave-priority-badge.tone-red {
    background: color-mix(in srgb, var(--color-red) 12%, transparent);
    color: var(--color-red);
    border-color: color-mix(in srgb, var(--color-red) 22%, transparent);
  }

  .weave-priority-badge:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
  }

  .weave-priority-badge:active {
    transform: scale(0.97);
  }

  .weave-priority-badge:focus-visible {
    outline: 2px solid color-mix(in srgb, currentColor 36%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .weave-priority-column {
      width: 72px;
      min-width: 72px;
      max-width: 72px;
      padding: 6px 10px;
    }

    .weave-priority-badge {
      min-width: 50px;
      min-height: 20px;
      padding: 0 8px;
      font-size: 11px;
    }

    .priority-dot {
      width: 4px;
      height: 4px;
      opacity: 0.78;
    }
  }
</style>
