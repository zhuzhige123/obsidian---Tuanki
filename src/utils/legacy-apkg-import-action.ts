import { Notice } from "obsidian";
import type { ImportResult } from "../domain/apkg/types";
import type WeavePlugin from "../main";
import type { WeaveDataStorage } from "../data/storage";

/** 主界面菜单 / 顶栏触发旧版 APKG 导入的统一事件名 */
export const LEGACY_APKG_IMPORT_REQUEST_EVENT = "Weave:legacy-apkg-import-request";

/** @deprecated 仍监听旧事件名，避免外部脚本或旧构建残留 */
export const LEGACY_APKG_IMPORT_DOCUMENT_EVENT = "apkg-import";

export interface LegacyApkgImportNavigationVisibility {
	apkgImport?: boolean;
}

export function isLegacyApkgImportNavigationEnabled(
	visibility?: LegacyApkgImportNavigationVisibility | null
): boolean {
	return visibility?.apkgImport !== false;
}

/** 当前安装包是否在构建时包含旧版 APKG 导入模块 */
export function isLegacyApkgImportBundled(): boolean {
	return typeof __WEAVE_LEGACY_APKG_RUNTIME__ === "undefined" || __WEAVE_LEGACY_APKG_RUNTIME__;
}

/** 主菜单是否应展示「导入旧版卡包」入口（与牌组学习移动菜单策略一致） */
export function isLegacyApkgImportMenuVisible(
	visibility?: LegacyApkgImportNavigationVisibility | null
): boolean {
	return isLegacyApkgImportNavigationEnabled(visibility);
}

export function dispatchLegacyApkgImportRequest(): void {
	window.dispatchEvent(new CustomEvent(LEGACY_APKG_IMPORT_REQUEST_EVENT));
}

let apkgImportModalInstance:
	| import("../components/modals/APKGImportModalObsidian").APKGImportModalObsidian
	| null = null;

export interface OpenLegacyApkgImportModalOptions {
	onImportComplete?: (result: ImportResult) => void | Promise<void>;
	onClose?: () => void;
}

export async function openLegacyApkgImportModal(
	plugin: WeavePlugin,
	dataStorage: WeaveDataStorage,
	options: OpenLegacyApkgImportModalOptions = {}
): Promise<void> {
	await plugin.refreshLegacyApkgImportRuntimeStatus();

	if (!plugin.hasLegacyApkgImportRuntime()) {
		if (await plugin.isLegacyApkgWasmFilePresent()) {
			new Notice(plugin.getLegacyApkgImportRestartMessage(), 8000);
		} else {
			new Notice(plugin.getLegacyApkgImportUnavailableMessage(), 8000);
		}
		return;
	}

	apkgImportModalInstance?.close();

	const { APKGImportModalObsidian } = await import("../components/modals/APKGImportModalObsidian");

	apkgImportModalInstance = new APKGImportModalObsidian(plugin.app, {
		plugin,
		dataStorage,
		wasmUrl: plugin.wasmUrl,
		legacyImportAvailable: plugin.hasLegacyApkgImportRuntime(),
		legacyImportHelpText: plugin.getLegacyApkgImportUnavailableMessage(),
		onImportComplete: (result) => {
			void options.onImportComplete?.(result);
		},
		onClose: () => {
			apkgImportModalInstance = null;
			options.onClose?.();
		},
	});
	apkgImportModalInstance.open();
}

export function requestLegacyApkgImport(
	plugin: WeavePlugin,
	dataStorage: WeaveDataStorage,
	options: OpenLegacyApkgImportModalOptions = {}
): void {
	void openLegacyApkgImportModal(plugin, dataStorage, options);
}

export function closeLegacyApkgImportModal(): void {
	apkgImportModalInstance?.close();
	apkgImportModalInstance = null;
}

export function registerLegacyApkgImportRequestListener(
	plugin: WeavePlugin,
	getDataStorage: () => WeaveDataStorage | null | undefined,
	options: OpenLegacyApkgImportModalOptions = {}
): () => void {
	const handleRequest = () => {
		const dataStorage = getDataStorage();
		if (!dataStorage) {
			new Notice(plugin.getLegacyApkgImportUnavailableMessage(), 8000);
			return;
		}

		requestLegacyApkgImport(plugin, dataStorage, options);
	};

	const handleLegacyDocumentEvent = () => {
		handleRequest();
	};

	window.addEventListener(LEGACY_APKG_IMPORT_REQUEST_EVENT, handleRequest);
	document.addEventListener(LEGACY_APKG_IMPORT_DOCUMENT_EVENT, handleLegacyDocumentEvent);

	return () => {
		window.removeEventListener(LEGACY_APKG_IMPORT_REQUEST_EVENT, handleRequest);
		document.removeEventListener(LEGACY_APKG_IMPORT_DOCUMENT_EVENT, handleLegacyDocumentEvent);
	};
}
