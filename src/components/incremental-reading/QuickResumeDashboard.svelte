<!--
  QuickResumeDashboard - 快捷续读仪表板
  
  显示今日到期材料、本周简化日历和最近阅读列表
  支持快速跳转到阅读材料
  
  @module components/incremental-reading/QuickResumeDashboard
  @version 1.0.0
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Notice, TFile } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { ReadingMaterial } from '../../types/incremental-reading-types';
  import { getReadingMaterialDueAt } from '../../utils/ir-topic-compat';
  import { logger } from '../../utils/logger';
  import { showMissingSourceDocumentModal } from './MissingSourceDocumentModal';

  // Props
  interface Props {
    plugin: WeavePlugin;
    onClose: () => void;
    onMaterialSelect: (materialId: string) => void;
  }

  let { plugin, onClose, onMaterialSelect }: Props = $props();

  // State
  let loading = $state(true);
  let showContent = $state(false);
  let todayDueMaterials = $state<ReadingMaterial[]>([]);
  let recentMaterials = $state<ReadingMaterial[]>([]);
  let weekCalendar = $state<{ date: Date; count: number; isToday: boolean }[]>([]);

  // 加载数据
  async function loadData(): Promise<void> {
    try {
      loading = true;

      if (!plugin.readingMaterialManager) {
        throw new Error('增量阅读服务未初始化');
      }

      // 并行加载数据
      const [todayDue, recent, allMaterials] = await Promise.all([
        plugin.readingMaterialManager.getTodayDueMaterials(),
        plugin.readingMaterialManager.getRecentMaterials(5),
        plugin.readingMaterialManager.getAllMaterials()
      ]);

      todayDueMaterials = todayDue.sort((a, b) => b.priority - a.priority);
      recentMaterials = recent;
      weekCalendar = generateWeekCalendar(allMaterials);

      logger.debug('[QuickResumeDashboard] 数据加载完成:', {
        todayDue: todayDueMaterials.length,
        recent: recentMaterials.length
      });
    } catch (error) {
      logger.error('[QuickResumeDashboard] 加载数据失败:', error);
    } finally {
      loading = false;
    }
  }

  // 生成本周日历数据
  function generateWeekCalendar(materials: ReadingMaterial[]): { date: Date; count: number; isToday: boolean }[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const calendar: { date: Date; count: number; isToday: boolean }[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      // 计算该日期到期的材料数量
      const count = materials.filter(m => {
        const dueAt = getReadingMaterialDueAt(m);
        if (!dueAt) return false;
        const dueDate = new Date(dueAt);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() === date.getTime();
      }).length;
      
      calendar.push({
        date,
        count,
        isToday: i === 0
      });
    }
    
    return calendar;
  }

  // 格式化日期
  function formatDate(date: Date): string {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${date.getMonth() + 1}/${date.getDate()} 周${weekdays[date.getDay()]}`;
  }

  // 格式化相对时间
  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    return `${Math.floor(diffDays / 7)}周前`;
  }

  // 获取热力图颜色
  function getHeatmapColor(count: number): string {
    if (count === 0) return 'var(--background-secondary)';
    if (count <= 2) return 'rgba(139, 92, 246, 0.3)';
    if (count <= 5) return 'rgba(139, 92, 246, 0.5)';
    return 'rgba(139, 92, 246, 0.8)';
  }

  async function showMissingSourceDocumentDialog(material: ReadingMaterial): Promise<void> {
    const itemLabel = String(material.title || '').trim() || '未命名材料';
    const normalizedPath = String(material.filePath || '').trim();
    await showMissingSourceDocumentModal(plugin.app, {
      title: '源文档未找到',
      message: [
        `未找到材料「${itemLabel}」对应的源文档。`,
        normalizedPath ? `记录路径：${normalizedPath}` : '当前材料没有可用的源文档路径记录。',
        '请检查源文档是否已被移动或删除。'
      ],
      acknowledgeText: '知道了'
    });
  }

  // 处理材料点击
  async function handleMaterialClick(material: ReadingMaterial): Promise<void> {
    try {
      const file = plugin.app.vault.getAbstractFileByPath(material.filePath);
      if (!(file instanceof TFile)) {
        await showMissingSourceDocumentDialog(material);
        return;
      }

      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      const linkToOpen = (material.resumeLink && material.resumeLink.trim().length > 0)
        ? material.resumeLink
        : material.filePath;
      await plugin.app.workspace.openLinkText(linkToOpen, contextPath, false);
      onMaterialSelect(material.uuid);
      onClose();
    } catch (error) {
      logger.warn('[QuickResumeDashboard] 打开材料失败:', error);
      new Notice('打开阅读材料失败');
    }
  }

  function handleKeydown(_e: KeyboardEvent): void {
  }

  onMount(async () => {
    await loadData();
    setTimeout(() => {
      showContent = true;
    }, 100);
    
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<div 
  class="quick-resume-backdrop"
  onclick={(event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }}
  onkeydown={(event) => {
    if (event.target === event.currentTarget && event.key === 'Enter') {
      onClose();
    }
  }}
  role="button"
  tabindex="0"
  aria-label="关闭快捷续读"
>
  <div 
    class="quick-resume-card"
    class:show={showContent}
    role="dialog"
    tabindex="-1"
    aria-labelledby="quick-resume-title"
    aria-modal="true"
  >
    <!-- 标题栏 -->
    <div class="header">
      <h2 id="quick-resume-title" class="title">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        快捷续读
      </h2>
      <button class="close-btn" onclick={onClose} aria-label="关闭">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    {#if loading}
      <div class="loading-state">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>
    {:else}
      <div class="content">
        <!-- 本周日历 -->
        <section class="section">
          <h3 class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            本周预览
          </h3>
          <div class="week-calendar">
            {#each weekCalendar as day}
              <div 
                class="calendar-day"
                class:today={day.isToday}
                style="--heatmap-color: {getHeatmapColor(day.count)}"
              >
                <span class="day-label">{day.isToday ? '今天' : formatDate(day.date).split(' ')[1]}</span>
                <span class="day-date">{day.date.getDate()}</span>
                <span class="day-count">{day.count}</span>
              </div>
            {/each}
          </div>
        </section>

        <!-- 今日到期 -->
        <section class="section">
          <h3 class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            今日到期 ({todayDueMaterials.length})
          </h3>
          {#if todayDueMaterials.length === 0}
            <div class="empty-state">
              <span>今日无到期材料</span>
            </div>
          {:else}
            <div class="materials-list">
              {#each todayDueMaterials.slice(0, 5) as material}
                <button 
                  class="material-item"
                  onclick={() => handleMaterialClick(material)}
                >
                  <div class="material-info">
                    <span class="material-title">{material.title}</span>
                    <span class="material-meta">
                      进度 {material.progress.percentage}% · 优先级 {material.priority}
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              {/each}
              {#if todayDueMaterials.length > 5}
                <div class="more-hint">还有 {todayDueMaterials.length - 5} 个材料...</div>
              {/if}
            </div>
          {/if}
        </section>

        <!-- 最近阅读 -->
        <section class="section">
          <h3 class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 8v4l3 3"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            最近阅读
          </h3>
          {#if recentMaterials.length === 0}
            <div class="empty-state">
              <span>暂无阅读记录</span>
            </div>
          {:else}
            <div class="materials-list">
              {#each recentMaterials as material}
                <button 
                  class="material-item"
                  onclick={() => handleMaterialClick(material)}
                >
                  <div class="material-info">
                    <span class="material-title">{material.title}</span>
                    <span class="material-meta">
                      {formatRelativeTime(material.lastAccessed)} · {material.progress.percentage}%
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>


<style>
  /* 背景遮罩 */
  .quick-resume-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-toast);
    padding: 20px;
    animation: backdrop-fade-in 0.2s ease-out;
  }

  @keyframes backdrop-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* 内容卡片 */
  .quick-resume-card {
    position: relative;
    max-width: 480px;
    width: 100%;
    max-height: 80vh;
    background: var(--background-primary);
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
    opacity: 0;
    transform: scale(0.95) translateY(10px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .quick-resume-card.show {
    opacity: 1;
    transform: scale(1) translateY(0);
  }

  /* 标题栏 */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .title svg {
    color: var(--interactive-accent);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 内容区域 */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  /* 加载状态 */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 20px;
    color: var(--text-muted);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* 区块 */
  .section {
    margin-bottom: 20px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .section-title svg {
    color: var(--text-muted);
  }

  /* 本周日历 */
  .week-calendar {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }

  .calendar-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    border-radius: 8px;
    background: var(--heatmap-color);
    transition: all 0.15s;
  }

  .calendar-day.today {
    border: 2px solid var(--interactive-accent);
  }

  .day-label {
    font-size: 10px;
    color: var(--text-muted);
    margin-bottom: 2px;
  }

  .day-date {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .day-count {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* 材料列表 */
  .materials-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .material-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    background: var(--background-secondary);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .material-item:hover {
    background: var(--background-modifier-hover);
  }

  .material-item svg {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .material-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .material-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .material-meta {
    font-size: 12px;
    color: var(--text-muted);
  }

  .more-hint {
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    padding: 8px;
  }

  /* 空状态 */
  .empty-state {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  /* 响应式 */
  @media (max-width: 500px) {
    .quick-resume-card {
      max-height: 90vh;
    }

    .week-calendar {
      gap: 4px;
    }

    .calendar-day {
      padding: 6px 2px;
    }

    .day-date {
      font-size: 14px;
    }
  }
</style>
