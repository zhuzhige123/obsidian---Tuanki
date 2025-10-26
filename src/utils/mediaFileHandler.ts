import { Plugin, TFile } from 'obsidian';

export interface MediaFileResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface MediaProcessingResult {
  success: boolean;
  savedFiles: Record<string, string>; // originalName -> savedPath
  errors: string[];
}

/**
 * 专门处理APKG导入时的媒体文件保存和路径管理
 */
export class MediaFileHandler {
  private plugin: Plugin;
  private baseMediaPath: string;

  constructor(plugin: Plugin, deckId?: string) {
    this.plugin = plugin;
    // 使用tuanki作为专属数据文件夹，媒体文件存储在tuanki/media/下
    // 如果有deckId，则存储在tuanki/media/decks/{deckId}/下
    if (deckId) {
      this.baseMediaPath = `tuanki/media/decks/${deckId}`;
    } else {
      this.baseMediaPath = `tuanki/media/shared`;
    }
  }

  /**
   * 批量处理媒体文件
   */
  async processMediaFiles(
    mediaMapping: Record<string, string>,
    mediaFiles: Record<string, Uint8Array>
  ): Promise<MediaProcessingResult> {
    const result: MediaProcessingResult = {
      success: true,
      savedFiles: {},
      errors: []
    };

    try {
      // 确保媒体文件夹存在
      await this.ensureMediaFolder();

      console.log(`开始处理 ${Object.keys(mediaFiles).length} 个媒体文件...`);

      // 处理每个媒体文件
      for (const [index, filename] of Object.entries(mediaMapping)) {
        const fileData = mediaFiles[filename];
        if (!fileData) {
          const error = `媒体文件数据缺失: ${filename}`;
          console.warn(error);
          result.errors.push(error);
          continue;
        }

        try {
          const saveResult = await this.saveMediaFile(filename, fileData);
          if (saveResult.success && saveResult.filePath) {
            result.savedFiles[filename] = saveResult.filePath;
            console.log(`✅ 媒体文件已保存: ${filename} -> ${saveResult.filePath}`);
          } else {
            const error = `保存媒体文件失败: ${filename} - ${saveResult.error}`;
            console.error(error);
            result.errors.push(error);
            result.success = false;
          }
        } catch (error) {
          const errorMsg = `处理媒体文件异常: ${filename} - ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
          result.success = false;
        }
      }

      console.log(`媒体文件处理完成: 成功 ${Object.keys(result.savedFiles).length} 个，失败 ${result.errors.length} 个`);

    } catch (error) {
      const errorMsg = `媒体文件批量处理失败: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      result.success = false;
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * 保存单个媒体文件
   */
  async saveMediaFile(filename: string, fileData: Uint8Array): Promise<MediaFileResult> {
    try {
      // 生成安全的文件名
      const safeFilename = this.sanitizeFilename(filename);
      const filePath = `${this.baseMediaPath}/${safeFilename}`;

      // 检查文件是否已存在，如果存在则生成新名称
      const finalPath = await this.getUniqueFilePath(filePath);

      // 保存文件到Obsidian vault
      await this.plugin.app.vault.createBinary(finalPath, fileData.buffer as ArrayBuffer);

      return {
        success: true,
        filePath: finalPath
      };

    } catch (error) {
      console.error(`保存媒体文件失败: ${filename}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 确保媒体文件夹存在
   */
  private async ensureMediaFolder(): Promise<void> {
    try {
      // 创建层级文件夹
      const pathParts = this.baseMediaPath.split('/');
      let currentPath = '';

      for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        try {
          const folder = this.plugin.app.vault.getAbstractFileByPath(currentPath);
          if (!folder) {
            await this.plugin.app.vault.createFolder(currentPath);
            console.log(`创建媒体文件夹: ${currentPath}`);
          }
        } catch (error) {
          // 文件夹可能已存在，忽略错误
          if (!error || !(error as any).message?.includes("already exists")) {
            console.warn(`创建文件夹警告: ${currentPath}`, error);
          }
        }
      }
    } catch (error) {
      console.error('确保媒体文件夹存在失败:', error);
      throw error;
    }
  }

  /**
   * 清理文件名，移除不安全字符
   */
  private sanitizeFilename(filename: string): string {
    // 移除或替换不安全的字符
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // 替换不安全字符
      .replace(/\s+/g, '_') // 替换空格
      .replace(/_{2,}/g, '_') // 合并多个下划线
      .replace(/^_+|_+$/g, ''); // 移除开头和结尾的下划线
  }

  /**
   * 获取唯一的文件路径（如果文件已存在，则添加数字后缀）
   */
  private async getUniqueFilePath(originalPath: string): Promise<string> {
    let counter = 0;
    let testPath = originalPath;

    while (true) {
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(testPath);
      if (!existingFile) {
        return testPath;
      }

      counter++;
      const pathParts = originalPath.split('.');
      if (pathParts.length > 1) {
        const extension = pathParts.pop();
        const baseName = pathParts.join('.');
        testPath = `${baseName}_${counter}.${extension}`;
      } else {
        testPath = `${originalPath}_${counter}`;
      }

      // 防止无限循环
      if (counter > 1000) {
        throw new Error(`无法生成唯一文件路径: ${originalPath}`);
      }
    }
  }

  /**
   * 获取媒体文件的Obsidian资源路径
   */
  getMediaResourcePath(filename: string): string | null {
    try {
      const safeFilename = this.sanitizeFilename(filename);
      const filePath = `${this.baseMediaPath}/${safeFilename}`;
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

      if (file instanceof TFile) {
        return this.plugin.app.vault.getResourcePath(file);
      }

      return null;
    } catch (error) {
      console.warn(`获取媒体资源路径失败: ${filename}`, error);
      return null;
    }
  }

  /**
   * 获取Obsidian可访问的资源路径
   */
  private getObsidianResourcePath(savedPath: string): string {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(savedPath);
      if (file instanceof TFile) {
        // 使用Obsidian的资源路径API
        return this.plugin.app.vault.getResourcePath(file);
      }

      // 如果文件不存在，返回app://协议路径作为备用
      return `app://obsidian.md/${savedPath}`;
    } catch (error) {
      console.warn(`获取Obsidian资源路径失败: ${savedPath}`, error);
      return `app://obsidian.md/${savedPath}`;
    }
  }

  /**
   * 转换卡片内容中的媒体引用路径
   */
  /**
   * ✅ Phase 2: 增强媒体引用转换
   * 将 HTML 媒体标签转换为 Obsidian WikiLink 格式
   * 支持图片、音频、视频，保留 alt 文本和尺寸信息
   * 
   * @param content - 包含媒体引用的内容
   * @param savedFiles - 原始文件名到保存路径的映射
   * @returns 转换后的内容
   */
  convertMediaReferences(content: string, savedFiles: Record<string, string>): string {
    let convertedContent = content;

    // 处理各种媒体引用格式
    for (const [originalFilename, savedPath] of Object.entries(savedFiles)) {
      console.log(`转换媒体引用: ${originalFilename} -> ${savedPath}`);

      // ✅ Phase 2.1: HTML <img> → Obsidian WikiLink
      // 提取并保留 alt 和 width 属性
      const imgRegex = new RegExp(
        `<img([^>]*?)src=["']${this.escapeRegex(originalFilename)}["']([^>]*?)>`, 
        'gi'
      );
      convertedContent = convertedContent.replace(imgRegex, (match, before, after) => {
        // 提取 alt 属性
        const altMatch = (before + after).match(/alt=["']([^"']*?)["']/i);
        const altText = altMatch ? altMatch[1] : '';
        
        // 提取宽度
        const widthMatch = (before + after).match(/width=["']?(\d+)["']?/i);
        const width = widthMatch ? widthMatch[1] : '';
        
        // 生成 Obsidian 嵌入语法
        if (width && altText) {
          return `![[${savedPath}|${width}|${altText}]]`;
        } else if (width) {
          return `![[${savedPath}|${width}]]`;
        } else if (altText) {
          return `![[${savedPath}|${altText}]]`;
        } else {
          return `![[${savedPath}]]`;
        }
      });

      // ✅ Phase 2.2: HTML <audio> → Obsidian WikiLink
      const audioRegex = new RegExp(
        `<audio([^>]*?)src=["']${this.escapeRegex(originalFilename)}["']([^>]*?)>.*?</audio>`, 
        'gis'
      );
      convertedContent = convertedContent.replace(audioRegex, `![[${savedPath}]]`);
      
      // 处理自闭合 audio 标签
      const audioSelfClosingRegex = new RegExp(
        `<audio([^>]*?)src=["']${this.escapeRegex(originalFilename)}["']([^>]*?)/>`, 
        'gi'
      );
      convertedContent = convertedContent.replace(audioSelfClosingRegex, `![[${savedPath}]]`);

      // ✅ Phase 2.3: HTML <video> → Obsidian WikiLink
      const videoRegex = new RegExp(
        `<video([^>]*?)src=["']${this.escapeRegex(originalFilename)}["']([^>]*?)>.*?</video>`, 
        'gis'
      );
      convertedContent = convertedContent.replace(videoRegex, `![[${savedPath}]]`);
      
      // 处理自闭合 video 标签
      const videoSelfClosingRegex = new RegExp(
        `<video([^>]*?)src=["']${this.escapeRegex(originalFilename)}["']([^>]*?)/>`, 
        'gi'
      );
      convertedContent = convertedContent.replace(videoSelfClosingRegex, `![[${savedPath}]]`);

      // ✅ Phase 2.4: Markdown 图片 → Obsidian WikiLink
      const markdownImgRegex = new RegExp(
        `!\\[([^\\]]*)\\]\\(${this.escapeRegex(originalFilename)}\\)`, 
        'gi'
      );
      convertedContent = convertedContent.replace(markdownImgRegex, (match, alt) => {
        return alt ? `![[${savedPath}|${alt}]]` : `![[${savedPath}]]`;
      });
    }

    return convertedContent;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 清理指定牌组的媒体文件
   */
  async cleanupDeckMedia(deckId: string): Promise<void> {
    try {
      const deckMediaPath = `tuanki/media/decks/${deckId}`;
      const folder = this.plugin.app.vault.getAbstractFileByPath(deckMediaPath);
      
      if (folder) {
        // 删除文件夹及其内容
        await this.plugin.app.vault.delete(folder, true);
        console.log(`已清理牌组媒体文件: ${deckMediaPath}`);
      }
    } catch (error) {
      console.warn(`清理牌组媒体文件失败: ${deckId}`, error);
    }
  }
}
