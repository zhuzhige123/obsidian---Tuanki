/**
 * UUID存储实现
 * 实现 IUUIDStorage 接口，提供UUID记录的持久化存储
 */

import { IUUIDStorage, UUIDRecord } from '../batch-parsing';

/**
 * UUID存储实现类
 */
export class UUIDStorageImpl implements IUUIDStorage {
  private records: Map<string, UUIDRecord> = new Map();
  private cardIdIndex: Map<string, string> = new Map(); // cardId -> uuid
  private filePathIndex: Map<string, Set<string>> = new Map(); // filePath -> Set<uuid>

  constructor() {
    // 可以从本地存储加载数据
    this.loadFromStorage();
  }

  /**
   * 保存UUID记录
   */
  async saveRecord(record: UUIDRecord): Promise<void> {
    this.records.set(record.uuid, record);
    this.cardIdIndex.set(record.cardId, record.uuid);
    
    // 更新文件路径索引
    if (!this.filePathIndex.has(record.sourceFile)) {
      this.filePathIndex.set(record.sourceFile, new Set());
    }
    this.filePathIndex.get(record.sourceFile)!.add(record.uuid);

    // 持久化到存储
    await this.persistToStorage();
  }

  /**
   * 根据UUID获取记录
   */
  async getRecordByUUID(uuid: string): Promise<UUIDRecord | null> {
    return this.records.get(uuid) || null;
  }

  /**
   * 根据卡片ID获取记录
   */
  async getRecordByCardId(cardId: string): Promise<UUIDRecord | null> {
    const uuid = this.cardIdIndex.get(cardId);
    if (!uuid) return null;
    return this.records.get(uuid) || null;
  }

  /**
   * 删除记录
   */
  async deleteRecord(uuid: string): Promise<void> {
    const record = this.records.get(uuid);
    if (!record) return;

    // 清理索引
    this.cardIdIndex.delete(record.cardId);
    
    const fileUuids = this.filePathIndex.get(record.sourceFile);
    if (fileUuids) {
      fileUuids.delete(uuid);
      if (fileUuids.size === 0) {
        this.filePathIndex.delete(record.sourceFile);
      }
    }

    this.records.delete(uuid);
    await this.persistToStorage();
  }

  /**
   * 检查UUID是否存在
   */
  async uuidExists(uuid: string): Promise<boolean> {
    return this.records.has(uuid);
  }

  /**
   * 获取文件的所有UUID
   */
  async getFileUUIDs(filePath: string): Promise<UUIDRecord[]> {
    const uuids = this.filePathIndex.get(filePath);
    if (!uuids) return [];

    const records: UUIDRecord[] = [];
    for (const uuid of uuids) {
      const record = this.records.get(uuid);
      if (record) records.push(record);
    }

    return records;
  }

  /**
   * 从存储加载数据
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const data = localStorage.getItem('tuanki-uuid-records');
      if (!data) return;

      const parsed = JSON.parse(data) as Array<UUIDRecord>;
      
      for (const record of parsed) {
        // 转换日期字符串为Date对象
        const recordWithDates: UUIDRecord = {
          ...record,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt)
        };
        
        this.records.set(record.uuid, recordWithDates);
        this.cardIdIndex.set(record.cardId, record.uuid);
        
        if (!this.filePathIndex.has(record.sourceFile)) {
          this.filePathIndex.set(record.sourceFile, new Set());
        }
        this.filePathIndex.get(record.sourceFile)!.add(record.uuid);
      }

      console.log(`[UUIDStorageImpl] 已加载 ${this.records.size} 条UUID记录`);
    } catch (error) {
      console.error('[UUIDStorageImpl] 加载UUID记录失败:', error);
    }
  }

  /**
   * 持久化到存储
   */
  private async persistToStorage(): Promise<void> {
    try {
      const records = Array.from(this.records.values());
      localStorage.setItem('tuanki-uuid-records', JSON.stringify(records));
    } catch (error) {
      console.error('[UUIDStorageImpl] 持久化UUID记录失败:', error);
    }
  }

  /**
   * 清空所有记录
   */
  async clear(): Promise<void> {
    this.records.clear();
    this.cardIdIndex.clear();
    this.filePathIndex.clear();
    await this.persistToStorage();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalRecords: this.records.size,
      totalFiles: this.filePathIndex.size
    };
  }
}

