<script lang="ts">
  import { onMount } from "svelte";
  import CategoryFilter, { type DeckFilter } from "../deck-views/CategoryFilter.svelte";
  import ViewSwitcher, { type ViewType } from "../deck-views/ViewSwitcher.svelte";
  import { weaveMainInterfaceStore } from "../../stores/weave-main-interface-store";

  type AIAssistantSubView = 'generate' | 'parse-preview';

  let currentPage = $state("deck-study");
  let selectedFilter = $state<DeckFilter>("memory");
  let cardView = $state<ViewType>("table");
  let aiSubView = $state<AIAssistantSubView>("generate");

  function handleFilterSelect(filter: DeckFilter) {
    window.dispatchEvent(new CustomEvent("Weave:sidebar-filter-select", { detail: filter }));
  }

  function handleCardViewChange(view: ViewType) {
    window.dispatchEvent(new CustomEvent("Weave:sidebar-view-change", { detail: view }));
  }

  function handleAISubViewChange(view: AIAssistantSubView) {
    window.dispatchEvent(new CustomEvent("Weave:ai-toolbar-action", {
      detail: { action: "sub-view", value: view }
    }));
  }

  onMount(() => {
    const unsubscribeMainInterfaceStore = weaveMainInterfaceStore.subscribe((state) => {
      currentPage = state.currentPage;
      aiSubView = state.aiToolbar.subView;
    });

    const handleDeckFilterChange = (event: Event) => {
      const filter = (event as CustomEvent<DeckFilter>).detail;
      if (typeof filter === "string") {
        selectedFilter = filter;
      }
    };

    const handleCardViewChangeEvent = (event: Event) => {
      const view = (event as CustomEvent<ViewType>).detail;
      if (view === "table" || view === "grid" || view === "kanban") {
        cardView = view;
      }
    };

    window.addEventListener("Weave:deck-filter-change", handleDeckFilterChange as EventListener);
    window.addEventListener("Weave:card-view-change", handleCardViewChangeEvent as EventListener);

    return () => {
      unsubscribeMainInterfaceStore();
      window.removeEventListener("Weave:deck-filter-change", handleDeckFilterChange as EventListener);
      window.removeEventListener("Weave:card-view-change", handleCardViewChangeEvent as EventListener);
    };
  });
</script>

<div
  class="weave-mobile-header-center"
  class:is-visible={currentPage === "deck-study" || currentPage === "weave-card-management" || currentPage === "ai-assistant"}
>
  {#if currentPage === "deck-study"}
    <CategoryFilter {selectedFilter} onSelect={handleFilterSelect} />
  {:else if currentPage === "weave-card-management"}
    <ViewSwitcher currentView={cardView} onViewChange={handleCardViewChange} respectPremiumGates />
  {:else if currentPage === "ai-assistant"}
    <div class="ai-assistant-dots">
      <button
        class="ai-dot"
        class:selected={aiSubView === "generate"}
        style="background: linear-gradient(135deg, #ef4444, #dc2626)"
        onclick={() => handleAISubViewChange("generate")}
        aria-label="AI制卡"
      >
        {#if aiSubView === "generate"}
          <span class="dot-indicator"></span>
        {/if}
      </button>
      <button
        class="ai-dot"
        class:selected={aiSubView === "parse-preview"}
        style="background: linear-gradient(135deg, #3b82f6, #2563eb)"
        onclick={() => handleAISubViewChange("parse-preview")}
        aria-label="解析预览"
      >
        {#if aiSubView === "parse-preview"}
          <span class="dot-indicator"></span>
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .view-header) {
    position: relative;
  }

  :global(body.is-mobile .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .weave-mobile-header-center-host),
  :global(body.is-phone .workspace-leaf-content[data-type="weave-view"][data-weave-mobile-native-header="true"] .weave-mobile-header-center-host) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1;
    max-width: calc(100% - 168px);
  }

  .weave-mobile-header-center {
    display: none;
    align-items: center;
    justify-content: center;
    min-width: 0;
    max-width: 100%;
    pointer-events: none;
  }

  .weave-mobile-header-center.is-visible {
    display: flex;
  }

  .weave-mobile-header-center :global(.category-filter),
  .weave-mobile-header-center :global(.view-switcher) {
    margin-bottom: 0;
  }

  .weave-mobile-header-center :global(.category-dot),
  .weave-mobile-header-center :global(.view-dot),
  .weave-mobile-header-center :global(.ai-dot) {
    pointer-events: auto;
  }

  /* AI助手圆点样式 */
  .ai-assistant-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
  }

  .ai-dot {
    position: relative;
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    padding: 0;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  /* 扩展触控热区 */
  .ai-dot::before {
    content: '';
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    background: transparent;
  }

  .ai-dot:active {
    transform: scale(0.95);
  }

  .ai-dot.selected {
    transform: scale(1.25);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  }

  /* 选中状态的脉冲边框 */
  .ai-dot.selected::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.6);
    opacity: 0.6;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.15);
      opacity: 0.3;
    }
  }

  /* 选中指示器（白色小圆点） */
  .dot-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.5);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
