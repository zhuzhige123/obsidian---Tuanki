<script lang="ts">
  import { Notice } from "obsidian";
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";
  import { ICON_NAMES } from "../../../../icons/index.js";
  import { ObsidianNavigationService } from "../../../../services/obsidian-navigation-service";
  import { truncateText } from "../../utils/table-utils";
  import type { LinkCellProps } from "../../types/table-types";

  let { card, plugin }: LinkCellProps = $props();

  async function handleBlockLinkClick(blockLink: string) {
    if (!blockLink || !plugin) return;

    try {
      const navigationService = new ObsidianNavigationService(plugin);
      const linkMatch = blockLink.match(/\[\[([^#]+)#\^([^\]]+)\]\]/);
      
      if (linkMatch) {
        const [, fileName, blockId] = linkMatch;
        const files = plugin.app.vault.getMarkdownFiles();
        const targetFile = files.find((file: any) =>
          file.basename === fileName || file.name === fileName + '.md'
        );

        if (targetFile) {
          const result = await navigationService.navigateToFile({
            filePath: targetFile.path,
            blockId: blockId
          }, {
            newTab: false,
            focus: true,
            showNotification: true
          });

          if (!result.success) {
            console.error(`❌ 跳转失败: ${result.error}`);
          }
        } else {
          console.error(`❌ 找不到文件: ${fileName}`);
        }
      }
    } catch (error) {
      console.error('❌ 处理块链接点击失败:', error);
    }
  }

  async function navigateToDocument(documentName: string) {
    if (!documentName || !plugin) return;

    try {
      let targetFile = plugin.app.vault.getMarkdownFiles().find((file: any) => 
        file.basename === documentName
      );

      if (!targetFile) {
        targetFile = plugin.app.vault.getMarkdownFiles().find((file: any) => 
          file.name === documentName || file.name === documentName + '.md'
        );
      }

      if (!targetFile) {
        targetFile = plugin.app.vault.getMarkdownFiles().find((file: any) => 
          file.path.contains(documentName)
        );
      }

      if (targetFile) {
        const navigationService = new ObsidianNavigationService(plugin);
        const result = await navigationService.navigateToFile({
          filePath: targetFile.path
        }, {
          newTab: false,
          focus: true,
          showNotification: true
        });

        if (!result.success) {
          new Notice(`❌ 打开文档失败: ${result.error}`, 3000);
        }
      } else {
        new Notice(`❌ 找不到源文档: ${documentName}`, 3000);
      }
    } catch (error) {
      console.error('❌ 导航异常:', error);
      new Notice('❌ 打开文档失败', 3000);
    }
  }
</script>

<td class="tuanki-link-column">
  <div class="tuanki-cell-content">
    {#if card.fields?.obsidian_block_link}
      <button
        class="tuanki-block-link"
        onclick={() => handleBlockLinkClick(card.fields?.obsidian_block_link || '')}
        title="点击跳转到原始位置"
      >
        <EnhancedIcon name={ICON_NAMES.LINK} size={14} />
        <span class="tuanki-link-text">{truncateText(card.fields?.obsidian_block_link || '', 20)}</span>
      </button>
    {:else if card.fields?.source_document}
      <button
        class="tuanki-document-only-link"
        onclick={() => navigateToDocument(card.fields?.source_document || '')}
        title="无精确块链接，点击打开源文档"
      >
        <EnhancedIcon name={ICON_NAMES.FILE_TEXT} size={14} />
        <span class="tuanki-text-muted">文档链接</span>
      </button>
    {:else}
      <span class="tuanki-no-link" title="该卡片无来源追踪">
        <EnhancedIcon name={ICON_NAMES.LINK} size={14} />
        <span class="tuanki-text-muted">无链接</span>
      </span>
    {/if}
  </div>
</td>

<style>
  @import '../../styles/cell-common.css';

  .tuanki-link-column {
    width: 150px;
    text-align: left;
  }

  .tuanki-block-link,
  .tuanki-document-only-link {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    color: var(--text-accent);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: var(--radius-s);
    transition: all 0.2s ease;
    font-size: 0.875rem;
    max-width: 100%;
  }

  .tuanki-block-link:hover,
  .tuanki-document-only-link:hover {
    background: var(--background-modifier-hover);
    color: var(--text-accent-hover);
  }

  .tuanki-link-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tuanki-no-link {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>


