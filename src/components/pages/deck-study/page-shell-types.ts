import type WeavePlugin from "../../../main";
import type { WeaveDataStorage } from "../../../data/storage";
import type { Deck, DeckStats } from "../../../data/types";
import type { StudySession } from "../../../data/study-types";
import type { DeckTreeNode } from "../../../services/deck/DeckHierarchyService";
import type { MemoryDeckMenuAction } from "../../../services/deck/MemoryDeckMenu";
import type { MemoryDeckLevelProgress } from "../../../services/deck/MemoryDeckLevelService";
import type {
  EmergentDeckCandidate,
  FormalDeckBindingSummary,
  MemoryDeckView,
} from "../../../types/emergent-deck-types";
import type { CelebrationStats } from "../../../types/celebration-types";

export type DeckStudyActiveDeckView = "kanban" | "grid";
export type DeckStudyActiveDeckFilter = "memory" | "question-bank";
export type DeckStudyMemoryDeckDisplayMode = "formal" | "emergent";
export type DeckStudyFilterInput = DeckStudyActiveDeckFilter | "reading" | "parent" | "child" | "all";

export interface DeckStudyQuestionBankSubmenuData {
  banks: Array<{ id: string; name: string; isCurrent: boolean }>;
}

export interface DeckStudyNoCardsStats {
  totalCards: number;
  sessionCompletedCards?: number;
  showSessionCompletedCards?: boolean;
  nextDueTime?: string;
  todayNewCards?: number;
  todayNewLimit?: number;
}

export interface DeckStudyContentAreaProps {
  currentView: DeckStudyActiveDeckView;
  selectedFilter: DeckStudyActiveDeckFilter;
  dataStorage: WeaveDataStorage;
  plugin: WeavePlugin;
  deckTree: DeckTreeNode[];
  deckStats: Record<string, DeckStats>;
  qbDeckTree: DeckTreeNode[];
  qbDeckStats: Record<string, DeckStats>;
  irDeckTree: DeckTreeNode[];
  irDeckStats: Record<string, DeckStats>;
  studySessions: StudySession[];
  memoryDeckLevels?: Record<string, MemoryDeckLevelProgress>;
  emergentCandidates: EmergentDeckCandidate[];
  emergentDeckViews: MemoryDeckView[];
  emergentDeckStats: Record<string, DeckStats>;
  formalDeckBindingSummary: Record<string, FormalDeckBindingSummary>;
  memoryDeckDisplayMode?: DeckStudyMemoryDeckDisplayMode;
  canShowMemoryDeckLevels?: boolean;
  showQuestionBankAssociationEntry?: boolean;
  onFilterSelect: (filter: DeckStudyFilterInput) => void;
  onStartStudy: (deckId: string, deckNameOverride?: string) => Promise<void>;
  onContinueStudy: () => Promise<void>;
  onAdvanceStudy: (deckId: string) => Promise<void>;
  onOpenDeckAnalytics: (deckId: string) => Promise<void>;
  onAssociateQuestionBank?: (deckId: string) => Promise<void>;
  getQuestionBankSubmenuData?: (deckId: string) => Promise<DeckStudyQuestionBankSubmenuData | null>;
  onEditDeck: (deckId: string) => Promise<void>;
  onDeleteDeck: (deckId: string) => Promise<void>;
  onOpenKnowledgeGraph: (deckId: string) => Promise<void>;
  onDissolveDeck: (deckId: string) => Promise<void>;
  onRefreshData: (showLoading?: boolean) => Promise<void>;
  onPromoteEmergentDeck: (candidate: EmergentDeckCandidate, event: MouseEvent) => Promise<void>;
  onBeforeOpenDeckMenu?: () => void;
  memoryDeckMenuActionHandler?: (action: MemoryDeckMenuAction, deckId: string) => Promise<void>;
  onKanbanStartStudy: (deckId: string) => Promise<void>;
  onKanbanEditDeck: (deckId: string) => Promise<void>;
  onKanbanDeleteDeck: (deckId: string) => Promise<void>;
}

export interface DeckStudyModalHostProps {
  plugin: WeavePlugin;
  dataStorage: WeaveDataStorage;
  showCreateQuestionBankModal: boolean;
  showCSVImportModal: boolean;
  showCelebrationModal: boolean;
  celebrationStats: CelebrationStats | null;
  celebrationDeckName: string;
  celebrationDeckId: string;
  showNoCardsModal: boolean;
  noCardsDeckName: string;
  noCardsReason: "empty" | "all-learned" | "no-due";
  noCardsStats: DeckStudyNoCardsStats | undefined;
  promptFeatureId: string;
  showActivationPrompt: boolean;
  onSetShowCreateQuestionBankModal: (value: boolean) => void;
  onSetShowCSVImportModal: (value: boolean) => void;
  onLoadQBDeckTree: () => Promise<void>;
  onRefreshData: () => Promise<void>;
  onCloseCelebration: () => void;
  onStartPractice: () => Promise<void>;
  onCloseNoCardsModal: () => void;
  onAdvanceStudy: () => Promise<void>;
  onViewStats: () => void;
  onStartPracticeFromNoCards: () => Promise<void>;
  onCloseActivationPrompt: () => void;
}
