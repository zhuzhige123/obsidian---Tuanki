/**
 * 设备感知的备份管理器
 * 
 * 功能：
 * - 自动识别和隔离不同设备的备份
 * - 跨设备路径自动转换
 * - 设备备份可视化管理
 */

import type { Plugin } from 'obsidian';
import type {
  BackupData,
  BackupOptions,
  BackupResult,
  DeviceAwareBackup,
  DeviceBackupInfo,
  BackupMetadata,
  BackupLevel,
  BackupTrigger
} from '../../../types/backup-types';
import { StoragePathManager } from '../StoragePathManager';
import { IntelligentBackupCompression } from './IntelligentBackupCompression';

export class DeviceAwareBackupManager {
  private plugin: Plugin;
  private pathManager: StoragePathManager;
  private compression: IntelligentBackupCompression;
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.pathManager = new StoragePathManager(plugin);
    this.compression = new IntelligentBackupCompression();
  }
  
  /**
   * 获取设备唯一标识
   * @returns 设备ID（8位哈希）
   */
  getDeviceId(): string {
    // 基于多个因素生成稳定的设备ID
    const factors = [
      this.plugin.app.appId,           // Obsidian 应用ID
      navigator.platform,               // 平台信息
      // 不使用 vault.adapter.path（避免路径变化）
    ];
    
    const combined = factors.join('-');
    return this.hashString(combined).substring(0, 8);
  }
  
  /**
   * 获取设备友好名称
   * @returns 设备名称
   */
  getDeviceName(): string {
    const platform = navigator.platform;
    const userAgent = navigator.userAgent;
    
    if (platform.includes('Win')) return 'Windows PC';
    if (platform.includes('Mac')) return 'Mac';
    if (platform.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    
    return 'Unknown Device';
  }
  
  /**
   * 创建带设备信息的备份
   * @param options 备份选项
   * @returns 备份结果
   */
  async createBackup(options: BackupOptions): Promise<BackupResult> {
    const deviceId = this.getDeviceId();
    const deviceName = this.getDeviceName();
    
    const timestamp = Date.now();
    const backupId = `${options.level}-${deviceId}-${timestamp}`;
    
    console.log(`📱 创建设备备份: ${deviceName} (${deviceId})`);
    
    try {
      // 构建备份元数据
      const metadata: BackupMetadata = {
        id: backupId,
        timestamp,
        level: options.level,
        trigger: options.trigger,
        
        // 设备信息
        deviceId,
        deviceName,
        
        // 版本信息
        obsidianVersion: (this.plugin.app as any).appVersion || 'unknown',
        pluginVersion: this.plugin.manifest.version,
        vaultName: this.plugin.app.vault.getName(),
        
        // 内容摘要
        summary: {
          deckId: options.targetId,
          deckName: (options.data as BackupData)?.info?.deckName || 'Unknown',
          cardCount: (options.data as BackupData)?.cards?.length || 0,
        },
        
        // 文件信息（稍后填充）
        storagePath: '',
        size: 0,
        compressed: false,
        compressionType: 'none' as any,
        encrypted: false,
        type: 'full',
        
        // 健康状态
        isHealthy: true,
        
        // 可删除性
        canDelete: true,
        
        // 标签
        tags: [deviceName, options.level, options.trigger],
        description: options.reason
      };
      
      // 转换为设备无关的相对路径
      const deviceAwareBackup: DeviceAwareBackup = {
        id: backupId,
        metadata,
        data: options.data,
        relativePaths: this.convertToRelativePaths(options.data)
      };
      
      // 智能压缩
      const compressed = await this.compression.createCompressedBackup(
        options.data as BackupData
      );
      
      metadata.compressed = compressed.type !== 'none';
      metadata.compressionType = compressed.type;
      metadata.size = compressed.size;
      metadata.originalSize = compressed.originalSize;
      metadata.compressionRatio = compressed.compressionRatio;
      
      // 确定存储路径
      let storagePath: string;
      
      switch (options.trigger) {
        case 'auto_import':
          storagePath = this.pathManager.getImportBackupPath();
          break;
        case 'scheduled':
          storagePath = this.pathManager.getScheduledBackupPath();
          break;
        case 'manual':
          storagePath = this.pathManager.getManualBackupPath();
          break;
        default:
          storagePath = this.pathManager.getDeviceBackupPath(deviceId);
      }
      
      await this.pathManager.ensureFolder(storagePath);
      
      const extension = compressed.type === 'gzip' ? '.json.gz' : '.json';
      const filePath = `${storagePath}/${backupId}${extension}`;
      
      metadata.storagePath = filePath;
      
      // 写入备份文件
      if (compressed.type === 'gzip') {
        await this.plugin.app.vault.adapter.writeBinary(
          filePath,
          compressed.data as Uint8Array
        );
      } else {
        await this.plugin.app.vault.adapter.write(
          filePath,
          compressed.data as string
        );
      }
      
      console.log(`✅ 备份创建成功: ${filePath}`);
      console.log(`   大小: ${this.compression.formatSize(compressed.size)}`);
      if (compressed.compressionRatio) {
        console.log(`   节省: ${compressed.compressionRatio.toFixed(1)}%`);
      }
      
      return {
        success: true,
        backupId,
        filePath,
        deviceId,
        metadata
      };
    } catch (error) {
      console.error(`❌ 创建备份失败:`, error);
      return {
        success: false,
        backupId,
        filePath: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 查找当前设备的备份
   * @param deviceId 设备ID（可选，默认当前设备）
   * @returns 备份列表
   */
  async findDeviceBackups(deviceId?: string): Promise<DeviceAwareBackup[]> {
    const targetDeviceId = deviceId || this.getDeviceId();
    const deviceBackupPath = this.pathManager.getDeviceBackupPath(targetDeviceId);
    
    try {
      const listing = await this.plugin.app.vault.adapter.list(deviceBackupPath);
      const backups: DeviceAwareBackup[] = [];
      
      for (const file of listing.files) {
        if (file.endsWith('.json') || file.endsWith('.json.gz')) {
          try {
            const backup = await this.loadBackup(file);
            backups.push(backup);
          } catch (error) {
            console.warn(`⚠️ 加载备份失败: ${file}`, error);
          }
        }
      }
      
      return backups.sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);
    } catch (error) {
      // 目录不存在或为空
      return [];
    }
  }
  
  /**
   * 查找所有设备的备份（供用户选择）
   * @returns 设备备份映射
   */
  async findAllDeviceBackups(): Promise<Map<string, DeviceBackupInfo>> {
    const devicesPath = this.pathManager.getBackupPath('devices');
    const deviceMap = new Map<string, DeviceBackupInfo>();
    
    try {
      const listing = await this.plugin.app.vault.adapter.list(devicesPath);
      
      for (const folder of listing.folders) {
        const deviceId = folder.split('/').pop();
        if (!deviceId) continue;
        
        const backups = await this.findDeviceBackups(deviceId);
        
        if (backups.length > 0) {
          const latestBackup = backups[0];
          const totalSize = backups.reduce((sum, b) => sum + (b.metadata.size || 0), 0);
          
          deviceMap.set(deviceId, {
            deviceId,
            deviceName: latestBackup.metadata.deviceName,
            backupCount: backups.length,
            latestBackup: latestBackup.metadata.timestamp,
            totalSize,
            isCurrent: deviceId === this.getDeviceId()
          });
        }
      }
    } catch (error) {
      console.error('查找设备备份失败:', error);
    }
    
    return deviceMap;
  }
  
  /**
   * 加载备份文件
   * @param filePath 文件路径
   * @returns 备份数据
   */
  async loadBackup(filePath: string): Promise<DeviceAwareBackup> {
    if (filePath.endsWith('.gz')) {
      // 压缩备份
      const compressed = await this.plugin.app.vault.adapter.readBinary(filePath);
      const data = await this.compression.gzipDecompress(compressed);
      return data;
    } else {
      // 未压缩备份
      const content = await this.plugin.app.vault.adapter.read(filePath);
      return JSON.parse(content);
    }
  }
  
  /**
   * 转换为相对路径（跨设备兼容）
   * @param data 数据
   * @returns 转换后的数据
   */
  private convertToRelativePaths(data: any): any {
    const vaultName = this.plugin.app.vault.getName();
    
    const convert = (obj: any): any => {
      if (typeof obj === 'string') {
        // 检测并转换路径
        if (obj.includes(vaultName)) {
          // 提取 vault 相对路径
          const parts = obj.split(vaultName);
          if (parts.length > 1) {
            return `{{vault}}${parts[1]}`;  // 使用占位符
          }
        }
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(convert);
      }
      
      if (obj && typeof obj === 'object') {
        const converted: any = {};
        for (const [key, value] of Object.entries(obj)) {
          converted[key] = convert(value);
        }
        return converted;
      }
      
      return obj;
    };
    
    return convert(data);
  }
  
  /**
   * 恢复时转换回当前设备路径
   * @param data 数据
   * @returns 转换后的数据
   */
  restoreDevicePaths(data: any): any {
    const vaultName = this.plugin.app.vault.getName();
    
    const restore = (obj: any): any => {
      if (typeof obj === 'string' && obj.includes('{{vault}}')) {
        return obj.replace('{{vault}}', vaultName);
      }
      
      if (Array.isArray(obj)) {
        return obj.map(restore);
      }
      
      if (obj && typeof obj === 'object') {
        const restored: any = {};
        for (const [key, value] of Object.entries(obj)) {
          restored[key] = restore(value);
        }
        return restored;
      }
      
      return obj;
    };
    
    return restore(data);
  }
  
  /**
   * 字符串哈希函数
   * @param str 字符串
   * @returns 哈希值
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}


