<script lang="ts">
  import { logger } from '../../utils/logger';

  /**
   * Markdown编辑器工具栏组件
   * 提供常用的Markdown格式化功能
   */
  
  import { createEventDispatcher } from 'svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  interface Props {
    /** 是否为预览模式 */
    isPreviewMode?: boolean;
    /** 是否有内容 */
    hasContent?: boolean;
    /** 是否只读 */
    readonly?: boolean;
    /** 命令回调 */
    onCommand?: (event: CustomEvent<{ command: string; args?: any[] }>) => void;
    /** 预览切换回调 */
    onTogglePreview?: () => void;
  }

  let {
    isPreviewMode = false,
    hasContent = false,
    readonly = false,
    onCommand,
    onTogglePreview
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    command: { command: string; args?: any[] };
    togglePreview: void;
  }>();

  // 工具栏按钮配置
  const formatButtons = [
    {
      id: 'bold',
      icon: 'bold',
      title: '粗体 (Ctrl+B)',
      command: 'bold',
      shortcut: 'Ctrl+B'
    },
    {
      id: 'italic',
      icon: 'italic',
      title: '斜体 (Ctrl+I)',
      command: 'italic',
      shortcut: 'Ctrl+I'
    },
    {
      id: 'strikethrough',
      icon: 'strikethrough',
      title: '删除线',
      command: 'strikethrough'
    }
  ];

  const insertButtons = [
    {
      id: 'heading',
      icon: 'heading',
      title: '标题',
      command: 'heading',
      hasDropdown: true,
      options: [
        { label: 'H1', command: 'heading', args: [1] },
        { label: 'H2', command: 'heading', args: [2] },
        { label: 'H3', command: 'heading', args: [3] },
        { label: 'H4', command: 'heading', args: [4] },
        { label: 'H5', command: 'heading', args: [5] },
        { label: 'H6', command: 'heading', args: [6] }
      ]
    },
    {
      id: 'link',
      icon: 'link',
      title: '链接 (Ctrl+K)',
      command: 'link',
      shortcut: 'Ctrl+K'
    },
    {
      id: 'image',
      icon: 'image',
      title: '图片',
      command: 'image'
    },
    {
      id: 'code',
      icon: 'code',
      title: '代码',
      command: 'code'
    },
    {
      id: 'code-block',
      icon: 'code-2',
      title: '代码块',
      command: 'codeBlock'
    }
  ];

  const listButtons = [
    {
      id: 'bullet-list',
      icon: 'list',
      title: '无序列表',
      command: 'bulletList'
    },
    {
      id: 'numbered-list',
      icon: 'list-ordered',
      title: '有序列表',
      command: 'numberedList'
    },
    {
      id: 'task-list',
      icon: 'check-square',
      title: '任务列表',
      command: 'taskList'
    }
  ];

  const obsidianButtons = [
    {
      id: 'wiki-link',
      icon: 'link-2',
      title: 'Wiki链接 [[]]',
      command: 'wikiLink'
    },
    {
      id: 'tag',
      icon: 'hash',
      title: '标签 #',
      command: 'tag'
    },
    {
      id: 'callout',
      icon: 'message-square',
      title: 'Callout',
      command: 'callout',
      hasDropdown: true,
      options: [
        { label: 'Note', command: 'callout', args: ['note'] },
        { label: 'Tip', command: 'callout', args: ['tip'] },
        { label: 'Important', command: 'callout', args: ['important'] },
        { label: 'Warning', command: 'callout', args: ['warning'] },
        { label: 'Caution', command: 'callout', args: ['caution'] }
      ]
    },
    {
      id: 'math',
      icon: 'calculator',
      title: '数学公式',
      command: 'math'
    }
  ];

  // 下拉菜单状态
  let activeDropdown = $state<string | null>(null);

  /**
   * 执行命令
   */
  function executeCommand(command: string, args?: any[]): void {
    if (readonly) return;

    const event = new CustomEvent('command', {
      detail: { command, args }
    });

    dispatch('command', { command, args });

    if (onCommand) {
      onCommand(event);
    } else {
      logger.warn('[MarkdownToolbar] No onCommand callback provided');
    }

    // 关闭下拉菜单
    activeDropdown = null;
  }

  /**
   * 切换下拉菜单
   */
  function toggleDropdown(buttonId: string): void {
    activeDropdown = activeDropdown === buttonId ? null : buttonId;
  }

  /**
   * 切换预览模式
   */
  function handleTogglePreview(): void {
    dispatch('togglePreview');
    if (onTogglePreview) {
      onTogglePreview();
    }
  }

  /**
   * 关闭所有下拉菜单
   */
  function closeDropdowns(): void {
    activeDropdown = null;
  }
</script>

<svelte:window onclick={closeDropdowns} />

<div class="markdown-toolbar" class:readonly>
  <!-- 格式化按钮组 -->
  <div class="toolbar-group">
    {#each formatButtons as button (button.id)}
      <button
        class="clickable-icon toolbar-btn"
        title={button.title}
        onclick={() => executeCommand(button.command)}
        disabled={readonly}
      >
        <EnhancedIcon name={button.icon} size="14" />
      </button>
    {/each}
  </div>

  <div class="toolbar-separator"></div>

  <!-- 插入按钮组 -->
  <div class="toolbar-group">
    {#each insertButtons as button (button.id)}
      <div class="toolbar-btn-container">
        <button
          class="clickable-icon toolbar-btn"
          class:has-dropdown={button.hasDropdown}
          class:active={activeDropdown === button.id}
          title={button.title}
          onclick={() => button.hasDropdown ? toggleDropdown(button.id) : executeCommand(button.command)}
          disabled={readonly}
        >
          <EnhancedIcon name={button.icon} size="14" />
          {#if button.hasDropdown}
            <EnhancedIcon name="chevron-down" size="10" />
          {/if}
        </button>

        {#if button.hasDropdown && activeDropdown === button.id && button.options}
          <div class="toolbar-dropdown">
            {#each button.options as option (option.label)}
              <button
                class="dropdown-item"
                onclick={() => executeCommand(option.command, option.args)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="toolbar-separator"></div>

  <!-- 列表按钮组 -->
  <div class="toolbar-group">
    {#each listButtons as button (button.id)}
      <button
        class="clickable-icon toolbar-btn"
        title={button.title}
        onclick={() => executeCommand(button.command)}
        disabled={readonly}
      >
        <EnhancedIcon name={button.icon} size="14" />
      </button>
    {/each}
  </div>

  <div class="toolbar-separator"></div>

  <!-- Obsidian功能按钮组 -->
  <div class="toolbar-group">
    {#each obsidianButtons as button (button.id)}
      <div class="toolbar-btn-container">
        <button
          class="clickable-icon toolbar-btn"
          class:has-dropdown={button.hasDropdown}
          class:active={activeDropdown === button.id}
          title={button.title}
          onclick={() => button.hasDropdown ? toggleDropdown(button.id) : executeCommand(button.command)}
          disabled={readonly}
        >
          <EnhancedIcon name={button.icon} size="14" />
          {#if button.hasDropdown}
            <EnhancedIcon name="chevron-down" size="10" />
          {/if}
        </button>

        {#if button.hasDropdown && activeDropdown === button.id && button.options}
          <div class="toolbar-dropdown">
            {#each button.options as option (option.label)}
              <button
                class="dropdown-item"
                onclick={() => executeCommand(option.command, option.args)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- 右侧操作按钮 -->
  <div class="toolbar-spacer"></div>
  
  <div class="toolbar-group">
    <button
      class="clickable-icon toolbar-btn preview-btn"
      class:active={isPreviewMode}
      title={isPreviewMode ? '切换到编辑模式' : '切换到预览模式'}
      onclick={handleTogglePreview}
    >
      <EnhancedIcon name={isPreviewMode ? 'edit' : 'eye'} size="14" />
      <span class="btn-text">{isPreviewMode ? '编辑' : '预览'}</span>
    </button>
  </div>
</div>

<style>
  .markdown-toolbar {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .markdown-toolbar.readonly {
    opacity: 0.6;
    pointer-events: none;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toolbar-btn-container {
    position: relative;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toolbar-btn.active {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .toolbar-btn.has-dropdown {
    padding-right: 0.375rem;
  }

  .preview-btn .btn-text {
    font-size: 0.75rem;
    font-weight: 500;
  }

  .toolbar-separator {
    width: 1px;
    height: 1.5rem;
    background: var(--background-modifier-border);
    margin: 0 0.5rem;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: var(--weave-z-overlay);
    min-width: 120px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: var(--shadow-s);
    padding: 0.25rem;
    margin-top: 0.25rem;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-normal);
    cursor: pointer;
    transition: background-color 0.2s ease;
    text-align: left;
    font-size: 0.875rem;
  }

  .dropdown-item:hover {
    background: var(--background-modifier-hover);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .markdown-toolbar {
      padding: 0.375rem 0.5rem;
      gap: 0.125rem;
    }

    .toolbar-btn {
      padding: 0.25rem 0.375rem;
    }

    .toolbar-separator {
      margin: 0 0.25rem;
    }

    .btn-text {
      display: none;
    }
  }
</style>
