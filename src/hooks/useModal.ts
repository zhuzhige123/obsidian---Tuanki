/**
 * 模态框管理Hook
 * 解决重复的模态框状态管理和事件处理逻辑
 */

import { dispatchUI } from '../architecture/unified-state-management';
import { handleError, createErrorContext } from '../architecture/unified-error-handler';

// ============================================================================
// 模态框Hook接口定义
// ============================================================================

export interface ModalState {
  isOpen: boolean;
  isOpening: boolean;
  isClosing: boolean;
  data?: any;
}

export interface ModalActions {
  open: (data?: any) => void;
  close: () => void;
  toggle: () => void;
  reset: () => void;
}

export interface ModalOptions {
  preventDuplicateOpen?: boolean;
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
  destroyOnClose?: boolean;
  onOpen?: (data?: any) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

export interface UseModalReturn extends ModalState, ModalActions {
  handleKeydown: (event: KeyboardEvent) => void;
  handleClickOutside: (event: MouseEvent, modalRef: HTMLElement | null) => void;
}

// ============================================================================
// 模态框管理Hook
// ============================================================================

/**
 * 模态框状态管理Hook
 */
export function useModal(options: ModalOptions = {}): UseModalReturn {
  const {
    preventDuplicateOpen = true,
    closeOnEscape = true,
    closeOnClickOutside = true,
    destroyOnClose = false,
    onOpen,
    onClose,
    onError
  } = options;

  // 状态管理
  let isOpen = $state(false);
  let isOpening = $state(false);
  let isClosing = $state(false);
  let data = $state<any>(undefined);

  /**
   * 打开模态框
   */
  const open = (modalData?: any) => {
    try {
      // 防重复打开检查
      if (preventDuplicateOpen && (isOpen || isOpening)) {
        console.warn('Modal is already open or opening', {
          isOpen,
          isOpening,
          currentData: data
        });
        return;
      }

      isOpening = true;
      data = modalData;

      // 使用微任务确保状态更新
      queueMicrotask(() => {
        isOpen = true;
        isOpening = false;

        // 更新全局状态
        dispatchUI('SET_ACTIVE_MODAL', {
          isOpen: true,
          data: modalData
        });

        // 执行回调
        onOpen?.(modalData);

        console.log('✅ Modal opened successfully', { data: modalData });
      });
    } catch (error) {
      isOpening = false;
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      handleError(errorObj, createErrorContext('useModal', 'open', { modalData }));
      onError?.(errorObj);
    }
  };

  /**
   * 关闭模态框
   */
  const close = () => {
    try {
      if (!isOpen || isClosing) {
        return;
      }

      isClosing = true;

      // 使用微任务确保状态更新
      queueMicrotask(() => {
        isOpen = false;
        isClosing = false;

        // 销毁数据
        if (destroyOnClose) {
          data = undefined;
        }

        // 更新全局状态
        dispatchUI('SET_ACTIVE_MODAL', {
          isOpen: false,
          data: null
        });

        // 执行回调
        onClose?.();

        console.log('✅ Modal closed successfully');
      });
    } catch (error) {
      isClosing = false;
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      handleError(errorObj, createErrorContext('useModal', 'close'));
      onError?.(errorObj);
    }
  };

  /**
   * 切换模态框状态
   */
  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  /**
   * 重置模态框状态
   */
  const reset = () => {
    isOpen = false;
    isOpening = false;
    isClosing = false;
    data = undefined;
  };

  /**
   * 处理键盘事件
   */
  const handleKeydown = (event: KeyboardEvent) => {
    if (!closeOnEscape || !isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  /**
   * 处理点击外部关闭
   */
  const handleClickOutside = (event: MouseEvent, modalRef: HTMLElement | null) => {
    if (!closeOnClickOutside || !isOpen || !modalRef) return;

    const target = event.target as Node;
    if (!modalRef.contains(target)) {
      close();
    }
  };

  return {
    // 状态
    isOpen,
    isOpening,
    isClosing,
    data,
    
    // 操作
    open,
    close,
    toggle,
    reset,
    
    // 事件处理
    handleKeydown,
    handleClickOutside
  };
}

// ============================================================================
// 特殊用途的模态框Hook
// ============================================================================

/**
 * 确认对话框Hook
 */
export function useConfirmModal() {
  const modal = useModal({
    preventDuplicateOpen: true,
    closeOnEscape: true,
    closeOnClickOutside: false
  });

  const confirm = (message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      modal.open({
        type: 'confirm',
        title: title || '确认',
        message,
        onConfirm: () => {
          modal.close();
          resolve(true);
        },
        onCancel: () => {
          modal.close();
          resolve(false);
        }
      });
    });
  };

  return {
    ...modal,
    confirm
  };
}

/**
 * 表单模态框Hook
 */
export function useFormModal<T = any>(options: ModalOptions = {}) {
  const modal = useModal({
    ...options,
    destroyOnClose: true
  });

  const openForm = (initialData?: Partial<T>) => {
    modal.open({
      type: 'form',
      initialData,
      formData: { ...initialData }
    });
  };

  const updateFormData = (updates: Partial<T>) => {
    if (modal.data) {
      modal.data.formData = { ...modal.data.formData, ...updates };
    }
  };

  const getFormData = (): T | undefined => {
    return modal.data?.formData;
  };

  return {
    ...modal,
    openForm,
    updateFormData,
    getFormData
  };
}

/**
 * 加载模态框Hook
 */
export function useLoadingModal() {
  const modal = useModal({
    preventDuplicateOpen: true,
    closeOnEscape: false,
    closeOnClickOutside: false
  });

  const showLoading = (message?: string) => {
    modal.open({
      type: 'loading',
      message: message || '加载中...'
    });
  };

  const hideLoading = () => {
    modal.close();
  };

  const withLoading = async <T>(
    promise: Promise<T>,
    message?: string
  ): Promise<T> => {
    showLoading(message);
    try {
      const result = await promise;
      hideLoading();
      return result;
    } catch (error) {
      hideLoading();
      throw error;
    }
  };

  return {
    ...modal,
    showLoading,
    hideLoading,
    withLoading
  };
}

// ============================================================================
// 全局模态框管理
// ============================================================================

/**
 * 全局模态框管理器
 */
class GlobalModalManager {
  private activeModals = new Set<string>();
  private modalStack: string[] = [];

  /**
   * 注册模态框
   */
  register(modalId: string) {
    this.activeModals.add(modalId);
    this.modalStack.push(modalId);
    
    // 更新全局状态
    dispatchUI('UPDATE_MODAL_STACK', {
      activeModals: Array.from(this.activeModals),
      modalStack: [...this.modalStack]
    });
  }

  /**
   * 注销模态框
   */
  unregister(modalId: string) {
    this.activeModals.delete(modalId);
    const index = this.modalStack.indexOf(modalId);
    if (index > -1) {
      this.modalStack.splice(index, 1);
    }
    
    // 更新全局状态
    dispatchUI('UPDATE_MODAL_STACK', {
      activeModals: Array.from(this.activeModals),
      modalStack: [...this.modalStack]
    });
  }

  /**
   * 关闭所有模态框
   */
  closeAll() {
    this.activeModals.clear();
    this.modalStack = [];
    
    dispatchUI('CLOSE_ALL_MODALS', null);
  }

  /**
   * 获取当前活跃的模态框
   */
  getActiveModals() {
    return Array.from(this.activeModals);
  }

  /**
   * 获取模态框栈
   */
  getModalStack() {
    return [...this.modalStack];
  }
}

export const globalModalManager = new GlobalModalManager();

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快速创建确认对话框
 */
export const showConfirm = (message: string, title?: string): Promise<boolean> => {
  const { confirm } = useConfirmModal();
  return confirm(message, title);
};

/**
 * 快速显示加载状态
 */
export const withLoading = async <T>(
  promise: Promise<T>,
  message?: string
): Promise<T> => {
  const { withLoading } = useLoadingModal();
  return withLoading(promise, message);
};
