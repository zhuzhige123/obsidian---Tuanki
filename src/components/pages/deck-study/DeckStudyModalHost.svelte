<script lang="ts">
  import CSVImportModal from "../../modals/CSVImportModal.svelte";
  import CreateQuestionBankModal from "../../modals/CreateQuestionBankModal.svelte";
  import CelebrationModal from "../../modals/CelebrationModal.svelte";
  import NoCardsAvailableModal from "../../modals/NoCardsAvailableModal.svelte";
  import ActivationPrompt from "../../premium/ActivationPrompt.svelte";

  import type { DeckStudyModalHostProps as Props } from "./page-shell-types";

  let {
    plugin,
    dataStorage,
    showCreateQuestionBankModal,
    showCSVImportModal,
    showCelebrationModal,
    celebrationStats,
    celebrationDeckName,
    celebrationDeckId,
    showNoCardsModal,
    noCardsDeckName,
    noCardsReason,
    noCardsStats,
    promptFeatureId,
    showActivationPrompt,
    onSetShowCreateQuestionBankModal,
    onSetShowCSVImportModal,
    onLoadQBDeckTree,
    onRefreshData,
    onCloseCelebration,
    onStartPractice,
    onCloseNoCardsModal,
    onAdvanceStudy,
    onViewStats,
    onStartPracticeFromNoCards,
    onCloseActivationPrompt,
  }: Props = $props();

  let createQuestionBankModalOpen = $state(false);
  let csvImportModalOpen = $state(false);

  $effect(() => {
    createQuestionBankModalOpen = showCreateQuestionBankModal;
  });

  $effect(() => {
    csvImportModalOpen = showCSVImportModal;
  });

  $effect(() => {
    onSetShowCreateQuestionBankModal(createQuestionBankModalOpen);
  });

  $effect(() => {
    onSetShowCSVImportModal(csvImportModalOpen);
  });
</script>

{#if showCreateQuestionBankModal}
  <CreateQuestionBankModal
    bind:open={createQuestionBankModalOpen}
    {plugin}
    mode="create"
    onClose={() => {
      onSetShowCreateQuestionBankModal(false);
    }}
    onCreated={async () => {
      onSetShowCreateQuestionBankModal(false);
      await onLoadQBDeckTree();
      plugin.app.workspace.trigger("Weave:data-changed");
    }}
  />
{/if}

{#if showCSVImportModal}
  <CSVImportModal
    bind:open={csvImportModalOpen}
    {plugin}
    {dataStorage}
    onClose={() => {
      onSetShowCSVImportModal(false);
    }}
    onImportComplete={async () => {
      onSetShowCSVImportModal(false);
      await onRefreshData();
      plugin.app.workspace.trigger("Weave:data-changed");
    }}
  />
{/if}

{#if showCelebrationModal && celebrationStats}
  <CelebrationModal
    deckName={celebrationDeckName}
    deckId={celebrationDeckId}
    stats={celebrationStats}
    soundEnabled={true}
    onClose={onCloseCelebration}
    onStartPractice={onStartPractice}
  />
{/if}

{#if showNoCardsModal}
  <NoCardsAvailableModal
    deckName={noCardsDeckName}
    reason={noCardsReason}
    stats={noCardsStats}
    onClose={onCloseNoCardsModal}
    onAdvanceStudy={onAdvanceStudy}
    onViewStats={onViewStats}
    onStartPractice={onStartPracticeFromNoCards}
  />
{/if}

<ActivationPrompt
  featureId={promptFeatureId}
  visible={showActivationPrompt}
  onClose={onCloseActivationPrompt}
/>
