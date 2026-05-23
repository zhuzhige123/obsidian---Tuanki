<script lang="ts">
  /**
   * 移动端 AI 制卡：内容区精简功能栏（文件 / 模型 / 生成）
   * 彩色圆点在 Obsidian 顶栏居中；提示词、历史、配置等走官方多功能菜单。
   */
  import { Platform } from "obsidian";
  import { tr } from "../../utils/i18n";
  import { weaveMainInterfaceStore } from "../../stores/weave-main-interface-store";
  import type { AIAssistantSubView } from "../../services/plugin-state/PluginLocalStateService";

  let t = $derived($tr);

  let subView = $state<AIAssistantSubView>("generate");
  let selectedFileName = $state("");
  let modelLabel = $state("");
  let parsePresetName = $state("");
  let canGenerate = $state(false);
  let canParse = $state(false);
  let isGenerating = $state(false);
  let isParsing = $state(false);

  const isMobile = Platform.isMobile;

  $effect(() => {
    const unsubscribe = weaveMainInterfaceStore.subscribe((state) => {
      subView = state.aiToolbar.subView;
      selectedFileName = state.aiToolbar.selectedFileName;
      modelLabel = state.aiToolbar.modelLabel;
      parsePresetName = state.aiToolbar.parsePresetName;
      canGenerate = state.aiToolbar.canGenerate;
      canParse = state.aiToolbar.canParse;
      isGenerating = state.aiToolbar.isGenerating;
      isParsing = state.aiToolbar.isParsing;
    });

    return unsubscribe;
  });

  function getPrimaryLabel(): string {
    if (subView === "generate") {
      return isGenerating ? t("mainMenu.aiAssistant.generating") : t("mainMenu.aiAssistant.startGenerate");
    }
    return isParsing ? t("mainMenu.aiAssistant.parsing") : t("mainMenu.aiAssistant.startParse");
  }

  function emitAction(action: string, evt: MouseEvent): void {
    const target = evt.currentTarget instanceof HTMLElement ? evt.currentTarget : null;
    const rect = target?.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent("Weave:ai-toolbar-action", {
        detail: {
          action,
          x: evt.clientX,
          y: evt.clientY,
          rect: rect
            ? {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              }
            : undefined,
        },
      })
    );
  }
</script>

{#if isMobile}
  <header class="ai-mobile-toolbar nav-header">
    <div class="ai-mobile-toolbar-actions">
      <button
        type="button"
        class="ai-mobile-btn ai-mobile-btn--text"
        onclick={(evt) => emitAction("file", evt)}
        title={selectedFileName || t("mainMenu.aiAssistant.fileList")}
        aria-label={t("mainMenu.aiAssistant.fileList")}
      >
        <span class="ai-mobile-btn-label">{selectedFileName || t("mainMenu.aiAssistant.fileList")}</span>
      </button>

      {#if subView === "generate"}
        <button
          type="button"
          class="ai-mobile-btn ai-mobile-btn--text"
          onclick={(evt) => emitAction("model", evt)}
          title={modelLabel || t("mainMenu.aiAssistant.model")}
          aria-label={t("mainMenu.aiAssistant.model")}
        >
          <span class="ai-mobile-btn-label">{modelLabel || t("mainMenu.aiAssistant.model")}</span>
        </button>
      {:else}
        <button
          type="button"
          class="ai-mobile-btn ai-mobile-btn--text"
          onclick={(evt) => emitAction("parse-template", evt)}
          title={parsePresetName || t("mainMenu.aiAssistant.parseTemplate")}
          aria-label={t("mainMenu.aiAssistant.parseTemplate")}
        >
          <span class="ai-mobile-btn-label">{parsePresetName || t("mainMenu.aiAssistant.parseTemplate")}</span>
        </button>
      {/if}

      <button
        type="button"
        class="ai-mobile-btn ai-mobile-btn--primary"
        class:disabled={subView === "generate" ? !canGenerate : !canParse}
        onclick={(evt) => emitAction(subView === "generate" ? "generate" : "parse", evt)}
        aria-label={getPrimaryLabel()}
      >
        <span>{getPrimaryLabel()}</span>
      </button>
    </div>
  </header>
{/if}

<style>
  .ai-mobile-toolbar {
    flex-shrink: 0;
    padding: 8px 10px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .ai-mobile-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .ai-mobile-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--weave-touch-sm, 36px);
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-s);
    background: transparent;
    box-shadow: none;
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    font-family: var(--font-interface);
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    flex-shrink: 0;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .ai-mobile-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .ai-mobile-btn:active:not(:disabled) {
    background: var(--background-modifier-active-hover);
  }

  .ai-mobile-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ai-mobile-btn--text {
    flex: 1 1 0;
    min-width: 0;
    justify-content: flex-start;
  }

  .ai-mobile-btn-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .ai-mobile-btn--primary {
    flex: 0 0 auto;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-weight: 600;
    padding: 0 14px;
  }

  .ai-mobile-btn--primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
    color: var(--text-on-accent);
  }
</style>
