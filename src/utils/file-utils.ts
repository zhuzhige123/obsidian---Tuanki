/**
 * 文件操作工具函数
 */

import type { TFile } from 'obsidian';
import type { ObsidianFileInfo } from '../types/ai-types';

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 将TFile转换为ObsidianFileInfo
 */
export function fileToInfo(file: TFile): ObsidianFileInfo {
  return {
    path: file.path,
    name: file.name,
    size: file.stat.size,
    file: file,
    extension: file.extension
  };
}

/**
 * 过滤Markdown文件
 */
export function filterMarkdownFiles(files: TFile[]): TFile[] {
  return files.filter(file => file.extension === 'md');
}

/**
 * 按名称或路径搜索文件
 */
export function searchFiles(files: ObsidianFileInfo[], query: string): ObsidianFileInfo[] {
  const lowerQuery = query.toLowerCase();
  
  return files.filter(file => 
    file.name.toLowerCase().includes(lowerQuery) ||
    file.path.toLowerCase().includes(lowerQuery)
  );
}

/**
 * 按路径排序文件
 */
export function sortFilesByPath(files: ObsidianFileInfo[]): ObsidianFileInfo[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 按大小排序文件
 */
export function sortFilesBySize(files: ObsidianFileInfo[], descending = true): ObsidianFileInfo[] {
  return [...files].sort((a, b) => descending ? b.size - a.size : a.size - b.size);
}

/**
 * 按修改时间排序文件
 */
export function sortFilesByModified(files: TFile[], descending = true): TFile[] {
  return [...files].sort((a, b) => 
    descending ? b.stat.mtime - a.stat.mtime : a.stat.mtime - b.stat.mtime
  );
}

/**
 * 获取文件所在目录
 */
export function getFileDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : filePath.substring(0, lastSlash);
}

/**
 * 检查内容长度是否适合生成
 */
export function validateContentLength(content: string): { valid: boolean; message?: string } {
  const minLength = 50;
  const maxLength = 100000; // 约100KB

  if (content.trim().length < minLength) {
    return {
      valid: false,
      message: `内容太短（少于${minLength}字符），请提供更多内容`
    };
  }

  if (content.length > maxLength) {
    return {
      valid: false,
      message: `内容太长（超过${maxLength}字符），请减少内容或分段生成`
    };
  }

  return { valid: true };
}



