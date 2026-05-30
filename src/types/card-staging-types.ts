import type { Card } from "../data/types";
import type {
	AICardPreviewItem,
	AIPreviewImportResult,
	GenerationConfig,
	GeneratedCard,
} from "./ai-types";

export type CardStagingStudyMode = "memory" | "exam";

export type CardStagingItemStatus = "pending" | "kept" | "discarded";

export type CardStagingViewMode = "preview" | "study";

export interface CardStagingItem {
	id: string;
	previewItemId: string;
	generatedCard: GeneratedCard;
	previewCard: Card;
	status: CardStagingItemStatus;
}

export interface CardStagingSession {
	id: string;
	createdAt: string;
	updatedAt: string;
	sourceFilePath: string | null;
	sourceFileName: string;
	studyMode: CardStagingStudyMode;
	targetDeckId: string;
	targetDeckName: string;
	targetQuestionBankId?: string;
	targetQuestionBankName?: string;
	generationConfig: GenerationConfig;
	importAutoTags: string[];
	items: CardStagingItem[];
	currentIndex: number;
	viewMode: CardStagingViewMode;
}

export interface CreateCardStagingSessionParams {
	sourceFilePath: string | null;
	sourceFileName: string;
	studyMode: CardStagingStudyMode;
	targetDeckId: string;
	targetDeckName: string;
	targetQuestionBankId?: string;
	targetQuestionBankName?: string;
	generationConfig: GenerationConfig;
	importAutoTags?: string[];
	items: AICardPreviewItem[];
	viewMode?: CardStagingViewMode;
}

export interface CardStagingSessionSummary {
	sessionId: string;
	totalCount: number;
	pendingCount: number;
	keptCount: number;
	discardedCount: number;
	sourceFileName: string;
	studyMode: CardStagingStudyMode;
}

export interface CardStagingCommitResult extends AIPreviewImportResult {
	sessionId: string;
	targetQuestionBankId?: string;
	targetQuestionBankName?: string;
}
