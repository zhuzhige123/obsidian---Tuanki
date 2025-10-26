/**
 * Obsidian API Mock for Testing
 * 为测试环境提供 Obsidian API 的模拟实现
 */

import { vi } from 'vitest';

// Mock TFile class
export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat: { ctime: number; mtime: number; size: number };

  constructor(path: string = 'test.md') {
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
    console.log(`Notice: ${message}`);
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
  Setting,
  PluginSettingTab,
  FileSystemAdapter,
  Component,
  WorkspaceLeaf,
  normalizePath,
  moment,
  debounce,
  sanitizeHTMLToDom,
  setIcon,
  Platform,
  mockApp
};
