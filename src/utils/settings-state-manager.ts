/**
 * 统一设置状态管理器
 * 提供集中化的设置状态管理、验证和同步机制
 */

import type AnkiPlugin from '../main';
import type { AnkiPluginSettings } from '../main';

// 设置验证结果
export interface SettingsValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  suggestions: Record<string, string[]>;
}

// 设置变更事件
export interface SettingsChangeEvent {
  key: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
  source: 'user' | 'system' | 'import';
}

// 设置状态
export interface SettingsState {
  current: AnkiPluginSettings;
  pending: Partial<AnkiPluginSettings>;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  validation: SettingsValidationResult;
  lastSaved: number;
  changeHistory: SettingsChangeEvent[];
}

// 设置更新动作
export type SettingsAction = 
  | { type: 'SET_SETTING'; payload: { key: keyof AnkiPluginSettings; value: any; source?: 'user' | 'system' | 'import' } }
  | { type: 'SET_MULTIPLE_SETTINGS'; payload: { settings: Partial<AnkiPluginSettings>; source?: 'user' | 'system' | 'import' } }
  | { type: 'RESET_SETTINGS' }
  | { type: 'LOAD_SETTINGS'; payload: AnkiPluginSettings }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_VALIDATION'; payload: SettingsValidationResult }
  | { type: 'COMMIT_PENDING' }
  | { type: 'DISCARD_PENDING' }
  | { type: 'MARK_SAVED' };

/**
 * 设置验证器
 */
export class SettingsValidator {
  /**
   * 验证完整设置
   */
  static validateSettings(settings: AnkiPluginSettings): SettingsValidationResult {
    const errors: Record<string, string[]> = {};
    const warnings: Record<string, string[]> = {};
    const suggestions: Record<string, string[]> = {};

    // 验证FSRS参数
    const fsrsValidation = this.validateFSRSParams(settings.fsrsParams);
    if (fsrsValidation.errors.length > 0) {
      errors.fsrsParams = fsrsValidation.errors;
    }
    if (fsrsValidation.warnings.length > 0) {
      warnings.fsrsParams = fsrsValidation.warnings;
    }

    // 验证编辑器设置
    const editorValidation = this.validateEditorSettings(settings.editor);
    if (editorValidation.errors.length > 0) {
      errors.editor = editorValidation.errors;
    }

    // 验证激活码设置
    const licenseValidation = this.validateLicenseSettings(settings.license);
    if (licenseValidation.errors.length > 0) {
      errors.license = licenseValidation.errors;
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * 验证FSRS参数
   */
  private static validateFSRSParams(params: AnkiPluginSettings['fsrsParams']) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证权重参数
    if (!Array.isArray(params.w) || params.w.length !== 21) {
      errors.push('FSRS权重参数必须包含21个数值');
    } else {
      params.w.forEach((weight, index) => {
        if (typeof weight !== 'number' || isNaN(weight)) {
          errors.push(`权重参数[${index}]必须是有效数字`);
        }
      });
    }

    // 验证请求保留率
    if (typeof params.requestRetention !== 'number' || 
        params.requestRetention < 0.1 || 
        params.requestRetention > 1.0) {
      errors.push('请求保留率必须在0.1到1.0之间');
    }

    // 验证最大间隔
    if (typeof params.maximumInterval !== 'number' || 
        params.maximumInterval < 1 || 
        params.maximumInterval > 36500) {
      errors.push('最大间隔必须在1到36500天之间');
    }

    // 性能建议
    if (params.maximumInterval > 10000) {
      warnings.push('最大间隔超过10000天可能影响算法精度');
    }

    return { errors, warnings };
  }

  /**
   * 验证编辑器设置
   */
  private static validateEditorSettings(settings: AnkiPluginSettings['editor']) {
    const errors: string[] = [];

    // 验证链接样式
    if (!['wikilink', 'markdown'].includes(settings.linkStyle)) {
      errors.push('链接样式必须是wikilink或markdown');
    }

    // 验证链接路径
    if (!['short', 'relative', 'absolute'].includes(settings.linkPath)) {
      errors.push('链接路径必须是short、relative或absolute');
    }

    // 验证附件目录
    if (!settings.attachmentDir || settings.attachmentDir.trim() === '') {
      errors.push('附件目录不能为空');
    }

    return { errors, warnings: [] };
  }

  /**
   * 验证激活码设置
   */
  private static validateLicenseSettings(settings: AnkiPluginSettings['license']) {
    const errors: string[] = [];

    // 验证激活码格式
    if (settings.isActivated) {
      if (!settings.activationCode || settings.activationCode.trim() === '') {
        errors.push('激活状态下激活码不能为空');
      }

      if (!settings.deviceFingerprint || settings.deviceFingerprint.trim() === '') {
        errors.push('设备指纹不能为空');
      }

      // 验证过期时间
      if (settings.expiresAt) {
        const expiryDate = new Date(settings.expiresAt);
        if (isNaN(expiryDate.getTime())) {
          errors.push('过期时间格式无效');
        } else if (expiryDate < new Date()) {
          errors.push('激活码已过期');
        }
      }
    }

    return { errors, warnings: [] };
  }

  /**
   * 验证单个设置项
   */
  static validateSetting(key: keyof AnkiPluginSettings, value: any): string[] {
    const errors: string[] = [];

    switch (key) {
      case 'defaultDeck':
        if (typeof value !== 'string' || value.trim() === '') {
          errors.push('默认牌组名称不能为空');
        }
        break;

      case 'reviewsPerDay':
        if (typeof value !== 'number' || value < 1 || value > 1000) {
          errors.push('每日复习数量必须在1到1000之间');
        }
        break;

      case 'enableNotifications':
      case 'enableShortcuts':
        if (typeof value !== 'boolean') {
          errors.push('该设置必须是布尔值');
        }
        break;

      case 'theme':
        if (!['auto', 'light', 'dark'].includes(value)) {
          errors.push('主题必须是auto、light或dark');
        }
        break;

      case 'language':
        if (typeof value !== 'string' || value.trim() === '') {
          errors.push('语言设置不能为空');
        }
        break;

      case 'defaultTriadTemplateId':
        // 新系统不使用此设置，但保留验证以防止错误
        console.log('⚠️ defaultTriadTemplateId 设置已被新系统替代');
        break;
    }

    return errors;
  }
}

/**
 * 设置状态管理器
 */
export class SettingsStateManager {
  private plugin: AnkiPlugin;
  private state: SettingsState;
  private listeners: Set<(state: SettingsState) => void> = new Set();
  private autoSaveTimer?: NodeJS.Timeout;
  private readonly autoSaveDelay = 2000; // 2秒自动保存延迟

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.state = this.createInitialState();
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): SettingsState {
    return {
      current: { ...this.plugin.settings },
      pending: {},
      isDirty: false,
      isLoading: false,
      isSaving: false,
      validation: {
        isValid: true,
        errors: {},
        warnings: {},
        suggestions: {}
      },
      lastSaved: Date.now(),
      changeHistory: []
    };
  }

  /**
   * 获取当前状态
   */
  getState(): SettingsState {
    return { ...this.state };
  }

  /**
   * 分发状态更新
   */
  dispatch(action: SettingsAction): void {
    const newState = this.reducer(this.state, action);
    
    if (newState !== this.state) {
      this.state = newState;
      this.notifyListeners();
      
      // 如果有待保存的更改，启动自动保存
      if (this.state.isDirty && !this.state.isSaving) {
        this.scheduleAutoSave();
      }
    }
  }

  /**
   * 状态减速器
   */
  private reducer(state: SettingsState, action: SettingsAction): SettingsState {
    switch (action.type) {
      case 'SET_SETTING':
        const { key, value, source = 'user' } = action.payload;
        const changeEvent: SettingsChangeEvent = {
          key,
          oldValue: state.current[key],
          newValue: value,
          timestamp: Date.now(),
          source
        };

        return {
          ...state,
          pending: { ...state.pending, [key]: value },
          isDirty: true,
          validation: this.validatePendingSettings({ ...state.current, ...state.pending, [key]: value }),
          changeHistory: [changeEvent, ...state.changeHistory.slice(0, 99)] // 保留最近100个变更
        };

      case 'SET_MULTIPLE_SETTINGS':
        const { settings, source: multiSource = 'user' } = action.payload;
        const newPending = { ...state.pending, ...settings };
        const multiChangeEvents: SettingsChangeEvent[] = Object.entries(settings).map(([k, v]) => ({
          key: k,
          oldValue: state.current[k as keyof AnkiPluginSettings],
          newValue: v,
          timestamp: Date.now(),
          source: multiSource
        }));

        return {
          ...state,
          pending: newPending,
          isDirty: true,
          validation: this.validatePendingSettings({ ...state.current, ...newPending }),
          changeHistory: [...multiChangeEvents, ...state.changeHistory.slice(0, 99 - multiChangeEvents.length)]
        };

      case 'LOAD_SETTINGS':
        return {
          ...state,
          current: action.payload,
          pending: {},
          isDirty: false,
          isLoading: false,
          validation: SettingsValidator.validateSettings(action.payload),
          lastSaved: Date.now()
        };

      case 'SET_LOADING':
        return { ...state, isLoading: action.payload };

      case 'SET_SAVING':
        return { ...state, isSaving: action.payload };

      case 'SET_VALIDATION':
        return { ...state, validation: action.payload };

      case 'COMMIT_PENDING':
        const newCurrent = { ...state.current, ...state.pending };
        return {
          ...state,
          current: newCurrent,
          pending: {},
          isDirty: false,
          validation: SettingsValidator.validateSettings(newCurrent)
        };

      case 'DISCARD_PENDING':
        return {
          ...state,
          pending: {},
          isDirty: false,
          validation: SettingsValidator.validateSettings(state.current)
        };

      case 'MARK_SAVED':
        return {
          ...state,
          lastSaved: Date.now(),
          isSaving: false
        };

      case 'RESET_SETTINGS':
        const defaultSettings = this.plugin.getDefaultSettings();
        return {
          ...state,
          current: defaultSettings,
          pending: {},
          isDirty: true,
          validation: SettingsValidator.validateSettings(defaultSettings)
        };

      default:
        return state;
    }
  }

  /**
   * 验证待保存的设置
   */
  private validatePendingSettings(settings: AnkiPluginSettings): SettingsValidationResult {
    return SettingsValidator.validateSettings(settings);
  }

  /**
   * 安排自动保存
   */
  private scheduleAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(async () => {
      if (this.state.isDirty && !this.state.isSaving) {
        await this.saveSettings();
      }
    }, this.autoSaveDelay);
  }

  /**
   * 保存设置
   */
  async saveSettings(): Promise<boolean> {
    if (!this.state.isDirty || this.state.isSaving) {
      return true;
    }

    // 验证待保存的设置
    const pendingSettings = { ...this.state.current, ...this.state.pending };
    const validation = SettingsValidator.validateSettings(pendingSettings);
    
    if (!validation.isValid) {
      this.dispatch({ type: 'SET_VALIDATION', payload: validation });
      return false;
    }

    this.dispatch({ type: 'SET_SAVING', payload: true });

    try {
      // 提交待保存的更改
      this.dispatch({ type: 'COMMIT_PENDING' });
      
      // 保存到插件
      await this.plugin.saveSettings();
      
      this.dispatch({ type: 'MARK_SAVED' });
      return true;
    } catch (error) {
      console.error('[SettingsStateManager] 保存设置失败:', error);
      this.dispatch({ type: 'SET_SAVING', payload: false });
      return false;
    }
  }

  /**
   * 加载设置
   */
  async loadSettings(): Promise<void> {
    this.dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      await this.plugin.loadSettings();
      this.dispatch({ type: 'LOAD_SETTINGS', payload: this.plugin.settings });
    } catch (error) {
      console.error('[SettingsStateManager] 加载设置失败:', error);
      this.dispatch({ type: 'SET_LOADING', payload: false });
    }
  }

  /**
   * 重置设置
   */
  resetSettings(): void {
    this.dispatch({ type: 'RESET_SETTINGS' });
  }

  /**
   * 丢弃待保存的更改
   */
  discardPendingChanges(): void {
    this.dispatch({ type: 'DISCARD_PENDING' });
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: (state: SettingsState) => void): () => void {
    this.listeners.add(listener);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * 销毁状态管理器
   */
  destroy(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.listeners.clear();
  }

  /**
   * 获取设置变更历史
   */
  getChangeHistory(): SettingsChangeEvent[] {
    return [...this.state.changeHistory];
  }

  /**
   * 检查是否有未保存的更改
   */
  hasUnsavedChanges(): boolean {
    return this.state.isDirty;
  }

  /**
   * 获取验证结果
   */
  getValidationResult(): SettingsValidationResult {
    return this.state.validation;
  }
}

// 全局设置状态管理器实例
let globalSettingsManager: SettingsStateManager | null = null;

/**
 * 获取全局设置状态管理器
 */
export function getSettingsStateManager(plugin: AnkiPlugin): SettingsStateManager {
  if (!globalSettingsManager) {
    globalSettingsManager = new SettingsStateManager(plugin);
  }
  return globalSettingsManager;
}
