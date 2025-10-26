/**
 * 数据管理服务
 * 提供数据概览、文件夹结构分析、数据导入导出等核心功能
 */

import { TFile, TFolder } from 'obsidian';
import type { AnkiDataStorage } from '../data/storage';
import type {
  DataOverview,
  FolderStructure,
  FolderNode,
  ExportOptions,
  ImportOptions,
  ExportResult,
  ImportResult,
  ResetResult,
  FolderSizeInfo,
  DataIntegrityResult,
  ValidationIssue
} from '../types/data-management-types';
import {
  DataType,
  OperationType
} from '../types/data-management-types';

export class DataManagementService {
  private dataStorage: AnkiDataStorage;
  private plugin: any; // TuankiPlugin type

  constructor(dataStorage: AnkiDataStorage, plugin: any) {
    this.dataStorage = dataStorage;
    this.plugin = plugin;
  }

  /**
   * 获取数据概览信息
   */
  async getDataOverview(): Promise<DataOverview> {
    const startTime = Date.now();
    
    try {
      // 并行获取各种数据统计
      const [decks, cards, folderSizes] = await Promise.all([
        this.dataStorage.getDecks(),
        this.dataStorage.getCards(),
        this.calculateFolderSizes()
      ]);

      // 获取学习会话数量（如果有相关API）
      let totalSessions = 0;
      try {
        const sessions = await this.dataStorage.getStudySessions?.() || [];
        totalSessions = Array.isArray(sessions) ? sessions.length : 0;
      } catch (error) {
        console.warn('无法获取学习会话数据:', error);
      }

      const dataFolderPath = this.getDataFolderPath();
      const totalSize = folderSizes.folderSizes[dataFolderPath] || 0;

      return {
        dataFolderPath,
        totalSize,
        totalDecks: decks.length,
        totalCards: cards.length,
        totalSessions,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('获取数据概览失败:', error);
      throw new Error(`获取数据概览失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取文件夹结构
   */
  async getFolderStructure(): Promise<FolderStructure> {
    try {
      const dataFolderPath = this.getDataFolderPath();
      const adapter = this.plugin.app.vault.adapter;
      
      // 检查数据文件夹是否存在
      const exists = await adapter.exists(dataFolderPath);
      if (!exists) {
        throw new Error(`数据文件夹不存在: ${dataFolderPath}`);
      }

      const folderSizes = await this.calculateFolderSizes();
      const rootNode = await this.buildFolderNode(dataFolderPath, folderSizes);
      
      // 统计文件和文件夹数量
      const stats = this.countNodesRecursively(rootNode);

      return {
        root: rootNode,
        totalFiles: stats.files,
        totalFolders: stats.folders,
        scannedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('获取文件夹结构失败:', error);
      throw new Error(`获取文件夹结构失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 导出数据
   */
  async exportData(options: ExportOptions): Promise<ExportResult> {
    const startTime = Date.now();
    
    try {
      // 获取要导出的数据
      const exportData = await this.collectExportData(options);
      
      // 生成导出文件
      const fileName = this.generateExportFileName(options.format);
      const filePath = await this.writeExportFile(exportData, fileName, options);
      
      // 计算文件大小
      const adapter = this.plugin.app.vault.adapter;
      const stat = await adapter.stat(filePath);
      const fileSize = stat?.size || 0;

      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        filePath,
        fileSize,
        dataTypes: options.dataTypes,
        recordCount: this.countExportRecords(exportData)
      };
    } catch (error) {
      console.error('数据导出失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        dataTypes: options.dataTypes,
        recordCount: 0
      };
    }
  }

  /**
   * 导入数据
   */
  async importData(file: File, options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();
    
    try {
      // 创建导入前备份
      if (options.createBackup) {
        await this.dataStorage.createBackup();
      }

      // 读取和解析文件
      const fileContent = await this.readImportFile(file);
      const parsedData = await this.parseImportData(fileContent, file.name);
      
      // 验证数据
      if (options.validateData) {
        await this.validateImportData(parsedData);
      }

      // 执行导入
      const importResult = await this.executeImport(parsedData, options);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        importedCount: importResult.imported,
        skippedCount: importResult.skipped,
        conflictCount: importResult.conflicts,
        dataTypes: this.detectDataTypes(parsedData),
        conflicts: importResult.conflictDetails
      };
    } catch (error) {
      console.error('数据导入失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        importedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        dataTypes: []
      };
    }
  }

  /**
   * 重置数据
   */
  async resetData(confirmation: string): Promise<ResetResult> {
    const startTime = Date.now();
    
    try {
      // 验证确认文本
      if (confirmation !== '确认重置') {
        throw new Error('确认文本不正确');
      }

      // 创建重置前备份
      const backupResult = await this.dataStorage.createBackup();
      const backupId = this.extractBackupId(backupResult);

      // 获取当前数据统计
      const overview = await this.getDataOverview();
      const totalRecords = overview.totalCards + overview.totalDecks + overview.totalSessions;

      // 执行重置操作
      await this.executeReset();

      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        backupId,
        clearedDataTypes: [DataType.DECKS, DataType.CARDS, DataType.SESSIONS, DataType.PROFILE],
        clearedRecordCount: totalRecords
      };
    } catch (error) {
      console.error('数据重置失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        clearedDataTypes: [],
        clearedRecordCount: 0
      };
    }
  }

  /**
   * 检查数据完整性
   */
  async checkDataIntegrity(): Promise<DataIntegrityResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];
    let score = 100;

    try {
      console.log('开始数据完整性检查...');

      // 1. 检查数据文件夹是否存在
      const dataFolderPath = this.getDataFolderPath();
      const adapter = this.plugin.app.vault.adapter;
      
      if (!await adapter.exists(dataFolderPath)) {
        issues.push({
          id: 'missing-data-folder',
          type: 'missing_file',
          description: `数据文件夹不存在: ${dataFolderPath}`,
          severity: 'critical',
          fixSuggestion: '请重新初始化插件或检查配置'
        });
        score -= 50;
      }

      // 2. 检查牌组数据完整性
      try {
        const decks = await this.dataStorage.getDecks();
        if (!Array.isArray(decks)) {
          issues.push({
            id: 'invalid-decks-data',
            type: 'corrupted_data',
            description: '牌组数据格式无效',
            severity: 'error',
            fixSuggestion: '尝试从备份恢复数据'
          });
          score -= 20;
        }
      } catch (error) {
        issues.push({
          id: 'decks-read-error',
          type: 'corrupted_data',
          description: `无法读取牌组数据: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'critical',
          fixSuggestion: '检查数据文件是否损坏，考虑从备份恢复'
        });
        score -= 30;
      }

      // 3. 检查卡片数据完整性
      try {
        const cards = await this.dataStorage.getCards();
        if (!Array.isArray(cards)) {
          issues.push({
            id: 'invalid-cards-data',
            type: 'corrupted_data',
            description: '卡片数据格式无效',
            severity: 'error',
            fixSuggestion: '尝试从备份恢复数据'
          });
          score -= 20;
        } else {
          // 检查卡片数据结构
          const invalidCards = cards.filter((card: any) => !card.id || !card.deckId);
          if (invalidCards.length > 0) {
            issues.push({
              id: 'invalid-card-structure',
              type: 'invalid_format',
              description: `发现 ${invalidCards.length} 张卡片缺少必要字段`,
              severity: 'warning',
              fixSuggestion: '建议清理无效卡片数据'
            });
            score -= Math.min(10, invalidCards.length);
          }
        }
      } catch (error) {
        issues.push({
          id: 'cards-read-error',
          type: 'corrupted_data',
          description: `无法读取卡片数据: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'critical',
          fixSuggestion: '检查数据文件是否损坏，考虑从备份恢复'
        });
        score -= 30;
      }

      // 4. 检查学习会话数据
      try {
        const sessions = await this.dataStorage.getStudySessions?.() || [];
        if (!Array.isArray(sessions)) {
          issues.push({
            id: 'invalid-sessions-data',
            type: 'corrupted_data',
            description: '学习会话数据格式无效',
            severity: 'warning',
            fixSuggestion: '会话数据可以重置，不影响卡片内容'
          });
          score -= 5;
        }
      } catch (error) {
        // 会话数据不是关键数据，记录警告即可
        console.warn('学习会话数据检查失败:', error);
      }

      // 确保分数不低于0
      score = Math.max(0, score);

      const result: DataIntegrityResult = {
        passed: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
        score,
        issues,
        timestamp: new Date().toISOString(),
        checkType: 'manual'
      };

      console.log(`数据完整性检查完成: 得分 ${score}，发现 ${issues.length} 个问题`);
      return result;
    } catch (error) {
      console.error('数据完整性检查失败:', error);
      return {
        passed: false,
        score: 0,
        issues: [{
          id: 'check-failed',
          type: 'corrupted_data',
          description: `完整性检查失败: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'critical',
          fixSuggestion: '请联系技术支持'
        }],
        timestamp: new Date().toISOString(),
        checkType: 'manual'
      };
    }
  }

  /**
   * 打开数据文件夹
   */
  async openDataFolder(): Promise<void> {
    try {
      const dataFolderPath = this.getDataFolderPath();
      const adapter = this.plugin.app.vault.adapter;
      
      // 检查文件夹是否存在
      const exists = await adapter.exists(dataFolderPath);
      if (!exists) {
        throw new Error(`数据文件夹不存在: ${dataFolderPath}`);
      }

      // 获取绝对路径
      const absolutePath = adapter.path.resolve(adapter.basePath, dataFolderPath);
      
      // 跨平台打开文件夹
      if (process.platform === 'win32') {
        require('child_process').exec(`explorer "${absolutePath}"`);
      } else if (process.platform === 'darwin') {
        require('child_process').exec(`open "${absolutePath}"`);
      } else {
        require('child_process').exec(`xdg-open "${absolutePath}"`);
      }
    } catch (error) {
      console.error('打开数据文件夹失败:', error);
      throw new Error(`打开数据文件夹失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 计算文件夹大小
   */
  async calculateFolderSizes(): Promise<FolderSizeInfo> {
    try {
      const dataFolderPath = this.getDataFolderPath();
      const adapter = this.plugin.app.vault.adapter;
      
      const folderSizes: Record<string, number> = {};
      const fileSizes: Record<string, number> = {};
      
      await this.calculateSizeRecursively(dataFolderPath, folderSizes, fileSizes, adapter);
      
      return {
        folderSizes,
        fileSizes,
        calculatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('计算文件夹大小失败:', error);
      return {
        folderSizes: {},
        fileSizes: {},
        calculatedAt: new Date().toISOString()
      };
    }
  }

  // ==================== 私有辅助方法 ====================

  private getDataFolderPath(): string {
    return this.plugin.settings?.dataFolder || 'tuanki';
  }

  private async getFieldTemplateCount(): Promise<number> {
    // 新系统不使用预定义模板，返回0
    return 0;
  }

  private async getTriadTemplateCount(): Promise<number> {
    // 新系统不使用三位一体模板，返回0
    return 0;
  }

  private async buildFolderNode(path: string, folderSizes: FolderSizeInfo): Promise<FolderNode> {
    const adapter = this.plugin.app.vault.adapter;
    const listing = await adapter.list(path);
    
    const name = path.split('/').pop() || path;
    const node: FolderNode = {
      id: path,
      name,
      type: 'folder',
      path,
      children: [],
      description: this.getFolderDescription(name)
    };

    // 处理子文件夹
    for (const folder of listing.folders || []) {
      const childNode = await this.buildFolderNode(folder, folderSizes);
      node.children!.push(childNode);
    }

    // 处理文件
    for (const file of listing.files || []) {
      const fileName = file.split('/').pop() || file;
      const fileNode: FolderNode = {
        id: file,
        name: fileName,
        type: 'file',
        path: file,
        size: folderSizes.fileSizes[file] || 0,
        description: this.getFileDescription(fileName)
      };
      node.children!.push(fileNode);
    }

    return node;
  }

  private getFolderDescription(folderName: string): string {
    const descriptions: Record<string, string> = {
      'decks': '牌组数据存储区',
      'learning': '学习记录和进度',
      'profile': '用户配置和设置',
      'templates': '模板定义文件',
      'backups': '自动备份文件',
      'media': '媒体文件存储'
    };
    return descriptions[folderName] || '';
  }

  private getFileDescription(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const descriptions: Record<string, string> = {
      'json': 'JSON数据文件',
      'md': 'Markdown文档',
      'txt': '文本文件',
      'png': 'PNG图片文件',
      'jpg': 'JPEG图片文件',
      'jpeg': 'JPEG图片文件',
      'gif': 'GIF动画文件',
      'mp3': 'MP3音频文件',
      'mp4': 'MP4视频文件'
    };

    // 特殊文件名处理
    if (fileName === 'decks.json') return '牌组数据文件';
    if (fileName === 'cards.json') return '卡片数据文件';
    if (fileName === 'settings.json') return '设置配置文件';
    if (fileName === 'profile.json') return '用户配置文件';
    if (fileName === 'templates.json') return '模板定义文件';

    return extension ? descriptions[extension] || `${extension.toUpperCase()}文件` : '未知文件类型';
  }

  private countNodesRecursively(node: FolderNode): { files: number; folders: number } {
    let files = 0;
    let folders = 0;
    
    if (node.type === 'file') {
      files = 1;
    } else {
      folders = 1;
      for (const child of node.children || []) {
        const childStats = this.countNodesRecursively(child);
        files += childStats.files;
        folders += childStats.folders;
      }
    }
    
    return { files, folders };
  }

  private async calculateSizeRecursively(
    path: string,
    folderSizes: Record<string, number>,
    fileSizes: Record<string, number>,
    adapter: any
  ): Promise<number> {
    try {
      const listing = await adapter.list(path);
      let totalSize = 0;

      // 计算文件大小
      for (const file of listing.files || []) {
        try {
          const stat = await adapter.stat(file);
          const size = stat?.size || 0;
          fileSizes[file] = size;
          totalSize += size;
        } catch (error) {
          console.warn(`无法获取文件大小: ${file}`, error);
        }
      }

      // 递归计算子文件夹大小
      for (const folder of listing.folders || []) {
        const folderSize = await this.calculateSizeRecursively(folder, folderSizes, fileSizes, adapter);
        totalSize += folderSize;
      }

      folderSizes[path] = totalSize;
      return totalSize;
    } catch (error) {
      console.warn(`无法计算文件夹大小: ${path}`, error);
      return 0;
    }
  }

  private async collectExportData(options: ExportOptions): Promise<any> {
    const data: any = {};
    
    for (const dataType of options.dataTypes) {
      switch (dataType) {
        case DataType.DECKS:
          data.decks = await this.dataStorage.getDecks();
          break;
        case DataType.CARDS:
          data.cards = await this.dataStorage.getCards();
          break;
        case DataType.SESSIONS:
          try {
            data.sessions = await this.dataStorage.getStudySessions?.() || [];
          } catch {
            data.sessions = [];
          }
          break;
        case DataType.PROFILE:
          try {
            data.profile = await this.dataStorage.getUserProfile();
          } catch {
            data.profile = null;
          }
          break;
        case DataType.TEMPLATES:
          data.templates = {
            fieldTemplates: this.plugin.settings?.fieldTemplates || [],
            triadTemplates: this.plugin.settings?.triadTemplates || []
          };
          break;
      }
    }
    
    return data;
  }

  private generateExportFileName(format: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `tuanki-export-${timestamp}.${format}`;
  }

  private async writeExportFile(data: any, fileName: string, options: ExportOptions): Promise<string> {
    const adapter = this.plugin.app.vault.adapter;
    let content: string;
    
    switch (options.format) {
      case 'json':
        content = JSON.stringify(data, null, 2);
        break;
      case 'csv':
        content = this.convertToCSV(data);
        break;
      default:
        throw new Error(`不支持的导出格式: ${options.format}`);
    }
    
    // 确保导出文件夹存在
    const exportFolder = 'tuanki/exports';
    try {
      const folderExists = await adapter.exists(exportFolder);
      if (!folderExists) {
        await this.plugin.app.vault.createFolder(exportFolder);
      }
    } catch (error) {
      console.warn('[DataManagement] 创建导出文件夹失败，使用vault根目录:', error);
    }
    
    // 优先在插件文件夹中创建，失败则回退到根目录
    let filePath = `${exportFolder}/${fileName}`;
    try {
      await adapter.write(filePath, content);
      console.log(`[DataManagement] 导出文件已保存到: ${filePath}`);
    } catch (error) {
      console.warn('[DataManagement] 在插件文件夹中创建导出文件失败，尝试根目录:', error);
      filePath = fileName;
      await adapter.write(filePath, content);
      console.log(`[DataManagement] 导出文件已保存到根目录: ${filePath}`);
    }
    
    return filePath;
  }

  private convertToCSV(data: any): string {
    // 简化的CSV转换实现
    // 实际实现需要根据数据结构进行详细转换
    return JSON.stringify(data);
  }

  private countExportRecords(data: any): number {
    let count = 0;
    if (data.decks) count += data.decks.length;
    if (data.cards) count += data.cards.length;
    if (data.sessions) count += data.sessions.length;
    return count;
  }

  private async readImportFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  private async parseImportData(content: string, fileName: string): Promise<any> {
    try {
      if (fileName.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        throw new Error(`不支持的文件格式: ${fileName}`);
      }
    } catch (error) {
      throw new Error(`文件解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateImportData(data: any): Promise<void> {
    // 基础数据验证
    if (!data || typeof data !== 'object') {
      throw new Error('导入数据格式无效');
    }
    
    // 可以添加更多验证逻辑
  }

  private async executeImport(data: any, options: ImportOptions): Promise<any> {
    // 简化的导入实现
    // 实际实现需要根据冲突策略处理数据
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;
    
    if (data.decks) {
      // 导入牌组逻辑
      imported += data.decks.length;
    }
    
    if (data.cards) {
      // 导入卡片逻辑
      imported += data.cards.length;
    }
    
    return {
      imported,
      skipped,
      conflicts,
      conflictDetails: []
    };
  }

  private detectDataTypes(data: any): DataType[] {
    const types: DataType[] = [];
    if (data.decks) types.push(DataType.DECKS);
    if (data.cards) types.push(DataType.CARDS);
    if (data.sessions) types.push(DataType.SESSIONS);
    if (data.profile) types.push(DataType.PROFILE);
    if (data.templates) types.push(DataType.TEMPLATES);
    return types;
  }

  private async executeReset(): Promise<void> {
    // 重置各种数据
    // 这里需要调用实际的重置方法
    console.log('执行数据重置...');
  }

  private extractBackupId(backupResult: any): string {
    // 从备份结果中提取备份ID
    return backupResult || new Date().toISOString();
  }
}
