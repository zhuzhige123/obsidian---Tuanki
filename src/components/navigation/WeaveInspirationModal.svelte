<script lang="ts">
  import { setIcon } from 'obsidian';
  import { onDestroy } from 'svelte';
  import {
    getInspirationModalContent,
    type InspirationModalTabId,
  } from './inspiration-card-syntax-content';
  import { currentLanguage } from '../../utils/i18n';

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();

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

  function selectTab(tabId: InspirationModalTabId): void {
    activeTab = tabId;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!visible) return;
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function icon(node: HTMLElement, name: string) {
    setIcon(node, name);
    return {
      update(newName: string) {
        node.replaceChildren();
        setIcon(node, newName);
      },
    };
  }

  function portalToBody(node: HTMLDivElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  $effect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  onDestroy(() => {
    document.body.style.overflow = '';
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if visible}
  <div class="weave-tutorial-portal" use:portalToBody>
    <div
      class="weave-tutorial-overlay"
      onclick={onClose}
      onkeydown={(event) => event.key === 'Escape' && onClose()}
      role="button"
      tabindex="0"
      aria-label={inspirationContent.aria.close}
    ></div>

    <div
      class="weave-tutorial-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={popoverTitleId}
    >
      <div class="weave-tutorial-header">
        <div class="weave-tutorial-title-wrap">
          <span id={popoverTitleId} class="weave-tutorial-title-text">
            {inspirationContent.modalTitle}
          </span>
        </div>
        <button
          type="button"
          class="clickable-icon weave-tutorial-close"
          onclick={onClose}
          aria-label={inspirationContent.aria.close}
        >
          <span use:icon={'x'}></span>
        </button>
      </div>

      <div
        id={tabListId}
        class="weave-tutorial-tabs"
        role="tablist"
        aria-label={inspirationContent.aria.tablist}
      >
        {#each inspirationModalTabs as tab (tab.id)}
          <button
            type="button"
            role="tab"
            class="clickable-icon"
            class:active={activeTab === tab.id}
            aria-selected={activeTab === tab.id}
            aria-controls="weave-inspiration-panel"
            onclick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <div class="weave-tutorial-scroll">
        <div
          id="weave-inspiration-panel"
          class="weave-tutorial-body"
          role="tabpanel"
          aria-labelledby={tabListId}
        >
          {#if activeTab === 'attribution'}
            {#each inspirationSections as section, sectionIndex (section.title)}
              <div class="weave-tut-section">
                <div class="weave-tut-title">
                  <span class="weave-tut-title-text">{section.title}</span>
                </div>
                <div class="weave-tut-text">
                  <p>{section.intro}</p>
                  {#each section.items as item (item.statement)}
                    <h4>
                      {item.statement}
                      <span class="weave-tut-tag"> #{item.categoryTag}</span>
                    </h4>
                    {#if item.note}
                      <p>{item.note}</p>
                    {/if}
                    {#if item.links?.length}
                      <div class="weave-tut-link-list">
                        {#each item.links as link (link.href)}
                          <p>
                            <a href={link.href} target="_blank" rel="noopener noreferrer">
                              {link.label}
                            </a>
                          </p>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>

              {#if sectionIndex < inspirationSections.length - 1}
                <div class="weave-tut-divider"></div>
              {/if}
            {/each}
          {:else if activeSyntaxTutorial}
            <div class="weave-tut-section">
              <div class="weave-tut-title">
                <span class="weave-tut-title-text">{inspirationContent.modalHeadings.syntaxKicker}</span>
              </div>
              <div class="weave-tut-text">
                <p>{activeSyntaxTutorial.intro}</p>
                <ul>
                  {#each activeSyntaxTutorial.rules as rule (rule)}
                    <li>{rule}</li>
                  {/each}
                </ul>
              </div>
            </div>

            <div class="weave-tut-divider"></div>

            {#each activeSyntaxTutorial.syntaxBlocks as block, blockIndex (block.title)}
              <div class="weave-tut-section">
                <div class="weave-tut-title">
                  <span class="weave-tut-title-text">{block.title}</span>
                </div>
                <div class="weave-tut-text">
                  <pre>{block.code}</pre>
                </div>
              </div>
              {#if blockIndex < activeSyntaxTutorial.syntaxBlocks.length - 1}
                <div class="weave-tut-divider"></div>
              {/if}
            {/each}

            <div class="weave-tut-divider"></div>

            <div class="weave-tut-section">
              <div class="weave-tut-title">
                <span class="weave-tut-title-text">{activeSyntaxTutorial.example.title}</span>
              </div>
              <div class="weave-tut-text">
                <pre>{activeSyntaxTutorial.example.code}</pre>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
