/**
 * 文件系统适配器
 * 
 * 抽象文件系统操作，方便测试和平台切换
 * 
 * @module infrastructure/adapters
 */

import type { Vault, TFile, TFolder } from 'obsidian';

/**
 * 文件系统适配器接口
 */
export interface IFileSystemAdapter {
  /**
   * 检查文件是否存在
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * 检查文件夹是否存在
   */
  folderExists(path: string): Promise<boolean>;

  /**
   * 创建文件夹（递归）
   */
  createFolder(path: string): Promise<void>;

  /**
   * 读取文件（二进制）
   */
  readBinary(path: string): Promise<ArrayBuffer>;

  /**
   * 读取文件（文本）
   */
  readText(path: string): Promise<string>;

  /**
   * 写入文件（二进制）
   */
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;

  /**
   * 写入文件（文本）
   */
  writeText(path: string, content: string): Promise<void>;

  /**
   * 删除文件
   */
  deleteFile(path: string): Promise<void>;

  /**
   * 列出文件夹内容
   */
  listFolder(path: string): Promise<string[]>;

  /**
   * 获取文件对象
   */
  getFile(path: string): TFile | null;
}

/**
 * Obsidian Vault 文件系统适配器实现
 */
export class ObsidianFileSystemAdapter implements IFileSystemAdapter {
  constructor(private vault: Vault) {}

  async fileExists(path: string): Promise<boolean> {
    const file = this.vault.getAbstractFileByPath(path);
    return file !== null && file instanceof TFile;
  }

  async folderExists(path: string): Promise<boolean> {
    const folder = this.vault.getAbstractFileByPath(path);
    return folder !== null && folder instanceof TFolder;
  }

  async createFolder(path: string): Promise<void> {
    const exists = await this.folderExists(path);
    if (!exists) {
      await this.vault.createFolder(path);
    }
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return await this.vault.readBinary(file);
  }

  async readText(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return await this.vault.read(file);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const exists = await this.fileExists(path);
    if (exists) {
      const file = this.vault.getAbstractFileByPath(path) as TFile;
      await this.vault.modifyBinary(file, data);
    } else {
      await this.vault.createBinary(path, data);
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const exists = await this.fileExists(path);
    if (exists) {
      const file = this.vault.getAbstractFileByPath(path) as TFile;
      await this.vault.modify(file, content);
    } else {
      await this.vault.create(path, content);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file && file instanceof TFile) {
      await this.vault.delete(file);
    }
  }

  async listFolder(path: string): Promise<string[]> {
    const folder = this.vault.getAbstractFileByPath(path);
    if (!folder || !(folder instanceof TFolder)) {
      return [];
    }
    return folder.children.map(f => f.path);
  }

  getFile(path: string): TFile | null {
    const file = this.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }
}




