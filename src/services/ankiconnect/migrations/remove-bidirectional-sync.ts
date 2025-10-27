/**
 * 配置迁移脚本：移除双向同步功能
 * 
 * 将旧的双向同步配置迁移为单向同步配置
 * 执行日期：2025-10-16
 */

import type { AnkiConnectSettings, DeckSyncMapping } from '../../../components/settings/types/settings-types';

export interface LegacyAnkiConnectSettings extends Omit<AnkiConnectSettings, 'bidirectionalSync'> {
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

  // 迁移牌组映射：将 'bidirectional' 改为 'to_anki'
  const migratedDeckMappings: Record<string, DeckSyncMapping> = {};
  
  for (const [key, mapping] of Object.entries(rest.deckMappings || {})) {
    migratedDeckMappings[key] = {
      ...mapping,
      syncDirection: mapping.syncDirection === 'bidirectional' 
        ? 'to_anki'  // 默认改为导出到 Anki
        : mapping.syncDirection as 'to_anki' | 'from_anki'
    };
  }

  // 移除模板映射中的 isBidirectionalCapable
  const migratedTemplateMappings: Record<string, any> = {};
  
  for (const [key, mapping] of Object.entries(rest.templateMappings || {})) {
    const { isBidirectionalCapable, ...cleanMapping } = mapping as any;
    migratedTemplateMappings[key] = cleanMapping;
  }

  console.log('[Migration] 已移除双向同步配置，牌组映射已迁移为单向同步');
  if (bidirectionalSync?.enabled) {
    console.warn('[Migration] 双向同步已被禁用，请检查牌组映射的同步方向设置');
  }

  return {
    ...rest,
    deckMappings: migratedDeckMappings,
    templateMappings: migratedTemplateMappings
  } as AnkiConnectSettings;
}

/**
 * 检查是否需要迁移
 */
export function needsMigration(settings: any): boolean {
  return settings?.bidirectionalSync !== undefined;
}

/**
 * 执行迁移
 */
export async function executeMigration(
  settings: LegacyAnkiConnectSettings
): Promise<AnkiConnectSettings> {
  console.log('[Migration] 开始执行双向同步移除迁移...');
  
  const migratedSettings = migrateAnkiConnectSettings(settings);
  
  console.log('[Migration] 迁移完成');
  console.log('[Migration] - 已移除 bidirectionalSync 配置');
  console.log('[Migration] - 已更新牌组映射同步方向');
  console.log('[Migration] - 已清理模板映射双向标识');
  
  return migratedSettings;
}


