<script lang="ts">
  /**
   * 激活提示模态框
   * 引导用户前往设置页面激活许可证
   */
  
  import { FEATURE_METADATA } from '../../services/premium/PremiumFeatureGuard';
  
  interface Props {
    /** 功能ID */
    featureId: string;
    /** 是否显示 */
    visible: boolean;
    /** 关闭回调 */
    onClose: () => void;
  }

  let { 
    featureId, 
    visible = false,
    onClose 
  }: Props = $props();

  // 获取功能元数据
  const metadata = $derived(FEATURE_METADATA[featureId] || {
    name: '高级功能',
    description: '此功能需要激活许可证',
    icon: '💎'
  });

  /**
   * 前往激活页面
   */
  function navigateToActivation() {
    // 触发设置页面打开（由父组件处理）
    // 这里通过自定义事件通知父组件
    window.dispatchEvent(new CustomEvent('tuanki:open-activation'));
    onClose();
  }

  /**
   * 点击遮罩层关闭
   */
  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if visible}
  <div 
    class="activation-prompt-overlay" 
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div 
      class="activation-prompt" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- 头部 -->
      <div class="prompt-header">
        <div class="header-content">
          <span class="feature-icon">{metadata.icon}</span>
          <h3 class="feature-name">{metadata.name}</h3>
        </div>
        <button 
          class="close-button" 
          onclick={onClose}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <!-- 内容 -->
      <div class="prompt-content">
        <p class="feature-description">{metadata.description}</p>
        
        <div class="info-box">
          <div class="info-icon">🔒</div>
          <div class="info-text">
            <p class="info-title">此功能需要激活许可证</p>
            <p class="info-subtitle">激活后即可解锁所有高级功能</p>
          </div>
        </div>

        <div class="benefits-list">
          <p class="benefits-title">激活高级版后，您将解锁：</p>
          <ul>
            <li>🎨 网格视图和看板视图</li>
            <li>🔄 Anki双向同步</li>
            <li>📊 完整统计分析</li>
            <li>🤖 AI智能助手</li>
            <li>📖 渐进性阅读</li>
            <li>✍️ Tuanki标注系统</li>
          </ul>
        </div>

        <!-- 购买链接 -->
        <div class="purchase-section">
          <p class="purchase-hint">还没有激活码？</p>
          <a 
            href="https://pay.ldxp.cn/item/ned9pw" 
            class="purchase-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            💎 获取激活码
          </a>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="prompt-actions">
        <button 
          class="btn-primary" 
          onclick={navigateToActivation}
        >
          前往激活
        </button>
        <button 
          class="btn-secondary" 
          onclick={onClose}
        >
          稍后再说
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* 遮罩层 */
  .activation-prompt-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
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
    font-size: 2rem;
    line-height: 1;
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
    font-size: 1.25rem;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
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
    font-size: 1.5rem;
    line-height: 1;
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
  }

  .benefits-list li::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 4px;
    margin-right: 0.5rem;
    background: var(--interactive-accent);
    border-radius: 50%;
    vertical-align: middle;
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

  /* 操作按钮 */
  .prompt-actions {
    display: flex;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .btn-primary,
  .btn-secondary {
    flex: 1;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .activation-prompt {
      width: 95%;
      max-height: 90vh;
    }

    .prompt-header,
    .prompt-content,
    .prompt-actions {
      padding: 1.25rem;
    }

    .feature-name {
      font-size: 1.1rem;
    }

    .prompt-actions {
      flex-direction: column;
    }
  }
</style>

