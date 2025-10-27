<script lang="ts">
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";
  import { Menu } from "obsidian";
  import type { ActionsCellProps } from "../../types/table-types";

  let { card, onView, onTempFileEdit, onEdit, onDelete }: ActionsCellProps = $props();

  /**
   * 显示 Obsidian 原生菜单
   */
  function showMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const menu = new Menu();

    // 查看详情
    if (onView) {
      menu.addItem((item) => {
        item
          .setTitle("查看详情")
          .setIcon("eye")
          .onClick(() => {
            onView(card.id);
          });
      });
    }

    // 编辑卡片
    menu.addItem((item) => {
      item
        .setTitle("编辑卡片")
        .setIcon("edit")
        .onClick(() => {
          if (onTempFileEdit) {
            onTempFileEdit(card.id);
          } else {
            onEdit(card.id);
          }
        });
    });

    // 分隔线
    menu.addSeparator();

    // 删除卡片（警告样式）
    menu.addItem((item) => {
      item
        .setTitle("删除卡片")
        .setIcon("trash")
        .setWarning(true)
        .onClick(() => {
          onDelete(card.id);
        });
    });

    // 在鼠标位置显示菜单
    menu.showAtMouseEvent(event);
  }
</script>

<td class="tuanki-actions-column">
  <div class="tuanki-actions-container">
    <!-- Obsidian 原生菜单按钮 -->
    <button
      class="actions-menu-button"
      onclick={showMenu}
      title="操作菜单"
    >
      <EnhancedIcon name="more-horizontal" size={16} />
    </button>
  </div>
</td>

<style>
  .tuanki-actions-column {
    width: 60px;
    min-width: 60px;
    max-width: 60px;
    text-align: center;
  }

  .tuanki-actions-container {
    display: flex;
    justify-content: center;
  }

  .actions-menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    cursor: pointer;
    transition: all 0.2s ease;
    color: var(--text-muted);
  }

  .actions-menu-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    color: var(--text-normal);
  }

  .actions-menu-button:active {
    background: var(--background-modifier-active-hover);
  }
</style>


