/**
 * CodeMirror 编辑器命令系统
 */

import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

/**
 * 编辑器命令接口
 */
export interface EditorCommand {
  execute(view: EditorView, ...args: any[]): Promise<boolean>;
}

/**
 * 命令管理器
 */
export class CommandManager {
  private commands = new Map<string, EditorCommand>();

  constructor(private view: EditorView) {
    this.registerDefaultCommands();
  }

  /**
   * 注册默认命令
   */
  private registerDefaultCommands() {
    // Markdown 格式化命令
    this.register('bold', new BoldCommand());
    this.register('italic', new ItalicCommand());
    this.register('code', new InlineCodeCommand());
    this.register('link', new LinkCommand());
    this.register('heading', new HeadingCommand());
    this.register('list', new ListCommand());
    this.register('quote', new QuoteCommand());
    this.register('strikethrough', new StrikethroughCommand());
    
    // 编辑器操作命令
    this.register('undo', new UndoCommand());
    this.register('redo', new RedoCommand());
    this.register('selectAll', new SelectAllCommand());
  }

  /**
   * 注册命令
   */
  register(name: string, command: EditorCommand): void {
    this.commands.set(name, command);
  }

  /**
   * 执行命令
   */
  async execute(commandName: string, ...args: any[]): Promise<boolean> {
    const command = this.commands.get(commandName);
    if (!command) {
      console.warn(`Command not found: ${commandName}`);
      return false;
    }

    try {
      return await command.execute(this.view, ...args);
    } catch (error) {
      console.error(`Command execution failed: ${commandName}`, error);
      return false;
    }
  }

  /**
   * 获取所有可用命令
   */
  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys());
  }
}

/**
 * 粗体命令
 */
export class BoldCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);
    
    let newText: string;
    let newSelection: { from: number; to: number };
    
    if (selectedText) {
      // 如果已经是粗体，则移除格式
      if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
        newText = selectedText.slice(2, -2);
        newSelection = { from: selection.from, to: selection.from + newText.length };
      } else {
        newText = `**${selectedText}**`;
        newSelection = { from: selection.from, to: selection.from + newText.length };
      }
    } else {
      // 插入粗体占位符
      newText = '**粗体文本**';
      newSelection = { from: selection.from + 2, to: selection.from + 6 };
    }
    
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: newText },
      selection: { anchor: newSelection.from, head: newSelection.to },
    });
    
    return true;
  }
}

/**
 * 斜体命令
 */
export class ItalicCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);
    
    let newText: string;
    let newSelection: { from: number; to: number };
    
    if (selectedText) {
      // 如果已经是斜体，则移除格式
      if (selectedText.startsWith('*') && selectedText.endsWith('*') && !selectedText.startsWith('**')) {
        newText = selectedText.slice(1, -1);
        newSelection = { from: selection.from, to: selection.from + newText.length };
      } else {
        newText = `*${selectedText}*`;
        newSelection = { from: selection.from, to: selection.from + newText.length };
      }
    } else {
      // 插入斜体占位符
      newText = '*斜体文本*';
      newSelection = { from: selection.from + 1, to: selection.from + 5 };
    }
    
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: newText },
      selection: { anchor: newSelection.from, head: newSelection.to },
    });
    
    return true;
  }
}

/**
 * 行内代码命令
 */
export class InlineCodeCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);
    
    let newText: string;
    let newSelection: { from: number; to: number };
    
    if (selectedText) {
      // 如果已经是代码，则移除格式
      if (selectedText.startsWith('`') && selectedText.endsWith('`')) {
        newText = selectedText.slice(1, -1);
        newSelection = { from: selection.from, to: selection.from + newText.length };
      } else {
        newText = `\`${selectedText}\``;
        newSelection = { from: selection.from, to: selection.from + newText.length };
      }
    } else {
      // 插入代码占位符
      newText = '`代码`';
      newSelection = { from: selection.from + 1, to: selection.from + 3 };
    }
    
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: newText },
      selection: { anchor: newSelection.from, head: newSelection.to },
    });
    
    return true;
  }
}

/**
 * 链接命令
 */
export class LinkCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);
    
    let newText: string;
    let newSelection: { from: number; to: number };
    
    if (selectedText) {
      newText = `[${selectedText}](url)`;
      newSelection = { from: selection.from + selectedText.length + 3, to: selection.from + selectedText.length + 6 };
    } else {
      newText = '[链接文本](url)';
      newSelection = { from: selection.from + 1, to: selection.from + 5 };
    }
    
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: newText },
      selection: { anchor: newSelection.from, head: newSelection.to },
    });
    
    return true;
  }
}

/**
 * 标题命令
 */
export class HeadingCommand implements EditorCommand {
  async execute(view: EditorView, level: number = 1): Promise<boolean> {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const lineText = line.text;
    
    // 生成标题前缀
    const headingPrefix = '#'.repeat(Math.max(1, Math.min(6, level))) + ' ';
    
    let newText: string;
    
    // 如果已经是标题，则移除或修改级别
    const headingMatch = lineText.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const currentLevel = headingMatch[1].length;
      if (currentLevel === level) {
        // 移除标题格式
        newText = headingMatch[2];
      } else {
        // 修改标题级别
        newText = headingPrefix + headingMatch[2];
      }
    } else {
      // 添加标题格式
      newText = headingPrefix + lineText;
    }
    
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + newText.length, head: line.from + newText.length },
    });
    
    return true;
  }
}

/**
 * 列表命令
 */
export class ListCommand implements EditorCommand {
  async execute(view: EditorView, ordered: boolean = false): Promise<boolean> {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const lineText = line.text;
    
    const listPrefix = ordered ? '1. ' : '- ';
    
    let newText: string;
    
    // 检查是否已经是列表项
    const listMatch = lineText.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      // 移除列表格式
      newText = listMatch[1] + listMatch[3];
    } else {
      // 添加列表格式
      const indent = lineText.match(/^\s*/)?.[0] || '';
      newText = indent + listPrefix + lineText.trim();
    }
    
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + newText.length, head: line.from + newText.length },
    });
    
    return true;
  }
}

/**
 * 引用命令
 */
export class QuoteCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const lineText = line.text;
    
    let newText: string;
    
    // 检查是否已经是引用
    if (lineText.startsWith('> ')) {
      // 移除引用格式
      newText = lineText.slice(2);
    } else {
      // 添加引用格式
      newText = '> ' + lineText;
    }
    
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + newText.length, head: line.from + newText.length },
    });
    
    return true;
  }
}

/**
 * 删除线命令
 */
export class StrikethroughCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);
    
    let newText: string;
    let newSelection: { from: number; to: number };
    
    if (selectedText) {
      // 如果已经是删除线，则移除格式
      if (selectedText.startsWith('~~') && selectedText.endsWith('~~')) {
        newText = selectedText.slice(2, -2);
        newSelection = { from: selection.from, to: selection.from + newText.length };
      } else {
        newText = `~~${selectedText}~~`;
        newSelection = { from: selection.from, to: selection.from + newText.length };
      }
    } else {
      // 插入删除线占位符
      newText = '~~删除线文本~~';
      newSelection = { from: selection.from + 2, to: selection.from + 7 };
    }
    
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: newText },
      selection: { anchor: newSelection.from, head: newSelection.to },
    });
    
    return true;
  }
}

/**
 * 撤销命令
 */
export class UndoCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const { undo } = await import('@codemirror/commands');
    return undo(view);
  }
}

/**
 * 重做命令
 */
export class RedoCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const { redo } = await import('@codemirror/commands');
    return redo(view);
  }
}

/**
 * 全选命令
 */
export class SelectAllCommand implements EditorCommand {
  async execute(view: EditorView): Promise<boolean> {
    const { selectAll } = await import('@codemirror/commands');
    return selectAll(view);
  }
}
