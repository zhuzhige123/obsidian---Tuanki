<!--
  数据管理界面 - 已清理，等待重构
  此文件将被完全重写为新的数据管理界面
-->
<script lang="ts">
  interface Props {
    plugin: any;
    onSave: () => Promise<void>;
  }

  let { plugin, onSave }: Props = $props();
</script>

<!-- 临时占位内容，表示此组件已被清理 -->
<div class="data-management-placeholder">
  <h3>数据管理</h3>
  <p>此界面正在重构中...</p>
</div>

<style>
  .data-management-placeholder {
    padding: 2rem;
    text-align: center;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    color: var(--text-muted);
  }

  .data-management-placeholder h3 {
    margin: 0 0 1rem 0;
    color: var(--text-normal);
  }

  .data-management-placeholder p {
    margin: 0;
    font-style: italic;
  }
</style>
