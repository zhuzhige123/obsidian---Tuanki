/**
 * 简化文件选择器服务
 * 负责管理批量解析的文件扫描范围
 * 
 * 功能：
 * 1. 获取库中所有文件夹
 * 2. 管理包含/排除列表
 * 3. 解析文件扫描范围
 * 4. 获取符合条件的文件列表
 */

import { TFile, TFolder, Vault, MetadataCache } from 'obsidian';

/**
 * 文件选择配置
 */
export interface FileSelectorConfig {
  /** 包含的文件夹路径（空数组表示全库） */
  includeFolders: string[];
  
  /** 排除的文件夹路径 */
  excludeFolders: string[];
  
  /** 是否递归扫描子文件夹 */
  recursive: boolean;
  
  /** 是否仅扫描包含批量标记的文件 */
  onlyMarkedFiles: boolean;
  
  /** 批量解析范围起始标记 */
  rangeStartMarker?: string;
  
  /** 批量解析范围结束标记 */
  rangeEndMarker?: string;
}

/**
 * 文件夹信息
 */
export interface FolderInfo {
  path: string;
  name: string;
  level: number;
  childCount: number;
}

/**
 * 扫描统计
 */
export interface ScanStats {
  totalFiles: number;
  includedFiles: number;
  excludedFiles: number;
  markedFiles: number;
}

/**
 * 简化文件选择器服务
 */
export class SimpleFileSelectorService {
  private vault: Vault;
  private metadataCache: MetadataCache;

  constructor(vault: Vault, metadataCache: MetadataCache) {
    this.vault = vault;
    this.metadataCache = metadataCache;
  }

  /**
   * 获取库中所有文件夹
   */
  getAllFolders(): FolderInfo[] {
    const folders: FolderInfo[] = [];
    const root = this.vault.getRoot();

    const traverse = (folder: TFolder, level: number = 0) => {
      if (folder.path !== '/') {
        folders.push({
          path: folder.path || '.',
          name: folder.name || '根目录',
          level,
          childCount: folder.children.length
        });
      }

      for (const child of folder.children) {
        if (child instanceof TFolder) {
          traverse(child, level + 1);
        }
      }
    };

    traverse(root);
    return folders.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * 获取符合条件的文件列表
   */
  async getFilesInScope(config: FileSelectorConfig): Promise<TFile[]> {
    const allFiles = this.vault.getMarkdownFiles();
    const filesInScope: TFile[] = [];

    for (const file of allFiles) {
      if (await this.shouldIncludeFile(file, config)) {
        filesInScope.push(file);
      }
    }

    return filesInScope;
  }

  /**
   * 判断文件是否应该包含在扫描范围内
   */
  private async shouldIncludeFile(
    file: TFile,
    config: FileSelectorConfig
  ): Promise<boolean> {
    const filePath = file.path;

    // 1. 检查排除列表
    if (this.isInExcludedFolders(filePath, config.excludeFolders)) {
      return false;
    }

    // 2. 检查包含列表
    if (!this.isInIncludedFolders(filePath, config.includeFolders, config.recursive)) {
      return false;
    }

    // 3. 如果需要检查批量标记
    if (config.onlyMarkedFiles && config.rangeStartMarker && config.rangeEndMarker) {
      return await this.hasMarkers(file, config.rangeStartMarker, config.rangeEndMarker);
    }

    return true;
  }

  /**
   * 检查文件是否在排除的文件夹中
   */
  private isInExcludedFolders(filePath: string, excludeFolders: string[]): boolean {
    if (excludeFolders.length === 0) {
      return false;
    }

    for (const excludeFolder of excludeFolders) {
      const normalizedExclude = this.normalizePath(excludeFolder);
      if (filePath.startsWith(normalizedExclude)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查文件是否在包含的文件夹中
   */
  private isInIncludedFolders(
    filePath: string,
    includeFolders: string[],
    recursive: boolean
  ): boolean {
    // 空数组表示全库扫描
    if (includeFolders.length === 0) {
      return true;
    }

    for (const includeFolder of includeFolders) {
      const normalizedInclude = this.normalizePath(includeFolder);
      
      if (recursive) {
        // 递归模式：文件路径以包含文件夹开头
        if (filePath.startsWith(normalizedInclude)) {
          return true;
        }
      } else {
        // 非递归模式：文件必须直接在该文件夹中
        const fileFolder = this.getParentFolder(filePath);
        if (fileFolder === normalizedInclude) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检查文件是否包含批量解析标记
   */
  private async hasMarkers(
    file: TFile,
    startMarker: string,
    endMarker: string
  ): Promise<boolean> {
    try {
      const content = await this.vault.read(file);
      return content.includes(startMarker) && content.includes(endMarker);
    } catch (error) {
      console.error(`[SimpleFileSelectorService] 读取文件失败: ${file.path}`, error);
      return false;
    }
  }

  /**
   * 规范化路径
   */
  private normalizePath(path: string): string {
    if (!path || path === '.') {
      return '';
    }
    
    // 移除开头的斜杠
    let normalized = path.replace(/^\/+/, '');
    
    // 确保以斜杠结尾（方便startsWith检查）
    if (!normalized.endsWith('/')) {
      normalized += '/';
    }
    
    return normalized;
  }

  /**
   * 获取文件的父文件夹路径
   */
  private getParentFolder(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) {
      return '';
    }
    return filePath.substring(0, lastSlash) + '/';
  }

  /**
   * 获取扫描统计信息
   */
  async getScanStats(config: FileSelectorConfig): Promise<ScanStats> {
    const allFiles = this.vault.getMarkdownFiles();
    const stats: ScanStats = {
      totalFiles: allFiles.length,
      includedFiles: 0,
      excludedFiles: 0,
      markedFiles: 0
    };

    for (const file of allFiles) {
      const included = await this.shouldIncludeFile(file, config);
      
      if (included) {
        stats.includedFiles++;
        
        // 检查是否有标记
        if (config.rangeStartMarker && config.rangeEndMarker) {
          const hasMarker = await this.hasMarkers(
            file,
            config.rangeStartMarker,
            config.rangeEndMarker
          );
          if (hasMarker) {
            stats.markedFiles++;
          }
        }
      } else {
        stats.excludedFiles++;
      }
    }

    return stats;
  }

  /**
   * 验证文件夹路径是否存在
   */
  isFolderExists(folderPath: string): boolean {
    const normalizedPath = folderPath === '.' ? '' : folderPath;
    const folder = this.vault.getAbstractFileByPath(normalizedPath);
    return folder !== null && folder instanceof TFolder;
  }

  /**
   * 获取文件夹的子文件夹
   */
  getSubFolders(folderPath: string): FolderInfo[] {
    const normalizedPath = folderPath === '.' ? '' : folderPath;
    const folder = this.vault.getAbstractFileByPath(normalizedPath);
    
    if (!folder || !(folder instanceof TFolder)) {
      return [];
    }

    const subFolders: FolderInfo[] = [];
    const level = folderPath.split('/').filter(p => p).length;

    for (const child of folder.children) {
      if (child instanceof TFolder) {
        subFolders.push({
          path: child.path,
          name: child.name,
          level: level + 1,
          childCount: child.children.length
        });
      }
    }

    return subFolders.sort((a, b) => a.name.localeCompare(b.name));
  }
}



