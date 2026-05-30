<script lang="ts">
  import { Notice } from 'obsidian';
  import { PRODUCT_INFO, getAcknowledgments } from '../constants/settings-constants';
  import { ACTIVATION_HELP_TEXT } from '../constants/activation-constants';
  import { CoffeeSupportModal } from './CoffeeSupportModal';
  import coffeeSupportQrImage from '../../../icons/coffee-support-qr.png';
  import { tr } from '../../../utils/i18n';
  import { formatVersion } from '../../../utils/format-utils';

  interface Props {
    compact?: boolean;
    plugin?: any;
  }

  let { compact = false, plugin }: Props = $props();

  let t = $derived($tr);

  let acknowledgments = $derived(getAcknowledgments());
  let productVersion = $derived(
    plugin?.manifest?.version ? formatVersion(plugin.manifest.version) : PRODUCT_INFO.VERSION
  );

  function openCoffeeSupportModal() {
    if (!plugin?.app) {
      new Notice(t('about.coffeeModal.unavailable'));
      return;
    }

    const imageSrc = coffeeSupportQrImage;
    if (!imageSrc) {
      new Notice(t('about.coffeeModal.unavailable'));
      return;
    }

    new CoffeeSupportModal(plugin.app, {
      imageSrc,
      title: t('about.coffeeModal.title'),
      loadingText: t('about.coffeeModal.loading'),
      errorText: t('about.coffeeModal.error'),
      errorNotice: t('about.coffeeModal.errorNotice'),
      caption: t('about.coffeeModal.caption')
    }).open();
  }

  let baseInfoItems = $derived([
    {
      label: t('about.product.version'),
      value: productVersion
    },
    {
      label: t('about.product.algorithm'),
      value: t('about.product.algorithmValue')
    },
    {
      label: t('about.product.platform'),
      value: t('about.product.platformValue')
    },
    {
      label: t('about.product.developer'),
      value: t('about.product.developerValue')
    }
  ]);
</script>

<div class="weave-settings settings-section product-info-section" class:compact>
  <div class="section-header">
    <div class="header-content">
      <div class="product-logo">
        <div class="logo-icon" aria-hidden="true">🎴</div>
        <div class="logo-text">
          <h2 class="product-title">Weave</h2>
          <p class="product-tagline">{t('about.product.description')}</p>
        </div>
      </div>
    </div>
  </div>

  <div class="settings-group base-info-card">
    <div class="base-info-header">
      <h3 class="group-title with-accent-bar accent-cyan base-info-title">{t('about.product.baseInfoTitle')}</h3>
    </div>

    <div class="base-info-list">
      {#each baseInfoItems as item, index}
        <div class="base-info-row" class:base-info-row-divider={index < baseInfoItems.length - 1}>
          <div class="base-info-label">{item.label}</div>
          <div class="base-info-value">{item.value}</div>
        </div>
      {/each}
    </div>
  </div>

  <div class="settings-group acknowledgments-section">
    <h3 class="group-title with-accent-bar accent-purple acknowledgments-title">{t('about.acknowledgments.title')}</h3>
    <div class="acknowledgments-grid">
      {#each acknowledgments as item}
        <a
          href={item.url}
          target={item.url ? '_blank' : undefined}
          rel={item.url ? 'noopener noreferrer' : undefined}
          class="acknowledgment-card"
          title={item.description}
        >
          <div class="ack-name">{item.name}</div>
          <div class="ack-description">{item.description}</div>
        </a>
      {/each}
    </div>
  </div>

  <div class="quick-links">
    <a
      href="https://iwi05cktlph.feishu.cn/wiki/space/7602663447460891839?ccm_open_type=lark_wiki_spaceLink&open_tab_from=wiki_home"
      target="_blank"
      rel="noopener noreferrer"
      class="quick-link"
    >
      <span class="link-text">{t('about.quickLinks.documentation')}</span>
    </a>
    <a
      href={`${ACTIVATION_HELP_TEXT.CONTACT_INFO.github}/releases`}
      target="_blank"
      rel="noopener noreferrer"
      class="quick-link"
    >
      <span class="link-text">{t('about.quickLinks.changelog')}</span>
    </a>
    <a
      href={`mailto:${ACTIVATION_HELP_TEXT.CONTACT_INFO.email}?subject=${ACTIVATION_HELP_TEXT.CONTACT_INFO.subject}`}
      class="quick-link"
    >
      <span class="link-text">{t('about.quickLinks.support')}</span>
    </a>
    <button type="button" class="quick-link quick-link-button" onclick={openCoffeeSupportModal}>
      <span class="link-text">{t('about.quickLinks.coffee')}</span>
    </button>
  </div>

</div>

<style>
  .product-info-section {
    position: relative;
    overflow: hidden;
  }

  .product-info-section.compact {
    gap: 0.85rem;
  }

  .section-header {
    padding: 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 18px;
    background: color-mix(in oklab, var(--background-primary), var(--background-secondary) 26%);
  }

  .header-content {
    display: flex;
    justify-content: flex-start;
  }

  .product-logo {
    display: flex;
    align-items: flex-start;
    gap: 1.25rem;
    width: 100%;
    max-width: 56rem;
  }

  .logo-icon {
    font-size: 4.5rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 5rem;
    height: 5rem;
    flex-shrink: 0;
  }

  .logo-text {
    text-align: left;
    padding-top: 0.125rem;
    flex: 1;
    min-width: 0;
  }

  .product-title {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-blue) 100%);
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
    line-height: 1.7;
    max-width: 42rem;
  }

  .base-info-card {
    margin-bottom: 0;
  }

  .base-info-header {
    display: flex;
    align-items: center;
    margin-bottom: 0.4rem;
  }

  .base-info-title {
    font-weight: 600;
  }

  .base-info-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .base-info-row {
    display: grid;
    grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr);
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.25rem;
    background: var(--background-secondary);
    border-radius: 14px;
  }

  .base-info-row-divider {
    border-bottom: none;
  }

  .base-info-label {
    font-size: 0.875rem;
    color: var(--text-muted);
    min-width: 0;
  }

  .base-info-value {
    font-size: 0.95rem;
    color: var(--text-normal);
    font-weight: 600;
    text-align: right;
    word-break: break-word;
  }

  .quick-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
    margin: 0.25rem 0 0;
    padding: 0 0.25rem;
    width: 100%;
  }

  .quick-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--background-secondary);
    border: none;
    border-radius: 14px;
    color: var(--text-normal);
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 2.875rem;
    cursor: pointer;
    font: inherit;
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
    box-shadow: none;
  }

  .quick-link:hover {
    border-color: var(--color-accent);
    background: color-mix(in oklab, var(--color-accent), transparent 95%);
    transform: translateY(-1px);
  }

  .quick-link:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .quick-link-button {
    margin: 0;
  }

  .link-text {
    font-size: 0.875rem;
  }

  .acknowledgments-section {
    margin: 0;
  }

  .acknowledgments-title {
    margin: 0 0 0.4rem 0;
    text-align: left;
  }

  .acknowledgments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
    width: 100%;
  }

  .acknowledgment-card {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem 1.1rem;
    background: var(--background-secondary);
    border: none;
    border-radius: 14px;
    color: var(--text-normal);
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .acknowledgment-card:hover {
    border-color: var(--color-accent);
    background: color-mix(in oklab, var(--color-accent), transparent 96%);
    transform: translateY(-1px);
  }

  .ack-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .ack-description {
    font-size: 0.84rem;
    line-height: 1.6;
    color: var(--text-muted);
  }

  @media (max-width: 768px) {
    .product-logo {
      flex-direction: column;
      gap: 0.9rem;
    }

    .logo-icon {
      font-size: 3.75rem;
      width: 4.25rem;
      height: 4.25rem;
    }

    .product-title {
      font-size: 1.75rem;
    }

    .base-info-row {
      grid-template-columns: 1fr;
      gap: 0.375rem;
      padding: 0.9rem 1rem;
    }

    .base-info-value {
      text-align: left;
    }

    .quick-links {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .quick-link {
      flex: none;
    }

    .acknowledgments-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .section-header {
      padding: 0.9rem;
    }
  }

  @media (max-width: 480px) {
    .quick-links {
      grid-template-columns: 1fr;
    }
  }
</style>
