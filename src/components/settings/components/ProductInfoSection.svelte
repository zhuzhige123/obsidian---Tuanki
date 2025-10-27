<script lang="ts">
  import { PRODUCT_INFO, ACKNOWLEDGMENTS } from '../constants/settings-constants';
  import { ACTIVATION_HELP_TEXT } from '../constants/activation-constants';
  import CompactActivationForm from './CompactActivationForm.svelte';

  interface Props {
    compact?: boolean;
    plugin?: any;
    onSave?: () => Promise<void>;
  }

  let { compact = false, plugin, onSave }: Props = $props();

  // 产品信息配置
  const productData = [
    {
      label: '产品名称',
      value: PRODUCT_INFO.NAME,
      icon: '🎯'
    },
    {
      label: '版本号',
      value: PRODUCT_INFO.VERSION,
      icon: '🏷️'
    },
    {
      label: '核心算法',
      value: PRODUCT_INFO.ALGORITHM,
      icon: '🧠'
    },
    {
      label: '适用平台',
      value: PRODUCT_INFO.PLATFORM,
      icon: '💻'
    },
    {
      label: '开发者',
      value: PRODUCT_INFO.DEVELOPER,
      icon: '👥'
    },
    {
      label: '许可模式',
      value: PRODUCT_INFO.LICENSE_MODEL,
      icon: '📄'
    }
  ];
</script>

<div class="product-info-section" class:compact>
  <!-- 标题区域 -->
  <div class="section-header">
    <div class="header-content">
      <div class="product-logo">
        <div class="logo-icon">🎴</div>
        <div class="logo-text">
          <h2 class="product-title">Tuanki</h2>
          <p class="product-tagline">智能记忆卡片插件</p>
        </div>
      </div>
    </div>
  </div>

  <!-- 产品信息表格 -->
  <div class="info-grid">
    {#each productData as item}
      <div class="info-item">
        <div class="item-icon">{item.icon}</div>
        <div class="item-content">
          <div class="item-label">{item.label}</div>
          <div class="item-value">{item.value}</div>
        </div>
      </div>
    {/each}
  </div>

  <!-- 快速链接 -->
  <div class="quick-links">
    <a
      href="https://github.com/zhuzhige123/obsidian---Tuanki"
      target="_blank"
      class="quick-link opensource-link"
    >
      <span class="link-icon">🔓</span>
      <span class="link-text">完全开源</span>
    </a>
    <a
      href={ACTIVATION_HELP_TEXT.CONTACT_INFO.github}
      target="_blank"
      class="quick-link"
    >
      <span class="link-icon">📖</span>
      <span class="link-text">查看文档</span>
    </a>
    <a
      href={`${ACTIVATION_HELP_TEXT.CONTACT_INFO.github}/releases`}
      target="_blank"
      class="quick-link"
    >
      <span class="link-icon">🚀</span>
      <span class="link-text">更新日志</span>
    </a>
    <a
      href={`mailto:${ACTIVATION_HELP_TEXT.CONTACT_INFO.email}?subject=${ACTIVATION_HELP_TEXT.CONTACT_INFO.subject}`}
      class="quick-link"
    >
      <span class="link-icon">💬</span>
      <span class="link-text">联系支持</span>
    </a>
  </div>

  <!-- 特别感谢 -->
  <div class="acknowledgments-section">
    <h3 class="section-title">特别感谢</h3>
    <div class="acknowledgments-grid">
      {#each ACKNOWLEDGMENTS as item}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          class="acknowledgment-link"
          title={item.description}
        >
          <span class="ack-icon">{item.icon}</span>
          <span class="ack-name">{item.name}</span>
        </a>
      {/each}
    </div>
  </div>

  <!-- 紧凑激活功能 -->
  {#if plugin && onSave}
    <CompactActivationForm {plugin} {onSave} />
  {/if}

</div>

<style>
  .product-info-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 1rem;
    padding: 2rem;
    margin-bottom: 2rem;
    position: relative;
    overflow: hidden;
    width: 100%;
    max-width: none;
    box-sizing: border-box;
  }

  .product-info-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, 
      var(--color-accent) 0%, 
      var(--color-blue) 50%,
      var(--color-purple) 100%
    );
  }

  .product-info-section.compact {
    padding: 1.5rem;
  }

  .section-header {
    margin-bottom: 2rem;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .product-logo {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .logo-icon {
    font-size: 3rem;
    line-height: 1;
  }

  .logo-text {
    text-align: left;
  }

  .product-title {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    background: linear-gradient(135deg, 
      var(--color-accent) 0%, 
      var(--color-blue) 100%
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1.2;
  }

  .product-tagline {
    margin: 0.25rem 0 0 0;
    font-size: 1rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
    width: 100%;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    transition: all 0.2s ease;
  }

  .info-item:hover {
    border-color: var(--background-modifier-border-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .item-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .item-content {
    flex: 1;
    min-width: 0;
  }

  .item-label {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 500;
    margin-bottom: 0.25rem;
  }

  .item-value {
    font-size: 1rem;
    color: var(--text-normal);
    font-weight: 600;
    word-break: break-word;
  }



  /* 响应式设计 */
  @media (max-width: 768px) {
    .product-info-section {
      padding: 1.5rem;
    }

    .product-logo {
      flex-direction: column;
      text-align: center;
      gap: 0.75rem;
    }

    .logo-icon {
      font-size: 2.5rem;
    }

    .product-title {
      font-size: 1.75rem;
    }

    .logo-text {
      text-align: center;
    }

    .info-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .info-item {
      padding: 0.75rem;
    }

    .quick-links {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .quick-link {
      flex: none;
    }
  }

  /* 超小屏幕适配 */
  @media (max-width: 480px) {
    .quick-links {
      grid-template-columns: 1fr;
    }
  }

  /* 快速链接样式 */
  .quick-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin: 2rem 0;
    padding-top: 2rem;
    border-top: 1px solid var(--background-modifier-border);
    width: 100%;
  }

  .quick-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    color: var(--text-normal);
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
    flex: 1;
    min-width: 0;
  }

  .quick-link:hover {
    border-color: var(--color-accent);
    background: color-mix(in oklab, var(--color-accent), transparent 95%);
    transform: translateY(-1px);
  }

  .link-icon {
    font-size: 1rem;
  }

  .link-text {
    font-size: 0.875rem;
  }

  /* 开源链接特殊样式 */
  .opensource-link {
    background: linear-gradient(135deg,
      color-mix(in oklab, var(--color-green), transparent 85%) 0%,
      color-mix(in oklab, var(--color-blue), transparent 85%) 100%
    );
    border-color: color-mix(in oklab, var(--color-green), transparent 60%);
    color: var(--color-green);
    font-weight: 600;
  }

  .opensource-link:hover {
    background: linear-gradient(135deg,
      color-mix(in oklab, var(--color-green), transparent 75%) 0%,
      color-mix(in oklab, var(--color-blue), transparent 75%) 100%
    );
    border-color: var(--color-green);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--color-green), transparent 70%);
  }

  .opensource-link .link-icon {
    font-size: 1.1rem;
  }

  /* 致谢区域样式 */
  .acknowledgments-section {
    margin: 2rem 0;
    padding-top: 2rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .section-title {
    margin: 0 0 1.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-muted);
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .acknowledgments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    width: 100%;
  }

  .acknowledgment-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    color: var(--text-normal);
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
    flex: 1;
    min-width: 0;
  }

  .acknowledgment-link:hover {
    border-color: var(--color-accent);
    background: color-mix(in oklab, var(--color-accent), transparent 95%);
    transform: translateY(-1px);
  }

  .ack-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .ack-name {
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 响应式设计 - 致谢区域 */
  @media (max-width: 768px) {
    .acknowledgments-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .acknowledgment-link {
      flex: none;
    }
  }

  @media (max-width: 480px) {
    .acknowledgments-grid {
      grid-template-columns: 1fr;
    }
  }




</style>
