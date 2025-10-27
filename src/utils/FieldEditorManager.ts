/**
 * FieldEditorManager - 字段编辑器管理器
 * 
 * 设计目标：
 * 1. 管理多个字段的编辑状态
 * 2. 协调字段之间的切换逻辑
 * 3. 提供统一的字段操作接口
 * 4. 优化内存使用和性能
 */

import type AnkiPlugin from "../main";

/**
 * 字段状态枚举
 */
export enum FieldState {
  PREVIEW = 'preview',
  EDITING = 'editing',
  TRANSITIONING = 'transitioning'
}

/**
 * 字段配置接口
 */
export interface FieldConfig {
  key: string;
  name: string;
  content: string;
  placeholder?: string;
  required?: boolean;
  minHeight?: number;
  maxHeight?: number;
  readOnly?: boolean;
}

/**
 * 字段状态变更事件
 */
export interface FieldStateChangeEvent {
  fieldKey: string;
  from: FieldState;
  to: FieldState;
  timestamp: number;
}

/**
 * 字段内容变更事件
 */
export interface FieldContentChangeEvent {
  fieldKey: string;
  content: string;
  timestamp: number;
}

/**
 * 字段编辑器管理器
 */
export class FieldEditorManager {
  private plugin: AnkiPlugin;
  private fields: Map<string, FieldConfig> = new Map();
  private fieldStates: Map<string, FieldState> = new Map();
  private fieldContents: Map<string, string> = new Map();
  private activeFieldKey: string | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  
  // 配置选项
  private options = {
    singleActiveEditor: true,    // 是否只允许一个字段处于编辑状态
    autoSave: true,             // 是否自动保存字段内容
    debounceDelay: 300,         // 内容变更防抖延迟
    animationDuration: 200      // 切换动画持续时间
  };

  constructor(plugin: AnkiPlugin, fields: FieldConfig[] = []) {
    this.plugin = plugin;
    this.initializeFields(fields);
  }

  /**
   * 初始化字段
   */
  private initializeFields(fields: FieldConfig[]): void {
    fields.forEach(field => {
      this.fields.set(field.key, field);
      this.fieldStates.set(field.key, FieldState.PREVIEW);
      this.fieldContents.set(field.key, field.content || '');
    });
    
    console.log('FieldEditorManager: 初始化完成', {
      fieldsCount: fields.length,
      fieldKeys: Array.from(this.fields.keys())
    });
  }

  /**
   * 添加字段
   */
  addField(field: FieldConfig): void {
    this.fields.set(field.key, field);
    this.fieldStates.set(field.key, FieldState.PREVIEW);
    this.fieldContents.set(field.key, field.content || '');
    
    this.emit('fieldAdded', { fieldKey: field.key, field });
  }

  /**
   * 移除字段
   */
  removeField(fieldKey: string): void {
    if (this.activeFieldKey === fieldKey) {
      this.activeFieldKey = null;
    }
    
    this.fields.delete(fieldKey);
    this.fieldStates.delete(fieldKey);
    this.fieldContents.delete(fieldKey);
    
    this.emit('fieldRemoved', { fieldKey });
  }

  /**
   * 激活字段编辑
   */
  async activateField(fieldKey: string): Promise<boolean> {
    if (!this.fields.has(fieldKey)) {
      console.warn(`FieldEditorManager: 字段不存在: ${fieldKey}`);
      return false;
    }

    if (this.activeFieldKey === fieldKey) {
      console.log(`FieldEditorManager: 字段已处于活跃状态: ${fieldKey}`);
      return true;
    }

    try {
      // 如果启用单一编辑器模式，先失活当前字段
      if (this.options.singleActiveEditor && this.activeFieldKey) {
        await this.deactivateField(this.activeFieldKey);
      }

      // 设置字段状态为转换中
      this.setFieldState(fieldKey, FieldState.TRANSITIONING);

      // 模拟异步操作（编辑器创建和挂载）
      await new Promise(resolve => setTimeout(resolve, 50));

      // 设置为编辑状态
      this.setFieldState(fieldKey, FieldState.EDITING);
      this.activeFieldKey = fieldKey;

      console.log(`FieldEditorManager: 字段激活成功: ${fieldKey}`);
      
      this.emit('fieldActivated', { fieldKey });
      return true;

    } catch (error) {
      console.error(`FieldEditorManager: 字段激活失败: ${fieldKey}`, error);
      this.setFieldState(fieldKey, FieldState.PREVIEW);
      return false;
    }
  }

  /**
   * 失活字段编辑
   */
  async deactivateField(fieldKey: string): Promise<boolean> {
    if (!this.fields.has(fieldKey)) {
      console.warn(`FieldEditorManager: 字段不存在: ${fieldKey}`);
      return false;
    }

    if (this.getFieldState(fieldKey) !== FieldState.EDITING) {
      return true; // 已经不是编辑状态
    }

    try {
      // 设置字段状态为转换中
      this.setFieldState(fieldKey, FieldState.TRANSITIONING);

      // 模拟异步操作（内容保存和编辑器卸载）
      await new Promise(resolve => setTimeout(resolve, 50));

      // 设置为预览状态
      this.setFieldState(fieldKey, FieldState.PREVIEW);
      
      if (this.activeFieldKey === fieldKey) {
        this.activeFieldKey = null;
      }

      console.log(`FieldEditorManager: 字段失活成功: ${fieldKey}`);
      
      this.emit('fieldDeactivated', { fieldKey });
      return true;

    } catch (error) {
      console.error(`FieldEditorManager: 字段失活失败: ${fieldKey}`, error);
      return false;
    }
  }

  /**
   * 更新字段内容
   */
  updateFieldContent(fieldKey: string, content: string): void {
    if (!this.fields.has(fieldKey)) {
      console.warn(`FieldEditorManager: 字段不存在: ${fieldKey}`);
      return;
    }

    const oldContent = this.fieldContents.get(fieldKey) || '';
    if (oldContent !== content) {
      this.fieldContents.set(fieldKey, content);
      
      // 更新字段配置中的内容
      const field = this.fields.get(fieldKey);
      if (field) {
        field.content = content;
      }

      this.emit('fieldContentChanged', {
        fieldKey,
        content,
        oldContent,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 获取字段内容
   */
  getFieldContent(fieldKey: string): string {
    return this.fieldContents.get(fieldKey) || '';
  }

  /**
   * 获取所有字段内容
   */
  getAllFieldContents(): Record<string, string> {
    const contents: Record<string, string> = {};
    for (const [key, content] of this.fieldContents) {
      contents[key] = content;
    }
    return contents;
  }

  /**
   * 设置字段状态
   */
  private setFieldState(fieldKey: string, state: FieldState): void {
    const oldState = this.fieldStates.get(fieldKey);
    if (oldState !== state) {
      this.fieldStates.set(fieldKey, state);
      
      this.emit('fieldStateChanged', {
        fieldKey,
        from: oldState || FieldState.PREVIEW,
        to: state,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 获取字段状态
   */
  getFieldState(fieldKey: string): FieldState {
    return this.fieldStates.get(fieldKey) || FieldState.PREVIEW;
  }

  /**
   * 获取活跃字段
   */
  getActiveField(): string | null {
    return this.activeFieldKey;
  }

  /**
   * 检查字段是否处于编辑状态
   */
  isFieldEditing(fieldKey: string): boolean {
    return this.getFieldState(fieldKey) === FieldState.EDITING;
  }

  /**
   * 检查字段是否应该显示预览
   */
  shouldShowPreview(fieldKey: string): boolean {
    const state = this.getFieldState(fieldKey);
    return state === FieldState.PREVIEW;
  }

  /**
   * 获取字段配置
   */
  getFieldConfig(fieldKey: string): FieldConfig | null {
    return this.fields.get(fieldKey) || null;
  }

  /**
   * 获取所有字段配置
   */
  getAllFieldConfigs(): FieldConfig[] {
    return Array.from(this.fields.values());
  }

  /**
   * 切换到下一个字段
   */
  async activateNextField(): Promise<boolean> {
    const fieldKeys = Array.from(this.fields.keys());
    if (fieldKeys.length === 0) return false;

    const currentIndex = this.activeFieldKey 
      ? fieldKeys.indexOf(this.activeFieldKey)
      : -1;
    
    const nextIndex = (currentIndex + 1) % fieldKeys.length;
    const nextFieldKey = fieldKeys[nextIndex];
    
    return await this.activateField(nextFieldKey);
  }

  /**
   * 切换到上一个字段
   */
  async activatePreviousField(): Promise<boolean> {
    const fieldKeys = Array.from(this.fields.keys());
    if (fieldKeys.length === 0) return false;

    const currentIndex = this.activeFieldKey 
      ? fieldKeys.indexOf(this.activeFieldKey)
      : 0;
    
    const prevIndex = currentIndex === 0 
      ? fieldKeys.length - 1 
      : currentIndex - 1;
    const prevFieldKey = fieldKeys[prevIndex];
    
    return await this.activateField(prevFieldKey);
  }

  /**
   * 失活所有字段
   */
  async deactivateAllFields(): Promise<void> {
    if (this.activeFieldKey) {
      await this.deactivateField(this.activeFieldKey);
    }
  }

  /**
   * 验证所有字段
   */
  validateAllFields(): { isValid: boolean; errors: Record<string, string[]> } {
    const errors: Record<string, string[]> = {};
    let isValid = true;

    for (const [fieldKey, field] of this.fields) {
      const fieldErrors: string[] = [];
      const content = this.getFieldContent(fieldKey);

      // 检查必填字段
      if (field.required && !content.trim()) {
        fieldErrors.push(`${field.name}是必填字段`);
      }

      if (fieldErrors.length > 0) {
        errors[fieldKey] = fieldErrors;
        isValid = false;
      }
    }

    return { isValid, errors };
  }

  /**
   * 事件监听
   */
  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * 移除事件监听
   */
  off(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, data: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`FieldEditorManager: 事件监听器执行失败: ${event}`, error);
        }
      });
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.fields.clear();
    this.fieldStates.clear();
    this.fieldContents.clear();
    this.listeners.clear();
    this.activeFieldKey = null;
    
    console.log('FieldEditorManager: 资源清理完成');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalFields: this.fields.size,
      activeField: this.activeFieldKey,
      editingFields: Array.from(this.fieldStates.entries())
        .filter(([_, state]) => state === FieldState.EDITING)
        .map(([key, _]) => key),
      fieldStates: Object.fromEntries(this.fieldStates),
      contentLengths: Object.fromEntries(
        Array.from(this.fieldContents.entries())
          .map(([key, content]) => [key, content.length])
      )
    };
  }
}
