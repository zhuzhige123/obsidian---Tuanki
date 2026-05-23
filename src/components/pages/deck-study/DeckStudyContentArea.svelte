<script lang="ts">
  import KanbanView from "../../deck-views/KanbanView.svelte";
  import GridCardView from "../../deck-views/GridCardView.svelte";
  import type { DeckStudyContentAreaProps as Props } from "./page-shell-types";

  let {
    currentView,
    selectedFilter,
    dataStorage,
    plugin,
    deckTree,
    deckStats,
    qbDeckTree,
    qbDeckStats,
    irDeckTree,
    irDeckStats,
    studySessions,
    memoryDeckLevels = {},
    emergentCandidates,
    emergentDeckViews,
    emergentDeckStats,
    formalDeckBindingSummary,
    memoryDeckDisplayMode = "formal",
    canShowMemoryDeckLevels = false,
    onFilterSelect,
    onStartStudy,
    onContinueStudy,
    onAdvanceStudy,
    onOpenDeckAnalytics,
    onEditDeck,
    onDeleteDeck,
    onOpenKnowledgeGraph,
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

{#if currentView === "kanban"}
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
    onOpenKnowledgeGraph={selectedFilter === "memory" ? onOpenKnowledgeGraph : undefined}
    onDissolveDeck={selectedFilter === "memory" ? onDissolveDeck : undefined}
    onBeforeOpenDeckMenu={onBeforeOpenDeckMenu}
    memoryDeckMenuActionHandler={selectedFilter === "memory" ? memoryDeckMenuActionHandler : undefined}
    onPromoteEmergentDeck={selectedFilter === "memory" ? onPromoteEmergentDeck : undefined}
  />
{:else if currentView === "grid"}
  <GridCardView
    {deckTree}
    {deckStats}
    {studySessions}
    memoryDeckLevels={canShowMemoryDeckLevels ? memoryDeckLevels : {}}
    {emergentCandidates}
    {emergentDeckViews}
    {emergentDeckStats}
    {formalDeckBindingSummary}
    {memoryDeckDisplayMode}
    {plugin}
    {selectedFilter}
    onFilterSelect={onFilterSelect}
    onStartStudy={onStartStudy}
    onContinueStudy={onContinueStudy}
    onAdvanceStudy={onAdvanceStudy}
    onOpenDeckAnalytics={onOpenDeckAnalytics}
    onBeforeOpenDeckMenu={onBeforeOpenDeckMenu}
    onEditDeck={onEditDeck}
    onDeleteDeck={onDeleteDeck}
    onOpenKnowledgeGraph={onOpenKnowledgeGraph}
    onDissolveDeck={onDissolveDeck}
    onRefreshData={onRefreshData}
    onPromoteEmergentDeck={onPromoteEmergentDeck}
    onStartEmergentStudy={onStartStudy}
  />
{/if}
