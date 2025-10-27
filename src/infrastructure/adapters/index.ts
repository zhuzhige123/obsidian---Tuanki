/**
 * 基础设施适配器 - 统一导出
 * 
 * @module infrastructure/adapters
 */

// 接口定义
export type { IFileSystemAdapter } from './FileSystemAdapter';
export type { IDataStorageAdapter } from './DataStorageAdapter';
export type { IMediaStorageAdapter } from './MediaStorageAdapter';

// 具体实现
export { ObsidianMediaStorageAdapter } from './impl/ObsidianMediaStorageAdapter';
export { TuankiDataStorageAdapter } from './impl/TuankiDataStorageAdapter';




