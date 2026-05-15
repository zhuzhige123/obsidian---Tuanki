<script lang="ts">
  /**
   * 激活提示模态框
   * 引导用户前往设置页面激活许可证
   */
  
  import { FEATURE_METADATA, PREMIUM_BENEFIT_FEATURE_ORDER } from '../../services/premium/PremiumFeatureGuard';
  
  // FontAwesome v5 SVG 图标定义
  const FA_ICONS: Record<string, string> = {
    // 网格视图
    'th-large': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M296 32h192c13.255 0 24 10.745 24 24v160c0 13.255-10.745 24-24 24H296c-13.255 0-24-10.745-24-24V56c0-13.255 10.745-24 24-24zm-272 0h192c13.255 0 24 10.745 24 24v160c0 13.255-10.745 24-24 24H24c-13.255 0-24-10.745-24-24V56c0-13.255 10.745-24 24-24zM0 296c0-13.255 10.745-24 24-24h192c13.255 0 24 10.745 24 24v160c0 13.255-10.745 24-24 24H24c-13.255 0-24-10.745-24-24V296zm272 0c0-13.255 10.745-24 24-24h192c13.255 0 24 10.745 24 24v160c0 13.255-10.745 24-24 24H296c-13.255 0-24-10.745-24-24V296z"/></svg>',
    // 看板视图
    'columns': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M464 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V80c0-26.51-21.49-48-48-48zM224 416H64V160h160v256zm224 0H288V160h160v256z"/></svg>',
    // 时间线视图
    'history': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8c66.97 0 127.78 26.5 172.67 69.67l35.15-35.15C478.82 27.51 504 38.14 504 59.31V176c0 13.25-10.75 24-24 24H363.31c-21.38 0-32.09-25.85-16.97-40.97l37.11-37.11C349.03 92.28 304.77 72 256 72c-101.69 0-184 82.31-184 184s82.31 184 184 184 184-82.31 184-184c0-13.25 10.75-24 24-24s24 10.75 24 24zM232 128c0-13.255 10.745-24 24-24s24 10.745 24 24v103.059l56.971 56.97c9.372 9.373 9.372 24.569 0 33.941-9.373 9.372-24.569 9.372-33.941 0l-64-64A24 24 0 0 1 232 241.059V128z"/></svg>',
    // 牌组分析
    'chart-bar': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M332.8 320h38.4c6.4 0 12.8-6.4 12.8-12.8V172.8c0-6.4-6.4-12.8-12.8-12.8h-38.4c-6.4 0-12.8 6.4-12.8 12.8v134.4c0 6.4 6.4 12.8 12.8 12.8zm96 0h38.4c6.4 0 12.8-6.4 12.8-12.8V76.8c0-6.4-6.4-12.8-12.8-12.8h-38.4c-6.4 0-12.8 6.4-12.8 12.8v230.4c0 6.4 6.4 12.8 12.8 12.8zm-288 0h38.4c6.4 0 12.8-6.4 12.8-12.8v-70.4c0-6.4-6.4-12.8-12.8-12.8h-38.4c-6.4 0-12.8 6.4-12.8 12.8v70.4c0 6.4 6.4 12.8 12.8 12.8zm96 0h38.4c6.4 0 12.8-6.4 12.8-12.8V108.8c0-6.4-6.4-12.8-12.8-12.8h-38.4c-6.4 0-12.8 6.4-12.8 12.8v198.4c0 6.4 6.4 12.8 12.8 12.8zM496 384H64V80c0-8.84-7.16-16-16-16H16C7.16 64 0 71.16 0 80v336c0 17.67 14.33 32 32 32h464c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16z"/></svg>',
    // AI助手
    'robot': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="currentColor"><path d="M32 224h32v192H32a32 32 0 0 1-32-32V256a32 32 0 0 1 32-32zm512-48v272a64 64 0 0 1-64 64H160a64 64 0 0 1-64-64V176a79.974 79.974 0 0 1 80-80h112V32a32 32 0 0 1 64 0v64h112a79.974 79.974 0 0 1 80 80zm-280 80a40 40 0 1 0-40 40 39.997 39.997 0 0 0 40-40zm-8 128h-64v32h64zm96 0h-64v32h64zm104-128a40 40 0 1 0-40 40 39.997 39.997 0 0 0 40-40zm-8 128h-64v32h64zm192-128v128a32 32 0 0 1-32 32h-32V224h32a32 32 0 0 1 32 32z"/></svg>',
    // 增量阅读
    'book-reader': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M352 96c0-53.02-42.98-96-96-96s-96 42.98-96 96 42.98 96 96 96 96-42.98 96-96zM233.59 241.1c-59.33-36.32-155.43-46.3-203.79-49.05C13.55 191.13 0 203.51 0 219.14v222.8c0 14.33 11.59 26.28 26.49 27.05 43.66 2.29 131.99 10.68 193.04 41.43 9.37 4.72 20.48-1.71 20.48-12.26V252.78c-.01-4.67-2.45-8.96-6.42-11.68zm248.61-49.05c-48.35 2.74-144.46 12.73-203.78 49.05-3.97 2.72-6.41 7.01-6.41 11.68v245.38c0 10.55 11.11 16.98 20.48 12.26 61.05-30.75 149.37-39.14 193.04-41.43 14.9-.78 26.49-12.73 26.49-27.06V219.14c-.02-15.63-13.56-28.01-29.82-27.09z"/></svg>',
    // 涌现牌组
    'sparkles': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M324.3 330.7c-31.96 9.54-57.46 35.03-67 67-1.75 5.86-10.05 5.86-11.8 0-9.54-31.97-35.03-57.46-67-67-5.86-1.75-5.86-10.05 0-11.8 31.97-9.54 57.46-35.03 67-67 1.75-5.86 10.05-5.86 11.8 0 9.54 31.97 35.04 57.46 67 67 5.86 1.75 5.86 10.05 0 11.8zM208 96l12.14 38.86L259 147l-38.86 12.14L208 198l-12.14-38.86L157 147l38.86-12.14L208 96zm208 96l18.2 58.8L493 269l-58.8 18.2L416 346l-18.2-58.8L339 269l58.8-18.2L416 192z"/></svg>',
    // 批量解析
    'sync-alt': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M370.72 133.28C339.458 104.008 298.888 87.962 255.848 88c-77.458.068-144.328 53.178-162.791 126.85-1.344 5.363-6.122 9.15-11.651 9.15H24.103c-7.498 0-13.194-6.807-11.807-14.176C33.933 94.924 134.813 8 256 8c66.448 0 126.791 26.136 171.315 68.685L463.03 40.97C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.749zM32 296h134.059c21.382 0 32.09 25.851 16.971 40.971l-41.75 41.75c31.262 29.273 71.835 45.319 114.876 45.28 77.418-.07 144.315-53.144 162.787-126.849 1.344-5.363 6.122-9.15 11.651-9.15h57.304c7.498 0 13.194 6.807 11.807 14.176C478.067 417.076 377.187 504 256 504c-66.448 0-126.791-26.136-171.315-68.685L48.97 471.03C33.851 486.149 8 475.441 8 454.059V320c0-13.255 10.745-24 24-24z"/></svg>',
    // 题库系统
    'clipboard-list': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor"><path d="M336 64h-80c0-35.3-28.7-64-64-64s-64 28.7-64 64H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48zM96 424c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24-10.7 24-24 24zm0-96c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24-10.7 24-24 24zm0-96c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24-10.7 24-24 24zm96-192c13.3 0 24 10.7 24 24s-10.7 24-24 24-24-10.7-24-24 10.7-24 24-24zm128 368c0 4.4-3.6 8-8 8H168c-4.4 0-8-3.6-8-8v-16c0-4.4 3.6-8 8-8h144c4.4 0 8 3.6 8 8v16zm0-96c0 4.4-3.6 8-8 8H168c-4.4 0-8-3.6-8-8v-16c0-4.4 3.6-8 8-8h144c4.4 0 8 3.6 8 8v16zm0-96c0 4.4-3.6 8-8 8H168c-4.4 0-8-3.6-8-8v-16c0-4.4 3.6-8 8-8h144c4.4 0 8 3.6 8 8v16z"/></svg>',
    // 锁定图标
    'lock': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M400 224h-24v-72C376 68.2 307.8 0 224 0S72 68.2 72 152v72H48c-26.5 0-48 21.5-48 48v192c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V272c0-26.5-21.5-48-48-48zm-104 0H152v-72c0-39.7 32.3-72 72-72s72 32.3 72 72v72z"/></svg>',
    // 关闭图标
    'times': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512" fill="currentColor"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>',
    // 钻石图标
    'gem': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor"><path d="M485.5 0L576 160H474.9L405.7 0h79.8zm-128 0l69.2 160H149.3L218.5 0h139zm-267 0h79.8l-69.2 160H0L90.5 0zM0 192h100.7l123 251.7c1.5 3.1-2.7 5.9-5 3.3L0 192zm148.2 0h279.6l-137 318.2c-1 2.4-4.5 2.4-5.5 0L148.2 192zm204.1 251.7l123-251.7H576L357.3 446.9c-2.3 2.7-6.5-.1-5-3.2z"/></svg>',
    // 渐进式挖空
    'layers': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M256 0L0 128l256 128 256-128L256 0zm0 288L0 160v96l256 128 256-128v-96L256 288zm0 160L0 320v64l256 128 256-128v-64L256 448z"/></svg>',
    // 默认图标
    'star': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor"><path d="M259.3 17.8L194 150.2 47.9 171.5c-26.2 3.8-36.7 36.1-17.7 54.6l105.7 103-25 145.5c-4.5 26.3 23.2 46 46.4 33.7L288 439.6l130.7 68.7c23.2 12.2 50.9-7.4 46.4-33.7l-25-145.5 105.7-103c19-18.5 8.5-50.8-17.7-54.6L382 150.2 316.7 17.8c-11.7-23.6-45.6-23.9-57.4 0z"/></svg>'
  };
  
  // 获取图标SVG
  function getIconSvg(iconName: string): string {
    return FA_ICONS[iconName] || FA_ICONS['star'];
  }
  
  interface Props {
    /** 功能ID */
    featureId: string;
    /** 是否显示 */
    visible: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 是否嵌入模式（不显示遮罩层，直接嵌入页面） */
    embedded?: boolean;
  }

  let { 
    featureId, 
    visible = false,
    onClose,
    embedded = false
  }: Props = $props();

  // 获取功能元数据
  const metadata = $derived(FEATURE_METADATA[featureId] || {
    name: '高级功能',
    description: '此功能需要激活许可证',
    icon: 'star'
  });

  const benefitFeatures = $derived(
    PREMIUM_BENEFIT_FEATURE_ORDER
      .map((id) => ({ id, ...FEATURE_METADATA[id] }))
      .filter((feature) => Boolean(feature.name))
  );


  /**
   * 点击遮罩层关闭
   */
  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if visible}
  {#if embedded}
    <!-- 嵌入模式：直接显示内容，无遮罩层 -->
    <div class="activation-prompt embedded">
      <div class="prompt-header">
        <div class="header-content">
          <span class="feature-icon">{@html getIconSvg(metadata.icon || 'star')}</span>
          <h3 class="feature-name">{metadata.name}</h3>
        </div>
      </div>

      <div class="prompt-content">
        <p class="feature-description">{metadata.description}</p>
        
        <div class="info-box">
          <div class="info-icon">{@html getIconSvg('lock')}</div>
          <div class="info-text">
            <p class="info-title">此功能需要激活许可证</p>
            <p class="info-subtitle">激活后即可解锁所有高级功能</p>
          </div>
        </div>

        <div class="benefits-list">
          <p class="benefits-title">激活高级版后，您将解锁：</p>
          <ul>
            {#each benefitFeatures as feature (feature.id)}
              <li><span class="benefit-icon">{@html getIconSvg(feature.icon || 'star')}</span> {feature.name}</li>
            {/each}
          </ul>
        </div>

        <div class="purchase-section">
          <p class="purchase-hint">还没有激活码？</p>
          <a 
            href="https://pay.ldxp.cn/item/ned9pw" 
            class="purchase-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="purchase-icon">{@html getIconSvg('gem')}</span> 获取激活码
          </a>
        </div>
      </div>
    </div>
  {:else}
    <div 
      class="activation-prompt-overlay" 
      onclick={handleOverlayClick}
      onkeydown={handleOverlayKeydown}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div 
        class="activation-prompt"
      >
        <div class="prompt-header">
          <div class="header-content">
            <span class="feature-icon">{@html getIconSvg(metadata.icon || 'star')}</span>
            <h3 class="feature-name">{metadata.name}</h3>
          </div>
          <button 
            class="close-button" 
            onclick={onClose}
            aria-label="关闭"
          >
            {@html getIconSvg('times')}
          </button>
        </div>

        <div class="prompt-content">
          <p class="feature-description">{metadata.description}</p>
          
          <div class="info-box">
            <div class="info-icon">{@html getIconSvg('lock')}</div>
            <div class="info-text">
              <p class="info-title">此功能需要激活许可证</p>
              <p class="info-subtitle">激活后即可解锁所有高级功能</p>
            </div>
          </div>

          <div class="benefits-list">
            <p class="benefits-title">激活高级版后，您将解锁：</p>
            <ul>
              {#each benefitFeatures as feature (feature.id)}
                <li><span class="benefit-icon">{@html getIconSvg(feature.icon || 'star')}</span> {feature.name}</li>
              {/each}
            </ul>
          </div>

          <div class="purchase-section">
            <p class="purchase-hint">还没有激活码？</p>
            <a 
              href="https://pay.ldxp.cn/item/ned9pw" 
              class="purchase-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="purchase-icon">{@html getIconSvg('gem')}</span> 获取激活码
            </a>
          </div>
        </div>

      </div>
    </div>
  {/if}
{/if}

<style>
  /* 遮罩层 - 避免遮挡顶部导航栏 */
  .activation-prompt-overlay {
    position: fixed;
    top: 60px; /* 为顶部导航栏预留空间 */
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--weave-z-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 模态框 */
  .activation-prompt {
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* 头部 */
  .prompt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .feature-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    color: var(--interactive-accent);
  }
  
  .feature-icon :global(svg) {
    width: 2rem;
    height: 2rem;
  }

  .feature-name {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  
  .close-button :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .close-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 内容区域 */
  .prompt-content {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .feature-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.95rem;
    line-height: 1.5;
  }

  /* 信息框 */
  .info-box {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: color-mix(in oklab, var(--interactive-accent), transparent 90%);
    border: 1px solid color-mix(in oklab, var(--interactive-accent), transparent 80%);
    border-radius: 8px;
  }

  .info-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    color: var(--interactive-accent);
  }
  
  .info-icon :global(svg) {
    width: 1.5rem;
    height: 1.5rem;
  }

  .info-text {
    flex: 1;
  }

  .info-title {
    margin: 0 0 0.25rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .info-subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* 功能列表 */
  .benefits-list {
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  .benefits-title {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .benefits-list ul {
    margin: 0;
    padding-left: 1.5rem;
    list-style: none;
  }

  .benefits-list li {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .benefit-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--interactive-accent);
    flex-shrink: 0;
  }
  
  .benefit-icon :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  /* 购买链接 */
  .purchase-section {
    text-align: center;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px dashed var(--background-modifier-border);
  }

  .purchase-hint {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .purchase-link {
    display: inline-block;
    padding: 0.5rem 1.25rem;
    background: linear-gradient(135deg, var(--interactive-accent), var(--interactive-accent-hover));
    color: var(--text-on-accent);
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .purchase-link:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .purchase-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    margin-right: 0.25rem;
  }
  
  .purchase-icon :global(svg) {
    width: 1rem;
    height: 1rem;
  }


  /* 嵌入模式样式 */
  .activation-prompt.embedded {
    width: 100%;
    max-width: 100%;
    max-height: none;
    margin: 1rem 0;
    box-shadow: none;
    animation: none;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .activation-prompt {
      width: 95%;
      max-height: 90vh;
    }

    .prompt-header,
    .prompt-content {
      padding: 1.25rem;
    }

    .feature-name {
      font-size: 1.1rem;
    }
  }
</style>
