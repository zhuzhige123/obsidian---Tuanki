/**
 * 安全的文件处理工具
 */

import { validateFile, generateSecureFileName, type FileValidationConfig, DEFAULT_FILE_CONFIG } from './security';
import type AnkiPlugin from '../main';

/**
 * 文件处理结果
 */
export interface FileHandlerResult {
  success: boolean;
  error?: string;
  filePath?: string;
  fileName?: string;
}

/**
 * 安全的文件处理器类
 */
export class SecureFileHandler {
  private config: FileValidationConfig;

  constructor(config: FileValidationConfig = DEFAULT_FILE_CONFIG) {
    this.config = config;
  }

  /**
   * 处理文件上传（包含安全验证）
   */
  async handleFileUpload(file: File): Promise<FileHandlerResult> {
    try {
      // 1. 文件验证
      const validation = validateFile(file, this.config);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // 2. 生成安全的文件名
      const secureFileName = validation.sanitizedName || generateSecureFileName(file.name);

      // 3. 保存文件
      const filePath = await this.saveFile(file, secureFileName);

      return {
        success: true,
        filePath,
        fileName: secureFileName
      };

    } catch (error) {
      console.error('文件处理失败:', error);
      return {
        success: false,
        error: `文件处理失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 安全地保存文件
   */
  private async saveFile(file: File, fileName: string): Promise<string> {
    try {
      // 方法 1: Obsidian 插件环境
      if (typeof window !== 'undefined' && (window as any).app && (window as any).app.vault) {
        return await this.saveToObsidianVault(file, fileName);
      }

      // 方法 2: Web 环境备用方案
      return await this.saveToLocalStorage(file, fileName);

    } catch (error) {
      console.error('保存文件失败:', error);
      throw new Error('文件保存失败');
    }
  }

  /**
   * 保存到 Obsidian 库
   */
  private async saveToObsidianVault(file: File, fileName: string): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const vault = (window as any).app.vault;
    const attachmentFolder = vault.config?.attachmentFolderPath || 'attachments';
    
    // 确保附件文件夹存在
    try {
      await vault.createFolder(attachmentFolder);
    } catch (e) {
      // 文件夹可能已存在，忽略错误
    }
    
    const fullPath = `${attachmentFolder}/${fileName}`;
    await vault.createBinary(fullPath, arrayBuffer);
    
    console.log('文件已保存到 Obsidian 库:', fullPath);
    return fullPath;
  }

  /**
   * 保存到本地存储（Web环境备用方案）
   */
  private async saveToLocalStorage(file: File, fileName: string): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });
    const url = URL.createObjectURL(blob);
    
    // 保存文件信息到 localStorage
    const fileInfo = {
      fileName,
      url,
      type: file.type,
      size: file.size,
      timestamp: Date.now()
    };
    
    const storageKey = `attachment_${fileName}`;
    localStorage.setItem(storageKey, JSON.stringify(fileInfo));
    
    console.log('文件已保存 (Web模式):', fileName);
    return fileName;
  }

  /**
   * 获取文件URL
   */
  getFileUrl(fileName: string): string {
    // Obsidian 环境
    if (typeof window !== 'undefined' && (window as any).app && (window as any).app.vault) {
      const vault = (window as any).app.vault;
      try {
        const file = vault.getAbstractFileByPath(fileName);
        if (file) {
          return vault.getResourcePath(file);
        }
      } catch (e) {
        console.warn('无法获取 Obsidian 文件路径:', fileName, e);
      }
    }
    
    // Web 环境 - 从 localStorage 获取
    try {
      const stored = localStorage.getItem(`attachment_${fileName}`);
      if (stored) {
        const fileInfo = JSON.parse(stored);
        return fileInfo.url || fileName;
      }
    } catch (e) {
      console.warn('无法从 localStorage 获取文件:', fileName, e);
    }
    
    // 降级：返回原始文件名
    return fileName;
  }

  /**
   * 批量处理文件
   */
  async handleMultipleFiles(files: FileList | File[]): Promise<FileHandlerResult[]> {
    const results: FileHandlerResult[] = [];
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const result = await this.handleFileUpload(file);
      results.push(result);
      
      // 如果有错误，可以选择是否继续处理其他文件
      if (!result.success) {
        console.warn(`文件 ${file.name} 处理失败:`, result.error);
      }
    }

    return results;
  }

  /**
   * 清理临时文件（Web环境）
   */
  cleanupTempFiles(maxAge: number = 24 * 60 * 60 * 1000): void {
    try {
      const now = Date.now();
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('attachment_')) {
          try {
            const stored = localStorage.getItem(key);
            if (stored) {
              const fileInfo = JSON.parse(stored);
              if (now - fileInfo.timestamp > maxAge) {
                keysToRemove.push(key);
                // 释放 blob URL
                if (fileInfo.url?.startsWith('blob:')) {
                  URL.revokeObjectURL(fileInfo.url);
                }
              }
            }
          } catch (e) {
            // 解析失败的项目也应该被清理
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      if (keysToRemove.length > 0) {
        console.log(`清理了 ${keysToRemove.length} 个临时文件`);
      }
    } catch (error) {
      console.warn('清理临时文件失败:', error);
    }
  }
}

/**
 * 默认的文件处理器实例
 */
export const defaultFileHandler = new SecureFileHandler();

/**
 * CodeMirror 拖放功能 Hook
 */
export function useFileDrop(options: { onFileUrl: (url: string) => void; plugin: AnkiPlugin }) {
  const { onFileUrl, plugin } = options;

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    if (!event.dataTransfer) return;
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const handler = new SecureFileHandler();
      const results = await handler.handleMultipleFiles(files);
      
      for (const result of results) {
        if (result.success && result.filePath) {
          const linkText = `![[${result.filePath}]]`;
          onFileUrl(linkText);
        } else {
          console.error("File drop error:", result.error);
        }
      }
    }
  };

  return { handleDrop, handleDragOver };
}
