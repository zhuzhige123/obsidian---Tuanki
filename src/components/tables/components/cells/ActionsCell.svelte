<script lang="ts">
  import { Menu } from "obsidian";
  import { tr } from "../../../../utils/i18n";
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";
  import { isMemoryCard } from "../../../../utils/card-reset-utils";
  import type { ActionsCellProps } from "../../types/table-types";

  let {
    card,
    onView,
    onTempFileEdit,
    onResetToNewCard,
    onEdit,
    onDelete
  }: ActionsCellProps = $props();
  let t = $derived($tr);

  function showMenu(event: MouseEvent) {
    event.preventDefault();

    const menu = new Menu();

    if (onView) {
      menu.addItem((item) => {
        item
          .setTitle(t("study.menu.cardDetails"))
          .setIcon("eye")
          .onClick(() => onView(card.uuid));
      });
    }

    if (onEdit || onTempFileEdit) {
      menu.addItem((item) => {
        item
          .setTitle(t("study.menu.editCard"))
          .setIcon("edit")
          .onClick(() => {
            if (onTempFileEdit) {
              onTempFileEdit(card.uuid);
            } else if (onEdit) {
              onEdit(card.uuid);
            }
          });
      });
    }

    if (onResetToNewCard && isMemoryCard(card)) {
      menu.addItem((item) => {
        item
          .setTitle(t("cardManagement.actions.resetToNewCard"))
          .setIcon("rotate-ccw")
          .onClick(() => onResetToNewCard(card.uuid));
      });
    }

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle(t("study.menu.deleteCard"))
        .setIcon("trash")
        .setWarning(true)
        .onClick(() => onDelete(card.uuid));
    });

    menu.showAtMouseEvent(event);
  }
</script>

<div class="weave-actions-container">
  <button
    class="actions-menu-button"
    onclick={showMenu}
    aria-label={t("cardManagement.actions.menu")}
    type="button"
  >
    <EnhancedIcon name="more-horizontal" size={16} ariaLabel={t("cardManagement.actions.menu")} />
  </button>
</div>

<style>
  .weave-actions-container {
    display: flex;
    justify-content: center;
  }

  .actions-menu-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: color-mix(in srgb, var(--weave-table-surface-bg, var(--background-secondary)) 90%, transparent);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
    border-radius: 999px;
    cursor: pointer;
    transition: transform 0.18s ease, opacity 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
    color: var(--text-faint);
    opacity: 1;
    transform: translateY(0);
  }

  .actions-menu-button:focus-visible {
    opacity: 1;
    color: var(--text-normal);
    background: color-mix(in srgb, var(--background-modifier-hover) 72%, transparent);
    border-color: color-mix(in srgb, var(--background-modifier-border) 80%, transparent);
    transform: translateY(0);
  }

  .actions-menu-button:hover {
    background: color-mix(in srgb, var(--interactive-accent) 16%, var(--weave-table-surface-bg, var(--background-secondary))) !important;
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, transparent) !important;
    color: color-mix(in srgb, var(--interactive-accent) 78%, var(--text-normal)) !important;
    opacity: 1 !important;
    transform: translateY(0) scale(1.04);
  }

  .actions-menu-button:active {
    transform: translateY(0) scale(0.96);
  }

  @media (hover: none), (pointer: coarse) {
    .actions-menu-button {
      opacity: 1;
      transform: translateY(0);
      background: color-mix(in srgb, var(--weave-table-surface-bg, var(--background-secondary)) 95%, transparent);
      border-color: color-mix(in srgb, var(--background-modifier-border) 72%, transparent);
      color: var(--text-muted);
    }
  }

  @media (max-width: 768px) {
    .actions-menu-button {
      width: 30px;
      height: 30px;
    }
  }
</style>
