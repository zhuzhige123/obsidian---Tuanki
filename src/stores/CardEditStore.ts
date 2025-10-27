/**
 * 卡片编辑状态管理核心
 * 采用状态机模式，提供统一的状态管理和事件处理
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { Card, Deck } from '../data/types';
import type { FieldTemplate, TriadTemplate } from '../data/template-types';
import type AnkiPlugin from '../main';

// 编辑阶段枚举
export enum EditPhase {
  INITIALIZING = 'initializing',
  READY = 'ready',
  EDITING = 'editing',
  SAVING = 'saving',
  ERROR = 'error',
  CLOSING = 'closing'
}

// 编辑器状态
export interface EditorState {
  isReady: boolean;
  hasContent: boolean;
  isDirty: boolean;
  lastSaved: Date | null;
  errorMessage?: string;
}

// 模板状态
export interface TemplateState {
  appliedFieldTemplate: FieldTemplate | null;
  appliedTriadTemplate: TriadTemplate | null;
  availableFieldTemplates: FieldTemplate[];
  availableTriadTemplates: TriadTemplate[];
  isTemplateLoading: boolean;
}

// UI状态
export interface UIState {
  isPreviewMode: boolean;
  activeTab: 'markdown' | 'fields';
  showTemplatePanel: boolean;
  showMetadataPanel: boolean;
  isFullscreen: boolean;
}

// 核心卡片编辑状态
export interface CardEditState {
  // 基础状态
  phase: EditPhase;
  
  // 卡片数据
  originalCard: Card | null;
  currentCard: Card | null;
  
  // 编辑内容
  markdownContent: string;
  fields: Record<string, string>;
  tags: string[];
  deckId: string;
  
  // 子状态
  editorState: EditorState;
  templateState: TemplateState;
  uiState: UIState;
  
  // 元数据
  lastModified: Date;
  sessionId: string;
}

// 状态动作类型
export enum ActionType {
  // 初始化动作
  INITIALIZE = 'initialize',
  LOAD_CARD = 'load_card',
  LOAD_TEMPLATES = 'load_templates',
  
  // 编辑动作
  UPDATE_CONTENT = 'update_content',
  UPDATE_FIELD = 'update_field',
  UPDATE_TAGS = 'update_tags',
  UPDATE_DECK = 'update_deck',
  
  // 模板动作
  APPLY_FIELD_TEMPLATE = 'apply_field_template',
  APPLY_TRIAD_TEMPLATE = 'apply_triad_template',
  UPDATE_FIELDS_BULK = 'update_fields_bulk',
  
  // UI动作
  TOGGLE_PREVIEW = 'toggle_preview',
  SWITCH_TAB = 'switch_tab',
  TOGGLE_PANEL = 'toggle_panel',
  
  // 保存动作
  SAVE_START = 'save_start',
  SAVE_SUCCESS = 'save_success',
  SAVE_ERROR = 'save_error',
  
  // 错误处理
  SET_ERROR = 'set_error',
  CLEAR_ERROR = 'clear_error',
  RECOVER = 'recover',
  
  // 生命周期
  CLOSE = 'close',
  RESET = 'reset'
}

// 状态动作接口
export interface StateAction {
  type: ActionType;
  payload?: any;
  meta?: {
    timestamp: Date;
    source: string;
  };
}

// 状态转换函数类型
export type StateTransition = (state: CardEditState, action: StateAction) => CardEditState;

// 初始状态
const createInitialState = (): CardEditState => ({
  phase: EditPhase.INITIALIZING,
  originalCard: null,
  currentCard: null,
  markdownContent: '',
  fields: {},
  tags: [],
  deckId: '',
  editorState: {
    isReady: false,
    hasContent: false,
    isDirty: false,
    lastSaved: null
  },
  templateState: {
    appliedFieldTemplate: null,
    appliedTriadTemplate: null,
    availableFieldTemplates: [],
    availableTriadTemplates: [],
    isTemplateLoading: false
  },
  uiState: {
    isPreviewMode: false,
    activeTab: 'markdown',
    showTemplatePanel: true,
    showMetadataPanel: true,
    isFullscreen: false
  },
  lastModified: new Date(),
  sessionId: generateSessionId()
});

// 生成会话ID
function generateSessionId(): string {
  return `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 卡片编辑状态管理器
 */
export class CardEditStore {
  private _state: Writable<CardEditState>;
  private _transitions = new Map<string, StateTransition>();
  private _middleware: Array<(action: StateAction, state: CardEditState) => StateAction | null> = [];
  
  // 公共只读状态
  public readonly state: Readable<CardEditState>;
  
  // 派生状态
  public readonly isDirty: Readable<boolean>;
  public readonly canSave: Readable<boolean>;
  public readonly isLoading: Readable<boolean>;
  public readonly hasError: Readable<boolean>;

  constructor() {
    this._state = writable(createInitialState());
    this.state = { subscribe: this._state.subscribe };
    
    // 设置派生状态
    this.isDirty = derived(this.state, $state => $state.editorState.isDirty);
    this.canSave = derived(this.state, $state => 
      $state.phase === EditPhase.READY && 
      $state.editorState.isDirty && 
      $state.currentCard !== null
    );
    this.isLoading = derived(this.state, $state => 
      $state.phase === EditPhase.INITIALIZING || 
      $state.phase === EditPhase.SAVING ||
      $state.templateState.isTemplateLoading
    );
    this.hasError = derived(this.state, $state =>
      $state.phase === EditPhase.ERROR ||
      !!$state.editorState.errorMessage
    );

    this.setupTransitions();
  }

  /**
   * 分发状态动作
   */
  dispatch(action: StateAction): void {
    // 添加元数据
    if (!action.meta) {
      action.meta = {
        timestamp: new Date(),
        source: 'CardEditStore'
      };
    }

    // 应用中间件
    let processedAction: StateAction | null = action;
    for (const middleware of this._middleware) {
      processedAction = middleware(processedAction, this.getCurrentState());
      if (!processedAction) return; // 中间件可以阻止动作执行
    }

    // 执行状态转换
    const currentState = this.getCurrentState();
    const transitionKey = `${currentState.phase}-${processedAction.type}`;
    const transition = this._transitions.get(transitionKey);
    
    if (transition) {
      const newState = transition(currentState, processedAction);
      this._state.set(newState);
      
      console.log(`[CardEditStore] ${transitionKey}:`, {
        from: currentState.phase,
        to: newState.phase,
        action: processedAction.type,
        payload: processedAction.payload
      });
    } else {
      console.warn(`[CardEditStore] No transition found for: ${transitionKey}`);
    }
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): CardEditState {
    let currentState: CardEditState;
    this._state.subscribe(state => currentState = state)();
    return currentState!;
  }

  /**
   * 添加中间件
   */
  addMiddleware(middleware: (action: StateAction, state: CardEditState) => StateAction | null): void {
    this._middleware.push(middleware);
  }

  /**
   * 重置状态
   */
  reset(): void {
    this._state.set(createInitialState());
  }

  /**
   * 设置状态转换
   */
  private setupTransitions(): void {
    // 初始化转换
    this.addTransition(EditPhase.INITIALIZING, ActionType.LOAD_CARD, (state, action) => ({
      ...state,
      originalCard: action.payload.card,
      currentCard: { ...action.payload.card },
      fields: { ...action.payload.card.fields },
      tags: [...(action.payload.card.tags || [])],
      deckId: action.payload.card.deckId || '',
      markdownContent: action.payload.card.fields?.notes || '',
      phase: EditPhase.READY,
      editorState: {
        ...state.editorState,
        isReady: true,
        hasContent: !!(action.payload.card.fields?.notes || Object.keys(action.payload.card.fields || {}).length > 0)
      }
    }));

    // 内容更新转换
    this.addTransition(EditPhase.READY, ActionType.UPDATE_CONTENT, (state, action) => ({
      ...state,
      markdownContent: action.payload.content,
      editorState: {
        ...state.editorState,
        isDirty: true,
        hasContent: !!action.payload.content.trim()
      },
      lastModified: new Date()
    }));

    // 字段更新转换
    this.addTransition(EditPhase.READY, ActionType.UPDATE_FIELD, (state, action) => ({
      ...state,
      fields: {
        ...state.fields,
        [action.payload.fieldKey]: action.payload.value
      },
      editorState: {
        ...state.editorState,
        isDirty: true
      },
      lastModified: new Date()
    }));

    // 标签更新转换
    this.addTransition(EditPhase.READY, ActionType.UPDATE_TAGS, (state, action) => ({
      ...state,
      tags: action.payload.tags,
      editorState: {
        ...state.editorState,
        isDirty: true
      },
      lastModified: new Date()
    }));

    // 牌组更新转换
    this.addTransition(EditPhase.READY, ActionType.UPDATE_DECK, (state, action) => ({
      ...state,
      deckId: action.payload.deckId,
      editorState: {
        ...state.editorState,
        isDirty: true
      },
      lastModified: new Date()
    }));

    // 保存开始转换
    this.addTransition(EditPhase.READY, ActionType.SAVE_START, (state, action) => ({
      ...state,
      phase: EditPhase.SAVING
    }));

    // 保存成功转换
    this.addTransition(EditPhase.SAVING, ActionType.SAVE_SUCCESS, (state, action) => ({
      ...state,
      phase: EditPhase.READY,
      originalCard: action.payload.card,
      currentCard: action.payload.card,
      editorState: {
        ...state.editorState,
        isDirty: false,
        lastSaved: new Date()
      }
    }));

    // 保存失败转换
    this.addTransition(EditPhase.SAVING, ActionType.SAVE_ERROR, (state, action) => ({
      ...state,
      phase: EditPhase.ERROR,
      editorState: {
        ...state.editorState,
        errorMessage: action.payload.error.message
      }
    }));

    // 错误恢复转换
    this.addTransition(EditPhase.ERROR, ActionType.RECOVER, (state, action) => ({
      ...state,
      phase: EditPhase.READY,
      editorState: {
        ...state.editorState,
        errorMessage: undefined
      }
    }));

    // 批量字段更新转换
    this.addTransition(EditPhase.READY, ActionType.UPDATE_FIELDS_BULK, (state, action) => ({
      ...state,
      fields: action.payload.fields || state.fields,
      markdownContent: action.payload.markdownContent || state.markdownContent,
      currentCard: action.payload.templateId ? {
        ...state.currentCard!,
        templateId: action.payload.templateId
      } : state.currentCard,
      editorState: {
        ...state.editorState,
        isDirty: true,
        hasContent: !!(action.payload.markdownContent || state.markdownContent).trim()
      },
      lastModified: new Date()
    }));

    // 应用三位一体模板转换
    this.addTransition(EditPhase.READY, ActionType.APPLY_TRIAD_TEMPLATE, (state, action) => ({
      ...state,
      templateState: {
        ...state.templateState,
        appliedTriadTemplate: action.payload.template,
        appliedFieldTemplate: action.payload.template.fieldTemplate
      },
      currentCard: state.currentCard ? {
        ...state.currentCard,
        templateId: action.payload.template.id
      } : state.currentCard,
      lastModified: new Date()
    }));

    // UI状态转换
    this.addTransition(EditPhase.READY, ActionType.TOGGLE_PREVIEW, (state, action) => ({
      ...state,
      uiState: {
        ...state.uiState,
        isPreviewMode: !state.uiState.isPreviewMode
      }
    }));

    this.addTransition(EditPhase.READY, ActionType.SWITCH_TAB, (state, action) => ({
      ...state,
      uiState: {
        ...state.uiState,
        activeTab: action.payload.tab
      }
    }));
  }

  /**
   * 添加状态转换
   */
  private addTransition(phase: EditPhase, actionType: ActionType, transition: StateTransition): void {
    const key = `${phase}-${actionType}`;
    this._transitions.set(key, transition);
  }
}

// 全局状态管理器实例
export const cardEditStore = new CardEditStore();
