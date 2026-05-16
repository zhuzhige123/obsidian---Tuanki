<script lang="ts">
  /**
   * IRBlockInfoModal - 增量阅读内容块信息模态窗
   * 
   * 显示内容块的基础信息、学习数据、时间信息等
   * 参考记忆牌组的卡片信息模态窗设计
   * 
   * @module components/incremental-reading/IRBlockInfoModal
   * @version 1.1.0 - 新增计算记录视图
   */
  import { Notice, type App } from 'obsidian';
  import type { IRBlock } from '../../types/ir-types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { IRStorageService } from '../../services/incremental-reading/IRStorageService';
  import {
    calculatePsi,
    calculateNextInterval,
    M_BASE,
    I_MIN,
    I_MAX,
    EWMA_ALPHA,
    PRIORITY_NEUTRAL
  } from '../../services/incremental-reading/IRCoreAlgorithmsV4';
  import { writeSystemClipboardText } from '../../utils/system-clipboard';

  interface Props {
    block: IRBlock;
    onClose: () => void;
    position?: { x: number; y: number };
    app?: App;
    useObsidianModal?: boolean;
  }

  let { block, onClose, position, app, useObsidianModal = false }: Props = $props();

  let modalEl: HTMLDivElement | null = $state(null);
  let left = $state(-9999);
  let top = $state(-9999);

  // 视图状态：'info' | 'json' | 'calc'
  type ViewMode = 'info' | 'json' | 'calc';
  let currentView = $state<ViewMode>('info');

  let totalReadingTimeSeconds = $state<number>(untrack(() => (block as any).totalReadingTime ?? 0));

  const formattedJson = $derived(JSON.stringify({
    ...block,
    totalReadingTime: totalReadingTimeSeconds,
    stats: (block as any).stats
      ? {
          ...(block as any).stats,
          totalReadingTimeSec: totalReadingTimeSeconds
        }
      : undefined
  }, null, 2));

  async function refreshReadingTimeFromHistory(): Promise<void> {
    if (!app || !block?.id) {
      totalReadingTimeSeconds = (block as any).totalReadingTime ?? 0;
      return;
    }

    try {
      const storage = new IRStorageService(app);
      await storage.initialize();
      const sessions = await storage.getBlockSessions(block.id);
      const historyTotal = sessions.reduce((sum, session) => sum + Math.max(0, Number(session.duration || 0)), 0);
      totalReadingTimeSeconds = historyTotal > 0
        ? historyTotal
        : ((block as any).totalReadingTime ?? 0);
    } catch {
      totalReadingTimeSeconds = (block as any).totalReadingTime ?? 0;
    }
  }

  function handleKeydown(_e: KeyboardEvent) {
  }

  async function updatePosition() {
    if (!position) return;
    await tick();
    if (!modalEl) return;

    const rect = modalEl.getBoundingClientRect();
    const margin = 12;
    const baseX = position.x;
    const baseY = position.y;

    const desiredLeft = baseX + 12;
    const desiredTop = baseY + 12;

    left = Math.max(margin, Math.min(desiredLeft, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(desiredTop, window.innerHeight - rect.height - margin));
  }

  onMount(() => {
    void updatePosition();
    void refreshReadingTimeFromHistory();

    const onKeydownDoc = (_e: KeyboardEvent) => {
    };

    const onPointerDownDoc = (e: PointerEvent) => {
      if (!position) return;
      if (!modalEl) return;
      if (!modalEl.contains(e.target as Node)) {
        onClose();
      }
    };

    const onTimerUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ blockId?: string }>).detail;
      if (!detail?.blockId || detail.blockId === block.id) {
        void refreshReadingTimeFromHistory();
      }
    };

    const onIRDataUpdated = () => {
      void refreshReadingTimeFromHistory();
    };

    document.addEventListener('keydown', onKeydownDoc, true);
    document.addEventListener('pointerdown', onPointerDownDoc, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('Weave:ir-timer-updated', onTimerUpdated as EventListener);
    window.addEventListener('Weave:ir-data-updated', onIRDataUpdated);

    return () => {
      document.removeEventListener('keydown', onKeydownDoc, true);
      document.removeEventListener('pointerdown', onPointerDownDoc, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('Weave:ir-timer-updated', onTimerUpdated as EventListener);
      window.removeEventListener('Weave:ir-data-updated', onIRDataUpdated);
    };
  });

  // ============================================
  // 计算记录相关
  // ============================================

  // 获取当前间隔（兼容不同数据结构）
  const currentInterval = $derived(
    (block as any).intervalDays ?? block.interval ?? 1
  );

  // 获取有效优先级
  const effectivePriority = $derived(
    block.priorityEff ?? block.priorityUi ?? 5
  );

  // 计算变速函数 Ψ(p)
  const psiValue = $derived(calculatePsi(effectivePriority));

  // 模拟下次间隔计算（使用默认参数）
  const mBase = M_BASE;  // 1.5
  const mGroup = 1.0;    // 默认 TagGroup 系数
  const simulatedNextInterval = $derived(
    calculateNextInterval(currentInterval, mBase, mGroup, effectivePriority)
  );

  // 获取下次复习时间戳（兼容不同数据结构）
  const nextRepTimestamp = $derived(() => {
    if ((block as any).nextRepDate) {
      return (block as any).nextRepDate;
    }
    if (block.nextReview) {
      return new Date(block.nextReview).getTime();
    }
    return null;
  });

  // 格式化时间戳
  function formatTimestamp(ts: number | null): string {
    if (!ts) return '未设置';
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // 计算从今天到下次复习的天数
  const daysUntilNextReview = $derived(() => {
    const ts = nextRepTimestamp();
    if (!ts) return null;
    const now = Date.now();
    return (ts - now) / (24 * 60 * 60 * 1000);
  });

  // 获取优先级变更日志（如果存在）
  const priorityLog = $derived(
    (block as any).meta?.priorityLog ?? []
  );

  // 格式化日期时间
  function formatDateTime(dateStr: string | null | undefined): string {
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

  // 格式化阅读时长
  function formatReadingTime(seconds: number | undefined): string {
    if (!seconds || seconds <= 0) return '0秒';
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${mins}分`;
  }

  // 获取状态文本
  function getStateText(state: string): string {
    const stateMap: Record<string, string> = {
      'new': '新内容',
      'learning': '学习中',
      'review': '复习中',
      'suspended': '已暂停',
      'queued': '已排队',
      'scheduled': '已调度',
      'active': '活跃中',
      'done': '已完成'
    };
    return stateMap[state] || state || '未知';
  }

  // 获取优先级文本
  function getPriorityText(priority: number | undefined): string {
    if (priority === undefined) return '未设置';
    if (priority <= 3) return '低';
    if (priority <= 6) return '中';
    if (priority <= 8) return '高';
    return '紧急';
  }

  // 获取优先级颜色
  function getPriorityColor(priority: number | undefined): string {
    if (priority === undefined) return 'var(--text-muted)';
    if (priority <= 3) return 'var(--text-muted)';
    if (priority <= 6) return 'var(--interactive-accent)';
    return 'var(--text-warning)';
  }

  // 获取理解度评分文本
  function getRatingText(rating: number | undefined): string {
    if (!rating) return '未评分';
    const ratingMap: Record<number, string> = {
      1: '忽略',
      2: '一般',
      3: '清晰',
      4: '精通'
    };
    return ratingMap[rating] || `${rating}`;
  }

  // 复制JSON到剪贴板
  async function copyJson() {
    const copied = await writeSystemClipboardText(formattedJson);
    new Notice(copied ? '已复制 JSON' : '复制失败');
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="ir-block-info-backdrop" 
  class:ir-block-info-backdrop--popover={!!position}
  class:ir-block-info-backdrop--obsidian={useObsidianModal}
  onclick={(event) => {
    if (!useObsidianModal && event.target === event.currentTarget) onClose();
  }}
  onkeydown={handleKeydown}
>
  <div 
    class="ir-block-info-container" 
    class:ir-block-info-container--popover={!!position}
    class:ir-block-info-container--obsidian={useObsidianModal}
    bind:this={modalEl}
    style={position ? `left: ${left}px; top: ${top}px;` : undefined}
    role="dialog" 
    tabindex="-1"
    aria-modal={!position && !useObsidianModal}
    aria-label="内容块信息与来源"
  >
    {#if currentView === 'info'}
      <div class="modal-content">
        <!-- 基础信息 -->
        <section class="info-section">
          <h4 class="section-title">基础信息</h4>
          
          <div class="info-row">
            <span class="info-label">内容块ID</span>
            <span class="info-value mono" title={block.id}>{block.id.slice(0, 12)}...</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">所属文件</span>
            <span class="info-value" title={block.filePath}>
              {block.filePath?.split('/').pop() || '未知文件'}
            </span>
          </div>
          
          <div class="info-row">
            <span class="info-label">内容块状态</span>
            <span class="info-value status-badge">{getStateText(block.state)}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">优先级</span>
            <span class="info-value" style="color: {getPriorityColor(block.priorityUi ?? block.priority)}">
              {block.priorityUi !== undefined ? block.priorityUi.toFixed(1) : block.priority} ({getPriorityText(block.priorityUi ?? block.priority)})
            </span>
          </div>

          {#if block.headingText || (block.headingPath && block.headingPath.length > 0)}
          <div class="info-row">
            <span class="info-label">标题</span>
            <span class="info-value">{block.headingText || block.headingPath?.join(' > ') || '无标题'}</span>
          </div>
          {/if}
        </section>

        <!-- 学习数据 -->
        <section class="info-section">
          <h4 class="section-title">学习数据</h4>
          
          <div class="info-row">
            <span class="info-label">当前间隔</span>
            <span class="info-value">{formatInterval(block.interval)}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">间隔因子</span>
            <span class="info-value">{block.intervalFactor?.toFixed(2) || '1.50'}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">复习次数</span>
            <span class="info-value">{block.reviewCount || 0}次</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">累计阅读时长</span>
            <span class="info-value">{formatReadingTime(totalReadingTimeSeconds)}</span>
          </div>
          
          {#if block.lastRating}
          <div class="info-row">
            <span class="info-label">上次理解度</span>
            <span class="info-value">{getRatingText(block.lastRating)}</span>
          </div>
          {/if}

          {#if block.priorityEff !== undefined}
          <div class="info-row">
            <span class="info-label">有效优先级</span>
            <span class="info-value">{block.priorityEff.toFixed(2)}</span>
          </div>
          {/if}
        </section>

        <!-- 时间信息 -->
        <section class="info-section">
          <h4 class="section-title">时间信息</h4>
          
          <div class="info-row">
            <span class="info-label">创建时间</span>
            <span class="info-value">{formatDateTime(block.createdAt)}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">修改时间</span>
            <span class="info-value">{formatDateTime(block.updatedAt)}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">下次复习</span>
            <span class="info-value">{formatDateTime(block.nextReview)}</span>
          </div>
          
          {#if block.lastReview}
          <div class="info-row">
            <span class="info-label">上次复习</span>
            <span class="info-value">{formatDateTime(block.lastReview)}</span>
          </div>
          {/if}
          
          {#if block.firstReadAt}
          <div class="info-row">
            <span class="info-label">首次阅读</span>
            <span class="info-value">{formatDateTime(block.firstReadAt)}</span>
          </div>
          {/if}
        </section>

        <!-- 来源信息 -->
        <section class="info-section">
          <h4 class="section-title">来源信息</h4>
          
          <div class="info-row">
            <span class="info-label">源文档</span>
            <span class="info-value link-style" title={block.filePath}>
              {block.filePath || '未知'}
            </span>
          </div>
          
          {#if block.startLine}
          <div class="info-row">
            <span class="info-label"># 行号范围</span>
            <span class="info-value">
              {block.startLine}{block.endLine ? ` - ${block.endLine}` : ''}
            </span>
          </div>
          {/if}

          {#if block.tags && block.tags.length > 0}
          <div class="info-row">
            <span class="info-label">标签</span>
            <span class="info-value tags-list">
              {#each block.tags as tag}
                <span class="tag-item">#{tag}</span>
              {/each}
            </span>
          </div>
          {/if}
        </section>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <button type="button" class="action-btn" onclick={() => currentView = 'calc'}>
            <EnhancedIcon name="calculator" size={16} />
            <span>查看计算记录</span>
          </button>
          <button type="button" class="action-btn" onclick={() => currentView = 'json'}>
            <EnhancedIcon name="code" size={16} />
            <span>查看数据结构</span>
          </button>
        </div>
      </div>

    {:else if currentView === 'calc'}
      <div class="view-nav">
        <button
          type="button"
          class="view-back-btn clickable-icon"
          onclick={() => currentView = 'info'}
          aria-label="返回详情"
          title="返回详情"
        >
          <EnhancedIcon name="arrow-left" size={16} />
        </button>
      </div>
      
      <div class="modal-content calc-content">
        <!-- 算法公式说明 -->
        <section class="info-section">
          <h4 class="section-title">核心算法公式</h4>
          <div class="formula-box">
            <code class="formula">I_next = Clamp(I_curr × M_base × M_group × Ψ(P_eff), I_min, I_max)</code>
          </div>
          <p class="formula-desc">
            其中 Ψ(p) 是变速函数，根据优先级调整间隔增长速度
          </p>
        </section>

        <!-- 当前参数值 -->
        <section class="info-section">
          <h4 class="section-title">当前参数值</h4>
          
          <div class="calc-row">
            <span class="calc-label">I_curr（当前间隔）</span>
            <span class="calc-value highlight">{currentInterval.toFixed(2)} 天</span>
          </div>
          
          <div class="calc-row">
            <span class="calc-label">M_base（基础扩张乘子）</span>
            <span class="calc-value">{mBase}</span>
          </div>
          
          <div class="calc-row">
            <span class="calc-label">M_group（TagGroup 系数）</span>
            <span class="calc-value">{mGroup}</span>
          </div>
          
          <div class="calc-row">
            <span class="calc-label">P_eff（有效优先级）</span>
            <span class="calc-value highlight">{effectivePriority.toFixed(2)}</span>
          </div>
          
          <div class="calc-row">
            <span class="calc-label">Ψ(P_eff)（变速系数）</span>
            <span class="calc-value highlight">{psiValue.toFixed(4)}</span>
          </div>
          
          <div class="calc-row">
            <span class="calc-label">I_min / I_max</span>
            <span class="calc-value">{I_MIN} / {I_MAX} 天</span>
          </div>
        </section>

        <!-- 变速函数解释 -->
        <section class="info-section">
          <h4 class="section-title">变速函数 Ψ(p) 解释</h4>
          <div class="psi-explanation">
            {#if effectivePriority > PRIORITY_NEUTRAL}
              <div class="psi-case high-priority">
                                <div class="psi-text">
                  <strong>高优先级模式</strong>
                  <p>P_eff = {effectivePriority.toFixed(2)} > 5</p>
                  <p>Ψ = 1.0 - ({effectivePriority.toFixed(2)} - 5) / 5 × 0.6 = <strong>{psiValue.toFixed(4)}</strong></p>
                  <p class="psi-effect">效果：间隔缩短，复习频率提高</p>
                </div>
              </div>
            {:else if effectivePriority < PRIORITY_NEUTRAL}
              <div class="psi-case low-priority">
                                <div class="psi-text">
                  <strong>低优先级模式</strong>
                  <p>P_eff = {effectivePriority.toFixed(2)} &lt; 5</p>
                  <p>Ψ = 1.0 + (5 - {effectivePriority.toFixed(2)}) / 5 × 2.0 = <strong>{psiValue.toFixed(4)}</strong></p>
                  <p class="psi-effect">效果：间隔拉长，复习频率降低</p>
                </div>
              </div>
            {:else}
              <div class="psi-case neutral">
                                <div class="psi-text">
                  <strong>中性优先级</strong>
                  <p>P_eff = 5（中性点）</p>
                  <p>Ψ = <strong>1.0</strong></p>
                  <p class="psi-effect">效果：标准间隔增长</p>
                </div>
              </div>
            {/if}
          </div>
        </section>

        <!-- 计算过程演示 -->
        <section class="info-section">
          <h4 class="section-title">计算过程演示</h4>
          <div class="calc-steps">
            <div class="calc-step">
              <span class="step-num">1</span>
              <span class="step-content">
                原始计算：{currentInterval.toFixed(2)} × {mBase} × {mGroup} × {psiValue.toFixed(4)}
              </span>
            </div>
            <div class="calc-step">
              <span class="step-num">2</span>
              <span class="step-content">
                = {(currentInterval * mBase * mGroup * psiValue).toFixed(4)} 天
              </span>
            </div>
            <div class="calc-step">
              <span class="step-num">3</span>
              <span class="step-content">
                Clamp 到 [{I_MIN}, {I_MAX}]：<strong>{simulatedNextInterval.toFixed(2)} 天</strong>
              </span>
            </div>
          </div>
        </section>

        <!-- 实际调度结果 -->
        <section class="info-section">
          <h4 class="section-title">实际调度结果</h4>
          
          <div class="calc-row">
            <span class="calc-label">下次复习时间</span>
            <span class="calc-value">{formatTimestamp(nextRepTimestamp())}</span>
          </div>
          
          <div class="calc-row">
            <span class="calc-label">距今天数</span>
            <span class="calc-value" class:overdue={daysUntilNextReview() !== null && daysUntilNextReview()! < 0}>
              {#if daysUntilNextReview() !== null}
                {daysUntilNextReview()! >= 0 ? `+${daysUntilNextReview()!.toFixed(2)}` : daysUntilNextReview()!.toFixed(2)} 天
              {:else}
                未设置
              {/if}
            </span>
          </div>

          <div class="calc-row">
            <span class="calc-label">预测下次间隔</span>
            <span class="calc-value highlight">{simulatedNextInterval.toFixed(2)} 天</span>
          </div>
        </section>

        <!-- 优先级变更历史 -->
        {#if priorityLog.length > 0}
        <section class="info-section">
          <h4 class="section-title">优先级变更历史</h4>
          <div class="priority-log">
            {#each priorityLog.slice(-5).reverse() as entry}
              <div class="log-entry">
                <div class="log-time">{formatTimestamp(entry.ts)}</div>
                <div class="log-change">
                  <span class="old-p">{entry.oldP.toFixed(1)}</span>
                  <span class="arrow">→</span>
                  <span class="new-p">{entry.newP.toFixed(1)}</span>
                </div>
                <div class="log-reason">{entry.reason}</div>
              </div>
            {/each}
          </div>
        </section>
        {/if}

        <!-- EWMA 说明 -->
        <section class="info-section">
          <h4 class="section-title">优先级平滑（EWMA）</h4>
          <div class="formula-box">
            <code class="formula">P_eff = α × P_ui + (1-α) × P_eff_old</code>
          </div>
          <div class="calc-row">
            <span class="calc-label">α（EWMA 系数）</span>
            <span class="calc-value">{EWMA_ALPHA}</span>
          </div>
          <p class="formula-desc">
            EWMA 用于平滑优先级变化，避免单次调整造成过大波动。每次调整只影响 {(EWMA_ALPHA * 100).toFixed(0)}% 的权重。
          </p>
        </section>
      </div>

    {:else}
      <div class="view-nav">
        <button
          type="button"
          class="view-back-btn clickable-icon"
          onclick={() => currentView = 'info'}
          aria-label="返回详情"
          title="返回详情"
        >
          <EnhancedIcon name="arrow-left" size={16} />
        </button>
      </div>
      
      <div class="json-content">
        <div class="json-toolbar">
          <button class="copy-btn" onclick={copyJson}>
            <EnhancedIcon name="copy" size={14} />
            <span>复制</span>
          </button>
        </div>
        <pre class="json-view">{formattedJson}</pre>
      </div>
    {/if}
  </div>
</div>

<style>
  .ir-block-info-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-top, 10000);
    animation: fadeIn 0.2s ease-out;
  }

  .ir-block-info-backdrop--popover {
    background: transparent;
    align-items: flex-start;
    justify-content: flex-start;
    pointer-events: none;
  }

  .ir-block-info-backdrop--obsidian {
    position: static;
    inset: auto;
    width: 100%;
    height: 100%;
    background: transparent;
    z-index: auto;
    align-items: stretch;
    justify-content: stretch;
    animation: none;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .ir-block-info-container {
    background: var(--background-primary);
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  }

  .ir-block-info-container--popover {
    position: fixed;
    width: 480px;
    animation: none;
    pointer-events: auto;
  }

  .ir-block-info-container--obsidian {
    width: 100%;
    max-width: none;
    max-height: none;
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
    animation: none;
  }

  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(20px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }

  .view-nav {
    display: flex;
    align-items: center;
    padding: 10px 16px 0;
  }

  .view-back-btn {
    width: var(--clickable-icon-size, 32px);
    height: var(--clickable-icon-size, 32px);
    padding: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--clickable-icon-radius, 6px);
    background: var(--background-secondary);
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .view-back-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: color-mix(in srgb, var(--interactive-accent) 30%, var(--background-modifier-border));
  }

  .view-back-btn:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: 1px;
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .info-section {
    margin-bottom: 20px;
  }

  .info-section:last-of-type {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    margin: 0 0 12px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    min-height: 32px;
  }

  .info-row:not(:last-child) {
    border-bottom: 1px solid var(--background-modifier-border-focus);
  }

  .info-label {
    font-size: 13px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .info-value {
    font-size: 13px;
    color: var(--text-normal);
    text-align: right;
    word-break: break-word;
    max-width: 60%;
  }

  .info-value.mono {
    font-family: var(--font-monospace);
    font-size: 12px;
  }

  .info-value.link-style {
    color: var(--text-accent);
    text-decoration: underline;
    cursor: default;
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--background-modifier-hover);
    font-size: 12px;
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
  }

  .tag-item {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--background-modifier-hover);
    border-radius: 3px;
    color: var(--text-muted);
  }

  .action-buttons {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--background-modifier-border);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .action-btn:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--interactive-accent) 30%, var(--background-modifier-border));
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: 1px;
  }

  /* JSON视图样式 */
  .json-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--background-secondary);
  }

  .json-toolbar {
    padding: 8px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: flex-end;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--background-modifier-hover);
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .copy-btn:hover {
    background: var(--interactive-accent);
    color: white;
  }

  .json-view {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 16px;
    font-family: var(--font-monospace);
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-normal);
    white-space: pre;
    word-wrap: break-word;
  }

  /* ==================== 计算记录视图样式 ==================== */
  .calc-content {
    background: var(--background-primary);
  }

  .formula-box {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 12px;
    overflow-x: auto;
  }

  .formula {
    font-family: var(--font-monospace);
    font-size: 13px;
    color: var(--text-accent);
    white-space: nowrap;
  }

  .formula-desc {
    font-size: 12px;
    color: var(--text-muted);
    margin: 8px 0 0 0;
    line-height: 1.5;
  }

  .calc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    min-height: 32px;
  }

  .calc-row:not(:last-child) {
    border-bottom: 1px solid var(--background-modifier-border-focus);
  }

  .calc-label {
    font-size: 13px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .calc-value {
    font-size: 13px;
    color: var(--text-normal);
    font-family: var(--font-monospace);
    text-align: right;
  }

  .calc-value.highlight {
    color: var(--text-accent);
    font-weight: 600;
  }

  .calc-value.overdue {
    color: var(--text-error);
  }

  /* 变速函数解释 */
  .psi-explanation {
    background: var(--background-secondary);
    border-radius: 8px;
    padding: 12px;
  }

  .psi-case {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .psi-text {
    flex: 1;
  }

  .psi-text strong {
    display: block;
    margin-bottom: 4px;
    color: var(--text-normal);
  }

  .psi-text p {
    margin: 4px 0;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-monospace);
  }

  .psi-effect {
    color: var(--text-accent) !important;
    font-family: var(--font-text) !important;
    margin-top: 8px !important;
  }

  .psi-case.high-priority {
    border-left: 3px solid var(--text-warning);
    padding-left: 12px;
  }

  .psi-case.low-priority {
    border-left: 3px solid var(--text-muted);
    padding-left: 12px;
  }

  .psi-case.neutral {
    border-left: 3px solid var(--interactive-accent);
    padding-left: 12px;
  }

  /* 计算步骤 */
  .calc-steps {
    background: var(--background-secondary);
    border-radius: 8px;
    padding: 12px;
  }

  .calc-step {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 8px 0;
  }

  .calc-step:not(:last-child) {
    border-bottom: 1px dashed var(--background-modifier-border);
  }

  .step-num {
    width: 24px;
    height: 24px;
    background: var(--interactive-accent);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .step-content {
    font-size: 13px;
    font-family: var(--font-monospace);
    color: var(--text-normal);
  }

  .step-content strong {
    color: var(--text-accent);
  }

  /* 优先级变更日志 */
  .priority-log {
    background: var(--background-secondary);
    border-radius: 8px;
    padding: 8px;
    max-height: 200px;
    overflow-y: auto;
  }

  .log-entry {
    padding: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .log-entry:last-child {
    border-bottom: none;
  }

  .log-time {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 4px;
  }

  .log-change {
    display: flex;
    gap: 8px;
    align-items: center;
    font-family: var(--font-monospace);
    font-size: 13px;
  }

  .old-p {
    color: var(--text-muted);
  }

  .arrow {
    color: var(--text-faint);
  }

  .new-p {
    color: var(--text-accent);
    font-weight: 600;
  }

  .log-reason {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
    font-style: italic;
  }

  :global(.is-mobile) .ir-block-info-container--popover {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    max-height: 80vh;
  }

  :global(.is-mobile) .view-nav {
    padding: 8px 12px 0;
  }

  :global(.is-mobile) .modal-content {
    padding: 12px 14px;
  }

  :global(.is-mobile) .section-title {
    font-size: 12px;
    margin: 0 0 10px 0;
  }

  :global(.is-mobile) .info-row {
    padding: 6px 0;
    min-height: 28px;
  }

  :global(.is-mobile) .info-label,
  :global(.is-mobile) .info-value {
    font-size: 12px;
  }

  :global(.is-mobile) .action-buttons {
    margin-top: 14px;
    padding-top: 12px;
    grid-template-columns: 1fr;
    gap: 6px;
  }

  :global(.is-mobile) .action-btn {
    min-height: 32px;
    padding: 7px 10px;
    font-size: 13px;
    gap: 6px;
    border-radius: 7px;
  }
</style>
