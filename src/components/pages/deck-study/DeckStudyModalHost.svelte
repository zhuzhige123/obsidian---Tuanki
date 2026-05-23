<script lang="ts">
  import CSVImportModal from "../../modals/CSVImportModal.svelte";
  import CreateQuestionBankModal from "../../modals/CreateQuestionBankModal.svelte";
  import CelebrationModal from "../../modals/CelebrationModal.svelte";
  import NoCardsAvailableModal from "../../modals/NoCardsAvailableModal.svelte";
  import TestModeSelectionModal from "../../modals/TestModeSelectionModal.svelte";
  import ActivationPrompt from "../../premium/ActivationPrompt.svelte";
  import type { Card } from "../../../data/types";
  import type { QuestionBankModeConfig, TestMode } from "../../../types/question-bank-types";
  import {
    openQuestionBankSessionWithModeConfig,
    showCelebrationQuestionBankPicker,
  } from "../../../utils/study/celebration-exam-flow";
  import { tr } from "../../../utils/i18n";

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
    onCloseNoCardsModal,
    onAdvanceStudy,
    onViewStats,
    onCloseActivationPrompt,
  }: Props = $props();

  let t = $derived($tr);

  let createQuestionBankModalOpen = $state(false);
  let csvImportModalOpen = $state(false);

  let showCelebrationExamConfigModal = $state(false);
  let celebrationExamBankId = $state<string | null>(null);
  let celebrationExamBankName = $state("");
  let celebrationExamQuestionCount = $state(0);
  let celebrationExamQuestions = $state<Card[]>([]);

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

  function resetCelebrationExamConfigState() {
    showCelebrationExamConfigModal = false;
    celebrationExamBankId = null;
    celebrationExamBankName = "";
    celebrationExamQuestionCount = 0;
    celebrationExamQuestions = [];
  }

  async function handleCelebrationSelectExam(event: MouseEvent) {
    const selection = await showCelebrationQuestionBankPicker(
      plugin,
      { x: event.clientX, y: event.clientY },
      (key, params) => t(key, params as Record<string, string | number> | undefined),
    );

    if (!selection) {
      return;
    }

    if (selection === "resumed") {
      onCloseCelebration();
      return;
    }

    onCloseCelebration();
    celebrationExamBankId = selection.bankId;
    celebrationExamBankName = selection.bankName;
    celebrationExamQuestionCount = selection.questions.length;
    celebrationExamQuestions = selection.questions;
    showCelebrationExamConfigModal = true;
  }

  async function handleCelebrationExamModeSelected(mode: TestMode, config?: QuestionBankModeConfig) {
    showCelebrationExamConfigModal = false;
    const bankId = celebrationExamBankId;
    const bankName = celebrationExamBankName;
    const questions = celebrationExamQuestions;
    resetCelebrationExamConfigState();

    if (!bankId || questions.length === 0) {
      return;
    }

    await openQuestionBankSessionWithModeConfig(plugin, bankId, bankName, questions, mode, config);
  }

  function handleCelebrationExamModeCancel() {
    resetCelebrationExamConfigState();
  }
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
    onStartPractice={handleCelebrationSelectExam}
  />
{/if}

<TestModeSelectionModal
  open={showCelebrationExamConfigModal}
  bankName={celebrationExamBankName}
  totalQuestions={celebrationExamQuestionCount}
  onSelect={handleCelebrationExamModeSelected}
  onCancel={handleCelebrationExamModeCancel}
/>

{#if showNoCardsModal}
  <NoCardsAvailableModal
    deckName={noCardsDeckName}
    reason={noCardsReason}
    stats={noCardsStats}
    onClose={onCloseNoCardsModal}
    onAdvanceStudy={onAdvanceStudy}
    onViewStats={onViewStats}
  />
{/if}

<ActivationPrompt
  featureId={promptFeatureId}
  visible={showActivationPrompt}
  onClose={onCloseActivationPrompt}
/>
