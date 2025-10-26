<script lang="ts">
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import { formatRelativeTimeDetailed } from '../../../utils/helpers';
  import { truncateText } from '../../../utils/ui-helpers';
  import { Notice, MarkdownView } from 'obsidian';
  import type { Card } from '../../../data/types';
  import type AnkiPlugin from '../../../main';

  interface Props {
    card: Card;
    plugin: AnkiPlugin;
    deckName: string;
    templateName: string;
  }

  let { card, plugin, deckName, templateName }: Props = $props();

  // 复制UUID
  function copyUUID() {
    navigator.clipboard.writeText(card.uuid || card.id);
    new Notice('UUID已复制到剪贴板');
  }

  // 跳转到来源文档（增强版：定位并高亮显示）
  async function navigateToSource() {
    try {
      let filePath: string | undefined;
      let blockId: string | undefined;
      
      // ✅ 优先使用专用字段
      if (card.sourceFile) {
        filePath = card.sourceFile;
        blockId = card.sourceBlock?.replace(/^\^/, ''); // 移除^前缀
      } else if (card.customFields?.obsidianFilePath) {
        // 向后兼容
        filePath = card.customFields.obsidianFilePath as string;
        blockId = card.customFields.blockId as string;
      } else if (card.fields?.source_document) {
        filePath = card.fields.source_document as string;
      }
      
      if (!filePath) {
        new Notice('此卡片没有关联的源文档');
        return;
      }
      
      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        new Notice('源文档已被删除');
        return;
      }
      
      // 打开文件
      const leaf = plugin.app.workspace.getLeaf(false);
      await leaf.openFile(file as any);
      
      // 如果有blockId，跳转到指定块并高亮
      if (blockId) {
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
          const content = await plugin.app.vault.read(file as any);
          const lines = content.split('\n');
          
          // 查找包含blockId的行
          let targetLine = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`^${blockId}`)) {
              targetLine = i;
              break;
            }
          }
          
          if (targetLine >= 0) {
            // 跳转到该行
            view.editor.setCursor({ line: targetLine, ch: 0 });
            view.editor.scrollIntoView({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, true);
            
            // 高亮显示该行（选中文本内容，排除 blockId）
            const lineContent = lines[targetLine];
            const blockIdMatch = lineContent.match(/\s*\^\w+$/);
            const contentEnd = blockIdMatch ? lineContent.length - blockIdMatch[0].length : lineContent.length;
            
            view.editor.setSelection(
              { line: targetLine, ch: 0 },
              { line: targetLine, ch: contentEnd }
            );
            
            new Notice('已跳转到源文档');
          } else {
            new Notice('无法找到源文本块');
          }
        }
      } else {
        new Notice('已打开源文档');
      }
    } catch (error) {
      console.error('[CardInfoTab] 跳转到源文档失败:', error);
      new Notice('跳转失败');
    }
  }

  // 获取卡片状态字符串
  function getCardStatusString(state: number): string {
    switch (state) {
      case 0: return '新卡片';
      case 1: return '学习中';
      case 2: return '复习中';
      case 3: return '重新学习';
      default: return '未知';
    }
  }

  // 获取卡片类型显示名
  function getCardTypeName(type: string): string {
    switch (type) {
      case 'basic': return '基础卡片';
      case 'cloze': return '填空题';
      case 'reversed': return '双向卡片';
      default: return type;
    }
  }
</script>

<div class="card-info-tab" role="tabpanel" id="info-panel">
  <!-- 基本信息区 -->
  <section class="info-section">
    <h3 class="section-title">
      <EnhancedIcon name="info" size={16} />
      基本信息
    </h3>
    
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">UUID</span>
        <span class="info-value">
          <button class="uuid-button" onclick={copyUUID} title="点击复制">
            <EnhancedIcon name="hash" size={12} />
            <span>{truncateText(card.uuid || card.id, 32)}</span>
          </button>
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">卡片ID</span>
        <span class="info-value mono">{truncateText(card.id, 32)}</span>
      </div>

      <div class="info-row">
        <span class="info-label">卡片类型</span>
        <span class="info-value">{getCardTypeName(card.type)}</span>
      </div>

      <div class="info-row">
        <span class="info-label">卡片状态</span>
        <span class="info-value">
          <span class="status-badge">{getCardStatusString(card.fsrs?.state || 0)}</span>
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">所属牌组</span>
        <span class="info-value">{deckName}</span>
      </div>

      <div class="info-row">
        <span class="info-label">字段模板</span>
        <span class="info-value">{templateName}</span>
      </div>

      <div class="info-row">
        <span class="info-label">创建时间</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.created)}</span>
      </div>

      <div class="info-row">
        <span class="info-label">修改时间</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.modified)}</span>
      </div>

      {#if card.priority}
        <div class="info-row">
          <span class="info-label">优先级</span>
          <span class="info-value">
            <span class="priority-badge priority-{card.priority}">P{card.priority}</span>
          </span>
        </div>
      {/if}
    </div>
  </section>

  <!-- 标签区 -->
  {#if card.tags && card.tags.length > 0}
    <section class="info-section">
      <h3 class="section-title">
        <EnhancedIcon name="tag" size={16} />
        标签
      </h3>
      <div class="tags-container">
        {#each card.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    </section>
  {/if}

  <!-- 溯源信息区 -->
  <section class="info-section">
    <h3 class="section-title">
      <EnhancedIcon name="link" size={16} />
      溯源信息
    </h3>
    
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">源文档</span>
        <span class="info-value">
          {#if card.sourceFile || card.fields?.source_document}
            <button class="link-button" onclick={navigateToSource} title="点击跳转">
              <EnhancedIcon name="external-link" size={12} />
              <span>{card.sourceFile || card.fields?.source_document}</span>
            </button>
          {:else}
            <span class="text-muted">无源文档</span>
          {/if}
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">块引用</span>
        <span class="info-value">
          {#if card.sourceBlock || card.fields?.obsidian_block_link}
            <span class="mono">{truncateText(card.sourceBlock || card.fields?.obsidian_block_link || '', 30)}</span>
          {:else}
            <span class="text-muted">无块引用</span>
          {/if}
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">文档状态</span>
        <span class="info-value">
          {#if card.sourceExists !== undefined}
            {#if card.sourceExists}
              <span class="status-indicator status-exists">✓ 存在</span>
            {:else}
              <span class="status-indicator status-missing">✗ 已删除</span>
            {/if}
          {:else}
            <span class="text-muted">未知</span>
          {/if}
        </span>
      </div>
    </div>
  </section>
</div>

<style>
  .card-info-tab {
    padding: var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-4);
    overflow-y: auto;
    height: 100%;
  }

  .info-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--size-4-4);
    padding-bottom: var(--size-4-2);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-3);
  }

  .info-row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: var(--size-4-3);
    align-items: center;
  }

  .info-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-weight: 500;
  }

  .info-value {
    font-size: var(--font-ui-medium);
    color: var(--text-normal);
    word-break: break-word;
  }

  .mono {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
  }

  .text-muted {
    color: var(--text-muted);
    font-style: italic;
  }

  .uuid-button,
  .link-button {
    display: inline-flex;
    align-items: center;
    gap: var(--size-4-1);
    background: transparent;
    border: none;
    color: var(--interactive-accent);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-s);
    transition: all 0.2s ease;
  }

  .uuid-button:hover,
  .link-button:hover {
    background: var(--background-modifier-hover);
    text-decoration: underline;
  }

  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 500;
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .priority-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 600;
  }

  .priority-1 {
    background: #fee2e2;
    color: #991b1b;
  }

  .priority-2 {
    background: #fef3c7;
    color: #92400e;
  }

  .priority-3 {
    background: #dbeafe;
    color: #1e40af;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--size-4-2);
  }

  .tag {
    display: inline-block;
    padding: 4px 12px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    font-weight: 500;
  }

  .status-indicator {
    font-weight: 600;
  }

  .status-exists {
    color: var(--text-success);
  }

  .status-missing {
    color: var(--text-error);
  }

  /* 滚动条样式 */
  .card-info-tab::-webkit-scrollbar {
    width: 8px;
  }

  .card-info-tab::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .card-info-tab::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .card-info-tab::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* 响应式适配 */
  @media (max-width: 600px) {
    .info-row {
      grid-template-columns: 1fr;
      gap: var(--size-4-1);
    }

    .info-label {
      font-size: var(--font-ui-smaller);
    }
  }
</style>

