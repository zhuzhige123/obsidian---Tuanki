<script lang="ts">
  import FloatingMenu from "../ui/FloatingMenu.svelte";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import { tr } from "../../utils/i18n";

  type PickerVariant = "priority" | "importance";

  interface Props {
    show: boolean;
    anchor: HTMLElement | null;
    currentPriority?: number;
    variant?: PickerVariant;
    onSelect: (priority: 1 | 2 | 3 | 4) => void;
    onClose?: () => void;
    placement?: "left-start" | "right-start" | "bottom-start" | "top-start";
  }

  let {
    show = $bindable(),
    anchor,
    currentPriority = 2,
    variant = "priority",
    onSelect,
    onClose,
    placement = "left-start",
  }: Props = $props();

  let t = $derived($tr);

  const priorityOptions = $derived.by(() => {
    if (variant === "importance") {
      return [
        { value: 1 as const, label: t("study.questionBankUI.studyInterface.importanceLow"), color: "var(--color-yellow, #fbbf24)" },
        { value: 2 as const, label: t("study.questionBankUI.studyInterface.importanceMedium"), color: "var(--color-blue, #60a5fa)" },
        { value: 3 as const, label: t("study.questionBankUI.studyInterface.importanceHigh"), color: "var(--color-orange, #f97316)" },
        { value: 4 as const, label: t("study.questionBankUI.studyInterface.importanceVeryHigh"), color: "var(--color-red, #ef4444)" },
      ];
    }

    return [
      { value: 1 as const, label: t("study.priority.low"), color: "var(--color-yellow, #fbbf24)" },
      { value: 2 as const, label: t("study.priority.medium"), color: "var(--color-blue, #60a5fa)" },
      { value: 3 as const, label: t("study.priority.high"), color: "var(--color-orange, #f97316)" },
      { value: 4 as const, label: t("study.priority.urgent"), color: "var(--color-red, #ef4444)" },
    ];
  });

  const pickerAriaLabel = $derived(
    variant === "importance"
      ? t("study.questionBankUI.studyInterface.setPriority")
      : t("studyInterface.labels.setPriority")
  );

  function handleSelect(priority: 1 | 2 | 3 | 4) {
    onSelect(priority);
    show = false;
    onClose?.();
  }
</script>

<FloatingMenu
  bind:show
  {anchor}
  {placement}
  onClose={() => {
    show = false;
    onClose?.();
  }}
  class="priority-picker-menu"
  role="listbox"
>
  {#snippet children()}
    <div class="priority-picker" aria-label={pickerAriaLabel}>
      {#each priorityOptions as option (option.value)}
        <button
          type="button"
          class="priority-picker-item"
          class:selected={currentPriority === option.value}
          onclick={() => handleSelect(option.value)}
          role="option"
          aria-selected={currentPriority === option.value}
        >
          <span class="priority-dot" style:--priority-color={option.color}></span>
          <span class="priority-picker-label">{option.label}</span>
          {#if currentPriority === option.value}
            <span class="priority-check"><ObsidianIcon name="check" size={14} /></span>
          {/if}
        </button>
      {/each}
    </div>
  {/snippet}
</FloatingMenu>

<style>
  :global(.priority-picker-menu) {
    min-width: 0;
    max-width: none;
    padding: 4px;
    border-radius: 10px;
  }

  .priority-picker {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 132px;
  }

  .priority-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    text-align: left;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .priority-picker-item:hover {
    background: var(--background-modifier-hover);
  }

  .priority-picker-item.selected {
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--interactive-accent) 35%, transparent);
  }

  .priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--priority-color);
    flex-shrink: 0;
  }

  .priority-picker-label {
    flex: 1;
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .priority-check {
    display: inline-flex;
    color: var(--interactive-accent);
    flex-shrink: 0;
  }
</style>
