/**
 * CodeMirror 6 媒体文件粘贴扩展
 *
 * 功能：
 * 1. 支持从剪贴板粘贴截图和图片
 * 2. 支持拖拽图片、音频、视频文件到编辑器
 * 3. 自动保存到Obsidian附件目录
 * 4. 生成符合Obsidian规范的媒体链接语法
 */

import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type AnkiPlugin from "../main";
import { TFile } from "obsidian";

/**
 * 媒体文件处理结果接口
 */
export interface MediaProcessResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileType?: 'image' | 'audio' | 'video' | 'document';
  error?: string;
}

/**
 * 媒体文件粘贴配置接口
 */
export interface MediaPasteConfig {
  /** 是否启用媒体文件粘贴功能 */
  enabled?: boolean;
  /** 是否启用拖拽功能 */
  enableDrop?: boolean;
  /** 文件大小限制（MB） */
  maxSizeMB?: number;
  /** 支持的图片格式 */
  supportedImageFormats?: string[];
  /** 支持的音频格式 */
  supportedAudioFormats?: string[];
  /** 支持的视频格式 */
  supportedVideoFormats?: string[];
  /** 支持的文档格式 */
  supportedDocumentFormats?: string[];
  /** 是否使用Obsidian Wiki链接格式 */
  useWikiLinks?: boolean;
  /** 自定义附件文件夹路径 */
  attachmentFolder?: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<MediaPasteConfig> = {
  enabled: true,
  enableDrop: true,
  maxSizeMB: 50, // 增加到50MB以支持视频文件
  supportedImageFormats: [
    'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
    'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'
  ],
  supportedAudioFormats: [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
    'audio/aac', 'audio/flac', 'audio/m4a', 'audio/wma'
  ],
  supportedVideoFormats: [
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
    'video/webm', 'video/ogg', 'video/3gpp', 'video/x-flv'
  ],
  supportedDocumentFormats: [
    'application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  useWikiLinks: true,
  attachmentFolder: 'attachments'
};

/**
 * 媒体文件粘贴扩展类
 */
export class MediaPasteExtension {
  private plugin: AnkiPlugin;
  private config: Required<MediaPasteConfig>;

  constructor(plugin: AnkiPlugin, config: Partial<MediaPasteConfig> = {}) {
    this.plugin = plugin;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 创建扩展
   */
  create(): Extension {
    if (!this.config.enabled) {
      console.log('🚫 媒体文件粘贴扩展已禁用');
      return [];
    }

    console.log('✅ 媒体文件粘贴扩展已创建，配置:', this.config);

    return EditorView.domEventHandlers({
      paste: (event, view) => {
        console.log('📋 粘贴事件触发:', event);
        return this.handlePaste(event, view);
      },
      drop: this.config.enableDrop ? (event, view) => {
        console.log('📁 拖拽事件触发:', event);
        return this.handleDrop(event, view);
      } : undefined,
      dragover: this.config.enableDrop ? (event) => {
        console.log('🔄 拖拽悬停事件触发:', event);
        this.handleDragOver(event);
        return false;
      } : undefined,
    });
  }

  /**
   * 处理粘贴事件
   */
  private handlePaste(event: ClipboardEvent, view: EditorView): boolean {
    console.log('🔍 开始处理粘贴事件');

    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      console.log('❌ 没有剪贴板数据');
      return false;
    }

    // 检查是否有媒体文件数据
    const items = Array.from(clipboardData.items);
    console.log('📋 剪贴板项目:', items.map(item => ({ kind: item.kind, type: item.type })));

    const mediaItems = items.filter(item =>
      item.kind === 'file' && this.isSupportedMediaType(item.type)
    );

    if (mediaItems.length === 0) {
      console.log('❌ 没有找到支持的媒体格式');
      return false;
    }

    console.log('✅ 找到媒体文件项目:', mediaItems.length, '个');

    // 阻止默认粘贴行为
    event.preventDefault();

    // 异步处理媒体文件（不阻塞事件处理）
    this.processMediaItemsAsync(mediaItems, view);

    return true;
  }

  /**
   * 异步处理媒体文件列表
   */
  private async processMediaItemsAsync(mediaItems: DataTransferItem[], view: EditorView): Promise<void> {
    for (const item of mediaItems) {
      const file = item.getAsFile();
      if (file) {
        await this.processMediaFile(file, view);
      }
    }
  }

  /**
   * 处理拖拽事件
   */
  private handleDrop(event: DragEvent, view: EditorView): boolean {
    console.log('🔍 开始处理拖拽事件');

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      console.log('❌ 没有拖拽文件');
      return false;
    }

    // 筛选媒体文件
    const mediaFiles = Array.from(files).filter(file =>
      this.isSupportedMediaType(file.type)
    );

    console.log('📁 拖拽文件:', Array.from(files).map(f => ({ name: f.name, type: f.type })));
    console.log('🎵 媒体文件:', mediaFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));

    if (mediaFiles.length === 0) {
      console.log('❌ 没有找到支持的媒体文件');
      return false;
    }

    // 阻止默认行为
    event.preventDefault();

    // 异步处理媒体文件
    this.processFilesAsync(mediaFiles, view);

    return true;
  }

  /**
   * 异步处理文件列表
   */
  private async processFilesAsync(files: File[], view: EditorView): Promise<void> {
    for (const file of files) {
      await this.processMediaFile(file, view);
    }
  }

  /**
   * 处理拖拽悬停
   */
  private handleDragOver(event: DragEvent): void {
    console.log('🔄 拖拽悬停事件');
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  /**
   * 检查是否为支持的媒体类型
   */
  private isSupportedMediaType(mimeType: string): boolean {
    return this.config.supportedImageFormats.includes(mimeType) ||
           this.config.supportedAudioFormats.includes(mimeType) ||
           this.config.supportedVideoFormats.includes(mimeType) ||
           this.config.supportedDocumentFormats.includes(mimeType);
  }

  /**
   * 获取文件类型
   */
  private getFileType(mimeType: string): 'image' | 'audio' | 'video' | 'document' {
    if (this.config.supportedImageFormats.includes(mimeType)) {
      return 'image';
    } else if (this.config.supportedAudioFormats.includes(mimeType)) {
      return 'audio';
    } else if (this.config.supportedVideoFormats.includes(mimeType)) {
      return 'video';
    } else {
      return 'document';
    }
  }

  /**
   * 处理单个媒体文件
   */
  private async processMediaFile(file: File, view: EditorView): Promise<void> {
    try {
      // 文件大小检查
      if (file.size > this.config.maxSizeMB * 1024 * 1024) {
        this.showError(`文件过大，最大支持 ${this.config.maxSizeMB}MB`);
        return;
      }

      // 获取文件类型
      const fileType = this.getFileType(file.type);
      console.log('📁 处理媒体文件:', { name: file.name, type: file.type, fileType, size: file.size });

      // 显示加载状态
      const loadingText = this.getLoadingText(fileType);
      const pos = view.state.selection.main.head;

      view.dispatch({
        changes: { from: pos, insert: loadingText },
        selection: { anchor: pos + loadingText.length }
      });

      // 保存媒体文件
      console.log('🔄 开始保存媒体文件到vault...');
      const result = await this.saveMediaToVault(file);
      console.log('💾 媒体文件保存结果:', result);

      if (result.success && result.filePath && result.fileName) {
        // 生成媒体链接
        const mediaLink = this.generateMediaLink(result.fileName, result.filePath, result.fileType || fileType);
        console.log('🔗 生成媒体链接:', mediaLink);

        // 替换加载文本
        view.dispatch({
          changes: {
            from: pos,
            to: pos + loadingText.length,
            insert: mediaLink
          },
          selection: { anchor: pos + mediaLink.length }
        });

        console.log('✅ 媒体文件粘贴成功:', result.filePath);
      } else {
        // 移除加载文本并显示错误
        view.dispatch({
          changes: {
            from: pos,
            to: pos + loadingText.length,
            insert: ''
          }
        });

        this.showError(result.error || '媒体文件保存失败');
      }

    } catch (error) {
      console.error('媒体文件处理失败:', error);
      this.showError('媒体文件处理失败，请重试');
    }
  }

  /**
   * 获取加载文本
   */
  private getLoadingText(fileType: 'image' | 'audio' | 'video' | 'document'): string {
    switch (fileType) {
      case 'image':
        return '![上传中...](uploading)';
      case 'audio':
        return '🎵 音频上传中...';
      case 'video':
        return '🎬 视频上传中...';
      case 'document':
        return '📄 文档上传中...';
      default:
        return '📁 文件上传中...';
    }
  }

  /**
   * 保存媒体文件到Obsidian库
   */
  private async saveMediaToVault(file: File): Promise<MediaProcessResult> {
    try {
      const fileType = this.getFileType(file.type);
      console.log('🔍 开始保存媒体文件到vault，文件信息:', {
        name: file.name,
        type: file.type,
        size: file.size,
        fileType
      });

      // 使用与现有代码一致的方式访问vault
      const vault = this.plugin.app.vault || (window as any).app?.vault;
      console.log('🏛️ Vault访问状态:', {
        pluginVault: !!this.plugin.app.vault,
        windowVault: !!(window as any).app?.vault,
        finalVault: !!vault
      });

      if (!vault) {
        throw new Error('无法访问Obsidian vault');
      }
      
      // 生成安全的文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = this.getFileExtension(file.name) || this.getExtensionFromMimeType(file.type);
      const prefix = this.getFilePrefix(fileType);
      const fileName = `${prefix}-${timestamp}${extension}`;
      
      // 获取附件文件夹路径
      const attachmentFolder = this.getAttachmentFolder();
      
      // 确保附件文件夹存在
      await this.ensureFolder(attachmentFolder);
      
      // 完整文件路径
      const filePath = `${attachmentFolder}/${fileName}`;
      
      // 检查文件是否已存在，生成唯一路径
      const uniquePath = await this.getUniqueFilePath(filePath);
      const uniqueFileName = uniquePath.split('/').pop() || fileName;
      
      // 保存文件
      console.log('📁 准备保存文件:', uniquePath);
      const arrayBuffer = await file.arrayBuffer();
      console.log('💾 文件数据准备完成，大小:', arrayBuffer.byteLength, 'bytes');

      await vault.createBinary(uniquePath, arrayBuffer);
      console.log('✅ 文件已保存到vault:', uniquePath);

      // 验证文件是否真的保存成功
      const savedFile = vault.getAbstractFileByPath(uniquePath);
      console.log('🔍 文件保存验证:', {
        exists: !!savedFile,
        path: uniquePath,
        fileName: uniqueFileName
      });

      return {
        success: true,
        filePath: uniquePath,
        fileName: uniqueFileName,
        fileType: fileType
      };

    } catch (error) {
      console.error('保存图片失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 生成图片链接语法
   */
  private generateImageLink(fileName: string, filePath: string): string {
    if (this.config.useWikiLinks) {
      // Obsidian Wiki链接格式：![[文件名]]
      return `![[${fileName}]]`;
    } else {
      // 标准Markdown格式：![alt](path)
      const altText = fileName.replace(/\.[^/.]+$/, ''); // 移除扩展名作为alt文本
      return `![${altText}](${filePath})`;
    }
  }

  /**
   * 获取文件前缀
   */
  private getFilePrefix(fileType: 'image' | 'audio' | 'video' | 'document'): string {
    switch (fileType) {
      case 'image':
        return 'image';
      case 'audio':
        return 'audio';
      case 'video':
        return 'video';
      case 'document':
        return 'document';
      default:
        return 'file';
    }
  }

  /**
   * 获取附件文件夹路径
   */
  private getAttachmentFolder(): string {
    try {
      // 优先使用Obsidian设置的附件文件夹
      const vault = this.plugin.app.vault || (window as any).app?.vault;
      const vaultConfig = vault?.config;
      const obsidianAttachmentFolder = vaultConfig?.attachmentFolderPath;

      if (obsidianAttachmentFolder && obsidianAttachmentFolder !== '/') {
        console.log('📁 使用Obsidian配置的附件文件夹:', obsidianAttachmentFolder);
        return obsidianAttachmentFolder;
      }
    } catch (error) {
      console.warn('获取Obsidian附件文件夹配置失败:', error);
    }

    // 使用默认配置的附件文件夹
    console.log('📁 使用默认附件文件夹:', this.config.attachmentFolder);
    return this.config.attachmentFolder;
  }

  /**
   * 确保文件夹存在
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    try {
      const vault = this.plugin.app.vault || (window as any).app?.vault;
      if (!vault) {
        throw new Error('无法访问vault');
      }

      const folder = vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        console.log('📁 创建文件夹:', folderPath);
        await vault.createFolder(folderPath);
      } else {
        console.log('📁 文件夹已存在:', folderPath);
      }
    } catch (error) {
      // 文件夹可能已存在，忽略错误
      console.debug('文件夹创建结果:', folderPath, error);
    }
  }

  /**
   * 获取唯一文件路径
   */
  private async getUniqueFilePath(originalPath: string): Promise<string> {
    const vault = this.plugin.app.vault || (window as any).app?.vault;
    if (!vault) {
      return originalPath;
    }

    let counter = 0;
    let testPath = originalPath;

    while (vault.getAbstractFileByPath(testPath)) {
      counter++;
      const pathParts = originalPath.split('.');
      const extension = pathParts.pop();
      const basePath = pathParts.join('.');
      testPath = `${basePath}-${counter}.${extension}`;
    }

    console.log('📝 生成唯一文件路径:', testPath);
    return testPath;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(fileName: string): string | null {
    const match = fileName.match(/\.[^/.]+$/);
    return match ? match[0] : null;
  }

  /**
   * 根据MIME类型获取扩展名
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      // 图片格式
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff',

      // 音频格式
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/aac': '.aac',
      'audio/flac': '.flac',
      'audio/m4a': '.m4a',
      'audio/wma': '.wma',

      // 视频格式
      'video/mp4': '.mp4',
      'video/mpeg': '.mpeg',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
      'video/3gpp': '.3gp',
      'video/x-flv': '.flv',

      // 文档格式
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
    };

    return mimeToExt[mimeType] || '.bin';
  }

  /**
   * 生成媒体链接
   */
  private generateMediaLink(fileName: string, filePath: string, fileType: 'image' | 'audio' | 'video' | 'document'): string {
    if (this.config.useWikiLinks) {
      // 使用Obsidian Wiki链接格式
      switch (fileType) {
        case 'image':
          return `![[${fileName}]]`;
        case 'audio':
          return `![[${fileName}]]`;
        case 'video':
          return `![[${fileName}]]`;
        case 'document':
          return `[[${fileName}]]`;
        default:
          return `[[${fileName}]]`;
      }
    } else {
      // 使用标准Markdown格式
      switch (fileType) {
        case 'image':
          return `![${fileName}](${filePath})`;
        case 'audio':
          return `<audio controls><source src="${filePath}" type="audio/mpeg">您的浏览器不支持音频播放。</audio>`;
        case 'video':
          return `<video controls><source src="${filePath}" type="video/mp4">您的浏览器不支持视频播放。</video>`;
        case 'document':
          return `[${fileName}](${filePath})`;
        default:
          return `[${fileName}](${filePath})`;
      }
    }
  }

  /**
   * 显示错误消息
   */
  private showError(message: string): void {
    console.error('🚫 媒体文件粘贴错误:', message);

    // 使用Obsidian的Notice显示错误
    try {
      // 通过插件实例访问Obsidian API
      if (this.plugin && this.plugin.app) {
        // 使用Obsidian的Notice API
        const Notice = (window as any).Notice || this.plugin.app.Notice;
        if (Notice) {
          new Notice(message, 5000);
        } else {
          // 备用方案：直接创建Notice
          const notice = document.createElement('div');
          notice.className = 'notice';
          notice.textContent = message;
          document.body.appendChild(notice);
          setTimeout(() => notice.remove(), 5000);
        }
      }
    } catch (error) {
      console.error('显示错误通知失败:', error);
    }
  }
}

/**
 * 创建媒体文件粘贴扩展的便捷函数
 */
export function createImagePasteExtension(
  plugin: AnkiPlugin,
  config: Partial<MediaPasteConfig> = {}
): Extension {
  const extension = new MediaPasteExtension(plugin, config);
  return extension.create();
}

// 为了向后兼容，保留旧的接口名称
export const createMediaPasteExtension = createImagePasteExtension;

// 导出类型别名以保持向后兼容
export type ImagePasteConfig = MediaPasteConfig;
export type ImageProcessResult = MediaProcessResult;
export const ImagePasteExtension = MediaPasteExtension;
