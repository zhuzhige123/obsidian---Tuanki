/**
 * Obsidian API类型扩展
 * 
 * 为Obsidian API提供完整的TypeScript类型定义
 * 解决常见的类型不安全问题
 * 
 * @module types/obsidian-extensions
 */

import { Notice, MarkdownView, Editor, TFile, Workspace, Menu } from 'obsidian';

// ============================================================================
// 全局Window扩展
// ============================================================================

declare global {
  interface Window {
    /**
     * Obsidian通知类
     * 用于显示用户通知消息
     */
    Notice: typeof Notice;
  }
}

// ============================================================================
// Obsidian模块扩展
// ============================================================================

declare module 'obsidian' {
  interface Workspace {
    /**
     * 获取指定类型的活动视图
     * 
     * @param type 视图类型
     * @returns 匹配的视图或null
     */
    getActiveViewOfType(type: 'markdown'): MarkdownView | null;
    getActiveViewOfType<T>(type: string): T | null;
  }

  /**
   * MarkdownView扩展
   * 确保editor属性的类型定义
   */
  interface MarkdownView {
    /**
     * Markdown编辑器实例
     */
    editor: Editor;
    
    /**
     * 获取视图状态
     */
    getState(): any;
    
    /**
     * 设置视图状态
     */
    setState(state: any, result: any): Promise<void>;
  }

  /**
   * Editor扩展
   * 注意：大部分Editor方法已在Obsidian API中定义，这里仅作类型引用
   * 避免重复声明导致重载签名冲突
   */
  // interface Editor {
  //   // Editor的标准方法已在obsidian模块中定义
  //   // 如需添加自定义方法，请在此处声明
  // }

  /**
   * EditorPosition类型定义
   */
  interface EditorPosition {
    line: number;
    ch: number;
  }

  /**
   * App扩展
   * 添加常用的应用级方法
   */
  interface App {
    /**
     * 打开文件
     */
    openFile(file: TFile, openState?: any): Promise<void>;
  }

  /**
   * Vault扩展
   * 文件系统操作的类型定义
   */
  interface Vault {
    /**
     * 读取文件内容
     */
    read(file: TFile): Promise<string>;
    
    /**
     * 写入文件内容
     */
    modify(file: TFile, data: string): Promise<void>;
    
    /**
     * 创建新文件
     */
    create(path: string, data: string): Promise<TFile>;
    
    /**
     * 删除文件
     */
    delete(file: TFile): Promise<void>;
    
    /**
     * 重命名文件
     */
    rename(file: TFile, newPath: string): Promise<void>;
    
    /**
     * 获取所有Markdown文件
     */
    getMarkdownFiles(): TFile[];
    
    /**
     * 根据路径获取文件
     */
    getAbstractFileByPath(path: string): TFile | null;
  }

  /**
   * MetadataCache扩展
   */
  interface MetadataCache {
    /**
     * 获取文件的元数据
     */
    getFileCache(file: TFile): CachedMetadata | null;
    
    /**
     * 获取文件的首个链接路径
     */
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
  }

  /**
   * CachedMetadata扩展
   */
  interface CachedMetadata {
    /**
     * 文件中的链接
     */
    links?: LinkCache[];
    
    /**
     * 文件中的嵌入
     */
    embeds?: EmbedCache[];
    
    /**
     * 文件中的标签
     */
    tags?: TagCache[];
    
    /**
     * 文件的前置元数据
     */
    frontmatter?: Record<string, any>;
  }
}

// ============================================================================
// Obsidian事件类型
// ============================================================================

/**
 * 键盘事件扩展
 */
export interface ObsidianKeyboardEvent extends KeyboardEvent {
  /**
   * 是否是修饰键
   */
  isModifier: boolean;
}

/**
 * 文件菜单事件
 */
export interface FileMenuEvent {
  file: TFile;
  menu: Menu;
}

// ============================================================================
// 导出全局类型
// ============================================================================

export {};
