<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import FloatingMenu from "../ui/FloatingMenu.svelte";
  import type { Card, Deck } from "../../data/types";
  import type AnkiPlugin from "../../main";
  import type { CustomFormatAction } from "../../types/ai-types";
  import { MarkdownView } from "obsidian";
  // 已移除 AnkiConnect 支持

  interface Props {
    card: Card;
    currentCardTime: number;
    averageTime: number;
    plugin?: AnkiPlugin;
    decks?: Deck[];
    isEditing?: boolean;
    tempFileUnavailable?: boolean;
    compactMode?: boolean;
    compactModeSetting?: 'auto' | 'fixed';
    onCompactModeSettingChange?: (setting: 'auto' | 'fixed') => void;
    onToggleEdit?: () => void;
    onDelete?: () => void;
    onSetReminder?: () => void;
    onChangePriority?: () => void;
    onChangeDeck?: (deckId: string) => void;
    onOpenPlainEditor?: () => void;
    onAIFormat?: (formatType: string) => void;
    customFormatActions?: CustomFormatAction[];
    onAIFormatCustom?: (actionId: string) => void;
    onManageFormatActions?: () => void;
    onAISplit?: () => void;
    undoCount?: number;
    onUndo?: () => void;
    autoPlayMedia?: boolean;
    playMediaMode?: 'first' | 'all';
    playMediaTiming?: 'cardChange' | 'showAnswer';
    playbackInterval?: number;
    onMediaAutoPlayChange?: (setting: 'enabled' | 'mode' | 'timing' | 'interval', value: boolean | 'first' | 'all' | 'cardChange' | 'showAnswer' | number) => void;
  }

  // 来源信息接口
  interface SourceInfo {
    sourceFile?: string;
    sourceBlock?: string;
  }

  let {
    card,
    currentCardTime,
    averageTime,
    plugin,
    onAISplit,
    decks = [],
    isEditing = false,
    tempFileUnavailable = false,
    compactMode = false,
    compactModeSetting = 'auto',
    onCompactModeSettingChange,
    onToggleEdit,
    onDelete,
    onSetReminder,
    onChangePriority,
    onChangeDeck,
    onOpenPlainEditor,
    onAIFormat,
    customFormatActions = [],
    onAIFormatCustom,
    onManageFormatActions,
    undoCount = 0,
    onUndo,
    autoPlayMedia = false,
    playMediaMode = 'first',
    playMediaTiming = 'cardChange',
    playbackInterval = 2000,
    onMediaAutoPlayChange
  }: Props = $props();

  // 格式化学习时间
  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }


  // 获取优先级颜色
  function getPriorityColor(priority: number): string {
    switch (priority) {
      case 1: return "#fbbf24"; // 低优先级 - 黄色
      case 2: return "#60a5fa"; // 中优先级 - 蓝色
      case 3: return "#f97316"; // 高优先级 - 橙色
      case 4: return "#ef4444"; // 紧急 - 红色
      default: return "#60a5fa";
    }
  }

  // 获取优先级星级
  function getPriorityStars(priority: number): number {
    return Math.min(Math.max(priority, 1), 4);
  }

  // 牌组切换功能
  let showDeckMenu = $state(false);
  let deckButtonElement: HTMLElement | null = $state(null);

  // 来源菜单功能 - 已合并到多功能信息键
  // let showSourceMenu = $state(false);
  // let sourceButtonElement: HTMLElement | null = $state(null);

  // AI格式化菜单功能
  let showAIFormatMenu = $state(false);
  let aiFormatButtonElement: HTMLElement | null = $state(null);

  // 查看卡片信息菜单功能 - 已合并到多功能信息键
  // let showCardInfoMenu = $state(false);
  // let cardInfoButtonElement: HTMLElement | null = $state(null);

  // 多功能信息键（合并查看与来源）
  let showMultiInfoMenu = $state(false);
  let multiInfoButtonElement: HTMLElement | null = $state(null);

  // 更多设置菜单
  let showMoreSettingsMenu = $state(false);
  let moreSettingsButtonElement: HTMLElement | null = $state(null);

  function toggleDeckMenu() {
    showDeckMenu = !showDeckMenu;
  }

  function handleChangeDeck(deckId: string) {
    if (onChangeDeck) {
      onChangeDeck(deckId);
    }
    showDeckMenu = false;
  }

  // 获取当前卡片所在牌组的名称
  function getCurrentDeckName(): string {
    if (!card?.deckId || !decks) return '未知牌组';
    const currentDeck = decks.find(d => d.id === card.deckId);
    return currentDeck?.name || '未知牌组';
  }

  // 多功能信息键相关函数
  function toggleMultiInfoMenu() {
    showMultiInfoMenu = !showMultiInfoMenu;
  }

  // 更多设置相关函数
  function toggleMoreSettingsMenu() {
    showMoreSettingsMenu = !showMoreSettingsMenu;
  }

  // 获取来源信息
  function getSourceInfo(): SourceInfo {
    return {
      sourceFile: card?.sourceFile,
      sourceBlock: card?.sourceBlock
    };
  }

  // 处理文件路径点击 - 打开源文档
  function handleOpenSourceFile() {
    if (!card?.sourceFile || !plugin) {
      new (window as any).Notice('未找到源文档');
      return;
    }

    const file = plugin.app.vault.getAbstractFileByPath(card.sourceFile);
    if (!file) {
      new (window as any).Notice('源文档不存在');
      return;
    }

    plugin.app.workspace.openLinkText(card.sourceFile, '', true);
    showMultiInfoMenu = false;
  }

  // 处理块链接点击 - 跳转到块（增强版：定位并高亮）
  async function handleOpenBlockLink() {
    if (!card?.sourceFile || !plugin) {
      new (window as any).Notice('未找到块链接');
      return;
    }

    try {
      const filePath = card.sourceFile;
      const blockId = card.sourceBlock?.replace(/^\^/, ''); // 移除^前缀
      
      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        new (window as any).Notice('源文档已被删除');
        return;
      }
      
      // 打开文件
      const leaf = plugin.app.workspace.getLeaf(false);
      await leaf.openFile(file as any);
      
      // 如果有blockId，跳转到指定块并高亮
      if (blockId) {
        // 等待视图加载
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
            
            new (window as any).Notice('已跳转到源文档');
          } else {
            new (window as any).Notice('无法找到源文本块');
          }
        }
      } else {
        new (window as any).Notice('已打开源文档');
      }
      
      showMultiInfoMenu = false;
    } catch (error) {
      console.error('[VerticalToolbar] 跳转到源文档失败:', error);
      new (window as any).Notice('跳转失败');
    }
  }

  // AI格式化菜单相关函数
  function toggleAIFormatMenu() {
    showAIFormatMenu = !showAIFormatMenu;
  }

  function handleAIFormat(formatType: string) {
    if (onAIFormat) {
      onAIFormat(formatType);
    }
    showAIFormatMenu = false;
  }

  // 格式化日期时间
  function formatDateTime(dateStr: string | undefined): string {
    if (!dateStr) return '未知';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '格式错误';
    }
  }

  // 格式化时间间隔（天数）
  function formatInterval(days: number | undefined): string {
    if (days === undefined || days === null) return '未知';
    if (days < 1) return '少于1天';
    if (days === 1) return '1天';
    if (days < 30) return `${Math.round(days)}天`;
    if (days < 365) return `${Math.round(days / 30)}个月`;
    return `${Math.round(days / 365)}年`;
  }

  // 获取卡片状态文本
  function getCardStateText(state: number): string {
    const stateMap: Record<number, string> = {
      0: '新卡片',
      1: '学习中',
      2: '复习中',
      3: '重学中'
    };
    return stateMap[state] || '未知';
  }

  // 获取当前牌组名称
  function getDeckName(): string {
    const deck = decks?.find(d => d.id === card.deckId);
    return deck?.name || '未知牌组';
  }


</script>

<div class="vertical-toolbar" class:compact={compactMode}>
  <!-- 计时器区域（始终显示） -->
  <div class="toolbar-section timer-section">
    <!-- 当前卡片计时 -->
    <div class="timer-display card-timer">
      <span class="timer-text">{formatTime(currentCardTime)}</span>
      <div class="timer-label">当前卡片</div>
    </div>

    <!-- 平均用时 -->
    <div class="timer-display avg-timer">
      <span class="timer-text">{formatTime(averageTime)}</span>
      <div class="timer-label">平均用时</div>
    </div>
  </div>

  <!-- 功能按钮组 -->
  <div class="toolbar-section actions-section">
    <!-- 编辑/预览切换按钮 -->
    <button
      class="toolbar-btn edit-btn"
      onclick={onToggleEdit}
      title={isEditing ? "保存并预览" : "编辑卡片"}
    >
      <EnhancedIcon name={isEditing ? "eye" : "edit"} size="18" />
      <span class="btn-label">{isEditing ? "预览" : "编辑"}</span>
    </button>









    <!-- 普通文本编辑器按钮 - 仅临时文件失败时显示 -->
    {#if tempFileUnavailable}
      <button
        class="toolbar-btn plain-editor-btn"
        onclick={onOpenPlainEditor}
        title="普通文本编辑器"
      >
        <EnhancedIcon name="fileText" size="18" />
        <span class="btn-label">文本编辑</span>
      </button>
    {/if}

    <!-- 删除 -->
    <button
      class="toolbar-btn delete-btn"
      onclick={onDelete}
      title="删除卡片"
    >
      <EnhancedIcon name="delete" size="18" />
      <span class="btn-label">删除</span>
    </button>

    <!-- 提醒 -->
    <button
      class="toolbar-btn reminder-btn"
      onclick={onSetReminder}
      title="设置提醒"
    >
      <EnhancedIcon name="bell" size="18" />
      <span class="btn-label">提醒</span>
    </button>

    <!-- 优先级 -->
    <button
      class="toolbar-btn priority-btn"
      onclick={onChangePriority}
      title="设置优先级"
      style="color: {getPriorityColor(card.priority || 2)}"
    >
      <div class="priority-stars">
        {#each Array(getPriorityStars(card.priority || 2)) as _, i}
          <EnhancedIcon name="starFilled" size="12" />
        {/each}
        {#each Array(4 - getPriorityStars(card.priority || 2)) as _, i}
          <EnhancedIcon name="star" size="12" />
        {/each}
      </div>
      <span class="btn-label">优先级</span>
    </button>


    <!-- AI拆分 -->
    {#if onAISplit}
      <button
        class="toolbar-btn ai-split-btn"
        onclick={onAISplit}
        title="AI拆分 - 将当前卡片拆分为多张子卡片"
      >
        <EnhancedIcon name="split" size="18" />
        <span class="btn-label">拆分</span>
      </button>
    {/if}

    <!-- AI格式化 -->
    <div class="ai-format-container">
      <button
        bind:this={aiFormatButtonElement}
        class="toolbar-btn ai-format-btn"
        class:active={showAIFormatMenu}
        onclick={toggleAIFormatMenu}
        title="AI格式化"
      >
        <EnhancedIcon name="wand" size="18" />
        <span class="btn-label">格式化</span>
      </button>

      <FloatingMenu
        bind:show={showAIFormatMenu}
        anchor={aiFormatButtonElement}
        placement="bottom-start"
        onClose={() => showAIFormatMenu = false}
        class="ai-format-menu-container"
      >
        {#snippet children()}
          <div class="ai-format-menu-header">
            <span>AI格式化</span>
            <button class="close-btn" onclick={() => showAIFormatMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="ai-format-menu-content">
            <div class="format-option-list">
              <!-- 选择题格式化 -->
              <button
                class="format-option-simple"
                onclick={() => handleAIFormat('choice')}
                role="menuitem"
                title="将当前卡片内容整理为标准选择题格式"
              >
                📝 选择题格式化
              </button>
              
              <!-- 自定义格式化功能列表 -->
              {#if customFormatActions && customFormatActions.length > 0}
                {#each customFormatActions.filter(a => a.enabled) as action}
                  <button
                    class="format-option-simple"
                    onclick={() => onAIFormatCustom?.(action.id)}
                    role="menuitem"
                    title={action.description || action.name}
                  >
                    {action.icon} {action.name}
                  </button>
                {/each}
              {/if}
              
              <!-- 管理功能按钮 -->
              <button
                class="format-option-simple manage-btn"
                onclick={() => onManageFormatActions?.()}
                role="menuitem"
                title="管理AI格式化功能"
              >
                <EnhancedIcon name="settings" size="14" />
                管理功能...
              </button>
            </div>
          </div>
        {/snippet}
      </FloatingMenu>
    </div>

    <!-- 牌组切换 -->
    <div class="deck-switcher-container">
      <button
        bind:this={deckButtonElement}
        class="toolbar-btn deck-btn"
        class:active={showDeckMenu}
        onclick={toggleDeckMenu}
        title="更换牌组"
      >
        <EnhancedIcon name="folder" size="18" />
        <span class="btn-label">牌组</span>
      </button>

      {#if decks && decks.length > 0}
        <FloatingMenu
          bind:show={showDeckMenu}
          anchor={deckButtonElement}
          placement="bottom-start"
          onClose={() => showDeckMenu = false}
          class="deck-menu-container"
        >
          {#snippet children()}
            <div class="deck-menu-header">
              <span>牌组列表</span>
              <button class="close-btn" onclick={() => showDeckMenu = false}>
                <EnhancedIcon name="times" size="12" />
              </button>
            </div>

            <div class="deck-menu-content">
              <!-- 当前牌组信息 -->
              <div class="current-deck-section">
                <div class="section-title">当前牌组</div>
                <div class="deck-item current">
                  <div class="deck-info">
                    <div class="deck-name">
                      <span>{getCurrentDeckName()}</span>
                    </div>
                  </div>
                  <div class="deck-indicator">
                    <EnhancedIcon name="check" size="14" />
                  </div>
                </div>
              </div>

              <!-- 可用牌组列表 - 显示层级结构 -->
              {#if decks.filter(d => d.id !== card?.deckId).length > 0}
                <div class="available-decks-section">
                  <div class="section-title">可用牌组</div>
                  <div class="deck-list">
                    {#each decks.filter(d => d.id !== card?.deckId) as deck}
                      {@const indentLevel = deck.level || 0}
                      <button
                        class="deck-item"
                        onclick={() => handleChangeDeck(deck.id)}
                        role="menuitem"
                        style="padding-left: {8 + indentLevel * 16}px;"
                        title={deck.name}
                      >
                        <div class="deck-info">
                          <div class="deck-name">
                            {#if indentLevel > 0}
                              <span class="hierarchy-indicator">└</span>
                            {/if}
                            <span class="deck-name-text">{deck.name}</span>
                          </div>
                        </div>
                        <div class="deck-indicator">
                          <EnhancedIcon name="chevronRight" size="14" />
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/snippet}
        </FloatingMenu>
      {/if}
    </div>

    <!-- 多功能信息键（查看+来源） -->
    <div class="multi-info-container">
      <button
        bind:this={multiInfoButtonElement}
        class="toolbar-btn multi-info-btn"
        class:active={showMultiInfoMenu}
        onclick={toggleMultiInfoMenu}
        title="查看卡片信息与来源"
        aria-label="打开卡片详细信息和来源菜单"
      >
        <EnhancedIcon name="eye" size="18" />
        <span class="btn-label">查看</span>
      </button>

      <FloatingMenu
        bind:show={showMultiInfoMenu}
        anchor={multiInfoButtonElement}
        placement="bottom-start"
        onClose={() => showMultiInfoMenu = false}
        class="multi-info-menu-container"
      >
        {#snippet children()}
          <div class="multi-info-menu-header">
            <span>卡片信息与来源</span>
            <button class="close-btn" onclick={() => showMultiInfoMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="multi-info-menu-content">
            <!-- 基础信息 -->
            <div class="info-section">
              <div class="info-section-title">基础信息</div>
              <div class="info-item">
                <span class="info-label">卡片ID</span>
                <span class="info-value">{card.id.slice(0, 8)}...</span>
              </div>
              <div class="info-item">
                <span class="info-label">所属牌组</span>
                <span class="info-value">{getDeckName()}</span>
              </div>
              <div class="info-item">
                <span class="info-label">卡片状态</span>
                <span class="info-value">{getCardStateText(card.fsrs.state)}</span>
              </div>
            </div>

            <!-- 学习数据 -->
            <div class="info-section">
              <div class="info-section-title">学习数据</div>
              <div class="info-item">
                <span class="info-label">稳定性</span>
                <span class="info-value">{card.fsrs.stability.toFixed(2)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">难度</span>
                <span class="info-value">{card.fsrs.difficulty.toFixed(2)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">间隔</span>
                <span class="info-value">{formatInterval(card.fsrs.scheduledDays)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">总复习次数</span>
                <span class="info-value">{card.stats?.totalReviews || 0}次</span>
              </div>
              <div class="info-item">
                <span class="info-label">平均用时</span>
                <span class="info-value">{card.stats?.averageTime ? Math.round(card.stats.averageTime) + '秒' : '未知'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">记忆成功率</span>
                <span class="info-value">{card.stats?.memoryRate ? Math.round(card.stats.memoryRate * 100) + '%' : '未知'}</span>
              </div>
            </div>

            <!-- 时间信息 -->
            <div class="info-section">
              <div class="info-section-title">时间信息</div>
              <div class="info-item">
                <span class="info-label">创建时间</span>
                <span class="info-value">{formatDateTime(card.created)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">修改时间</span>
                <span class="info-value">{formatDateTime(card.modified)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">下次复习</span>
                <span class="info-value">{formatDateTime(card.fsrs.due)}</span>
              </div>
            </div>

            <!-- 来源信息 -->
            {#if true}
              {@const sourceInfo = getSourceInfo()}
              <div class="info-section">
                <div class="info-section-title">来源信息</div>
                {#if !sourceInfo.sourceFile && !sourceInfo.sourceBlock}
                  <!-- 无来源信息 -->
                  <div class="info-item no-source">
                    <span class="info-label">
                      <EnhancedIcon name="info" size="12" />
                      无来源
                    </span>
                    <span class="info-value text-muted">该卡片未关联源文档</span>
                  </div>
                {:else}
                  <!-- 源文档 -->
                  {#if sourceInfo.sourceFile}
                    <div 
                      class="info-item clickable" 
                      onclick={handleOpenSourceFile}
                      onkeydown={(e) => e.key === 'Enter' && handleOpenSourceFile()}
                      role="button"
                      tabindex="0"
                    >
                      <span class="info-label">
                        <EnhancedIcon name="file" size="12" />
                        源文档
                      </span>
                      <span class="info-value link-value" title={sourceInfo.sourceFile}>
                        {sourceInfo.sourceFile.split('/').pop() || sourceInfo.sourceFile}
                      </span>
                    </div>
                  {/if}

                  <!-- 块引用 -->
                  {#if sourceInfo.sourceBlock}
                    <div 
                      class="info-item clickable" 
                      onclick={handleOpenBlockLink}
                      onkeydown={(e) => e.key === 'Enter' && handleOpenBlockLink()}
                      role="button"
                      tabindex="0"
                    >
                      <span class="info-label">
                        <EnhancedIcon name="hash" size="12" />
                        块引用
                      </span>
                      <span class="info-value link-value">
                        {sourceInfo.sourceBlock}
                      </span>
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          </div>
        {/snippet}
      </FloatingMenu>
    </div>

    <!-- ⚙️ 更多设置按钮 -->
    <div class="more-settings-container">
      <button
        bind:this={moreSettingsButtonElement}
        class="toolbar-btn more-settings-btn"
        class:active={showMoreSettingsMenu}
        onclick={toggleMoreSettingsMenu}
        title="更多设置"
        aria-label="更多设置"
      >
        <EnhancedIcon name="settings" size="18" />
        <span class="btn-label">更多</span>
      </button>

      <FloatingMenu
        bind:show={showMoreSettingsMenu}
        anchor={moreSettingsButtonElement}
        placement="bottom-start"
        onClose={() => showMoreSettingsMenu = false}
        class="more-settings-menu-container"
      >
        {#snippet children()}
          <div class="more-settings-menu-header">
            <span>更多设置</span>
            <button class="close-btn" onclick={() => showMoreSettingsMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="more-settings-menu-content">
            <!-- 侧边栏显示模式设置 -->
            <div class="setting-section">
              <div class="setting-section-title">
                <EnhancedIcon name="layout-sidebar-right" size="14" />
                <span>按钮显示模式</span>
              </div>
              
              <!-- 单选按钮组 -->
              <div class="compact-mode-options">
                <label class="compact-mode-option" class:active={compactModeSetting === 'auto'}>
                  <input
                    type="radio"
                    name="compactMode"
                    value="auto"
                    checked={compactModeSetting === 'auto'}
                    onchange={() => onCompactModeSettingChange?.('auto')}
                  />
                  <div class="option-content">
                    <EnhancedIcon name="sliders" size="16" />
                    <span class="option-label">自动调整</span>
                  </div>
                </label>
                
                <label class="compact-mode-option" class:active={compactModeSetting === 'fixed'}>
                  <input
                    type="radio"
                    name="compactMode"
                    value="fixed"
                    checked={compactModeSetting === 'fixed'}
                    onchange={() => onCompactModeSettingChange?.('fixed')}
                  />
                  <div class="option-content">
                    <EnhancedIcon name="thumbtack" size="16" />
                    <span class="option-label">固定显示</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- 自动播放媒体设置 -->
            <div class="setting-section">
              <div class="setting-section-title">
                <EnhancedIcon name="volume-2" size="14" />
                <span>媒体播放</span>
              </div>
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>自动播放媒体</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoPlayMedia}
                    onchange={(e) => onMediaAutoPlayChange?.('enabled', (e.target as HTMLInputElement).checked)}
                  />
                  <span class="slider"></span>
                </label>
              </div>

              {#if autoPlayMedia}
                <!-- 播放模式选择 -->
                <div class="setting-item">
                  <div class="setting-label">播放模式</div>
                  <select
                    class="setting-select"
                    value={playMediaMode}
                    onchange={(e) => onMediaAutoPlayChange?.('mode', (e.target as HTMLSelectElement).value as 'first' | 'all')}
                  >
                    <option value="first">仅第一个</option>
                    <option value="all">播放全部</option>
                  </select>
                </div>

                <!-- 播放时机选择 -->
                <div class="setting-item">
                  <div class="setting-label">播放时机</div>
                  <select
                    class="setting-select"
                    value={playMediaTiming}
                    onchange={(e) => onMediaAutoPlayChange?.('timing', (e.target as HTMLSelectElement).value as 'cardChange' | 'showAnswer')}
                  >
                    <option value="cardChange">切换卡片</option>
                    <option value="showAnswer">显示答案</option>
                  </select>
                </div>

                <!-- 播放间隔设置 (仅在播放全部模式下显示) -->
                {#if playMediaMode === 'all'}
                  <div class="setting-item interval-item">
                    <div class="setting-label">
                      播放间隔
                      <span class="interval-value">{(playbackInterval / 1000).toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      class="setting-slider"
                      min="500"
                      max="5000"
                      step="500"
                      value={playbackInterval}
                      oninput={(e) => onMediaAutoPlayChange?.('interval', parseInt((e.target as HTMLInputElement).value))}
                    />
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/snippet}
      </FloatingMenu>
    </div>

    <!-- 🔄 撤销评分按钮 - 移至底部 -->
    {#if onUndo}
      <button
        class="toolbar-btn undo-btn"
        class:disabled={undoCount === 0}
        onclick={undoCount > 0 ? onUndo : undefined}
        title={undoCount > 0 ? "撤销上一次评分" : "没有可撤销的操作"}
        disabled={undoCount === 0}
      >
        <EnhancedIcon name="undo" size="18" />
        <span class="btn-label">撤销</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .vertical-toolbar {
    width: 100px;
    background: var(--background-secondary);
    border-left: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    padding: 1.25rem 0;
    gap: 1.75rem;
  }

  .toolbar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  /* 计时器区域 */
  .timer-section {
    border-bottom: 1px solid var(--background-modifier-border);
    padding-bottom: 1rem;
    gap: 0.75rem;
  }

  .timer-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0.5rem;
    background: var(--background-primary);
    border-radius: 8px;
    min-width: 80px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--background-modifier-border);
    position: relative;
  }

  .timer-text {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-accent);
    font-family: var(--font-monospace);
    letter-spacing: 0.3px;
  }

  .timer-label {
    font-size: 0.6rem;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    text-align: center;
  }

  /* 单卡计时器样式 */
  .card-timer {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 5%, var(--background-primary));
  }

  .card-timer .timer-text {
    color: var(--color-accent);
  }

  /* 平均用时样式 */
  .avg-timer {
    border-color: var(--text-success);
    background: color-mix(in srgb, var(--text-success) 5%, var(--background-primary));
  }

  .avg-timer .timer-text {
    color: var(--text-success);
  }


  /* 功能按钮 */
  .actions-section {
    gap: 0.875rem;
  }

  .toolbar-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0.75rem 0.5rem;
    border-radius: 0.75rem;
    color: var(--text-muted);
    min-height: 68px;
    width: 70px;
    position: relative;
    overflow: hidden;
  }

  .toolbar-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-accent);
    color: var(--text-normal);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .toolbar-btn:active {
    transform: translateY(-1px);
    transition: transform 0.1s ease;
  }
  
  /* 🔄 撤销按钮样式 */
  .toolbar-btn.undo-btn {
    position: relative;
  }
  
  .toolbar-btn.undo-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }
  
  .toolbar-btn.undo-btn:not(.disabled):hover {
    background: color-mix(in srgb, var(--interactive-accent) 15%, var(--background-primary));
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
  }

  .btn-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.1;
    letter-spacing: 0.25px;
    transition: opacity 0.2s ease, max-height 0.2s ease;
  }

  /* 🎯 紧凑模式样式（有滚动条时） */
  .vertical-toolbar.compact {
    width: 70px; /* 缩小宽度 */
    padding: 1rem 0;
    gap: 1.5rem;
  }

  .vertical-toolbar.compact .toolbar-btn {
    width: 50px;
    min-height: 50px;
    padding: 0.5rem 0.25rem;
    gap: 0;
  }

  .vertical-toolbar.compact .btn-label {
    opacity: 0;
    max-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  /* 紧凑模式下悬停显示文字标签 */
  .vertical-toolbar.compact .toolbar-btn:hover .btn-label {
    opacity: 1;
    max-height: 20px;
    margin-top: 0.25rem;
  }

  /* 紧凑模式下计时器也缩小 */
  .vertical-toolbar.compact .timer-display {
    min-width: 60px;
    padding: 0.5rem 0.25rem;
  }

  .vertical-toolbar.compact .timer-text {
    font-size: 0.8rem;
  }

  .vertical-toolbar.compact .timer-label {
    font-size: 0.55rem;
  }

  /* 特定按钮样式 */

  .edit-btn:hover {
    color: var(--tuanki-info);
  }

  .delete-btn:hover {
    color: var(--tuanki-error);
  }

  .reminder-btn:hover {
    color: var(--tuanki-warning);
  }

  .priority-btn:hover {
    background: var(--background-modifier-hover);
  }




  .plain-editor-btn:hover {
    color: var(--tuanki-warning);
  }

  .priority-stars {
    display: flex;
    gap: 1px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 32px;
    color: inherit; /* 继承按钮的颜色 */
  }

  /* 下拉菜单样式 */
  /* 已移除 AnkiConnect 下拉菜单样式 */

  /* 响应式设计 */
  @media (max-width: 1024px) {
    .vertical-toolbar {
      width: 100%;
      max-width: none;
      flex-direction: row;
      padding: 1rem;
      border-left: none;
      border-top: 1px solid var(--background-modifier-border);
      gap: 1rem;
      overflow-x: auto;
      justify-content: center;
    }

    .toolbar-section {
      flex-direction: row;
      gap: 1rem;
      align-items: center;
    }

    .timer-section {
      border-bottom: none;
      border-right: 1px solid var(--background-modifier-border);
      padding-bottom: 0;
      padding-right: 1rem;
      margin-bottom: 0;
      margin-right: 0.5rem;
    }

    .actions-section {
      flex-direction: row;
      gap: 0.75rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .toolbar-btn {
      width: 65px;
      min-height: 62px;
      flex-shrink: 0;
    }

    .timer-display {
      min-width: 65px;
    }
  }

  @media (max-width: 768px) {
    .vertical-toolbar {
      padding: 0.75rem;
      gap: 0.75rem;
    }

    .timer-section {
      padding-right: 0.75rem;
      margin-right: 0.25rem;
    }

    .actions-section {
      gap: 0.5rem;
    }

    .toolbar-btn {
      width: 55px;
      min-height: 55px;
      padding: 0.5rem 0.25rem;
    }

    .btn-label {
      font-size: 0.65rem;
    }

    .timer-display {
      min-width: 55px;
      padding: 0.5rem 0.25rem;
    }

    .timer-text {
      font-size: 0.75rem;
    }
  }

  /* 微妙的动画效果 */
  .timer-display {
    animation: subtle-pulse 3s ease-in-out infinite;
  }

  @keyframes subtle-pulse {
    0%, 100% {
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    50% {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
  }

  /* 🎯 计时器淡出动画 */
  @keyframes fadeOutTimer {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  /* FloatingMenu 容器样式 */
  :global(.deck-menu-container),
  :global(.ai-format-menu-container),
  :global(.multi-info-menu-container) {
    min-width: 180px;
    max-width: 400px;
  }

  /* 多功能信息键容器 */
  .multi-info-container {
    position: relative;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    padding: 0 4px;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* 牌组切换功能样式 */
  .deck-switcher-container {
    position: relative;
  }


  /* 统一菜单头部样式 */
  .deck-menu-header,
  .ai-format-menu-header,
  .multi-info-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-normal);
    background: var(--background-secondary);
    border-radius: 8px 8px 0 0;
  }

  /* 统一菜单内容样式 */
  .deck-menu-content,
  .ai-format-menu-content,
  .multi-info-menu-content {
    padding: 8px;
    max-height: 400px;
    overflow-y: auto;
  }

  /* 多功能信息键菜单内容特定样式 */
  .multi-info-menu-content {
    min-width: 320px;
  }

  .current-deck-section,
  .available-decks-section {
    margin-bottom: 12px;
  }

  .available-decks-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    padding: 0 4px;
  }

  .deck-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .deck-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: none;
    text-align: left;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .deck-item:hover {
    background: var(--background-modifier-hover);
  }

  .deck-item.current {
    background: none; /* 移除背景色 */
    /* 移除边框 */
  }

  .deck-info {
    flex: 1;
    min-width: 0;
  }

  .deck-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 2px;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .deck-item.current .deck-name {
    color: var(--text-accent);
  }

  /* 层级指示器样式 */
  .hierarchy-indicator {
    color: var(--text-muted);
    font-size: 0.75rem;
    margin-right: 2px;
    flex-shrink: 0;
  }

  /* 牌组名称文本 - 处理文本溢出 */
  .deck-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .deck-indicator {
    display: flex;
    align-items: center;
    color: var(--text-muted);
    transition: color 0.2s ease;
  }

  .deck-item.current .deck-indicator {
    color: var(--text-accent);
  }

  .deck-item:hover .deck-indicator {
    color: var(--text-normal);
  }

  .priority-stars {
    display: flex;
    gap: 1px;
    margin-bottom: 2px;
  }

  .toolbar-btn.priority-btn {
    color: var(--text-muted);
  }

  .toolbar-btn.priority-btn:hover {
    color: var(--text-accent);
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* AI格式化菜单样式 */
  .ai-format-container {
    position: relative;
  }



  .format-option-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .format-option-simple {
    display: block;
    width: 100%;
    padding: 10px 16px; /* 增加水平内边距，更舒适 */
    border: none;
    background: none;
    text-align: left;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap; /* 防止文本换行 */
  }

  .format-option-simple:hover {
    background: var(--background-modifier-hover);
    color: var(--text-accent);
  }

  .ai-format-btn:hover {
    color: var(--color-purple);
  }

  /* 信息分组区域 */
  .info-section {
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .info-section:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  /* 信息分组标题 */
  .info-section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    padding: 0 4px;
  }

  /* 信息项 */
  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-radius: 4px;
    transition: background-color 0.2s ease;
    margin-bottom: 2px;
  }

  .info-item:hover {
    background: var(--background-modifier-hover);
  }

  .info-item:last-child {
    margin-bottom: 0;
  }

  /* 信息标签 */
  .info-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    flex-shrink: 0;
    margin-right: 12px;
  }

  /* 信息值 */
  .info-value {
    font-size: 0.75rem;
    color: var(--text-normal);
    font-weight: 500;
    text-align: right;
    word-break: break-all;
    max-width: 60%;
  }

  /* 多功能信息键样式 */
  .multi-info-btn {
    position: relative;
  }

  .multi-info-btn:hover {
    color: var(--color-blue);
  }

  /* 可点击的信息项样式 */
  .info-item.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .info-item.clickable:hover {
    background: var(--background-modifier-hover);
  }

  .info-item.clickable .info-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* 链接样式的值 */
  .link-value {
    color: var(--text-accent) !important;
    text-decoration: underline;
    text-decoration-style: dotted;
    cursor: pointer;
  }

  .info-item.clickable:hover .link-value {
    color: var(--text-accent-hover) !important;
    text-decoration-style: solid;
  }

  /* 无来源提示样式 */
  .info-item.no-source {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .info-item.no-source .info-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .text-muted {
    color: var(--text-muted) !important;
    font-style: italic;
  }

  /* 更多设置容器 */
  .more-settings-container {
    position: relative;
  }

  .more-settings-btn:hover {
    color: var(--color-green);
  }

  /* 更多设置菜单内容 */
  .more-settings-menu-content {
    min-width: 280px;
    padding: 8px;
  }

  .setting-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .setting-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .setting-section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border-radius: 6px;
    background: var(--background-secondary);
  }

  .setting-item.toggle-item {
    padding: 10px;
  }

  .setting-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  /* 紧凑模式选项组 */
  .compact-mode-options {
    display: flex;
    gap: 8px;
  }

  .compact-mode-option {
    flex: 1;
    position: relative;
    cursor: pointer;
  }

  .compact-mode-option input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .compact-mode-option .option-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    background: var(--background-secondary);
    border: 2px solid var(--background-modifier-border);
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .compact-mode-option:hover .option-content {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .compact-mode-option.active .option-content {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .compact-mode-option.active .option-content :global(svg) {
    color: var(--text-on-accent);
  }

  .compact-mode-option .option-label {
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
  }

  .setting-select {
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .setting-select:hover {
    border-color: var(--text-accent);
  }

  .setting-select:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  /* Toggle开关样式 */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-switch .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--background-modifier-border);
    transition: 0.3s;
    border-radius: 24px;
  }

  .toggle-switch .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  .toggle-switch input:checked + .slider {
    background-color: var(--interactive-accent);
  }

  .toggle-switch input:focus + .slider {
    box-shadow: 0 0 1px var(--interactive-accent);
  }

  .toggle-switch input:checked + .slider:before {
    transform: translateX(20px);
  }

  /* 播放间隔设置样式 */
  .setting-item.interval-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .setting-item.interval-item .setting-label {
    justify-content: space-between;
    width: 100%;
  }

  .interval-value {
    font-weight: 600;
    color: var(--interactive-accent);
    font-size: 0.8rem;
  }

  .setting-slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--background-modifier-border);
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }

  .setting-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .setting-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  .setting-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
    border: none;
    transition: all 0.2s ease;
  }

  .setting-slider::-moz-range-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  /* FloatingMenu容器 - 更多设置 */
  :global(.more-settings-menu-container) {
    min-width: 280px;
    max-width: 320px;
  }

  .more-settings-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-normal);
    background: var(--background-secondary);
    border-radius: 8px 8px 0 0;
  }
</style>
