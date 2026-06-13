import { describe, expect, it, vi } from "vitest";
import {
	EPUB_READER_PLUGIN_ID,
	INCREMENTAL_READING_PLUGIN_ID,
	getEpubReaderPluginAvailability,
	getIncrementalReadingPluginAvailability,
	getSplitPluginResidueOwnerPluginId,
	isSplitPluginResidueDelegatedToStandalonePlugin,
	openIncrementalReadingDataManagement,
	openEpubReaderDataManagement,
	shouldWeaveHostIncrementalReadingDomainServices,
	shouldWeaveHostIncrementalReadingVaultListeners,
	shouldWeaveInitializeIncrementalReadingMaterialStack,
	shouldWeaveRunIncrementalReadingFolderSubscription,
} from "../ir-plugin-integration";

function createApp(
	installed: Record<string, unknown> = {},
	manifests: Record<string, unknown> = {},
	enabledPluginIds: string[] = Object.keys(installed)
) {
	return {
		plugins: {
			getPlugin: vi.fn((id: string) => installed[id] ?? null),
			manifests,
			enabledPlugins: new Set(enabledPluginIds),
		},
	} as any;
}

describe("ir-plugin-integration", () => {
	it("maps split-plugin residue check types to owner plugin ids", () => {
		expect(getSplitPluginResidueOwnerPluginId("ir_point_storage_migration")).toBe(
			INCREMENTAL_READING_PLUGIN_ID
		);
		expect(getSplitPluginResidueOwnerPluginId("epub_source_link_migration")).toBe(
			EPUB_READER_PLUGIN_ID
		);
		expect(getSplitPluginResidueOwnerPluginId("wdeck_migration")).toBeNull();
	});

	it("delegates split-plugin residue checks when standalone plugin is installed", () => {
		const app = createApp({
			[INCREMENTAL_READING_PLUGIN_ID]: {},
		});

		expect(
			isSplitPluginResidueDelegatedToStandalonePlugin(app, "ir_material_consistency")
		).toBe(true);
		expect(
			isSplitPluginResidueDelegatedToStandalonePlugin(app, "epub_markdown_source_id_backfill")
		).toBe(false);
		expect(shouldWeaveHostIncrementalReadingDomainServices(app)).toBe(false);
		expect(shouldWeaveInitializeIncrementalReadingMaterialStack(app)).toBe(false);
		expect(shouldWeaveHostIncrementalReadingVaultListeners(app)).toBe(false);
		expect(shouldWeaveRunIncrementalReadingFolderSubscription(app)).toBe(false);
	});

	it("opens incremental reading data management through host api when available", () => {
		const openDataManagementModal = vi.fn();
		const app = createApp({
			[INCREMENTAL_READING_PLUGIN_ID]: { openDataManagementModal },
		});

		expect(openIncrementalReadingDataManagement(app)).toBe(true);
		expect(openDataManagementModal).toHaveBeenCalledTimes(1);
	});

	it("opens epub reader data management through host api when available", () => {
		const openDataManagementModal = vi.fn();
		const app = createApp({
			[EPUB_READER_PLUGIN_ID]: { openDataManagementModal },
		});

		expect(openEpubReaderDataManagement(app)).toBe(true);
		expect(openDataManagementModal).toHaveBeenCalledTimes(1);
	});

	it("detects disabled split plugins separately from missing plugins", () => {
		const missingApp = createApp();
		expect(getIncrementalReadingPluginAvailability(missingApp)).toBe("missing");

		const disabledApp = createApp(
			{},
			{ [INCREMENTAL_READING_PLUGIN_ID]: { id: INCREMENTAL_READING_PLUGIN_ID } },
			[]
		);
		expect(getIncrementalReadingPluginAvailability(disabledApp)).toBe("disabled");
		expect(getEpubReaderPluginAvailability(disabledApp)).toBe("missing");

		const availableApp = createApp({ [EPUB_READER_PLUGIN_ID]: {} });
		expect(getEpubReaderPluginAvailability(availableApp)).toBe("available");
	});

	it("detects enabled-but-not-loaded split plugins separately from disabled plugins", () => {
		const failedApp = createApp(
			{},
			{ [EPUB_READER_PLUGIN_ID]: { id: EPUB_READER_PLUGIN_ID } },
			[EPUB_READER_PLUGIN_ID]
		);

		expect(getEpubReaderPluginAvailability(failedApp)).toBe("failed");
	});
});
