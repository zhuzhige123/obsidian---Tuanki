import type { DataCheckResult } from "./DataManagementService";
import {
	getDataCheckTier,
	isSplitPluginResidueCheckType,
	isStartupGateAdvisoryCheckType,
	MIGRATION_CHECK_TYPES,
} from "./DataManagementService";

export type StartupDataCheckMode = "smart" | "strict" | "off";

export interface StartupDataGateBaseline {
	fingerprint: string;
	passedAt: string;
	pluginVersion: string;
}

export interface DataManagementGateEvaluation {
	ready: boolean;
	blockingCount: number;
	blockingResults: DataCheckResult[];
	advisoryCount: number;
	advisoryResults: DataCheckResult[];
}

export interface EvaluateDataManagementGateOptions {
	checksCompleted?: boolean;
	operationInProgress?: boolean;
}

export interface StartupDataGateSettingsSlice {
	startupDataCheckMode?: StartupDataCheckMode;
	enableStartupDataManagementGate?: boolean;
	startupDataGateBaseline?: StartupDataGateBaseline;
}

function getGateResultSeverityScore(result: DataCheckResult): number {
	if (result.status === "error") {
		return 3;
	}
	if (result.status === "warning") {
		return 2;
	}
	return 1;
}

function pickWorstGateCheckResult(
	existing: DataCheckResult,
	incoming: DataCheckResult,
	preferIncomingOnTie = false
): DataCheckResult {
	const existingScore = getGateResultSeverityScore(existing);
	const incomingScore = getGateResultSeverityScore(incoming);
	if (incomingScore !== existingScore) {
		return incomingScore > existingScore ? incoming : existing;
	}
	if (incoming.count !== existing.count) {
		return incoming.count > existing.count ? incoming : existing;
	}
	return preferIncomingOnTie ? incoming : existing;
}

export function mergeDataCheckResultsForGate(
	checkResults: DataCheckResult[],
	migrationResults: DataCheckResult[]
): DataCheckResult[] {
	const byType = new Map<string, DataCheckResult>();

	for (const result of checkResults) {
		byType.set(result.type, result);
	}

	for (const result of migrationResults) {
		const existing = byType.get(result.type);
		byType.set(
			result.type,
			existing ? pickWorstGateCheckResult(existing, result, true) : result
		);
	}

	return Array.from(byType.values());
}

function isGateAttentionResult(result: DataCheckResult): boolean {
	if (result.status === "error") {
		return true;
	}
	return result.status === "warning" && result.count > 0;
}

export function isGateAdvisoryResult(result: DataCheckResult): boolean {
	if (!isGateAttentionResult(result)) {
		return false;
	}
	return getDataCheckTier(result.type) === "advisory";
}

export function isGateBlockingResult(result: DataCheckResult): boolean {
	if (!isGateAttentionResult(result)) {
		return false;
	}

	if (isSplitPluginResidueCheckType(result.type)) {
		return false;
	}

	if (isStartupGateAdvisoryCheckType(result.type)) {
		return false;
	}

	if (result.type === "wdeck_cache") {
		return result.status === "warning" && result.count > 0;
	}

	return true;
}

export function resolveStartupDataCheckMode(
	settings: StartupDataGateSettingsSlice
): StartupDataCheckMode {
	if (settings.startupDataCheckMode === "smart" || settings.startupDataCheckMode === "strict") {
		return settings.startupDataCheckMode;
	}
	if (settings.startupDataCheckMode === "off") {
		return "off";
	}
	if (settings.enableStartupDataManagementGate === false) {
		return "off";
	}
	return "smart";
}

export function evaluateDataManagementGateReadiness(
	checkResults: DataCheckResult[],
	migrationResults: DataCheckResult[],
	options: EvaluateDataManagementGateOptions = {}
): DataManagementGateEvaluation {
	if (options.operationInProgress || !options.checksCompleted) {
		return {
			ready: false,
			blockingCount: 0,
			blockingResults: [],
			advisoryCount: 0,
			advisoryResults: [],
		};
	}

	const mergedResults = mergeDataCheckResultsForGate(checkResults, migrationResults);
	const blockingResults = mergedResults.filter(isGateBlockingResult);
	const advisoryResults = mergedResults.filter(isGateAdvisoryResult);

	return {
		ready: blockingResults.length === 0,
		blockingCount: blockingResults.reduce((sum, result) => sum + Math.max(result.count, 1), 0),
		blockingResults,
		advisoryCount: advisoryResults.reduce((sum, result) => sum + Math.max(result.count, 1), 0),
		advisoryResults,
	};
}

export function buildDataManagementGateFingerprint(
	checkResults: DataCheckResult[],
	migrationResults: DataCheckResult[]
): string {
	const blockingResults = mergeDataCheckResultsForGate(checkResults, migrationResults)
		.filter(isGateBlockingResult)
		.map((result) => ({
			type: result.type,
			status: result.status,
			count: result.count,
		}))
		.sort((left, right) => left.type.localeCompare(right.type));

	if (blockingResults.length === 0) {
		return "clean";
	}

	return JSON.stringify(blockingResults);
}

export function hasMatchingStartupDataGateBaseline(
	baseline: StartupDataGateBaseline | undefined,
	fingerprint: string,
	pluginVersion: string
): boolean {
	if (!baseline) {
		return false;
	}
	return baseline.fingerprint === fingerprint && baseline.pluginVersion === pluginVersion;
}

export function shouldOpenStartupDataManagementModal(options: {
	mode: StartupDataCheckMode;
	pending: boolean;
	evaluation: DataManagementGateEvaluation | null;
	evaluationCompleted: boolean;
}): boolean {
	if (!options.pending || options.mode === "off") {
		return false;
	}

	if (options.mode === "strict") {
		return true;
	}

	if (!options.evaluationCompleted) {
		return false;
	}

	return !options.evaluation?.ready;
}

export function shouldBlockWeaveMainInterface(_options: {
	mode: StartupDataCheckMode;
	pending: boolean;
	evaluation: DataManagementGateEvaluation | null;
	evaluationCompleted: boolean;
}): boolean {
	return false;
}

export const STARTUP_GATE_MIGRATION_CHECK_TYPES = MIGRATION_CHECK_TYPES;
