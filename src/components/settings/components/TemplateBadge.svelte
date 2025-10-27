<script lang="ts">
  /**
   * 模板来源标识组件
   * 显示模板的来源和同步能力
   */

  let {
    source = 'user_custom',
    supportsBidirectional = false
  }: {
    source: 'official' | 'anki_imported' | 'tuanki_created' | 'user_custom';
    supportsBidirectional?: boolean;
  } = $props();

  const sourceConfig = {
    official: {
      icon: '⭐',
      label: '官方',
      class: 'badge-official'
    },
    anki_imported: {
      icon: '📥',
      label: '来自Anki',
      class: 'badge-anki'
    },
    tuanki_created: {
      icon: '🔧',
      label: 'Tuanki创建',
      class: 'badge-tuanki'
    },
    user_custom: {
      icon: '👤',
      label: '自定义',
      class: 'badge-custom'
    }
  };

  const config = $derived(sourceConfig[source]);
</script>

<div class="template-badges">
  <span class="badge {config.class}">
    {config.icon} {config.label}
  </span>
  
  {#if supportsBidirectional}
    <span class="badge badge-sync">
      ✓ 双向同步
    </span>
  {/if}
</div>

<style>
  .template-badges {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .badge-official {
    background: rgba(255, 215, 0, 0.15);
    color: #d97706;
    border: 1px solid rgba(217, 119, 6, 0.3);
  }

  .badge-anki {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .badge-tuanki {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .badge-custom {
    background: rgba(107, 114, 128, 0.15);
    color: #6b7280;
    border: 1px solid rgba(107, 114, 128, 0.3);
  }

  .badge-sync {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
</style>




