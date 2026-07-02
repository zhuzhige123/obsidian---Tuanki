<script lang="ts">
  import FloatingMenu from '../ui/FloatingMenu.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import {
    getInspirationModalContent,
    type InspirationModalTabId,
  } from './inspiration-card-syntax-content';
  import { currentLanguage } from '../../utils/i18n';

  interface Props {
    visible: boolean;
    anchorEl?: HTMLElement | null;
    onClose: () => void;
  }

  let { visible, anchorEl = null, onClose }: Props = $props();

  const popoverTitleId = 'weave-inspiration-popover-title';
  const tabListId = 'weave-inspiration-tablist';

  let activeTab = $state<InspirationModalTabId>('attribution');

  const inspirationContent = $derived.by(() => {
    void $currentLanguage;
    return getInspirationModalContent();
  });

  const inspirationSections = $derived(inspirationContent.sections);
  const inspirationModalTabs = $derived(inspirationContent.tabs);

  const activeSyntaxTutorial = $derived(
    activeTab === 'attribution' ? null : inspirationContent.tutorials[activeTab]
  );

  const modalHeading = $derived(
    activeTab === 'attribution'
      ? inspirationContent.modalHeadings.attributionTitle
      : inspirationContent.modalHeadings.syntaxTitle
  );

  const modalKicker = $derived(
    activeTab === 'attribution'
      ? inspirationContent.modalHeadings.attributionKicker
      : inspirationContent.modalHeadings.syntaxKicker
  );

  function selectTab(tabId: InspirationModalTabId): void {
    activeTab = tabId;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!visible) return;
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<FloatingMenu
  show={visible}
  anchor={anchorEl}
  placement="bottom-end"
  offset={10}
  onClose={onClose}
  role="dialog"
  ariaLabelledby={popoverTitleId}
  class="weave-inspiration-popover"
>
  <div class="weave-inspiration-popover__header">
    <div class="weave-inspiration-popover__heading">
      <span class="weave-inspiration-popover__kicker">{modalKicker}</span>
      <h2 id={popoverTitleId}>{modalHeading}</h2>
    </div>

    <button
      type="button"
      class="weave-inspiration-popover__close"
      onclick={onClose}
      aria-label={inspirationContent.aria.close}
    >
      <ObsidianIcon name="x" size={16} />
    </button>
  </div>

  <div
    id={tabListId}
    class="weave-inspiration-tabs weave-toolbar-tabs"
    role="tablist"
    aria-label={inspirationContent.aria.tablist}
  >
    {#each inspirationModalTabs as tab (tab.id)}
      <button
        type="button"
        role="tab"
        class="weave-toolbar-tab weave-inspiration-tab"
        class:active={activeTab === tab.id}
        aria-selected={activeTab === tab.id}
        aria-controls="weave-inspiration-panel"
        onclick={() => selectTab(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div
    id="weave-inspiration-panel"
    class="weave-inspiration-popover__body"
    role="tabpanel"
    aria-labelledby={tabListId}
  >
    {#if activeTab === 'attribution'}
      {#each inspirationSections as section}
        <section class="weave-inspiration-section">
          <div class="weave-inspiration-section-heading">
            <h3>{section.title}</h3>
            <p>{section.intro}</p>
          </div>

          <div class="weave-inspiration-list">
            {#each section.items as item}
              <article class="weave-inspiration-card">
                <p class="weave-inspiration-statement">
                  <span class="weave-inspiration-statement__text">{item.statement}</span>
                  <span class="weave-inspiration-category-tag">#{item.categoryTag}</span>
                </p>

                {#if item.note}
                  <p class="weave-inspiration-note">{item.note}</p>
                {/if}

                {#if item.links?.length}
                  <div class="weave-inspiration-links">
                    {#each item.links as link}
                      <a href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    {/each}
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        </section>
      {/each}
    {:else if activeSyntaxTutorial}
      <section class="weave-inspiration-syntax">
        <p class="weave-inspiration-syntax-intro">{activeSyntaxTutorial.intro}</p>

        <ul class="weave-inspiration-syntax-rules">
          {#each activeSyntaxTutorial.rules as rule}
            <li>{rule}</li>
          {/each}
        </ul>

        {#each activeSyntaxTutorial.syntaxBlocks as block}
          <div class="weave-inspiration-code-block">
            <h4>{block.title}</h4>
            <pre><code>{block.code}</code></pre>
          </div>
        {/each}

        <div class="weave-inspiration-code-block weave-inspiration-code-block--example">
          <h4>{activeSyntaxTutorial.example.title}</h4>
          <pre><code>{activeSyntaxTutorial.example.code}</code></pre>
        </div>
      </section>
    {/if}
  </div>
</FloatingMenu>

<style>
  :global(.floating-menu.weave-inspiration-popover) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: min(800px, calc(100vw - 24px));
    min-width: min(360px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: min(82vh, 900px);
    padding: 0;
    border-radius: 16px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    box-shadow: var(--shadow-l);
  }

  .weave-inspiration-popover__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 20px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .weave-inspiration-popover__heading {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .weave-inspiration-popover__kicker {
    font-size: var(--font-ui-smaller);
    line-height: 1;
    letter-spacing: 0.06em;
    font-weight: var(--font-semibold);
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .weave-inspiration-popover__heading h2 {
    margin: 0;
    font-size: var(--font-ui-large);
    line-height: 1.3;
    font-weight: 600;
    color: var(--text-normal);
  }

  .weave-inspiration-popover__close {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-s);
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .weave-inspiration-popover__close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .weave-inspiration-tabs {
    flex-shrink: 0;
    padding: 8px 16px 0;
    border-bottom: 1px solid var(--background-modifier-border);
    gap: 4px;
  }

  .weave-inspiration-tab.active {
    color: var(--text-normal);
    font-weight: 600;
  }

  .weave-inspiration-popover__body {
    flex: 1;
    overflow: auto;
    padding: 16px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .weave-inspiration-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .weave-inspiration-section-heading {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .weave-inspiration-section-heading h3 {
    margin: 0;
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
  }

  .weave-inspiration-section-heading p {
    margin: 0;
    font-size: var(--font-ui-smaller);
    line-height: var(--line-height-normal);
    color: var(--text-muted);
  }

  .weave-inspiration-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .weave-inspiration-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border-radius: var(--radius-m);
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .weave-inspiration-statement {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 8px;
    font-size: var(--font-ui-medium, 0.9375rem);
    line-height: 1.55;
    font-weight: 500;
    color: var(--text-normal);
  }

  .weave-inspiration-statement__text {
    flex: 1 1 auto;
    min-width: 12rem;
  }

  .weave-inspiration-category-tag {
    flex: 0 0 auto;
    font-size: var(--font-ui-smaller);
    line-height: 1.2;
    font-weight: var(--font-normal);
    color: var(--text-faint);
    white-space: nowrap;
  }

  .weave-inspiration-note {
    margin: 0;
    font-size: var(--font-ui-smaller);
    line-height: var(--line-height-normal);
    color: var(--text-muted);
  }

  .weave-inspiration-links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }

  .weave-inspiration-links a {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 8px;
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-accent);
    border: 1px solid var(--background-modifier-border);
    text-decoration: none;
    font-size: var(--font-ui-smaller);
    font-weight: 500;
  }

  .weave-inspiration-links a:hover {
    background: var(--background-modifier-hover);
    color: var(--text-accent-hover, var(--text-accent));
  }

  .weave-inspiration-syntax {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .weave-inspiration-syntax-intro {
    margin: 0;
    font-size: var(--font-ui-medium, 0.9375rem);
    line-height: 1.6;
    color: var(--text-normal);
  }

  .weave-inspiration-syntax-rules {
    margin: 0;
    padding-left: 1.2rem;
    font-size: var(--font-ui-smaller);
    line-height: 1.65;
    color: var(--text-muted);
  }

  .weave-inspiration-syntax-rules li + li {
    margin-top: 4px;
  }

  .weave-inspiration-code-block h4 {
    margin: 0 0 6px;
    font-size: var(--font-ui-smaller);
    font-weight: 600;
    color: var(--text-muted);
  }

  .weave-inspiration-code-block pre {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius-m);
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    overflow: auto;
  }

  .weave-inspiration-code-block code {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
    line-height: 1.6;
    color: var(--text-normal);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .weave-inspiration-code-block--example pre {
    border-color: color-mix(in srgb, var(--interactive-accent) 35%, var(--background-modifier-border));
  }

  @media (max-width: 900px) {
    :global(.floating-menu.weave-inspiration-popover) {
      width: calc(100vw - 16px);
      min-width: calc(100vw - 16px);
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      border-radius: 12px;
    }

    .weave-inspiration-popover__header,
    .weave-inspiration-tabs,
    .weave-inspiration-popover__body {
      padding-left: 16px;
      padding-right: 16px;
    }

    .weave-inspiration-tabs {
      padding-top: 8px;
    }
  }
</style>
