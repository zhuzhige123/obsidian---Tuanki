export type EmergentDeckCandidateStatus = "emergent" | "promoted" | "ignored";

export interface EmergentDeckCandidate {
	id: string;
	name: string;
	sourceTags: string[];
	cardUUIDs: string[];
	score: number;
	status: EmergentDeckCandidateStatus;
	updatedAt: string;
}

export interface FormalDeckBinding {
	formalDeckId: string;
	candidateId: string;
	bindingMode: "stable-weak-sync";
	primaryTagSet: string[];
	manualPinnedCardUUIDs?: string[];
	manualExcludedCardUUIDs?: string[];
	createdAt: string;
	updatedAt: string;
}

export interface FormalDeckBindingStore {
	version: number;
	bindings: FormalDeckBinding[];
}

export interface FormalDeckBindingSummary {
	bindingCount: number;
	autoTagNames: string[];
	matchedCardCount: number;
}

export interface ResolvedDeckRef {
	id: string;
	name: string;
	kind: "formal" | "emergent";
	isPrimary?: boolean;
}

export interface MemoryDeckView {
	id: string;
	name: string;
	kind: "formal" | "emergent";
	statusBadge: string;
	cardUUIDs: string[];
	score: number;
	sourceTags?: string[];
	bindingSummary?: FormalDeckBindingSummary;
}

export interface MemoryDeckOrganizationRuntime {
	candidates: EmergentDeckCandidate[];
	emergentDeckViews: MemoryDeckView[];
	formalDeckIdsByCardUUID: Record<string, string[]>;
	emergentDeckIdsByCardUUID: Record<string, string[]>;
	resolvedDeckRefsByCardUUID: Record<string, ResolvedDeckRef[]>;
	primaryDeckIdByCardUUID: Record<string, string | undefined>;
	formalDeckSummary: Record<string, FormalDeckBindingSummary>;
}
