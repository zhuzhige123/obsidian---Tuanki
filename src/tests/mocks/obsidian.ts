import { logger } from '../../utils/logger';
/**
 * Obsidian API Mock for Testing
 * 涓烘祴璇曠幆澧冩彁渚?Obsidian API 鐨勬ā鎷熷疄鐜?
 */

import { vi } from 'vitest';

// Mock TFile class
export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat: { ctime: number; mtime: number; size: number };

  constructor(path = 'test.md') {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.replace(/\.[^/.]+$/, '');
    this.extension = this.name.includes('.') ? this.name.split('.').pop() || '' : '';
    this.stat = {
      ctime: Date.now(),
      mtime: Date.now(),
      size: 1024
    };
  }
}

// Mock TFolder class
export class TFolder {
  path: string;
  name: string;
  children: (TFile | TFolder)[];

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.children = [];
  }
}

// Mock Vault class
export class Vault {
  getAbstractFileByPath = vi.fn();
  getMarkdownFiles = vi.fn();
  read = vi.fn();
  modify = vi.fn();
  create = vi.fn();
  delete = vi.fn();
  rename = vi.fn();
  on = vi.fn();
  off = vi.fn();
  trigger = vi.fn();

  constructor() {
    this.getAbstractFileByPath.mockImplementation((path: string) => {
      if (path.endsWith('.md')) {
        return new TFile(path);
      }
      return null;
    });

    this.getMarkdownFiles.mockReturnValue([
      new TFile('test1.md'),
      new TFile('test2.md')
    ]);

    this.read.mockResolvedValue('# Test Content\n\nSome content here.');
    this.modify.mockResolvedValue(undefined);
    this.create.mockResolvedValue(new TFile('new-file.md'));
    this.delete.mockResolvedValue(undefined);
    this.rename.mockResolvedValue(undefined);
  }
}

// Mock App class
export class App {
  vault: Vault;
  workspace: any;
  metadataCache: any;

  constructor() {
    this.vault = new Vault();
    this.workspace = {
      getActiveFile: vi.fn(),
      getLeaf: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };
    this.metadataCache = {
      getFileCache: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };
  }
}

// Mock Plugin class
export class Plugin {
  app: App;
  manifest: any;
  settings: any;

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
    this.settings = {};
  }

  loadData = vi.fn();
  saveData = vi.fn();
  addCommand = vi.fn();
  addRibbonIcon = vi.fn();
  addStatusBarItem = vi.fn();
  addSettingTab = vi.fn();
  registerView = vi.fn();
  registerExtensions = vi.fn();
  registerMarkdownCodeBlockProcessor = vi.fn();
  registerMarkdownPostProcessor = vi.fn();
  registerDomEvent = vi.fn();
  registerInterval = vi.fn();
  onload = vi.fn();
  onunload = vi.fn();
}

// Mock Notice class
export class Notice {
  message: string;
  timeout: number;

  constructor(message: string, timeout?: number) {
    this.message = message;
    this.timeout = timeout || 5000;
    logger.debug(`Notice: ${message}`);
  }

  hide = vi.fn();
}

// Mock Modal class
export class Modal {
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  titleEl: HTMLElement;

  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.titleEl = document.createElement('div');
  }

  open = vi.fn();
  close = vi.fn();
  onOpen = vi.fn();
  onClose = vi.fn();
}

// Mock Setting class
export class Setting {
  settingEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    containerEl.appendChild(this.settingEl);
  }

  setName = vi.fn().mockReturnThis();
  setDesc = vi.fn().mockReturnThis();
  addText = vi.fn().mockReturnThis();
  addTextArea = vi.fn().mockReturnThis();
  addToggle = vi.fn().mockReturnThis();
  addDropdown = vi.fn().mockReturnThis();
  addButton = vi.fn().mockReturnThis();
  addSlider = vi.fn().mockReturnThis();
  setClass = vi.fn().mockReturnThis();
  setTooltip = vi.fn().mockReturnThis();
  setDisabled = vi.fn().mockReturnThis();
}

// Mock PluginSettingTab class
export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display = vi.fn();
  hide = vi.fn();
}

// Mock FileSystemAdapter class
export class FileSystemAdapter {
  getName = vi.fn().mockReturnValue('file-system');
  exists = vi.fn().mockResolvedValue(true);
  stat = vi.fn().mockResolvedValue({
    type: 'file',
    ctime: Date.now(),
    mtime: Date.now(),
    size: 1024
  });
  list = vi.fn().mockResolvedValue({
    files: ['file1.md', 'file2.md'],
    folders: ['folder1', 'folder2']
  });
  read = vi.fn().mockResolvedValue('file content');
  readBinary = vi.fn().mockResolvedValue(new ArrayBuffer(0));
  write = vi.fn().mockResolvedValue(undefined);
  writeBinary = vi.fn().mockResolvedValue(undefined);
  append = vi.fn().mockResolvedValue(undefined);
  process = vi.fn().mockResolvedValue('processed content');
  getResourcePath = vi.fn().mockReturnValue('/path/to/resource');
  mkdir = vi.fn().mockResolvedValue(undefined);
  trashSystem = vi.fn().mockResolvedValue(true);
  trashLocal = vi.fn().mockResolvedValue(undefined);
  rmdir = vi.fn().mockResolvedValue(undefined);
  remove = vi.fn().mockResolvedValue(undefined);
  rename = vi.fn().mockResolvedValue(undefined);
  copy = vi.fn().mockResolvedValue(undefined);
}

// Mock Component class
export class Component {
  _loaded = false;

  load = vi.fn(() => {
    this._loaded = true;
    this.onload();
  });

  unload = vi.fn(() => {
    this._loaded = false;
    this.onunload();
  });

  onload = vi.fn();
  onunload = vi.fn();
  addChild = vi.fn();
  removeChild = vi.fn();
  register = vi.fn();
  registerEvent = vi.fn();
  registerDomEvent = vi.fn();
  registerInterval = vi.fn();
}

export class ItemView extends Component {
  leaf: WorkspaceLeaf;
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.app = new App();
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.containerEl.appendChild(this.contentEl);
  }

  getViewType(): string {
    return 'mock-item-view';
  }

  getDisplayText(): string {
    return 'Mock Item View';
  }

  getIcon(): string {
    return 'file';
  }

  onPaneMenu = vi.fn();
  setState = vi.fn(async () => undefined);
  getState = vi.fn(() => ({}));
  allowNoFile = vi.fn(() => false);
  addAction = vi.fn((_icon: string, _label: string, _callback: (...args: any[]) => void) => {
    const button = document.createElement('button') as HTMLButtonElement & {
      setCssProps?: (styles: Record<string, string>) => void;
      toggleClass?: (className: string, force?: boolean) => void;
    };
    button.setCssProps = (styles: Record<string, string>) => {
      for (const [key, value] of Object.entries(styles)) {
        button.style.setProperty(key, value);
      }
    };
    button.toggleClass = (className: string, force?: boolean) => {
      if (typeof force === 'boolean') {
        button.classList.toggle(className, force);
        return;
      }
      button.classList.toggle(className);
    };
    return button;
  });
}

export class MarkdownView extends ItemView {
  editor: Record<string, unknown>;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.editor = {};
  }

  getViewType(): string {
    return 'markdown';
  }
}

export const abstractInputSuggestInstances: AbstractInputSuggest<any>[] = [];

export class AbstractInputSuggest<T> {
  app: App;
  inputEl: HTMLInputElement | HTMLDivElement;
  limit = 100;
  closed = false;

  constructor(app: App, textInputEl: HTMLInputElement | HTMLDivElement) {
    this.app = app;
    this.inputEl = textInputEl;
    abstractInputSuggestInstances.push(this as AbstractInputSuggest<any>);
  }

  setValue(value: string): void {
    if ('value' in this.inputEl) {
      (this.inputEl as HTMLInputElement).value = value;
      return;
    }

    this.inputEl.textContent = value;
  }

  getValue(): string {
    if ('value' in this.inputEl) {
      return (this.inputEl as HTMLInputElement).value;
    }

    return this.inputEl.textContent ?? '';
  }

  selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {
    // noop for tests
  }

  onSelect(_callback: (value: T, evt: MouseEvent | KeyboardEvent) => any): this {
    return this;
  }

  close(): void {
    this.closed = true;
  }
}

// Mock MenuItem class
export class MenuItem {
  private _title = '';
  private _icon = '';
  private _checked = false;
  private _disabled = false;
  private _onClick: (() => void) | null = null;
  private _submenu: Menu | null = null;

  setTitle(title: string): this {
    this._title = title;
    return this;
  }

  setIcon(icon: string): this {
    this._icon = icon;
    return this;
  }

  setChecked(checked: boolean): this {
    this._checked = checked;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this._disabled = disabled;
    return this;
  }

  onClick(callback: () => void): this {
    this._onClick = callback;
    return this;
  }

  setSubmenu(): Menu {
    if (!this._submenu) {
      this._submenu = new Menu();
    }

    return this._submenu;
  }

  // Test helpers
  getTitle(): string {
    return this._title;
  }

  getIcon(): string {
    return this._icon;
  }

  isChecked(): boolean {
    return this._checked;
  }

  isDisabled(): boolean {
    return this._disabled;
  }

  getSubmenu(): Menu | null {
    return this._submenu;
  }

  trigger(): void {
    if (this._disabled) return;
    if (this._onClick) {
      this._onClick();
    }
  }
}

// Mock Menu class
export class Menu {
  private items: MenuItem[] = [];
  private separatorCount = 0;
  private hideCallbacks: Array<() => void> = [];
  private hidden = false;

  addItem(callback: (item: MenuItem) => void): this {
    const item = new MenuItem();
    callback(item);
    this.items.push(item);
    return this;
  }

  addSeparator(): this {
    this.separatorCount++;
    return this;
  }

  showAtMouseEvent(evt: MouseEvent): void {
    // Mock implementation - does nothing in tests
    this.hidden = false;
  }

  showAtPosition(pos: { x: number; y: number }): void {
    // Mock implementation - does nothing in tests
    this.hidden = false;
  }

  hide(): this {
    if (this.hidden) {
      return this;
    }

    this.hidden = true;
    this.hideCallbacks.forEach((callback) => callback());
    return this;
  }

  close(): void {
    this.hide();
  }

  onHide(callback: () => void): void {
    this.hideCallbacks.push(callback);
  }

  // Test helpers
  getItems(): MenuItem[] {
    return this.items;
  }

  getSeparatorCount(): number {
    return this.separatorCount;
  }

  findItemByTitle(title: string): MenuItem | undefined {
    return this.items.find(item => item.getTitle() === title);
  }
}

// Mock WorkspaceLeaf class
export class WorkspaceLeaf {
  view: any;
  parent: any;

  constructor() {
    this.view = null;
    this.parent = null;
  }

  openFile = vi.fn();
  setViewState = vi.fn();
  getViewState = vi.fn();
  detach = vi.fn();
}

// Mock utility functions
export const normalizePath = vi.fn((path: string) => path.replace(/\\/g, '/'));
export const moment = vi.fn(() => ({
  format: vi.fn().mockReturnValue('2025-01-02'),
  valueOf: vi.fn().mockReturnValue(Date.now()),
  isValid: vi.fn().mockReturnValue(true)
}));

export const debounce = vi.fn((fn: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(null, args), delay);
  };
});

export const sanitizeHTMLToDom = vi.fn((html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
});

export const setIcon = vi.fn((element: HTMLElement, iconName: string) => {
  element.setAttribute('data-icon', iconName);
});

export const requestUrl = vi.fn();

// Mock constants
export const Platform = {
  isMobile: false,
  isDesktop: true,
  isWin: process.platform === 'win32',
  isMacOS: process.platform === 'darwin',
  isLinux: process.platform === 'linux'
};

// Export default mock app instance
export const mockApp = new App();

// Default export for compatibility
export default {
  TFile,
  TFolder,
  Vault,
  App,
  Plugin,
  Notice,
  Modal,
  ItemView,
  MarkdownView,
  Setting,
  PluginSettingTab,
  FileSystemAdapter,
  Component,
  AbstractInputSuggest,
  Menu,
  MenuItem,
  WorkspaceLeaf,
  normalizePath,
  moment,
  debounce,
  sanitizeHTMLToDom,
  setIcon,
  requestUrl,
  Platform,
  mockApp,
  abstractInputSuggestInstances
};
