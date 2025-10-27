/**
 * 临时文件管理器
 * 用于卡片编辑的临时文件创建、管理和清理
 */

import { TFile, TFolder, Notice } from 'obsidian';
import type AnkiPlugin from '../main';
import type { Card } from '../data/types';
import { generateSecureFileName } from '../utils/security';
import { cardToMarkdown, markdownToCard } from '../utils/card-markdown-serializer';
import { EmbeddedEditorManager } from './editor/embedded-editor-manager';
import type { EditorResult } from '../types/editor-types';

export interface TempFileInfo {
  /** 临时文件路径 */
  filePath: string;
  /** 关联的卡片ID */
  cardId: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessed: number;
  /** 是否正在编辑中 */
  isEditing: boolean;
  /** 打开编辑时的基准卡片（用于新建卡片场景） */
  baseCard?: Card;
}

export interface TempFileResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface CardSyncResult {
  success: boolean;
  updatedCard?: Card;
  error?: string;
}

export class TempFileManager {
  private plugin: AnkiPlugin;
  private tempFiles: Map<string, TempFileInfo> = new Map();
  private editorManagers: Map<string, EmbeddedEditorManager> = new Map(); // ✅ 新增：管理器映射
  private tempFolderPath = 'tuanki/temp';
  private cleanupInterval: number | null = null;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5分钟
  private readonly MAX_FILE_AGE = 30 * 60 * 1000; // 30分钟

  // 文件名前缀配置
  private readonly FILE_PREFIX = 'tuanki-temp';
  private readonly PROCESS_ID = Date.now().toString(36); // 进程唯一标识

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.initializeCleanup();
  }

  /**
   * 初始化清理机制
   */
  private initializeCleanup(): void {
    // 启动时清理孤儿文件
    this.cleanupOrphanedFiles();

    // 设置定期清理
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupExpiredFiles();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * 生成带前缀的临时文件名
   */
  private generateTempFileName(cardId: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${this.FILE_PREFIX}-${this.PROCESS_ID}-${cardId}-${timestamp}-${randomSuffix}.md`;
  }

  /**
   * 检查文件是否为Tuanki临时文件
   */
  private isTuankiTempFile(fileName: string): boolean {
    return fileName.startsWith(this.FILE_PREFIX) && fileName.endsWith('.md');
  }

  /**
   * 检查文件是否为当前进程创建的临时文件
   */
  private isCurrentProcessTempFile(fileName: string): boolean {
    return fileName.startsWith(`${this.FILE_PREFIX}-${this.PROCESS_ID}-`) && fileName.endsWith('.md');
  }

  /**
   * 为卡片创建临时文件
   */
  async createTempFile(card: Card): Promise<TempFileResult> {
    try {
      console.log(`[TempFileManager] 为卡片创建临时文件: ${card.id}`);
      return await this.createTraditionalTempFile(card);
    } catch (error) {
      console.error(`[TempFileManager] 创建临时文件失败:`, error);
      return {
        success: false,
        error: `创建临时文件失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 创建传统临时文件
   */
  private async createTraditionalTempFile(card: Card): Promise<TempFileResult> {
    try {
      console.log(`[TempFileManager] 创建临时文件: ${card.id}`);

      // 确保临时文件夹存在
      await this.ensureTempFolder();

      // 生成带前缀的唯一临时文件名
      const fileName = this.generateTempFileName(card.id);
      let filePath = `${this.tempFolderPath}/${fileName}`;

      // 构建卡片内容为Markdown格式
      const markdownContent = cardToMarkdown(card);

      console.log(`[TempFileManager] 准备创建文件: ${filePath}`);
      console.log(`[TempFileManager] 文件内容长度: ${markdownContent.length} 字符`);

      // 检查文件是否已存在
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        console.warn(`[TempFileManager] 文件已存在，将删除: ${filePath}`);
        await this.plugin.app.vault.delete(existingFile);
      }

      // 创建临时文件
      let createdFile: any = null;
      try {
        createdFile = await this.plugin.app.vault.create(filePath, markdownContent);

        if (createdFile) {
          console.log(`[TempFileManager] 策略1成功 - 文件创建成功:`, createdFile.path);
        }
      } catch (error) {
        console.warn(`[TempFileManager] 策略1失败:`, error);
        createdFile = null;
      }

      // 策略2: 如果策略1失败，使用adapter在插件文件夹中写入
      if (!createdFile) {
        filePath = `${this.tempFolderPath}/${fileName}`; // 保持在插件文件夹中
        console.log(`[TempFileManager] 尝试策略2 - 使用adapter在插件文件夹写入: ${filePath}`);

        try {
          // 先确保文件夹存在
          await this.ensureTempFolder();
          
          // 使用adapter写入
          await this.plugin.app.vault.adapter.write(filePath, markdownContent);

          // 等待一小段时间让Obsidian检测到文件
          await new Promise(resolve => setTimeout(resolve, 100));

          createdFile = this.plugin.app.vault.getAbstractFileByPath(filePath);

          if (createdFile) {
            console.log(`[TempFileManager] 策略2成功 - 文件创建成功:`, createdFile.path);
          }
        } catch (error) {
          console.warn(`[TempFileManager] 策略2失败:`, error);
          createdFile = null;
        }
      }

      // 策略3: 如果前两个策略都失败，尝试在插件文件夹中使用不同的文件名重试
      if (!createdFile) {
        const retryFileName = `${this.FILE_PREFIX}-retry-${Date.now()}-${card.id.substring(0, 8)}.md`;
        filePath = `${this.tempFolderPath}/${retryFileName}`;
        console.log(`[TempFileManager] 尝试策略3 - 使用新文件名在插件文件夹重试: ${filePath}`);

        try {
          // 确保文件夹存在
          await this.ensureTempFolder();
          
          // 尝试创建
          createdFile = await this.plugin.app.vault.create(filePath, markdownContent);

          if (createdFile) {
            console.log(`[TempFileManager] 策略3成功 - 文件创建成功:`, createdFile.path);
          }
        } catch (error) {
          console.error(`[TempFileManager] 策略3失败:`, error);
          
          // 最后一次尝试：使用adapter
          try {
            await this.plugin.app.vault.adapter.write(filePath, markdownContent);
            await new Promise(resolve => setTimeout(resolve, 100));
            createdFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
            
            if (createdFile) {
              console.log(`[TempFileManager] 策略3最终成功 - adapter写入成功:`, createdFile.path);
            }
          } catch (finalError) {
            console.error(`[TempFileManager] 策略3最终失败:`, finalError);
          }
        }
      }

      if (!createdFile) {
        throw new Error(`所有文件创建策略都失败了。最后尝试的路径: ${filePath}`);
      }

      // 验证文件是否真的创建成功
      const verifyFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!verifyFile) {
        throw new Error(`文件创建后无法找到: ${filePath}`);
      }

      // 记录临时文件信息
      const timestamp = Date.now();
      const tempFileInfo: TempFileInfo = {
        filePath,
        cardId: card.id,
        createdAt: timestamp,
        lastAccessed: timestamp,
        isEditing: true,
        baseCard: card
      };

      this.tempFiles.set(card.id, tempFileInfo);

      console.log(`[TempFileManager] 临时文件创建成功: ${filePath}`);
      return { success: true, filePath };

    } catch (error) {
      console.error(`[TempFileManager] 创建临时文件失败:`, error);
      return {
        success: false,
        error: `创建临时文件失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  private async ensureTempFolder(): Promise<void> {
    console.log(`[TempFileManager] 开始确保临时文件夹存在: ${this.tempFolderPath}`);

    try {
      await this.createFolderSafely(this.tempFolderPath);
      console.log(`[TempFileManager] 临时文件夹确保完成: ${this.tempFolderPath}`);
    } catch (error) {
      console.error(`[TempFileManager] 确保临时文件夹失败:`, error);
      console.warn(`[TempFileManager] 忽略文件夹创建错误，继续执行`);
    }
  }

  /**
   * 安全地创建文件夹（忽略"已存在"错误）
   */
  private async createFolderSafely(folderPath: string): Promise<void> {
    try {
      // 首先检查文件夹是否已存在
      const existingFolder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
      if (existingFolder) {
        console.log(`[TempFileManager] 文件夹已存在: ${folderPath}`);
        return;
      }

      // 分层创建文件夹
      const pathParts = folderPath.split('/').filter(part => part.length > 0);
      let currentPath = '';

      for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        try {
          const partFolder = this.plugin.app.vault.getAbstractFileByPath(currentPath);
          if (!partFolder) {
            try {
              await this.plugin.app.vault.createFolder(currentPath);
              console.log(`[TempFileManager] ✅ 成功创建文件夹: ${currentPath}`);
            } catch (createError) {
              // 双重保险：再次检查文件夹是否已存在
              const recheckFolder = this.plugin.app.vault.getAbstractFileByPath(currentPath);
              if (recheckFolder) {
                console.log(`[TempFileManager] 文件夹已存在（创建失败后再次检查）: ${currentPath}`);
                continue;
              }

              const errorMessage = createError instanceof Error ? createError.message : String(createError);
              const errorString = String(createError).toLowerCase();

              // 增强的"已存在"错误匹配（支持更多错误格式）
              if (errorString.includes('already exists') ||
                  errorString.includes('already exist') ||
                  errorString.includes('file exists') ||
                  errorString.includes('folder exists') ||
                  errorMessage.toLowerCase().includes('exists')) {
                console.log(`[TempFileManager] 文件夹已存在（忽略错误）: ${currentPath}`);
                continue;
              }

              // 如果是其他错误，打印警告但不中断流程
              console.warn(`[TempFileManager] ⚠️ 创建文件夹时出现非致命错误: ${currentPath}`, createError);
              // 继续尝试下一个路径部分
            }
          } else {
            console.log(`[TempFileManager] 文件夹已存在: ${currentPath}`);
          }
        } catch (error) {
          // 如果整个分层创建过程出错，打印警告但继续
          console.warn(`[TempFileManager] 处理文件夹路径部分时出错: ${currentPath}`, error);
        }
      }

    } catch (error) {
      console.warn(`[TempFileManager] 创建文件夹过程中出现错误:`, error);
      // 绝对不抛出错误，让调用者继续执行
    }
  }

  /**
   * 打开临时文件进行编辑（新标签页方式）
   */
  async openTempFile(cardId: string): Promise<boolean> {
    try {
      const tempFileInfo = this.tempFiles.get(cardId);
      if (!tempFileInfo) {
        console.error(`[TempFileManager] 未找到卡片的临时文件: ${cardId}`);
        return false;
      }

      console.log(`[TempFileManager] 准备打开临时文件: ${tempFileInfo.filePath}`);

      // 更新访问时间
      tempFileInfo.lastAccessed = Date.now();
      tempFileInfo.isEditing = true;

      // 获取文件对象
      const file = this.plugin.app.vault.getAbstractFileByPath(tempFileInfo.filePath);
      console.log(`[TempFileManager] 文件查找结果:`, file ? `找到文件: ${file.path}` : '文件不存在');

      if (!(file instanceof TFile)) {
        console.error(`[TempFileManager] 临时文件不存在或不是TFile类型: ${tempFileInfo.filePath}`);

        // 尝试重新创建文件
        console.log(`[TempFileManager] 尝试重新创建临时文件...`);
        const card = await this.getCardById(cardId);
        if (card) {
          const recreateResult = await this.createTempFile(card);
          if (recreateResult.success) {
            return await this.openTempFile(cardId); // 递归调用
          }
        }

        return false;
      }

      // 在新标签页中打开文件
      try {
        const leaf = this.plugin.app.workspace.getLeaf('tab');
        await leaf.openFile(file, { active: true });
        console.log(`[TempFileManager] 临时文件已在新标签页打开: ${tempFileInfo.filePath}`);

        // 等待文件完全加载
        await new Promise(resolve => setTimeout(resolve, 200));

        // 可选：聚焦到编辑器
        const markdownView = leaf.view;
        if (markdownView && 'editor' in markdownView) {
          const editor = (markdownView as any).editor;
          if (editor && editor.focus) {
            editor.focus();
          }
        }

        return true;

      } catch (openError) {
        console.error(`[TempFileManager] 打开文件失败:`, openError);

        // 回退方案：使用workspace.openLinkText
        try {
          console.log(`[TempFileManager] 尝试回退方案打开文件...`);
          await this.plugin.app.workspace.openLinkText(tempFileInfo.filePath, '', true);
          return true;
        } catch (fallbackError) {
          console.error(`[TempFileManager] 回退方案也失败:`, fallbackError);
          return false;
        }
      }

    } catch (error) {
      console.error(`[TempFileManager] 打开临时文件失败:`, error);
      return false;
    }
  }

  /**
   * 创建嵌入式编辑器（重构版 - 使用EmbeddedEditorManager）
   */
  async createEmbeddedEditor(
    container: HTMLElement,
    cardId: string,
    onSave: (content: string) => void,
    onCancel: () => void
  ): Promise<{ success: boolean; error?: string; cleanup?: () => void }> {
    try {
      const tempFileInfo = this.tempFiles.get(cardId);
      if (!tempFileInfo) {
        return { success: false, error: '未找到临时文件信息' };
      }

      // 获取文件对象
      const file = this.plugin.app.vault.getAbstractFileByPath(tempFileInfo.filePath);
      if (!(file instanceof TFile)) {
        return { success: false, error: '临时文件不存在' };
      }

      console.log(`[TempFileManager] 创建嵌入式编辑器: ${tempFileInfo.filePath}`);

      // ✅ 使用新的EmbeddedEditorManager
      const manager = new EmbeddedEditorManager(this.plugin, this.plugin.settings?.enableDebugMode);
      
      const result: EditorResult = await manager.create(container, file, {
        onSave,
        onCancel,
        initialCursorPosition: 'end',
        enableKeyboardShortcuts: true,
        enableContextMenu: true,
        debug: this.plugin.settings?.enableDebugMode
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || '创建编辑器失败'
        };
      }

      // ✅ 追踪管理器实例
      this.trackEditorInstance(cardId, manager);

      // ✅ 返回兼容的结果格式
      console.log(`[TempFileManager] 嵌入式编辑器创建成功: ${cardId}`);
      return {
        success: true,
        cleanup: () => {
          this.cleanupEditorInstance(cardId);
          result.cleanup();
        }
      };

    } catch (error) {
      console.error(`[TempFileManager] 创建嵌入式编辑器失败:`, error);
      return {
        success: false,
        error: `创建嵌入式编辑器失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 追踪编辑器实例
   */
  private trackEditorInstance(cardId: string, manager: EmbeddedEditorManager): void {
    this.editorManagers.set(cardId, manager);
    console.log(`[TempFileManager] 编辑器实例已追踪: ${cardId}`);
  }

  /**
   * 清理编辑器实例
   */
  private cleanupEditorInstance(cardId: string): void {
    const manager = this.editorManagers.get(cardId);
    if (manager) {
      manager.destroy();
      this.editorManagers.delete(cardId);
      console.log(`[TempFileManager] 编辑器实例已清理: ${cardId}`);
    }
  }

  /**
   * 设置嵌入式编辑器样式
   */
  private setupEmbeddedEditorStyles(editorEl: HTMLElement): void {
    console.log('[TempFileManager] 开始设置嵌入式编辑器样式');
    
    // ✅ 新增：检查父容器高度
    const parentContainer = editorEl.parentElement;
    if (parentContainer) {
      const parentHeight = parentContainer.getBoundingClientRect().height;
      console.log(`[TempFileManager] 父容器高度: ${parentHeight}px`);
      
      if (parentHeight < 300) {
        console.warn(`[TempFileManager] ⚠️ 父容器高度过小: ${parentHeight}px，编辑器可能显示异常`);
      }
    }

    // 编辑器容器样式 - 确保完全填充父容器
    editorEl.style.width = '100%';
    editorEl.style.height = '100%';
    editorEl.style.border = 'none';
    editorEl.style.outline = 'none';
    editorEl.style.borderRadius = 'inherit';
    editorEl.style.boxSizing = 'border-box';
    editorEl.style.overflow = 'auto'; // 改为auto，允许滚动
    editorEl.style.margin = '0';
    editorEl.style.padding = '8px';
    editorEl.style.position = 'relative';

    // 设置编辑器主题适配
    editorEl.style.background = 'var(--background-primary)';
    editorEl.style.color = 'var(--text-normal)';

    // 查找并设置CodeMirror编辑器样式
    const cmEditor = editorEl.querySelector('.cm-editor');
    if (cmEditor) {
      console.log('[TempFileManager] 设置CodeMirror编辑器样式');
      const cmEditorEl = cmEditor as HTMLElement;
      cmEditorEl.style.height = '100%';
      // ✅ 保留CSS定义的min-height: 300px，不覆盖为unset
      cmEditorEl.style.fontSize = 'var(--font-text-size)';
      cmEditorEl.style.fontFamily = 'var(--font-text)';
      cmEditorEl.style.border = 'none';
      cmEditorEl.style.background = 'transparent';
    }

    // 设置滚动容器样式
    const cmScroller = editorEl.querySelector('.cm-scroller');
    if (cmScroller) {
      console.log('[TempFileManager] 设置CodeMirror滚动容器样式');
      const cmScrollerEl = cmScroller as HTMLElement;
      cmScrollerEl.style.fontFamily = 'var(--font-text)';
      cmScrollerEl.style.height = '100%';
      cmScrollerEl.style.overflow = 'auto';
    }

    // 设置内容区域样式 - 关键：移除固定高度限制
    const cmContent = editorEl.querySelector('.cm-content');
    if (cmContent) {
      console.log('[TempFileManager] 设置CodeMirror内容区域样式');
      const cmContentEl = cmContent as HTMLElement;
      cmContentEl.style.padding = '12px';
      cmContentEl.style.minHeight = 'unset'; // 移除最小高度，让内容自适应
      cmContentEl.style.height = 'auto'; // 高度自适应内容
    }

    // 设置编辑器视口样式
    const cmViewport = editorEl.querySelector('.cm-viewport');
    if (cmViewport) {
      console.log('[TempFileManager] 设置CodeMirror视口样式');
      const cmViewportEl = cmViewport as HTMLElement;
      cmViewportEl.style.height = '100%';
      cmViewportEl.style.overflow = 'visible';
    }

    // 隐藏可能显示文件名的元素
    this.hideFileNameInEditor(editorEl);

    console.log('[TempFileManager] 嵌入式编辑器样式设置完成');
  }

  /**
   * 隐藏文件名显示相关的所有元素
   */
  private hideFileNameElements(leaf: any): void {
    try {
      console.log('[TempFileManager] 开始隐藏文件名显示元素');

      // 隐藏视图标题栏（包含文件名）
      const viewHeaderEl = leaf.view?.containerEl?.querySelector('.view-header');
      if (viewHeaderEl) {
        (viewHeaderEl as HTMLElement).style.display = 'none';
        console.log('[TempFileManager] 隐藏视图标题栏');
      }

      // 隐藏文件标题元素
      const fileTitleEl = leaf.view?.containerEl?.querySelector('.view-header-title');
      if (fileTitleEl) {
        (fileTitleEl as HTMLElement).style.display = 'none';
        console.log('[TempFileManager] 隐藏文件标题');
      }

      // 隐藏面包屑导航
      const breadcrumbEl = leaf.view?.containerEl?.querySelector('.view-header-breadcrumb');
      if (breadcrumbEl) {
        (breadcrumbEl as HTMLElement).style.display = 'none';
        console.log('[TempFileManager] 隐藏面包屑导航');
      }

      // 隐藏文件路径显示
      const filePathEl = leaf.view?.containerEl?.querySelector('.view-header-title-container');
      if (filePathEl) {
        (filePathEl as HTMLElement).style.display = 'none';
        console.log('[TempFileManager] 隐藏文件路径显示');
      }

      // 隐藏编辑器标题栏
      const editorTitleEl = leaf.view?.containerEl?.querySelector('.markdown-source-view .cm-editor .cm-line:first-child');
      if (editorTitleEl && (editorTitleEl as HTMLElement).textContent?.includes('uuid_')) {
        (editorTitleEl as HTMLElement).style.display = 'none';
        console.log('[TempFileManager] 隐藏编辑器中的UUID标题');
      }

      // 通用方法：查找所有包含UUID的文本元素并隐藏
      const allElements = leaf.view?.containerEl?.querySelectorAll('*');
      if (allElements) {
        allElements.forEach((el: Element) => {
          const textContent = el.textContent || '';
          if (textContent.includes('uuid_') && textContent.length < 100) { // 避免隐藏大段内容
            (el as HTMLElement).style.display = 'none';
            console.log('[TempFileManager] 隐藏包含UUID的元素:', textContent.substring(0, 50));
          }
        });
      }

      console.log('[TempFileManager] 文件名元素隐藏完成');
    } catch (error) {
      console.warn('[TempFileManager] 隐藏文件名元素时出错:', error);
    }
  }

  /**
   * 隐藏编辑器内部可能显示文件名的元素
   */
  private hideFileNameInEditor(editorEl: HTMLElement): void {
    try {
      console.log('[TempFileManager] 开始隐藏编辑器内文件名元素');

      // 使用延迟执行，确保DOM完全渲染
      setTimeout(() => {
        // 隐藏所有包含UUID的文本节点
        const walker = document.createTreeWalker(
          editorEl,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const text = node.textContent || '';
              return text.includes('uuid_') && text.length < 50
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
            }
          }
        );

        const uuidTextNodes: Text[] = [];
        let node;
        while (node = walker.nextNode()) {
          uuidTextNodes.push(node as Text);
        }

        // 隐藏包含UUID的文本节点的父元素
        uuidTextNodes.forEach(textNode => {
          const parentEl = textNode.parentElement;
          if (parentEl) {
            parentEl.style.display = 'none';
            console.log('[TempFileManager] 隐藏UUID文本节点:', textNode.textContent?.substring(0, 30));
          }
        });

        // 特别处理可能的标题元素
        const possibleTitleSelectors = [
          '.cm-line:first-child',
          '.cm-header',
          '.cm-title',
          '.view-header-title',
          '.file-title'
        ];

        possibleTitleSelectors.forEach(selector => {
          const elements = editorEl.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent || '';
            if (text.includes('uuid_')) {
              (el as HTMLElement).style.display = 'none';
              console.log('[TempFileManager] 隐藏标题元素:', text.substring(0, 30));
            }
          });
        });

      }, 200); // 延迟200ms确保DOM渲染完成

      console.log('[TempFileManager] 编辑器内文件名元素隐藏设置完成');
    } catch (error) {
      console.warn('[TempFileManager] 隐藏编辑器内文件名元素时出错:', error);
    }
  }

  /**
   * 刷新编辑器布局，确保正确适应容器大小
   */
  private refreshEditorLayout(editorEl: HTMLElement): void {
    try {
      console.log('[TempFileManager] 刷新编辑器布局');

      // 获取容器的实际高度
      const container = editorEl.parentElement;
      if (!container) return;

      const containerHeight = container.clientHeight;
      const containerPadding = 16; // 8px * 2
      const availableHeight = containerHeight - containerPadding;

      console.log('[TempFileManager] 容器高度信息:', {
        containerHeight,
        availableHeight
      });

      // 强制设置编辑器高度
      editorEl.style.height = `${availableHeight}px`;

      // 更新CodeMirror组件的高度
      const cmEditor = editorEl.querySelector('.cm-editor');
      if (cmEditor) {
        (cmEditor as HTMLElement).style.height = `${availableHeight - 16}px`;
      }

      const cmScroller = editorEl.querySelector('.cm-scroller');
      if (cmScroller) {
        (cmScroller as HTMLElement).style.height = `${availableHeight - 16}px`;
      }

      // 触发CodeMirror重新计算布局
      const cmViewport = editorEl.querySelector('.cm-viewport');
      if (cmViewport) {
        // 触发resize事件让CodeMirror重新计算
        const resizeEvent = new Event('resize');
        window.dispatchEvent(resizeEvent);
      }

      console.log('[TempFileManager] 编辑器布局刷新完成');
    } catch (error) {
      console.error('[TempFileManager] 刷新编辑器布局失败:', error);
    }
  }



  /**
   * 清理所有临时文件
   */
  private async cleanupAllTempFiles(): Promise<void> {
    console.log(`[TempFileManager] 清理所有临时文件`);
    
    for (const [cardId, tempFileInfo] of this.tempFiles) {
      await this.deleteTempFile(cardId);
    }
    
    this.tempFiles.clear();
  }

  /**
   * 清理孤儿文件（基于前缀的智能清理）
   */
  private async cleanupOrphanedFiles(): Promise<void> {
    try {
      console.log('[TempFileManager] 开始清理孤儿文件...');

      const tempFolder = this.plugin.app.vault.getAbstractFileByPath(this.tempFolderPath);
      if (!tempFolder || !(tempFolder instanceof TFolder)) {
        console.log('[TempFileManager] 临时文件夹不存在，跳过清理');
        return;
      }

      const files = tempFolder.children.filter(child => child instanceof TFile) as TFile[];
      let cleanedCount = 0;
      let currentProcessCount = 0;

      for (const file of files) {
        try {
          // 检查文件是否为Tuanki临时文件（基于前缀）
          if (this.isTuankiTempFile(file.name)) {
            // 如果是当前进程的文件，保留（可能正在使用）
            if (this.isCurrentProcessTempFile(file.name)) {
              currentProcessCount++;
              console.log(`[TempFileManager] 保留当前进程文件: ${file.name}`);
              continue;
            }

            // 清理其他进程或旧版本的临时文件
            await this.plugin.app.vault.delete(file);
            cleanedCount++;
            console.log(`[TempFileManager] 清理孤儿文件: ${file.path}`);
          }
        } catch (error) {
          console.warn(`[TempFileManager] 清理文件失败: ${file.path}`, error);
        }
      }

      console.log(`[TempFileManager] 孤儿文件清理完成，清理 ${cleanedCount} 个文件，保留 ${currentProcessCount} 个当前进程文件`);

    } catch (error) {
      console.error('[TempFileManager] 清理孤儿文件失败:', error);
    }
  }

  /**
   * 清理过期文件
   */
  private async cleanupExpiredFiles(): Promise<void> {
    const now = Date.now();
    const expiredCards: string[] = [];

    for (const [cardId, tempFileInfo] of this.tempFiles) {
      if (now - tempFileInfo.lastAccessed > this.MAX_FILE_AGE) {
        expiredCards.push(cardId);
      }
    }

    for (const cardId of expiredCards) {
      await this.deleteTempFile(cardId);
    }

    if (expiredCards.length > 0) {
      console.log(`[TempFileManager] 清理了 ${expiredCards.length} 个过期临时文件`);
    }
  }

  /**
   * 手动清理临时文件（公共方法，供UI调用）
   * 清理所有旧的临时文件，但保留当前进程正在使用的文件
   */
  public async manualCleanup(): Promise<{
    success: boolean;
    cleaned: number;
    total: number;
    errors: string[];
    details: Array<{ path: string; size: number; age: number }>;
  }> {
    try {
      console.log('[TempFileManager] 开始手动清理临时文件（全局扫描）...');

      // 获取vault中所有文件，递归扫描整个vault
      const allFiles = this.plugin.app.vault.getFiles();
      
      // 过滤出所有tuanki临时文件
      const tuankiTempFiles = allFiles.filter(file => this.isTuankiTempFile(file.name));
      
      console.log(`[TempFileManager] 找到 ${tuankiTempFiles.length} 个临时文件`);
      
      let cleanedCount = 0;
      const errors: string[] = [];
      const details: Array<{ path: string; size: number; age: number }> = [];
      const now = Date.now();

      for (const file of tuankiTempFiles) {
        // 跳过当前进程正在使用的文件
        if (this.isCurrentProcessTempFile(file.name)) {
          console.log(`[TempFileManager] 跳过当前进程文件: ${file.name}`);
          continue;
        }

        try {
          const stat = await this.plugin.app.vault.adapter.stat(file.path);
          const fileAge = stat ? now - stat.mtime : 0;
          
          details.push({
            path: file.path,
            size: stat?.size || 0,
            age: fileAge
          });

          await this.plugin.app.vault.delete(file);
          cleanedCount++;
          console.log(`[TempFileManager] 已清理: ${file.path}`);
        } catch (error) {
          const errorMsg = `清理文件失败 ${file.path}: ${error instanceof Error ? error.message : '未知错误'}`;
          errors.push(errorMsg);
          console.warn(`[TempFileManager] ${errorMsg}`);
        }
      }

      const result = {
        success: errors.length === 0,
        cleaned: cleanedCount,
        total: tuankiTempFiles.length,
        errors,
        details
      };

      console.log(`[TempFileManager] 手动清理完成: 共${result.total}个文件，已清理${result.cleaned}个，失败${errors.length}个`);
      return result;
    } catch (error) {
      console.error('[TempFileManager] 手动清理失败:', error);
      return {
        success: false,
        cleaned: 0,
        total: 0,
        errors: [`清理过程失败: ${error instanceof Error ? error.message : '未知错误'}`],
        details: []
      };
    }
  }

  /**
   * 清理所有Tuanki临时文件（强制清理）
   */
  async cleanupAllTuankiTempFiles(): Promise<{ cleaned: number; errors: number }> {
    try {
      console.log('[TempFileManager] 开始强制清理所有Tuanki临时文件...');

      const tempFolder = this.plugin.app.vault.getAbstractFileByPath(this.tempFolderPath);
      if (!tempFolder || !(tempFolder instanceof TFolder)) {
        console.log('[TempFileManager] 临时文件夹不存在');
        return { cleaned: 0, errors: 0 };
      }

      const files = tempFolder.children.filter(child => child instanceof TFile) as TFile[];
      let cleanedCount = 0;
      let errorCount = 0;

      for (const file of files) {
        try {
          // 检查文件是否为Tuanki临时文件（基于前缀）
          if (this.isTuankiTempFile(file.name)) {
            await this.plugin.app.vault.delete(file);
            cleanedCount++;
            console.log(`[TempFileManager] 强制清理文件: ${file.path}`);
          }
        } catch (error) {
          errorCount++;
          console.warn(`[TempFileManager] 强制清理文件失败: ${file.path}`, error);
        }
      }

      // 清理内存中的记录
      this.tempFiles.clear();

      console.log(`[TempFileManager] 强制清理完成，清理 ${cleanedCount} 个文件，${errorCount} 个错误`);
      return { cleaned: cleanedCount, errors: errorCount };

    } catch (error) {
      console.error('[TempFileManager] 强制清理失败:', error);
      return { cleaned: 0, errors: 1 };
    }
  }

  /**
   * 删除临时文件
   */
  private async deleteTempFile(cardId: string): Promise<void> {
    try {
      const tempFileInfo = this.tempFiles.get(cardId);
      if (!tempFileInfo) return;

      const file = this.plugin.app.vault.getAbstractFileByPath(tempFileInfo.filePath);
      if (file instanceof TFile) {
        await this.plugin.app.vault.delete(file);
        console.log(`[TempFileManager] 删除临时文件: ${tempFileInfo.filePath}`);
      }

      this.tempFiles.delete(cardId);
    } catch (error) {
      console.error(`[TempFileManager] 删除临时文件失败:`, error);
    }
  }

  /**
   * 同步临时文件内容到卡片
   */
  async syncTempFileToCard(cardId: string): Promise<CardSyncResult> {
    try {
      const tempFileInfo = this.tempFiles.get(cardId);
      if (!tempFileInfo) {
        return { success: false, error: '未找到临时文件' };
      }

      // 读取临时文件内容
      const file = this.plugin.app.vault.getAbstractFileByPath(tempFileInfo.filePath);
      if (!(file instanceof TFile)) {
        return { success: false, error: '临时文件不存在' };
      }

      const content = await this.plugin.app.vault.read(file);

      // 获取原始卡片；若为新建卡片，使用临时信息中的基准卡片
      const originalCard = (await this.getCardById(cardId)) || this.tempFiles.get(cardId)?.baseCard as Card;
      if (!originalCard) {
        // 极端情况：既没有存储中的卡片，也没有基准卡片
        return { success: false, error: '未找到卡片数据' };
      }

      // 解析Markdown内容并更新/创建卡片
      const updatedCard = this.markdownToCard(content, originalCard);

      // 保存更新后的卡片
      const saveResult = await this.plugin.dataStorage.saveCard(updatedCard);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '保存卡片失败' };
      }

      console.log(`[TempFileManager] 卡片同步成功: ${cardId}`);
      return { success: true, updatedCard };

    } catch (error) {
      console.error(`[TempFileManager] 同步卡片失败:`, error);
      return {
        success: false,
        error: `同步失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 将Obsidian Markdown内容（包含YAML frontmatter）解析为卡片数据
   */
  private markdownToCard(content: string, originalCard: Card): Card {
    // 使用抽取的序列化工具
    return markdownToCard(content, originalCard);
  }





  /**
   * 根据ID获取卡片
   */
  private async getCardById(cardId: string): Promise<Card | null> {
    try {
      // 从所有牌组中查找卡片
      const decks = await this.plugin.dataStorage.getDecks();
      for (const deck of decks) {
        const cards = await this.plugin.dataStorage.getDeckCards(deck.id);
        const card = cards.find(c => c.id === cardId);
        if (card) {
          return card;
        }
      }
      return null;
    } catch (error) {
      console.error(`[TempFileManager] 获取卡片失败:`, error);
      return null;
    }
  }

  /**
   * 完成编辑并清理临时文件
   */
  async finishEditing(cardId: string, shouldSync: boolean = true): Promise<CardSyncResult> {
    try {
      // ✅ 清理编辑器管理器实例
      this.cleanupEditorInstance(cardId);
      
      let result: CardSyncResult = { success: true };

      if (shouldSync) {
        // 同步内容到卡片
        result = await this.syncTempFileToCard(cardId);
        if (!result.success) {
          return result;
        }
      }

      // 删除临时文件
      await this.deleteTempFile(cardId);

      console.log(`[TempFileManager] 编辑完成: ${cardId}`);
      return result;

    } catch (error) {
      console.error(`[TempFileManager] 完成编辑失败:`, error);
      return {
        success: false,
        error: `完成编辑失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 取消编辑并清理临时文件
   */
  async cancelEditing(cardId: string): Promise<void> {
    // ✅ 清理编辑器管理器实例
    this.cleanupEditorInstance(cardId);
    
    await this.deleteTempFile(cardId);
    console.log(`[TempFileManager] 取消编辑: ${cardId}`);
  }

  /**
   * 检查卡片是否正在编辑
   */
  isCardEditing(cardId: string): boolean {
    const tempFileInfo = this.tempFiles.get(cardId);
    return tempFileInfo?.isEditing || false;
  }

  /**
   * 获取临时文件信息
   */
  getTempFileInfo(cardId: string): TempFileInfo | null {
    return this.tempFiles.get(cardId) || null;
  }

  /**
   * 获取文件前缀信息（用于调试和监控）
   */
  getFilePrefix(): string {
    return this.FILE_PREFIX;
  }

  /**
   * 获取当前进程ID（用于调试和监控）
   */
  getProcessId(): string {
    return this.PROCESS_ID;
  }

  /**
   * 获取临时文件统计信息
   */
  getTempFileStats(): {
    activeFiles: number;
    totalCreated: number;
    prefix: string;
    processId: string;
  } {
    return {
      activeFiles: this.tempFiles.size,
      totalCreated: this.tempFiles.size, // 简化统计，实际可以添加计数器
      prefix: this.FILE_PREFIX,
      processId: this.PROCESS_ID
    };
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    console.log('[TempFileManager] 销毁临时文件管理器');

    // ✅ 清理所有编辑器管理器实例
    for (const [cardId, manager] of this.editorManagers) {
      console.log(`[TempFileManager] 清理管理器: ${cardId}`);
      manager.destroy();
    }
    this.editorManagers.clear();

    // 清理定时器
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // 清理所有临时文件
    this.tempFiles.clear();
  }
}
