<!--
  AnkiConnect自动同步配置组件
  职责：自动同步相关的所有配置选项
-->
<script lang="ts">
  import { tr } from '../../../../utils/i18n';

  let t = $derived($tr);

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
    onSettingsChange: (settings: AutoSyncSettings) => void;
  }

  let { autoSyncSettings, onSettingsChange }: Props = $props();

  function handleAutoSyncToggle() {
    onSettingsChange(autoSyncSettings);
  }

  function handleSettingChange() {
    onSettingsChange(autoSyncSettings);
  }
</script>

<div class="autosync-config">
  <!-- 启用自动同步 -->
  <div class="setting-item">
    <div class="setting-info">
      <div class="setting-label">{t('ankiConnect.autoSync.enable')}</div>
      <div class="setting-description">
        {t('ankiConnect.autoSync.enableDesc')}
      </div>
    </div>
    <div class="setting-control">
      <label class="toggle-switch">
        <input
          type="checkbox"
          bind:checked={autoSyncSettings.enabled}
          onchange={handleAutoSyncToggle}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  {#if autoSyncSettings.enabled}
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('ankiConnect.autoSync.intervalLabel')}</div>
        <div class="setting-description">
          {t('ankiConnect.autoSync.intervalDesc')}
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          class="number-input"
          bind:value={autoSyncSettings.intervalMinutes}
          onblur={handleSettingChange}
          min="5"
          max="1440"
        />
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('ankiConnect.autoSync.syncOnStartupLabel')}</div>
        <div class="setting-description">
          {t('ankiConnect.autoSync.syncOnStartupDesc')}
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={autoSyncSettings.syncOnStartup}
            onchange={handleSettingChange}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-label">{t('ankiConnect.autoSync.fileWatcherLabel')}</div>
        <div class="setting-description">
          {t('ankiConnect.autoSync.fileWatcherDesc')}
        </div>
      </div>
      <div class="setting-control">
        <label class="toggle-switch">
          <input
            type="checkbox"
            bind:checked={autoSyncSettings.enableFileWatcher}
            onchange={handleSettingChange}
          />
          <span class="toggle-slider"></span>
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
</style>
