/**
 * StudyView - 学习界面视图（标签页模式）
 * 提供可与其他标签页并存的学习界面
 * 支持会话暂停/恢复和持久化
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type AnkiPlugin from '../main';
import { tryStartStudySession, endStudySession } from '../stores/study-mode-store';
import { StudySessionManager } from '../services/StudySessionManager';
import type { StudyMode } from '../types/study-types';

export const VIEW_TYPE_STUDY = 'tuanki-study-view';

export class StudyView extends ItemView {
  private component: any = null;
  private plugin: AnkiPlugin;
  private instanceId: string;
  private isPaused: boolean = false;
  private studySessionManager: StudySessionManager;
  private isPauseHandling: boolean = false; // 🔧 防止递归调用
  private isClosing: boolean = false; // 🔧 防止 close() 递归调用
  private deckId: string | undefined; // 🔧 当前学习的牌组ID
  private mode: StudyMode | undefined; // 🆕 学习模式
  private cardIds: string[] | undefined; // 🆕 卡片ID列表

  constructor(leaf: WorkspaceLeaf, plugin: AnkiPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.instanceId = `study-view-${Date.now()}`;
    this.studySessionManager = StudySessionManager.getInstance();
    
    console.log('[StudyView] 视图实例已创建:', this.instanceId);
  }

  getViewType(): string {
    return VIEW_TYPE_STUDY;
  }

  getDisplayText(): string {
    return 'Tuanki 学习';
  }

  /**
   * 🔧 序列化视图状态（用于传递学习参数）
   */
  getState(): any {
    const state = {
      deckId: this.deckId,
      mode: this.mode,
      cardIds: this.cardIds
    };
    console.log('[StudyView] 序列化状态:', state);
    return state;
  }

  /**
   * 🔧 恢复视图状态（接收学习参数）
   */
  async setState(state: any, result: any): Promise<void> {
    await super.setState(state, result);
    
    if (state) {
      const oldDeckId = this.deckId;
      const oldMode = this.mode;
      const oldCardIds = this.cardIds;
      
      // 更新状态
      this.deckId = state.deckId;
      this.mode = state.mode;
      this.cardIds = state.cardIds;
      
      console.log('[StudyView] ✅ 接收到学习参数:', { deckId: this.deckId, mode: this.mode, cardIds: this.cardIds?.length });
      
      // 🔧 如果组件未创建，现在创建它
      if (!this.component) {
        console.log('[StudyView] 🔧 组件未创建，现在创建');
        
        // 检查是否有持久化会话
        const hasPersistedSession = this.studySessionManager.hasPersistedSession();
        
        if (hasPersistedSession) {
          // 已在 onOpen 中显示恢复提示，不需要再次处理
          console.log('[StudyView] 等待用户选择恢复会话');
        } else {
          // 创建新的学习组件
          await this.createStudyComponent({ 
            deckId: this.deckId,
            mode: this.mode,
            cardIds: this.cardIds
          });
        }
      } else {
        // 🔧 如果参数发生变化，通知组件重新加载卡片
        const paramsChanged = oldDeckId !== this.deckId || oldMode !== this.mode || 
                              JSON.stringify(oldCardIds) !== JSON.stringify(this.cardIds);
        
        if (paramsChanged) {
          console.log('[StudyView] 🔄 检测到参数变化，通知组件更新');
          if (typeof this.component.updateStudyParams === 'function') {
            await this.component.updateStudyParams({
              deckId: this.deckId,
              mode: this.mode,
              cardIds: this.cardIds
            });
          }
        }
      }
    }
  }

  getIcon(): string {
    return 'graduation-cap';
  }

  // 允许在没有文件的情况下打开
  allowNoFile(): boolean {
    return true;
  }

  /**
   * 显示加载状态
   */
  private showLoadingState(): void {
    this.contentEl.createDiv({
      cls: 'tuanki-study-loading',
      text: '正在初始化学习界面...'
    });
  }

  // 设置导航类型为标签页
  getNavigationType(): string {
    return 'tab';
  }

  async onOpen(): Promise<void> {
    console.log('[StudyView] 视图正在打开...', this.instanceId);
    
    // 🔧 检查并清理可能残留的学习实例
    const studyModeStore = (await import('../stores/study-mode-store')).studyModeStore;
    const activeInstance = studyModeStore.getActiveInstance();
    
    if (activeInstance && activeInstance.id !== this.instanceId) {
      console.log('[StudyView] 检测到残留的学习实例，清理中...', activeInstance.id);
      endStudySession(activeInstance.id);
    }
    
    // 尝试注册学习实例（单例控制）
    const registered = tryStartStudySession(this.instanceId);
    
    if (!registered) {
      // 已有活跃的学习会话
      console.warn('[StudyView] 已有活跃的学习会话，阻止打开');
      this.contentEl.empty();
      this.contentEl.createDiv({
        cls: 'tuanki-study-view-blocked',
        text: '⚠️ 已有学习会话正在进行中。为保持专注，请先完成或关闭当前会话。'
      });
      return;
    }
    
    // 设置容器样式
    this.contentEl.empty();
    this.contentEl.addClass('tuanki-study-view-content');
    this.contentEl.addClass('tuanki-main-editor-mode');  // ✅ 与AnkiView保持一致
    
    // 🔧 显示加载状态，等待 setState 传递参数
    this.showLoadingState();
    
    // 检查是否有持久化的会话需要恢复
    const hasPersistedSession = this.studySessionManager.hasPersistedSession();
    
    if (hasPersistedSession) {
      // 显示恢复会话提示
      await this.showRestoreSessionPrompt();
    }
    // 🔧 移除：不再在这里创建组件，等待 setState 调用
    
    // 监听标签页激活/失活事件
    this.registerViewEvents();
  }

  /**
   * 显示恢复会话提示
   */
  private async showRestoreSessionPrompt(): Promise<void> {
    const promptContainer = this.contentEl.createDiv({
      cls: 'tuanki-study-restore-prompt'
    });
    
    promptContainer.createEl('h3', { text: '发现未完成的学习会话' });
    promptContainer.createEl('p', { text: '是否恢复上次的学习进度？' });
    
    const buttonContainer = promptContainer.createDiv({ cls: 'button-container' });
    
    // 恢复按钮
    const restoreBtn = buttonContainer.createEl('button', {
      text: '恢复会话',
      cls: 'mod-cta'
    });
    restoreBtn.addEventListener('click', async () => {
      await this.restoreSession();
    });
    
    // 新建按钮
    const newBtn = buttonContainer.createEl('button', {
      text: '开始新会话'
    });
    newBtn.addEventListener('click', async () => {
      this.studySessionManager.clearPersistedSession();
      // 🔧 传递学习参数
      await this.createStudyComponent({ 
        deckId: this.deckId,
        mode: this.mode,
        cardIds: this.cardIds
      });
    });
  }

  /**
   * 恢复持久化的会话
   */
  private async restoreSession(): Promise<void> {
    const persisted = this.studySessionManager.getPersistedSession();
    
    if (!persisted) {
      console.warn('[StudyView] 无法恢复：持久化会话不存在');
      // 🔧 传递当前的学习参数（如果有）
      await this.createStudyComponent({ 
        deckId: this.deckId,
        mode: this.mode,
        cardIds: this.cardIds
      });
      return;
    }
    
    console.log('[StudyView] 正在恢复会话...', persisted);
    
    // 恢复会话到 SessionManager
    const sessionId = this.studySessionManager.restoreSession(persisted);
    
    // 🔧 优先使用持久化的 deckId，否则使用当前的 deckId
    await this.createStudyComponent({
      deckId: persisted.deckId || this.deckId,
      resumeData: persisted
    });
  }

  /**
   * 创建学习组件
   */
  private async createStudyComponent(options?: {
    deckId?: string;
    mode?: StudyMode;
    cardIds?: string[];
    resumeData?: any;
  }): Promise<void> {
    try {
      // 🔧 验证参数
      if (!options?.resumeData && !options?.deckId && (!options?.cardIds || options.cardIds.length === 0)) {
        console.error('[StudyView] 缺少必要的学习参数');
        this.contentEl.empty();
        this.contentEl.createDiv({
          cls: 'tuanki-study-view-error',
          text: '⚠️ 学习参数无效，请重新选择牌组进入学习。'
        });
        return;
      }
      
      this.contentEl.empty();
      this.contentEl.addClass('tuanki-study-view-content');
      this.contentEl.addClass('tuanki-main-editor-mode');  // ✅ 与AnkiView保持一致
      
      // 动态导入 StudyViewWrapper 组件
      const { default: StudyViewWrapper } = await import('../components/study/StudyViewWrapper.svelte');
      
      this.component = new StudyViewWrapper({
        target: this.contentEl,
        props: {
          plugin: this.plugin,
          viewInstance: this,
          deckId: options?.deckId,
          mode: options?.mode,
          cardIds: options?.cardIds,
          resumeData: options?.resumeData,
          onClose: () => {
            this.close();
          },
          onPause: () => {
            this.handlePause();
          },
          onResume: () => {
            this.handleResume();
          }
        }
      });
      
      console.log('[StudyView] ✅ 学习组件已挂载', { deckId: options?.deckId, mode: options?.mode, cardIds: options?.cardIds?.length });
    } catch (error) {
      console.error('[StudyView] 创建学习组件失败:', error);
      this.contentEl.empty();
      this.contentEl.createDiv({
        cls: 'error',
        text: '加载学习界面失败'
      });
    }
  }

  /**
   * 注册视图事件监听
   */
  private registerViewEvents(): void {
    // 监听标签页激活事件
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf === this.leaf) {
          // 当前视图被激活
          this.handleActivate();
        } else if (this.leaf && leaf !== this.leaf) {
          // 当前视图失去焦点
          this.handleDeactivate();
        }
      })
    );
  }

  /**
   * 处理视图激活（恢复学习）
   */
  private handleActivate(): void {
    if (this.isPaused && this.component) {
      console.log('[StudyView] 视图激活 - 恢复学习');
      this.handleResume();
    }
  }

  /**
   * 处理视图失活（暂停学习）
   */
  private handleDeactivate(): void {
    if (!this.isPaused && this.component) {
      console.log('[StudyView] 视图失活 - 暂停学习');
      this.handlePause();
    }
  }

  /**
   * 处理暂停
   */
  private handlePause(): void {
    // 🔧 防止递归调用
    if (this.isPauseHandling) {
      console.log('[StudyView] 防止重入：暂停处理中');
      return;
    }
    
    this.isPauseHandling = true;
    
    try {
      this.isPaused = true;
      console.log('[StudyView] 学习已暂停');
      
      // 触发组件的暂停方法（如果存在）
      if (this.component && typeof this.component.pause === 'function') {
        this.component.pause();
      }
    } finally {
      this.isPauseHandling = false;
    }
  }

  /**
   * 处理恢复
   */
  private handleResume(): void {
    this.isPaused = false;
    console.log('[StudyView] 学习已恢复');
    
    // 触发组件的恢复方法（如果存在）
    if (this.component && typeof this.component.resume === 'function') {
      this.component.resume();
    }
  }

  /**
   * 持久化当前会话状态
   */
  public persistCurrentSession(sessionData: any): void {
    console.log('[StudyView] 持久化会话状态');
    
    // 通过组件获取当前会话数据并持久化
    if (this.component && typeof this.component.getSessionData === 'function') {
      const data = this.component.getSessionData();
      // 持久化逻辑将在 SessionManager 中实现
      console.log('[StudyView] 会话数据已准备持久化:', data);
    }
  }

  async onClose(): Promise<void> {
    console.log('[StudyView] 视图正在关闭...', this.instanceId);
    
    // ⚠️ 不持久化会话状态 - 关闭标签页即清理会话
    // 避免再次打开时出现残留状态
    
    // 销毁 Svelte 组件
    if (this.component) {
      try {
        this.component.$destroy();
        console.log('[StudyView] 学习组件已销毁');
      } catch (error) {
        console.error('[StudyView] 销毁学习组件失败:', error);
      }
      this.component = null;
    }
    
    // 🔧 强制注销学习实例（确保清理）
    endStudySession(this.instanceId);
    console.log('[StudyView] 学习实例已注销:', this.instanceId);
    
    // 清理持久化的会话（如果有）
    this.studySessionManager.clearPersistedSession();
    
    console.log('[StudyView] 视图已完全关闭，所有状态已清理');
  }

  /**
   * 手动关闭视图（供外部调用）
   */
  public close(): void {
    // 🔧 防止递归调用（特别是与其他插件如 Excalidraw 冲突时）
    if (this.isClosing) {
      console.log('[StudyView] 防止重入：视图正在关闭中');
      return;
    }
    
    this.isClosing = true;
    this.leaf.detach();
  }
}

