import { logger } from "../../../utils/logger";
/**
 * 配置迁移脚本：移除双向同步功能
 *
 * 将旧的双向同步配置迁移为单向同步配置
 * 执行日期：2025-10-16
 */

import type {
	AnkiConnectSettings,
	DeckSyncMapping,
} from "../../../components/settings/types/settings-types";

export interface LegacyAnkiConnectSettings extends Omit<AnkiConnectSettings, "bidirectionalSync"> {
	bidirectionalSync?: {
		enabled: boolean;
		exclusiveTemplatesOnly: boolean;
		conflictResolution: string;
		autoMergeNonConflictFields: boolean;
		autoMergeTags: boolean;
	};
}

/**
 * 迁移 AnkiConnect 配置
 */
export function migrateAnkiConnectSettings(
	legacySettings: LegacyAnkiConnectSettings
): AnkiConnectSettings {
	const { bidirectionalSync, ...rest } = legacySettings;

	// 迁移牌组映射：将旧的导入或双向映射统一改为导出到 Anki
	const migratedDeckMappings: Record<string, DeckSyncMapping> = {};

	for (const [key, mapping] of Object.entries(rest.deckMappings || {})) {
		migratedDeckMappings[key] = {
			...mapping,
			syncDirection: "to_anki",
		};
	}

	// 移除模板映射中的 isBidirectionalCapable
	const migratedTemplateMappings: Record<string, unknown> = {};

	for (const [key, mapping] of Object.entries(rest.templateMappings || {})) {
		const { isBidirectionalCapable: _isBidirectionalCapable, ...cleanMapping } = mapping as Record<
			string,
			unknown
		>;
		migratedTemplateMappings[key] = cleanMapping;
	}

	logger.debug("[Migration] 已移除导入/双向同步配置，牌组映射已迁移为仅导出到 Anki");
	if (bidirectionalSync?.enabled) {
		logger.warn("[Migration] 旧的双向同步配置已停用，牌组映射已统一改为导出到 Anki");
	}

	return {
		...rest,
		deckMappings: migratedDeckMappings,
		templateMappings: migratedTemplateMappings,
	} as AnkiConnectSettings;
}

/**
 * 检查是否需要迁移
 */
export function needsMigration(settings: unknown): boolean {
	return settings?.bidirectionalSync !== undefined;
}

/**
 * 执行迁移
 */
export async function executeMigration(
	settings: LegacyAnkiConnectSettings
): Promise<AnkiConnectSettings> {
	logger.debug("[Migration] 开始执行双向同步移除迁移...");

	const migratedSettings = migrateAnkiConnectSettings(settings);

	logger.debug("[Migration] 迁移完成");
	logger.debug("[Migration] - 已移除 bidirectionalSync 配置");
	logger.debug("[Migration] - 已更新牌组映射同步方向");
	logger.debug("[Migration] - 已清理模板映射双向标识");

	return migratedSettings;
}
