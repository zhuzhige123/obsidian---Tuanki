<!--
  AnkiConnect自动同步配置组件
  职责：自动同步相关的所有配置选项
-->
<script lang="ts">
  import type { AnkiConnectService } from '../../../../services/ankiconnect/AnkiConnectService';

  interface AutoSyncSettings {
    enabled: boolean;
    intervalMinutes: number;
    syncOnStartup: boolean;
    onlyWhenAnkiRunning: boolean;
    maxCardsPerSync?: number;
    prioritizeRecent: boolean;
    enableFileWatcher?: boolean;
  }

  interface Props {
    autoSyncSettings: AutoSyncSettings;
    ankiService: AnkiConnectService | null;
    onSettingsChange: (settings: AutoSyncSettings) => void;
  }

  let { autoSyncSettings, ankiService, onSettingsChange }: Props = $props();

  function handleAutoSyncToggle() {
    onSettingsChange(autoSyncSettings);
    
    if (autoSyncSettings.enabled && ankiService) {
      ankiService.startAutoSync();
    } else if (ankiService) {
      ankiService.stopAutoSync();
    }
  }

  function handleSettingChange() {
    onSettingsChange(autoSyncSettings);
  }
</script>

<div class="autosync-config">
  <!-- 启用自动同步 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">启用自动同步</div>
      <div class="setting-item-description">
        按设定间隔自动同步卡片到 Anki
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={autoSyncSettings.enabled}
          onchange={handleAutoSyncToggle}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>

  {#if autoSyncSettings.enabled}
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">同步间隔（分钟）</div>
        <div class="setting-item-description">
          定时同步的时间间隔
        </div>
      </div>
      <div class="setting-item-control">
        <input
          type="number"
          class="modern-input"
          bind:value={autoSyncSettings.intervalMinutes}
          onblur={handleSettingChange}
          min="5"
          max="1440"
        />
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">启动时同步</div>
        <div class="setting-item-description">
          Obsidian 启动时自动执行同步
        </div>
      </div>
      <div class="setting-item-control">
        <label class="modern-switch">
          <input
            type="checkbox"
            bind:checked={autoSyncSettings.syncOnStartup}
            onchange={handleSettingChange}
          />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">文件变更检测</div>
        <div class="setting-item-description">
          检测到卡片文件修改时自动同步
        </div>
      </div>
      <div class="setting-item-control">
        <label class="modern-switch">
          <input
            type="checkbox"
            bind:checked={autoSyncSettings.enableFileWatcher}
            onchange={handleSettingChange}
          />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  {/if}
</div>

<style>
  .autosync-config {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .setting-item-info {
    flex: 1;
  }

  .setting-item-name {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .setting-item-description {
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    flex-shrink: 0;
  }

  /* 现代开关样式 */
  .modern-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 24px;
  }

  .modern-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .modern-switch .switch-slider {
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

  .modern-switch .switch-slider:before {
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

  .modern-switch input:checked + .switch-slider {
    background-color: var(--interactive-accent);
  }

  .modern-switch input:checked + .switch-slider:before {
    transform: translateX(18px);
  }

  .modern-switch input:focus + .switch-slider {
    box-shadow: 0 0 1px var(--interactive-accent);
  }

  .modern-input {
    width: 100px;
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--tuanki-radius-sm);
    color: var(--text-normal);
    font-size: 14px;
    text-align: center;
    transition: border-color 0.2s;
  }

  .modern-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .setting-item {
      flex-direction: column;
      align-items: flex-start;
    }

    .setting-item-control {
      margin-left: 0;
      margin-top: 8px;
    }
  }
</style>

