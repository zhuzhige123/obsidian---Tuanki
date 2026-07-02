import { describe, expect, it } from "vitest";
import {
	buildDataManagementGateFingerprint,
	evaluateDataManagementGateReadiness,
	hasMatchingStartupDataGateBaseline,
	isGateBlockingResult,
	mergeDataCheckResultsForGate,
	resolveStartupDataCheckMode,
	shouldBlockWeaveMainInterface,
	shouldOpenStartupDataManagementModal,
} from "../DataManagementStartupGate";
import {
	DEFAULT_CHECK_TYPES,
	MIGRATION_CHECK_TYPES,
} from "../DataManagementService";
import type { DataCheckResult } from "../DataManagementService";

function result(partial: Partial<DataCheckResult> & Pick<DataCheckResult, "type">): DataCheckResult {
	return {
		status: "ok",
		count: 0,
		items: [],
		message: "",
		...partial,
	};
}

describe("evaluateDataManagementGateReadiness", () => {
	it("blocks until checks complete", () => {
		const evaluation = evaluateDataManagementGateReadiness([], [], {
			checksCompleted: false,
			operationInProgress: false,
		});

		expect(evaluation.ready).toBe(false);
	});

	it("passes when all checks are clean", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "structure_check", status: "ok", count: 0 })],
			[result({ type: "schema_migration", status: "ok", count: 0 })],
			{ checksCompleted: true, operationInProgress: false }
		);

		expect(evaluation.ready).toBe(true);
		expect(evaluation.blockingResults).toHaveLength(0);
	});

	it("blocks on warning results with remaining items", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "we_block_migration", status: "warning", count: 3 })],
			[],
			{ checksCompleted: true, operationInProgress: false }
		);

		expect(evaluation.ready).toBe(false);
		expect(evaluation.blockingCount).toBe(3);
	});

	it("does not block on ok results with informational counts", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "wdeck_cache", status: "ok", count: 15 })],
			[],
			{ checksCompleted: true, operationInProgress: false }
		);

		expect(evaluation.ready).toBe(true);
		expect(evaluation.blockingResults).toHaveLength(0);
	});

	it("dedupes overlapping check and migration results by type", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "wdeck_conflicts", status: "warning", count: 2 })],
			[result({ type: "wdeck_conflicts", status: "ok", count: 0 })],
			{ checksCompleted: true, operationInProgress: false }
		);

		expect(evaluation.ready).toBe(false);
		expect(evaluation.blockingResults).toHaveLength(1);
		expect(evaluation.blockingCount).toBe(2);
	});

	it("prefers migration results when severity is equal", () => {
		const merged = mergeDataCheckResultsForGate(
			[result({ type: "legacy_cleanup", status: "warning", count: 1, message: "check" })],
			[result({ type: "legacy_cleanup", status: "warning", count: 1, message: "migration" })]
		);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.message).toBe("migration");
	});

	it("ignores split-plugin residue checks for gate blocking", () => {
		expect(
			isGateBlockingResult(
				result({ type: "ir_point_storage_migration", status: "warning", count: 4 })
			)
		).toBe(false);
	});

	it("ignores advisory maintenance checks for gate blocking", () => {
		expect(
			isGateBlockingResult(
				result({ type: "attachment_registry_consistency", status: "warning", count: 2 })
			)
		).toBe(false);
		expect(
			isGateBlockingResult(
				result({ type: "plugin_runtime_sync_scope", status: "warning", count: 1 })
			)
		).toBe(false);
	});

	it("does not block wdeck cache when only conflict mirror info is present", () => {
		expect(
			isGateBlockingResult(
				result({ type: "wdeck_cache", status: "ok", count: 0 })
			)
		).toBe(false);
		expect(
			isGateBlockingResult(
				result({ type: "wdeck_cache", status: "warning", count: 1 })
			)
		).toBe(true);
	});

	it("blocks wdeck conflicts when service is unavailable", () => {
		expect(
			isGateBlockingResult(
				result({ type: "wdeck_conflicts", status: "error", count: 0 })
			)
		).toBe(true);
	});

	it("keeps migration and default check lists disjoint", () => {
		const overlap = MIGRATION_CHECK_TYPES.filter((type) => DEFAULT_CHECK_TYPES.includes(type));
		expect(overlap).toEqual([]);
		expect(MIGRATION_CHECK_TYPES).toEqual([
			"schema_migration",
			"qbank_migration",
			"qbank_legacy_cleanup",
			"structure_check",
		]);
	});

	it("builds clean baseline fingerprint after modal-side fixes", () => {
		const fingerprint = buildDataManagementGateFingerprint(
			[result({ type: "wdeck_conflicts", status: "ok", count: 0 })],
			[result({ type: "structure_check", status: "ok", count: 0 })]
		);
		expect(fingerprint).toBe("clean");
	});
});

describe("startup gate mode helpers", () => {
	it("maps legacy disabled boolean to off", () => {
		expect(resolveStartupDataCheckMode({ enableStartupDataManagementGate: false })).toBe("off");
	});

	it("defaults legacy enabled boolean to smart", () => {
		expect(resolveStartupDataCheckMode({ enableStartupDataManagementGate: true })).toBe("smart");
	});

	it("builds stable clean fingerprint", () => {
		const fingerprint = buildDataManagementGateFingerprint(
			[result({ type: "card_deck_consistency", status: "ok", count: 0 })],
			[result({ type: "schema_migration", status: "ok", count: 0 })]
		);
		expect(fingerprint).toBe("clean");
	});

	it("matches persisted baseline", () => {
		expect(
			hasMatchingStartupDataGateBaseline(
				{ fingerprint: "clean", passedAt: "2026-01-01", pluginVersion: "0.8.26" },
				"clean",
				"0.8.26"
			)
		).toBe(true);
	});

	it("does not open modal in smart mode when checks are clean", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "card_deck_consistency", status: "ok", count: 0 })],
			[],
			{ checksCompleted: true }
		);

		expect(
			shouldOpenStartupDataManagementModal({
				mode: "smart",
				pending: false,
				evaluation,
				evaluationCompleted: true,
			})
		).toBe(false);
	});

	it("opens modal in smart mode only when blocking issues remain", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "card_deck_consistency", status: "warning", count: 2 })],
			[],
			{ checksCompleted: true }
		);

		expect(
			shouldOpenStartupDataManagementModal({
				mode: "smart",
				pending: true,
				evaluation,
				evaluationCompleted: true,
			})
		).toBe(true);
	});

	it("never blocks the main interface after startup prompt", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "card_deck_consistency", status: "warning", count: 2 })],
			[],
			{ checksCompleted: true }
		);

		expect(
			shouldBlockWeaveMainInterface({
				mode: "smart",
				pending: true,
				evaluation,
				evaluationCompleted: true,
			})
		).toBe(false);
	});

	it("opens modal in strict mode even when only advisory issues remain", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[result({ type: "attachment_registry_consistency", status: "warning", count: 2 })],
			[],
			{ checksCompleted: true }
		);

		expect(evaluation.ready).toBe(true);
		expect(
			shouldOpenStartupDataManagementModal({
				mode: "strict",
				pending: true,
				evaluation,
				evaluationCompleted: true,
			})
		).toBe(true);
	});

	it("evaluates advisory results separately from blocking results", () => {
		const evaluation = evaluateDataManagementGateReadiness(
			[
				result({ type: "attachment_registry_consistency", status: "warning", count: 2 }),
				result({ type: "card_deck_consistency", status: "warning", count: 1 }),
			],
			[],
			{ checksCompleted: true }
		);

		expect(evaluation.ready).toBe(false);
		expect(evaluation.advisoryResults).toHaveLength(1);
		expect(evaluation.blockingResults).toHaveLength(1);
	});
});
