/**
 * 源文档路径匹配工具
 * 处理各种格式的路径表示，提供统一的匹配逻辑
 * 
 * @module source-path-matcher
 * @description 用于网格卡片视图的文档级筛选功能
 */

import type { Card } from '../data/types';

/**
 * 从卡片中提取源文档路径（按优先级）
 * 
 * @param card - 卡片对象
 * @returns 源文档路径，如果不存在则返回 null
 */
export function extractSourcePath(card: Card): string | null {
  // 优先级1: sourceFile 字段（标准字段，v0.8+）
  if (card.sourceFile) {
    return card.sourceFile;
  }
  
  // 优先级2: fields.source_document（早期版本）
  if (card.fields?.source_document) {
    return card.fields.source_document as string;
  }
  
  // 优先级3: customFields.obsidianFilePath（向后兼容）
  if (card.customFields?.obsidianFilePath) {
    return card.customFields.obsidianFilePath as string;
  }
  
  return null;
}

/**
 * 标准化路径用于比较
 * 移除扩展名、前导斜杠，转小写
 * 
 * @param path - 原始路径
 * @returns 标准化后的路径
 * 
 * @example
 * normalizePathForComparison("Folder/Note.md") // => "folder/note"
 * normalizePathForComparison("/path/to/File.MD") // => "path/to/file"
 */
export function normalizePathForComparison(path: string): string {
  let normalized = path;
  
  // 移除 .md 扩展名（不区分大小写）
  normalized = normalized.replace(/\.md$/i, '');
  
  // 移除前导斜杠
  normalized = normalized.replace(/^\/+/, '');
  
  // 转换为小写（处理大小写不敏感的文件系统）
  normalized = normalized.toLowerCase();
  
  // 统一路径分隔符（处理Windows路径）
  normalized = normalized.replace(/\\/g, '/');
  
  return normalized;
}

/**
 * 提取文件基础名（不含路径和扩展名）
 * 
 * @param path - 文件路径
 * @returns 文件基础名
 * 
 * @example
 * extractBasename("folder/subfolder/note.md") // => "note"
 * extractBasename("note") // => "note"
 */
export function extractBasename(path: string): string {
  // 统一路径分隔符
  const normalizedPath = path.replace(/\\/g, '/');
  
  // 分割路径
  const parts = normalizedPath.split('/');
  const filename = parts[parts.length - 1];
  
  // 移除扩展名并转小写
  return filename.replace(/\.md$/i, '').toLowerCase();
}

/**
 * 智能匹配：判断卡片是否来自指定文档
 * 
 * 使用多策略匹配：
 * 1. 完整路径匹配（最准确）
 * 2. 文件名匹配（兼容性）
 * 3. 路径结尾匹配（处理相对路径）
 * 
 * @param card - 待匹配的卡片
 * @param targetPath - 目标文档路径（来自 TFile.path）
 * @returns 是否匹配
 * 
 * @example
 * const card = { sourceFile: "folder/note.md", ... };
 * matchesSourceDocument(card, "folder/note.md") // => true
 * matchesSourceDocument(card, "note.md") // => true (basename match)
 * matchesSourceDocument(card, "note") // => true (basename match)
 */
export function matchesSourceDocument(card: Card, targetPath: string): boolean {
  const cardSource = extractSourcePath(card);
  
  if (!cardSource || !targetPath) {
    return false;
  }
  
  // 策略1: 完整路径匹配（最准确）
  const normalizedCard = normalizePathForComparison(cardSource);
  const normalizedTarget = normalizePathForComparison(targetPath);
  
  if (normalizedCard === normalizedTarget) {
    return true;
  }
  
  // 策略2: 文件名匹配（兼容性）
  const cardBasename = extractBasename(cardSource);
  const targetBasename = extractBasename(targetPath);
  
  if (cardBasename === targetBasename && cardBasename !== '') {
    return true;
  }
  
  // 策略3: 路径结尾匹配（处理相对路径）
  // 例如: cardSource="note.md", targetPath="folder/note.md"
  if (normalizedTarget.endsWith('/' + normalizedCard) || 
      normalizedTarget.endsWith(normalizedCard)) {
    return true;
  }
  
  // 反向匹配（处理cardSource是完整路径，targetPath是短路径的情况）
  if (normalizedCard.endsWith('/' + normalizedTarget) || 
      normalizedCard.endsWith(normalizedTarget)) {
    return true;
  }
  
  return false;
}

/**
 * 批量筛选：获取来自指定文档的所有卡片
 * 
 * @param cards - 卡片数组
 * @param targetPath - 目标文档路径
 * @returns 匹配的卡片数组
 * 
 * @example
 * const activeCards = filterCardsBySourceDocument(allCards, "note.md");
 */
export function filterCardsBySourceDocument(
  cards: Card[], 
  targetPath: string | null
): Card[] {
  if (!targetPath) {
    return [];
  }
  
  return cards.filter(card => matchesSourceDocument(card, targetPath));
}

/**
 * 性能优化：构建源文档->卡片的映射表
 * 
 * 用于频繁查询时避免重复遍历
 * 
 * @param cards - 卡片数组
 * @returns Map<标准化路径, 卡片数组>
 * 
 * @example
 * const map = buildSourceDocumentMap(allCards);
 * const noteCards = map.get(normalizePathForComparison("note.md"));
 */
export function buildSourceDocumentMap(cards: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  
  cards.forEach(card => {
    const source = extractSourcePath(card);
    if (source) {
      const normalized = normalizePathForComparison(source);
      
      if (!map.has(normalized)) {
        map.set(normalized, []);
      }
      
      map.get(normalized)!.push(card);
    }
  });
  
  return map;
}

/**
 * 调试工具：获取卡片的源文档信息
 * 
 * @param card - 卡片对象
 * @returns 源文档信息对象
 */
export function debugSourceInfo(card: Card): {
  hasSource: boolean;
  sourceFile?: string;
  fieldsSourceDoc?: string;
  customFieldsPath?: string;
  extractedPath: string | null;
  normalized: string | null;
  basename: string | null;
} {
  const extractedPath = extractSourcePath(card);
  
  return {
    hasSource: extractedPath !== null,
    sourceFile: card.sourceFile,
    fieldsSourceDoc: card.fields?.source_document as string | undefined,
    customFieldsPath: card.customFields?.obsidianFilePath as string | undefined,
    extractedPath,
    normalized: extractedPath ? normalizePathForComparison(extractedPath) : null,
    basename: extractedPath ? extractBasename(extractedPath) : null
  };
}


