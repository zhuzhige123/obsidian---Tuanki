<script lang="ts">
  import { CardState } from "../../data/types";

  interface Props {
    state: CardState;
  }

  let { state }: Props = $props();

  const stateMap = {
    [CardState.New]: { text: "新卡片", color: "var(--color-gray)" },
    [CardState.Learning]: { text: "学习中", color: "var(--color-blue)" },
    [CardState.Review]: { text: "复习", color: "var(--color-green)" },
    [CardState.Relearning]: { text: "重新学习", color: "var(--color-yellow)" },
  };

  let currentStatus = $derived(stateMap[state] || { text: "未知", color: "var(--color-gray)" });
</script>

<span class="status-badge" style="--status-color: {currentStatus.color}">
  {currentStatus.text}
</span>

<style>
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.25em 0.75em;
    border-radius: var(--radius-l);
    font-size: 0.8em;
    font-weight: 500;
    white-space: nowrap;
    background-color: color-mix(in srgb, var(--status-color) 15%, transparent);
    color: var(--status-color);
    border: 1px solid color-mix(in srgb, var(--status-color) 30%, transparent);
  }

  .status-badge::before {
    content: "";
    width: 0.5em;
    height: 0.5em;
    border-radius: 50%;
    background-color: var(--status-color);
  }
</style>
