<script lang="ts">
  interface Props {
    security: {
      encryptApiKeys: boolean;
      enableContentFilter: boolean;
      anonymousStats: boolean;
    };
  }

  let { security = $bindable() }: Props = $props();
</script>

<div class="security-config">
  <!-- 加密API密钥 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">加密存储API密钥</div>
      <div class="setting-item-description">
        使用AES-256加密算法保护API密钥安全
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={security.encryptApiKeys}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>

  <!-- 内容过滤 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">启用内容过滤</div>
      <div class="setting-item-description">
        过滤生成内容中的敏感或不适当信息
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={security.enableContentFilter}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>

  <!-- 匿名统计 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">匿名使用统计</div>
      <div class="setting-item-description">
        发送匿名使用数据以帮助改进插件（不包含任何个人信息）
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={security.anonymousStats}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
</div>

<style>
  .security-config {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .setting-item-info {
    flex: 1;
    min-width: 0;
  }

  .setting-item-name {
    font-size: 0.95em;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .setting-item-description {
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    flex-shrink: 0;
    min-width: 200px;
  }

</style>



