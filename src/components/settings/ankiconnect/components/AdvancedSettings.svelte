<!--
  AnkiConnect高级设置组件
  职责：媒体同步等高级功能配置
-->
<script lang="ts">
  import PremiumBadge from '../../../premium/PremiumBadge.svelte';
  import { PREMIUM_FEATURES } from '../../../../services/premium/PremiumFeatureGuard';

  interface MediaSyncSettings {
    enabled: boolean;
  }

  interface Props {
    mediaSync: MediaSyncSettings;
    isPremium: boolean;
    onMediaSyncChange: () => void;
    onShowActivationPrompt: (featureId: string) => void;
  }

  let { 
    mediaSync, 
    isPremium,
    onMediaSyncChange,
    onShowActivationPrompt
  }: Props = $props();
</script>

<div class="advanced-settings">
  <!-- 启用媒体同步 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">启用媒体同步</div>
      <div class="setting-item-description">
        同步图片、音频等媒体文件到 Anki
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={mediaSync.enabled}
          onchange={onMediaSyncChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
</div>

<style>
  .advanced-settings {
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
    display: flex;
    align-items: center;
    gap: 8px;
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

  .modern-switch input:disabled + .switch-slider {
    opacity: 0.5;
    cursor: not-allowed;
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

