import { logger } from "../utils/logger";
/**
 * 数据管理服务
 * 提供数据概览、文件夹结构分析、数据导入导出等核心功能
 */

import { TFile, TFolder } from "obsidian";
import { WEAVE_DATA, getPluginPaths, getV2PathsFromApp } from "../config/paths";
import type { WeaveDataStorage } from "../data/storage";
import type {
	DataOverview,
	ExportOptions,
	ExportResult,
	FolderNode,
	FolderSizeInfo,
	FolderStructure,
	ImportOptions,
	ImportResult,
	ResetResult,
} from "../types/data-management-types";
import { DataType, OperationType } from "../types/data-management-types";

export class DataManagementService {
	private dataStorage: WeaveDataStorage;
	private plugin: any; // WeavePlugin type

	constructor(dataStorage: WeaveDataStorage, plugin: any) {
		this.dataStorage = dataStorage;
		this.plugin = plugin;
	}

	/**
	 * 获取数据概览信息
	 */
	async getDataOverview(): Promise<DataOverview> {
		const _startTime = Date.now();

		try {
			// 并行获取各种数据统计
			const [decks, cards, folderSizes] = await Promise.all([
				this.dataStorage.getDecks(),
				this.dataStorage.getCards(),
				this.calculateFolderSizes(),
			]);

			// 获取学习会话数量（如果有相关API）
			let totalSessions = 0;
			try {
				const sessions = (await this.dataStorage.getStudySessions?.()) || [];
				totalSessions = Array.isArray(sessions) ? sessions.length : 0;
			} catch (error) {
				logger.warn("无法获取学习会话数据:", error);
			}

			const dataFolderPath = this.getDataFolderPath();
			const totalSize = folderSizes.folderSizes[dataFolderPath] || 0;

			return {
				dataFolderPath,
				totalSize,
				totalDecks: decks.length,
				totalCards: cards.length,
				totalSessions,
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("获取数据概览失败:", error);
			throw new Error(
				`获取数据概览失败: ${error instanceof Error ? error.message : String(error)}`
			);
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
				scannedAt: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("获取文件夹结构失败:", error);
			throw new Error(
				`获取文件夹结构失败: ${error instanceof Error ? error.message : String(error)}`
			);
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
				recordCount: this.countExportRecords(exportData),
			};
		} catch (error) {
			logger.error("数据导出失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				dataTypes: options.dataTypes,
				recordCount: 0,
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
				conflicts: importResult.conflictDetails,
			};
		} catch (error) {
			logger.error("数据导入失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				importedCount: 0,
				skippedCount: 0,
				conflictCount: 0,
				dataTypes: [],
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
			const allowedConfirmations = new Set(["确认重置", "Confirm Reset"]);
			if (!allowedConfirmations.has(confirmation)) {
				throw new Error("确认文本不正确");
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
				clearedRecordCount: totalRecords,
			};
		} catch (error) {
			logger.error("数据重置失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				clearedDataTypes: [],
				clearedRecordCount: 0,
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

			// 获取绝对路径并用 Electron shell 打开
			const absolutePath = (adapter as any).basePath
				? `${(adapter as any).basePath}/${dataFolderPath}`.replace(/\//g, "\\")
				: dataFolderPath;

			const electron = (window as any).require?.("electron");
			if (electron?.remote?.shell) {
				electron.remote.shell.openPath(absolutePath);
			} else {
				const remoteModule = (window as any).require?.("@electron/remote");
				if (remoteModule?.shell) {
					remoteModule.shell.openPath(absolutePath);
				}
			}
		} catch (error) {
			logger.error("打开数据文件夹失败:", error);
			throw new Error(
				`打开数据文件夹失败: ${error instanceof Error ? error.message : String(error)}`
			);
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
				calculatedAt: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("计算文件夹大小失败:", error);
			return {
				folderSizes: {},
				fileSizes: {},
				calculatedAt: new Date().toISOString(),
			};
		}
	}

	// ==================== 私有辅助方法 ====================

	private getDataFolderPath(): string {
		return getV2PathsFromApp(this.plugin.app).root;
	}

	private getFieldTemplateCount(): number {
		return 0;
	}

	private getTriadTemplateCount(): number {
		return 0;
	}

	private async buildFolderNode(path: string, folderSizes: FolderSizeInfo): Promise<FolderNode> {
		const adapter = this.plugin.app.vault.adapter;
		const listing = await adapter.list(path);

		const name = path.split("/").pop() || path;
		const node: FolderNode = {
			id: path,
			name,
			type: "folder",
			path,
			children: [],
			description: this.getFolderDescription(name),
		};

		// 处理子文件夹
		for (const folder of listing.folders || []) {
			const childNode = await this.buildFolderNode(folder, folderSizes);
			node.children?.push(childNode);
		}

		// 处理文件
		for (const file of listing.files || []) {
			const fileName = file.split("/").pop() || file;
			const fileNode: FolderNode = {
				id: file,
				name: fileName,
				type: "file",
				path: file,
				size: folderSizes.fileSizes[file] || 0,
				description: this.getFileDescription(fileName),
			};
			node.children?.push(fileNode);
		}

		return node;
	}

	private getFolderDescription(folderName: string): string {
		const descriptions: Record<string, string> = {
			decks: "牌组数据存储区",
			learning: "学习记录和进度",
			profile: "用户配置和设置",
			templates: "模板定义文件",
			backups: "自动备份文件",
			media: "媒体文件存储",
		};
		return descriptions[folderName] || "";
	}

	private getFileDescription(fileName: string): string {
		const extension = fileName.split(".").pop()?.toLowerCase();
		const descriptions: Record<string, string> = {
			json: "JSON数据文件",
			md: "Markdown文档",
			txt: "文本文件",
			png: "PNG图片文件",
			jpg: "JPEG图片文件",
			jpeg: "JPEG图片文件",
			gif: "GIF动画文件",
			mp3: "MP3音频文件",
			mp4: "MP4视频文件",
		};

		// 特殊文件名处理
		if (fileName === "decks.json") return "牌组数据文件";
		if (fileName === "cards.json") return "卡片数据文件";
		if (fileName === "settings.json") return "设置配置文件";
		if (fileName === "profile.json") return "用户配置文件";
		if (fileName === "templates.json") return "模板定义文件";

		return extension ? descriptions[extension] || `${extension.toUpperCase()}文件` : "未知文件类型";
	}

	private countNodesRecursively(node: FolderNode): { files: number; folders: number } {
		let files = 0;
		let folders = 0;

		if (node.type === "file") {
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
					logger.warn(`无法获取文件大小: ${file}`, error);
				}
			}

			// 递归计算子文件夹大小
			for (const folder of listing.folders || []) {
				const folderSize = await this.calculateSizeRecursively(
					folder,
					folderSizes,
					fileSizes,
					adapter
				);
				totalSize += folderSize;
			}

			folderSizes[path] = totalSize;
			return totalSize;
		} catch (error) {
			logger.warn(`无法计算文件夹大小: ${path}`, error);
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
						data.sessions = (await this.dataStorage.getStudySessions?.()) || [];
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
						// triadTemplates 已废弃，不再导出
					};
					break;
			}
		}

		return data;
	}

	private generateExportFileName(format: string): string {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		return `weave-export-${timestamp}.${format}`;
	}

	private async writeExportFile(
		data: any,
		fileName: string,
		options: ExportOptions
	): Promise<string> {
		const adapter = this.plugin.app.vault.adapter;
		let content: string;

		switch (options.format) {
			case "json":
				content = JSON.stringify(data, null, 2);
				break;
			case "csv":
				content = this.convertToCSV(data);
				break;
			default:
				throw new Error(`不支持的导出格式: ${options.format}`);
		}

		// 确保导出文件夹存在
		const exportFolder = `${WEAVE_DATA}/exports`;
		try {
			const folderExists = await adapter.exists(exportFolder);
			if (!folderExists) {
				await this.plugin.app.vault.createFolder(exportFolder);
			}
		} catch (error) {
			logger.warn("[DataManagement] 创建导出文件夹失败，使用vault根目录:", error);
		}

		// 优先在插件文件夹中创建，失败则回退到根目录
		let filePath = `${exportFolder}/${fileName}`;
		try {
			await adapter.write(filePath, content);
			logger.debug(`[DataManagement] 导出文件已保存到: ${filePath}`);
		} catch (error) {
			logger.warn("[DataManagement] 在插件文件夹中创建导出文件失败，尝试根目录:", error);
			filePath = fileName;
			await adapter.write(filePath, content);
			logger.debug(`[DataManagement] 导出文件已保存到根目录: ${filePath}`);
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
			reader.onerror = () => reject(new Error("文件读取失败"));
			reader.readAsText(file);
		});
	}

	private parseImportData(content: string, fileName: string): any {
		try {
			if (fileName.endsWith(".json")) {
				return JSON.parse(content);
			} else {
				throw new Error(`不支持的文件格式: ${fileName}`);
			}
		} catch (error) {
			throw new Error(`文件解析失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private validateImportData(data: any): void {
		if (!data || typeof data !== "object") {
			throw new Error("导入数据格式无效");
		}
	}

	private async executeImport(_data: any, _options: ImportOptions): Promise<any> {
		// TODO: 实现实际的数据导入逻辑（牌组/卡片写入、冲突策略处理）
		throw new Error("数据导入功能尚未实现，请使用备份恢复功能");
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
		const adapter = this.plugin.app.vault.adapter as any;

		const removeRecursively = async (targetPath: string): Promise<void> => {
			try {
				if (!(await adapter.exists(targetPath))) return;

				let stat: any = null;
				try {
					stat = await adapter.stat(targetPath);
				} catch {}

				if (stat?.type === "file") {
					await adapter.remove(targetPath);
					return;
				}

				const listing = adapter.list ? await adapter.list(targetPath) : { files: [], folders: [] };
				const files: string[] = Array.isArray(listing?.files) ? listing.files : [];
				const folders: string[] = Array.isArray(listing?.folders) ? listing.folders : [];

				for (const file of files) {
					try {
						await adapter.remove(file);
					} catch {}
				}

				for (const folder of folders) {
					await removeRecursively(folder);
				}

				try {
					if (adapter.rmdir) {
						await adapter.rmdir(targetPath, false);
					} else {
						await adapter.remove(targetPath);
					}
				} catch {}
			} catch {}
		};

		await removeRecursively(getV2PathsFromApp(this.plugin.app).root);

		try {
			const pluginPaths = getPluginPaths(this.plugin.app);
			if (await adapter.exists(pluginPaths.state.root)) {
				await removeRecursively(pluginPaths.state.root);
			}
		} catch {}

		if (typeof this.dataStorage.initialize === "function") {
			await this.dataStorage.initialize();
		}
	}

	private extractBackupId(backupResult: any): string {
		// 从备份结果中提取备份ID
		return backupResult || new Date().toISOString();
	}
}
