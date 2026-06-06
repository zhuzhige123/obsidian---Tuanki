import { Notice } from "obsidian";
import type { App } from "obsidian";
import { t } from "./i18n";

/** 独立增量阅读插件 ID（与 `ir-runtime.ts` standalone 构建一致） */
export const INCREMENTAL_READING_PLUGIN_ID = "weave-incremental-reading";

/** 独立 EPUB 阅读器插件 ID */
export const EPUB_READER_PLUGIN_ID = "weave-epub-reader";

export type SplitPluginAvailability = "available" | "disabled" | "missing";

/** Weave 数据管理中已委托给拆分插件的检测项前缀 */
const SPLIT_PLUGIN_IR_CHECK_PREFIX = "ir_";
const SPLIT_PLUGIN_EPUB_CHECK_PREFIX = "epub_";

function getInstalledPlugin(app: App, pluginId: string): unknown {
	return app.plugins?.getPlugin?.(pluginId) ?? null;
}

function getPluginManifest(app: App, pluginId: string): unknown {
	const manifests = (app.plugins as { manifests?: Record<string, unknown> } | undefined)?.manifests;
	return manifests?.[pluginId] ?? null;
}

export function getSplitPluginAvailability(app: App, pluginId: string): SplitPluginAvailability {
	if (getInstalledPlugin(app, pluginId)) {
		return "available";
	}
	if (getPluginManifest(app, pluginId)) {
		return "disabled";
	}
	return "missing";
}

export function getIncrementalReadingPluginAvailability(app: App): SplitPluginAvailability {
	return getSplitPluginAvailability(app, INCREMENTAL_READING_PLUGIN_ID);
}

export function getEpubReaderPluginAvailability(app: App): SplitPluginAvailability {
	return getSplitPluginAvailability(app, EPUB_READER_PLUGIN_ID);
}

export function isIncrementalReadingPluginInstalled(app: App): boolean {
	return getIncrementalReadingPluginAvailability(app) === "available";
}

export function isEpubReaderPluginInstalled(app: App): boolean {
	return getEpubReaderPluginAvailability(app) === "available";
}

function translateOrFallback(
	key: string,
	fallback: string,
	vars?: Record<string, string>
): string {
	const translated = t(key, vars);
	return translated === key ? fallback : translated;
}

export function getSplitPluginDisplayName(pluginId: string): string {
	switch (pluginId) {
		case INCREMENTAL_READING_PLUGIN_ID:
			return translateOrFallback(
				"integrations.splitPlugins.incrementalReadingName",
				"Weave 增量阅读"
			);
		case EPUB_READER_PLUGIN_ID:
			return translateOrFallback(
				"integrations.splitPlugins.epubReaderName",
				"Weave EPUB 阅读器"
			);
		default:
			return pluginId;
	}
}

export function getSplitPluginUnavailableMessage(app: App, pluginId: string): string {
	const pluginName = getSplitPluginDisplayName(pluginId);
	const availability = getSplitPluginAvailability(app, pluginId);
	if (availability === "disabled") {
		return translateOrFallback(
			"integrations.splitPlugins.unavailableDisabled",
			`${pluginName}（${pluginId}）已安装但未启用。请在 Obsidian 设置 → 社区插件中启用。`,
			{ pluginId, pluginName }
		);
	}
	return translateOrFallback(
		"integrations.splitPlugins.unavailableMissing",
		`未检测到 ${pluginName}（${pluginId}）。请在 Obsidian 设置 → 社区插件中安装并启用。`,
		{ pluginId, pluginName }
	);
}

export function notifySplitPluginUnavailable(app: App, pluginId: string): void {
	if (getSplitPluginAvailability(app, pluginId) === "available") {
		return;
	}
	new Notice(getSplitPluginUnavailableMessage(app, pluginId), 4500);
}

/**
 * Weave 不再托管 IR 领域（材料栈、标签组、vault 监听、文件夹订阅等）。
 * 长期由独立插件 weave-incremental-reading 全权负责。
 */
export function shouldWeaveHostIncrementalReadingDomainServices(_app: App): boolean {
	return false;
}

export function shouldWeaveInitializeIncrementalReadingMaterialStack(_app: App): boolean {
	return false;
}

export function shouldWeaveHostIncrementalReadingVaultListeners(_app: App): boolean {
	return false;
}

export function shouldWeaveRunIncrementalReadingFolderSubscription(_app: App): boolean {
	return false;
}

/** 拆分插件残留检测项归属的独立插件 ID */
export function getSplitPluginResidueOwnerPluginId(
	checkType: string
): typeof INCREMENTAL_READING_PLUGIN_ID | typeof EPUB_READER_PLUGIN_ID | null {
	if (checkType.startsWith(SPLIT_PLUGIN_IR_CHECK_PREFIX)) {
		return INCREMENTAL_READING_PLUGIN_ID;
	}
	if (checkType.startsWith(SPLIT_PLUGIN_EPUB_CHECK_PREFIX)) {
		return EPUB_READER_PLUGIN_ID;
	}
	return null;
}

/** 独立拆分插件已安装时，Weave 不再执行对应残留检测/修复 */
export function isSplitPluginResidueDelegatedToStandalonePlugin(
	app: App,
	checkType: string
): boolean {
	const ownerPluginId = getSplitPluginResidueOwnerPluginId(checkType);
	return ownerPluginId ? Boolean(getInstalledPlugin(app, ownerPluginId)) : false;
}

export type IncrementalReadingHostApi = {
	openDataManagementModal?: () => void;
};

export type EpubReaderHostApi = {
	openDataManagementModal?: () => void;
};

/** 从 Weave 宿主打开独立 IR 插件的数据管理界面（若已安装且暴露 API） */
export function openIncrementalReadingDataManagement(
	app: App,
	options?: { silent?: boolean }
): boolean {
	const irPlugin = getInstalledPlugin(
		app,
		INCREMENTAL_READING_PLUGIN_ID
	) as IncrementalReadingHostApi | null;
	if (!irPlugin?.openDataManagementModal) {
		if (!options?.silent) {
			notifySplitPluginUnavailable(app, INCREMENTAL_READING_PLUGIN_ID);
		}
		return false;
	}

	irPlugin.openDataManagementModal();
	return true;
}

/** 从 Weave 宿主打开独立 EPUB 插件的数据管理界面（若已安装且暴露 API） */
export function openEpubReaderDataManagement(app: App, options?: { silent?: boolean }): boolean {
	const epubPlugin = getInstalledPlugin(app, EPUB_READER_PLUGIN_ID) as EpubReaderHostApi | null;
	if (!epubPlugin?.openDataManagementModal) {
		if (!options?.silent) {
			notifySplitPluginUnavailable(app, EPUB_READER_PLUGIN_ID);
		}
		return false;
	}

	epubPlugin.openDataManagementModal();
	return true;
}
