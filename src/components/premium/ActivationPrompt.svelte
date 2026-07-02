<script lang="ts">
  /**
   * 激活提示模态框
   * 展示基础免费能力与高级功能说明
   */

  import {
    BASE_BENEFIT_FEATURE_ORDER,
    FREE_FEATURE_IDS,
    PREMIUM_BENEFIT_FEATURE_ORDER,
    resolveFeatureMetadata,
    toPremiumFeatureTranslationId,
  } from '../../services/premium/PremiumFeatureGuard';
  import { ACTIVATION_HELP_TEXT } from '../settings/constants/activation-constants';
  import { i18n, tr } from '../../utils/i18n';

  const PURCHASE_URL = ACTIVATION_HELP_TEXT.CONTACT_INFO.purchase;

  const CLOSE_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512" fill="currentColor" aria-hidden="true"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>';

  type BenefitTab = 'basic' | 'premium';

  function resolveFeatureTranslation(key: string, fallback: string): string {
    return i18n.hasTranslation(key) ? i18n.t(key) : fallback;
  }

  function mapBenefitFeatures(featureIds: readonly string[]) {
    return featureIds
      .map((id) => {
        const translationId = toPremiumFeatureTranslationId(id);
        const fallback = resolveFeatureMetadata(id);
        return {
          id,
          name: resolveFeatureTranslation(
            `premium.features.${translationId}.name`,
            fallback.name
          ),
          description: resolveFeatureTranslation(
            `premium.features.${translationId}.description`,
            fallback.description
          ),
        };
      })
      .filter((feature) => Boolean(feature.name));
  }

  interface Props {
    featureId: string;
    visible: boolean;
    onClose: () => void;
    embedded?: boolean;
  }

  let {
    featureId,
    visible = false,
    onClose,
    embedded = false,
  }: Props = $props();
  let t = $derived($tr);

  let activeBenefitTab = $state<BenefitTab>('premium');

  $effect(() => {
    if (!visible) {
      return;
    }
    activeBenefitTab = FREE_FEATURE_IDS.has(featureId) ? 'basic' : 'premium';
  });

  const metadata = $derived.by(() => {
    const translationId = toPremiumFeatureTranslationId(featureId);
    const fallback = resolveFeatureMetadata(featureId);
    return {
      name: resolveFeatureTranslation(
        `premium.features.${translationId}.name`,
        fallback.name || t('decks.activationPrompt.fallbackName')
      ),
      description: resolveFeatureTranslation(
        `premium.features.${translationId}.description`,
        fallback.description || t('decks.activationPrompt.fallbackDescription')
      ),
    };
  });

  const basicFeatures = $derived(mapBenefitFeatures(BASE_BENEFIT_FEATURE_ORDER));
  const premiumFeatures = $derived(mapBenefitFeatures(PREMIUM_BENEFIT_FEATURE_ORDER));

  const activeFeatures = $derived(activeBenefitTab === 'basic' ? basicFeatures : premiumFeatures);
  const activeListTitle = $derived(
    activeBenefitTab === 'basic'
      ? t('decks.activationPrompt.basicBenefitsTitle')
      : t('decks.activationPrompt.benefitsTitle')
  );

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

  function selectBenefitTab(tab: BenefitTab): void {
    activeBenefitTab = tab;
  }

  function formatBenefitIndex(index: number): string {
    return String(index + 1).padStart(2, '0');
  }
</script>

{#snippet benefitList()}
  <div class="benefits-panel">
    <p class="benefits-title">{activeListTitle}</p>
    <ul class="benefit-items" role="list">
      {#each activeFeatures as feature, index (feature.id)}
        <li class="benefit-item">
          <div class="benefit-heading">
            <span class="benefit-index" aria-hidden="true">{formatBenefitIndex(index)}</span>
            <span class="benefit-name">{feature.name}</span>
          </div>
          {#if feature.description}
            <span class="benefit-desc">{feature.description}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

{#snippet promptBody()}
  <div class="prompt-content">
    <div class="benefit-tabs" role="tablist">
      <button
        id="activation-tab-basic"
        type="button"
        class="benefit-tab"
        class:is-active={activeBenefitTab === 'basic'}
        role="tab"
        aria-selected={activeBenefitTab === 'basic'}
        onclick={() => selectBenefitTab('basic')}
      >
        {t('decks.activationPrompt.tabs.basic')}
      </button>
      <button
        id="activation-tab-premium"
        type="button"
        class="benefit-tab"
        class:is-active={activeBenefitTab === 'premium'}
        role="tab"
        aria-selected={activeBenefitTab === 'premium'}
        onclick={() => selectBenefitTab('premium')}
      >
        {t('decks.activationPrompt.tabs.premium')}
      </button>
    </div>

    <div
      role="tabpanel"
      aria-labelledby={activeBenefitTab === 'basic' ? 'activation-tab-basic' : 'activation-tab-premium'}
    >
      {@render benefitList()}
    </div>

    <footer class="purchase-footer">
      <span class="purchase-hint">{t('decks.activationPrompt.purchaseHint')}</span>
      <a
        class="purchase-link"
        href={PURCHASE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('decks.activationPrompt.purchaseLink')}
      </a>
    </footer>
  </div>
{/snippet}

{#snippet promptHeader(showClose: boolean)}
  <div class="prompt-header">
    <div class="header-content">
      <h3 class="prompt-title with-accent-bar accent-purple">{metadata.name}</h3>
      <p class="feature-description">{metadata.description}</p>
    </div>
    {#if showClose}
      <button
        class="close-button clickable-icon"
        onclick={onClose}
        aria-label={t('decks.activationPrompt.close')}
      >
        {@html CLOSE_ICON}
      </button>
    {/if}
  </div>
{/snippet}

{#if visible}
  {#if embedded}
    <div class="activation-prompt embedded">
      {@render promptHeader(false)}
      {@render promptBody()}
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
      <div class="activation-prompt">
        {@render promptHeader(true)}
        {@render promptBody()}
      </div>
    </div>
  {/if}
{/if}

<style>
  .activation-prompt-overlay {
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--weave-z-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-modifier-cover, rgba(0, 0, 0, 0.5));
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

  .activation-prompt {
    --activation-prompt-gap-sm: 0.35rem;
    --activation-prompt-gap-md: 0.75rem;
    --activation-prompt-gap-lg: 1rem;
    --activation-prompt-font-title: var(--font-ui-medium, 1rem);
    --activation-prompt-font-desc: var(--font-ui-smaller, 0.85rem);
    width: 90%;
    max-width: 560px;
    max-height: 80vh;
    overflow-y: auto;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-l, 12px);
    box-shadow: var(--shadow-s, 0 8px 32px rgba(0, 0, 0, 0.2));
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

  .prompt-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--activation-prompt-gap-lg);
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .header-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--activation-prompt-gap-sm);
  }

  .prompt-title {
    margin: 0;
    font-size: var(--activation-prompt-font-title);
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .prompt-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .prompt-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: var(--radius-s, 2px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--interactive-accent) 82%, white 18%),
      color-mix(in srgb, var(--interactive-accent) 68%, black 8%)
    );
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
    border-radius: var(--radius-s, 4px);
    transition: color 0.15s ease, background 0.15s ease;
    flex-shrink: 0;
  }

  .close-button :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .close-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .prompt-content {
    padding: 1.25rem 1.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: var(--activation-prompt-gap-lg);
    background: var(--background-primary);
  }

  .feature-description {
    margin: 0;
    padding-left: 16px;
    color: var(--text-muted);
    font-size: var(--activation-prompt-font-desc);
    line-height: 1.55;
  }

  .benefit-tabs {
    display: flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m, 8px);
    background: var(--background-modifier-form-field, var(--background-secondary));
  }

  .benefit-tab {
    flex: 1;
    min-height: 2rem;
    padding: 0.35rem 0.75rem;
    border: none;
    border-radius: calc(var(--radius-m, 8px) - 3px);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--activation-prompt-font-desc);
    font-weight: 500;
    line-height: 1.35;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .benefit-tab:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .benefit-tab.is-active {
    background: var(--background-primary);
    color: var(--text-normal);
    box-shadow: var(--shadow-s, 0 1px 2px rgba(0, 0, 0, 0.12));
  }

  .benefit-tab:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 1px;
  }

  .benefits-panel {
    padding: var(--activation-prompt-gap-lg);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m, 8px);
    background: var(--background-secondary);
  }

  .benefits-title {
    margin: 0 0 var(--activation-prompt-gap-md) 0;
    font-size: var(--activation-prompt-font-desc);
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .benefit-items {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }

  .benefit-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--activation-prompt-gap-sm);
    padding: 0.85rem 0;
    border-top: 1px solid var(--background-modifier-border-hover, var(--background-modifier-border));
  }

  .benefit-heading {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
    min-width: 0;
  }

  .benefit-index {
    flex-shrink: 0;
    min-width: 1.35rem;
    font-size: var(--activation-prompt-font-desc);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-faint, var(--text-muted));
    line-height: 1.4;
  }

  .benefit-name {
    display: block;
    flex: 1;
    min-width: 0;
    font-size: var(--font-ui-small, 0.95rem);
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .benefit-desc {
    display: block;
    padding-left: calc(1.35rem + 0.65rem);
    font-size: var(--activation-prompt-font-desc);
    font-weight: 400;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .benefit-items .benefit-item:first-child {
    border-top: none;
    padding-top: 0;
  }

  .benefit-items .benefit-item:last-child {
    padding-bottom: 0;
  }

  .purchase-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.35rem 0.5rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--background-modifier-border);
    text-align: center;
  }

  .purchase-hint {
    font-size: var(--activation-prompt-font-desc);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .purchase-link {
    font-size: var(--activation-prompt-font-desc);
    font-weight: 600;
    color: var(--text-accent, var(--interactive-accent));
    text-decoration: none;
    line-height: 1.5;
    transition: color 0.15s ease;
  }

  .purchase-link:hover {
    color: var(--text-accent-hover, var(--interactive-accent-hover, var(--interactive-accent)));
    text-decoration: underline;
  }

  .purchase-link:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-radius: var(--radius-s, 4px);
  }

  .activation-prompt.embedded {
    width: 100%;
    max-width: 100%;
    max-height: none;
    margin: 1rem 0;
    box-shadow: none;
    animation: none;
  }

  @media (max-width: 768px) {
    .activation-prompt {
      width: 95%;
      max-height: 90vh;
    }

    .prompt-header,
    .prompt-content {
      padding-left: 1.25rem;
      padding-right: 1.25rem;
    }
  }
</style>
