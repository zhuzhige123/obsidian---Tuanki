/**
 * 模板管理状态存储
 * 提供统一的模板加载、缓存和状态管理
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { FieldTemplate } from '../data/template-types';
import type AnkiPlugin from '../main';

// 模板加载状态
export enum TemplateLoadState {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error'
}

// 模板类型 - 统一使用FieldTemplate
export enum TemplateType {
  FIELD = 'field'
}

// 模板状态接口 - 统一使用FieldTemplate
export interface TemplateState {
  // 加载状态
  loadState: TemplateLoadState;
  lastLoaded: Date | null;
  error: string | null;

  // 模板数据 - 统一使用FieldTemplate
  fieldTemplates: FieldTemplate[];

  // 当前应用的模板
  appliedFieldTemplate: FieldTemplate | null;

  // 缓存和性能
  templateCache: Map<string, FieldTemplate>;
  loadingPromises: Map<string, Promise<any>>;

  // 统计信息
  stats: {
    totalFieldTemplates: number;
    cacheHits: number;
    cacheMisses: number;
  };
}

// 模板动作类型 - 统一使用FieldTemplate
export enum TemplateActionType {
  LOAD_START = 'load_start',
  LOAD_SUCCESS = 'load_success',
  LOAD_ERROR = 'load_error',
  APPLY_FIELD_TEMPLATE = 'apply_field_template',
  CLEAR_APPLIED = 'clear_applied',
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
  RESET = 'reset'
}

// 模板动作接口
export interface TemplateAction {
  type: TemplateActionType;
  payload?: any;
  meta?: {
    timestamp: Date;
    source: string;
  };
}

// 初始状态 - 统一使用FieldTemplate
const createInitialState = (): TemplateState => ({
  loadState: TemplateLoadState.IDLE,
  lastLoaded: null,
  error: null,
  fieldTemplates: [],
  appliedFieldTemplate: null,
  templateCache: new Map(),
  loadingPromises: new Map(),
  stats: {
    totalFieldTemplates: 0,
    cacheHits: 0,
    cacheMisses: 0
  }
});

/**
 * 模板状态管理器
 */
export class TemplateStore {
  private _state: Writable<TemplateState>;
  public readonly state: Readable<TemplateState>;
  
  // 派生状态
  public readonly isLoading: Readable<boolean>;
  public readonly hasError: Readable<boolean>;
  public readonly hasTemplates: Readable<boolean>;
  public readonly appliedTemplate: Readable<FieldTemplate | TriadTemplate | null>;

  constructor() {
    this._state = writable(createInitialState());
    this.state = { subscribe: this._state.subscribe };
    
    // 设置派生状态
    this.isLoading = derived(this.state, $state => 
      $state.loadState === TemplateLoadState.LOADING
    );
    
    this.hasError = derived(this.state, $state => 
      $state.loadState === TemplateLoadState.ERROR || !!$state.error
    );
    
    this.hasTemplates = derived(this.state, $state => 
      $state.fieldTemplates.length > 0 || $state.triadTemplates.length > 0
    );
    
    this.appliedTemplate = derived(this.state, $state => 
      $state.appliedTriadTemplate || $state.appliedFieldTemplate
    );
  }

  /**
   * 分发动作
   */
  dispatch(action: TemplateAction): void {
    if (!action.meta) {
      action.meta = {
        timestamp: new Date(),
        source: 'TemplateStore'
      };
    }

    this._state.update(state => this.reducer(state, action));
  }

  /**
   * 状态缩减器
   */
  private reducer(state: TemplateState, action: TemplateAction): TemplateState {
    switch (action.type) {
      case TemplateActionType.LOAD_START:
        return {
          ...state,
          loadState: TemplateLoadState.LOADING,
          error: null
        };

      case TemplateActionType.LOAD_SUCCESS:
        const { fieldTemplates, triadTemplates } = action.payload;
        return {
          ...state,
          loadState: TemplateLoadState.LOADED,
          lastLoaded: new Date(),
          error: null,
          fieldTemplates: fieldTemplates || state.fieldTemplates,
          triadTemplates: triadTemplates || state.triadTemplates,
          stats: {
            ...state.stats,
            totalFieldTemplates: fieldTemplates?.length || state.stats.totalFieldTemplates,
            totalTriadTemplates: triadTemplates?.length || state.stats.totalTriadTemplates
          }
        };

      case TemplateActionType.LOAD_ERROR:
        return {
          ...state,
          loadState: TemplateLoadState.ERROR,
          error: action.payload.error
        };

      case TemplateActionType.APPLY_FIELD_TEMPLATE:
        return {
          ...state,
          appliedFieldTemplate: action.payload.template,
          appliedTriadTemplate: null // 清除三位一体模板
        };

      case TemplateActionType.APPLY_TRIAD_TEMPLATE:
        return {
          ...state,
          appliedTriadTemplate: action.payload.template,
          appliedFieldTemplate: action.payload.template.fieldTemplate // 同步字段模板
        };

      case TemplateActionType.CLEAR_APPLIED:
        return {
          ...state,
          appliedFieldTemplate: null,
          appliedTriadTemplate: null
        };

      case TemplateActionType.CACHE_HIT:
        return {
          ...state,
          stats: {
            ...state.stats,
            cacheHits: state.stats.cacheHits + 1
          }
        };

      case TemplateActionType.CACHE_MISS:
        return {
          ...state,
          stats: {
            ...state.stats,
            cacheMisses: state.stats.cacheMisses + 1
          }
        };

      case TemplateActionType.RESET:
        return createInitialState();

      default:
        return state;
    }
  }

  /**
   * 加载所有模板
   */
  async loadTemplates(plugin: AnkiPlugin, forceReload: boolean = false): Promise<void> {
    this.dispatch({ type: TemplateActionType.LOAD_START });

    try {
      console.log('[TemplateStore] 从SimplifiedParsingSettings加载模板', forceReload ? '(强制刷新)' : '');

      // 🔥 从SimplifiedParsingSettings获取模板
      const settings = plugin.settings?.simplifiedParsing;
      let fieldTemplates: FieldTemplate[] = [];
      let triadTemplates: TriadTemplate[] = [];

      if (settings?.templates && Array.isArray(settings.templates)) {
        // 将ParseTemplate转换为TriadTemplate格式
        triadTemplates = settings.templates.map((template, index) => this.convertToTriadTemplate(template, index));
        console.log(`[TemplateStore] 成功加载 ${triadTemplates.length} 个模板`);

        // 🔥 添加官方模板到列表中
        const officialTemplates = this.getDefaultTriadTemplates();
        triadTemplates = [...officialTemplates, ...triadTemplates];
        console.log(`[TemplateStore] 总共加载 ${triadTemplates.length} 个模板（包含官方模板）`);
      } else {
        console.log('[TemplateStore] 未找到SimplifiedParsingSettings模板，使用默认模板');
        // 提供默认模板
        triadTemplates = this.getDefaultTriadTemplates();
      }

      // 🔥 新增：将 TriadTemplate 转换为 FieldTemplate 以供 InlineCardEditor 使用
      fieldTemplates = triadTemplates.map(triad => ({
        id: triad.id,
        name: triad.name,
        fields: [], // TriadTemplate 没有 fields 数组，使用空数组
        frontTemplate: triad.renderingRules?.frontTemplate || '',
        backTemplate: triad.renderingRules?.backTemplate || '',
        description: triad.description,
        isOfficial: triad.metadata?.tags?.includes('official') || false
      }));
      console.log(`[TemplateStore] 转换为FieldTemplate: ${fieldTemplates.length} 个模板`);

      // 🔥 如果是强制刷新，清除缓存
      if (forceReload) {
        const currentState = this.getCurrentState();
        currentState.templateCache.clear();
        console.log('[TemplateStore] 已清除模板缓存');
      }

      this.dispatch({
        type: TemplateActionType.LOAD_SUCCESS,
        payload: { fieldTemplates, triadTemplates }
      });

    } catch (error) {
      console.error('[TemplateStore] Failed to load templates:', error);

      this.dispatch({
        type: TemplateActionType.LOAD_ERROR,
        payload: { error: (error as Error).message }
      });

      // 尝试加载官方模板作为后备
      await this.loadFallbackTemplates();
    }
  }

  /**
   * 加载后备模板
   */
  private async loadFallbackTemplates(): Promise<void> {
    try {
      // 使用新的模板系统，从设置中获取默认模板
      const triadTemplates: TriadTemplate[] = this.getDefaultTriadTemplates();
      
      // 🔥 转换为 FieldTemplate
      const fieldTemplates: FieldTemplate[] = triadTemplates.map(triad => ({
        id: triad.id,
        name: triad.name,
        fields: [],
        frontTemplate: triad.renderingRules?.frontTemplate || '',
        backTemplate: triad.renderingRules?.backTemplate || '',
        description: triad.description,
        isOfficial: triad.metadata?.tags?.includes('official') || false
      }));

      console.log('[TemplateStore] 使用新模板系统加载默认模板:', {
        fieldTemplates: fieldTemplates.length,
        triadTemplates: triadTemplates.length
      });

      this.dispatch({
        type: TemplateActionType.LOAD_SUCCESS,
        payload: { fieldTemplates, triadTemplates }
      });
    } catch (fallbackError) {
      console.error('[TemplateStore] Failed to load fallback templates:', fallbackError);
    }
  }

  /**
   * 应用字段模板
   */
  applyFieldTemplate(template: FieldTemplate): void {
    console.log('[TemplateStore] Applying field template:', template.name);
    
    this.dispatch({
      type: TemplateActionType.APPLY_FIELD_TEMPLATE,
      payload: { template }
    });
  }

  /**
   * 应用三位一体模板
   */
  applyTriadTemplate(template: TriadTemplate): void {
    console.log('[TemplateStore] Applying triad template:', template.name);
    
    this.dispatch({
      type: TemplateActionType.APPLY_TRIAD_TEMPLATE,
      payload: { template }
    });
  }

  /**
   * 清除应用的模板
   */
  clearAppliedTemplates(): void {
    this.dispatch({ type: TemplateActionType.CLEAR_APPLIED });
  }

  /**
   * 根据ID查找模板（带缓存）
   */
  findTemplate(templateId: string): FieldTemplate | TriadTemplate | null {
    const currentState = this.getCurrentState();
    
    // 检查缓存
    if (currentState.templateCache.has(templateId)) {
      this.dispatch({ type: TemplateActionType.CACHE_HIT });
      return currentState.templateCache.get(templateId) || null;
    }

    // 在模板中查找
    const triadTemplate = currentState.triadTemplates.find(t => t.id === templateId);
    if (triadTemplate) {
      currentState.templateCache.set(templateId, triadTemplate);
      this.dispatch({ type: TemplateActionType.CACHE_MISS });
      return triadTemplate;
    }

    // 在字段模板中查找
    const fieldTemplate = currentState.fieldTemplates.find(t => t.id === templateId);
    if (fieldTemplate) {
      currentState.templateCache.set(templateId, fieldTemplate);
      this.dispatch({ type: TemplateActionType.CACHE_MISS });
      return fieldTemplate;
    }

    this.dispatch({ type: TemplateActionType.CACHE_MISS });
    return null;
  }

  /**
   * 🆕 根据ID获取模板（异步版本，用于服务调用）
   * 兼容官方模板和用户模板
   */
  async getTemplateById(templateId: string): Promise<any> {
    // 首先使用同步的 findTemplate 方法查找
    const template = this.findTemplate(templateId);
    
    if (template) {
      return template;
    }
    
    // 如果找不到，尝试从官方模板中查找
    const { getOfficialTemplateById } = await import('../constants/official-templates');
    const officialTemplate = getOfficialTemplateById(templateId);
    
    if (officialTemplate) {
      // 将官方模板添加到缓存
      const currentState = this.getCurrentState();
      currentState.templateCache.set(templateId, officialTemplate);
      return officialTemplate;
    }
    
    return null;
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): TemplateState {
    let currentState: TemplateState;
    this._state.subscribe(state => currentState = state)();
    return currentState!;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.dispatch({ type: TemplateActionType.RESET });
  }

  /**
   * 获取统计信息
   */
  getStats(): TemplateState['stats'] {
    return this.getCurrentState().stats;
  }

  /**
   * 🔥 将ParseTemplate转换为TriadTemplate格式
   */
  private convertToTriadTemplate(parseTemplate: any, index: number): TriadTemplate {
    // 🔥 映射题型信息，用于UI显示图标
    const getTemplateType = (type: string): 'qa' | 'mcq' | 'cloze' => {
      switch (type) {
        case 'single-field':
        case 'qa':
          return 'qa';
        case 'multiple-choice':
        case 'mcq':
          return 'mcq';
        case 'cloze':
        case 'fill-blank':
          return 'cloze';
        default:
          return 'qa'; // 默认为问答题
      }
    };

    return {
      id: parseTemplate.id || `template_${index}`,
      name: parseTemplate.name || `模板 ${index + 1}`,
      description: parseTemplate.description || '', // 🔥 移除冗余描述
      fieldDefinitions: {},
      ankiMapping: {},
      validationRules: { required: [], optional: [] },
      renderingRules: { frontTemplate: '', backTemplate: '' },
      metadata: {
        version: '1.0.0',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        tags: ['simplified-parsing'],
        category: 'custom',
        templateType: getTemplateType(parseTemplate.type) // 🔥 保留题型信息
      },
      config: {
        enabled: true,
        priority: 1
      }
    };
  }

  /**
   * 🔥 获取默认TriadTemplate模板
   * 使用统一的官方模板ID：official-qa, official-choice, official-cloze
   */
  private getDefaultTriadTemplates(): TriadTemplate[] {
    return [
      {
        id: 'official-qa',
        name: '通用问答题',
        description: '标准的问答题格式，支持问题和答案字段',
        fieldDefinitions: {
          front: { type: 'text', name: '问题', required: true },
          back: { type: 'text', name: '答案', required: true }
        },
        ankiMapping: {
          front: 'front',
          back: 'back'
        },
        validationRules: { required: ['front'], optional: ['back'] },
        renderingRules: { frontTemplate: '{{front}}', backTemplate: '{{back}}' },
        metadata: {
          version: '1.0.0',
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          tags: ['official', 'qa'],
          category: 'basic',
          templateType: 'qa'
        },
        config: {
          enabled: true,
          priority: 1
        }
      },
      {
        id: 'official-choice',
        name: '选择题',
        description: '标准选择题格式（Markdown格式），支持单选和多选',
        fieldDefinitions: {
          front: { type: 'text', name: '题目', required: true },
          back: { type: 'text', name: '答案', required: true },
          options: { type: 'text', name: '选项', required: true },
          correctAnswers: { type: 'text', name: '正确答案', required: false }
        },
        ankiMapping: {
          front: 'front',
          back: 'back',
          options: 'options',
          correctAnswers: 'correctAnswers'
        },
        validationRules: { required: ['front', 'options'], optional: ['back', 'correctAnswers'] },
        renderingRules: { 
          frontTemplate: '{{front}}<br>{{options}}', 
          backTemplate: '{{front}}<br>{{options}}<hr>{{back}}' 
        },
        metadata: {
          version: '1.0.0',
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          tags: ['official', 'choice'],
          category: 'choice',
          templateType: 'mcq'
        },
        config: {
          enabled: true,
          priority: 2
        }
      },
      {
        id: 'official-cloze',
        name: '挖空题',
        description: '填空题格式，支持挖空标记',
        fieldDefinitions: {
          text: { type: 'text', name: '内容', required: true },
          hint: { type: 'text', name: '提示', required: false }
        },
        ankiMapping: {
          text: 'Text',
          hint: 'Extra'
        },
        validationRules: { required: ['text'], optional: ['hint'] },
        renderingRules: { frontTemplate: '{{cloze:text}}', backTemplate: '{{text}}<br>{{hint}}' },
        metadata: {
          version: '1.0.0',
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          tags: ['official', 'cloze'],
          category: 'cloze',
          templateType: 'cloze'
        },
        config: {
          enabled: true,
          priority: 3
        }
      }
    ];
  }
}

// 全局模板状态管理器实例
export const templateStore = new TemplateStore();
