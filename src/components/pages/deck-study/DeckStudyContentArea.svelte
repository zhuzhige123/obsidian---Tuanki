<script lang="ts">
  import KanbanView from "../../deck-views/KanbanView.svelte";
  import type { DeckStudyContentAreaProps as Props } from "./page-shell-types";

  let {
    selectedFilter,
    dataStorage,
    plugin,
    deckTree,
    deckStats,
    qbDeckTree,
    qbDeckStats,
    memoryDeckLevels = {},
    emergentCandidates,
    emergentDeckViews,
    emergentDeckStats,
    formalDeckBindingSummary,
    memoryDeckDisplayMode = "formal",
    canShowMemoryDeckLevels = false,
    onStartStudy,
    onDissolveDeck,
    onRefreshData,
    onPromoteEmergentDeck,
    onBeforeOpenDeckMenu = undefined,
    memoryDeckMenuActionHandler = undefined,
    onKanbanStartStudy,
    onKanbanEditDeck,
    onKanbanDeleteDeck,
  }: Props = $props();
</script>

<KanbanView
  deckTree={selectedFilter === "question-bank" ? qbDeckTree : deckTree}
  deckStats={selectedFilter === "question-bank" ? qbDeckStats : deckStats}
  deckMode={selectedFilter === "question-bank" ? "question-bank" : "memory"}
  {dataStorage}
  {plugin}
  memoryDeckLevels={canShowMemoryDeckLevels ? memoryDeckLevels : {}}
  {emergentCandidates}
  {emergentDeckViews}
  {emergentDeckStats}
  {formalDeckBindingSummary}
  {memoryDeckDisplayMode}
  onStartStudy={onKanbanStartStudy}
  onStartEmergentStudy={onStartStudy}
  onDeckUpdate={onRefreshData}
  onEditDeck={onKanbanEditDeck}
  onDeleteDeck={onKanbanDeleteDeck}
  onDissolveDeck={selectedFilter === "memory" ? onDissolveDeck : undefined}
  onBeforeOpenDeckMenu={onBeforeOpenDeckMenu}
  memoryDeckMenuActionHandler={selectedFilter === "memory" ? memoryDeckMenuActionHandler : undefined}
  onPromoteEmergentDeck={selectedFilter === "memory" ? onPromoteEmergentDeck : undefined}
/>
