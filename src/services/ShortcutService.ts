/**
 * 快捷键管理服务
 * 负责注册、注销和执行AI提供商的快捷键
 */

import type AnkiPlugin from '../main';
import type { AIProvider } from '../components/settings/constants/settings-constants';

export interface ShortcutConfig {
  key: string;
  modifiers: string[];
}

export class ShortcutService {
  private plugin: AnkiPlugin;
  private registeredCommands: Map<string, string> = new Map(); // provider -> commandId
  
  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
  }
  
  /**
   * 注册所有AI提供商的快捷键命令
   */
  registerAllShortcuts() {
    const shortcuts = this.plugin.settings.aiConfig?.shortcuts || {};
    const providers: AIProvider[] = ['openai', 'gemini', 'anthropic', 'deepseek', 'zhipu'];
    
    providers.forEach(provider => {
      this.registerShortcut(provider, shortcuts[provider]);
    });
  }
  
  /**
   * 注册单个提供商的快捷键
   */
  registerShortcut(provider: AIProvider, config?: ShortcutConfig) {
    // 先注销已有的命令
    this.unregisterShortcut(provider);
    
    const commandId = `ai-format-with-${provider}`;
    const providerNames: Record<AIProvider, string> = {
      openai: 'OpenAI',
      gemini: 'Gemini',
      anthropic: 'Claude',
      deepseek: 'DeepSeek',
      zhipu: '智谱清言'
    };
    
    // 注册Obsidian命令
    const command = this.plugin.addCommand({
      id: commandId,
      name: `AI格式化 (使用 ${providerNames[provider]})`,
      callback: () => this.executeAIFormat(provider),
      hotkeys: config ? [this.convertToObsidianHotkey(config)] : []
    });
    
    this.registeredCommands.set(provider, commandId);
    
    console.log(`[ShortcutService] 注册快捷键命令: ${commandId}`, config);
  }
  
  /**
   * 注销提供商的快捷键
   */
  unregisterShortcut(provider: AIProvider) {
    const commandId = this.registeredCommands.get(provider);
    if (commandId) {
      // Obsidian没有提供直接注销命令的API
      // 但我们可以清除map中的记录
      this.registeredCommands.delete(provider);
      console.log(`[ShortcutService] 注销快捷键命令: ${commandId}`);
    }
  }
  
  /**
   * 执行AI格式化
   */
  private async executeAIFormat(provider: AIProvider) {
    console.log(`[ShortcutService] 触发AI格式化，使用提供商: ${provider}`);
    
    // 检查API配置
    const apiConfig = this.plugin.settings.aiConfig?.apiKeys?.[provider];
    if (!apiConfig || !apiConfig.apiKey) {
      new (window as any).Notice(`${provider} 的API密钥未配置，请先在设置中配置`);
      return;
    }
    
    // 检查是否在学习模态窗
    const activeLeaf = this.plugin.app.workspace.activeLeaf;
    if (!activeLeaf) {
      new (window as any).Notice('请先打开学习界面');
      return;
    }
    
    // 这里可以添加触发学习界面AI格式化的逻辑
    // 由于需要访问StudyModal的内部状态，可以使用事件系统
    // 暂时显示提示
    new (window as any).Notice(`快捷键触发成功，准备使用 ${provider} 进行格式化`);
    
    // TODO: 实现与StudyModal的通信机制
    // 可以考虑使用自定义事件或状态管理
  }
  
  /**
   * 转换为Obsidian快捷键格式
   */
  private convertToObsidianHotkey(config: ShortcutConfig): { modifiers: string[], key: string } {
    return {
      modifiers: config.modifiers,
      key: config.key
    };
  }
  
  /**
   * 格式化快捷键显示
   */
  static formatShortcut(config: ShortcutConfig | undefined): string {
    if (!config) return '';
    return [...config.modifiers, config.key].join('+');
  }
  
  /**
   * 检查快捷键冲突
   */
  checkConflict(config: ShortcutConfig): { hasConflict: boolean; conflictWith?: string } {
    // 简化版冲突检测
    const commonShortcuts = [
      { key: 'C', modifiers: ['Mod'], name: '复制' },
      { key: 'V', modifiers: ['Mod'], name: '粘贴' },
      { key: 'X', modifiers: ['Mod'], name: '剪切' },
      { key: 'Z', modifiers: ['Mod'], name: '撤销' },
      { key: 'S', modifiers: ['Mod'], name: '保存' },
    ];
    
    const conflict = commonShortcuts.find(
      cs => cs.key === config.key && 
            cs.modifiers.length === config.modifiers.length &&
            cs.modifiers.every(m => config.modifiers.includes(m))
    );
    
    if (conflict) {
      return { hasConflict: true, conflictWith: conflict.name };
    }
    
    return { hasConflict: false };
  }
}

