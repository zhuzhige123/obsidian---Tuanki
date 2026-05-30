import { get, writable } from "svelte/store";
import type { AIAssistantSubView } from "../services/plugin-state/PluginLocalStateService";

export interface WeaveNavigationVisibilityState {
	deckStudy: boolean;
	cardManagement: boolean;
	incrementalReading: boolean;
	aiAssistant: boolean;
	apkgImport: boolean;
	csvImport: boolean;
}

export interface WeaveAIToolbarState {
	subView: AIAssistantSubView;
	selectedFileName: string;
	selectedFilePath: string;
	activeDocumentPath: string;
	activeDocumentName: string;
	followActiveDocument: boolean;
	stagingStudyMode: "memory" | "exam";
	canStartStaging: boolean;
	promptFileName: string;
	promptFilePath: string;
	modelLabel: string;
	modelTitle: string;
	parsePresetName: string;
	parsePresetId: string;
	historyCount: number;
	canGenerate: boolean;
	canParse: boolean;
	isGenerating: boolean;
	isParsing: boolean;
}

export interface WeaveGlobalOperationProgressState {
	active: boolean;
	operationId: string | null;
	status: "idle" | "running" | "success" | "error";
	title: string;
	detail: string;
	current: number;
	total: number;
	allowNavigation: boolean;
	navigationMessage: string;
}

export interface WeaveMainInterfaceState {
	currentPage: string;
	navigationVisibility: WeaveNavigationVisibilityState;
	aiToolbar: WeaveAIToolbarState;
	globalOperationProgress: WeaveGlobalOperationProgressState;
}

const DEFAULT_NAVIGATION_VISIBILITY: WeaveNavigationVisibilityState = {
	deckStudy: true,
	cardManagement: true,
	incrementalReading: true,
	aiAssistant: true,
	apkgImport: true,
	csvImport: true,
};

const DEFAULT_AI_TOOLBAR_STATE: WeaveAIToolbarState = {
	subView: "generate",
	selectedFileName: "",
	selectedFilePath: "",
	activeDocumentPath: "",
	activeDocumentName: "",
	followActiveDocument: true,
	stagingStudyMode: "memory",
	canStartStaging: false,
	promptFileName: "",
	promptFilePath: "",
	modelLabel: "",
	modelTitle: "",
	parsePresetName: "",
	parsePresetId: "",
	historyCount: 0,
	canGenerate: false,
	canParse: false,
	isGenerating: false,
	isParsing: false,
};

const DEFAULT_GLOBAL_OPERATION_PROGRESS_STATE: WeaveGlobalOperationProgressState = {
	active: false,
	operationId: null,
	status: "idle",
	title: "",
	detail: "",
	current: 0,
	total: 0,
	allowNavigation: true,
	navigationMessage: "",
};

const INITIAL_STATE: WeaveMainInterfaceState = {
	currentPage: "deck-study",
	navigationVisibility: { ...DEFAULT_NAVIGATION_VISIBILITY },
	aiToolbar: { ...DEFAULT_AI_TOOLBAR_STATE },
	globalOperationProgress: { ...DEFAULT_GLOBAL_OPERATION_PROGRESS_STATE },
};

function normalizeNavigationVisibility(
	visibility?: Partial<WeaveNavigationVisibilityState> | null
): WeaveNavigationVisibilityState {
	const normalized: WeaveNavigationVisibilityState = {
		...DEFAULT_NAVIGATION_VISIBILITY,
		...(visibility ?? {}),
	};

	normalized.deckStudy = true;
	normalized.cardManagement = true;
	normalized.incrementalReading = true;
	normalized.aiAssistant = true;

	return normalized;
}

function normalizeAIToolbarState(
	state?: Partial<WeaveAIToolbarState> | null
): WeaveAIToolbarState {
	return {
		...DEFAULT_AI_TOOLBAR_STATE,
		...(state ?? {}),
		subView: state?.subView === "parse-preview" ? "parse-preview" : "generate",
		selectedFileName: state?.selectedFileName?.trim() ?? "",
		selectedFilePath: state?.selectedFilePath?.trim() ?? "",
		activeDocumentPath: state?.activeDocumentPath?.trim() ?? "",
		activeDocumentName: state?.activeDocumentName?.trim() ?? "",
		followActiveDocument: state?.followActiveDocument ?? true,
		stagingStudyMode: state?.stagingStudyMode === "exam" ? "exam" : "memory",
		canStartStaging: Boolean(state?.canStartStaging),
		promptFileName: state?.promptFileName?.trim() ?? "",
		promptFilePath: state?.promptFilePath?.trim() ?? "",
		modelLabel: state?.modelLabel?.trim() ?? "",
		modelTitle: state?.modelTitle?.trim() ?? "",
		parsePresetName: state?.parsePresetName?.trim() ?? "",
		parsePresetId: state?.parsePresetId?.trim() ?? "",
		historyCount: Math.max(0, state?.historyCount ?? 0),
		canGenerate: Boolean(state?.canGenerate),
		canParse: Boolean(state?.canParse),
		isGenerating: Boolean(state?.isGenerating),
		isParsing: Boolean(state?.isParsing),
	};
}

function navigationVisibilitySignature(state: WeaveNavigationVisibilityState): string {
	return JSON.stringify(state);
}

function aiToolbarSignature(state: WeaveAIToolbarState): string {
	return JSON.stringify(state);
}

function normalizeGlobalOperationProgressState(
	state?: Partial<WeaveGlobalOperationProgressState> | null
): WeaveGlobalOperationProgressState {
	const total = Math.max(0, state?.total ?? 0);
	const current = Math.max(0, Math.min(total, state?.current ?? 0));

	return {
		...DEFAULT_GLOBAL_OPERATION_PROGRESS_STATE,
		...(state ?? {}),
		operationId: state?.operationId?.trim() || null,
		status:
			state?.status === "running"
				? "running"
				: state?.status === "success"
					? "success"
					: state?.status === "error"
						? "error"
						: "idle",
		title: state?.title?.trim() ?? "",
		detail: state?.detail?.trim() ?? "",
		current,
		total,
		allowNavigation: state?.allowNavigation ?? true,
		navigationMessage: state?.navigationMessage?.trim() ?? "",
		active: Boolean(state?.active),
	};
}

function createWeaveMainInterfaceStore() {
	const { subscribe, update, set } = writable<WeaveMainInterfaceState>({ ...INITIAL_STATE });

	return {
		subscribe,
		getState(): WeaveMainInterfaceState {
			return get({ subscribe });
		},
		setCurrentPage(page: string): void {
			if (typeof page !== "string" || page.length === 0) {
				return;
			}

			update((state) => {
				if (state.currentPage === page) {
					return state;
				}

				return {
					...state,
					currentPage: page,
				};
			});
		},
		setNavigationVisibility(visibility?: Partial<WeaveNavigationVisibilityState> | null): void {
			const nextVisibility = normalizeNavigationVisibility(visibility);
			update((state) => {
				if (
					navigationVisibilitySignature(state.navigationVisibility)
					=== navigationVisibilitySignature(nextVisibility)
				) {
					return state;
				}

				return {
					...state,
					navigationVisibility: nextVisibility,
				};
			});
		},
		setAIToolbarState(state: Partial<WeaveAIToolbarState> | null): void {
			const nextToolbarState = normalizeAIToolbarState(state);
			update((currentState) => {
				if (aiToolbarSignature(currentState.aiToolbar) === aiToolbarSignature(nextToolbarState)) {
					return currentState;
				}

				return {
					...currentState,
					aiToolbar: nextToolbarState,
				};
			});
		},
		patchAIToolbarState(state: Partial<WeaveAIToolbarState>): void {
			update((currentState) => {
				const nextToolbarState = normalizeAIToolbarState({
					...currentState.aiToolbar,
					...state,
				});
				if (aiToolbarSignature(currentState.aiToolbar) === aiToolbarSignature(nextToolbarState)) {
					return currentState;
				}

				return {
					...currentState,
					aiToolbar: nextToolbarState,
				};
			});
		},
		startGlobalOperation(state: {
			title: string;
			total: number;
			detail?: string;
			allowNavigation?: boolean;
			navigationMessage?: string;
			operationId?: string;
		}): string {
			const operationId = state.operationId?.trim()
				|| `global-operation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const nextProgressState = normalizeGlobalOperationProgressState({
				active: true,
				status: "running",
				operationId,
				title: state.title,
				detail: state.detail,
				total: state.total,
				current: 0,
				allowNavigation: state.allowNavigation,
				navigationMessage: state.navigationMessage,
			});

			update((currentState) => ({
				...currentState,
				globalOperationProgress: nextProgressState,
			}));

			return operationId;
		},
		updateGlobalOperation(
			operationId: string,
			patch: Partial<Omit<WeaveGlobalOperationProgressState, "operationId">>
		): void {
			if (!operationId) {
				return;
			}

			update((currentState) => {
				if (currentState.globalOperationProgress.operationId !== operationId) {
					return currentState;
				}

				return {
					...currentState,
					globalOperationProgress: normalizeGlobalOperationProgressState({
						...currentState.globalOperationProgress,
						...patch,
						operationId,
						active: true,
					}),
				};
			});
		},
		finishGlobalOperation(
			operationId: string,
			patch?: Partial<Omit<WeaveGlobalOperationProgressState, "operationId">>
		): void {
			if (!operationId) {
				return;
			}

			update((currentState) => {
				if (currentState.globalOperationProgress.operationId !== operationId) {
					return currentState;
				}

				const currentProgress = currentState.globalOperationProgress;
				return {
					...currentState,
					globalOperationProgress: normalizeGlobalOperationProgressState({
						...currentProgress,
						...patch,
						operationId,
						active: true,
						status: patch?.status ?? "success",
						current: patch?.current ?? currentProgress.total,
					}),
				};
			});
		},
		clearGlobalOperation(operationId?: string): void {
			update((currentState) => {
				if (
					operationId
					&& currentState.globalOperationProgress.operationId
					&& currentState.globalOperationProgress.operationId !== operationId
				) {
					return currentState;
				}

				return {
					...currentState,
					globalOperationProgress: { ...DEFAULT_GLOBAL_OPERATION_PROGRESS_STATE },
				};
			});
		},
		reset(): void {
			set({
				currentPage: INITIAL_STATE.currentPage,
				navigationVisibility: { ...DEFAULT_NAVIGATION_VISIBILITY },
				aiToolbar: { ...DEFAULT_AI_TOOLBAR_STATE },
				globalOperationProgress: { ...DEFAULT_GLOBAL_OPERATION_PROGRESS_STATE },
			});
		},
	};
}

export const weaveMainInterfaceStore = createWeaveMainInterfaceStore();
export {
	DEFAULT_AI_TOOLBAR_STATE,
	DEFAULT_GLOBAL_OPERATION_PROGRESS_STATE,
	DEFAULT_NAVIGATION_VISIBILITY,
	normalizeAIToolbarState,
	normalizeGlobalOperationProgressState,
	normalizeNavigationVisibility,
};
