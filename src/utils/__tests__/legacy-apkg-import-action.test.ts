import { describe, expect, it, vi, beforeEach } from "vitest";
import {
	dispatchLegacyApkgImportRequest,
	isLegacyApkgImportBundled,
	isLegacyApkgImportMenuVisible,
	isLegacyApkgImportNavigationEnabled,
	LEGACY_APKG_IMPORT_REQUEST_EVENT,
	openLegacyApkgImportModal,
} from "../legacy-apkg-import-action";

const noticeMock = vi.hoisted(() => vi.fn());

vi.mock("obsidian", () => ({
	Notice: noticeMock,
}));

vi.mock("../../components/modals/APKGImportModalObsidian", () => ({
	APKGImportModalObsidian: vi.fn().mockImplementation(() => ({
		open: vi.fn(),
		close: vi.fn(),
	})),
}));

function createPluginStub(overrides: Partial<{
	hasRuntime: boolean;
	wasmUrl: string;
	wasmFilePresent: boolean;
}> = {}) {
	return {
		app: {},
		wasmUrl: overrides.wasmUrl ?? "app://local/sql-wasm.wasm",
		hasLegacyApkgImportRuntime: () => overrides.hasRuntime ?? true,
		refreshLegacyApkgImportRuntimeStatus: vi.fn(async () => {}),
		isLegacyApkgWasmFilePresent: vi.fn(async () => overrides.wasmFilePresent ?? false),
		getLegacyApkgImportUnavailableMessage: () => "runtime missing",
		getLegacyApkgImportRestartMessage: () => "restart required",
	} as import("../../main").default;
}

describe("legacy-apkg-import-action", () => {
	beforeEach(() => {
		noticeMock.mockClear();
	});

	it("respects navigation visibility for menu display", () => {
		expect(isLegacyApkgImportNavigationEnabled({ apkgImport: false })).toBe(false);
		expect(isLegacyApkgImportNavigationEnabled({ apkgImport: true })).toBe(true);
		expect(isLegacyApkgImportMenuVisible({ apkgImport: false })).toBe(false);
		expect(isLegacyApkgImportMenuVisible({ apkgImport: true })).toBe(true);
	});

	it("shows unavailable notice when runtime is missing and wasm file is absent", async () => {
		const plugin = createPluginStub({ hasRuntime: false, wasmFilePresent: false });
		await openLegacyApkgImportModal(plugin, {} as import("../../data/storage").WeaveDataStorage);

		expect(noticeMock).toHaveBeenCalledWith("runtime missing", 8000);
	});

	it("shows restart notice when wasm file exists but runtime is not ready", async () => {
		const plugin = createPluginStub({ hasRuntime: false, wasmFilePresent: true });
		await openLegacyApkgImportModal(plugin, {} as import("../../data/storage").WeaveDataStorage);

		expect(noticeMock).toHaveBeenCalledWith("restart required", 8000);
	});

	it("dispatches a window-level request event", () => {
		const listener = vi.fn();
		window.addEventListener(LEGACY_APKG_IMPORT_REQUEST_EVENT, listener);

		dispatchLegacyApkgImportRequest();

		expect(listener).toHaveBeenCalledTimes(1);
		window.removeEventListener(LEGACY_APKG_IMPORT_REQUEST_EVENT, listener);
	});

	it("returns a boolean bundled state without throwing", () => {
		expect(typeof isLegacyApkgImportBundled()).toBe("boolean");
	});
});
