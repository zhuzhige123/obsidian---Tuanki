/**
 * Obsidian导航服务
 * 实现从Tuanki卡片到Obsidian的跳转导航功能
 */

import { TFile, WorkspaceLeaf } from 'obsidian';
import type AnkiPlugin from '../main';
import type { BlockLinkInfo } from '../utils/obsidian-block-link-generator';
import { showNotification } from '../utils/notifications';

export interface NavigationTarget {
  /** 文件路径 */
  filePath: string;
  /** 块ID（可选） */
  blockId?: string;
  /** 行号（可选） */
  lineNumber?: number;
  /** 列号（可选） */
  columnNumber?: number;
}

export interface NavigationResult {
  /** 导航是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 打开的文件 */
  file?: TFile;
  /** 使用的工作区叶子 */
  leaf?: WorkspaceLeaf;
}

export interface NavigationOptions {
  /** 是否在新标签页中打开 */
  newTab?: boolean;
  /** 是否在侧边栏中打开 */
  inSidebar?: boolean;
  /** 是否聚焦到目标位置 */
  focus?: boolean;
  /** 是否显示通知 */
  showNotification?: boolean;
  /** 导航模式 */
  mode?: 'source' | 'preview' | 'live-preview';
}

export class ObsidianNavigationService {
  private plugin: AnkiPlugin;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
  }

  /**
   * 导航到指定的Obsidian文件位置
   */
  async navigateToFile(
    target: NavigationTarget, 
    options: NavigationOptions = {}
  ): Promise<NavigationResult> {
    try {
      console.log(`🧭 [NavigationService] 导航到文件: ${target.filePath}`);

      // 设置默认选项
      const opts = {
        newTab: false,
        inSidebar: false,
        focus: true,
        showNotification: true,
        mode: 'source' as const,
        ...options
      };

      // 获取文件
      const file = this.plugin.app.vault.getAbstractFileByPath(target.filePath);
      if (!(file instanceof TFile)) {
        const error = `文件不存在: ${target.filePath}`;
        console.error(`❌ [NavigationService] ${error}`);
        
        if (opts.showNotification) {
          showNotification(error, 'error');
        }
        
        return { success: false, error };
      }

      // 获取或创建工作区叶子
      let leaf: WorkspaceLeaf;
      
      if (opts.newTab) {
        leaf = this.plugin.app.workspace.getLeaf('tab');
      } else if (opts.inSidebar) {
        leaf = this.plugin.app.workspace.getRightLeaf(false) || this.plugin.app.workspace.getLeaf('tab');
      } else {
        leaf = this.plugin.app.workspace.getLeaf();
      }

      // 打开文件
      await leaf.openFile(file, { 
        mode: opts.mode,
        focus: opts.focus 
      });

      // 如果有块ID或行号，跳转到指定位置
      if (target.blockId || target.lineNumber) {
        await this.navigateToPosition(leaf, target);
      }

      console.log(`✅ [NavigationService] 导航成功: ${target.filePath}`);
      
      if (opts.showNotification) {
        const fileName = file.name;
        showNotification(`已跳转到: ${fileName}`, 'success');
      }

      return {
        success: true,
        file,
        leaf
      };

    } catch (error) {
      const errorMsg = `导航失败: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ [NavigationService] ${errorMsg}`, error);
      
      if (options.showNotification !== false) {
        showNotification(errorMsg, 'error');
      }
      
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * 通过块链接导航
   */
  async navigateToBlockLink(
    blockInfo: BlockLinkInfo, 
    filePath: string,
    options: NavigationOptions = {}
  ): Promise<NavigationResult> {
    const target: NavigationTarget = {
      filePath,
      blockId: blockInfo.blockId,
      lineNumber: blockInfo.lineNumber
    };

    return this.navigateToFile(target, options);
  }

  /**
   * 通过URI链接导航
   */
  async navigateToURI(uri: string): Promise<NavigationResult> {
    try {
      console.log(`🔗 [NavigationService] 通过URI导航: ${uri}`);

      // 解析URI
      const parsedUri = this.parseObsidianURI(uri);
      if (!parsedUri) {
        const error = `无效的Obsidian URI: ${uri}`;
        console.error(`❌ [NavigationService] ${error}`);
        return { success: false, error };
      }

      // 使用解析的信息导航
      return this.navigateToFile(parsedUri, { showNotification: true });

    } catch (error) {
      const errorMsg = `URI导航失败: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ [NavigationService] ${errorMsg}`, error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 导航到指定位置（块ID或行号）
   */
  private async navigateToPosition(leaf: WorkspaceLeaf, target: NavigationTarget): Promise<void> {
    try {
      // 等待编辑器加载
      await new Promise(resolve => setTimeout(resolve, 100));

      const view = leaf.view;
      if (!view || view.getViewType() !== 'markdown') {
        console.warn(`⚠️ [NavigationService] 不是Markdown视图，无法定位到具体位置`);
        return;
      }

      // 获取编辑器
      const editor = (view as any).editor;
      if (!editor) {
        console.warn(`⚠️ [NavigationService] 无法获取编辑器实例`);
        return;
      }

      let targetLine = 0;

      // 如果有块ID，查找块ID所在行
      if (target.blockId) {
        const content = editor.getValue();
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(`^${target.blockId}`)) {
            targetLine = i;
            break;
          }
        }
        
        console.log(`🎯 [NavigationService] 找到块ID ^${target.blockId} 在第 ${targetLine + 1} 行`);
      } 
      // 否则使用行号
      else if (target.lineNumber) {
        targetLine = Math.max(0, target.lineNumber - 1); // 转换为0基索引
        console.log(`🎯 [NavigationService] 导航到第 ${target.lineNumber} 行`);
      }

      // 设置光标位置
      const column = target.columnNumber || 0;
      editor.setCursor({ line: targetLine, ch: column });

      // 轻量高亮：选中目标行并在短时间后还原，模拟“闪烁”提示
      try {
        const lineText: string = editor.getLine(targetLine) ?? '';
        editor.setSelection({ line: targetLine, ch: 0 }, { line: targetLine, ch: Math.max(0, lineText.length) });
        setTimeout(() => {
          try {
            editor.setCursor({ line: targetLine, ch: column });
          } catch {}
        }, 800);
      } catch {}

      // 滚动到目标位置
      editor.scrollIntoView({ line: targetLine, ch: column }, true);

      console.log(`✅ [NavigationService] 已定位到 行:${targetLine + 1} 列:${column + 1}`);

    } catch (error) {
      console.error(`❌ [NavigationService] 定位到具体位置失败:`, error);
    }
  }

  /**
   * 解析Obsidian URI
   */
  private parseObsidianURI(uri: string): NavigationTarget | null {
    try {
      const url = new URL(uri);
      
      if (url.protocol !== 'obsidian:' || url.pathname !== '//open') {
        return null;
      }

      const params = url.searchParams;
      const filePath = params.get('file');
      const blockId = params.get('block');
      const line = params.get('line');

      if (!filePath) {
        return null;
      }

      const target: NavigationTarget = {
        filePath: decodeURIComponent(filePath)
      };

      if (blockId) {
        target.blockId = blockId;
      }

      if (line) {
        const lineNumber = parseInt(line, 10);
        if (!isNaN(lineNumber)) {
          target.lineNumber = lineNumber;
        }
      }

      return target;

    } catch (error) {
      console.error(`❌ [NavigationService] 解析URI失败:`, error);
      return null;
    }
  }

  /**
   * 创建导航按钮组件
   */
  createNavigationButton(
    target: NavigationTarget,
    options: NavigationOptions & { text?: string; icon?: string } = {}
  ): HTMLElement {
    const button = document.createElement('button');
    button.className = 'tuanki-nav-button';
    
    // 设置按钮内容
    const text = options.text || '跳转到Obsidian';
    const icon = options.icon || '🔗';
    
    button.innerHTML = `
      <span class="nav-icon">${icon}</span>
      <span class="nav-text">${text}</span>
    `;

    // 添加点击事件
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const result = await this.navigateToFile(target, options);
      
      if (!result.success) {
        console.error('导航失败:', result.error);
      }
    });

    // 添加样式
    button.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;
    `;

    // 添加悬停效果
    button.addEventListener('mouseenter', () => {
      button.style.background = 'var(--interactive-accent-hover)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = 'var(--interactive-accent)';
    });

    return button;
  }

  /**
   * 批量导航测试
   */
  async testNavigationTargets(targets: NavigationTarget[]): Promise<{
    successful: number;
    failed: number;
    results: NavigationResult[];
  }> {
    console.log(`🧪 [NavigationService] 开始批量导航测试: ${targets.length} 个目标`);

    const results: NavigationResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const target of targets) {
      try {
        const result = await this.navigateToFile(target, { 
          showNotification: false,
          focus: false 
        });
        
        results.push(result);
        
        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // 添加小延迟
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        const errorResult: NavigationResult = {
          success: false,
          error: `测试失败: ${error instanceof Error ? error.message : String(error)}`
        };
        results.push(errorResult);
        failed++;
      }
    }

    console.log(`✅ [NavigationService] 批量测试完成: ${successful} 成功, ${failed} 失败`);

    return {
      successful,
      failed,
      results
    };
  }

  /**
   * 获取当前活动文件信息
   */
  getCurrentFileInfo(): {
    file: TFile | null;
    filePath: string | null;
    cursor: { line: number; ch: number } | null;
  } {
    const activeLeaf = this.plugin.app.workspace.activeLeaf;
    const view = activeLeaf?.view;
    
    if (!view || view.getViewType() !== 'markdown') {
      return { file: null, filePath: null, cursor: null };
    }

    const file = (view as any).file as TFile;
    const editor = (view as any).editor;
    const cursor = editor ? editor.getCursor() : null;

    return {
      file,
      filePath: file?.path || null,
      cursor
    };
  }

  /**
   * 检查文件是否可以导航
   */
  async canNavigateToFile(filePath: string): Promise<boolean> {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      return file instanceof TFile;
    } catch (error) {
      return false;
    }
  }
}
