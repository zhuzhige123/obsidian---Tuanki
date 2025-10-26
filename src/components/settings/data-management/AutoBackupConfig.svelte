<!--
  自动备份配置组件
  提供自动备份的配置界面
-->
<script lang="ts">
  import type { AutoBackupConfig } from '../../../types/data-management-types';
  import type { TuankiPlugin } from '../../../main';

  interface Props {
    plugin: TuankiPlugin;
  }

  let { plugin }: Props = $props();

  // 响应式配置状态
  let config = $state<AutoBackupConfig>({
    enabled: plugin.settings.autoBackupConfig?.enabled ?? true,
    intervalHours: plugin.settings.autoBackupConfig?.intervalHours ?? 24,
    triggers: {
      onStartup: plugin.settings.autoBackupConfig?.triggers.onStartup ?? true,
      onCardThreshold: plugin.settings.autoBackupConfig?.triggers.onCardThreshold ?? true,
      cardThresholdCount: plugin.settings.autoBackupConfig?.triggers.cardThresholdCount ?? 100
    },
    notifications: {
      onSuccess: plugin.settings.autoBackupConfig?.notifications.onSuccess ?? true,
      onFailure: plugin.settings.autoBackupConfig?.notifications.onFailure ?? true
    },
    lastAutoBackupTime: plugin.settings.autoBackupConfig?.lastAutoBackupTime,
    autoBackupCount: plugin.settings.autoBackupConfig?.autoBackupCount ?? 0
  });

  // 调度器状态
  let schedulerStatus = $state({
    isRunning: false,
    nextBackupTime: null as Date | null,
    lastBackupTime: null as string | null,
    totalAutoBackups: 0
  });

  // 是否正在手动触发
  let isTriggering = $state(false);

  // 更新调度器状态
  function updateSchedulerStatus() {
    const scheduler = (plugin as any).autoBackupScheduler;
    if (scheduler) {
      const status = scheduler.getStatus();
      schedulerStatus = status;
    }
  }

  // 保存配置
  async function saveConfig() {
    plugin.settings.autoBackupConfig = { ...config };
    await plugin.saveSettings();
    
    // 重启调度器以应用新配置
    const scheduler = (plugin as any).autoBackupScheduler;
    if (scheduler) {
      scheduler.restart();
    }
    
    updateSchedulerStatus();
  }

  // 切换启用状态
  async function toggleEnabled() {
    config.enabled = !config.enabled;
    await saveConfig();
  }

  // 更新间隔小时
  async function updateInterval(value: number) {
    const hours = Math.max(1, Math.min(168, value)); // 限制 1-168 小时
    config.intervalHours = hours;
    await saveConfig();
  }

  // 更新阈值
  async function updateThreshold(value: number) {
    const count = Math.max(1, Math.min(10000, value)); // 限制 1-10000
    config.triggers.cardThresholdCount = count;
    await saveConfig();
  }

  // 手动触发自动备份
  async function triggerManualBackup() {
    const scheduler = (plugin as any).autoBackupScheduler;
    if (!scheduler || isTriggering) return;
    
    isTriggering = true;
    try {
      const success = await scheduler.triggerManualAutoBackup();
      if (success) {
        updateSchedulerStatus();
      }
    } finally {
      isTriggering = false;
    }
  }

  // 格式化时间
  function formatTime(date: Date | string | null): string {
    if (!date) return '从未';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // 计算倒计时
  function getCountdown(nextTime: Date | null): string {
    if (!nextTime) return '';
    
    const now = new Date().getTime();
    const target = nextTime.getTime();
    const diff = target - now;
    
    if (diff <= 0) return '即将备份';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `约 ${hours} 小时 ${minutes} 分钟后`;
    }
    return `约 ${minutes} 分钟后`;
  }

  // 初始化时更新状态
  $effect(() => {
    updateSchedulerStatus();
    
    // 每分钟更新一次状态
    const interval = setInterval(updateSchedulerStatus, 60000);
    
    return () => clearInterval(interval);
  });
</script>

<div class="tuanki-settings auto-backup-config">
  <!-- 自动备份配置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-red">自动备份配置</h4>
    <p class="group-description">
      定期自动创建数据备份，保护您的学习数据安全
    </p>

    <!-- 主开关 -->
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">启用自动备份</div>
        <div class="setting-description">
          定期自动创建数据备份
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={config.enabled}
            onchange={toggleEnabled}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- 备份间隔 -->
    <div class="setting-item" class:disabled={!config.enabled}>
      <div class="setting-info">
        <div class="setting-label">备份间隔</div>
        <div class="setting-description">
          自动备份的时间间隔（1-168 小时）
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          min="1"
          max="168"
          bind:value={config.intervalHours}
          onchange={() => updateInterval(config.intervalHours)}
          disabled={!config.enabled}
          class="modern-input number-input"
        />
        <span class="unit-label">小时</span>
      </div>
    </div>
  </div>

  <!-- 触发条件 -->
  <div class="settings-group" class:disabled={!config.enabled}>
    <h4 class="group-title with-accent-bar accent-blue">触发条件</h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">启动时备份</div>
        <div class="setting-description">
          插件启动时自动创建备份
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={config.triggers.onStartup}
            onchange={saveConfig}
            disabled={!config.enabled}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">卡片数量阈值备份</div>
        <div class="setting-description">
          卡片数量变化达到阈值时自动备份
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={config.triggers.onCardThreshold}
            onchange={saveConfig}
            disabled={!config.enabled}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    {#if config.triggers.onCardThreshold}
      <div class="setting-item nested">
        <div class="setting-info">
          <div class="setting-label">阈值数量</div>
          <div class="setting-description">
            卡片数量变化达到此值时触发备份
          </div>
        </div>
        <div class="setting-control">
          <input
            type="number"
            min="1"
            max="10000"
            bind:value={config.triggers.cardThresholdCount}
            onchange={() => updateThreshold(config.triggers.cardThresholdCount)}
            disabled={!config.enabled}
            class="modern-input number-input"
          />
          <span class="unit-label">张卡片</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- 通知设置 -->
  <div class="settings-group" class:disabled={!config.enabled}>
    <h4 class="group-title with-accent-bar accent-cyan">通知设置</h4>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">成功通知</div>
        <div class="setting-description">
          备份成功时显示通知
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={config.notifications.onSuccess}
            onchange={saveConfig}
            disabled={!config.enabled}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">失败通知</div>
        <div class="setting-description">
          备份失败时显示警告
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={config.notifications.onFailure}
            onchange={saveConfig}
            disabled={!config.enabled}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>

  <!-- 备份统计 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-green">备份统计</h4>
    
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-label">状态</div>
        <div class="stat-value" class:running={schedulerStatus.isRunning}>
          {schedulerStatus.isRunning ? '运行中' : '已停止'}
        </div>
      </div>

      <div class="stat-item">
        <div class="stat-label">自动备份总数</div>
        <div class="stat-value">{schedulerStatus.totalAutoBackups} 次</div>
      </div>

      <div class="stat-item">
        <div class="stat-label">上次备份</div>
        <div class="stat-value">{formatTime(schedulerStatus.lastBackupTime)}</div>
      </div>

      <div class="stat-item">
        <div class="stat-label">下次备份</div>
        <div class="stat-value">
          {formatTime(schedulerStatus.nextBackupTime)}
          {#if schedulerStatus.nextBackupTime}
            <span class="countdown">{getCountdown(schedulerStatus.nextBackupTime)}</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- 手动触发按钮 -->
    <div class="manual-trigger">
      <button
        class="trigger-button"
        onclick={triggerManualBackup}
        disabled={!config.enabled || isTriggering}
      >
        {isTriggering ? '正在备份...' : '立即执行自动备份'}
      </button>
      <p class="trigger-hint">
        手动触发一次自动备份（用于测试配置）
      </p>
    </div>
  </div>
</div>

<style>
  .auto-backup-config {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .setting-item.disabled {
    opacity: 0.5;
  }

  .setting-item.nested {
    margin-left: 2rem;
  }

  .settings-group.disabled {
    opacity: 0.5;
  }

  /* Backup Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .stat-value.running {
    color: var(--text-success);
  }

  .countdown {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  /* Manual Trigger */
  .manual-trigger {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .trigger-button {
    padding: 0.625rem 1.25rem;
    border: 1px solid var(--interactive-accent);
    border-radius: 6px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .trigger-button:hover:not(:disabled) {
    background: color-mix(in oklab, var(--interactive-accent), black 10%);
  }

  .trigger-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .trigger-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
  }
</style>

